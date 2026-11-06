import type { AdminQueueTicket, InternalNote, Message } from '@bookleaf/shared';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import sampleData from '../prisma/sample-data.json';
import { DEMO_PASSWORD, seed } from './seed';
import { makeTestApp, prisma, resetDatabase, signedInAgent } from './testing/harness';

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

  describe('Tickets', () => {
    const NOW = new Date('2026-03-10T12:00:00.000Z');

    async function adminQueue(query: Record<string, string> = {}) {
      const { admins } = await seed(prisma, NOW);
      const agent = await signedInAgent(makeTestApp(), admins[0] as string, DEMO_PASSWORD);
      return (await agent.get('/api/admin/tickets').query(query)).body.tickets as AdminQueueTicket[];
    }

    it('fills the queue across different Authors and mixed Ticket Statuses, without AI', async () => {
      const tickets = await adminQueue({ status: 'ALL' });

      expect(tickets).toHaveLength(6);
      expect(new Set(tickets.map(({ author }) => author.id)).size).toBe(6);
      expect(new Set(tickets.map(({ status }) => status))).toEqual(
        new Set(['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED']),
      );

      const rows = await prisma.ticket.findMany();
      for (const row of rows) {
        expect(row).toMatchObject({
          category: expect.any(String),
          priority: expect.any(String),
          categorySource: expect.any(String),
          prioritySource: expect.any(String),
        });
      }
    });

    it('shows live work on the first visit, with some of it Awaiting Admin', async () => {
      const tickets = await adminQueue();

      expect(tickets.length).toBeGreaterThanOrEqual(3);
      expect(tickets.some(({ awaitingAdmin }) => awaitingAdmin)).toBe(true);
      expect(tickets.some(({ awaitingAdmin }) => !awaitingAdmin)).toBe(true);
      expect(tickets[0]?.priority).toBe('CRITICAL');
    });

    it('includes a back-and-forth thread, whose wait runs from the latest Author Message', async () => {
      await seed(prisma, NOW);

      const tickets = await prisma.ticket.findMany({
        include: { messages: { orderBy: { createdAt: 'asc' } } },
      });

      const backAndForth = tickets.find(({ messages }) => {
        const senders = messages.map(({ authorId }) => (authorId ? 'AUTHOR' : 'ADMIN'));
        return senders.join() === 'AUTHOR,ADMIN,AUTHOR';
      });
      expect(backAndForth).toBeDefined();
      expect(backAndForth?.latestAuthorMessageAt).toEqual(backAndForth?.messages[2]?.createdAt);
      expect(backAndForth?.lastUpdateAt).toEqual(backAndForth?.messages[2]?.createdAt);
    });

    it('stays out of the way of Tickets raised through the portal', async () => {
      await seed(prisma, NOW);

      const rows = await prisma.ticket.findMany();

      for (const { referenceNumber } of rows) expect(referenceNumber).toBeLessThan(1001);
    });

    // Reads the first seeded Ticket with an Internal Note the way an Admin's workspace does.
    async function ticketWithInternalNote() {
      const { admins } = await seed(prisma, NOW);
      const agent = await signedInAgent(makeTestApp(), admins[0] as string, DEMO_PASSWORD);
      const { tickets } = (await agent.get('/api/admin/tickets').query({ status: 'ALL' })).body as {
        tickets: AdminQueueTicket[];
      };
      for (const { id } of tickets) {
        const { notes } = (await agent.get(`/api/admin/tickets/${id}/internal-notes`)).body as { notes: InternalNote[] };
        const [note] = notes;
        if (note) return { agent, id, note };
      }
      throw new Error('No seeded Ticket has an Internal Note.');
    }

    it('puts an Internal Note among the Messages of a seeded Ticket, which its Author can not see', async () => {
      const { agent, id, note } = await ticketWithInternalNote();

      expect(note).toMatchObject({ adminName: expect.any(String), body: expect.any(String) });
      const { messages } = (await agent.get(`/api/tickets/${id}/messages`)).body as { messages: Message[] };
      const times = messages.map(({ createdAt }) => createdAt);
      expect(note.createdAt > (times[0] as string)).toBe(true);
      expect(note.createdAt < (times.at(-1) as string)).toBe(true);

      const { author } = await prisma.ticket.findUniqueOrThrow({ where: { id }, select: { author: true } });
      const asAuthor = await signedInAgent(makeTestApp(), author.email, DEMO_PASSWORD);
      const seen = await Promise.all(
        ['', '/messages', '/events'].map((path) => asAuthor.get(`/api/tickets/${id}${path}`).expect(200)),
      );
      for (const res of seen) expect(JSON.stringify(res.body)).not.toContain(note.body);
    });

    it('records how each seeded Ticket reached its status, which its Author can also see', async () => {
      await seed(prisma, NOW);

      const tickets = await prisma.ticket.findMany({
        where: { status: { not: 'OPEN' } },
        include: { events: { where: { kind: 'STATUS_CHANGED' }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] } },
      });

      expect(tickets.map(({ status }) => status)).toEqual(expect.arrayContaining(['IN_PROGRESS', 'RESOLVED', 'CLOSED']));
      for (const { status, events } of tickets) {
        expect(events[0]?.before).toBe('OPEN');
        expect(events.at(-1)?.after).toBe(status);
        for (const event of events) expect(event).toMatchObject({ visibleToAuthor: true, authorId: null });
      }
    });

    it('records a Priority an Admin overrode, for Admins only', async () => {
      await seed(prisma, NOW);

      const { events } = await prisma.ticket.findFirstOrThrow({
        where: { prioritySource: 'ADMIN' },
        select: { events: { where: { kind: 'PRIORITY_OVERRIDDEN' } } },
      });

      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({ before: 'MEDIUM', after: 'HIGH', visibleToAuthor: false });
    });

    it('adds Internal Notes and Ticket Events to Tickets seeded before they existed, in their right place', async () => {
      await seed(prisma, NOW);
      await prisma.internalNote.deleteMany();
      await prisma.ticketEvent.deleteMany();

      await seed(prisma, new Date('2026-03-20T12:00:00.000Z'));

      const note = await prisma.internalNote.findFirstOrThrow();
      const messages = await prisma.message.findMany({ where: { ticketId: note.ticketId }, orderBy: { createdAt: 'asc' } });
      expect(note.createdAt > (messages[0] as { createdAt: Date }).createdAt).toBe(true);
      expect(note.createdAt < (messages.at(-1) as { createdAt: Date }).createdAt).toBe(true);
      expect(await prisma.ticketEvent.count()).toBeGreaterThan(0);
    });

    it("doesn't duplicate Internal Notes or Ticket Events when it runs again", async () => {
      await seed(prisma, NOW);
      const notes = await prisma.internalNote.count();
      const events = await prisma.ticketEvent.count();
      expect(notes).toBeGreaterThan(0);

      await seed(prisma, new Date('2026-03-20T12:00:00.000Z'));

      expect(await prisma.internalNote.count()).toBe(notes);
      expect(await prisma.ticketEvent.count()).toBe(events);
    });

    it("can run again without duplicating Tickets or undoing an Admin's work", async () => {
      await seed(prisma, NOW);
      const before = await prisma.ticket.findFirstOrThrow({ where: { status: 'OPEN' } });
      await prisma.ticket.update({ where: { id: before.id }, data: { status: 'CLOSED' } });

      await seed(prisma, new Date('2026-03-20T12:00:00.000Z'));

      expect(await prisma.ticket.count()).toBe(6);
      expect(await prisma.message.count({ where: { ticketId: before.id } })).toBe(1);
      const after = await prisma.ticket.findUniqueOrThrow({ where: { id: before.id } });
      expect(after).toMatchObject({ status: 'CLOSED', latestAuthorMessageAt: before.latestAuthorMessageAt });
    });
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
