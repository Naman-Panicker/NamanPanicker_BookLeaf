'use client';

import {
  type AuthorTicket,
  GENERAL_ACCOUNT_LEVEL_LABEL,
  type Message,
  type Role,
  type TicketEvent,
} from '@bookleaf/shared';
import Link from 'next/link';
import { notFound, useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { MessageEditor } from '@/components/message-editor';
import { TicketStatusBadge } from '@/components/ticket-status-badge';
import { TicketThread } from '@/components/ticket-thread';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  actionErrorMessage,
  ApiRequestError,
  confirmResolution,
  getTicket,
  getTicketEvents,
  getTicketMessages,
} from '@/lib/api';

type Thread = { ticket: AuthorTicket; messages: Message[]; events: TicketEvent[] };

function nameOf(side: Role) {
  return side === 'AUTHOR' ? 'You' : 'BookLeaf';
}

export default function TicketThreadPage() {
  const { ticketId } = useParams<{ ticketId: string }>();
  const [thread, setThread] = useState<Thread | null>(null);
  const [missing, setMissing] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  // Going up reloads the thread, until live updates arrive.
  const [version, setVersion] = useState(0);

  useEffect(() => {
    // A slow answer must not overwrite the one from a later reload.
    let superseded = false;
    Promise.all([getTicket(ticketId), getTicketMessages(ticketId), getTicketEvents(ticketId)]).then(
      ([ticket, messages, events]) => {
        if (!superseded) setThread({ ticket, messages, events });
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
  if (!thread) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  const { ticket, messages, events } = thread;
  const reload = () => setVersion((current) => current + 1);
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <Link href="/tickets" className="text-sm underline underline-offset-4">
        Back to My Tickets
      </Link>
      <div className="flex flex-col gap-2">
        <p className="text-sm text-muted-foreground">
          {ticket.reference} · {ticket.book?.title ?? GENERAL_ACCOUNT_LEVEL_LABEL}
        </p>
        <h1 className="text-xl font-semibold break-words">{ticket.subject}</h1>
        <TicketStatusBadge status={ticket.status} />
      </div>
      <TicketThread messages={messages} events={events} nameOf={nameOf} />
      {ticket.status === 'CLOSED' ? (
        <ClosedHint />
      ) : (
        <>
          {ticket.status === 'RESOLVED' && <ConfirmResolution ticketId={ticket.id} onChanged={reload} />}
          <MessageEditor ticketId={ticket.id} label="Reply" onChanged={reload} />
        </>
      )}
    </div>
  );
}

function ClosedHint() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>This Ticket is Closed</CardTitle>
        <CardDescription>
          Still need help?{' '}
          <Link href="/tickets/new" className="underline underline-offset-4">
            Raise a new Ticket
          </Link>{' '}
          and we&apos;ll pick it up from there.
        </CardDescription>
      </CardHeader>
    </Card>
  );
}

function ConfirmResolution({ ticketId, onChanged }: { ticketId: string; onChanged: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setError(null);
    setConfirming(true);
    try {
      await confirmResolution(ticketId);
      onChanged();
    } catch (failure) {
      setError(actionErrorMessage(failure));
      if (failure instanceof ApiRequestError && failure.code === 'CONFLICT') onChanged();
    } finally {
      setConfirming(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Has this been sorted out?</CardTitle>
        <CardDescription>
          BookLeaf has marked this Ticket Resolved. If the problem is still there, reply below and we&apos;ll reopen it.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <Button onClick={confirm} disabled={confirming} className="self-start">
          This solved my problem
        </Button>
      </CardContent>
    </Card>
  );
}
