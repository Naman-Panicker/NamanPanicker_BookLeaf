'use client';

import {
  addInternalNoteRequestSchema,
  type AdminQueueTicket,
  type AdminWorkspaceResponse,
  type Book,
  CATEGORY_LABELS,
  categorySchema,
  type ClassificationSource,
  GENERAL_ACCOUNT_LEVEL_LABEL,
  type InternalNote,
  isPublished,
  isUnclassified,
  MAX_CLASSIFICATION_ATTEMPTS,
  type Message,
  PAYOUT_THRESHOLD,
  PRIORITY_LABELS,
  prioritySchema,
  PRODUCTION_STAGE_LABELS,
  type RoyaltySummary,
  TICKET_STATUS_LABELS,
  type TicketEvent,
  type TicketStatus,
  ticketStatusSchema,
} from '@bookleaf/shared';
import Link from 'next/link';
import { notFound, useParams } from 'next/navigation';
import { type FormEvent, useEffect, useState } from 'react';
import { Figure } from '@/components/figure';
import { DraftEditor } from '@/components/draft-editor';
import { TicketStatusBadge } from '@/components/ticket-status-badge';
import { INTERNAL_PANEL_CLASS, InternalLabel, TicketThread } from '@/components/ticket-thread';
import { CategoryTriage, PriorityTriage } from '@/components/triage-badges';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Loading } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import {
  actionErrorMessage,
  addInternalNote,
  ApiRequestError,
  getAdminWorkspace,
  getInternalNotes,
  getTicketEvents,
  getTicketMessages,
  retryClassification,
  setTicketCategory,
  setTicketPriority,
  setTicketStatus,
} from '@/lib/api';
import { formatCount, formatDate, formatDay, formatRupees } from '@/lib/format';

type Workspace = AdminWorkspaceResponse & {
  messages: Message[];
  events: TicketEvent[];
  notes: InternalNote[];
  loadedVersion: number;
};

export default function AdminTicketPage() {
  const { ticketId } = useParams<{ ticketId: string }>();
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [missing, setMissing] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  // Going up reloads the workspace, until live updates arrive.
  const [version, setVersion] = useState(0);

  useEffect(() => {
    // A slow answer must not overwrite the one from a later reload.
    let superseded = false;
    Promise.all([
      getAdminWorkspace(ticketId),
      getTicketMessages(ticketId),
      getTicketEvents(ticketId),
      getInternalNotes(ticketId),
    ]).then(
      ([facts, messages, events, notes]) => {
        if (!superseded) setWorkspace({ ...facts, messages, events, notes, loadedVersion: version });
      },
      (error: unknown) => {
        if (superseded) return;
        if (error instanceof ApiRequestError && error.status === 404) setMissing(true);
        else setLoadFailed(true);
      },
    );
    return () => {
      superseded = true;
    };
  }, [ticketId, version]);

  if (missing) notFound();
  if (loadFailed) {
    return <p className="text-sm text-destructive">Could not load this Ticket. Please reload the page.</p>;
  }
  if (!workspace) {
    return <Loading label="Loading this Ticket…" />;
  }

  const { ticket, book, royalty, messages, events, notes, loadedVersion } = workspace;
  const updating = loadedVersion !== version;
  const reload = () => setVersion((current) => current + 1);
  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6">
      <Link href="/admin" className="text-sm text-link underline underline-offset-4">
        Back to the queue
      </Link>
      <div className="flex flex-col gap-2">
        <p className="text-sm break-words text-muted-foreground">
          {ticket.reference} · {ticket.author.name} · {ticket.book?.title ?? GENERAL_ACCOUNT_LEVEL_LABEL} · raised{' '}
          {formatDay(ticket.createdAt)}
        </p>
        <h1 className="break-words">{ticket.subject}</h1>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <TicketStatusBadge status={ticket.status} />
          <PriorityTriage ticket={ticket} />
          {/* While both are missing, one Unclassified badge says it all. */}
          {(ticket.category || ticket.priority) && <CategoryTriage ticket={ticket} />}
          <span className="text-muted-foreground">{ticket.assignee?.name ?? 'Unassigned'}</span>
        </div>
      </div>
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex min-w-0 flex-col gap-6">
          <TicketThread
            messages={messages}
            events={events}
            notes={notes}
            nameOf={(side) => (side === 'AUTHOR' ? ticket.author.name : 'BookLeaf')}
          />
          {updating && <Loading label="Updating…" />}
          {ticket.status === 'CLOSED' ? (
            <p className="rounded-md bg-muted p-3 text-sm">
              This Ticket is Closed, so it can&apos;t take new Messages. Set another status to reopen it.
            </p>
          ) : (
            <DraftEditor key={ticket.id} ticketId={ticket.id} onChanged={reload} />
          )}
          <InternalNoteBox key={`note-${ticket.id}`} ticketId={ticket.id} onChanged={reload} />
        </div>
        <aside className="flex flex-col gap-6">
          <StatusControls ticketId={ticket.id} status={ticket.status} updating={updating} onChanged={reload} />
          <TriageControls ticket={ticket} updating={updating} onChanged={reload} />
          <BookCard book={book} />
          <RoyaltyCard royalty={royalty} />
        </aside>
      </div>
    </div>
  );
}

