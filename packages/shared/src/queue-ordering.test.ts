import { describe, expect, it } from 'vitest';
import { orderQueue, type QueueTicket, waitingLabel } from './queue-ordering';

function ticket(name: string, overrides: Partial<QueueTicket> = {}) {
  return {
    name,
    status: 'OPEN',
    category: 'GENERAL_INQUIRY',
    priority: 'MEDIUM',
    waitingSince: new Date('2026-01-10T10:00:00.000Z'),
    ...overrides,
  } satisfies QueueTicket & { name: string };
}

function namesInOrder(tickets: ReturnType<typeof ticket>[]) {
  return orderQueue(tickets).map(({ name }) => name);
}

describe('orderQueue', () => {
  it('puts the highest Priority first', () => {
    const order = namesInOrder([
      ticket('low', { priority: 'LOW' }),
      ticket('high', { priority: 'HIGH' }),
      ticket('critical', { priority: 'CRITICAL' }),
      ticket('medium', { priority: 'MEDIUM' }),
    ]);

    expect(order).toEqual(['critical', 'high', 'medium', 'low']);
  });

  it('ranks an Unclassified Ticket right after Critical and above High', () => {
    const order = namesInOrder([
      ticket('high', { priority: 'HIGH' }),
      ticket('unclassified', { category: null, priority: null }),
      ticket('critical', { priority: 'CRITICAL' }),
    ]);

    expect(order).toEqual(['critical', 'unclassified', 'high']);
  });

  it('treats a Ticket with a Priority but no Category as Unclassified', () => {
    const order = namesInOrder([
      ticket('high', { priority: 'HIGH' }),
      ticket('low without category', { category: null, priority: 'LOW' }),
    ]);

    expect(order).toEqual(['low without category', 'high']);
  });

  it('treats a Ticket with a Category but no Priority as Unclassified', () => {
    const order = namesInOrder([
      ticket('high', { priority: 'HIGH' }),
      ticket('category only', { category: 'ISBN_METADATA', priority: null }),
    ]);

    expect(order).toEqual(['category only', 'high']);
  });

  it('puts the Author who has waited longest first among equal Priorities', () => {
    const order = namesInOrder([
      ticket('newest', { waitingSince: new Date('2026-01-12T10:00:00.000Z') }),
      ticket('oldest', { waitingSince: new Date('2026-01-10T10:00:00.000Z') }),
      ticket('middle', { waitingSince: new Date('2026-01-11T10:00:00.000Z') }),
    ]);

    expect(order).toEqual(['oldest', 'middle', 'newest']);
  });

  it('puts unresolved Tickets above Resolved and Closed ones, whatever their Priority', () => {
    const order = namesInOrder([
      ticket('closed critical', { status: 'CLOSED', priority: 'CRITICAL' }),
      ticket('resolved critical', { status: 'RESOLVED', priority: 'CRITICAL' }),
      ticket('in progress low', { status: 'IN_PROGRESS', priority: 'LOW' }),
      ticket('open low', { status: 'OPEN', priority: 'LOW', waitingSince: new Date('2026-01-11T10:00:00.000Z') }),
    ]);

    expect(order).toEqual(['in progress low', 'open low', 'closed critical', 'resolved critical']);
  });

  it('orders Resolved and Closed Tickets by Priority and waiting time too', () => {
    const order = namesInOrder([
      ticket('closed low', { status: 'CLOSED', priority: 'LOW' }),
      ticket('resolved newer', { status: 'RESOLVED', priority: 'HIGH', waitingSince: new Date('2026-01-12') }),
      ticket('closed older', { status: 'CLOSED', priority: 'HIGH', waitingSince: new Date('2026-01-11') }),
    ]);

    expect(order).toEqual(['closed older', 'resolved newer', 'closed low']);
  });

  it('applies status, then Priority, then waiting time', () => {
    const order = namesInOrder([
      ticket('resolved critical oldest', {
        status: 'RESOLVED',
        priority: 'CRITICAL',
        waitingSince: new Date('2026-01-01'),
      }),
      ticket('low oldest', { priority: 'LOW', waitingSince: new Date('2026-01-02') }),
      ticket('high newer', { priority: 'HIGH', waitingSince: new Date('2026-01-09') }),
      ticket('high older', { priority: 'HIGH', waitingSince: new Date('2026-01-08') }),
    ]);

    expect(order).toEqual(['high older', 'high newer', 'low oldest', 'resolved critical oldest']);
  });

  it('keeps the given order for exact ties', () => {
    const order = namesInOrder([ticket('first'), ticket('second'), ticket('third')]);

    expect(order).toEqual(['first', 'second', 'third']);
  });

  it('leaves the given list untouched', () => {
    const tickets = [ticket('low', { priority: 'LOW' }), ticket('high', { priority: 'HIGH' })];

    orderQueue(tickets);

    expect(tickets.map(({ name }) => name)).toEqual(['low', 'high']);
  });
});

describe('waitingLabel', () => {
  const NOW = new Date('2026-01-15T10:00:00.000Z');

  it.each([
    ['2026-01-15T09:59:30.000Z', 'waiting <1m'],
    ['2026-01-15T09:59:00.000Z', 'waiting 1m'],
    ['2026-01-15T09:00:01.000Z', 'waiting 59m'],
    ['2026-01-15T09:00:00.000Z', 'waiting 1h'],
    ['2026-01-14T10:00:01.000Z', 'waiting 23h'],
    ['2026-01-14T10:00:00.000Z', 'waiting 1d'],
    ['2026-01-13T09:00:00.000Z', 'waiting 2d'],
    ['2025-11-16T10:00:00.000Z', 'waiting 60d'],
  ])('labels a wait since %s as "%s"', (since, label) => {
    expect(waitingLabel(new Date(since), NOW)).toBe(label);
  });

  it("doesn't go negative when the browser's clock is behind the server's", () => {
    expect(waitingLabel(new Date('2026-01-15T10:05:00.000Z'), NOW)).toBe('waiting <1m');
  });
});
