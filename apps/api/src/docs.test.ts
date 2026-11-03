import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { makeTestApp } from './testing/harness';

describe('API docs', () => {
  it('serves Swagger UI at /docs without a session', async () => {
    const res = await request(makeTestApp()).get('/docs');

    expect(res.status).toBe(200);
    expect(res.type).toBe('text/html');
    expect(res.text).toContain('swagger-ui');
  });

  it('serves the Swagger UI assets that page asks for', async () => {
    const res = await request(makeTestApp()).get('/docs/assets/swagger-ui-bundle.js');

    expect(res.status).toBe(200);
    expect(res.type).toMatch(/javascript/);
  });

  it('generates the login request body from the shared schema', async () => {
    const res = await request(makeTestApp()).get('/docs/openapi.json');

    expect(res.status).toBe(200);
    expect(res.body.openapi).toMatch(/^3\.1/);
    const schema = res.body.paths['/api/session'].post.requestBody.content['application/json'].schema;
    expect(schema.required).toEqual(['email', 'password']);
    expect(Object.keys(schema.properties)).toEqual(['email', 'password']);
  });

  it('documents the session routes and their errors', async () => {
    const { body } = await request(makeTestApp()).get('/docs/openapi.json');
    const session = body.paths['/api/session'];

    expect(Object.keys(session).sort()).toEqual(['delete', 'get', 'post']);
    expect(Object.keys(session.post.responses).sort()).toEqual(['200', '400', '401', '500']);
    expect(Object.keys(session.get.responses).sort()).toEqual(['200', '401', '500']);
    expect(Object.keys(session.delete.responses).sort()).toEqual(['204', '401', '500']);
  });

  it('marks which routes need the session cookie', async () => {
    const { body } = await request(makeTestApp()).get('/docs/openapi.json');
    const session = body.paths['/api/session'];

    expect(session.post.security).toEqual([]);
    expect(session.get.security).toEqual([{ sessionCookie: [] }]);
    expect(body.components.securitySchemes.sessionCookie).toEqual({
      type: 'apiKey',
      in: 'cookie',
      name: 'bookleaf_session',
    });
  });
});
