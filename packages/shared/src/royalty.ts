import { z } from 'zod';
import { isPublished, type ProductionStage } from './production-stage';

// null means "not applicable", which is not the same as zero: a Book in production
// hasn't sold nothing, it just isn't on sale yet. On a published Book, a null
// lastPayoutDate means the Book has never been paid.
export const bookRoyaltySchema = z.object({
  copiesSold: z.number().nullable(),
  royaltyEarned: z.number().nullable(),
  royaltyPaid: z.number().nullable(),
  royaltyPending: z.number().nullable(),
  lastPayoutDate: z.iso.date().nullable(),
});
export type BookRoyalty = z.infer<typeof bookRoyaltySchema>;

export const PAYOUT_THRESHOLD = 1000;
const PAYOUT_WINDOW_DAYS = 45;
const DAY_MS = 24 * 60 * 60 * 1000;

export const royaltySummarySchema = z.object({
  totalEarned: z.number().nullable(),
  totalPaid: z.number().nullable(),
  totalPending: z.number().nullable(),
  lastPayoutDate: z.iso.date().nullable(),
  nextPayoutDate: z.iso.date(),
  belowThreshold: z.boolean(),
  overdue: z.boolean(),
});
export type RoyaltySummary = z.infer<typeof royaltySummarySchema>;

export type RoyaltyBook = {
  productionStage: ProductionStage;
  copiesSold: number;
  royaltyEarned: number;
  royaltyPaid: number;
  royaltyPending: number;
  lastPayoutDate: Date | null;
};

export function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

// Quarters are read in UTC, so the answer doesn't depend on where the server runs.
function quarterEnd(date: Date) {
  const lastMonth = Math.floor(date.getUTCMonth() / 3) * 3 + 2;
  return new Date(Date.UTC(date.getUTCFullYear(), lastMonth + 1, 0));
}

function previousQuarterEnd(end: Date) {
  return new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - 2, 0));
}

function payoutDueDate(end: Date) {
  return new Date(end.getTime() + PAYOUT_WINDOW_DAYS * DAY_MS);
}

// The end of the latest quarter whose Payout window is over. The due date itself is still in the window.
function lastClosedQuarterEnd(now: Date) {
  const previous = previousQuarterEnd(quarterEnd(now));
  return isoDate(payoutDueDate(previous)) < isoDate(now) ? previous : previousQuarterEnd(previous);
}

export function bookRoyalty(book: RoyaltyBook): BookRoyalty {
  if (!isPublished(book.productionStage)) {
    return { copiesSold: null, royaltyEarned: null, royaltyPaid: null, royaltyPending: null, lastPayoutDate: null };
  }
  return {
    copiesSold: book.copiesSold,
    royaltyEarned: book.royaltyEarned,
    royaltyPaid: book.royaltyPaid,
    royaltyPending: book.royaltyPending,
    lastPayoutDate: book.lastPayoutDate && isoDate(book.lastPayoutDate),
  };
}

export function royaltySummary(books: RoyaltyBook[], now: Date): RoyaltySummary {
  // Books in production have nothing to add, and an Author with no published Book has no totals at all.
  const published = books.filter((book) => isPublished(book.productionStage));
  const sum = (figure: (book: RoyaltyBook) => number) =>
    published.length === 0 ? null : published.reduce((total, book) => total + figure(book), 0);

  const totalPending = sum((book) => book.royaltyPending);
  const payoutDates = published.flatMap(({ lastPayoutDate }) => (lastPayoutDate ? [isoDate(lastPayoutDate)] : []));
  const lastPayoutDate = payoutDates.toSorted().at(-1) ?? null;
  // A Payout made any time after that quarter ended covers its window, even one made after the window closed.
  const paidSinceLastWindow = lastPayoutDate !== null && lastPayoutDate > isoDate(lastClosedQuarterEnd(now));

  return {
    totalEarned: sum((book) => book.royaltyEarned),
    totalPaid: sum((book) => book.royaltyPaid),
    totalPending,
    lastPayoutDate,
    nextPayoutDate: isoDate(payoutDueDate(quarterEnd(now))),
    // With nothing pending there's nothing to roll over, so the threshold doesn't come into it.
    belowThreshold: totalPending !== null && totalPending > 0 && totalPending < PAYOUT_THRESHOLD,
    overdue: totalPending !== null && totalPending >= PAYOUT_THRESHOLD && !paidSinceLastWindow,
  };
}
