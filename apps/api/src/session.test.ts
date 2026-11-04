import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPrisma } from './db';
import {
  createAdmin,
  createAuthor,
  fakeClock,
  makeTestApp,
  PASSWORD,
  prisma,
  resetDatabase,
  signedInAgent,
} from './testing/harness';

beforeEach(resetDatabase);

describe('logging in', () => {
  it('signs in an Author and returns their role', async () => {
    const author = await createAuthor({ email: 'priya@example.com', name: 'Priya Sharma' });

    const res = await request(makeTestApp())
      .post('/api/session')
      .send({ email: 'priya@example.com', password: PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      user: { id: author.id, role: 'AUTHOR', name: 'Priya Sharma', email: 'priya@example.com' },
    });
  });

  it('signs in an Admin and returns their role', async () => {
    const admin = await createAdmin({ email: 'asha@example.com', name: 'Asha Rao' });

    const res = await request(makeTestApp())
      .post('/api/session')
      .send({ email: 'asha@example.com', password: PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      user: { id: admin.id, role: 'ADMIN', name: 'Asha Rao', email: 'asha@example.com' },
    });
  });

  it('ignores case and surrounding spaces in the email', async () => {
    await createAuthor({ email: 'priya@example.com' });

    const res = await request(makeTestApp())
      .post('/api/session')
      .send({ email: '  Priya@Example.COM ', password: PASSWORD });

    expect(res.status).toBe(200);
  });

  it('rejects a wrong password without setting a cookie', async () => {
    await createAuthor({ email: 'priya@example.com' });

    const res = await request(makeTestApp())
      .post('/api/session')
      .send({ email: 'priya@example.com', password: 'wrong-password' });

    expect(res.status).toBe(401);
    expect(res.body).toEqual({
      error: { code: 'INVALID_CREDENTIALS', message: 'That email and password do not match.', details: null },
    });
    expect(res.get('Set-Cookie')).toBeUndefined();
  });

  it('answers an unknown email exactly as it answers a wrong password', async () => {
    await createAuthor({ email: 'priya@example.com' });
    const app = makeTestApp();

    const wrongPassword = await request(app)
      .post('/api/session')
      .send({ email: 'priya@example.com', password: 'wrong-password' });
    const unknownEmail = await request(app)
      .post('/api/session')
      .send({ email: 'nobody@example.com', password: PASSWORD });

    expect(unknownEmail.status).toBe(wrongPassword.status);
    expect(unknownEmail.body).toEqual(wrongPassword.body);
  });
});

describe('the session cookie', () => {
  it('is httpOnly, SameSite=Lax and Secure', async () => {
    await createAuthor({ email: 'priya@example.com' });

    const res = await request(makeTestApp({ cookieSecure: true }))
      .post('/api/session')
      .send({ email: 'priya@example.com', password: PASSWORD });

    const [cookie] = res.get('Set-Cookie') ?? [];
    expect(cookie).toMatch(/^bookleaf_session=/);
    expect(cookie).toMatch(/; HttpOnly/);
    expect(cookie).toMatch(/; SameSite=Lax/);
    expect(cookie).toMatch(/; Secure/);
  });
});

describe('the current user', () => {
  it('is an Author after an Author logs in', async () => {
    const author = await createAuthor({ email: 'priya@example.com', name: 'Priya Sharma' });
    const agent = await signedInAgent(makeTestApp(), 'priya@example.com');

    const res = await agent.get('/api/session');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      user: { id: author.id, role: 'AUTHOR', name: 'Priya Sharma', email: 'priya@example.com' },
    });
  });

  it('is an Admin after an Admin logs in', async () => {
    await createAdmin({ email: 'asha@example.com' });
    const agent = await signedInAgent(makeTestApp(), 'asha@example.com');

    const res = await agent.get('/api/session');

    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe('ADMIN');
  });

  it('returns 401 once the account no longer exists', async () => {
    const author = await createAuthor({ email: 'priya@example.com' });
    const agent = await signedInAgent(makeTestApp(), 'priya@example.com');
    await prisma.author.delete({ where: { id: author.id } });

    const res = await agent.get('/api/session');

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });
});

