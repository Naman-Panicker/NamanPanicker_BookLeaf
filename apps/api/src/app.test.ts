import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { makeTestApp } from './testing/harness';

const makeApp = () => makeTestApp({ cookieSecure: true });

describe('health', () => {
  it('reports ok', async () => {
    const res = await request(makeApp()).get('/api/health');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('tells proxies not to cache the response', async () => {
    const res = await request(makeApp()).get('/api/health');

    expect(res.headers['cache-control']).toBe('no-store');
  });
});

describe('spike cookie', () => {
  it('sets an httpOnly, SameSite=Lax, Secure test cookie', async () => {
    const res = await request(makeApp()).post('/api/spike/cookie');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ set: true });
    const [cookie] = res.get('Set-Cookie') ?? [];
    expect(cookie).toMatch(/^spike=/);
    expect(cookie).toMatch(/; HttpOnly/);
    expect(cookie).toMatch(/; SameSite=Lax/);
    expect(cookie).toMatch(/; Secure/);
  });

  it('leaves Secure off when cookieSecure is false, for plain-http local dev', async () => {
    const res = await request(makeTestApp({ cookieSecure: false })).post('/api/spike/cookie');

    const [cookie] = res.get('Set-Cookie') ?? [];
    expect(cookie).not.toMatch(/Secure/);
  });

  it('reports no cookie on a fresh request', async () => {
    const res = await request(makeApp()).get('/api/spike/cookie');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: false });
  });

  it('reports the cookie once it has been set', async () => {
    // supertest talks plain http, and its cookie jar won't send a Secure cookie back over it.
    const agent = request.agent(makeTestApp({ cookieSecure: false }));
    await agent.post('/api/spike/cookie');

    const res = await agent.get('/api/spike/cookie');

    expect(res.body).toEqual({ received: true });
  });
});
