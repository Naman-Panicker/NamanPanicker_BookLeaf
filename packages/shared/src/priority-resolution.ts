import type { Category, Priority, PriorityFloor } from './tickets';

export type PriorityInputs = {
  aiPriority: Priority | null;
  // Null until the Ticket has a Category.
  category: Category | null;
  // Whether the Author is Overdue.
  overdue: boolean;
  adminOverride: Priority | null;
};

export type ResolvedPriority = {
  priority: Priority | null;
  // Set only when a Floor actually raised the Priority.
  floor: PriorityFloor | null;
};

function floorFor(category: Category | null, overdue: boolean): PriorityFloor | null {
  if (category === 'ISBN_METADATA') return 'ISBN_METADATA';
  if (category === 'ROYALTY_PAYMENTS' && overdue) return 'OVERDUE_ROYALTY';
  return null;
}

export function resolvePriority({ aiPriority, category, overdue, adminOverride }: PriorityInputs): ResolvedPriority {
  if (adminOverride) return { priority: adminOverride, floor: null };

  const floor = floorFor(category, overdue);
  // Both Floors stand at High, so only the two Priorities below it can be raised.
  if (floor && (aiPriority === 'MEDIUM' || aiPriority === 'LOW')) return { priority: 'HIGH', floor };
  return { priority: aiPriority, floor: null };
}
