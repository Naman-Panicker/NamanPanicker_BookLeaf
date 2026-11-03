import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import sampleData from '../prisma/sample-data.json';
import { DEMO_PASSWORD, seed } from './seed';
import { makeTestApp, prisma, resetDatabase } from './testing/harness';

beforeEach(resetDatabase);

describe('seeding', () => {
  it('lets a sample Author sign in with the demo password', async () => {
    await seed(prisma);

    const res = await request(makeTestApp())
      .post('/api/session')
      .send({ email: 'kavita.deshmukh@email.com', password: DEMO_PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ role: 'AUTHOR', name: 'Kavita Deshmukh' });
  });

  it('lets both Admins sign in with the demo password', async () => {
    const { admins } = await seed(prisma);

    expect(admins).toHaveLength(2);
    for (const email of admins) {
      const res = await request(makeTestApp())
        .post('/api/session')
        .send({ email, password: DEMO_PASSWORD });

      expect(res.status).toBe(200);
      expect(res.body.user.role).toBe('ADMIN');
    }
  });

  it('loads the sample Author profile and keeps the sample ID as a reference', async () => {
    await seed(prisma);

    const priya = await prisma.author.findUnique({ where: { externalRef: 'AUTH001' } });

    expect(priya).toMatchObject({
      name: 'Priya Sharma',
      email: 'priya.sharma@email.com',
      phone: '+91-98765-43210',
      city: 'Mumbai',
      joinedDate: new Date('2023-03-15'),
    });
  });

  it('can run again without creating duplicates or changing IDs', async () => {
    await seed(prisma);
    const before = await prisma.author.findUnique({ where: { externalRef: 'AUTH001' } });

    await seed(prisma);

    expect(await prisma.author.count()).toBe(10);
    expect(await prisma.admin.count()).toBe(2);
    const after = await prisma.author.findUnique({ where: { externalRef: 'AUTH001' } });
    expect(after?.id).toBe(before?.id);
  });

  it('loads every sample Book exactly as given, under the right Author', async () => {
    await seed(prisma);

    const sampleBooks = sampleData.authors.flatMap((author) =>
      author.books.map((book) => ({ ...book, authorRef: author.author_id })),
    );
    expect(sampleBooks).toHaveLength(18);
    const seeded = await prisma.book.findMany({ include: { author: true } });
    const byRef = new Map(seeded.map((book) => [book.externalRef, book]));

    expect(seeded).toHaveLength(18);
    for (const sample of sampleBooks) {
      expect(byRef.get(sample.book_id)).toMatchObject({
        title: sample.title,
        isbn: sample.isbn,
        genre: sample.genre,
        publicationDate: sample.publication_date && new Date(sample.publication_date),
        mrp: sample.mrp,
        royaltyPerCopy: sample.author_royalty_per_copy,
        copiesSold: sample.total_copies_sold,
        royaltyEarned: sample.total_royalty_earned,
        royaltyPaid: sample.royalty_paid,
        royaltyPending: sample.royalty_pending,
        lastPayoutDate: sample.last_royalty_payout_date && new Date(sample.last_royalty_payout_date),
        printPartner: sample.print_partner,
        availableOn: sample.available_on,
        author: { externalRef: sample.authorRef },
      });
    }
  });

  it('parses the status string into a Production Stage', async () => {
    await seed(prisma);

    const stageOf = async (externalRef: string) =>
      (await prisma.book.findUnique({ where: { externalRef } }))?.productionStage;

    expect(await stageOf('BK001')).toBe('PUBLISHED_LIVE');
    expect(await stageOf('BK013')).toBe('COVER_DESIGN');
    expect(await stageOf('BK015')).toBe('TYPESETTING');
  });

  it('keeps the same Books and IDs when it runs again', async () => {
    await seed(prisma);
    const before = await prisma.book.findUnique({ where: { externalRef: 'BK001' } });

    await seed(prisma);

    expect(await prisma.book.count()).toBe(18);
    const after = await prisma.book.findUnique({ where: { externalRef: 'BK001' } });
    expect(after?.id).toBe(before?.id);
  });
});
