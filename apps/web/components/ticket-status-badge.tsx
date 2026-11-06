import { TICKET_STATUS_LABELS, type TicketStatus } from '@bookleaf/shared';
import { cn } from '@/lib/utils';

// Standard signal colours rather than the brand's, because these carry meaning.
const DOTS = {
  OPEN: 'bg-blue-600',
  IN_PROGRESS: 'bg-yellow-500',
  RESOLVED: 'bg-green-600',
  CLOSED: 'bg-gray-400',
} as const satisfies Record<TicketStatus, string>;

export function TicketStatusBadge({ status }: { status: TicketStatus }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-sm whitespace-nowrap">
      <span aria-hidden className={cn('size-2.5 rounded-full', DOTS[status])} />
      {TICKET_STATUS_LABELS[status]}
    </span>
  );
}
