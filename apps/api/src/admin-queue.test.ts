import type { AdminQueueResponse, AdminQueueTicket } from '@bookleaf/shared';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  createAdmin,
  createAuthor,
  createBook,
  createTicket,
  makeTestApp,
  prisma,
  resetDatabase,
  signedInAgent,
} from './testing/harness';

beforeEach(resetDatabase);

const ADMIN_EMAIL = 'asha@example.com';

function subjects({ tickets }: AdminQueueResponse) {
  return tickets.map(({ subject }) => subject);
}

function createKavita() {
  return createAuthor({ email: 'kavita@example.com', name: 'Kavita Deshmukh', externalRef: 'AUTH009' });
}

function createAnanya() {
  return createAuthor({ email: 'ananya@example.com', name: 'Ananya Reddy', externalRef: 'AUTH003' });
}

describe('the Admin queue', () => {
  it("shows an Admin every Author's Tickets", async () => {
    const kavita = await createKavita();
    const ananya = await createAnanya();
    const admin = await createAdmin({ email: ADMIN_EMAIL, name: 'Asha Rao' });
    const book = await createBook(kavita.id, { title: 'Raising Roots' });
    const kavitasTicket = await createTicket(kavita.id, {
      subject: 'Stuck in typesetting',
      bookId: book.id,
      category: 'BOOK_STATUS_PRODUCTION',
      priority: 'MEDIUM',
      categorySource: 'AI',
      prioritySource: 'AI',
      status: 'IN_PROGRESS',
      assigneeId: admin.id,
      createdAt: new Date('2026-01-13T10:00:00.000Z'),
    });
    const ananyasTicket = await createTicket(ananya.id, {
      subject: 'Change my bank details',
      createdAt: new Date('2026-01-14T10:00:00.000Z'),
    });
    const agent = await signedInAgent(makeTestApp(), ADMIN_EMAIL);

    const res = await agent.get('/api/admin/tickets');

    expect(res.status).toBe(200);
    expect(res.body.tickets).toEqual([
      {
        id: ananyasTicket.id,
        reference: `BL-${ananyasTicket.referenceNumber}`,
        subject: 'Change my bank details',
        status: 'OPEN',
        author: { id: ananya.id, name: 'Ananya Reddy' },
        book: null,
        category: null,
        priority: null,
        assignee: null,
        awaitingAdmin: true,
        waitingSince: '2026-01-14T10:00:00.000Z',
        createdAt: '2026-01-14T10:00:00.000Z',
      },
      {
        id: kavitasTicket.id,
        reference: `BL-${kavitasTicket.referenceNumber}`,
        subject: 'Stuck in typesetting',
        status: 'IN_PROGRESS',
        author: { id: kavita.id, name: 'Kavita Deshmukh' },
        book: { id: book.id, title: 'Raising Roots' },
        category: 'BOOK_STATUS_PRODUCTION',
        priority: 'MEDIUM',
        assignee: { id: admin.id, name: 'Asha Rao' },
        awaitingAdmin: true,
        waitingSince: '2026-01-13T10:00:00.000Z',
        createdAt: '2026-01-13T10:00:00.000Z',
      },
    ]);
  });

  it('leaves out Resolved and Closed Tickets by default', async () => {
    const kavita = await createKavita();
    await createAdmin({ email: ADMIN_EMAIL });
    await createTicket(kavita.id, { subject: 'Open', status: 'OPEN' });
    await createTicket(kavita.id, { subject: 'In Progress', status: 'IN_PROGRESS' });
    await createTicket(kavita.id, { subject: 'Resolved', status: 'RESOLVED' });
    await createTicket(kavita.id, { subject: 'Closed', status: 'CLOSED' });
    const agent = await signedInAgent(makeTestApp(), ADMIN_EMAIL);

    const res = await agent.get('/api/admin/tickets');

    expect(subjects(res.body)).toEqual(['Open', 'In Progress']);
  });

  it('puts the most urgent Tickets first, and among equals the Author who has waited longest', async () => {
    const kavita = await createKavita();
    await createAdmin({ email: ADMIN_EMAIL });
    const waitingSince = (day: number) => ({ latestAuthorMessageAt: new Date(Date.UTC(2026, 0, day, 10)) });
    const classifiedAs = (priority: 'CRITICAL' | 'HIGH' | 'LOW') => ({ category: 'GENERAL_INQUIRY', priority }) as const;
    await createTicket(kavita.id, { subject: 'Low, oldest', ...classifiedAs('LOW'), ...waitingSince(1) });
    await createTicket(kavita.id, { subject: 'High, newer', ...classifiedAs('HIGH'), ...waitingSince(9) });
    await createTicket(kavita.id, { subject: 'High, older', ...classifiedAs('HIGH'), ...waitingSince(8) });
    await createTicket(kavita.id, { subject: 'Unclassified', ...waitingSince(10) });
    await createTicket(kavita.id, { subject: 'Critical', ...classifiedAs('CRITICAL'), ...waitingSince(11) });
    const agent = await signedInAgent(makeTestApp(), ADMIN_EMAIL);

    const res = await agent.get('/api/admin/tickets');

    expect(subjects(res.body)).toEqual(['Critical', 'Unclassified', 'High, older', 'High, newer', 'Low, oldest']);
  });

  it('tracks whose move it is from the latest Message, and the wait from the latest Author Message', async () => {
    const kavita = await createKavita();
    const admin = await createAdmin({ email: ADMIN_EMAIL });
    const answered = await createTicket(kavita.id, { subject: 'Answered' });
    await prisma.message.create({
      data: { ticketId: answered.id, adminId: admin.id, body: 'Looking into it', createdAt: new Date('2026-01-15T12:00:00.000Z') },
    });
    const wroteAgain = await createTicket(kavita.id, {
      subject: 'Author wrote again',
      latestAuthorMessageAt: new Date('2026-01-15T13:00:00.000Z'),
    });
    await prisma.message.create({
      data: { ticketId: wroteAgain.id, adminId: admin.id, body: 'Looking into it', createdAt: new Date('2026-01-15T12:00:00.000Z') },
    });
    await prisma.message.create({
      data: { ticketId: wroteAgain.id, authorId: kavita.id, body: 'Any news?', createdAt: new Date('2026-01-15T13:00:00.000Z') },
    });
    const agent = await signedInAgent(makeTestApp(), ADMIN_EMAIL);

    const res = await agent.get('/api/admin/tickets');

    expect(res.body.tickets.map(({ subject, awaitingAdmin, waitingSince }: AdminQueueTicket) => [subject, awaitingAdmin, waitingSince])).toEqual([
      ['Answered', false, '2026-01-15T10:00:00.000Z'],
      ['Author wrote again', true, '2026-01-15T13:00:00.000Z'],
    ]);
  });
});

