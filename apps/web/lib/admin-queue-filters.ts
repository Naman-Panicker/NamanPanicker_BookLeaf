import { type AdminQueueQuery, adminQueueQuerySchema } from '@bookleaf/shared';
import { z } from 'zod';

// Filters live in the URL, so they survive opening a Ticket and coming back.
// A value someone has mangled by hand falls back to no filter, rather than breaking the page.
const queueFiltersSchema = z.object({
  status: adminQueueQuerySchema.shape.status.catch(undefined),
  category: adminQueueQuerySchema.shape.category.catch(undefined),
  priority: adminQueueQuerySchema.shape.priority.catch(undefined),
  from: z.iso.date().optional().catch(undefined),
  to: z.iso.date().optional().catch(undefined),
  mine: z.literal('true').optional().catch(undefined),
});
export type QueueFilters = z.infer<typeof queueFiltersSchema>;

export function readQueueFilters(params: URLSearchParams): QueueFilters {
  return queueFiltersSchema.parse(Object.fromEntries(params));
}

// A picked day means that whole day where the Admin is, so these have no "Z".
function startOfDay(date: string) {
  return new Date(`${date}T00:00:00`);
}

function startOfNextDay(date: string) {
  const next = startOfDay(date);
  next.setDate(next.getDate() + 1);
  return next;
}

export function toQueueQuery({ status, category, priority, from, to, mine }: QueueFilters): AdminQueueQuery {
  return {
    status,
    category,
    priority,
    createdFrom: from && startOfDay(from).toISOString(),
    createdBefore: to && startOfNextDay(to).toISOString(),
    assignedToMe: mine,
  };
}
