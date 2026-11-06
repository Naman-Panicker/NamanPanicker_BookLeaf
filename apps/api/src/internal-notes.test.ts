import { INTERNAL_NOTE_MAX_LENGTH } from '@bookleaf/shared';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import type { AiClient } from './ai-client';
import {
  createAdmin,
  createAuthor,
  createTicket,
  fakeAi,
  fakeClock,
  makeTestApp,
  resetDatabase,
  signedInAgent,
} from './testing/harness';

beforeEach(resetDatabase);

const AUTHOR_EMAIL = 'kavita@example.com';
const ASHA_EMAIL = 'asha@example.com';
const DEV_EMAIL = 'dev@example.com';
const NOW = '2026-01-15T10:00:00.000Z';
const NEXT_DAY = '2026-01-16T10:00:00.000Z';

async function setUp(ticket: Parameters<typeof createTicket>[1] = {}, ai?: AiClient) {
  const kavita = await createAuthor({ email: AUTHOR_EMAIL, name: 'Kavita Deshmukh' });
  await createAdmin({ email: ASHA_EMAIL, name: 'Asha Rao' });
  await createAdmin({ email: DEV_EMAIL, name: 'Dev Menon' });
  const { id: ticketId } = await createTicket(kavita.id, {
    createdAt: new Date('2026-01-14T10:00:00.000Z'),
    ...ticket,
  });
  const clock = fakeClock();
  const app = makeTestApp({ clock, ...(ai && { ai }) });
  return {
    ticketId,
    clock,
    app,
    author: await signedInAgent(app, AUTHOR_EMAIL),
    asha: await signedInAgent(app, ASHA_EMAIL),
    dev: await signedInAgent(app, DEV_EMAIL),
  };
}

