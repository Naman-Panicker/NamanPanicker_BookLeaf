import { describe, expect, it } from 'vitest';
import { mergeTimeline } from './timeline';
import type { InternalNote, Message, TicketEvent } from './tickets';

const NOON = '2026-01-15T12:00:00.000Z';

function message(id: string, createdAt: string): Message {
  return { id, sender: 'AUTHOR', body: 'A Message', createdAt };
}

function event(id: string, createdAt: string): TicketEvent {
  return { id, kind: 'STATUS_CHANGED', actor: 'ADMIN', before: 'OPEN', after: 'IN_PROGRESS', createdAt };
}

function note(id: string, createdAt: string): InternalNote {
  return { id, adminName: 'Asha Rao', body: 'An Internal Note', createdAt };
}

function idsInOrder(entries: ReturnType<typeof mergeTimeline>) {
  return entries.map(({ item }) => item.id);
}

describe('mergeTimeline', () => {
  it('merges Messages, Ticket Events and Internal Notes by time, oldest first', () => {
    const entries = mergeTimeline({
      messages: [message('first', '2026-01-15T09:00:00.000Z'), message('fourth', '2026-01-15T15:00:00.000Z')],
      events: [event('third', '2026-01-15T11:00:00.000Z')],
      notes: [note('second', '2026-01-15T10:00:00.000Z')],
    });

    expect(idsInOrder(entries)).toEqual(['first', 'second', 'third', 'fourth']);
    expect(entries.map(({ type }) => type)).toEqual(['message', 'note', 'event', 'message']);
  });

  it('puts a Message before the status change it caused, and an Internal Note after both', () => {
    const entries = mergeTimeline({
      messages: [message('message', NOON)],
      events: [event('event', NOON)],
      notes: [note('note', NOON)],
    });

    expect(idsInOrder(entries)).toEqual(['message', 'event', 'note']);
  });

  it('keeps the order it was given for entries of one kind at the same moment', () => {
    const entries = mergeTimeline({ messages: [message('a', NOON), message('b', NOON)], events: [event('c', NOON), event('d', NOON)] });

    expect(idsInOrder(entries)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('has nothing to merge on an Author thread beyond Messages and Ticket Events', () => {
    const entries = mergeTimeline({ messages: [message('a', NOON)], events: [] });

    expect(entries).toEqual([{ type: 'message', item: message('a', NOON) }]);
  });
});
