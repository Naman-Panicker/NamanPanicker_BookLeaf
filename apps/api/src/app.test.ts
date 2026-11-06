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
