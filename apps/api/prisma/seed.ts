import { createPrisma } from '../src/db';
import { seed } from '../src/seed';

const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!url) throw new Error('Set DATABASE_URL in apps/api/.env before seeding.');

const prisma = createPrisma(url);
try {
  const { authors, admins } = await seed(prisma);
  console.log(`Seeded ${authors.length} Authors and ${admins.length} Admins.`);
} finally {
  await prisma.$disconnect();
}