// For the sidebar's controls: runs a change, then reloads the workspace to show it.
function useTicketChange(onChanged: () => void) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(change: () => Promise<unknown>) {
    setError(null);
    setSaving(true);
    try {
      await change();
      onChanged();
    } catch (failure) {
      setError(actionErrorMessage(failure));
      if (failure instanceof ApiRequestError && failure.code === 'CONFLICT') onChanged();
    } finally {
      setSaving(false);
    }
  }

  return { saving, error, run };
}

const NOTE_FIELD_ID = 'internal-note-body';

function InternalNoteBox({ ticketId, onChanged }: { ticketId: string; onChanged: () => void }) {
  const { saving, error, run } = useTicketChange(onChanged);
  const [body, setBody] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);
  const shownError = validationError ?? error;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = addInternalNoteRequestSchema.safeParse({ body });
    if (!parsed.success) {
      setValidationError(parsed.error.issues[0]?.message ?? null);
      return;
    }
    setValidationError(null);
    void run(async () => {
      await addInternalNote(ticketId, parsed.data);
      setBody('');
    });
  }

  return (
    <form onSubmit={handleSubmit} noValidate className={INTERNAL_PANEL_CLASS}>
      <Label htmlFor={NOTE_FIELD_ID}>Internal Note</Label>
      <InternalLabel />
      <Textarea
        id={NOTE_FIELD_ID}
        rows={3}
        className="bg-background"
        value={body}
        onChange={(event) => setBody(event.target.value)}
        aria-invalid={shownError ? true : undefined}
        aria-describedby={shownError ? `${NOTE_FIELD_ID}-error` : undefined}
      />
      {shownError && (
        <p id={`${NOTE_FIELD_ID}-error`} role="alert" className="text-sm text-destructive">
          {shownError}
        </p>
      )}
      <div>
        <Button type="submit" variant="outline" pending={saving}>
          {saving ? 'Adding…' : 'Add Internal Note'}
        </Button>
      </div>
    </form>
  );
}

