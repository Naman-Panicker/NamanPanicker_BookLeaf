'use client';

import { type AuthorTicket, GENERAL_ACCOUNT_LEVEL_LABEL, type Message } from '@bookleaf/shared';
import Link from 'next/link';
import { notFound, useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { TicketStatusBadge } from '@/components/ticket-status-badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ApiRequestError, getTicket, getTicketMessages } from '@/lib/api';
import { formatDateTime } from '@/lib/format';

type Thread = { ticket: AuthorTicket; messages: Message[] };

export default function TicketThreadPage() {
  const { ticketId } = useParams<{ ticketId: string }>();
  const [thread, setThread] = useState<Thread | null>(null);
  const [missing, setMissing] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    Promise.all([getTicket(ticketId), getTicketMessages(ticketId)]).then(
      ([ticket, messages]) => setThread({ ticket, messages }),
      (error: unknown) => {
        if (error instanceof ApiRequestError && error.status === 404) setMissing(true);
        else setLoadFailed(true);
      },
    );
  }, [ticketId]);

  if (missing) notFound();
  if (loadFailed) {
    return <p className="text-sm text-destructive">Could not load this Ticket. Please reload the page.</p>;
  }
  if (!thread) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  const { ticket, messages } = thread;
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
      <ol className="flex flex-col gap-4">
        {messages.map((message) => (
          <li key={message.id}>
            <MessageCard message={message} />
          </li>
        ))}
      </ol>
    </div>
  );
}

function MessageCard({ message }: { message: Message }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
          {message.sender === 'AUTHOR' ? 'You' : 'BookLeaf'}
          <time dateTime={message.createdAt} className="text-xs font-normal text-muted-foreground">
            {formatDateTime(message.createdAt)}
          </time>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm break-words whitespace-pre-wrap">{message.body}</p>
      </CardContent>
    </Card>
  );
}
