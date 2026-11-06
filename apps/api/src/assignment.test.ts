import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  createAdmin,
  createAuthor,
  createTicket,
  fakeClock,
  makeTestApp,
  resetDatabase,
  signedInAgent,
} from './testing/harness';

beforeEach(resetDatabase);

const AUTHOR_EMAIL = 'kavita@example.com';
const ASHA_EMAIL = 'asha@example.com';
const DEV_EMAIL = 'dev@example.com';
const RAISED_AT = '2026-01-14T10:00:00.000Z';
const NOW = '2026-01-15T10:00:00.000Z';

async function setUp(ticket: Parameters<typeof createTicket>[1] = {}) {
  const kavita = await createAuthor({ email: AUTHOR_EMAIL, name: 'Kavita Deshmukh' });
  const asha = await createAdmin({ email: ASHA_EMAIL, name: 'Asha Rao' });
  const dev = await createAdmin({ email: DEV_EMAIL, name: 'Dev Menon' });
  const { id: ticketId } = await createTicket(kavita.id, { createdAt: new Date(RAISED_AT), ...ticket });
  const clock = fakeClock();
  const app = makeTestApp({ clock });
  const [author, ashaAgent, devAgent] = await Promise.all([
    signedInAgent(app, AUTHOR_EMAIL),
    signedInAgent(app, ASHA_EMAIL),
    signedInAgent(app, DEV_EMAIL),
  ]);
  return {
    ticketId,
    clock,
    path: `/api/admin/tickets/${ticketId}/assignee`,
    ashaId: asha.id,
    devId: dev.id,
    author,
    ashaAgent,
    devAgent,
  };
}

describe('assigning a Ticket to yourself', () => {
  it('makes you the Assignee and moves an Open Ticket to In Progress, which the Author sees', async () => {
    const { ticketId, path, author, ashaAgent, ashaId } = await setUp();

    const res = await ashaAgent.put(path);

    expect(res.status).toBe(200);
    expect(res.body.ticket).toMatchObject({ status: 'IN_PROGRESS', assignee: { id: ashaId, name: 'Asha Rao' } });
    const ticket = await author.get(`/api/tickets/${ticketId}`);
    expect(ticket.body.ticket).toMatchObject({ status: 'IN_PROGRESS', lastUpdateAt: NOW });
  });

  it('records both Ticket Events for Admins, and shows the Author only the status change', async () => {
    const { ticketId, path, author, ashaAgent } = await setUp();

    await ashaAgent.put(path).expect(200);

    const asAdmin = await ashaAgent.get(`/api/tickets/${ticketId}/events`);
    expect(asAdmin.body.events.map(({ kind, actorName }: Record<string, string>) => [kind, actorName]).sort()).toEqual([
      ['ASSIGNED', 'Asha Rao'],
      ['STATUS_CHANGED', 'Asha Rao'],
    ]);
    const asAuthor = await author.get(`/api/tickets/${ticketId}/events`);
    expect(asAuthor.body.events.map(({ kind }: { kind: string }) => kind)).toEqual(['STATUS_CHANGED']);
    expect(JSON.stringify(asAuthor.body)).not.toContain('Asha');
  });

  it.each(['IN_PROGRESS', 'RESOLVED', 'CLOSED'] as const)(
    "leaves a Ticket that is %s as it is, without moving the Author's Last update",
    async (status) => {
      const { ticketId, path, author, ashaAgent } = await setUp({ status });

      const res = await ashaAgent.put(path);

      expect(res.status).toBe(200);
      expect(res.body.ticket.status).toBe(status);
      const ticket = await author.get(`/api/tickets/${ticketId}`);
      expect(ticket.body.ticket.lastUpdateAt).toBe(RAISED_AT);
      const events = await ashaAgent.get(`/api/tickets/${ticketId}/events`);
      expect(events.body.events.map(({ kind }: { kind: string }) => kind)).toEqual(['ASSIGNED']);
    },
  );

  it('changes nothing and records nothing when you already are the Assignee', async () => {
    const { ticketId, path, ashaAgent, ashaId } = await setUp({ status: 'IN_PROGRESS' });
    await ashaAgent.put(path).expect(200);

    const res = await ashaAgent.put(path);

    expect(res.status).toBe(200);
    expect(res.body.ticket.assignee.id).toBe(ashaId);
    const events = await ashaAgent.get(`/api/tickets/${ticketId}/events`);
    expect(events.body.events).toHaveLength(1);
  });

  it('returns CONFLICT, naming the Assignee, on a Ticket another Admin holds', async () => {
    const { ticketId, path, ashaAgent, devAgent, devId } = await setUp();
    await devAgent.put(path).expect(200);

    const res = await ashaAgent.put(path);

    expect(res.status).toBe(409);
    expect(res.body.error).toMatchObject({ code: 'CONFLICT', message: expect.stringContaining('Dev Menon') });
    const ticket = await ashaAgent.get(`/api/admin/tickets/${ticketId}`);
    expect(ticket.body.ticket.assignee.id).toBe(devId);
  });

  it('gives the Ticket to one Admin when two assign themselves at the same moment', async () => {
    const { ticketId, path, ashaAgent, devAgent } = await setUp();

    const responses = await Promise.all([ashaAgent.put(path), devAgent.put(path)]);

    expect(responses.map(({ status }) => status).sort()).toEqual([200, 409]);
    const events = await ashaAgent.get(`/api/tickets/${ticketId}/events`);
    expect(events.body.events.filter(({ kind }: { kind: string }) => kind === 'ASSIGNED')).toHaveLength(1);
  });

  it('shows up in the "assigned to me" filter', async () => {
    const { ticketId, path, ashaAgent, devAgent } = await setUp();
    await ashaAgent.put(path).expect(200);

    const mine = await ashaAgent.get('/api/admin/tickets').query({ assignedToMe: 'true' });
    const notMine = await devAgent.get('/api/admin/tickets').query({ assignedToMe: 'true' });

    expect(mine.body.tickets.map(({ id }: { id: string }) => id)).toEqual([ticketId]);
    expect(notMine.body.tickets).toEqual([]);
  });
});

