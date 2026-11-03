import { royaltySummary } from '@bookleaf/shared';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  type BookFixture,
  createAdmin,
  createAuthor,
  createBook,
  fakeClock,
  makeTestApp,
  prisma,
  resetDatabase,
  signedInAgent,
} from './testing/harness';

beforeEach(resetDatabase);

// Kavita's two Books from the sample data, one published and one in production.
const BK016: BookFixture = {
  externalRef: 'BK016',
  title: 'The Nagpur Notebooks',
  isbn: '978-93-5XXXX-16-5',
  genre: 'Essays / Memoir',
  publicationDate: new Date('2024-11-05'),
  productionStage: 'PUBLISHED_LIVE',
  mrp: 299,
  royaltyPerCopy: 25,
  copiesSold: 34,
  royaltyEarned: 850,
  royaltyPaid: 0,
  royaltyPending: 850,
  printPartner: 'In-House',
  availableOn: ['Amazon India', 'BookLeaf Store'],
};
const BK015: BookFixture = {
  externalRef: 'BK015',
  title: 'Raising Roots',
  isbn: '978-93-5XXXX-15-8',
  genre: 'Parenting / Non-Fiction',
  productionStage: 'TYPESETTING',
};
// Ananya's only Book: never paid, and above the threshold.
const BK005: BookFixture = {
  externalRef: 'BK005',
  productionStage: 'PUBLISHED_LIVE',
  copiesSold: 67,
  royaltyEarned: 2546,
  royaltyPaid: 0,
  royaltyPending: 2546,
};

function createKavita() {
  return createAuthor({ email: 'kavita@example.com', externalRef: 'AUTH009' });
}

function createAnanya() {
  return createAuthor({ email: 'ananya@example.com', externalRef: 'AUTH003' });
}

