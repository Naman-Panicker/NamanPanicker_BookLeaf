'use client';

import {
  type AdminQueueTicket,
  ALL_STATUSES,
  CATEGORY_LABELS,
  categorySchema,
  GENERAL_ACCOUNT_LEVEL_LABEL,
  isUnclassified,
  isUnresolved,
  PRIORITY_LABELS,
  prioritySchema,
  TICKET_STATUS_LABELS,
  ticketStatusSchema,
  waitingLabel,
} from '@bookleaf/shared';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { type ReactNode, Suspense, useCallback } from 'react';
import { TicketStatusBadge } from '@/components/ticket-status-badge';
import { CategoryTriage, PriorityTriage } from '@/components/triage-badges';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Loading } from '@/components/ui/spinner';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { type QueueFilters, readQueueFilters, toQueueQuery } from '@/lib/admin-queue-filters';
import { getAdminQueue } from '@/lib/api';
import { formatDay } from '@/lib/format';
import { useLiveData } from '@/lib/use-live-data';
import { cn } from '@/lib/utils';

const QUEUE_PATH = '/admin';

// The moment it loaded is what the wait badges count up to.
type LoadedQueue = { tickets: AdminQueueTicket[]; loadedAt: Date; search: string };

export default function AdminQueuePage() {
  return (
    <Suspense fallback={<Loading label="Loading the queue…" />}>
      <AdminQueue />
    </Suspense>
  );
}

function AdminQueue() {
  const router = useRouter();
  const search = useSearchParams().toString();
  const filters = readQueueFilters(new URLSearchParams(search));
  // Counts what was understood, so a mangled URL doesn't claim that filters hid everything.
  const hasFilters = Object.values(filters).some((value) => value !== undefined);
  const load = useCallback(async (): Promise<LoadedQueue> => {
    const tickets = await getAdminQueue(toQueueQuery(readQueueFilters(new URLSearchParams(search))));
    return { tickets, loadedAt: new Date(), search };
  }, [search]);
  const { data: queue, loadFailed } = useLiveData(load);

  function changeFilter(name: keyof QueueFilters, value: string) {
    const next = new URLSearchParams(search);
    if (value) next.set(name, value);
    else next.delete(name);
    router.replace(next.size > 0 ? `${QUEUE_PATH}?${next.toString()}` : QUEUE_PATH, { scroll: false });
  }

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6">
      <div className="flex items-center gap-4">
        <h1>Ticket queue</h1>
        {queue && !loadFailed && queue.search !== search && <Loading label="Updating…" />}
      </div>
      <FilterBar filters={filters} hasFilters={hasFilters} onChange={changeFilter} />
      <QueueResults queue={queue} loadFailed={loadFailed} hasFilters={hasFilters} stale={queue?.search !== search} />
    </div>
  );
}

function QueueResults({
  queue,
  loadFailed,
  hasFilters,
  stale,
}: {
  queue: LoadedQueue | null;
  loadFailed: boolean;
  hasFilters: boolean;
  // These results are for filters that have since changed.
  stale: boolean;
}) {
  if (loadFailed) {
    return <p className="text-sm text-destructive">Could not load the queue. Please reload the page.</p>;
  }
  if (!queue) {
    return <Loading label="Loading the queue…" />;
  }
  return (
    <div className={cn('transition-opacity', stale && 'opacity-50')}>
      {queue.tickets.length === 0 ? <EmptyState hasFilters={hasFilters} /> : <QueueTable queue={queue} />}
    </div>
  );
}