describe('filtering the Admin queue', () => {
  it('filters by each Ticket Status', async () => {
    const kavita = await createKavita();
    await createAdmin({ email: ADMIN_EMAIL });
    await createTicket(kavita.id, { subject: 'Open', status: 'OPEN' });
    await createTicket(kavita.id, { subject: 'In Progress', status: 'IN_PROGRESS' });
    await createTicket(kavita.id, { subject: 'Resolved', status: 'RESOLVED' });
    await createTicket(kavita.id, { subject: 'Closed', status: 'CLOSED' });
    const agent = await signedInAgent(makeTestApp(), ADMIN_EMAIL);

    const open = await agent.get('/api/admin/tickets').query({ status: 'OPEN' });
    const inProgress = await agent.get('/api/admin/tickets').query({ status: 'IN_PROGRESS' });
    const resolved = await agent.get('/api/admin/tickets').query({ status: 'RESOLVED' });
    const closed = await agent.get('/api/admin/tickets').query({ status: 'CLOSED' });

    expect(subjects(open.body)).toEqual(['Open']);
    expect(subjects(inProgress.body)).toEqual(['In Progress']);
    expect(subjects(resolved.body)).toEqual(['Resolved']);
    expect(subjects(closed.body)).toEqual(['Closed']);
  });

  it('shows every Ticket Status on request, with unresolved Tickets first', async () => {
    const kavita = await createKavita();
    await createAdmin({ email: ADMIN_EMAIL });
    await createTicket(kavita.id, { subject: 'Closed critical', status: 'CLOSED', category: 'GENERAL_INQUIRY', priority: 'CRITICAL' });
    await createTicket(kavita.id, { subject: 'Open low', status: 'OPEN', category: 'GENERAL_INQUIRY', priority: 'LOW' });
    const agent = await signedInAgent(makeTestApp(), ADMIN_EMAIL);

    const res = await agent.get('/api/admin/tickets').query({ status: 'ALL' });

    expect(subjects(res.body)).toEqual(['Open low', 'Closed critical']);
  });

  it('filters by Category and by Priority', async () => {
    const kavita = await createKavita();
    await createAdmin({ email: ADMIN_EMAIL });
    await createTicket(kavita.id, { subject: 'ISBN high', category: 'ISBN_METADATA', priority: 'HIGH' });
    await createTicket(kavita.id, { subject: 'ISBN low', category: 'ISBN_METADATA', priority: 'LOW' });
    await createTicket(kavita.id, { subject: 'Royalty high', category: 'ROYALTY_PAYMENTS', priority: 'HIGH' });
    await createTicket(kavita.id, { subject: 'Unclassified' });
    const agent = await signedInAgent(makeTestApp(), ADMIN_EMAIL);

    const isbn = await agent.get('/api/admin/tickets').query({ category: 'ISBN_METADATA' });
    const high = await agent.get('/api/admin/tickets').query({ priority: 'HIGH' });
    const both = await agent.get('/api/admin/tickets').query({ category: 'ISBN_METADATA', priority: 'HIGH' });

    expect(subjects(isbn.body)).toEqual(['ISBN high', 'ISBN low']);
    expect(subjects(high.body)).toEqual(['ISBN high', 'Royalty high']);
    expect(subjects(both.body)).toEqual(['ISBN high']);
  });

  it('filters by when the Ticket was raised, not by when the Author last wrote', async () => {
    const kavita = await createKavita();
    await createAdmin({ email: ADMIN_EMAIL });
    const raised = (subject: string, createdAt: string) =>
      createTicket(kavita.id, { subject, createdAt: new Date(createdAt), latestAuthorMessageAt: new Date('2026-01-20T00:00:00.000Z') });
    await raised('Before', '2026-01-09T23:59:59.999Z');
    await raised('At the start', '2026-01-10T00:00:00.000Z');
    await raised('Just inside the end', '2026-01-11T23:59:59.999Z');
    await raised('At the end', '2026-01-12T00:00:00.000Z');
    const agent = await signedInAgent(makeTestApp(), ADMIN_EMAIL);

    const range = await agent
      .get('/api/admin/tickets')
      .query({ createdFrom: '2026-01-10T00:00:00.000Z', createdBefore: '2026-01-12T00:00:00.000Z' });
    const from = await agent.get('/api/admin/tickets').query({ createdFrom: '2026-01-12T00:00:00.000Z' });
    const before = await agent.get('/api/admin/tickets').query({ createdBefore: '2026-01-10T00:00:00.000Z' });

    expect(subjects(range.body)).toEqual(['At the start', 'Just inside the end']);
    expect(subjects(from.body)).toEqual(['At the end']);
    expect(subjects(before.body)).toEqual(['Before']);
  });

  it("filters to the calling Admin's own Tickets", async () => {
    const kavita = await createKavita();
    const asha = await createAdmin({ email: ADMIN_EMAIL });
    const dev = await createAdmin({ email: 'dev@example.com' });
    await createTicket(kavita.id, { subject: 'Asha holds this', assigneeId: asha.id });
    await createTicket(kavita.id, { subject: 'Dev holds this', assigneeId: dev.id });
    await createTicket(kavita.id, { subject: 'Nobody holds this' });
    const app = makeTestApp();
    const ashaAgent = await signedInAgent(app, ADMIN_EMAIL);
    const devAgent = await signedInAgent(app, 'dev@example.com');

    const ashas = await ashaAgent.get('/api/admin/tickets').query({ assignedToMe: 'true' });
    const devs = await devAgent.get('/api/admin/tickets').query({ assignedToMe: 'true' });
    const everyones = await ashaAgent.get('/api/admin/tickets').query({ assignedToMe: 'false' });

    expect(subjects(ashas.body)).toEqual(['Asha holds this']);
    expect(subjects(devs.body)).toEqual(['Dev holds this']);
    expect(everyones.body.tickets).toHaveLength(3);
  });

  it('returns an empty list when nothing matches', async () => {
    const kavita = await createKavita();
    await createAdmin({ email: ADMIN_EMAIL });
    await createTicket(kavita.id);
    const agent = await signedInAgent(makeTestApp(), ADMIN_EMAIL);

    const res = await agent.get('/api/admin/tickets').query({ status: 'CLOSED' });

    expect(res.status).toBe(200);
    expect(res.body.tickets).toEqual([]);
  });

  it('names each bad filter', async () => {
    await createAdmin({ email: ADMIN_EMAIL });
    const agent = await signedInAgent(makeTestApp(), ADMIN_EMAIL);

    const res = await agent.get('/api/admin/tickets').query({ status: 'NOPE', createdFrom: 'yesterday' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    expect(res.body.error.details.fields.map(({ field }: { field: string }) => field)).toEqual([
      'query.status',
      'query.createdFrom',
    ]);
  });
});

describe('access to the Admin queue', () => {
  it('returns 404 to an Author, even for a bad filter, so the route looks like it does not exist', async () => {
    await createKavita();
    const agent = await signedInAgent(makeTestApp(), 'kavita@example.com');

    const list = await agent.get('/api/admin/tickets');
    const badFilter = await agent.get('/api/admin/tickets').query({ status: 'NOPE' });
    const missing = await agent.get('/api/admin/no-such-route');

    expect(list.status).toBe(404);
    expect(list.body).toEqual({ error: { code: 'NOT_FOUND', message: 'Not found.', details: null } });
    expect(badFilter.status).toBe(404);
    expect(badFilter.body).toEqual(list.body);
    expect(missing.body).toEqual(list.body);
  });

  it('returns 401 when not logged in', async () => {
    const res = await request(makeTestApp()).get('/api/admin/tickets');

    expect(res.status).toBe(401);
  });
});

describe('the API docs', () => {
  it('document the Admin queue and its filters', async () => {
    const { body } = await request(makeTestApp()).get('/docs/openapi.json');

    const list = body.paths['/api/admin/tickets'].get;
    expect(list.parameters.map(({ name }: { name: string }) => name)).toEqual([
      'status',
      'category',
      'priority',
      'createdFrom',
      'createdBefore',
      'assignedToMe',
    ]);
    expect(Object.keys(list.responses).sort()).toEqual(['200', '400', '401', '404', '500']);
  });
});
