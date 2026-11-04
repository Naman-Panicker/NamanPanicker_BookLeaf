'use client';

import { sendMessageRequestSchema } from '@bookleaf/shared';
import { type FormEvent, type ReactNode, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { actionErrorMessage, ApiRequestError, sendTicketMessage } from '@/lib/api';

type FormProps = {
  ticketId: string;
  label: string;
  body: string;
  onBodyChange: (body: string) => void;
  onSent?: () => void;
  // Called when the thread has news: after sending, or when the API says the Ticket has moved on.
  onChanged: () => void;
  // Shown above the box, such as where its text came from.
  notice?: ReactNode;
  // Shown beside the Send button.
  actions?: ReactNode;
};

const FIELD_ID = 'message-body';

export function MessageForm({ ticketId, label, body, onBodyChange, onSent, onChanged, notice, actions }: FormProps) {
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
      onBodyChange('');
      onSent?.();
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
      {notice}
      <Textarea
        id={FIELD_ID}
        rows={4}
        value={body}
        onChange={(event) => onBodyChange(event.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${FIELD_ID}-error` : undefined}
      />
      {error && (
        <p id={`${FIELD_ID}-error`} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={sending}>
          {sending ? 'Sending…' : 'Send'}
        </Button>
        {actions}
      </div>
    </form>
  );
}

export function MessageEditor(props: Pick<FormProps, 'ticketId' | 'label' | 'onChanged'>) {
  const [body, setBody] = useState('');
  return <MessageForm {...props} body={body} onBodyChange={setBody} />;
}
