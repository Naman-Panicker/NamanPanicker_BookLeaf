import {
  CATEGORY_LABELS,
  categorySchema,
  type InternalNote,
  mergeTimeline,
  type Message,
  PRIORITY_LABELS,
  prioritySchema,
  type Role,
  type TicketEvent,
} from '@bookleaf/shared';
import { formatDateTime } from '@/lib/format';

function statusChangeText({ before, after }: TicketEvent) {
  if (after === 'CLOSED') return 'closed this Ticket';
  if (after === 'RESOLVED') return 'marked this Ticket Resolved';
  if (before === 'RESOLVED' || before === 'CLOSED') return 'reopened this Ticket';
  if (after === 'IN_PROGRESS') return 'moved this Ticket to In Progress';
  return 'moved this Ticket back to Open';
}

function categoryLabel(value: string | null) {
  const category = categorySchema.safeParse(value);
  return category.success ? CATEGORY_LABELS[category.data] : null;
}

function priorityLabel(value: string | null) {
  const priority = prioritySchema.safeParse(value);
  return priority.success ? PRIORITY_LABELS[priority.data] : null;
}

function overrideText(field: string, before: string | null, after: string | null) {
  return before ? `changed the ${field} from ${before} to ${after}` : `set the ${field} to ${after}`;
}

function eventText(event: TicketEvent) {
  switch (event.kind) {
    case 'STATUS_CHANGED':
      return statusChangeText(event);
    case 'CATEGORY_OVERRIDDEN':
      return overrideText('Category', categoryLabel(event.before), categoryLabel(event.after));
    case 'PRIORITY_OVERRIDDEN':
      return overrideText('Priority', priorityLabel(event.before), priorityLabel(event.after));
    case 'ASSIGNED':
      return 'assigned this Ticket';
    case 'UNASSIGNED':
      return 'unassigned this Ticket';
    case 'TAKEOVER_REQUESTED':
      return 'requested a Takeover of this Ticket';
    case 'TAKEOVER_ACCEPTED':
      return 'accepted a Takeover of this Ticket';
    case 'TAKEOVER_DECLINED':
      return 'declined a Takeover of this Ticket';
    case 'TAKEOVER_CANCELLED':
      return 'cancelled a Takeover of this Ticket';
    case 'TAKEOVER_FORCED':
      return 'forced a Takeover of this Ticket';
  }
}

type Props = {
  messages: Message[];
  // Whichever Ticket Events the API lets this reader see.
  events: TicketEvent[];
  // Admins only.
  notes?: InternalNote[];
  // What to call each side when the API doesn't name who it was, which depends on who is reading.
  nameOf: (side: Role) => string;
};

export function TicketThread({ messages, events, notes, nameOf }: Props) {
  return (
    <ol className="flex flex-col gap-6">
      {mergeTimeline({ messages, events, notes }).map((entry) => (
        <li key={entry.item.id}>
          {entry.type === 'message' && <MessageCard message={entry.item} sender={entry.item.senderName ?? nameOf(entry.item.sender)} />}
          {entry.type === 'event' && <EventLine event={entry.item} actor={entry.item.actorName ?? nameOf(entry.item.actor)} />}
          {entry.type === 'note' && <InternalNoteCard note={entry.item} />}
        </li>
      ))}
    </ol>
  );
}

function MessageHeading({ sender, createdAt }: { sender: string; createdAt: string }) {
  return (
    <p className="flex flex-wrap items-baseline gap-2 text-sm font-bold">
      {sender}
      <time dateTime={createdAt} className="text-xs font-normal text-muted-foreground">
        {formatDateTime(createdAt)}
      </time>
    </p>
  );
}

// Laid out like an LLM chat for both readers: the Author in bubbles, and BookLeaf as plain text.
function MessageCard({ message, sender }: { message: Message; sender: string }) {
  if (message.sender === 'AUTHOR') {
    return (
      <div className="flex flex-col items-end gap-1 pl-[10%]">
        <MessageHeading sender={sender} createdAt={message.createdAt} />
        <p className="max-w-full rounded-2xl bg-secondary px-4 py-2.5 text-base break-words whitespace-pre-wrap">
          {message.body}
        </p>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-1">
      <MessageHeading sender={sender} createdAt={message.createdAt} />
      <p className="text-base break-words whitespace-pre-wrap">{message.body}</p>
    </div>
  );
}

// Shared with the Internal Note box, so nobody takes either for a Message.
export const INTERNAL_PANEL_CLASS =
  'flex flex-col gap-2 rounded-xl border border-dashed border-note-border bg-note p-4';

export function InternalLabel() {
  return <p className="text-xs font-bold">Internal, not visible to the Author</p>;
}

function InternalNoteCard({ note }: { note: InternalNote }) {
  return (
    <div className={INTERNAL_PANEL_CLASS}>
      <InternalLabel />
      <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm font-medium">
        {note.adminName}
        <time dateTime={note.createdAt} className="text-xs font-normal text-muted-foreground">
          {formatDateTime(note.createdAt)}
        </time>
      </div>
      <p className="text-sm break-words whitespace-pre-wrap">{note.body}</p>
    </div>
  );
}

function EventLine({ event, actor }: { event: TicketEvent; actor: string }) {
  return (
    <p className="text-center text-xs break-words text-muted-foreground">
      {actor} {eventText(event)} · <time dateTime={event.createdAt}>{formatDateTime(event.createdAt)}</time>
      {event.reason && <span className="block">Reason: {event.reason}</span>}
    </p>
  );
}
