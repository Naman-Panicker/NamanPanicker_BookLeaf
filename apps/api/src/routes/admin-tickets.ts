import {
  addInternalNoteRequestSchema,
  type AdminQueueResponse,
  adminQueueQuerySchema,
  adminQueueResponseSchema,
  type AdminQueueTicket,
  adminTicketResponseSchema,
  type AdminTicketResponse,
  adminWorkspaceResponseSchema,
  type AdminWorkspaceResponse,
  ALL_STATUSES,
  apiErrorSchema,
  type InternalNote,
  internalNoteResponseSchema,
  type InternalNoteResponse,
  internalNotesResponseSchema,
  type InternalNotesResponse,
  isUnresolved,
  orderQueue,
  royaltySummary,
  setCategoryRequestSchema,
  setPriorityRequestSchema,
  setTicketStatusRequestSchema,
  ticketParamsSchema,
  ticketDraftResponseSchema,
  ticketStatusSchema,
} from '@bookleaf/shared';
import type { z } from 'zod';
import { currentAdminId, currentSession } from '../auth/sessions';
import { type Classifier, overrideCategory, overridePriority, resetClassification } from '../classification';
import type { Clock } from '../clock';
import type { PrismaClient } from '../db';
import type { Drafts } from '../drafts';
import type { Prisma } from '../generated/prisma/client';
import { notFound } from '../http/errors';
import type { createRoutes } from '../http/routes';
import { assignToSelf, changeStatus, unassignSelf } from '../ticket-lifecycle';
import { toBook } from './books';

type Deps = {
  routes: ReturnType<typeof createRoutes>;
  prisma: PrismaClient;
  clock: Clock;
  classifier: Classifier;
  drafts: Drafts;
};

const queueTicketSelect = {
  id: true,
  referenceNumber: true,
  subject: true,
  status: true,
  category: true,
  priority: true,
  categorySource: true,
  prioritySource: true,
  priorityFloor: true,
  suggestedCategory: true,
  suggestedPriority: true,
  classificationAttempts: true,
  classificationError: true,
  latestAuthorMessageAt: true,
  createdAt: true,
  author: { select: { id: true, name: true } },
  book: { select: { id: true, title: true } },
  assignee: { select: { id: true, name: true } },
  // Only the latest Message, to tell who has the next move.
  messages: { orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 1, select: { authorId: true } },
} satisfies Prisma.TicketSelect;

type QueueTicketRecord = Prisma.TicketGetPayload<{ select: typeof queueTicketSelect }>;

const internalNoteSelect = {
  id: true,
  body: true,
  createdAt: true,
  admin: { select: { name: true } },
} satisfies Prisma.InternalNoteSelect;

type InternalNoteRecord = Prisma.InternalNoteGetPayload<{ select: typeof internalNoteSelect }>;

function toInternalNote(record: InternalNoteRecord): InternalNote {
  return {
    id: record.id,
    adminName: record.admin.name,
    body: record.body,
    createdAt: record.createdAt.toISOString(),
  };
}

function toAdminQueueTicket(record: QueueTicketRecord): AdminQueueTicket {
  return {
    id: record.id,
    reference: `BL-${record.referenceNumber}`,
    subject: record.subject,
    status: record.status,
    author: record.author,
    book: record.book,
    category: record.category,
    priority: record.priority,
    categorySource: record.categorySource,
    prioritySource: record.prioritySource,
    priorityFloor: record.priorityFloor,
    suggestedCategory: record.suggestedCategory,
    suggestedPriority: record.suggestedPriority,
    classificationAttempts: record.classificationAttempts,
    classificationError: record.classificationError,
    assignee: record.assignee,
    awaitingAdmin: record.messages[0]?.authorId != null,
    waitingSince: record.latestAuthorMessageAt.toISOString(),
    createdAt: record.createdAt.toISOString(),
  };
}

function statusFilter(status: z.output<typeof adminQueueQuerySchema>['status']): Prisma.TicketWhereInput['status'] {
  if (status === ALL_STATUSES) return undefined;
  return status ?? { in: ticketStatusSchema.options.filter(isUnresolved) };
}

