import { z } from 'zod';
import { roleSchema } from './session';

export const ticketStatusSchema = z.enum(['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED']);
export type TicketStatus = z.infer<typeof ticketStatusSchema>;

export const TICKET_STATUS_LABELS: Record<TicketStatus, string> = {
  OPEN: 'Open',
  IN_PROGRESS: 'In Progress',
  RESOLVED: 'Resolved',
  CLOSED: 'Closed',
};

export const GENERAL_ACCOUNT_LEVEL_LABEL = 'General / Account Level';

export const SUBJECT_MAX_LENGTH = 200;
export const DESCRIPTION_MAX_LENGTH = 5000;

export const createTicketRequestSchema = z.object({
  // Null means General / Account Level. It has to be chosen, so leaving it out is an error.
  bookId: z.string({ error: `Choose a Book or ${GENERAL_ACCOUNT_LEVEL_LABEL}.` }).nullable(),
  subject: z
    .string({ error: 'Enter a subject.' })
    .trim()
    .min(1, { error: 'Enter a subject.' })
    .max(SUBJECT_MAX_LENGTH, { error: `Keep the subject to ${SUBJECT_MAX_LENGTH} characters or fewer.` }),
  description: z
    .string({ error: 'Describe your problem.' })
    .trim()
    .min(1, { error: 'Describe your problem.' })
    .max(DESCRIPTION_MAX_LENGTH, {
      error: `Keep the description to ${DESCRIPTION_MAX_LENGTH} characters or fewer.`,
    }),
});
export type CreateTicketRequest = z.infer<typeof createTicketRequestSchema>;

// A Ticket as its Author sees it. Category, Priority, Assignee and the other Admin-only fields stay out.
export const authorTicketSchema = z.object({
  id: z.string(),
  // Readable, such as BL-1042.
  reference: z.string(),
  subject: z.string(),
  status: ticketStatusSchema,
  // Null means General / Account Level.
  book: z.object({ id: z.string(), title: z.string() }).nullable(),
  lastUpdateAt: z.iso.datetime(),
});
export type AuthorTicket = z.infer<typeof authorTicketSchema>;

export const authorTicketResponseSchema = z.object({ ticket: authorTicketSchema });
export type AuthorTicketResponse = z.infer<typeof authorTicketResponseSchema>;

export const myTicketsResponseSchema = z.object({ tickets: z.array(authorTicketSchema) });
export type MyTicketsResponse = z.infer<typeof myTicketsResponseSchema>;

export const ticketParamsSchema = z.object({ ticketId: z.string() });

// Says only which side wrote a Message, so Authors hear from BookLeaf and not from a named Admin.
export const messageSchema = z.object({
  id: z.string(),
  sender: roleSchema,
  body: z.string(),
  createdAt: z.iso.datetime(),
});
export type Message = z.infer<typeof messageSchema>;

export const ticketMessagesResponseSchema = z.object({ messages: z.array(messageSchema) });
export type TicketMessagesResponse = z.infer<typeof ticketMessagesResponseSchema>;
