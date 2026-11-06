import type { InternalNote, Message, TicketEvent } from './tickets';

export type TimelineEntry =
  | { type: 'message'; item: Message }
  | { type: 'event'; item: TicketEvent }
  | { type: 'note'; item: InternalNote };

type TimelineParts = {
  messages: Message[];
  events: TicketEvent[];
  // Admins only, so an Author's thread has none to pass (ADR-0004).
  notes?: InternalNote[];
};

// A Message and the change it caused share a moment, and the sort is stable, so listing Messages
// first makes the Message read first.
export function mergeTimeline({ messages, events, notes = [] }: TimelineParts) {
  const entries: TimelineEntry[] = [
    ...messages.map((item) => ({ type: 'message' as const, item })),
    ...events.map((item) => ({ type: 'event' as const, item })),
    ...notes.map((item) => ({ type: 'note' as const, item })),
  ];
  return entries.toSorted((a, b) => a.item.createdAt.localeCompare(b.item.createdAt));
}
