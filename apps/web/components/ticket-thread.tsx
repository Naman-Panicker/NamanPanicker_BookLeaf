import type { Message, Role, TicketEvent } from '@bookleaf/shared';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatDateTime } from '@/lib/format';

type Entry = { type: 'message'; message: Message } | { type: 'event'; event: TicketEvent };

function entryTime(entry: Entry) {
  return entry.type === 'message' ? entry.message.createdAt : entry.event.createdAt;
}

// Status changes only, for both sides. The Admin timeline (ticket 10) will show the other kinds.
// A Message and the change it caused share a moment, and the sort is stable, so listing Messages
// first makes the Message read first.
function mergeEntries(messages: Message[], events: TicketEvent[]) {
  const entries: Entry[] = [
    ...messages.map((message) => ({ type: 'message' as const, message })),
    ...events.filter(({ kind }) => kind === 'STATUS_CHANGED').map((event) => ({ type: 'event' as const, event })),
  ];
  return entries.toSorted((a, b) => entryTime(a).localeCompare(entryTime(b)));
}

function statusChangeText({ before, after }: TicketEvent) {
  if (after === 'CLOSED') return 'closed this Ticket';
  if (after === 'RESOLVED') return 'marked this Ticket Resolved';
  if (before === 'RESOLVED' || before === 'CLOSED') return 'reopened this Ticket';
  if (after === 'IN_PROGRESS') return 'moved this Ticket to In Progress';
  return 'moved this Ticket back to Open';
}

type Props = {
  messages: Message[];
  events: TicketEvent[];
  // What to call each side, which depends on who is reading.
  nameOf: (side: Role) => string;
};

export function TicketThread({ messages, events, nameOf }: Props) {
  return (
    <ol className="flex flex-col gap-4">
      {mergeEntries(messages, events).map((entry) =>
        entry.type === 'message' ? (
          <li key={entry.message.id}>
            <MessageCard message={entry.message} sender={nameOf(entry.message.sender)} />
          </li>
        ) : (
          <li key={entry.event.id}>
            <StatusChange event={entry.event} actor={entry.event.actorName ?? nameOf(entry.event.actor)} />
          </li>
        ),
      )}
    </ol>
  );
}

function MessageCard({ message, sender }: { message: Message; sender: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
          {sender}
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

function StatusChange({ event, actor }: { event: TicketEvent; actor: string }) {
  return (
    <p className="text-center text-xs text-muted-foreground">
      {actor} {statusChangeText(event)} ·{' '}
      <time dateTime={event.createdAt}>{formatDateTime(event.createdAt)}</time>
    </p>
  );
}
