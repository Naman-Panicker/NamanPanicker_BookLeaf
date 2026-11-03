import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { errorHandler } from './errors';
import { buildOpenApiDocument } from './openapi';
import { createRoutes } from './routes';

const passThrough: express.RequestHandler = (_req, _res, next) => next();

function makeRoutes() {
  const routes = createRoutes(passThrough);
  routes.add(
    {
      method: 'get',
      path: '/things/:thingId',
      summary: 'Get a thing',
      tag: 'Things',
      params: z.object({ thingId: z.coerce.number().int() }),
      query: z.object({ page: z.coerce.number().int().optional() }),
      responses: { 200: { description: 'The thing.', schema: z.object({ id: z.number() }) } },
    },
    (_req, res, { params, query }) => {
      res.json({ id: params.thingId, page: query.page });
    },
  );
  return routes;
}

function makeApp() {
  return express().use(makeRoutes().router).use(errorHandler);
}

describe('route validation', () => {
  it('hands the handler parsed route parameters and query values', async () => {
    const res = await request(makeApp()).get('/things/42?page=2');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: 42, page: 2 });
  });

  it('reports bad route parameters and query values together, with their location', async () => {
    const res = await request(makeApp()).get('/things/abc?page=xyz');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    expect(res.body.error.details.fields.map((f: { field: string }) => f.field)).toEqual([
      'query.page',
      'params.thingId',
    ]);
  });
});

describe('the OpenAPI document', () => {
  it('describes route parameters and query values in OpenAPI form', () => {
    const document = buildOpenApiDocument(makeRoutes().specs);

    const operation = document.paths['/things/{thingId}']?.get;
    expect(operation?.parameters).toEqual([
      expect.objectContaining({ name: 'page', in: 'query', required: false }),
      expect.objectContaining({ name: 'thingId', in: 'path', required: true }),
    ]);
  });
});
