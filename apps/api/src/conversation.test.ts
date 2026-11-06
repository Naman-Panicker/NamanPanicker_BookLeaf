import { MESSAGE_MAX_LENGTH } from '@bookleaf/shared';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  createAdmin,
  createAuthor,
  createBook,
  createTicket,
  fakeClock,
  makeTestApp,
  prisma,
  resetDatabase,
  signedInAgent,
} from './testing/harness';

beforeEach(resetDatabase);

const KAVITA_EMAIL = 'kavita@example.com';
const ADMIN_EMAIL = 'asha@example.com';
const NOW = '2026-01-15T10:00:00.000Z';
const NEXT_DAY = '2026-01-16T10:00:00.000Z';

function createKavita() {
  return createAuthor({ email: KAVITA_EMAIL, name: 'Kavita Deshmukh', externalRef: 'AUTH009' });
}

function createAnanya() {
  return createAuthor({ email: 'ananya@example.com', name: 'Ananya Reddy', externalRef: 'AUTH003' });
}

// One Author, one Admin and a shared clock, with the Ticket raised a day before "now".
async function setUp(ticket: Parameters<typeof createTicket>[1] = {}) {
  const kavita = await createKavita();
  const admin = await createAdmin({ email: ADMIN_EMAIL, name: 'Asha Rao' });
  const { id: ticketId } = await createTicket(kavita.id, {
    createdAt: new Date('2026-01-14T10:00:00.000Z'),
    ...ticket,
  });
  const clock = fakeClock();
  const app = makeTestApp({ clock });
  return {
    kavita,
    admin,
    ticketId,
    clock,
    app,
    author: await signedInAgent(app, KAVITA_EMAIL),
    adminAgent: await signedInAgent(app, ADMIN_EMAIL),
  };
}

