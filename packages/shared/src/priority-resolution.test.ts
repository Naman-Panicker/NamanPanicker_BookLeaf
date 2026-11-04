import { describe, expect, it } from 'vitest';
import { resolvePriority } from './priority-resolution';
import { categorySchema, type Priority, prioritySchema } from './tickets';

const neutral = { category: 'GENERAL_INQUIRY', overdue: false, adminOverride: null } as const;

describe('with no Priority Floor in play', () => {
  it.each(prioritySchema.options)("keeps the AI's %s", (aiPriority) => {
    expect(resolvePriority({ ...neutral, aiPriority })).toEqual({ priority: aiPriority, floor: null });
  });

  it('has no Priority when the AI has not given one', () => {
    expect(resolvePriority({ ...neutral, aiPriority: null })).toEqual({ priority: null, floor: null });
  });

  it.each(categorySchema.options.filter((category) => category !== 'ISBN_METADATA'))(
    'applies no Floor to %s when the Author is not Overdue',
    (category) => {
      expect(resolvePriority({ ...neutral, category, aiPriority: 'LOW' })).toEqual({ priority: 'LOW', floor: null });
    },
  );

  it.each(categorySchema.options.filter((category) => category !== 'ISBN_METADATA' && category !== 'ROYALTY_PAYMENTS'))(
    'applies no Floor to %s from an Overdue Author, because only royalty Tickets get it',
    (category) => {
      expect(resolvePriority({ ...neutral, category, overdue: true, aiPriority: 'LOW' })).toEqual({
        priority: 'LOW',
        floor: null,
      });
    },
  );
});

describe.each([
  ['ISBN & Metadata', { category: 'ISBN_METADATA', overdue: false }, 'ISBN_METADATA'],
  ['ISBN & Metadata from an Overdue Author', { category: 'ISBN_METADATA', overdue: true }, 'ISBN_METADATA'],
  ['Royalty & Payments from an Overdue Author', { category: 'ROYALTY_PAYMENTS', overdue: true }, 'OVERDUE_ROYALTY'],
] as const)('the Floor on %s', (_name, ticket, floor) => {
  it.each(['LOW', 'MEDIUM'] as const)('raises the AI\'s %s to High and says which Floor did it', (aiPriority) => {
    expect(resolvePriority({ ...ticket, aiPriority, adminOverride: null })).toEqual({ priority: 'HIGH', floor });
  });

  it.each(['HIGH', 'CRITICAL'] as const)('leaves the AI\'s %s alone, because a Floor only raises', (aiPriority) => {
    expect(resolvePriority({ ...ticket, aiPriority, adminOverride: null })).toEqual({ priority: aiPriority, floor: null });
  });

  it.each(prioritySchema.options)('gives way to an Admin override of %s', (adminOverride: Priority) => {
    expect(resolvePriority({ ...ticket, aiPriority: 'MEDIUM', adminOverride })).toEqual({
      priority: adminOverride,
      floor: null,
    });
  });
});

it('keeps an Admin override when the AI has not given a Priority', () => {
  expect(resolvePriority({ ...neutral, aiPriority: null, adminOverride: 'LOW' })).toEqual({
    priority: 'LOW',
    floor: null,
  });
});

it('sets no Priority from a Floor alone, because a Floor only raises what the AI gave', () => {
  expect(resolvePriority({ ...neutral, category: 'ISBN_METADATA', aiPriority: null })).toEqual({
    priority: null,
    floor: null,
  });
});

it('applies no Floor before the Ticket has a Category', () => {
  expect(resolvePriority({ category: null, overdue: true, aiPriority: 'LOW', adminOverride: null })).toEqual({
    priority: 'LOW',
    floor: null,
  });
});
