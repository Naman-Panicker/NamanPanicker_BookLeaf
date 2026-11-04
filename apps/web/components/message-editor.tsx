'use client';

import { sendMessageRequestSchema } from '@bookleaf/shared';
import { type FormEvent, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { actionErrorMessage, ApiRequestError, sendTicketMessage } from '@/lib/api';

type Props = {
  ticketId: string;
  label: string;
  // Called when the thread has news: after sending, or when the API says the Ticket has moved on.
  onChanged: () => void;
};

const FIELD_ID = 'message-body';

export function MessageEditor({ ticketId, label, onChanged }: Props) {
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = sendMessageRequestSchema.safeParse({ body });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? null);
      return;
    }

    setError(null);
    setSending(true);
    try {
      await sendTicketMessage(ticketId, parsed.data);
      setBody('');
      onChanged();
    } catch (failure) {
      // What they wrote stays in the box, so they don't lose it.
      setError(actionErrorMessage(failure));
      if (failure instanceof ApiRequestError && failure.code === 'CONFLICT') onChanged();
    } finally {
      setSending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-2">
      <Label htmlFor={FIELD_ID}>{label}</Label>
      <Textarea
        id={FIELD_ID}
        rows={4}
        value={body}
        onChange={(event) => setBody(event.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${FIELD_ID}-error` : undefined}
      />
      {error && (
        <p id={`${FIELD_ID}-error`} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button type="submit" disabled={sending} className="self-start">
        {sending ? 'Sending…' : 'Send'}
      </Button>
    </form>
  );
}
