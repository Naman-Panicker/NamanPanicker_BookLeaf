import {
  apiErrorSchema,
  type AuthorTicket,
  authorTicketResponseSchema,
  type AuthorTicketResponse,
  createTicketRequestSchema,
  messageResponseSchema,
  type MessageResponse,
  myTicketsResponseSchema,
  type MyTicketsResponse,
  sendMessageRequestSchema,
  type TicketEvent,
  ticketEventsResponseSchema,
  type TicketEventsResponse,
  ticketMessagesResponseSchema,
  type TicketMessagesResponse,
  ticketParamsSchema,
} from '@bookleaf/shared';
import { currentAuthorId, currentSession, type Session } from '../auth/sessions';
import type { Classifier } from '../classification';
import type { Clock } from '../clock';
import type { PrismaClient } from '../db';
import type { Prisma } from '../generated/prisma/client';
import { notFound } from '../http/errors';
import type { createRoutes } from '../http/routes';
import { accessibleTicket, changeStatus, messageSelect, sendMessage, toMessage } from '../ticket-lifecycle';

type Deps = {
  routes: ReturnType<typeof createRoutes>;
  prisma: PrismaClient;
  clock: Clock;
  classifier: Classifier;
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

const eventOrder = [{ createdAt: 'asc' }, { id: 'asc' }] satisfies Prisma.TicketEventOrderByWithRelationInput[];

// Likewise, this leaves out the Admin's name and any reason.
const eventSelect = {
  id: true,
  kind: true,
  authorId: true,
  before: true,
  after: true,
  createdAt: true,
} satisfies Prisma.TicketEventSelect;

type EventRecord = Prisma.TicketEventGetPayload<{ select: typeof eventSelect }>;

function toTicketEvent(record: EventRecord): TicketEvent {
  return {
    id: record.id,
    kind: record.kind,
    actor: record.authorId === null ? 'ADMIN' : 'AUTHOR',
    before: record.before,
    after: record.after,
    createdAt: record.createdAt.toISOString(),
  };
}

async function listAuthorEvents(prisma: PrismaClient, session: Session, ticketId: string) {
  const record = await prisma.ticket.findFirst({
    where: accessibleTicket(session, ticketId),
    select: { events: { where: { visibleToAuthor: true }, orderBy: eventOrder, select: eventSelect } },
  });
  return record?.events.map(toTicketEvent);
}

async function listAdminEvents(prisma: PrismaClient, session: Session, ticketId: string) {
  const record = await prisma.ticket.findFirst({
    where: accessibleTicket(session, ticketId),
    select: {
      events: {
        orderBy: eventOrder,
        select: {
          ...eventSelect,
          reason: true,
          author: { select: { name: true } },
          admin: { select: { name: true } },
        },
      },
    },
  });
  return record?.events.map((event) => ({
    ...toTicketEvent(event),
    // The migration's check means one of the two is always set.
    actorName: (event.author ?? event.admin)?.name,
    reason: event.reason,
  }));
}

export function addTicketRoutes({ routes, prisma, clock, classifier }: Deps) {
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
      // Close also covers an Author who hung up early, whose Ticket exists all the same.
      res.once('close', () => classifier.enqueue(record.id));
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
      summary: 'List the Messages in a Ticket, oldest first, as its Author or as an Admin',
      tag: 'Tickets',
      params: ticketParamsSchema,
      responses: {
        200: { description: 'The thread.', schema: ticketMessagesResponseSchema },
        404: { description: 'The Ticket does not exist, or belongs to another Author.', schema: apiErrorSchema },
      },
    },
    async (_req, res, { params }) => {
      const record = await prisma.ticket.findFirst({
        where: accessibleTicket(currentSession(res), params.ticketId),
        select: { messages: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], select: messageSelect } },
      });
      if (!record) throw notFound();
      res.json({ messages: record.messages.map(toMessage) } satisfies TicketMessagesResponse);
    },
  );

  routes.add(
    {
      method: 'post',
      path: '/api/tickets/:ticketId/messages',
      summary: 'Send a Message on a Ticket, as its Author or as an Admin',
      tag: 'Tickets',
      params: ticketParamsSchema,
      body: sendMessageRequestSchema,
      responses: {
        201: { description: 'The Message.', schema: messageResponseSchema },
        404: { description: 'The Ticket does not exist, or belongs to another Author.', schema: apiErrorSchema },
        409: { description: 'The Ticket is Closed, or has just changed.', schema: apiErrorSchema },
      },
    },
    async (_req, res, { params, body }) => {
      const message = await sendMessage({ prisma, clock }, currentSession(res), params.ticketId, body.body);
      res.status(201).json({ message } satisfies MessageResponse);
    },
  );

  routes.add(
    {
      method: 'post',
      path: '/api/tickets/:ticketId/resolution-confirmation',
      summary: "Confirm that a Resolved Ticket solved the current Author's problem, which closes it",
      tag: 'Tickets',
      params: ticketParamsSchema,
      responses: {
        200: { description: 'The Ticket, now Closed.', schema: authorTicketResponseSchema },
        404: { description: 'The Ticket does not exist, or belongs to another Author.', schema: apiErrorSchema },
        409: { description: 'The Ticket is not Resolved.', schema: apiErrorSchema },
      },
    },
    async (_req, res, { params }) => {
      const authorId = currentAuthorId(res);
      await changeStatus({ prisma, clock }, currentSession(res), params.ticketId, { type: 'CONFIRM_RESOLUTION' });
      const record = await prisma.ticket.findFirstOrThrow({
        where: { id: params.ticketId, authorId },
        select: authorTicketSelect,
      });
      res.json({ ticket: toAuthorTicket(record) } satisfies AuthorTicketResponse);
    },
  );

  routes.add(
    {
      method: 'get',
      path: '/api/tickets/:ticketId/events',
      summary: "List a Ticket's Ticket Events, oldest first. Authors see only status changes",
      tag: 'Tickets',
      params: ticketParamsSchema,
      responses: {
        200: { description: 'The Ticket Events the caller may see.', schema: ticketEventsResponseSchema },
        404: { description: 'The Ticket does not exist, or belongs to another Author.', schema: apiErrorSchema },
      },
    },
    async (_req, res, { params }) => {
      const session = currentSession(res);
      const events =
        session.role === 'ADMIN'
          ? await listAdminEvents(prisma, session, params.ticketId)
          : await listAuthorEvents(prisma, session, params.ticketId);
      if (!events) throw notFound();
      res.json({ events } satisfies TicketEventsResponse);
    },
  );
}
