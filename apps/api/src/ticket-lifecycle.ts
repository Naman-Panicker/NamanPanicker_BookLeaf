import {
  type Message,
  nextTicketStatus,
  type TicketAction,
  type TicketStatus,
  type TransitionRejection,
} from '@bookleaf/shared';
import type { Session } from './auth/sessions';
import type { Clock } from './clock';
import type { PrismaClient } from './db';
import type { Prisma } from './generated/prisma/client';
import { type ApiError, conflict, notFound } from './http/errors';

type Deps = { prisma: PrismaClient; clock: Clock };

type StatusMove = { from: TicketStatus; to: TicketStatus };

// A Ticket's status can only settle after a few moves, so this is plenty for people typing at once.
const MESSAGE_ATTEMPTS = 3;

export const ticketJustChanged = () => conflict('This Ticket has just changed. Reload the page and try again.');
export const ticketClosed = () => conflict("This Ticket is Closed, so it can't take new Messages.");

export const CLEARED_DRAFT = { draftBody: null, draftAuthorMessageId: null } satisfies Prisma.TicketUpdateManyMutationInput;

const REJECTIONS: Record<TransitionRejection, () => ApiError> = {
  TICKET_CLOSED: ticketClosed,
  NOT_RESOLVED: () => conflict('Only a Resolved Ticket can be confirmed as solved.'),
  // Routes check the role first. To anyone else, the action doesn't exist.
  ROLE_NOT_ALLOWED: notFound,
};

// Selecting only these columns leaves out which Admin wrote a Message.
export const messageSelect = {
  id: true,
  authorId: true,
  body: true,
  createdAt: true,
} satisfies Prisma.MessageSelect;

type MessageRecord = Prisma.MessageGetPayload<{ select: typeof messageSelect }>;

export function toMessage(record: MessageRecord): Message {
  return {
    id: record.id,
    sender: record.authorId === null ? 'ADMIN' : 'AUTHOR',
    body: record.body,
    createdAt: record.createdAt.toISOString(),
  };
}

// Authors reach only their own Tickets, and Admins reach all of them.
export function accessibleTicket({ id, role }: Session, ticketId: string): Prisma.TicketWhereInput {
  return role === 'ADMIN' ? { id: ticketId } : { id: ticketId, authorId: id };
}

function actorColumn({ id, role }: Session) {
  return role === 'ADMIN' ? { adminId: id } : { authorId: id };
}

async function decideMove(prisma: PrismaClient, actor: Session, ticketId: string, action: TicketAction) {
  const ticket = await prisma.ticket.findFirst({
    where: accessibleTicket(actor, ticketId),
    select: { status: true },
  });
  if (!ticket) throw notFound();
  const outcome = nextTicketStatus(ticket.status, actor.role, action);
  if (!outcome.ok) throw REJECTIONS[outcome.rejection]();
  return { from: ticket.status, to: outcome.status } satisfies StatusMove;
}

// Returns false, having written nothing, if the status has changed since the move was decided.
async function recordMove(
  tx: Prisma.TransactionClient,
  actor: Session,
  ticketId: string,
  { from, to }: StatusMove,
  now: Date,
  ticketChanges: Prisma.TicketUpdateManyMutationInput = {},
) {
  const { count } = await tx.ticket.updateMany({
    where: { id: ticketId, status: from },
    data: { status: to, lastUpdateAt: now, ...ticketChanges },
  });
  if (count === 0) return false;
  if (from === to) return true;

  await tx.ticketEvent.create({
    data: {
      ticketId,
      kind: 'STATUS_CHANGED',
      ...actorColumn(actor),
      before: from,
      after: to,
      visibleToAuthor: true,
      createdAt: now,
    },
  });
  return true;
}

export async function sendMessage({ prisma, clock }: Deps, actor: Session, ticketId: string, body: string) {
  // A status that moved underneath a Message doesn't make it wrong, so decide again from the new one.
  // Only the rules can refuse it, which stops a Message landing on a Ticket that has just closed.
  for (let attempt = 0; attempt < MESSAGE_ATTEMPTS; attempt += 1) {
    const move = await decideMove(prisma, actor, ticketId, { type: 'SEND_MESSAGE' });
    const now = clock.now();
    const record = await prisma.$transaction(async (tx) => {
      // The Admin's Message answers the thread, so a Draft kept after it would only repeat it.
      const threadChanges = actor.role === 'AUTHOR' ? { latestAuthorMessageAt: now } : CLEARED_DRAFT;
      if (!(await recordMove(tx, actor, ticketId, move, now, threadChanges))) return null;
      return tx.message.create({
        data: { ticketId, ...actorColumn(actor), body, createdAt: now },
        select: messageSelect,
      });
    });
    if (record) return toMessage(record);
  }
  throw ticketJustChanged();
}

export async function assignToSelf({ prisma, clock }: Deps, admin: Session, ticketId: string) {
  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    select: { status: true, assignee: { select: { id: true, name: true } } },
  });
  if (!ticket) throw notFound();
  const { status, assignee } = ticket;
  if (assignee?.id === admin.id) return;
  if (assignee) throw conflict(`This Ticket is already assigned to ${assignee.name}.`);
  const outcome = nextTicketStatus(status, admin.role, { type: 'ASSIGN' });
  if (!outcome.ok) throw REJECTIONS[outcome.rejection]();

  const now = clock.now();
  await prisma.$transaction(async (tx) => {
    const { count } = await tx.ticket.updateMany({
      where: { id: ticketId, assigneeId: null },
      data: { assigneeId: admin.id },
    });
    if (count === 0) throw ticketJustChanged();
    await tx.ticketEvent.create({ data: { ticketId, kind: 'ASSIGNED', adminId: admin.id, createdAt: now } });
    // Who holds a Ticket is Admin-only, so the Author's Last update only moves if the status does.
    if (status === outcome.status) return;
    if (!(await recordMove(tx, admin, ticketId, { from: status, to: outcome.status }, now))) throw ticketJustChanged();
  });
}

export async function unassignSelf({ prisma, clock }: Deps, admin: Session, ticketId: string) {
  const ticket = await prisma.ticket.findUnique({ where: { id: ticketId }, select: { assigneeId: true } });
  if (!ticket) throw notFound();
  if (ticket.assigneeId === null) return;
  if (ticket.assigneeId !== admin.id) throw conflict('Only the Assignee can unassign this Ticket.');

  const now = clock.now();
  await prisma.$transaction(async (tx) => {
    const { count } = await tx.ticket.updateMany({
      where: { id: ticketId, assigneeId: admin.id },
      data: { assigneeId: null },
    });
    if (count === 0) throw ticketJustChanged();
    await tx.ticketEvent.create({ data: { ticketId, kind: 'UNASSIGNED', adminId: admin.id, createdAt: now } });
  });
}

export async function changeStatus({ prisma, clock }: Deps, actor: Session, ticketId: string, action: TicketAction) {
  const move = await decideMove(prisma, actor, ticketId, action);
  // Setting the status a Ticket already has changes nothing, so there's nothing to record.
  if (move.from === move.to) return;
  // Unlike a Message, this was chosen while looking at the old status, so the person should look again.
  const moved = await prisma.$transaction((tx) => recordMove(tx, actor, ticketId, move, clock.now()));
  if (!moved) throw ticketJustChanged();
}
