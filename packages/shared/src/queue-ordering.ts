import type { Category, Priority, TicketStatus } from './tickets';

export type QueueTicket = {
  status: TicketStatus;
  category: Category | null;
  priority: Priority | null;
  // When the Author's latest Message arrived.
  waitingSince: Date;
};

const UNCLASSIFIED = 'UNCLASSIFIED';

// A known Critical comes before an unknown, and an unknown could be anything, so it comes before the rest.
const PRIORITY_ORDER: (Priority | typeof UNCLASSIFIED)[] = ['CRITICAL', UNCLASSIFIED, 'HIGH', 'MEDIUM', 'LOW'];

export function isUnclassified({ category, priority }: Pick<QueueTicket, 'category' | 'priority'>) {
  return category === null || priority === null;
}

export function isUnresolved(status: TicketStatus) {
  return status === 'OPEN' || status === 'IN_PROGRESS';
}

function priorityRank(ticket: QueueTicket) {
  return PRIORITY_ORDER.indexOf(isUnclassified(ticket) ? UNCLASSIFIED : (ticket.priority as Priority));
}

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

export function waitingLabel(since: Date, now: Date) {
  const waited = now.getTime() - since.getTime();
  if (waited < MINUTE_MS) return 'waiting <1m';
  if (waited < HOUR_MS) return `waiting ${Math.floor(waited / MINUTE_MS)}m`;
  if (waited < DAY_MS) return `waiting ${Math.floor(waited / HOUR_MS)}h`;
  return `waiting ${Math.floor(waited / DAY_MS)}d`;
}

// Exact ties keep the order they came in.
export function orderQueue<T extends QueueTicket>(tickets: readonly T[]): T[] {
  return tickets.toSorted(
    (a, b) =>
      Number(isUnresolved(b.status)) - Number(isUnresolved(a.status)) ||
      priorityRank(a) - priorityRank(b) ||
      a.waitingSince.getTime() - b.waitingSince.getTime(),
  );
}