function FilterField({ label, htmlFor, children }: { label: string; htmlFor: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={htmlFor} className="text-xs text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  );
}

function FilterBar({
  filters,
  hasFilters,
  onChange,
}: {
  filters: QueueFilters;
  hasFilters: boolean;
  onChange: (name: keyof QueueFilters, value: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-end gap-4">
      <FilterField label="Ticket Status" htmlFor="filter-status">
        <NativeSelect
          id="filter-status"
          value={filters.status ?? ''}
          onChange={(event) => onChange('status', event.target.value)}
        >
          <NativeSelectOption value="">Not Resolved or Closed</NativeSelectOption>
          {ticketStatusSchema.options.map((status) => (
            <NativeSelectOption key={status} value={status}>
              {TICKET_STATUS_LABELS[status]}
            </NativeSelectOption>
          ))}
          <NativeSelectOption value={ALL_STATUSES}>All</NativeSelectOption>
        </NativeSelect>
      </FilterField>
      <FilterField label="Category" htmlFor="filter-category">
        <NativeSelect
          id="filter-category"
          value={filters.category ?? ''}
          onChange={(event) => onChange('category', event.target.value)}
        >
          <NativeSelectOption value="">All</NativeSelectOption>
          {categorySchema.options.map((category) => (
            <NativeSelectOption key={category} value={category}>
              {CATEGORY_LABELS[category]}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </FilterField>
      <FilterField label="Priority" htmlFor="filter-priority">
        <NativeSelect
          id="filter-priority"
          value={filters.priority ?? ''}
          onChange={(event) => onChange('priority', event.target.value)}
        >
          <NativeSelectOption value="">All</NativeSelectOption>
          {prioritySchema.options.map((priority) => (
            <NativeSelectOption key={priority} value={priority}>
              {PRIORITY_LABELS[priority]}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </FilterField>
      <FilterField label="Raised from" htmlFor="filter-from">
        <Input
          id="filter-from"
          type="date"
          className="w-40"
          value={filters.from ?? ''}
          onChange={(event) => onChange('from', event.target.value)}
        />
      </FilterField>
      <FilterField label="Raised to" htmlFor="filter-to">
        <Input
          id="filter-to"
          type="date"
          className="w-40"
          value={filters.to ?? ''}
          onChange={(event) => onChange('to', event.target.value)}
        />
      </FilterField>
      <Label className="h-8 cursor-pointer text-sm font-normal">
        <input
          type="checkbox"
          className="size-4 accent-primary"
          checked={filters.mine === 'true'}
          onChange={(event) => onChange('mine', event.target.checked ? 'true' : '')}
        />
        Assigned to me
      </Label>
      {hasFilters && (
        <Link href={QUEUE_PATH} className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
          Clear filters
        </Link>
      )}
    </div>
  );
}

function EmptyState({ hasFilters }: { hasFilters: boolean }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{hasFilters ? 'No Tickets match these filters' : 'The queue is clear'}</CardTitle>
        <CardDescription>
          {hasFilters
            ? 'Try removing a filter, or widening the dates.'
            : 'Every Ticket is Resolved or Closed. New Tickets will show up here.'}
        </CardDescription>
      </CardHeader>
    </Card>
  );
}

function QueueTable({ queue: { tickets, loadedAt } }: { queue: LoadedQueue }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Ticket</TableHead>
          <TableHead>Waiting</TableHead>
          <TableHead>Category</TableHead>
          <TableHead>Priority</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Assignee</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {tickets.map((ticket) => (
          <QueueRow key={ticket.id} ticket={ticket} loadedAt={loadedAt} />
        ))}
      </TableBody>
    </Table>
  );
}

function QueueRow({ ticket, loadedAt }: { ticket: AdminQueueTicket; loadedAt: Date }) {
  return (
    <TableRow className={cn(isUnclassified(ticket) && 'bg-note hover:bg-note')}>
      <TableCell className="max-w-md whitespace-normal">
        <Link href={`/admin/tickets/${ticket.id}`} className="font-medium break-words text-link underline underline-offset-4">
          {ticket.subject}
        </Link>
        <p className="mt-1 text-xs break-words text-muted-foreground">
          {ticket.reference} · {ticket.author.name} · {ticket.book?.title ?? GENERAL_ACCOUNT_LEVEL_LABEL} · raised{' '}
          {formatDay(ticket.createdAt)}
        </p>
      </TableCell>
      <TableCell>
        <WaitingCell ticket={ticket} loadedAt={loadedAt} />
      </TableCell>
      <TableCell className="whitespace-normal">
        <CategoryTriage ticket={ticket} />
      </TableCell>
      <TableCell className="whitespace-normal">
        <PriorityTriage ticket={ticket} />
      </TableCell>
      <TableCell>
        <TicketStatusBadge status={ticket.status} />
      </TableCell>
      <TableCell>{ticket.assignee?.name ?? <span className="text-muted-foreground">Unassigned</span>}</TableCell>
    </TableRow>
  );
}

// Nobody is waiting on a Resolved or Closed Ticket, so its age would only mislead.
function WaitingCell({ ticket, loadedAt }: { ticket: AdminQueueTicket; loadedAt: Date }) {
  if (!isUnresolved(ticket.status)) return <span className="text-muted-foreground">—</span>;
  return (
    <div className="flex flex-col gap-0.5">
      {ticket.awaitingAdmin && <span className="font-bold">Awaiting Admin</span>}
      <span className={cn(!ticket.awaitingAdmin && 'text-muted-foreground')}>
        {waitingLabel(new Date(ticket.waitingSince), loadedAt)}
      </span>
    </div>
  );
}
