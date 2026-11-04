import type { Category, Priority, TicketStatus } from '@bookleaf/shared';
import type { PrismaClient } from './db';
import type { Prisma } from './generated/prisma/client';

export const ASHA_EMAIL = 'asha.rao@bookleaf.example';
export const DEV_EMAIL = 'dev.menon@bookleaf.example';

const HOUR_MS = 60 * 60 * 1000;

type SeedMessage = { from: 'AUTHOR' | 'ADMIN'; hoursAgo: number; body: string };

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

// Dated relative to now, so the wait badges look real. An existing Ticket is left alone,
// so running the seed again doesn't undo what an Admin has done to it.
export async function seedTickets(prisma: PrismaClient, now: Date) {
  await Promise.all(
    SEED_TICKETS.map((ticket) =>
      prisma.ticket.upsert({
        where: { referenceNumber: ticket.referenceNumber },
        create: toCreateInput(ticket, now),
        update: {},
      }),
    ),
  );
  return SEED_TICKETS.map(({ referenceNumber }) => `BL-${referenceNumber}`);
}
