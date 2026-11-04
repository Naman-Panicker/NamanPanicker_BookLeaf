import {
  type Category,
  categorySchema,
  isUnclassified,
  MAX_CLASSIFICATION_ATTEMPTS,
  type Priority,
  prioritySchema,
  resolvePriority,
  royaltySummary,
} from '@bookleaf/shared';
import { z } from 'zod';
import type { AiClient } from './ai-client';
import { classificationPrompt } from './classification-prompt';
import type { Clock } from './clock';
import type { PrismaClient } from './db';
import type { Prisma } from './generated/prisma/client';
import { conflict, notFound } from './http/errors';
import { ticketJustChanged } from './ticket-lifecycle';

type Deps = { prisma: PrismaClient; clock: Clock };

const classificationSchema = z.object({
  category: categorySchema,
  priority: prioritySchema,
});

const BACKOFF_BASE_MS = 1000;
const ERROR_MAX_LENGTH = 500;
const RECOVERY_WINDOW_MS = 24 * 60 * 60 * 1000;
// Two people would have to change one Ticket's triage at the very same moment, so this is plenty.
const WRITE_ATTEMPTS = 3;

const UNCLASSIFIED: Prisma.TicketWhereInput = { OR: [{ category: null }, { priority: null }] };

const triageSelect = {
  authorId: true,
  category: true,
  categorySource: true,
  priority: true,
  prioritySource: true,
  suggestedPriority: true,
} satisfies Prisma.TicketSelect;

type Triage = Prisma.TicketGetPayload<{ select: typeof triageSelect }>;

// Matches only if nobody has changed the Ticket's triage since it was read.
function triageUnchanged({ category, categorySource, priority, prioritySource }: Triage): Prisma.TicketWhereInput {
  return { category, categorySource, priority, prioritySource };
}

// The Priority a Ticket should have for this Category and AI Priority, unless an Admin has set one.
async function priorityChanges(
  { prisma, clock }: Deps,
  { authorId, priority, prioritySource }: Triage,
  category: Category | null,
  aiPriority: Priority | null,
) {
  const books = await prisma.book.findMany({ where: { authorId } });
  const adminSet = prioritySource === 'ADMIN';
  const resolved = resolvePriority({
    aiPriority,
    category,
    overdue: royaltySummary(books, clock.now()).overdue,
    adminOverride: adminSet ? priority : null,
  });
  return {
    priority: resolved.priority,
    priorityFloor: resolved.floor,
    prioritySource: adminSet ? ('ADMIN' as const) : resolved.priority && ('AI' as const),
  };
}

async function storeSuggestion(deps: Deps, ticketId: string, suggestion: z.output<typeof classificationSchema>) {
  const { prisma } = deps;
  for (let attempt = 0; attempt < WRITE_ATTEMPTS; attempt += 1) {
    const triage = await prisma.ticket.findUnique({ where: { id: ticketId }, select: triageSelect });
    if (!triage) return;
    // An Admin's value stands, however late the AI's answer arrives.
    const adminCategory = triage.categorySource === 'ADMIN';
    const category = adminCategory ? triage.category : suggestion.category;
    const { count } = await prisma.ticket.updateMany({
      where: { id: ticketId, ...triageUnchanged(triage) },
      data: {
        suggestedCategory: suggestion.category,
        suggestedPriority: suggestion.priority,
        category,
        categorySource: adminCategory ? 'ADMIN' : 'AI',
        ...(await priorityChanges(deps, triage, category, suggestion.priority)),
        classificationAttempts: { increment: 1 },
        classificationError: null,
      },
    });
    if (count > 0) return;
  }
  throw new Error(`Could not store the AI's classification of Ticket ${ticketId}.`);
}

function failureMessage(failure: unknown) {
  const message = failure instanceof Error ? failure.message : 'The AI call failed.';
  return message.slice(0, ERROR_MAX_LENGTH);
}

// Works from the stored attempt count, so a Ticket picked up after a restart only gets the attempts it has left.
async function classifyTicket(deps: Deps & { ai: AiClient }, ticketId: string) {
  const { prisma, clock, ai } = deps;
  for (;;) {
    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
      select: {
        subject: true,
        category: true,
        priority: true,
        classificationAttempts: true,
        book: { select: { title: true, productionStage: true } },
        messages: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], take: 1, select: { body: true } },
      },
    });
    if (!ticket || !isUnclassified(ticket)) return;
    const attempts = ticket.classificationAttempts;
    if (attempts >= MAX_CLASSIFICATION_ATTEMPTS) return;
    if (attempts > 0) await clock.sleep(BACKOFF_BASE_MS * 2 ** (attempts - 1));

    const prompt = classificationPrompt({
      subject: ticket.subject,
      firstMessage: ticket.messages[0]?.body ?? '',
      book: ticket.book,
    });
    try {
      const answer = classificationSchema.safeParse(await ai.classify(prompt));
      if (!answer.success) throw new Error("The AI's answer wasn't one of the fixed Categories and Priorities.");
      await storeSuggestion(deps, ticketId, answer.data);
      return;
    } catch (failure) {
      // updateMany, because the Ticket may be gone by now, and that's nothing to fail over.
      await prisma.ticket.updateMany({
        where: { id: ticketId },
        data: { classificationAttempts: { increment: 1 }, classificationError: failureMessage(failure) },
      });
    }
  }
}

