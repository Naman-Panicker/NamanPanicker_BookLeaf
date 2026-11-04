import {
  apiErrorSchema,
  type Book,
  bookParamsSchema,
  bookResponseSchema,
  type BookResponse,
  bookRoyalty,
  isoDate,
  myBooksResponseSchema,
  type MyBooksResponse,
  royaltySummary,
} from '@bookleaf/shared';
import { currentAuthorId } from '../auth/sessions';
import type { Clock } from '../clock';
import type { PrismaClient } from '../db';
import type { Book as BookRecord } from '../generated/prisma/client';
import { notFound } from '../http/errors';
import type { createRoutes } from '../http/routes';

type Deps = {
  routes: ReturnType<typeof createRoutes>;
  prisma: PrismaClient;
  clock: Clock;
};

export function toBook(record: BookRecord): Book {
  return {
    id: record.id,
    externalRef: record.externalRef,
    title: record.title,
    isbn: record.isbn,
    genre: record.genre,
    publicationDate: record.publicationDate && isoDate(record.publicationDate),
    productionStage: record.productionStage,
    mrp: record.mrp,
    royaltyPerCopy: record.royaltyPerCopy,
    printPartner: record.printPartner,
    availableOn: record.availableOn,
    ...bookRoyalty(record),
  };
}

export function addBookRoutes({ routes, prisma, clock }: Deps) {
  routes.add(
    {
      method: 'get',
      path: '/api/books',
      summary: "List the current Author's Books, with their royalty summary",
      tag: 'Books',
      responses: {
        200: { description: "The Author's Books and royalty summary.", schema: myBooksResponseSchema },
        404: { description: 'The caller is not an Author.', schema: apiErrorSchema },
      },
    },
    async (_req, res) => {
      const records = await prisma.book.findMany({
        where: { authorId: currentAuthorId(res) },
        orderBy: { externalRef: 'asc' },
      });
      res.json({
        books: records.map(toBook),
        royalty: royaltySummary(records, clock.now()),
      } satisfies MyBooksResponse);
    },
  );

  routes.add(
    {
      method: 'get',
      path: '/api/books/:bookId',
      summary: "Get one of the current Author's Books",
      tag: 'Books',
      params: bookParamsSchema,
      responses: {
        200: { description: 'The Book.', schema: bookResponseSchema },
        404: { description: 'The Book does not exist, or belongs to another Author.', schema: apiErrorSchema },
      },
    },
    async (_req, res, { params }) => {
      const record = await prisma.book.findFirst({
        where: { id: params.bookId, authorId: currentAuthorId(res) },
      });
      if (!record) throw notFound();
      res.json({ book: toBook(record) } satisfies BookResponse);
    },
  );
}