export function addAdminTicketRoutes({ routes, prisma, clock, classifier, drafts }: Deps) {
  const adminTicket = async (ticketId: string) => {
    const record = await prisma.ticket.findUniqueOrThrow({ where: { id: ticketId }, select: queueTicketSelect });
    return { ticket: toAdminQueueTicket(record) } satisfies AdminTicketResponse;
  };

  routes.add(
    {
      method: 'get',
      path: '/api/admin/tickets',
      summary: "List every Author's Tickets as the Admin queue, most urgent first",
      tag: 'Admin',
      adminOnly: true,
      query: adminQueueQuerySchema,
      responses: {
        200: { description: 'The matching Tickets, in queue order.', schema: adminQueueResponseSchema },
        404: { description: 'The caller is not an Admin.', schema: apiErrorSchema },
      },
    },
    async (_req, res, { query }) => {
      const records = await prisma.ticket.findMany({
        where: {
          status: statusFilter(query.status),
          category: query.category,
          priority: query.priority,
          createdAt: { gte: query.createdFrom, lt: query.createdBefore },
          assigneeId: query.assignedToMe ? currentAdminId(res) : undefined,
        },
        // Fixes the order of exact ties, which orderQueue leaves as they came.
        orderBy: { referenceNumber: 'asc' },
        select: queueTicketSelect,
      });
      const ordered = orderQueue(records.map((record) => ({ ...record, waitingSince: record.latestAuthorMessageAt })));
      res.json({ tickets: ordered.map(toAdminQueueTicket) } satisfies AdminQueueResponse);
    },
  );

  routes.add(
    {
      method: 'get',
      path: '/api/admin/tickets/:ticketId',
      summary: "Get a Ticket with its Book and its Author's royalty summary",
      tag: 'Admin',
      adminOnly: true,
      params: ticketParamsSchema,
      responses: {
        200: { description: 'The Ticket and the facts about it.', schema: adminWorkspaceResponseSchema },
        404: { description: 'The Ticket does not exist, or the caller is not an Admin.', schema: apiErrorSchema },
      },
    },
    async (_req, res, { params }) => {
      const record = await prisma.ticket.findUnique({
        where: { id: params.ticketId },
        select: { ...queueTicketSelect, bookId: true, authorId: true },
      });
      if (!record) throw notFound();
      const books = await prisma.book.findMany({ where: { authorId: record.authorId } });
      const book = books.find(({ id }) => id === record.bookId);
      res.json({
        ticket: toAdminQueueTicket(record),
        book: book ? toBook(book) : null,
        royalty: royaltySummary(books, clock.now()),
      } satisfies AdminWorkspaceResponse);
    },
  );

  routes.add(
    {
      method: 'put',
      path: '/api/admin/tickets/:ticketId/status',
      summary: "Set a Ticket's status by hand",
      tag: 'Admin',
      adminOnly: true,
      params: ticketParamsSchema,
      body: setTicketStatusRequestSchema,
      responses: {
        200: { description: 'The Ticket.', schema: adminTicketResponseSchema },
        404: { description: 'The Ticket does not exist, or the caller is not an Admin.', schema: apiErrorSchema },
        409: { description: 'The Ticket has just changed.', schema: apiErrorSchema },
      },
    },
    async (_req, res, { params, body }) => {
      await changeStatus({ prisma, clock }, currentSession(res), params.ticketId, {
        type: 'SET_STATUS',
        status: body.status,
      });
      res.json(await adminTicket(params.ticketId));
    },
  );

  routes.add(
    {
      method: 'put',
      path: '/api/admin/tickets/:ticketId/assignee',
      summary: 'Assign a Ticket to the current Admin, which moves an Open Ticket to In Progress',
      tag: 'Admin',
      adminOnly: true,
      params: ticketParamsSchema,
      responses: {
        200: { description: 'The Ticket.', schema: adminTicketResponseSchema },
        404: { description: 'The Ticket does not exist, or the caller is not an Admin.', schema: apiErrorSchema },
        409: { description: 'Another Admin holds the Ticket, or it has just changed.', schema: apiErrorSchema },
      },
    },
    async (_req, res, { params }) => {
      await assignToSelf({ prisma, clock }, currentSession(res), params.ticketId);
      res.json(await adminTicket(params.ticketId));
    },
  );

  routes.add(
    {
      method: 'delete',
      path: '/api/admin/tickets/:ticketId/assignee',
      summary: 'Unassign the current Admin from a Ticket they hold',
      tag: 'Admin',
      adminOnly: true,
      params: ticketParamsSchema,
      responses: {
        200: { description: 'The Ticket.', schema: adminTicketResponseSchema },
        404: { description: 'The Ticket does not exist, or the caller is not an Admin.', schema: apiErrorSchema },
        409: { description: 'Another Admin holds the Ticket, or it has just changed.', schema: apiErrorSchema },
      },
    },
    async (_req, res, { params }) => {
      await unassignSelf({ prisma, clock }, currentSession(res), params.ticketId);
      res.json(await adminTicket(params.ticketId));
    },
  );

  routes.add(
    {
      method: 'put',
      path: '/api/admin/tickets/:ticketId/category',
      summary: "Set a Ticket's Category by hand, which the AI won't overwrite",
      tag: 'Admin',
      adminOnly: true,
      params: ticketParamsSchema,
      body: setCategoryRequestSchema,
      responses: {
        200: { description: 'The Ticket.', schema: adminTicketResponseSchema },
        404: { description: 'The Ticket does not exist, or the caller is not an Admin.', schema: apiErrorSchema },
        409: { description: 'The Ticket has just changed.', schema: apiErrorSchema },
      },
    },
    async (_req, res, { params, body }) => {
      await overrideCategory({ prisma, clock }, currentAdminId(res), params.ticketId, body.category);
      res.json(await adminTicket(params.ticketId));
    },
  );

  routes.add(
    {
      method: 'put',
      path: '/api/admin/tickets/:ticketId/priority',
      summary: "Set a Ticket's Priority by hand, which neither the AI nor a Priority Floor will overwrite",
      tag: 'Admin',
      adminOnly: true,
      params: ticketParamsSchema,
      body: setPriorityRequestSchema,
      responses: {
        200: { description: 'The Ticket.', schema: adminTicketResponseSchema },
        404: { description: 'The Ticket does not exist, or the caller is not an Admin.', schema: apiErrorSchema },
        409: { description: 'The Ticket has just changed.', schema: apiErrorSchema },
      },
    },
    async (_req, res, { params, body }) => {
      await overridePriority({ prisma, clock }, currentAdminId(res), params.ticketId, body.priority);
      res.json(await adminTicket(params.ticketId));
    },
  );

  routes.add(
    {
      method: 'post',
      path: '/api/admin/tickets/:ticketId/classification-retry',
      summary: 'Reset the attempts on an Unclassified Ticket and queue it for the AI again',
      tag: 'Admin',
      adminOnly: true,
      params: ticketParamsSchema,
      responses: {
        202: { description: 'The Ticket, queued for the AI.', schema: adminTicketResponseSchema },
        404: { description: 'The Ticket does not exist, or the caller is not an Admin.', schema: apiErrorSchema },
        409: { description: 'The Ticket is already classified.', schema: apiErrorSchema },
      },
    },
    async (_req, res, { params }) => {
      await resetClassification(prisma, params.ticketId);
      const response = await adminTicket(params.ticketId);
      res.once('close', () => classifier.enqueue(params.ticketId));
      res.status(202).json(response);
    },
  );

  routes.add(
    {
      method: 'get',
      path: '/api/admin/tickets/:ticketId/draft',
      summary: "Get a Ticket's Draft, writing one if there is none or it's a Stale Draft. It is never sent automatically",
      tag: 'Admin',
      adminOnly: true,
      params: ticketParamsSchema,
      responses: {
        200: { description: 'The Draft, or none, flagged if the AI failed.', schema: ticketDraftResponseSchema },
        404: { description: 'The Ticket does not exist, or the caller is not an Admin.', schema: apiErrorSchema },
      },
    },
    async (_req, res, { params }) => {
      res.json(await drafts.getOrCreate(params.ticketId));
    },
  );

  routes.add(
    {
      method: 'post',
      path: '/api/admin/tickets/:ticketId/draft-regeneration',
      summary: 'Write a new Draft for a Ticket, replacing the cached one',
      tag: 'Admin',
      adminOnly: true,
      params: ticketParamsSchema,
      responses: {
        200: { description: 'The new Draft, or none, flagged if the AI failed.', schema: ticketDraftResponseSchema },
        404: { description: 'The Ticket does not exist, or the caller is not an Admin.', schema: apiErrorSchema },
        409: { description: 'The Ticket is Closed.', schema: apiErrorSchema },
      },
    },
    async (_req, res, { params }) => {
      res.json(await drafts.regenerate(params.ticketId));
    },
  );

  routes.add(
    {
      method: 'get',
      path: '/api/admin/tickets/:ticketId/internal-notes',
      summary: "List a Ticket's Internal Notes, oldest first",
      tag: 'Admin',
      adminOnly: true,
      params: ticketParamsSchema,
      responses: {
        200: { description: 'The Internal Notes.', schema: internalNotesResponseSchema },
        404: { description: 'The Ticket does not exist, or the caller is not an Admin.', schema: apiErrorSchema },
      },
    },
    async (_req, res, { params }) => {
      const record = await prisma.ticket.findUnique({
        where: { id: params.ticketId },
        select: { internalNotes: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], select: internalNoteSelect } },
      });
      if (!record) throw notFound();
      res.json({ notes: record.internalNotes.map(toInternalNote) } satisfies InternalNotesResponse);
    },
  );

  routes.add(
    {
      method: 'post',
      path: '/api/admin/tickets/:ticketId/internal-notes',
      summary: 'Add an Internal Note to a Ticket, for other Admins. The Author never sees it',
      tag: 'Admin',
      adminOnly: true,
      params: ticketParamsSchema,
      body: addInternalNoteRequestSchema,
      responses: {
        201: { description: 'The Internal Note.', schema: internalNoteResponseSchema },
        404: { description: 'The Ticket does not exist, or the caller is not an Admin.', schema: apiErrorSchema },
      },
    },
    async (_req, res, { params, body }) => {
      const ticket = await prisma.ticket.findUnique({ where: { id: params.ticketId }, select: { id: true } });
      if (!ticket) throw notFound();
      // Nothing on the Ticket changes, so an Author can't tell from their Last update that a note was added.
      const record = await prisma.internalNote.create({
        data: { ticketId: ticket.id, adminId: currentAdminId(res), body: body.body, createdAt: clock.now() },
        select: internalNoteSelect,
      });
      res.status(201).json({ note: toInternalNote(record) } satisfies InternalNoteResponse);
    },
  );
}
