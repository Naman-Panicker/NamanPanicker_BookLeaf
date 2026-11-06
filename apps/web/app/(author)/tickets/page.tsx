'use client';

import { type AuthorTicket, GENERAL_ACCOUNT_LEVEL_LABEL } from '@bookleaf/shared';
import Link from 'next/link';
import { TicketStatusBadge } from '@/components/ticket-status-badge';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Loading } from '@/components/ui/spinner';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { getMyTickets } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { useLiveData } from '@/lib/use-live-data';

const NEW_TICKET_PATH = '/tickets/new';

export default function MyTicketsPage() {
  const { data: tickets, loadFailed } = useLiveData(getMyTickets);

  if (loadFailed) {
    return <p className="text-sm text-destructive">Could not load your Tickets. Please reload the page.</p>;
  }
  if (!tickets) {
    return <Loading label="Loading your Tickets…" />;
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <h1>My Tickets</h1>
        {tickets.length > 0 && (
          <Link href={NEW_TICKET_PATH} className={buttonVariants()}>
            New Ticket
          </Link>
        )}
      </div>
      {tickets.length === 0 ? <EmptyState /> : <TicketTable tickets={tickets} />}
    </div>
  );
}

function EmptyState() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>No Tickets yet</CardTitle>
        <CardDescription>
          Have a question about a Book or your account? Raise a Ticket and BookLeaf will answer you here.
        </CardDescription>
      </CardHeader>
      <CardFooter>
        <Link href={NEW_TICKET_PATH} className={buttonVariants()}>
          Raise a Ticket
        </Link>
      </CardFooter>
    </Card>
  );
}

function TicketTable({ tickets }: { tickets: AuthorTicket[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Reference</TableHead>
          <TableHead>Subject</TableHead>
          <TableHead>Book</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Last update</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {tickets.map((ticket) => (
          <TableRow key={ticket.id}>
            <TableCell className="font-medium">{ticket.reference}</TableCell>
            <TableCell className="max-w-xs truncate">
              <Link href={`/tickets/${ticket.id}`} className="text-link underline underline-offset-4">
                {ticket.subject}
              </Link>
            </TableCell>
            <TableCell className="max-w-48 truncate">{ticket.book?.title ?? GENERAL_ACCOUNT_LEVEL_LABEL}</TableCell>
            <TableCell>
              <TicketStatusBadge status={ticket.status} />
            </TableCell>
            <TableCell>{formatDateTime(ticket.lastUpdateAt)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
