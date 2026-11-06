import type { Category, Priority, TicketStatus } from '@bookleaf/shared';
import type { PrismaClient } from './db';
import type { Prisma } from './generated/prisma/client';

export const ASHA_EMAIL = 'asha.rao@bookleaf.example';
export const DEV_EMAIL = 'dev.menon@bookleaf.example';

const HOUR_MS = 60 * 60 * 1000;

type SeedMessage = { from: 'AUTHOR' | 'ADMIN'; hoursAgo: number; body: string };
type SeedInternalNote = { adminEmail: string; hoursAgo: number; body: string };
// Made by the Ticket's Assignee.
type SeedEvent = { kind: 'STATUS_CHANGED' | 'PRIORITY_OVERRIDDEN'; hoursAgo: number; before: string; after: string };

type SeedTicket = {
  // Below 1001, where the sequence for real Tickets starts, so the two can't collide.
  referenceNumber: number;
  authorRef: string;
  bookRef: string;
  subject: string;
  status: TicketStatus;
  category: Category;
  priority: Priority;
  // Set when the current Priority isn't simply the AI's.
  suggestedPriority?: Priority;
  prioritySource?: 'ADMIN';
  priorityFloor?: 'OVERDUE_ROYALTY';
  assigneeEmail?: string;
  // Oldest first. The first is the Author's description.
  messages: SeedMessage[];
  internalNotes?: SeedInternalNote[];
  events?: SeedEvent[];
};

// Modelled on the sample queries in the assignment's knowledge base.
const SEED_TICKETS: SeedTicket[] = [
  {
    referenceNumber: 901,
    authorRef: 'AUTH003',
    bookRef: 'BK005',
    subject: "Still haven't received any royalty",
    status: 'OPEN',
    category: 'ROYALTY_PAYMENTS',
    priority: 'HIGH',
    suggestedPriority: 'MEDIUM',
    priorityFloor: 'OVERDUE_ROYALTY',
    messages: [
      {
        from: 'AUTHOR',
        hoursAgo: 72,
        body: "Between Two Temples has been out for a long while and I still haven't received any royalty. What's going on?",
      },
    ],
  },
  {
    referenceNumber: 902,
    authorRef: 'AUTH001',
    bookRef: 'BK001',
    subject: 'Different ISBN on Amazon and on the physical copy',
    status: 'OPEN',
    category: 'ISBN_METADATA',
    priority: 'CRITICAL',
    messages: [
      {
        from: 'AUTHOR',
        hoursAgo: 6,
        body: 'Whispers of the Ganges is showing a different ISBN on Amazon than what is on the physical copy. Readers are asking me which one is right.',
      },
    ],
  },
  {
    referenceNumber: 903,
    authorRef: 'AUTH005',
    bookRef: 'BK009',
    subject: 'Author copies have blurry images and misaligned pages',
    status: 'IN_PROGRESS',
    category: 'PRINTING_QUALITY',
    priority: 'HIGH',
    suggestedPriority: 'MEDIUM',
    prioritySource: 'ADMIN',
    assigneeEmail: DEV_EMAIL,
    messages: [
      {
        from: 'AUTHOR',
        hoursAgo: 50,
        body: 'I received my author copies of Letters from Lakshadweep and the print quality is terrible. The images are blurry and pages are misaligned.',
      },
      {
        from: 'ADMIN',
        hoursAgo: 28,
        body: "I'm so sorry, Meera. That isn't the standard your book deserves. Could you share photos of the defective copies? Once we've verified them, we'll arrange a free reprint, which takes 5–7 business days.",
      },
      {
        from: 'AUTHOR',
        hoursAgo: 26,
        body: 'Thank you. Pages 40 to 60 are the worst. I have an event in two weeks, so will the reprint arrive before then?',
      },
    ],
    internalNotes: [
      {
        adminEmail: ASHA_EMAIL,
        hoursAgo: 27,
        body: "Dev, it's worth asking our in-house print team to check the whole batch, not just Meera's copies. Let's not promise a reprint date until they answer.",
      },
    ],
    events: [
      { kind: 'PRIORITY_OVERRIDDEN', hoursAgo: 29, before: 'MEDIUM', after: 'HIGH' },
      { kind: 'STATUS_CHANGED', hoursAgo: 28, before: 'OPEN', after: 'IN_PROGRESS' },
    ],
  },
  {
    referenceNumber: 904,
    authorRef: 'AUTH009',
    bookRef: 'BK015',
    subject: 'Three weeks in typesetting',
    status: 'IN_PROGRESS',
    category: 'BOOK_STATUS_PRODUCTION',
    priority: 'MEDIUM',
    assigneeEmail: ASHA_EMAIL,
    messages: [
      {
        from: 'AUTHOR',
        hoursAgo: 30,
        body: "It's been 3 weeks and Raising Roots is still in typesetting. When will it be done?",
      },
      {
        from: 'ADMIN',
        hoursAgo: 20,
        body: "Thanks for checking in, Kavita. Raising Roots is still in typesetting, and I'm confirming the updated schedule with our production team. I'll come back to you with a specific date within 48 hours.",
      },
    ],
    events: [{ kind: 'STATUS_CHANGED', hoursAgo: 20, before: 'OPEN', after: 'IN_PROGRESS' }],
  },
  {
    referenceNumber: 905,
    authorRef: 'AUTH004',
    bookRef: 'BK006',
    subject: 'Showing as Currently Unavailable on Amazon',
    status: 'RESOLVED',
    category: 'DISTRIBUTION_AVAILABILITY',
    priority: 'MEDIUM',
    assigneeEmail: DEV_EMAIL,
    messages: [
      {
        from: 'AUTHOR',
        hoursAgo: 120,
        body: 'Debugging Life is published but it is showing as "Currently Unavailable" on Amazon.',
      },
      {
        from: 'ADMIN',
        hoursAgo: 100,
        body: "This is typically a stock sync issue, Vikram. I've triggered a re-sync with our distribution team, and the listing should be live again within 24–48 hours.",
      },
    ],
    events: [
      { kind: 'STATUS_CHANGED', hoursAgo: 100, before: 'OPEN', after: 'IN_PROGRESS' },
      { kind: 'STATUS_CHANGED', hoursAgo: 100, before: 'IN_PROGRESS', after: 'RESOLVED' },
    ],
  },
  {
    referenceNumber: 906,
    authorRef: 'AUTH008',
    bookRef: 'BK014',
    subject: 'Updating my book description on Amazon',
    status: 'CLOSED',
    category: 'GENERAL_INQUIRY',
    priority: 'LOW',
    assigneeEmail: ASHA_EMAIL,
    messages: [
      {
        from: 'AUTHOR',
        hoursAgo: 240,
        body: 'Can I update the description of Ghazal of the Forgotten on Amazon after it is already live?',
      },
      {
        from: 'ADMIN',
        hoursAgo: 230,
        body: 'Yes, Farhan. You can submit metadata updates through the dashboard or by emailing the BookLeaf team. Changes typically reflect on platforms within 3–5 business days.',
      },
    ],
    events: [
      { kind: 'STATUS_CHANGED', hoursAgo: 230, before: 'OPEN', after: 'IN_PROGRESS' },
      { kind: 'STATUS_CHANGED', hoursAgo: 230, before: 'IN_PROGRESS', after: 'CLOSED' },
    ],
  },
];

