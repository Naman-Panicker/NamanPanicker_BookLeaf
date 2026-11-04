'use client';

import {
  type Book,
  isPublished,
  type MyBooksResponse,
  PAYOUT_THRESHOLD,
  PRODUCTION_STAGE_LABELS,
  type RoyaltySummary,
} from '@bookleaf/shared';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getMyBooks } from '@/lib/api';
import { formatCount, formatDate, formatRupees } from '@/lib/format';

export default function MyBooksPage() {
  const [data, setData] = useState<MyBooksResponse | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    getMyBooks().then(setData, () => setLoadFailed(true));
  }, []);

  if (loadFailed) {
    return <p className="text-sm text-destructive">Could not load your Books. Please reload the page.</p>;
  }
  if (!data) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <h1 className="text-xl font-semibold">My Books</h1>
      {data.books.length === 0 ? (
        <EmptyState />
      ) : (
        <>
          <RoyaltyStrip royalty={data.royalty} />
          <ul className="flex flex-col gap-4">
            {data.books.map((book) => (
              <li key={book.id}>
                <BookCard book={book} />
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>No Books yet</CardTitle>
        <CardDescription>
          When you publish with BookLeaf, your Books and royalties will appear here, including Books still in
          production.
        </CardDescription>
      </CardHeader>
    </Card>
  );
}

function RoyaltyStrip({ royalty }: { royalty: RoyaltySummary }) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-4">
        <dl className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <Figure label="Total earned" value={formatRupees(royalty.totalEarned)} />
          <Figure label="Total paid" value={formatRupees(royalty.totalPaid)} />
          <Figure label="Pending Royalty" value={formatRupees(royalty.totalPending)} />
          <Figure label="Next Payout Date" value={formatDate(royalty.nextPayoutDate)} />
        </dl>
        {royalty.belowThreshold && (
          <p className="rounded-md bg-muted p-3 text-sm">
            Your Pending Royalty of {formatRupees(royalty.totalPending)} is below the{' '}
            {formatRupees(PAYOUT_THRESHOLD)} Payout Threshold, so it rolls over to next quarter instead of being
            paid out.
          </p>
        )}
        {royalty.overdue && (
          <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            Your Pending Royalty of {formatRupees(royalty.totalPending)} is Overdue: our records show the last
            Payout window closed without a Payout. Please{' '}
            <Link href="/tickets/new" className="underline underline-offset-4">
              raise a Ticket
            </Link>{' '}
            and we&apos;ll look into it.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function BookCard({ book }: { book: Book }) {
  const published = isPublished(book.productionStage);
  const neverPaid = published && book.lastPayoutDate === null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{book.title}</CardTitle>
        <CardDescription>{book.genre}</CardDescription>
        <Badge variant={published ? 'default' : 'secondary'} className="mt-1">
          {PRODUCTION_STAGE_LABELS[book.productionStage]}
        </Badge>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Figure label="ISBN" value={book.isbn} />
          <Figure label="Publication date" value={formatDate(book.publicationDate)} />
          <Figure label="MRP" value={formatRupees(book.mrp)} />
          <Figure label="Copies sold" value={formatCount(book.copiesSold)} />
          <Figure label="Royalty earned" value={formatRupees(book.royaltyEarned)} />
          <Figure label="Royalty paid" value={formatRupees(book.royaltyPaid)} />
          <Figure label="Pending Royalty" value={formatRupees(book.royaltyPending)} />
          <Figure label="Last Payout" value={neverPaid ? 'Never paid' : formatDate(book.lastPayoutDate)} />
        </dl>
      </CardContent>
    </Card>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-medium break-words">{value}</dd>
    </div>
  );
}