describe('adding an Internal Note', () => {
  it('lets an Admin add one, naming them, which other Admins then read oldest first', async () => {
    const { ticketId, clock, asha, dev } = await setUp();

    const added = await asha.post(`/api/admin/tickets/${ticketId}/internal-notes`).send({ body: '  Checked the ledger.  ' });
    clock.advanceDays(1);
    await dev.post(`/api/admin/tickets/${ticketId}/internal-notes`).send({ body: 'Finance agrees.' });

    expect(added.status).toBe(201);
    expect(added.body.note).toEqual({
      id: expect.any(String),
      adminName: 'Asha Rao',
      body: 'Checked the ledger.',
      createdAt: NOW,
    });
    const listed = await dev.get(`/api/admin/tickets/${ticketId}/internal-notes`);
    expect(listed.status).toBe(200);
    expect(
      listed.body.notes.map(({ adminName, body, createdAt }: Record<string, string>) => [adminName, body, createdAt]),
    ).toEqual([
      ['Asha Rao', 'Checked the ledger.', NOW],
      ['Dev Menon', 'Finance agrees.', NEXT_DAY],
    ]);
  });

  it('lists nothing on a Ticket with no Internal Notes', async () => {
    const { ticketId, asha } = await setUp();

    const res = await asha.get(`/api/admin/tickets/${ticketId}/internal-notes`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ notes: [] });
  });

  it('rejects an empty one and one over the length limit', async () => {
    const { ticketId, asha } = await setUp();
    const add = (body: string) => asha.post(`/api/admin/tickets/${ticketId}/internal-notes`).send({ body });

    const empty = await add('   ');
    const tooLong = await add('x'.repeat(INTERNAL_NOTE_MAX_LENGTH + 1));

    expect(empty.status).toBe(400);
    expect(empty.body.error.details.fields).toEqual([{ field: 'body', message: 'Write an Internal Note.' }]);
    expect(tooLong.status).toBe(400);
    expect(tooLong.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('returns 404 for a Ticket that does not exist', async () => {
    const { asha } = await setUp();

    const listed = await asha.get('/api/admin/tickets/no-such-ticket/internal-notes');
    const added = await asha.post('/api/admin/tickets/no-such-ticket/internal-notes').send({ body: 'Hello?' });

    expect(listed.status).toBe(404);
    expect(added.status).toBe(404);
  });

  it('is allowed on a Closed Ticket, because Admins may still need to explain it to each other', async () => {
    const { ticketId, asha } = await setUp({ status: 'CLOSED' });

    const res = await asha.post(`/api/admin/tickets/${ticketId}/internal-notes`).send({ body: 'Closed at their request.' });

    expect(res.status).toBe(201);
  });

  it("changes nothing else on the Ticket: status, the Author's Last update, or who has the next move", async () => {
    const { ticketId, clock, author, asha } = await setUp();
    const queueRow = async () => (await asha.get('/api/admin/tickets')).body.tickets[0];
    const before = await queueRow();
    const lastUpdateBefore = (await author.get(`/api/tickets/${ticketId}`)).body.ticket.lastUpdateAt;

    clock.advanceDays(1);
    await asha.post(`/api/admin/tickets/${ticketId}/internal-notes`).send({ body: 'Checked the ledger.' }).expect(201);

    expect(await queueRow()).toEqual(before);
    expect(before).toMatchObject({ status: 'OPEN', awaitingAdmin: true });
    const ticket = await author.get(`/api/tickets/${ticketId}`);
    expect(ticket.body.ticket.lastUpdateAt).toBe(lastUpdateBefore);
    const events = await asha.get(`/api/tickets/${ticketId}/events`);
    expect(events.body.events).toEqual([]);
  });
});

describe('keeping Internal Notes from Authors', () => {
  const SECRET = 'SECRET-INTERNAL-NOTE-TEXT';

  it('returns 404 to an Author on the endpoints, even for their own Ticket and a bad request', async () => {
    const { ticketId, author, asha } = await setUp();
    const path = `/api/admin/tickets/${ticketId}/internal-notes`;
    await asha.post(path).send({ body: SECRET }).expect(201);

    const listed = await author.get(path);
    const added = await author.post(path).send({ body: 'From an Author.' });
    const invalid = await author.post(path).send({ body: '' });

    expect(listed.status).toBe(404);
    expect(listed.body).toEqual({ error: { code: 'NOT_FOUND', message: 'Not found.', details: null } });
    expect(added.status).toBe(404);
    expect(invalid.status).toBe(404);
    expect(invalid.body).toEqual(added.body);
    const notes = await asha.get(path);
    expect(notes.body.notes).toHaveLength(1);
  });

  it('leaves Internal Note text out of every response an Author gets', async () => {
    const { ticketId, author, asha } = await setUp({ status: 'RESOLVED' });
    await asha.post(`/api/admin/tickets/${ticketId}/internal-notes`).send({ body: SECRET }).expect(201);
    const asAdmin = await asha.get(`/api/admin/tickets/${ticketId}/internal-notes`);
    expect(JSON.stringify(asAdmin.body)).toContain(SECRET);

    const responses = await Promise.all([
      author.get('/api/tickets'),
      author.get(`/api/tickets/${ticketId}`),
      author.get(`/api/tickets/${ticketId}/messages`),
      author.get(`/api/tickets/${ticketId}/events`),
      author.get('/api/books'),
      author.post('/api/tickets').send({ bookId: null, subject: 'Another question', description: 'Hello?' }),
      author.post(`/api/tickets/${ticketId}/messages`).send({ body: 'It came back.' }),
    ]);
    await asha.put(`/api/admin/tickets/${ticketId}/status`).send({ status: 'RESOLVED' }).expect(200);
    responses.push(await author.post(`/api/tickets/${ticketId}/resolution-confirmation`));

    for (const res of responses) {
      expect(res.status).toBeLessThan(300);
      expect(JSON.stringify(res.body)).not.toContain(SECRET);
    }
  });

  it('never sends Internal Note text to the AI writing a Draft', async () => {
    const ai = fakeAi('A Draft');
    const { ticketId, asha } = await setUp({}, ai);
    await asha.post(`/api/admin/tickets/${ticketId}/internal-notes`).send({ body: SECRET }).expect(201);

    await asha.get(`/api/admin/tickets/${ticketId}/draft`).expect(200);

    expect(ai.prompts).toHaveLength(1);
    expect(JSON.stringify(ai.prompts)).not.toContain(SECRET);
  });
});

it('returns 401 when not logged in', async () => {
  const listed = await request(makeTestApp()).get('/api/admin/tickets/any-ticket/internal-notes');
  const added = await request(makeTestApp()).post('/api/admin/tickets/any-ticket/internal-notes').send({ body: 'Hello?' });

  expect(listed.status).toBe(401);
  expect(added.status).toBe(401);
});
