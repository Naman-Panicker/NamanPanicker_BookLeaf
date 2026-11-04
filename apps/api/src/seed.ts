import { PRODUCTION_STAGE_LABELS, type ProductionStage, productionStageSchema } from '@bookleaf/shared';
import { z } from 'zod';
import sampleData from '../prisma/sample-data.json';
import { hashPassword } from './auth/passwords';
import type { PrismaClient } from './db';
import { ASHA_EMAIL, DEV_EMAIL, seedTickets } from './seed-tickets';

// Not a secret: it's the login reviewers use for the demo accounts.
export const DEMO_PASSWORD = 'BookLeaf-demo-2026';

const ADMINS = [
  { name: 'Asha Rao', email: ASHA_EMAIL },
  { name: 'Dev Menon', email: DEV_EMAIL },
];

const sampleDataSchema = z.object({
  authors: z.array(
    z.object({
      author_id: z.string(),
      name: z.string(),
      email: z.email(),
      phone: z.string(),
      city: z.string(),
      joined_date: z.iso.date(),
      books: z.array(
        z.object({
          book_id: z.string(),
          title: z.string(),
          isbn: z.string(),
          genre: z.string(),
          publication_date: z.iso.date().nullable(),
          status: z.string(),
          mrp: z.number().nullable(),
          author_royalty_per_copy: z.number().nullable(),
          total_copies_sold: z.number(),
          total_royalty_earned: z.number(),
          royalty_paid: z.number(),
          royalty_pending: z.number(),
          last_royalty_payout_date: z.iso.date().nullable(),
          print_partner: z.string().nullable(),
          available_on: z.array(z.string()),
        }),
      ),
    }),
  ),
});

// The sample data says "In Production - Cover Design" or "Published & Live".
function parseProductionStage(status: string): ProductionStage {
  const label = status.replace(/^In Production - /, '');
  const stage = productionStageSchema.options.find((option) => PRODUCTION_STAGE_LABELS[option] === label);
  if (!stage) throw new Error(`Unknown status in the sample data: ${status}`);
  return stage;
}

function toDate(date: string | null) {
  return date === null ? null : new Date(date);
}

export async function seed(prisma: PrismaClient, now = new Date()) {
  const passwordHash = await hashPassword(DEMO_PASSWORD);
  const { authors } = sampleDataSchema.parse(sampleData);

  // Each query crosses the network to Neon, so waiting for them one by one takes far too long.
  await Promise.all(
    authors.map(async (author) => {
      const profile = {
        name: author.name,
        email: author.email.toLowerCase(),
        phone: author.phone,
        city: author.city,
        joinedDate: new Date(author.joined_date),
        passwordHash,
      };
      const { id: authorId } = await prisma.author.upsert({
        where: { externalRef: author.author_id },
        create: { externalRef: author.author_id, ...profile },
        update: profile,
      });

      await Promise.all(
        author.books.map((book) => {
          const fields = {
            authorId,
            title: book.title,
            isbn: book.isbn,
            genre: book.genre,
            publicationDate: toDate(book.publication_date),
            productionStage: parseProductionStage(book.status),
            mrp: book.mrp,
            royaltyPerCopy: book.author_royalty_per_copy,
            copiesSold: book.total_copies_sold,
            royaltyEarned: book.total_royalty_earned,
            royaltyPaid: book.royalty_paid,
            royaltyPending: book.royalty_pending,
            lastPayoutDate: toDate(book.last_royalty_payout_date),
            printPartner: book.print_partner,
            availableOn: book.available_on,
          };
          return prisma.book.upsert({
            where: { externalRef: book.book_id },
            create: { externalRef: book.book_id, ...fields },
            update: fields,
          });
        }),
      );
    }),
  );

  for (const { name, email } of ADMINS) {
    await prisma.admin.upsert({
      where: { email },
      create: { name, email, passwordHash },
      update: { name, passwordHash },
    });
  }

  const tickets = await seedTickets(prisma, now);

  return {
    authors: authors.map(({ email }) => email),
    admins: ADMINS.map(({ email }) => email),
    books: authors.flatMap(({ books }) => books.map(({ book_id }) => book_id)),
    tickets,
  };
}