function StatusControls({
  ticketId,
  status,
  updating,
  onChanged,
}: {
  ticketId: string;
  status: TicketStatus;
  updating: boolean;
  onChanged: () => void;
}) {
  const { saving, error, run } = useTicketChange(onChanged);
  // Which control started the change, so that only its spinner shows.
  const [source, setSource] = useState<'RESOLVE' | 'CLOSE' | 'MENU' | null>(null);
  const change = (next: TicketStatus, from: 'RESOLVE' | 'CLOSE' | 'MENU') => {
    setSource(from);
    return run(() => setTicketStatus(ticketId, { status: next }));
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Ticket Status</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          {status !== 'RESOLVED' && status !== 'CLOSED' && (
            <Button
              size="sm"
              disabled={saving || updating}
              pending={saving && source === 'RESOLVE'}
              onClick={() => change('RESOLVED', 'RESOLVE')}
            >
              Mark Resolved
            </Button>
          )}
          {status !== 'CLOSED' && (
            <Button
              size="sm"
              variant="outline"
              disabled={saving || updating}
              pending={saving && source === 'CLOSE'}
              onClick={() => change('CLOSED', 'CLOSE')}
            >
              Close
            </Button>
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ticket-status" className="text-xs text-muted-foreground">
            Set status
          </Label>
          <NativeSelect
            id="ticket-status"
            className="w-full"
            value={status}
            disabled={saving || updating}
            onChange={(event) => change(ticketStatusSchema.parse(event.target.value), 'MENU')}
          >
            {ticketStatusSchema.options.map((option) => (
              <NativeSelectOption key={option} value={option}>
                {TICKET_STATUS_LABELS[option]}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
        {saving && source === 'MENU' && <Loading label="Saving…" />}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function TriageControls({
  ticket,
  updating,
  onChanged,
}: {
  ticket: AdminQueueTicket;
  updating: boolean;
  onChanged: () => void;
}) {
  const { saving, error, run } = useTicketChange(onChanged);
  // Which control started the change, so that only its spinner shows.
  const [source, setSource] = useState<'RETRY' | 'FIELD' | null>(null);
  const change = (from: 'RETRY' | 'FIELD', request: () => Promise<unknown>) => {
    setSource(from);
    return run(request);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Triage</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {isUnclassified(ticket) && (
          <div className="flex flex-col items-start gap-2 rounded-md bg-note p-3 text-sm">
            <UnclassifiedNotice ticket={ticket} />
            <Button
              size="sm"
              variant="outline"
              disabled={saving || updating}
              pending={saving && source === 'RETRY'}
              onClick={() => change('RETRY', () => retryClassification(ticket.id))}
            >
              Retry AI
            </Button>
          </div>
        )}
        <TriageField
          id="ticket-category"
          label="Category"
          value={ticket.category}
          options={categorySchema.options}
          labels={CATEGORY_LABELS}
          source={ticket.categorySource}
          suggested={ticket.suggestedCategory}
          disabled={saving || updating}
          onChange={(value) => change('FIELD', () => setTicketCategory(ticket.id, { category: categorySchema.parse(value) }))}
        />
        <TriageField
          id="ticket-priority"
          label="Priority"
          value={ticket.priority}
          options={prioritySchema.options}
          labels={PRIORITY_LABELS}
          source={ticket.prioritySource}
          suggested={ticket.suggestedPriority}
          disabled={saving || updating}
          onChange={(value) => change('FIELD', () => setTicketPriority(ticket.id, { priority: prioritySchema.parse(value) }))}
        />
        {saving && source === 'FIELD' && <Loading label="Saving…" />}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function UnclassifiedNotice({ ticket }: { ticket: AdminQueueTicket }) {
  if (ticket.classificationAttempts < MAX_CLASSIFICATION_ATTEMPTS) {
    return <p>The AI hasn&apos;t classified this Ticket yet. Reload to see its result, or classify it by hand.</p>;
  }
  return (
    <>
      <p>The AI couldn&apos;t classify this Ticket, so it needs classifying by hand or another try.</p>
      {ticket.classificationError && (
        <p className="text-xs break-words text-muted-foreground">Last error: {ticket.classificationError}</p>
      )}
    </>
  );
}

function TriageField<T extends string>({
  id,
  label,
  value,
  options,
  labels,
  source,
  suggested,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  value: T | null;
  options: readonly T[];
  labels: Record<T, string>;
  source: ClassificationSource | null;
  suggested: T | null;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </Label>
      <NativeSelect
        id={id}
        className="w-full"
        value={value ?? ''}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      >
        {/* Only a Ticket with no value yet needs this, and choosing it means nothing, so it can't be chosen. */}
        {value === null && (
          <NativeSelectOption value="" disabled>
            Choose…
          </NativeSelectOption>
        )}
        {options.map((option) => (
          <NativeSelectOption key={option} value={option}>
            {labels[option]}
          </NativeSelectOption>
        ))}
      </NativeSelect>
      {source === 'ADMIN' && suggested && suggested !== value && (
        <p className="text-xs text-muted-foreground">The AI suggested {labels[suggested]}.</p>
      )}
    </div>
  );
}

function BookCard({ book }: { book: Book | null }) {
  if (!book) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{GENERAL_ACCOUNT_LEVEL_LABEL}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">This Ticket isn&apos;t about a specific Book.</p>
        </CardContent>
      </Card>
    );
  }

  const neverPaid = isPublished(book.productionStage) && book.lastPayoutDate === null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="break-words">{book.title}</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <Figure label="Production Stage" value={PRODUCTION_STAGE_LABELS[book.productionStage]} />
          <Figure label="Genre" value={book.genre} />
          <Figure label="ISBN" value={book.isbn} />
          <Figure label="Publication date" value={formatDate(book.publicationDate)} />
          <Figure label="MRP" value={formatRupees(book.mrp)} />
          <Figure label="Royalty per copy" value={formatRupees(book.royaltyPerCopy)} />
          <Figure label="Copies sold" value={formatCount(book.copiesSold)} />
          <Figure label="Royalty earned" value={formatRupees(book.royaltyEarned)} />
          <Figure label="Royalty paid" value={formatRupees(book.royaltyPaid)} />
          <Figure label="Pending Royalty" value={formatRupees(book.royaltyPending)} />
          <Figure label="Last Payout" value={neverPaid ? 'Never paid' : formatDate(book.lastPayoutDate)} />
          <Figure label="Print partner" value={book.printPartner ?? '—'} />
          <Figure label="Available on" value={book.availableOn.join(', ') || '—'} />
        </dl>
      </CardContent>
    </Card>
  );
}

function RoyaltyCard({ royalty }: { royalty: RoyaltySummary }) {
  // With no published Book the totals are null, and a Payout isn't something that could have happened yet.
  const neverPaid = royalty.totalEarned !== null && royalty.lastPayoutDate === null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Author&apos;s royalties</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <Figure label="Total earned" value={formatRupees(royalty.totalEarned)} />
          <Figure label="Total paid" value={formatRupees(royalty.totalPaid)} />
          <Figure label="Pending Royalty" value={formatRupees(royalty.totalPending)} />
          <Figure label="Last Payout" value={neverPaid ? 'Never paid' : formatDate(royalty.lastPayoutDate)} />
          <Figure label="Next Payout Date" value={formatDate(royalty.nextPayoutDate)} />
        </dl>
        {royalty.belowThreshold && (
          <p className="rounded-md bg-muted p-3 text-sm">
            Below the {formatRupees(PAYOUT_THRESHOLD)} Payout Threshold, so it rolls over to next quarter.
          </p>
        )}
        {royalty.overdue && (
          <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            Overdue: the last Payout window closed without a Payout.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
