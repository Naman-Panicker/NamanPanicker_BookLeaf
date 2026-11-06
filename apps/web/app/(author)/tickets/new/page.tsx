'use client';

import {
  type AuthorTicket,
  type Book,
  createTicketRequestSchema,
  GENERAL_ACCOUNT_LEVEL_LABEL,
} from '@bookleaf/shared';
import Link from 'next/link';
import { type FormEvent, type ReactNode, useEffect, useState } from 'react';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Loading } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import { ApiRequestError, createTicket, getMyBooks } from '@/lib/api';

type FieldErrors = Record<string, string>;

const GENERAL_OPTION = 'general';

// The API takes null for General / Account Level, and no answer at all fails validation.
function toBookId(option: FormDataEntryValue | null) {
  if (!option) return undefined;
  return option === GENERAL_OPTION ? null : option;
}

export default function NewTicketPage() {
  const [books, setBooks] = useState<Book[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [created, setCreated] = useState<AuthorTicket | null>(null);

  useEffect(() => {
    getMyBooks().then(({ books }) => setBooks(books), () => setLoadFailed(true));
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const form = new FormData(event.currentTarget);
    const parsed = createTicketRequestSchema.safeParse({
      bookId: toBookId(form.get('bookId')),
      subject: form.get('subject'),
      description: form.get('description'),
    });
    if (!parsed.success) {
      setFieldErrors(
        Object.fromEntries(parsed.error.issues.map(({ path, message }) => [path.join('.'), message])),
      );
      return;
    }

    setFieldErrors({});
    setSubmitting(true);
    try {
      setCreated(await createTicket(parsed.data));
    } catch (error) {
      setSubmitting(false);
      if (error instanceof ApiRequestError && error.code === 'NOT_FOUND') {
        setFieldErrors({ bookId: 'Choose one of your own Books.' });
      } else if (error instanceof ApiRequestError) {
        setFieldErrors(error.fieldErrors);
        if (error.code !== 'VALIDATION_FAILED') setFormError(error.message);
      } else {
        setFormError('Something went wrong. Please try again.');
      }
    }
  }

  if (created) return <Confirmation ticket={created} />;
  if (loadFailed) {
    return <p className="text-sm text-destructive">Could not load your Books. Please reload the page.</p>;
  }
  if (!books) {
    return <Loading label="Loading your Books…" />;
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <h1>New Ticket</h1>
      <Card>
        <CardContent>
          <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
            <Field label="What is this about?" name="bookId" error={fieldErrors.bookId}>
              <NativeSelect className="w-full" {...controlProps('bookId', fieldErrors.bookId)} defaultValue="">
                <NativeSelectOption value="">Choose a Book or {GENERAL_ACCOUNT_LEVEL_LABEL}</NativeSelectOption>
                {books.map((book) => (
                  <NativeSelectOption key={book.id} value={book.id}>
                    {book.title}
                  </NativeSelectOption>
                ))}
                <NativeSelectOption value={GENERAL_OPTION}>{GENERAL_ACCOUNT_LEVEL_LABEL}</NativeSelectOption>
              </NativeSelect>
            </Field>
            <Field label="Subject" name="subject" error={fieldErrors.subject}>
              <Input type="text" {...controlProps('subject', fieldErrors.subject)} />
            </Field>
            <Field label="Description" name="description" error={fieldErrors.description}>
              <Textarea rows={6} {...controlProps('description', fieldErrors.description)} />
            </Field>
            <div className="flex flex-col gap-2">
              <Label htmlFor="attachments">Attachments (coming soon)</Label>
              <Input id="attachments" type="file" disabled />
            </div>
            {formError && (
              <p role="alert" className="text-sm text-destructive">
                {formError}
              </p>
            )}
            <Button type="submit" pending={submitting} className="self-start">
              {submitting ? 'Sending…' : 'Raise Ticket'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function Confirmation({ ticket }: { ticket: AuthorTicket }) {
  return (
    <Card role="status" className="mx-auto max-w-2xl">
      <CardHeader>
        <CardTitle>Ticket {ticket.reference} raised</CardTitle>
        <CardDescription>
          We&apos;ve received your Ticket, and BookLeaf will answer you in its thread.
        </CardDescription>
      </CardHeader>
      <CardFooter className="gap-2">
        <Link href={`/tickets/${ticket.id}`} className={buttonVariants()}>
          View Ticket
        </Link>
        <Link href="/tickets" className={buttonVariants({ variant: 'outline' })}>
          My Tickets
        </Link>
      </CardFooter>
    </Card>
  );
}

function controlProps(name: string, error: string | undefined) {
  return {
    id: name,
    name,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': error ? `${name}-error` : undefined,
  };
}

type FieldProps = {
  label: string;
  name: string;
  error: string | undefined;
  children: ReactNode;
};

function Field({ label, name, error, children }: FieldProps) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={name}>{label}</Label>
      {children}
      {error && (
        <p id={`${name}-error`} className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
