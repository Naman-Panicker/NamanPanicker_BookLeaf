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
  setTicketStatusRequestSchema,
  ticketParamsSchema,
  ticketStatusSchema,
} from '@bookleaf/shared';
import type { z } from 'zod';
import { currentAdminId, currentSession } from '../auth/sessions';
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
};

const queueTicketSelect = {
  id: true,
  referenceNumber: true,
  subject: true,
  status: true,
  category: true,
  priority: true,
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

export function addAdminTicketRoutes({ routes, prisma, clock }: Deps) {
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
      const record = await prisma.ticket.findUniqueOrThrow({
        where: { id: params.ticketId },
        select: queueTicketSelect,
      });
      res.json({ ticket: toAdminQueueTicket(record) } satisfies AdminTicketResponse);
    },
  );
}
