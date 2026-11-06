import { describe, expect, it } from 'vitest';
import { nextTicketStatus } from './ticket-status';

describe('sending a Message', () => {
  it.each([
    ['OPEN', 'IN_PROGRESS'],
    ['IN_PROGRESS', 'IN_PROGRESS'],
    ['RESOLVED', 'RESOLVED'],
  ] as const)('an Admin Message on a Ticket that is %s leaves it %s', (status, next) => {
    expect(nextTicketStatus(status, 'ADMIN', { type: 'SEND_MESSAGE' })).toEqual({ ok: true, status: next });
  });

  it.each([
    ['OPEN', 'OPEN'],
    ['IN_PROGRESS', 'IN_PROGRESS'],
    ['RESOLVED', 'IN_PROGRESS'],
  ] as const)('an Author Message on a Ticket that is %s leaves it %s', (status, next) => {
    expect(nextTicketStatus(status, 'AUTHOR', { type: 'SEND_MESSAGE' })).toEqual({ ok: true, status: next });
  });

  it.each(['ADMIN', 'AUTHOR'] as const)('rejects a Message from an %s on a Closed Ticket', (role) => {
    expect(nextTicketStatus('CLOSED', role, { type: 'SEND_MESSAGE' })).toEqual({
      ok: false,
      rejection: 'TICKET_CLOSED',
    });
  });
});

describe('confirming a resolution', () => {
  it('lets the Author close a Resolved Ticket', () => {
    expect(nextTicketStatus('RESOLVED', 'AUTHOR', { type: 'CONFIRM_RESOLUTION' })).toEqual({
      ok: true,
      status: 'CLOSED',
    });
  });

  it.each(['OPEN', 'IN_PROGRESS', 'CLOSED'] as const)('rejects an Author confirming a Ticket that is %s', (status) => {
    expect(nextTicketStatus(status, 'AUTHOR', { type: 'CONFIRM_RESOLUTION' })).toEqual({
      ok: false,
      rejection: 'NOT_RESOLVED',
    });
  });

  it.each(['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'] as const)(
    'rejects an Admin confirming a Ticket that is %s, because only the Author can say it solved their problem',
    (status) => {
      expect(nextTicketStatus(status, 'ADMIN', { type: 'CONFIRM_RESOLUTION' })).toEqual({
        ok: false,
        rejection: 'ROLE_NOT_ALLOWED',
      });
    },
  );
});

describe('assigning a Ticket', () => {
  it.each([
    ['OPEN', 'IN_PROGRESS'],
    ['IN_PROGRESS', 'IN_PROGRESS'],
    ['RESOLVED', 'RESOLVED'],
    ['CLOSED', 'CLOSED'],
  ] as const)('assigning a Ticket that is %s leaves it %s', (status, next) => {
    expect(nextTicketStatus(status, 'ADMIN', { type: 'ASSIGN' })).toEqual({ ok: true, status: next });
  });

  it('rejects an Author', () => {
    expect(nextTicketStatus('OPEN', 'AUTHOR', { type: 'ASSIGN' })).toEqual({ ok: false, rejection: 'ROLE_NOT_ALLOWED' });
  });
});

describe('setting a status by hand', () => {
  const statuses = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'] as const;
  const everyPair = statuses.flatMap((from) => statuses.map((to) => [from, to] as const));

  it.each(everyPair)('lets an Admin move a Ticket from %s to %s', (from, to) => {
    expect(nextTicketStatus(from, 'ADMIN', { type: 'SET_STATUS', status: to })).toEqual({ ok: true, status: to });
  });

  it.each(everyPair)('rejects an Author moving a Ticket from %s to %s', (from, to) => {
    expect(nextTicketStatus(from, 'AUTHOR', { type: 'SET_STATUS', status: to })).toEqual({
      ok: false,
      rejection: 'ROLE_NOT_ALLOWED',
    });
  });
});
