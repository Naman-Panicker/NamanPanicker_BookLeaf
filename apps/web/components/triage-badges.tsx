import {
  type AdminQueueTicket,
  CATEGORY_LABELS,
  CLASSIFICATION_SOURCE_LABELS,
  type ClassificationSource,
  PRIORITY_FLOOR_LABELS,
  PRIORITY_LABELS,
  type Priority,
} from '@bookleaf/shared';
import { Badge } from '@/components/ui/badge';

// Standard signal colours rather than the brand's, because these carry meaning.
const PRIORITY_COLOURS = {
  CRITICAL: 'bg-red-600 text-white',
  HIGH: 'bg-orange-100 text-orange-800',
  MEDIUM: 'bg-yellow-100 text-yellow-800',
  LOW: 'bg-green-100 text-green-800',
} as const satisfies Record<Priority, string>;

export function PriorityBadge({ priority }: { priority: Priority }) {
  return <Badge className={PRIORITY_COLOURS[priority]}>{PRIORITY_LABELS[priority]}</Badge>;
}

export function UnclassifiedBadge() {
  return (
    <Badge variant="outline" className="border-amber-500 bg-amber-50 text-amber-800">
      Unclassified
    </Badge>
  );
}

function SourceBadge({ source }: { source: ClassificationSource | null }) {
  if (!source) return null;
  return (
    <Badge variant="ghost" className="text-muted-foreground">
      {CLASSIFICATION_SOURCE_LABELS[source]}
    </Badge>
  );
}

type TriageProps = { ticket: AdminQueueTicket };

export function CategoryTriage({ ticket }: TriageProps) {
  if (!ticket.category) return <UnclassifiedBadge />;
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {CATEGORY_LABELS[ticket.category]}
      <SourceBadge source={ticket.categorySource} />
    </span>
  );
}

export function PriorityTriage({ ticket }: TriageProps) {
  if (!ticket.priority) return <UnclassifiedBadge />;
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <PriorityBadge priority={ticket.priority} />
      <SourceBadge source={ticket.prioritySource} />
      {ticket.priorityFloor && (
        <span className="text-xs text-muted-foreground">raised: {PRIORITY_FLOOR_LABELS[ticket.priorityFloor]}</span>
      )}
    </span>
  );
}
