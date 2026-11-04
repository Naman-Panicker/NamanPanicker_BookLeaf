import {
  apiErrorSchema,
  type AuthorTicket,
  authorTicketResponseSchema,
  type AuthorTicketResponse,
  createTicketRequestSchema,
  type Message,
  myTicketsResponseSchema,
  type MyTicketsResponse,
  ticketMessagesResponseSchema,
  type TicketMessagesResponse,
  ticketParamsSchema,
} from '@bookleaf/shared';
import { currentAuthorId } from '../auth/sessions';
import type { Clock } from '../clock';
import type { PrismaClient } from '../db';
import type { Prisma } from '../generated/prisma/client';
import { notFound } from '../http/errors';
import type { createRoutes } from '../http/routes';

type Deps = {
  routes: ReturnType<typeof createRoutes>;
  prisma: PrismaClient;
  clock: Clock;
};

// Selecting only these columns keeps Admin-only fields from ever leaving the database on an Author's route.
const authorTicketSelect = {
  id: true,
  referenceNumber: true,
  subject: true,
  status: true,
  lastUpdateAt: true,
  book: { select: { id: true, title: true } },
} satisfies Prisma.TicketSelect;

type AuthorTicketRecord = Prisma.TicketGetPayload<{ select: typeof authorTicketSelect }>;

function toAuthorTicket(record: AuthorTicketRecord): AuthorTicket {
  return {
    id: record.id,
    reference: `BL-${record.referenceNumber}`,
    subject: record.subject,
    status: record.status,
    book: record.book,
    lastUpdateAt: record.lastUpdateAt.toISOString(),
  };
}

// Likewise, this leaves out which Admin wrote a Message.
const messageSelect = {
  id: true,
  authorId: true,
  body: true,
  createdAt: true,
} satisfies Prisma.MessageSelect;

type MessageRecord = Prisma.MessageGetPayload<{ select: typeof messageSelect }>;

function toMessage(record: MessageRecord): Message {
  return {
    id: record.id,
    sender: record.authorId === null ? 'ADMIN' : 'AUTHOR',
    body: record.body,
    createdAt: record.createdAt.toISOString(),
  };
}

export function addTicketRoutes({ routes, prisma, clock }: Deps) {
  routes.add(
    {
      method: 'get',
      path: '/api/tickets',
      summary: "List the current Author's Tickets, most recently updated first",
      tag: 'Tickets',
      responses: {
        200: { description: "The Author's Tickets.", schema: myTicketsResponseSchema },
        404: { description: 'The caller is not an Author.', schema: apiErrorSchema },
      },
    },
    async (_req, res) => {
      const records = await prisma.ticket.findMany({
        where: { authorId: currentAuthorId(res) },
        orderBy: [{ lastUpdateAt: 'desc' }, { referenceNumber: 'desc' }],
        select: authorTicketSelect,
      });
      res.json({ tickets: records.map(toAuthorTicket) } satisfies MyTicketsResponse);
    },
  );

  routes.add(
    {
      method: 'post',
      path: '/api/tickets',
      summary: "Raise a Ticket about one of the current Author's Books, or about their account",
      tag: 'Tickets',
      body: createTicketRequestSchema,
      responses: {
        201: { description: 'The Ticket, Unclassified for now.', schema: authorTicketResponseSchema },
        404: { description: 'The Book does not exist, or belongs to another Author.', schema: apiErrorSchema },
      },
    },
    async (_req, res, { body }) => {
      const authorId = currentAuthorId(res);
      if (body.bookId !== null) {
        const book = await prisma.book.findFirst({ where: { id: body.bookId, authorId }, select: { id: true } });
        if (!book) throw notFound();
      }

      const now = clock.now();
      const record = await prisma.ticket.create({
        data: {
          authorId,
          bookId: body.bookId,
          subject: body.subject,
          latestAuthorMessageAt: now,
          lastUpdateAt: now,
          createdAt: now,
          messages: { create: { authorId, body: body.description, createdAt: now } },
        },
        select: authorTicketSelect,
      });
      res.status(201).json({ ticket: toAuthorTicket(record) } satisfies AuthorTicketResponse);
    },
  );

  routes.add(
    {
      method: 'get',
      path: '/api/tickets/:ticketId',
      summary: "Get one of the current Author's Tickets",
      tag: 'Tickets',
      params: ticketParamsSchema,
      responses: {
        200: { description: 'The Ticket.', schema: authorTicketResponseSchema },
        404: { description: 'The Ticket does not exist, or belongs to another Author.', schema: apiErrorSchema },
      },
    },
    async (_req, res, { params }) => {
      const record = await prisma.ticket.findFirst({
        where: { id: params.ticketId, authorId: currentAuthorId(res) },
        select: authorTicketSelect,
      });
      if (!record) throw notFound();
      res.json({ ticket: toAuthorTicket(record) } satisfies AuthorTicketResponse);
    },
  );

  routes.add(
    {
      method: 'get',
      path: '/api/tickets/:ticketId/messages',
      summary: "List the Messages in one of the current Author's Tickets, oldest first",
      tag: 'Tickets',
      params: ticketParamsSchema,
      responses: {
        200: { description: 'The thread.', schema: ticketMessagesResponseSchema },
        404: { description: 'The Ticket does not exist, or belongs to another Author.', schema: apiErrorSchema },
      },
    },
    async (_req, res, { params }) => {
      const record = await prisma.ticket.findFirst({
        where: { id: params.ticketId, authorId: currentAuthorId(res) },
        select: { messages: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], select: messageSelect } },
      });
      if (!record) throw notFound();
      res.json({ messages: record.messages.map(toMessage) } satisfies TicketMessagesResponse);
    },
  );
}