describe('sending a Message', () => {
  it('moves an Open Ticket to In Progress on the first Admin Message', async () => {
    const { ticketId, author, adminAgent } = await setUp();

    const res = await adminAgent.post(`/api/tickets/${ticketId}/messages`).send({ body: 'Looking into it.' });

    expect(res.status).toBe(201);
    expect(res.body.message).toEqual({
      id: expect.any(String),
      sender: 'ADMIN',
      body: 'Looking into it.',
      createdAt: NOW,
    });
    const ticket = await author.get(`/api/tickets/${ticketId}`);
    expect(ticket.body.ticket.status).toBe('IN_PROGRESS');
  });

  it('accepts both Messages when the Author and an Admin send them at the same moment', async () => {
    const { ticketId, author, adminAgent } = await setUp();

    const responses = await Promise.all([
      author.post(`/api/tickets/${ticketId}/messages`).send({ body: 'Any news?' }),
      adminAgent.post(`/api/tickets/${ticketId}/messages`).send({ body: 'Looking into it.' }),
      author.post(`/api/tickets/${ticketId}/messages`).send({ body: 'Hello?' }),
      adminAgent.post(`/api/tickets/${ticketId}/messages`).send({ body: 'Still looking.' }),
    ]);

    expect(responses.map(({ status }) => status)).toEqual([201, 201, 201, 201]);
    const events = await adminAgent.get(`/api/tickets/${ticketId}/events`);
    expect(events.body.events).toHaveLength(1);
  });

  it('reopens a Resolved Ticket when the Author sends a Message', async () => {
    const { ticketId, author } = await setUp({ status: 'RESOLVED' });

    const res = await author.post(`/api/tickets/${ticketId}/messages`).send({ body: 'It came back.' });

    expect(res.status).toBe(201);
    expect(res.body.message.sender).toBe('AUTHOR');
    const ticket = await author.get(`/api/tickets/${ticketId}`);
    expect(ticket.body.ticket.status).toBe('IN_PROGRESS');
  });

  it('adds the Message to the thread both sides read, without naming the Admin', async () => {
    const { ticketId, author, adminAgent } = await setUp();

    await adminAgent.post(`/api/tickets/${ticketId}/messages`).send({ body: 'Looking into it.' });

    const asAuthor = await author.get(`/api/tickets/${ticketId}/messages`);
    expect(asAuthor.body.messages.map(({ body }: { body: string }) => body)).toEqual([
      'Test description',
      'Looking into it.',
    ]);
    expect(JSON.stringify(asAuthor.body)).not.toContain('Asha');
    expect(Object.keys(asAuthor.body.messages[1]).sort()).toEqual(['body', 'createdAt', 'id', 'sender']);
  });

  it('names who wrote each Message for an Admin reading the thread', async () => {
    const { ticketId, adminAgent } = await setUp();

    await adminAgent.post(`/api/tickets/${ticketId}/messages`).send({ body: 'Looking into it.' });

    const res = await adminAgent.get(`/api/tickets/${ticketId}/messages`);
    expect(res.status).toBe(200);
    expect(res.body.messages.map(({ sender, senderName, body }: Record<string, string>) => [sender, senderName, body])).toEqual([
      ['AUTHOR', 'Kavita Deshmukh', 'Test description'],
      ['ADMIN', 'Asha Rao', 'Looking into it.'],
    ]);
  });

  it.each([
    ['an Author', KAVITA_EMAIL],
    ['an Admin', ADMIN_EMAIL],
  ])('returns CONFLICT to %s posting on a Closed Ticket, and stores nothing', async (_who, email) => {
    const { ticketId, app, adminAgent } = await setUp({ status: 'CLOSED' });
    const agent = await signedInAgent(app, email);

    const res = await agent.post(`/api/tickets/${ticketId}/messages`).send({ body: 'One more thing.' });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
    const thread = await adminAgent.get(`/api/tickets/${ticketId}/messages`);
    expect(thread.body.messages).toHaveLength(1);
  });

  it("moves the Author's waiting time on an Author Message, and not on an Admin Message", async () => {
    const { ticketId, clock, author, adminAgent } = await setUp();
    const waitingSince = async () => {
      const queue = await adminAgent.get('/api/admin/tickets');
      return queue.body.tickets[0].waitingSince;
    };

    await adminAgent.post(`/api/tickets/${ticketId}/messages`).send({ body: 'Looking into it.' });
    expect(await waitingSince()).toBe('2026-01-14T10:00:00.000Z');

    clock.advanceDays(1);
    await author.post(`/api/tickets/${ticketId}/messages`).send({ body: 'Any news?' });
    expect(await waitingSince()).toBe(NEXT_DAY);
  });

  it('keeps Awaiting Admin true only while the latest Message is from the Author', async () => {
    const { ticketId, clock, author, adminAgent } = await setUp();
    const awaitingAdmin = async () => {
      const queue = await adminAgent.get('/api/admin/tickets');
      return queue.body.tickets[0].awaitingAdmin;
    };

    await adminAgent.post(`/api/tickets/${ticketId}/messages`).send({ body: 'Looking into it.' });
    expect(await awaitingAdmin()).toBe(false);

    clock.advanceDays(1);
    await author.post(`/api/tickets/${ticketId}/messages`).send({ body: 'Any news?' });
    expect(await awaitingAdmin()).toBe(true);
  });

  it("moves the Author's Last update on every Message", async () => {
    const { ticketId, clock, author, adminAgent } = await setUp();
    const lastUpdateAt = async () => (await author.get(`/api/tickets/${ticketId}`)).body.ticket.lastUpdateAt;

    await adminAgent.post(`/api/tickets/${ticketId}/messages`).send({ body: 'Looking into it.' });
    expect(await lastUpdateAt()).toBe(NOW);

    clock.advanceDays(1);
    await author.post(`/api/tickets/${ticketId}/messages`).send({ body: 'Any news?' });
    expect(await lastUpdateAt()).toBe(NEXT_DAY);
  });

  it("answers a Message on another Author's Ticket exactly as it answers a Ticket that doesn't exist", async () => {
    const { ticketId, app } = await setUp();
    await createAnanya();
    const ananya = await signedInAgent(app, 'ananya@example.com');

    const notTheirs = await ananya.post(`/api/tickets/${ticketId}/messages`).send({ body: 'Hello?' });
    const missing = await ananya.post('/api/tickets/no-such-ticket/messages').send({ body: 'Hello?' });

    expect(notTheirs.status).toBe(404);
    expect(notTheirs.body).toEqual({ error: { code: 'NOT_FOUND', message: 'Not found.', details: null } });
    expect(missing.status).toBe(404);
    expect(missing.body).toEqual(notTheirs.body);
  });

  it('rejects an empty Message and one over the length limit', async () => {
    const { ticketId, author } = await setUp();

    const empty = await author.post(`/api/tickets/${ticketId}/messages`).send({ body: '   ' });
    const tooLong = await author.post(`/api/tickets/${ticketId}/messages`).send({ body: 'x'.repeat(MESSAGE_MAX_LENGTH + 1) });

    expect(empty.status).toBe(400);
    expect(empty.body.error.details.fields).toEqual([{ field: 'body', message: 'Write a Message.' }]);
    expect(tooLong.status).toBe(400);
    expect(tooLong.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('returns 401 when not logged in', async () => {
    const res = await request(makeTestApp()).post('/api/tickets/any-ticket/messages').send({ body: 'Hello?' });

    expect(res.status).toBe(401);
  });
});

describe('confirming a resolution', () => {
  it('closes a Resolved Ticket when its Author confirms', async () => {
    const { ticketId, author } = await setUp({ status: 'RESOLVED' });

    const res = await author.post(`/api/tickets/${ticketId}/resolution-confirmation`);

    expect(res.status).toBe(200);
    expect(res.body.ticket).toMatchObject({ id: ticketId, status: 'CLOSED', lastUpdateAt: NOW });
  });

  it.each(['OPEN', 'IN_PROGRESS', 'CLOSED'] as const)('returns CONFLICT on a Ticket that is %s', async (status) => {
    const { ticketId, author } = await setUp({ status });

    const res = await author.post(`/api/tickets/${ticketId}/resolution-confirmation`);

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
    const ticket = await author.get(`/api/tickets/${ticketId}`);
    expect(ticket.body.ticket.status).toBe(status);
  });

  it('takes effect once when the Author confirms twice at the same moment', async () => {
    const { ticketId, author, adminAgent } = await setUp({ status: 'RESOLVED' });

    const responses = await Promise.all([
      author.post(`/api/tickets/${ticketId}/resolution-confirmation`),
      author.post(`/api/tickets/${ticketId}/resolution-confirmation`),
    ]);

    expect(responses.map(({ status }) => status).sort()).toEqual([200, 409]);
    const events = await adminAgent.get(`/api/tickets/${ticketId}/events`);
    expect(events.body.events).toHaveLength(1);
  });

  it("returns 404 on another Author's Ticket", async () => {
    const { ticketId, app } = await setUp({ status: 'RESOLVED' });
    await createAnanya();
    const ananya = await signedInAgent(app, 'ananya@example.com');

    const res = await ananya.post(`/api/tickets/${ticketId}/resolution-confirmation`);

    expect(res.status).toBe(404);
  });

  it('returns 404 to an Admin, because only the Author can say it solved their problem', async () => {
    const { ticketId, adminAgent, author } = await setUp({ status: 'RESOLVED' });

    const res = await adminAgent.post(`/api/tickets/${ticketId}/resolution-confirmation`);

    expect(res.status).toBe(404);
    const ticket = await author.get(`/api/tickets/${ticketId}`);
    expect(ticket.body.ticket.status).toBe('RESOLVED');
  });
});

describe('changing a status by hand', () => {
  it('lets an Admin resolve a Ticket, which the Author then sees', async () => {
    const { ticketId, author, adminAgent } = await setUp({ status: 'IN_PROGRESS' });

    const res = await adminAgent.put(`/api/admin/tickets/${ticketId}/status`).send({ status: 'RESOLVED' });

    expect(res.status).toBe(200);
    expect(res.body.ticket).toMatchObject({ id: ticketId, status: 'RESOLVED' });
    const ticket = await author.get(`/api/tickets/${ticketId}`);
    expect(ticket.body.ticket).toMatchObject({ status: 'RESOLVED', lastUpdateAt: NOW });
  });

  it('lets an Admin reopen a Closed Ticket, after which Messages are allowed again', async () => {
    const { ticketId, author, adminAgent } = await setUp({ status: 'CLOSED' });

    await adminAgent.put(`/api/admin/tickets/${ticketId}/status`).send({ status: 'OPEN' });

    const res = await author.post(`/api/tickets/${ticketId}/messages`).send({ body: 'Thank you.' });
    expect(res.status).toBe(201);
  });

  it("doesn't move the Author's Last update or record anything when the status is the same", async () => {
    const { ticketId, author, adminAgent } = await setUp({ status: 'IN_PROGRESS' });

    const res = await adminAgent.put(`/api/admin/tickets/${ticketId}/status`).send({ status: 'IN_PROGRESS' });

    expect(res.status).toBe(200);
    const ticket = await author.get(`/api/tickets/${ticketId}`);
    expect(ticket.body.ticket.lastUpdateAt).toBe('2026-01-14T10:00:00.000Z');
    const events = await adminAgent.get(`/api/tickets/${ticketId}/events`);
    expect(events.body.events).toEqual([]);
  });

  it('returns 404 to an Author, even for their own Ticket and a bad request', async () => {
    const { ticketId, author } = await setUp({ status: 'RESOLVED' });

    const valid = await author.put(`/api/admin/tickets/${ticketId}/status`).send({ status: 'CLOSED' });
    const invalid = await author.put(`/api/admin/tickets/${ticketId}/status`).send({ status: 'NOT-A-STATUS' });

    expect(valid.status).toBe(404);
    expect(invalid.status).toBe(404);
    expect(invalid.body).toEqual(valid.body);
    const ticket = await author.get(`/api/tickets/${ticketId}`);
    expect(ticket.body.ticket.status).toBe('RESOLVED');
  });

  it('rejects a status that does not exist', async () => {
    const { ticketId, adminAgent } = await setUp();

    const res = await adminAgent.put(`/api/admin/tickets/${ticketId}/status`).send({ status: 'NOT-A-STATUS' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('returns 404 for a Ticket that does not exist', async () => {
    const { adminAgent } = await setUp();

    const res = await adminAgent.put('/api/admin/tickets/no-such-ticket/status').send({ status: 'CLOSED' });

    expect(res.status).toBe(404);
  });
});

describe('listing Ticket Events', () => {
  const STATUS_CHANGE_FIELDS = ['actor', 'after', 'before', 'createdAt', 'id', 'kind'];

  it('records each status change with who made it, the values and the time', async () => {
    const { ticketId, clock, author, adminAgent } = await setUp();

    await adminAgent.post(`/api/tickets/${ticketId}/messages`).send({ body: 'Looking into it.' });
    clock.advanceDays(1);
    await adminAgent.put(`/api/admin/tickets/${ticketId}/status`).send({ status: 'RESOLVED' });
    clock.advanceDays(1);
    await author.post(`/api/tickets/${ticketId}/messages`).send({ body: 'It came back.' });
    clock.advanceDays(1);
    await adminAgent.put(`/api/admin/tickets/${ticketId}/status`).send({ status: 'RESOLVED' });
    clock.advanceDays(1);
    await author.post(`/api/tickets/${ticketId}/resolution-confirmation`);

    const res = await adminAgent.get(`/api/tickets/${ticketId}/events`);

    expect(res.status).toBe(200);
    expect(
      res.body.events.map(({ actorName, before, after, createdAt }: Record<string, string>) => [
        actorName,
        before,
        after,
        createdAt,
      ]),
    ).toEqual([
      ['Asha Rao', 'OPEN', 'IN_PROGRESS', NOW],
      ['Asha Rao', 'IN_PROGRESS', 'RESOLVED', NEXT_DAY],
      ['Kavita Deshmukh', 'RESOLVED', 'IN_PROGRESS', '2026-01-17T10:00:00.000Z'],
      ['Asha Rao', 'IN_PROGRESS', 'RESOLVED', '2026-01-18T10:00:00.000Z'],
      ['Kavita Deshmukh', 'RESOLVED', 'CLOSED', '2026-01-19T10:00:00.000Z'],
    ]);
  });

  it("records nothing for a Message that doesn't change the status", async () => {
    const { ticketId, author, adminAgent } = await setUp();

    await author.post(`/api/tickets/${ticketId}/messages`).send({ body: 'Any news?' });

    const res = await adminAgent.get(`/api/tickets/${ticketId}/events`);
    expect(res.body.events).toEqual([]);
  });

  it('shows an Author only status changes, without the name of the Admin or any reason', async () => {
    const { ticketId, admin, author, adminAgent } = await setUp({ status: 'IN_PROGRESS' });
    await adminAgent.put(`/api/admin/tickets/${ticketId}/status`).send({ status: 'RESOLVED' });
    await prisma.ticketEvent.create({
      data: {
        ticketId,
        kind: 'TAKEOVER_FORCED',
        adminId: admin.id,
        before: 'SOME-ADMIN',
        after: 'OTHER-ADMIN',
        reason: 'SECRET-REASON',
        visibleToAuthor: false,
      },
    });

    const res = await author.get(`/api/tickets/${ticketId}/events`);

    expect(res.status).toBe(200);
    expect(res.body.events).toEqual([
      {
        id: expect.any(String),
        kind: 'STATUS_CHANGED',
        actor: 'ADMIN',
        before: 'IN_PROGRESS',
        after: 'RESOLVED',
        createdAt: NOW,
      },
    ]);
    expect(Object.keys(res.body.events[0]).sort()).toEqual(STATUS_CHANGE_FIELDS);
    expect(JSON.stringify(res.body)).not.toMatch(/Asha|SECRET-REASON|OTHER-ADMIN/);
    expect(JSON.stringify(res.body)).not.toContain(admin.id);
  });

  it('shows an Admin every Ticket Event, with its reason', async () => {
    const { ticketId, admin, adminAgent } = await setUp({ status: 'IN_PROGRESS' });
    await prisma.ticketEvent.create({
      data: { ticketId, kind: 'TAKEOVER_FORCED', adminId: admin.id, reason: 'On leave', createdAt: new Date(NOW) },
    });

    const res = await adminAgent.get(`/api/tickets/${ticketId}/events`);

    expect(res.body.events).toEqual([
      {
        id: expect.any(String),
        kind: 'TAKEOVER_FORCED',
        actor: 'ADMIN',
        actorName: 'Asha Rao',
        before: null,
        after: null,
        reason: 'On leave',
        createdAt: NOW,
      },
    ]);
  });

  it("answers another Author's Ticket exactly as it answers a Ticket that doesn't exist", async () => {
    const { ticketId, app } = await setUp();
    await createAnanya();
    const ananya = await signedInAgent(app, 'ananya@example.com');

    const notTheirs = await ananya.get(`/api/tickets/${ticketId}/events`);
    const missing = await ananya.get('/api/tickets/no-such-ticket/events');

    expect(notTheirs.status).toBe(404);
    expect(missing.body).toEqual(notTheirs.body);
  });

  it('returns 401 when not logged in', async () => {
    const res = await request(makeTestApp()).get('/api/tickets/any-ticket/events');

    expect(res.status).toBe(401);
  });
});

describe('the Admin workspace', () => {
  it("shows the Ticket with its Book and the Author's royalty summary across all their Books", async () => {
    const kavita = await createKavita();
    await createAdmin({ email: ADMIN_EMAIL, name: 'Asha Rao' });
    const book = await createBook(kavita.id, {
      title: 'Raising Roots',
      copiesSold: 100,
      royaltyEarned: 5000,
      royaltyPaid: 3000,
      royaltyPending: 2000,
    });
    await createBook(kavita.id, {
      externalRef: 'BK-TEST-2',
      title: 'Second Book',
      copiesSold: 10,
      royaltyEarned: 500,
      royaltyPaid: 0,
      royaltyPending: 500,
    });
    const ticket = await createTicket(kavita.id, { subject: 'Where is my royalty?', bookId: book.id });
    const agent = await signedInAgent(makeTestApp(), ADMIN_EMAIL);

    const res = await agent.get(`/api/admin/tickets/${ticket.id}`);

    expect(res.status).toBe(200);
    expect(res.body.ticket).toMatchObject({
      id: ticket.id,
      subject: 'Where is my royalty?',
      author: { id: kavita.id, name: 'Kavita Deshmukh' },
    });
    expect(res.body.book).toMatchObject({ id: book.id, title: 'Raising Roots', royaltyPending: 2000 });
    expect(res.body.royalty).toMatchObject({ totalEarned: 5500, totalPaid: 3000, totalPending: 2500 });
  });

  it('shows no Book on a General / Account Level Ticket, and the royalty summary still', async () => {
    const { ticketId, kavita, adminAgent } = await setUp();
    await createBook(kavita.id, { royaltyEarned: 900, royaltyPaid: 0, royaltyPending: 900 });

    const res = await adminAgent.get(`/api/admin/tickets/${ticketId}`);

    expect(res.status).toBe(200);
    expect(res.body.book).toBeNull();
    expect(res.body.royalty).toMatchObject({ totalPending: 900, belowThreshold: true });
  });

  it('returns 404 for a Ticket that does not exist', async () => {
    const { adminAgent } = await setUp();

    const res = await adminAgent.get('/api/admin/tickets/no-such-ticket');

    expect(res.status).toBe(404);
  });

  it('returns 404 to an Author, even for their own Ticket', async () => {
    const { ticketId, author } = await setUp();

    const res = await author.get(`/api/admin/tickets/${ticketId}`);

    expect(res.status).toBe(404);
  });
});
