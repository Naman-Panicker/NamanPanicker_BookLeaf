import { DESCRIPTION_MAX_LENGTH, SUBJECT_MAX_LENGTH } from '@bookleaf/shared';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import {
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

const NOW = '2026-01-15T10:00:00.000Z';

function createKavita() {
  return createAuthor({ email: 'kavita@example.com', externalRef: 'AUTH009' });
}

function createAnanya() {
  return createAuthor({ email: 'ananya@example.com', externalRef: 'AUTH003' });
}

const VALID_TICKET = { bookId: null, subject: 'Change my bank details', description: 'My bank account has changed.' };

describe('raising a Ticket', () => {
  it('raises a General / Account Level Ticket that starts Open', async () => {
    await createKavita();
    const agent = await signedInAgent(makeTestApp(), 'kavita@example.com');

    const res = await agent.post('/api/tickets').send(VALID_TICKET);

    expect(res.status).toBe(201);
    expect(res.body.ticket).toEqual({
      id: expect.any(String),
      reference: expect.stringMatching(/^BL-\d+$/),
      subject: 'Change my bank details',
      status: 'OPEN',
      book: null,
      lastUpdateAt: NOW,
    });
  });

  it("raises a Ticket about the Author's own Book, even one still in production", async () => {
    const kavita = await createKavita();
    const book = await createBook(kavita.id, { title: 'Raising Roots', productionStage: 'TYPESETTING' });
    const agent = await signedInAgent(makeTestApp(), 'kavita@example.com');

    const res = await agent.post('/api/tickets').send({ ...VALID_TICKET, bookId: book.id });

    expect(res.status).toBe(201);
    expect(res.body.ticket.book).toEqual({ id: book.id, title: 'Raising Roots' });
  });

  it("answers another Author's Book exactly as it answers a Book that doesn't exist", async () => {
    const kavita = await createKavita();
    await createAnanya();
    const kavitasBook = await createBook(kavita.id);
    const agent = await signedInAgent(makeTestApp(), 'ananya@example.com');

    const notTheirs = await agent.post('/api/tickets').send({ ...VALID_TICKET, bookId: kavitasBook.id });
    const missing = await agent.post('/api/tickets').send({ ...VALID_TICKET, bookId: 'no-such-book' });

    expect(notTheirs.status).toBe(404);
    expect(notTheirs.body).toEqual({ error: { code: 'NOT_FOUND', message: 'Not found.', details: null } });
    expect(missing.status).toBe(404);
    expect(missing.body).toEqual(notTheirs.body);
    expect(await prisma.ticket.count()).toBe(0);
  });

  it('gives each Ticket the next reference in sequence', async () => {
    await createKavita();
    const agent = await signedInAgent(makeTestApp(), 'kavita@example.com');

    const first = await agent.post('/api/tickets').send(VALID_TICKET);
    const second = await agent.post('/api/tickets').send(VALID_TICKET);

    const number = (reference: string) => Number(reference.replace('BL-', ''));
    expect(number(first.body.ticket.reference)).toBeGreaterThanOrEqual(1001);
    expect(number(second.body.ticket.reference)).toBe(number(first.body.ticket.reference) + 1);
  });

  // No Admin route exposes classification until ticket 05, so this has to read the row.
  it('leaves a new Ticket Unclassified', async () => {
    await createKavita();
    const agent = await signedInAgent(makeTestApp(), 'kavita@example.com');

    const res = await agent.post('/api/tickets').send(VALID_TICKET);

    const ticket = await prisma.ticket.findUniqueOrThrow({ where: { id: res.body.ticket.id } });
    expect(ticket).toMatchObject({ category: null, priority: null });
  });

  it('names each bad field when subject and description are empty', async () => {
    await createKavita();
    const agent = await signedInAgent(makeTestApp(), 'kavita@example.com');

    const res = await agent.post('/api/tickets').send({ bookId: null, subject: '   ', description: '' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    expect(res.body.error.details.fields).toEqual([
      { field: 'subject', message: 'Enter a subject.' },
      { field: 'description', message: 'Describe your problem.' },
    ]);
  });

  it('rejects a subject or description that is too long', async () => {
    await createKavita();
    const agent = await signedInAgent(makeTestApp(), 'kavita@example.com');

    const res = await agent.post('/api/tickets').send({
      bookId: null,
      subject: 'x'.repeat(SUBJECT_MAX_LENGTH + 1),
      description: 'x'.repeat(DESCRIPTION_MAX_LENGTH + 1),
    });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    expect(res.body.error.details.fields.map(({ field }: { field: string }) => field)).toEqual([
      'subject',
      'description',
    ]);
    expect(await prisma.ticket.count()).toBe(0);
  });

  it('accepts a subject and description at the length limit', async () => {
    await createKavita();
    const agent = await signedInAgent(makeTestApp(), 'kavita@example.com');

    const res = await agent.post('/api/tickets').send({
      bookId: null,
      subject: 'x'.repeat(SUBJECT_MAX_LENGTH),
      description: 'x'.repeat(DESCRIPTION_MAX_LENGTH),
    });

    expect(res.status).toBe(201);
  });

  it('requires a choice of Book or General / Account Level', async () => {
    await createKavita();
    const agent = await signedInAgent(makeTestApp(), 'kavita@example.com');

    const res = await agent.post('/api/tickets').send({ subject: 'Hello', description: 'Hello there.' });

    expect(res.status).toBe(400);
    expect(res.body.error.details.fields).toEqual([
      { field: 'bookId', message: 'Choose a Book or General / Account Level.' },
    ]);
  });

  it('returns 401 when not logged in', async () => {
    const res = await request(makeTestApp()).post('/api/tickets').send(VALID_TICKET);

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('returns 404 to an Admin, who has no Books or account to raise a Ticket about', async () => {
    await createAdmin({ email: 'asha@example.com' });
    const agent = await signedInAgent(makeTestApp(), 'asha@example.com');

    const res = await agent.post('/api/tickets').send(VALID_TICKET);

    expect(res.status).toBe(404);
  });
});

describe('listing My Tickets', () => {
  it("returns only the current Author's Tickets, most recently updated first", async () => {
    const kavita = await createKavita();
    await createAnanya();
    const book = await createBook(kavita.id, { title: 'Raising Roots' });
    const clock = fakeClock();
    const app = makeTestApp({ clock });
    const kavitaAgent = await signedInAgent(app, 'kavita@example.com');
    const ananyaAgent = await signedInAgent(app, 'ananya@example.com');

    const older = await kavitaAgent.post('/api/tickets').send({ ...VALID_TICKET, subject: 'Older' });
    clock.advanceDays(1);
    const newer = await kavitaAgent.post('/api/tickets').send({ ...VALID_TICKET, subject: 'Newer', bookId: book.id });
    await ananyaAgent.post('/api/tickets').send({ ...VALID_TICKET, subject: "Ananya's" });

    const res = await kavitaAgent.get('/api/tickets');

    expect(res.status).toBe(200);
    expect(res.body.tickets).toEqual([newer.body.ticket, older.body.ticket]);
    expect(res.body.tickets[0]).toMatchObject({
      subject: 'Newer',
      status: 'OPEN',
      book: { title: 'Raising Roots' },
      lastUpdateAt: '2026-01-16T10:00:00.000Z',
    });
  });

  it('returns an empty list for an Author with no Tickets', async () => {
    await createKavita();
    const agent = await signedInAgent(makeTestApp(), 'kavita@example.com');

    const res = await agent.get('/api/tickets');

    expect(res.status).toBe(200);
    expect(res.body.tickets).toEqual([]);
  });

  it('returns 401 when not logged in', async () => {
    const res = await request(makeTestApp()).get('/api/tickets');

    expect(res.status).toBe(401);
  });

  it('returns 404 to an Admin for now', async () => {
    await createAdmin({ email: 'asha@example.com' });
    const agent = await signedInAgent(makeTestApp(), 'asha@example.com');

    const res = await agent.get('/api/tickets');

    expect(res.status).toBe(404);
  });
});

describe('reading one Ticket', () => {
  it("returns the Author's own Ticket", async () => {
    await createKavita();
    const agent = await signedInAgent(makeTestApp(), 'kavita@example.com');
    const created = await agent.post('/api/tickets').send(VALID_TICKET);

    const res = await agent.get(`/api/tickets/${created.body.ticket.id}`);

    expect(res.status).toBe(200);
    expect(res.body.ticket).toEqual(created.body.ticket);
  });

  it("answers another Author's Ticket exactly as it answers a Ticket that doesn't exist", async () => {
    await createKavita();
    await createAnanya();
    const app = makeTestApp();
    const kavitaAgent = await signedInAgent(app, 'kavita@example.com');
    const ananyaAgent = await signedInAgent(app, 'ananya@example.com');
    const created = await kavitaAgent.post('/api/tickets').send(VALID_TICKET);

    const notTheirs = await ananyaAgent.get(`/api/tickets/${created.body.ticket.id}`);
    const missing = await ananyaAgent.get('/api/tickets/no-such-ticket');

    expect(notTheirs.status).toBe(404);
    expect(notTheirs.body).toEqual({ error: { code: 'NOT_FOUND', message: 'Not found.', details: null } });
    expect(missing.status).toBe(404);
    expect(missing.body).toEqual(notTheirs.body);
  });

  it('returns 401 when not logged in', async () => {
    const res = await request(makeTestApp()).get('/api/tickets/any-ticket');

    expect(res.status).toBe(401);
  });
});

describe("reading a Ticket's thread", () => {
  it("starts with the Author's description as the first Message", async () => {
    await createKavita();
    const agent = await signedInAgent(makeTestApp(), 'kavita@example.com');
    const created = await agent.post('/api/tickets').send(VALID_TICKET);

    const res = await agent.get(`/api/tickets/${created.body.ticket.id}/messages`);

    expect(res.status).toBe(200);
    expect(res.body.messages).toEqual([
      { id: expect.any(String), sender: 'AUTHOR', body: 'My bank account has changed.', createdAt: NOW },
    ]);
  });

  it('shows Messages in the order they were written, without naming the Admin', async () => {
    const kavita = await createKavita();
    const admin = await createAdmin({ email: 'asha@example.com', name: 'Asha Rao' });
    const agent = await signedInAgent(makeTestApp(), 'kavita@example.com');
    const created = await agent.post('/api/tickets').send(VALID_TICKET);
    const ticketId = created.body.ticket.id;

    // Inserted out of order, so only sorting can put them right.
    await prisma.message.create({
      data: { ticketId, authorId: kavita.id, body: 'Third', createdAt: new Date('2026-01-17T10:00:00.000Z') },
    });
    await prisma.message.create({
      data: { ticketId, adminId: admin.id, body: 'Second', createdAt: new Date('2026-01-16T10:00:00.000Z') },
    });

    const res = await agent.get(`/api/tickets/${ticketId}/messages`);

    expect(res.body.messages.map(({ sender, body }: { sender: string; body: string }) => [sender, body])).toEqual([
      ['AUTHOR', 'My bank account has changed.'],
      ['ADMIN', 'Second'],
      ['AUTHOR', 'Third'],
    ]);
    expect(JSON.stringify(res.body)).not.toContain('Asha');
    expect(JSON.stringify(res.body)).not.toContain(admin.id);
  });

  it("answers another Author's thread exactly as it answers a Ticket that doesn't exist", async () => {
    await createKavita();
    await createAnanya();
    const app = makeTestApp();
    const kavitaAgent = await signedInAgent(app, 'kavita@example.com');
    const ananyaAgent = await signedInAgent(app, 'ananya@example.com');
    const created = await kavitaAgent.post('/api/tickets').send(VALID_TICKET);

    const notTheirs = await ananyaAgent.get(`/api/tickets/${created.body.ticket.id}/messages`);
    const missing = await ananyaAgent.get('/api/tickets/no-such-ticket/messages');

    expect(notTheirs.status).toBe(404);
    expect(notTheirs.body.error.code).toBe('NOT_FOUND');
    expect(missing.body).toEqual(notTheirs.body);
  });

  it('returns 401 when not logged in', async () => {
    const res = await request(makeTestApp()).get('/api/tickets/any-ticket/messages');

    expect(res.status).toBe(401);
  });
});

describe('Admin-only fields', () => {
  const AUTHOR_TICKET_FIELDS = ['book', 'id', 'lastUpdateAt', 'reference', 'status', 'subject'];

  it('stay out of every Author response, even on a classified Ticket', async () => {
    await createKavita();
    const agent = await signedInAgent(makeTestApp(), 'kavita@example.com');
    const created = await agent.post('/api/tickets').send(VALID_TICKET);
    const ticketId = created.body.ticket.id;
    await prisma.ticket.update({
      where: { id: ticketId },
      data: {
        suggestedCategory: 'ROYALTY_PAYMENTS',
        suggestedPriority: 'HIGH',
        category: 'ROYALTY_PAYMENTS',
        priority: 'HIGH',
        categorySource: 'AI',
        prioritySource: 'AI',
        priorityFloor: 'OVERDUE_ROYALTY',
        classificationAttempts: 1,
        classificationError: 'SECRET-AI-ERROR',
      },
    });

    const list = await agent.get('/api/tickets');
    const read = await agent.get(`/api/tickets/${ticketId}`);
    const thread = await agent.get(`/api/tickets/${ticketId}/messages`);

    expect(Object.keys(created.body.ticket).sort()).toEqual(AUTHOR_TICKET_FIELDS);
    expect(Object.keys(list.body.tickets[0]).sort()).toEqual(AUTHOR_TICKET_FIELDS);
    expect(Object.keys(read.body.ticket).sort()).toEqual(AUTHOR_TICKET_FIELDS);
    expect(Object.keys(thread.body.messages[0]).sort()).toEqual(['body', 'createdAt', 'id', 'sender']);
    for (const res of [list, read, thread]) {
      expect(JSON.stringify(res.body)).not.toMatch(/ROYALTY_PAYMENTS|OVERDUE_ROYALTY|SECRET-AI-ERROR/);
    }
  });
});

describe('the API docs', () => {
  it('document the Ticket routes from the shared schemas', async () => {
    const { body } = await request(makeTestApp()).get('/docs/openapi.json');

    const create = body.paths['/api/tickets'].post;
    expect(Object.keys(create.requestBody.content['application/json'].schema.properties)).toEqual([
      'bookId',
      'subject',
      'description',
    ]);
    expect(Object.keys(create.responses).sort()).toEqual(['201', '400', '401', '404', '500']);
    expect(Object.keys(body.paths['/api/tickets/{ticketId}/messages'].get.responses).sort()).toEqual([
      '200',
      '400',
      '401',
      '404',
      '500',
    ]);
  });
});
