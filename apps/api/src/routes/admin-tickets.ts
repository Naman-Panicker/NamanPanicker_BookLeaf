import {
  type AdminQueueResponse,
  adminQueueQuerySchema,
  adminQueueResponseSchema,
  type AdminQueueTicket,
  ALL_STATUSES,
  apiErrorSchema,
  isUnresolved,
  orderQueue,
  ticketStatusSchema,
} from '@bookleaf/shared';
import type { z } from 'zod';
import { currentAdminId } from '../auth/sessions';
import type { PrismaClient } from '../db';
import type { Prisma } from '../generated/prisma/client';
import type { createRoutes } from '../http/routes';

type Deps = {
  routes: ReturnType<typeof createRoutes>;
  prisma: PrismaClient;
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

export function addAdminTicketRoutes({ routes, prisma }: Deps) {
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
}
