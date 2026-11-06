'use client';

import type { TicketDraftResponse } from '@bookleaf/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { MessageForm } from '@/components/message-editor';
import { Button } from '@/components/ui/button';
import { Loading } from '@/components/ui/spinner';
import { ApiRequestError, getTicketDraft, regenerateTicketDraft } from '@/lib/api';

type Props = {
  ticketId: string;
  latestAuthorMessageId: string | undefined;
  onChanged: () => void;
};

type Editor = {
  body: string;
  // True until the Admin edits it.
  aiWritten: boolean;
  status: 'WRITING' | 'READY' | 'NOTHING_TO_ANSWER' | 'UNAVAILABLE';
};

// A failed request means the same to the Admin as a failed AI: nothing stops them writing it themselves.
const UNAVAILABLE_RESPONSE: TicketDraftResponse = { draft: null, draftUnavailable: true };

// Anything the Admin typed after asking stays, because it's theirs.
function withDraftResponse(editor: Editor, { draft, draftUnavailable }: TicketDraftResponse, bodyWhenAsked: string): Editor {
  if (draft === null) return { ...editor, status: draftUnavailable ? 'UNAVAILABLE' : 'NOTHING_TO_ANSWER' };
  return editor.body === bodyWhenAsked ? { body: draft, aiWritten: true, status: 'READY' } : { ...editor, status: 'READY' };
}

export function DraftEditor({ ticketId, latestAuthorMessageId, onChanged }: Props) {
  const [editor, setEditor] = useState<Editor>({ body: '', aiWritten: false, status: 'WRITING' });
  // The Author Message this box last caught up with. A newer one can arrive while it's open.
  const [caughtUpWith, setCaughtUpWith] = useState(latestAuthorMessageId);
  // Only the latest request counts, and sending a Message makes any request still running out of date.
  const latestRequest = useRef(0);

  const requestDraft = useCallback((request: () => Promise<TicketDraftResponse>, bodyWhenAsked: string) => {
    latestRequest.current += 1;
    const thisRequest = latestRequest.current;
    void request()
      .catch(() => UNAVAILABLE_RESPONSE)
      .then((response) => {
        if (thisRequest === latestRequest.current) {
          setEditor((current) => withDraftResponse(current, response, bodyWhenAsked));
        }
      });
  }, []);

  useEffect(() => {
    requestDraft(() => getTicketDraft(ticketId), '');
    return () => {
      latestRequest.current += 1;
    };
  }, [ticketId, requestDraft]);

  function regenerate() {
    const ownText = editor.body !== '' && !editor.aiWritten;
    if (ownText && !window.confirm('Replace what you have written with a new Draft?')) return;
    setCaughtUpWith(latestAuthorMessageId);
    setEditor((current) => ({ ...current, status: 'WRITING' }));
    requestDraft(
      () =>
        regenerateTicketDraft(ticketId).catch((failure: unknown) => {
          // Someone has just closed the Ticket, which isn't the AI's doing. Reloading shows it and removes this editor.
          if (failure instanceof ApiRequestError && failure.code === 'CONFLICT') onChanged();
          throw failure;
        }),
      editor.body,
    );
  }

  function handleSent() {
    latestRequest.current += 1;
    setCaughtUpWith(latestAuthorMessageId);
    setEditor({ body: '', aiWritten: false, status: 'NOTHING_TO_ANSWER' });
  }

  return (
    <MessageForm
      ticketId={ticketId}
      label="Message to the Author"
      body={editor.body}
      onBodyChange={(body) => setEditor((current) => ({ ...current, body, aiWritten: false }))}
      onSent={handleSent}
      onChanged={onChanged}
      notice={<DraftNotice editor={editor} authorHasWritten={caughtUpWith !== latestAuthorMessageId} />}
      actions={
        <Button type="button" variant="outline" disabled={editor.status === 'WRITING'} onClick={regenerate}>
          {editor.status === 'NOTHING_TO_ANSWER' ? 'Write a Draft' : 'Regenerate'}
        </Button>
      }
    />
  );
}

function DraftNotice({
  editor: { aiWritten, status },
  authorHasWritten,
}: {
  editor: Editor;
  authorHasWritten: boolean;
}) {
  return (
    <>
      {authorHasWritten && status !== 'WRITING' && (
        <p role="status" className="rounded-md bg-note p-2 text-sm">
          The Author has sent a new Message, shown above. Ask the AI for a new Draft to answer it.
        </p>
      )}
      {status === 'WRITING' && (
        <div role="status">
          <Loading label="Writing a Draft…" />
        </div>
      )}
      {status === 'NOTHING_TO_ANSWER' && !authorHasWritten && (
        <p role="status" className="text-sm text-muted-foreground">
          BookLeaf sent the latest Message, so there&apos;s no Draft yet. You can still write a follow-up, or ask the AI for one.
        </p>
      )}
      {status === 'UNAVAILABLE' && (
        <p role="status" className="rounded-md bg-note p-2 text-sm">
          The AI couldn&apos;t write a Draft just now, so please write this Message yourself, or try again.
        </p>
      )}
      {aiWritten && (
        <p role="status" className="rounded-md bg-muted p-2 text-sm">
          AI-written Draft. Check it before sending.
        </p>
      )}
    </>
  );
}
