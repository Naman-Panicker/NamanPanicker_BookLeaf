import { z } from 'zod';
import sampleData from '../prisma/sample-data.json';
import { hashPassword } from './auth/passwords';
import type { PrismaClient } from './db';

// Not a secret: it's the login reviewers use for the demo accounts.
export const DEMO_PASSWORD = 'BookLeaf-demo-2026';

const ADMINS = [
  { name: 'Asha Rao', email: 'asha.rao@bookleaf.example' },
  { name: 'Dev Menon', email: 'dev.menon@bookleaf.example' },
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
    }),
  ),
});

export async function seed(prisma: PrismaClient) {
  const passwordHash = await hashPassword(DEMO_PASSWORD);
  const { authors } = sampleDataSchema.parse(sampleData);

  for (const author of authors) {
    const profile = {
      name: author.name,
      email: author.email.toLowerCase(),
      phone: author.phone,
      city: author.city,
      joinedDate: new Date(author.joined_date),
      passwordHash,
    };
    await prisma.author.upsert({
      where: { externalRef: author.author_id },
      create: { externalRef: author.author_id, ...profile },
      update: profile,
    });
  }

  for (const { name, email } of ADMINS) {
    await prisma.admin.upsert({
      where: { email },
      create: { name, email, passwordHash },
      update: { name, passwordHash },
    });
  }

  return { authors: authors.map(({ email }) => email), admins: ADMINS.map(({ email }) => email) };
}