describe("listing the current Author's Books", () => {
  it('returns every Book in order, with its royalty figures', async () => {
    const kavita = await createKavita();
    const published = await createBook(kavita.id, BK016);
    const inProduction = await createBook(kavita.id, BK015);
    const agent = await signedInAgent(makeTestApp(), 'kavita@example.com');

    const res = await agent.get('/api/books');

    expect(res.status).toBe(200);
    expect(res.body.books).toEqual([
      {
        id: inProduction.id,
        externalRef: 'BK015',
        title: 'Raising Roots',
        isbn: '978-93-5XXXX-15-8',
        genre: 'Parenting / Non-Fiction',
        publicationDate: null,
        productionStage: 'TYPESETTING',
        mrp: null,
        royaltyPerCopy: null,
        printPartner: null,
        availableOn: [],
        copiesSold: null,
        royaltyEarned: null,
        royaltyPaid: null,
        royaltyPending: null,
        lastPayoutDate: null,
      },
      {
        id: published.id,
        externalRef: 'BK016',
        title: 'The Nagpur Notebooks',
        isbn: '978-93-5XXXX-16-5',
        genre: 'Essays / Memoir',
        publicationDate: '2024-11-05',
        productionStage: 'PUBLISHED_LIVE',
        mrp: 299,
        royaltyPerCopy: 25,
        printPartner: 'In-House',
        availableOn: ['Amazon India', 'BookLeaf Store'],
        copiesSold: 34,
        royaltyEarned: 850,
        royaltyPaid: 0,
        royaltyPending: 850,
        lastPayoutDate: null,
      },
    ]);
  });

  it("never includes another Author's Books", async () => {
    const kavita = await createKavita();
    const ananya = await createAnanya();
    await createBook(kavita.id, BK016);
    await createBook(ananya.id, BK005);
    const agent = await signedInAgent(makeTestApp(), 'ananya@example.com');

    const res = await agent.get('/api/books');

    expect(res.body.books.map((book: { externalRef: string }) => book.externalRef)).toEqual(['BK005']);
  });

  it('returns an empty list for an Author with no Books', async () => {
    await createKavita();
    const agent = await signedInAgent(makeTestApp(), 'kavita@example.com');

    const res = await agent.get('/api/books');

    expect(res.status).toBe(200);
    expect(res.body.books).toEqual([]);
  });

  it('returns 401 when not logged in', async () => {
    const res = await request(makeTestApp()).get('/api/books');

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('returns 404 to an Admin, who has no Books of their own', async () => {
    await createAdmin({ email: 'asha@example.com' });
    const agent = await signedInAgent(makeTestApp(), 'asha@example.com');

    const res = await agent.get('/api/books');

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});

describe('the royalty summary', () => {
  it('reports Kavita as Below Threshold on ₹850', async () => {
    const kavita = await createKavita();
    await createBook(kavita.id, BK016);
    await createBook(kavita.id, BK015);
    const agent = await signedInAgent(makeTestApp(), 'kavita@example.com');

    const res = await agent.get('/api/books');

    expect(res.body.royalty).toEqual({
      totalEarned: 850,
      totalPaid: 0,
      totalPending: 850,
      lastPayoutDate: null,
      nextPayoutDate: '2026-05-15',
      belowThreshold: true,
      overdue: false,
    });
  });

  it('matches the royalty facts module for an Overdue Author', async () => {
    const ananya = await createAnanya();
    await createBook(ananya.id, BK005);
    const clock = fakeClock();
    const agent = await signedInAgent(makeTestApp({ clock }), 'ananya@example.com');

    const res = await agent.get('/api/books');

    const books = await prisma.book.findMany({ where: { authorId: ananya.id } });
    expect(res.body.royalty).toEqual(royaltySummary(books, clock.now()));
    expect(res.body.royalty.overdue).toBe(true);
  });

  it('reads the date from the clock', async () => {
    await createKavita();
    const clock = fakeClock();
    clock.advanceDays(90);
    const agent = await signedInAgent(makeTestApp({ clock }), 'kavita@example.com');

    const res = await agent.get('/api/books');

    expect(res.body.royalty.nextPayoutDate).toBe('2026-08-14');
  });

  it('has no totals for an Author with no Books', async () => {
    await createKavita();
    const agent = await signedInAgent(makeTestApp(), 'kavita@example.com');

    const res = await agent.get('/api/books');

    expect(res.body.royalty).toMatchObject({ totalEarned: null, totalPaid: null, totalPending: null });
  });
});

describe('reading one Book', () => {
  it("returns the Author's own Book", async () => {
    const kavita = await createKavita();
    const book = await createBook(kavita.id, BK016);
    const agent = await signedInAgent(makeTestApp(), 'kavita@example.com');

    const res = await agent.get(`/api/books/${book.id}`);

    expect(res.status).toBe(200);
    expect(res.body.book).toMatchObject({
      id: book.id,
      title: 'The Nagpur Notebooks',
      royaltyPending: 850,
      lastPayoutDate: null,
    });
  });

  it("answers another Author's Book exactly as it answers a Book that doesn't exist", async () => {
    const kavita = await createKavita();
    await createAnanya();
    const kavitasBook = await createBook(kavita.id, BK016);
    const agent = await signedInAgent(makeTestApp(), 'ananya@example.com');

    const notTheirs = await agent.get(`/api/books/${kavitasBook.id}`);
    const missing = await agent.get('/api/books/no-such-book');

    expect(notTheirs.status).toBe(404);
    expect(notTheirs.body).toEqual({ error: { code: 'NOT_FOUND', message: 'Not found.', details: null } });
    expect(missing.status).toBe(404);
    expect(missing.body).toEqual(notTheirs.body);
  });

  it('returns 401 when not logged in', async () => {
    const res = await request(makeTestApp()).get('/api/books/any-book');

    expect(res.status).toBe(401);
  });

  it('returns 404 to an Admin', async () => {
    const kavita = await createKavita();
    const book = await createBook(kavita.id, BK016);
    await createAdmin({ email: 'asha@example.com' });
    const agent = await signedInAgent(makeTestApp(), 'asha@example.com');

    const res = await agent.get(`/api/books/${book.id}`);

    expect(res.status).toBe(404);
  });
});

describe('the API docs', () => {
  it('document the Books routes from the shared schemas', async () => {
    const { body } = await request(makeTestApp()).get('/docs/openapi.json');

    const list = body.paths['/api/books'].get;
    expect(Object.keys(list.responses['200'].content['application/json'].schema.properties)).toEqual([
      'books',
      'royalty',
    ]);
    expect(Object.keys(body.paths['/api/books/{bookId}'].get.responses).sort()).toEqual([
      '200',
      '400',
      '401',
      '404',
      '500',
    ]);
  });
});
