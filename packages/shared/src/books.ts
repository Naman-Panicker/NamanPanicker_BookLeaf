import { z } from 'zod';
import { productionStageSchema } from './production-stage';
import { bookRoyaltySchema, royaltySummarySchema } from './royalty';

export const bookSchema = bookRoyaltySchema.extend({
  id: z.string(),
  // The sample data's book ID, such as BK001.
  externalRef: z.string(),
  title: z.string(),
  isbn: z.string(),
  genre: z.string(),
  publicationDate: z.iso.date().nullable(),
  productionStage: productionStageSchema,
  mrp: z.number().nullable(),
  royaltyPerCopy: z.number().nullable(),
  printPartner: z.string().nullable(),
  availableOn: z.array(z.string()),
});
export type Book = z.infer<typeof bookSchema>;

export const myBooksResponseSchema = z.object({
  books: z.array(bookSchema),
  royalty: royaltySummarySchema,
});
export type MyBooksResponse = z.infer<typeof myBooksResponseSchema>;

export const bookParamsSchema = z.object({ bookId: z.string() });

export const bookResponseSchema = z.object({ book: bookSchema });
export type BookResponse = z.infer<typeof bookResponseSchema>;
