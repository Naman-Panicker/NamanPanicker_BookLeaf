import { PRIORITY_LABELS, type Priority } from '@bookleaf/shared';
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