export function createClassifier(deps: Deps & { ai: AiClient }) {
  const queue = new Set<string>();
  let draining = false;

  // One at a time, so a burst after a restart can't run into the AI's rate limits.
  async function drain() {
    draining = true;
    // A Set's iterator also reaches entries added during the loop, including a Ticket queued again mid-run.
    for (const ticketId of queue) {
      queue.delete(ticketId);
      // A failure here is about this Ticket alone, and it mustn't stop the ones behind it.
      await classifyTicket(deps, ticketId).catch((error: unknown) => console.error(error));
    }
    draining = false;
  }

  function enqueue(ticketId: string) {
    queue.add(ticketId);
    if (!draining) void drain();
  }

  return {
    enqueue,

    // For server start, to pick up Tickets that were queued when the last server stopped.
    async requeueRecent() {
      const records = await deps.prisma.ticket.findMany({
        where: {
          ...UNCLASSIFIED,
          createdAt: { gte: new Date(deps.clock.now().getTime() - RECOVERY_WINDOW_MS) },
          classificationAttempts: { lt: MAX_CLASSIFICATION_ATTEMPTS },
        },
        orderBy: { createdAt: 'asc' },
        select: { id: true },
      });
      records.forEach(({ id }) => enqueue(id));
    },
  };
}

export type Classifier = ReturnType<typeof createClassifier>;

// Throws unless the Ticket is Unclassified, because the AI must not redo a finished classification.
export async function resetClassification(prisma: PrismaClient, ticketId: string) {
  const { count } = await prisma.ticket.updateMany({
    where: { id: ticketId, ...UNCLASSIFIED },
    data: { classificationAttempts: 0, classificationError: null },
  });
  if (count > 0) return;
  const exists = await prisma.ticket.count({ where: { id: ticketId } });
  throw exists > 0 ? conflict('This Ticket is already classified.') : notFound();
}

type Override = {
  kind: 'CATEGORY_OVERRIDDEN' | 'PRIORITY_OVERRIDDEN';
  before: string | null;
  after: string;
  changes: Prisma.TicketUpdateManyMutationInput;
};

// computeOverride returns null if the Admin's value is already in place.
async function applyOverride(
  { prisma, clock }: Deps,
  adminId: string,
  ticketId: string,
  computeOverride: (triage: Triage) => Promise<Override | null>,
) {
  // The AI answering at the same moment doesn't make the Admin's choice wrong, so work it out again.
  for (let attempt = 0; attempt < WRITE_ATTEMPTS; attempt += 1) {
    const triage = await prisma.ticket.findUnique({ where: { id: ticketId }, select: triageSelect });
    if (!triage) throw notFound();
    const override = await computeOverride(triage);
    if (!override) return;
    const written = await prisma.$transaction(async (tx) => {
      const { count } = await tx.ticket.updateMany({
        where: { id: ticketId, ...triageUnchanged(triage) },
        data: override.changes,
      });
      if (count === 0) return false;
      await tx.ticketEvent.create({
        data: {
          ticketId,
          kind: override.kind,
          adminId,
          before: override.before,
          after: override.after,
          createdAt: clock.now(),
        },
      });
      return true;
    });
    if (written) return;
  }
  throw ticketJustChanged();
}

export function overrideCategory(deps: Deps, adminId: string, ticketId: string, category: Category) {
  return applyOverride(deps, adminId, ticketId, async (triage) => {
    if (triage.category === category && triage.categorySource === 'ADMIN') return null;
    return {
      kind: 'CATEGORY_OVERRIDDEN',
      before: triage.category,
      after: category,
      changes: {
        category,
        categorySource: 'ADMIN',
        // Floors depend on the Category, so a corrected Category can raise or lower the AI's Priority.
        ...(await priorityChanges(deps, triage, category, triage.suggestedPriority)),
      },
    };
  });
}

export function overridePriority(deps: Deps, adminId: string, ticketId: string, priority: Priority) {
  return applyOverride(deps, adminId, ticketId, async (triage) => {
    if (triage.priority === priority && triage.prioritySource === 'ADMIN') return null;
    return {
      kind: 'PRIORITY_OVERRIDDEN',
      before: triage.priority,
      after: priority,
      changes: { priority, prioritySource: 'ADMIN', priorityFloor: null },
    };
  });
}