describe('unassigning yourself', () => {
  it("clears the Assignee and records it, leaving the status and the Author's Last update alone", async () => {
    const { ticketId, clock, path, author, ashaAgent } = await setUp({ status: 'IN_PROGRESS' });
    await ashaAgent.put(path).expect(200);

    clock.advanceDays(1);
    const res = await ashaAgent.delete(path);

    expect(res.status).toBe(200);
    expect(res.body.ticket).toMatchObject({ status: 'IN_PROGRESS', assignee: null });
    const events = await ashaAgent.get(`/api/tickets/${ticketId}/events`);
    expect(events.body.events.map(({ kind, actorName }: Record<string, string>) => [kind, actorName])).toEqual([
      ['ASSIGNED', 'Asha Rao'],
      ['UNASSIGNED', 'Asha Rao'],
    ]);
    const ticket = await author.get(`/api/tickets/${ticketId}`);
    expect(ticket.body.ticket.lastUpdateAt).toBe(RAISED_AT);
    const asAuthor = await author.get(`/api/tickets/${ticketId}/events`);
    expect(asAuthor.body.events).toEqual([]);
  });

  it('lets another Admin assign themselves afterwards', async () => {
    const { path, ashaAgent, devAgent, devId } = await setUp();
    await ashaAgent.put(path).expect(200);
    await ashaAgent.delete(path).expect(200);

    const res = await devAgent.put(path);

    expect(res.status).toBe(200);
    expect(res.body.ticket.assignee.id).toBe(devId);
  });

  it('returns CONFLICT to an Admin who is not the Assignee, and changes nothing', async () => {
    const { ticketId, path, ashaAgent, devAgent, devId } = await setUp();
    await devAgent.put(path).expect(200);

    const res = await ashaAgent.delete(path);

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
    const ticket = await ashaAgent.get(`/api/admin/tickets/${ticketId}`);
    expect(ticket.body.ticket.assignee.id).toBe(devId);
  });

  it('changes nothing and records nothing on a Ticket with no Assignee', async () => {
    const { ticketId, path, ashaAgent } = await setUp();

    const res = await ashaAgent.delete(path);

    expect(res.status).toBe(200);
    expect(res.body.ticket.assignee).toBeNull();
    const events = await ashaAgent.get(`/api/tickets/${ticketId}/events`);
    expect(events.body.events).toEqual([]);
  });
});

describe('who can use these endpoints', () => {
  it('returns 404 to an Author, even for their own Ticket', async () => {
    const { ticketId, path, author, ashaAgent } = await setUp();

    const assigned = await author.put(path);
    const unassigned = await author.delete(path);

    expect(assigned.status).toBe(404);
    expect(unassigned.status).toBe(404);
    const ticket = await ashaAgent.get(`/api/admin/tickets/${ticketId}`);
    expect(ticket.body.ticket).toMatchObject({ status: 'OPEN', assignee: null });
  });

  it('returns 404 for a Ticket that does not exist', async () => {
    const { ashaAgent } = await setUp();

    const assigned = await ashaAgent.put('/api/admin/tickets/no-such-ticket/assignee');
    const unassigned = await ashaAgent.delete('/api/admin/tickets/no-such-ticket/assignee');

    expect(assigned.status).toBe(404);
    expect(unassigned.status).toBe(404);
  });

  it('returns 401 when not logged in', async () => {
    const assigned = await request(makeTestApp()).put('/api/admin/tickets/any-ticket/assignee');
    const unassigned = await request(makeTestApp()).delete('/api/admin/tickets/any-ticket/assignee');

    expect(assigned.status).toBe(401);
    expect(unassigned.status).toBe(401);
  });
});
