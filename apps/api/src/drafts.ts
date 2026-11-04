import { royaltySummary, sendMessageRequestSchema, type TicketDraftResponse } from '@bookleaf/shared';
import type { AiClient } from './ai-client';
import type { Clock } from './clock';
import type { PrismaClient } from './db';
import { draftPrompt } from './draft-prompt';
import type { Prisma } from './generated/prisma/client';
import { notFound } from './http/errors';
import { ticketClosed } from './ticket-lifecycle';

type Deps = { prisma: PrismaClient; clock: Clock; ai: AiClient };

const RECENT_MESSAGES = 6;

// A Draft the Admin couldn't send as it stands is no use to them.
const draftAnswerSchema = sendMessageRequestSchema.shape.body;

const NO_DRAFT = { draft: null, draftUnavailable: false } satisfies TicketDraftResponse;
const DRAFT_UNAVAILABLE = { draft: null, draftUnavailable: true } satisfies TicketDraftResponse;

const newestFirst = [{ createdAt: 'desc' }, { id: 'desc' }] satisfies Prisma.MessageOrderByWithRelationInput[];

const draftTicketSelect = {
  id: true,
  subject: true,
  status: true,
  category: true,
  authorId: true,
  lastUpdateAt: true,
  draftBody: true,
  draftAuthorMessageId: true,
  author: { select: { name: true } },
  book: true,
  messages: { orderBy: newestFirst, take: RECENT_MESSAGES, select: { authorId: true, body: true } },
} satisfies Prisma.TicketSelect;

type DraftTicket = Prisma.TicketGetPayload<{ select: typeof draftTicketSelect }>;

export function createDrafts({ prisma, clock, ai }: Deps) {
  // An Admin who opens a Ticket twice in a row, or two Admins opening it together, share one AI call.
  // Keyed by Author Message too, because a Draft being written from an older one wouldn't answer the newest.
  const writing = new Map<string, Promise<TicketDraftResponse>>();

  async function readTicket(ticketId: string) {
    const ticket = await prisma.ticket.findUnique({ where: { id: ticketId }, select: draftTicketSelect });
    if (!ticket) throw notFound();
    return ticket;
  }

  async function latestAuthorMessageId(ticketId: string) {
    const message = await prisma.message.findFirst({
      where: { ticketId, authorId: { not: null } },
      orderBy: newestFirst,
      select: { id: true },
    });
    return message?.id ?? null;
  }

  async function write(ticket: DraftTicket, authorMessageId: string | null): Promise<TicketDraftResponse> {
    const books = await prisma.book.findMany({ where: { authorId: ticket.authorId } });
    const now = clock.now();
    const prompt = draftPrompt({
      subject: ticket.subject,
      category: ticket.category,
      authorName: ticket.author.name,
      book: ticket.book,
      royalty: royaltySummary(books, now),
      now,
      messages: ticket.messages.toReversed(),
    });

    let draft: string;
    try {
      const answer = draftAnswerSchema.safeParse(await ai.draft(prompt));
      if (!answer.success) throw new Error("The AI's answer couldn't be sent as a Message.");
      draft = answer.data;
    } catch (failure) {
      console.error(`Could not write a Draft for Ticket ${ticket.id}.`, failure);
      return DRAFT_UNAVAILABLE;
    }

    // If the Ticket moved while the AI was writing, this Draft may be out of date, so it isn't kept for the next open.
    await prisma.ticket.updateMany({
      where: { id: ticket.id, lastUpdateAt: ticket.lastUpdateAt },
      data: { draftBody: draft, draftAuthorMessageId: authorMessageId },
    });
    return { draft, draftUnavailable: false };
  }

  function writeOnce(ticket: DraftTicket, authorMessageId: string | null) {
    const key = `${ticket.id}:${authorMessageId}`;
    const running = writing.get(key);
    if (running) return running;
    const started = write(ticket, authorMessageId).finally(() => writing.delete(key));
    writing.set(key, started);
    return started;
  }

  return {
    // For an Admin opening a Ticket. Only spends on the AI if there's something for the Admin to answer.
    async getOrCreate(ticketId: string): Promise<TicketDraftResponse> {
      const ticket = await readTicket(ticketId);
      if (ticket.status === 'CLOSED') return NO_DRAFT;
      const authorMessageId = await latestAuthorMessageId(ticketId);
      if (ticket.draftBody !== null && ticket.draftAuthorMessageId === authorMessageId) {
        return { draft: ticket.draftBody, draftUnavailable: false };
      }
      // BookLeaf has the last word, so it's the Author's turn.
      if (ticket.messages[0]?.authorId === null) return NO_DRAFT;
      return writeOnce(ticket, authorMessageId);
    },

    // A failure leaves any cached Draft in place, because it's still as good as it was.
    async regenerate(ticketId: string) {
      const ticket = await readTicket(ticketId);
      if (ticket.status === 'CLOSED') throw ticketClosed();
      return writeOnce(ticket, await latestAuthorMessageId(ticketId));
    },
  };
}

export type Drafts = ReturnType<typeof createDrafts>;