function toCreateInput(ticket: SeedTicket, now: Date): Prisma.TicketCreateInput {
  const ago = (hours: number) => new Date(now.getTime() - hours * HOUR_MS);
  const hoursAgo = ticket.messages.map((message) => message.hoursAgo);
  const authorHoursAgo = ticket.messages.filter(({ from }) => from === 'AUTHOR').map((message) => message.hoursAgo);

  return {
    referenceNumber: ticket.referenceNumber,
    author: { connect: { externalRef: ticket.authorRef } },
    book: { connect: { externalRef: ticket.bookRef } },
    subject: ticket.subject,
    status: ticket.status,
    ...(ticket.assigneeEmail && { assignee: { connect: { email: ticket.assigneeEmail } } }),
    suggestedCategory: ticket.category,
    suggestedPriority: ticket.suggestedPriority ?? ticket.priority,
    category: ticket.category,
    priority: ticket.priority,
    categorySource: 'AI',
    prioritySource: ticket.prioritySource ?? 'AI',
    priorityFloor: ticket.priorityFloor,
    classificationAttempts: 1,
    latestAuthorMessageAt: ago(Math.min(...authorHoursAgo)),
    lastUpdateAt: ago(Math.min(...hoursAgo)),
    createdAt: ago(Math.max(...hoursAgo)),
    messages: {
      create: ticket.messages.map(({ from, hoursAgo: messageHoursAgo, body }) => ({
        body,
        createdAt: ago(messageHoursAgo),
        ...(from === 'AUTHOR'
          ? { author: { connect: { externalRef: ticket.authorRef } } }
          : { admin: { connect: { email: ticket.assigneeEmail as string } } }),
      })),
    },
  };
}

// Fixed IDs, so a Ticket seeded before these existed gets them and running the seed again adds nothing.
// Dated from when the Ticket was raised, so on such a Ticket they still fall among its Messages.
function seedTicketHistory(prisma: PrismaClient, seeded: SeedTicket, ticket: { id: string; createdAt: Date }) {
  const raisedHoursAgo = Math.max(...seeded.messages.map(({ hoursAgo }) => hoursAgo));
  const at = (hoursAgo: number) => new Date(ticket.createdAt.getTime() + (raisedHoursAgo - hoursAgo) * HOUR_MS);

  return Promise.all([
    ...(seeded.internalNotes ?? []).map(({ adminEmail, hoursAgo, body }, index) => {
      const id = `seed-note-${seeded.referenceNumber}-${index}`;
      return prisma.internalNote.upsert({
        where: { id },
        create: {
          id,
          ticket: { connect: { id: ticket.id } },
          admin: { connect: { email: adminEmail } },
          body,
          createdAt: at(hoursAgo),
        },
        update: {},
      });
    }),
    ...(seeded.events ?? []).map(({ kind, hoursAgo, before, after }, index) => {
      const id = `seed-event-${seeded.referenceNumber}-${index}`;
      return prisma.ticketEvent.upsert({
        where: { id },
        create: {
          id,
          ticket: { connect: { id: ticket.id } },
          admin: { connect: { email: seeded.assigneeEmail as string } },
          kind,
          before,
          after,
          visibleToAuthor: kind === 'STATUS_CHANGED',
          createdAt: at(hoursAgo),
        },
        update: {},
      });
    }),
  ]);
}

// Dated relative to now, so the wait badges look real. An existing Ticket's own fields and Messages
// are left alone, so running the seed again doesn't undo what an Admin has done to it.
export async function seedTickets(prisma: PrismaClient, now: Date) {
  await Promise.all(
    SEED_TICKETS.map(async (seeded) => {
      const ticket = await prisma.ticket.upsert({
        where: { referenceNumber: seeded.referenceNumber },
        create: toCreateInput(seeded, now),
        update: {},
        select: { id: true, createdAt: true },
      });
      await seedTicketHistory(prisma, seeded, ticket);
    }),
  );
  return SEED_TICKETS.map(({ referenceNumber }) => `BL-${referenceNumber}`);
}
