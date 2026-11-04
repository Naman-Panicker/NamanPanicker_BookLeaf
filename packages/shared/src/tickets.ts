import { z } from 'zod';
import { bookSchema } from './books';
import { royaltySummarySchema } from './royalty';
import { roleSchema } from './session';

export const ticketStatusSchema = z.enum(['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED']);
export type TicketStatus = z.infer<typeof ticketStatusSchema>;

export const TICKET_STATUS_LABELS: Record<TicketStatus, string> = {
  OPEN: 'Open',
  IN_PROGRESS: 'In Progress',
  RESOLVED: 'Resolved',
  CLOSED: 'Closed',
};

export const categorySchema = z.enum([
  'ROYALTY_PAYMENTS',
  'ISBN_METADATA',
  'PRINTING_QUALITY',
  'DISTRIBUTION_AVAILABILITY',
  'BOOK_STATUS_PRODUCTION',
  'GENERAL_INQUIRY',
]);
export type Category = z.infer<typeof categorySchema>;

export const CATEGORY_LABELS: Record<Category, string> = {
  ROYALTY_PAYMENTS: 'Royalty & Payments',
  ISBN_METADATA: 'ISBN & Metadata Issues',
  PRINTING_QUALITY: 'Printing & Quality',
  DISTRIBUTION_AVAILABILITY: 'Distribution & Availability',
  BOOK_STATUS_PRODUCTION: 'Book Status & Production Updates',
  GENERAL_INQUIRY: 'General Inquiry',
};

export const prioritySchema = z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']);
export type Priority = z.infer<typeof prioritySchema>;

export const PRIORITY_LABELS: Record<Priority, string> = {
  CRITICAL: 'Critical',
  HIGH: 'High',
  MEDIUM: 'Medium',
  LOW: 'Low',
};

export const classificationSourceSchema = z.enum(['AI', 'ADMIN']);
export type ClassificationSource = z.infer<typeof classificationSourceSchema>;

export const CLASSIFICATION_SOURCE_LABELS: Record<ClassificationSource, string> = {
  AI: 'AI',
  ADMIN: 'Admin',
};

export const priorityFloorSchema = z.enum(['ISBN_METADATA', 'OVERDUE_ROYALTY']);
export type PriorityFloor = z.infer<typeof priorityFloorSchema>;

export const PRIORITY_FLOOR_LABELS: Record<PriorityFloor, string> = {
  ISBN_METADATA: 'ISBN policy',
  OVERDUE_ROYALTY: 'Overdue royalty policy',
};

export const MAX_CLASSIFICATION_ATTEMPTS = 3;

export const GENERAL_ACCOUNT_LEVEL_LABEL = 'General / Account Level';

export const SUBJECT_MAX_LENGTH = 200;
export const DESCRIPTION_MAX_LENGTH = 5000;
// The description is a Ticket's first Message, so the two share a limit.
export const MESSAGE_MAX_LENGTH = DESCRIPTION_MAX_LENGTH;

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

export const ALL_STATUSES = 'ALL';

export const adminQueueQuerySchema = z.object({
  // Left out, the queue shows only Tickets that aren't Resolved or Closed.
  status: z.enum([...ticketStatusSchema.options, ALL_STATUSES]).optional(),
  category: categorySchema.optional(),
  priority: prioritySchema.optional(),
  // When the Ticket was raised. The caller's day boundaries depend on their time zone, so these are moments.
  createdFrom: z.iso.datetime().optional(),
  createdBefore: z.iso.datetime().optional(),
  assignedToMe: z.stringbool().optional(),
});
export type AdminQueueQuery = z.input<typeof adminQueueQuerySchema>;

