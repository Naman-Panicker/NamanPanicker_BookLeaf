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

const PRIORITY_VARIANTS = {
  CRITICAL: 'destructive',
  HIGH: 'default',
  MEDIUM: 'secondary',
  LOW: 'outline',
} as const satisfies Record<Priority, string>;

export function PriorityBadge({ priority }: { priority: Priority }) {
  return <Badge variant={PRIORITY_VARIANTS[priority]}>{PRIORITY_LABELS[priority]}</Badge>;
}

export function UnclassifiedBadge() {
  return (
    <Badge variant="outline" className="border-amber-500 text-amber-700 dark:text-amber-400">
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
