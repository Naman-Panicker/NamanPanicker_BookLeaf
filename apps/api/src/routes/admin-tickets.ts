import {
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
  isUnresolved,
  orderQueue,
  royaltySummary,
  setCategoryRequestSchema,
  setPriorityRequestSchema,
  setTicketStatusRequestSchema,
  ticketParamsSchema,
  ticketStatusSchema,
} from '@bookleaf/shared';
import type { z } from 'zod';
import { currentAdminId, currentSession } from '../auth/sessions';
import { type Classifier, overrideCategory, overridePriority, resetClassification } from '../classification';
import type { Clock } from '../clock';
import type { PrismaClient } from '../db';
import type { Prisma } from '../generated/prisma/client';
import { notFound } from '../http/errors';
import type { createRoutes } from '../http/routes';
import { changeStatus } from '../ticket-lifecycle';
import { toBook } from './books';

type Deps = {
  routes: ReturnType<typeof createRoutes>;
  prisma: PrismaClient;
  clock: Clock;
  classifier: Classifier;
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

export function addAdminTicketRoutes({ routes, prisma, clock, classifier }: Deps) {
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
}
