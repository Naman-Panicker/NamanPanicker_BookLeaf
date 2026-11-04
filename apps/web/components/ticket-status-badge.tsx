import { TICKET_STATUS_LABELS, type TicketStatus } from '@bookleaf/shared';
import { Badge } from '@/components/ui/badge';

const VARIANTS = {
  OPEN: 'default',
  IN_PROGRESS: 'secondary',
  RESOLVED: 'outline',
  CLOSED: 'outline',
} as const satisfies Record<TicketStatus, string>;

export function TicketStatusBadge({ status }: { status: TicketStatus }) {
  return <Badge variant={VARIANTS[status]}>{TICKET_STATUS_LABELS[status]}</Badge>;
}