// A row of the Admin queue. A null Category or Priority means the Ticket is Unclassified.
export const adminQueueTicketSchema = z.object({
  id: z.string(),
  reference: z.string(),
  subject: z.string(),
  status: ticketStatusSchema,
  author: z.object({ id: z.string(), name: z.string() }),
  // Null means General / Account Level.
  book: z.object({ id: z.string(), title: z.string() }).nullable(),
  category: categorySchema.nullable(),
  priority: prioritySchema.nullable(),
  categorySource: classificationSourceSchema.nullable(),
  prioritySource: classificationSourceSchema.nullable(),
  // The Floor that raised the current Priority, if one did.
  priorityFloor: priorityFloorSchema.nullable(),
  // What the AI said, kept whatever an Admin or a Floor has since made of it.
  suggestedCategory: categorySchema.nullable(),
  suggestedPriority: prioritySchema.nullable(),
  classificationAttempts: z.number().int(),
  classificationError: z.string().nullable(),
  assignee: z.object({ id: z.string(), name: z.string() }).nullable(),
  awaitingAdmin: z.boolean(),
  // When the Author's latest Message arrived.
  waitingSince: z.iso.datetime(),
  createdAt: z.iso.datetime(),
});
export type AdminQueueTicket = z.infer<typeof adminQueueTicketSchema>;

export const adminQueueResponseSchema = z.object({ tickets: z.array(adminQueueTicketSchema) });
export type AdminQueueResponse = z.infer<typeof adminQueueResponseSchema>;

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

export const sendMessageRequestSchema = z.object({
  body: z
    .string({ error: 'Write a Message.' })
    .trim()
    .min(1, { error: 'Write a Message.' })
    .max(MESSAGE_MAX_LENGTH, { error: `Keep the Message to ${MESSAGE_MAX_LENGTH} characters or fewer.` }),
});
export type SendMessageRequest = z.infer<typeof sendMessageRequestSchema>;

export const messageResponseSchema = z.object({ message: messageSchema });
export type MessageResponse = z.infer<typeof messageResponseSchema>;

export const ticketEventKindSchema = z.enum([
  'STATUS_CHANGED',
  'ASSIGNED',
  'UNASSIGNED',
  'TAKEOVER_REQUESTED',
  'TAKEOVER_ACCEPTED',
  'TAKEOVER_DECLINED',
  'TAKEOVER_CANCELLED',
  'TAKEOVER_FORCED',
  'CATEGORY_OVERRIDDEN',
  'PRIORITY_OVERRIDDEN',
]);
export type TicketEventKind = z.infer<typeof ticketEventKindSchema>;

export const ticketEventSchema = z.object({
  id: z.string(),
  kind: ticketEventKindSchema,
  // Which side made the change, as on a Message.
  actor: roleSchema,
  // Sent to Admins only, so Authors hear from BookLeaf and not from a named Admin.
  actorName: z.string().optional(),
  before: z.string().nullable(),
  after: z.string().nullable(),
  // Sent to Admins only.
  reason: z.string().nullable().optional(),
  createdAt: z.iso.datetime(),
});
export type TicketEvent = z.infer<typeof ticketEventSchema>;

export const ticketEventsResponseSchema = z.object({ events: z.array(ticketEventSchema) });
export type TicketEventsResponse = z.infer<typeof ticketEventsResponseSchema>;

export const setTicketStatusRequestSchema = z.object({
  status: ticketStatusSchema,
});
export type SetTicketStatusRequest = z.infer<typeof setTicketStatusRequestSchema>;

export const setCategoryRequestSchema = z.object({
  category: categorySchema,
});
export type SetCategoryRequest = z.infer<typeof setCategoryRequestSchema>;

export const setPriorityRequestSchema = z.object({
  priority: prioritySchema,
});
export type SetPriorityRequest = z.infer<typeof setPriorityRequestSchema>;

export const adminTicketResponseSchema = z.object({ ticket: adminQueueTicketSchema });
export type AdminTicketResponse = z.infer<typeof adminTicketResponseSchema>;

// What an Admin sees while working a Ticket: the facts about the Book and the Author's royalties.
export const adminWorkspaceResponseSchema = adminTicketResponseSchema.extend({
  // Null means General / Account Level.
  book: bookSchema.nullable(),
  royalty: royaltySummarySchema,
});
export type AdminWorkspaceResponse = z.infer<typeof adminWorkspaceResponseSchema>;