describe('without a valid session', () => {
  const unauthenticated = {
    error: { code: 'UNAUTHENTICATED', message: 'Sign in to continue.', details: null },
  };

  it('returns 401 for the current user', async () => {
    const res = await request(makeTestApp()).get('/api/session');

    expect(res.status).toBe(401);
    expect(res.body).toEqual(unauthenticated);
  });

  it('returns 401 for logging out', async () => {
    const res = await request(makeTestApp()).delete('/api/session');

    expect(res.status).toBe(401);
    expect(res.body).toEqual(unauthenticated);
  });

  it('returns 401 for a URL that does not exist, so logged-out callers can not map the API', async () => {
    const res = await request(makeTestApp()).get('/api/no-such-route');

    expect(res.status).toBe(401);
    expect(res.body).toEqual(unauthenticated);
  });

  it('returns 401 for a cookie that has been tampered with', async () => {
    await createAuthor({ email: 'priya@example.com' });
    const app = makeTestApp();
    const login = await request(app)
      .post('/api/session')
      .send({ email: 'priya@example.com', password: PASSWORD });
    const [cookie = ''] = login.get('Set-Cookie') ?? [];
    const token = cookie.split(';')[0]!.split('=')[1]!;
    const [header, payload, signature] = token.split('.');
    const forgedPayload = Buffer.from(
      JSON.stringify({ ...JSON.parse(Buffer.from(payload!, 'base64url').toString()), role: 'ADMIN' }),
    ).toString('base64url');

    const res = await request(app)
      .get('/api/session')
      .set('Cookie', `bookleaf_session=${header}.${forgedPayload}.${signature}`);

    expect(res.status).toBe(401);
    expect(res.body).toEqual(unauthenticated);
  });

  it('returns 401 for a cookie signed with a different secret', async () => {
    await createAuthor({ email: 'priya@example.com' });
    const login = await request(makeTestApp({ sessionSecret: 'a-different-secret-that-is-long-enough' }))
      .post('/api/session')
      .send({ email: 'priya@example.com', password: PASSWORD });
    const [cookie = ''] = login.get('Set-Cookie') ?? [];

    const res = await request(makeTestApp()).get('/api/session').set('Cookie', cookie.split(';')[0]!);

    expect(res.status).toBe(401);
    expect(res.body).toEqual(unauthenticated);
  });

  it('returns 401 once the session has expired', async () => {
    await createAuthor({ email: 'priya@example.com' });
    const clock = fakeClock();
    const agent = await signedInAgent(makeTestApp({ clock }), 'priya@example.com');

    clock.advanceDays(6);
    expect((await agent.get('/api/session')).status).toBe(200);

    clock.advanceDays(2);
    const res = await agent.get('/api/session');
    expect(res.status).toBe(401);
    expect(res.body).toEqual(unauthenticated);
  });

  it('still answers the health check, for the Render probe', async () => {
    const res = await request(makeTestApp()).get('/api/health');

    expect(res.status).toBe(200);
  });
});

describe('with a valid session', () => {
  it('returns 404 in the shared shape for a URL that does not exist', async () => {
    await createAuthor({ email: 'priya@example.com' });
    const agent = await signedInAgent(makeTestApp(), 'priya@example.com');

    const res = await agent.get('/api/no-such-route');

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: { code: 'NOT_FOUND', message: 'Not found.', details: null } });
  });
});

describe('logging out', () => {
  it('ends the session', async () => {
    await createAuthor({ email: 'priya@example.com' });
    const agent = await signedInAgent(makeTestApp(), 'priya@example.com');

    const logout = await agent.delete('/api/session');
    expect(logout.status).toBe(204);

    const res = await agent.get('/api/session');
    expect(res.status).toBe(401);
  });
});

describe('request validation', () => {
  it('names each bad field', async () => {
    const res = await request(makeTestApp()).post('/api/session').send({ email: 'not-an-email' });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: {
        code: 'VALIDATION_FAILED',
        message: 'The request is not valid.',
        details: {
          fields: [
            { field: 'email', message: 'Enter a valid email address.' },
            { field: 'password', message: 'Enter your password.' },
          ],
        },
      },
    });
  });

  it('rejects malformed JSON in the same shape', async () => {
    const res = await request(makeTestApp())
      .post('/api/session')
      .set('Content-Type', 'application/json')
      .send('{"email":');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    expect(res.body.error).toHaveProperty('details');
  });

  it('does not accept a form post, which a cross-site page could send', async () => {
    await createAuthor({ email: 'priya@example.com' });

    const res = await request(makeTestApp())
      .post('/api/session')
      .type('form')
      .send({ email: 'priya@example.com', password: PASSWORD });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    expect(res.body.error.details.fields.map((f: { field: string }) => f.field)).toEqual(['email', 'password']);
  });

  it('rejects an oversized body in the same shape', async () => {
    const res = await request(makeTestApp())
      .post('/api/session')
      .send({ email: 'a@example.com', password: 'x'.repeat(200_000) });

    expect(res.status).toBe(413);
    expect(res.body).toEqual({
      error: { code: 'BAD_REQUEST', message: 'The request could not be processed.', details: null },
    });
  });
});

describe('unexpected errors', () => {
  it('returns a generic 500 with no internals', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const unreachable = createPrisma('postgresql://nobody:secret@127.0.0.1:1/nothing');

    const res = await request(makeTestApp({ prisma: unreachable }))
      .post('/api/session')
      .send({ email: 'priya@example.com', password: PASSWORD });

    expect(res.status).toBe(500);
    expect(res.body).toEqual({
      error: { code: 'INTERNAL_ERROR', message: 'Something went wrong. Please try again.', details: null },
    });
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
    await unreachable.$disconnect();
  });
});
