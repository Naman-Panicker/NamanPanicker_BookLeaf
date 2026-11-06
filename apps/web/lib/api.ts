import {
  type AddInternalNoteRequest,
  type AdminQueueQuery,
  adminQueueResponseSchema,
  adminTicketResponseSchema,
  adminWorkspaceResponseSchema,
  apiErrorSchema,
  authorTicketResponseSchema,
  type CreateTicketRequest,
  internalNoteResponseSchema,
  internalNotesResponseSchema,
  messageResponseSchema,
  myBooksResponseSchema,
  myTicketsResponseSchema,
  type SendMessageRequest,
  sessionResponseSchema,
  type SetCategoryRequest,
  type SetPriorityRequest,
  type SetTicketStatusRequest,
  type LoginRequest,
  ticketDraftResponseSchema,
  ticketEventsResponseSchema,
  ticketMessagesResponseSchema,
  validationDetailsSchema,
} from '@bookleaf/shared';

export const SIGN_IN_PATH = '/sign-in';

export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details: unknown,
  ) {
    super(message);
  }

  // The bad fields of a VALIDATION_FAILED error, keyed by field name.
  get fieldErrors(): Record<string, string> {
    const parsed = validationDetailsSchema.safeParse(this.details);
    if (!parsed.success) return {};
    return Object.fromEntries(parsed.data.fields.map(({ field, message }) => [field, message]));
  }
}

// What to show when a button or form on a page fails.
export function actionErrorMessage(error: unknown) {
  return error instanceof ApiRequestError ? error.message : 'Something went wrong. Please try again.';
}

async function toApiRequestError(res: Response) {
  // A proxy or cold-start failure may not answer in our error format at all.
  const body = apiErrorSchema.safeParse(await res.json().catch(() => null));
  if (!body.success) {
    return new ApiRequestError(res.status, 'UNKNOWN', 'Something went wrong. Please try again.', null);
  }
  const { code, message, details } = body.data.error;
  return new ApiRequestError(res.status, code, message, details);
}

async function send(path: string, init?: RequestInit) {
  let res: Response;
  try {
    res = await fetch(path, init);
  } catch {
    throw new ApiRequestError(0, 'NETWORK_ERROR', 'Could not reach BookLeaf. Check your connection.', null);
  }
  if (!res.ok) throw await toApiRequestError(res);
  return res;
}

// Calls that need a session go through here. An expired session sends the browser back to
// sign-in, and the returned promise never settles, so the page doesn't flash an error on the way.
async function authenticated(path: string, init?: RequestInit) {
  try {
    return await send(path, init);
  } catch (error) {
    if (error instanceof ApiRequestError && error.code === 'UNAUTHENTICATED') {
      // This isn't a component, so it has no router, and a full reload drops any signed-in state.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign(SIGN_IN_PATH);
      return new Promise<never>(() => {});
    }
    throw error;
  }
}

async function userFrom(res: Response) {
  return sessionResponseSchema.parse(await res.json()).user;
}

export async function logIn(credentials: LoginRequest) {
  const res = await send('/api/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(credentials),
  });
  return userFrom(res);
}

export async function logOut() {
  await authenticated('/api/session', { method: 'DELETE' });
}

export async function getCurrentUser() {
  return userFrom(await authenticated('/api/session'));
}

// For pages anyone may open, where being logged out is a normal answer and not a reason to redirect.
export async function findCurrentUser() {
  try {
    return userFrom(await send('/api/session'));
  } catch (error) {
    if (error instanceof ApiRequestError && error.code === 'UNAUTHENTICATED') return null;
    throw error;
  }
}

export async function getMyBooks() {
  const res = await authenticated('/api/books');
  return myBooksResponseSchema.parse(await res.json());
}

export async function createTicket(ticket: CreateTicketRequest) {
  const res = await authenticated('/api/tickets', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(ticket),
  });
  return authorTicketResponseSchema.parse(await res.json()).ticket;
}

export async function getMyTickets() {
  const res = await authenticated('/api/tickets');
  return myTicketsResponseSchema.parse(await res.json()).tickets;
}

export async function getTicket(ticketId: string) {
  const res = await authenticated(`/api/tickets/${encodeURIComponent(ticketId)}`);
  return authorTicketResponseSchema.parse(await res.json()).ticket;
}

export async function getTicketMessages(ticketId: string) {
  const res = await authenticated(`/api/tickets/${encodeURIComponent(ticketId)}/messages`);
  return ticketMessagesResponseSchema.parse(await res.json()).messages;
}

export async function sendTicketMessage(ticketId: string, message: SendMessageRequest) {
  const res = await authenticated(`/api/tickets/${encodeURIComponent(ticketId)}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(message),
  });
  return messageResponseSchema.parse(await res.json()).message;
}

export async function getTicketEvents(ticketId: string) {
  const res = await authenticated(`/api/tickets/${encodeURIComponent(ticketId)}/events`);
  return ticketEventsResponseSchema.parse(await res.json()).events;
}

export async function assignTicketToMe(ticketId: string) {
  const res = await authenticated(`/api/admin/tickets/${encodeURIComponent(ticketId)}/assignee`, { method: 'PUT' });
  return adminTicketResponseSchema.parse(await res.json()).ticket;
}

export async function unassignTicket(ticketId: string) {
  const res = await authenticated(`/api/admin/tickets/${encodeURIComponent(ticketId)}/assignee`, { method: 'DELETE' });
  return adminTicketResponseSchema.parse(await res.json()).ticket;
}

export async function getInternalNotes(ticketId: string) {
  const res = await authenticated(`/api/admin/tickets/${encodeURIComponent(ticketId)}/internal-notes`);
  return internalNotesResponseSchema.parse(await res.json()).notes;
}

export async function addInternalNote(ticketId: string, note: AddInternalNoteRequest) {
  const res = await authenticated(`/api/admin/tickets/${encodeURIComponent(ticketId)}/internal-notes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(note),
  });
  return internalNoteResponseSchema.parse(await res.json()).note;
}

export async function confirmResolution(ticketId: string) {
  const res = await authenticated(`/api/tickets/${encodeURIComponent(ticketId)}/resolution-confirmation`, {
    method: 'POST',
  });
  return authorTicketResponseSchema.parse(await res.json()).ticket;
}

export async function getAdminQueue(query: AdminQueueQuery) {
  const entries = Object.entries(query).filter(([, value]) => value !== undefined);
  const res = await authenticated(`/api/admin/tickets?${new URLSearchParams(entries).toString()}`);
  return adminQueueResponseSchema.parse(await res.json()).tickets;
}

export async function getAdminWorkspace(ticketId: string) {
  const res = await authenticated(`/api/admin/tickets/${encodeURIComponent(ticketId)}`);
  return adminWorkspaceResponseSchema.parse(await res.json());
}

export async function setTicketStatus(ticketId: string, request: SetTicketStatusRequest) {
  const res = await authenticated(`/api/admin/tickets/${encodeURIComponent(ticketId)}/status`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
  return adminTicketResponseSchema.parse(await res.json()).ticket;
}

export async function setTicketCategory(ticketId: string, request: SetCategoryRequest) {
  const res = await authenticated(`/api/admin/tickets/${encodeURIComponent(ticketId)}/category`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
  return adminTicketResponseSchema.parse(await res.json()).ticket;
}

export async function setTicketPriority(ticketId: string, request: SetPriorityRequest) {
  const res = await authenticated(`/api/admin/tickets/${encodeURIComponent(ticketId)}/priority`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
  return adminTicketResponseSchema.parse(await res.json()).ticket;
}

export async function retryClassification(ticketId: string) {
  const res = await authenticated(`/api/admin/tickets/${encodeURIComponent(ticketId)}/classification-retry`, {
    method: 'POST',
  });
  return adminTicketResponseSchema.parse(await res.json()).ticket;
}

export async function getTicketDraft(ticketId: string) {
  const res = await authenticated(`/api/admin/tickets/${encodeURIComponent(ticketId)}/draft`);
  return ticketDraftResponseSchema.parse(await res.json());
}

export async function regenerateTicketDraft(ticketId: string) {
  const res = await authenticated(`/api/admin/tickets/${encodeURIComponent(ticketId)}/draft-regeneration`, {
    method: 'POST',
  });
  return ticketDraftResponseSchema.parse(await res.json());
}
