import { apiErrorSchema } from '@bookleaf/shared';
import { z } from 'zod';
import { SESSION_COOKIE_NAME } from '../auth/sessions';
import type { RouteSpec } from './routes';

type Io = 'input' | 'output';
type JsonSchema = { properties?: Record<string, unknown>; required?: string[] };

function jsonSchema(schema: z.ZodType, io: Io) {
  const { $schema: _dialect, ...rest } = z.toJSONSchema(schema, { target: 'draft-2020-12', io });
  return rest;
}

function parameters(schema: z.ZodType | undefined, location: 'query' | 'path') {
  if (!schema) return [];
  const { properties = {}, required = [] } = jsonSchema(schema, 'input') as JsonSchema;
  return Object.entries(properties).map(([name, property]) => ({
    name,
    in: location,
    required: location === 'path' || required.includes(name),
    schema: property,
  }));
}

function jsonContent(schema: z.ZodType, io: Io) {
  return { 'application/json': { schema: jsonSchema(schema, io) } };
}

function errorResponse(description: string) {
  return { description, content: jsonContent(apiErrorSchema, 'output') };
}

function operation(spec: RouteSpec) {
  const responses: Record<string, unknown> = {
    500: errorResponse('Unexpected error.'),
  };
  if (!spec.public) responses[401] = errorResponse('Not logged in.');
  if (spec.body || spec.query || spec.params) responses[400] = errorResponse('The request is not valid.');
  for (const [status, { description, schema }] of Object.entries(spec.responses)) {
    responses[status] = { description, ...(schema && { content: jsonContent(schema, 'output') }) };
  }

  return {
    summary: spec.summary,
    tags: [spec.tag],
    security: spec.public ? [] : [{ sessionCookie: [] }],
    parameters: [...parameters(spec.query, 'query'), ...parameters(spec.params, 'path')],
    ...(spec.body && { requestBody: { required: true, content: jsonContent(spec.body, 'input') } }),
    responses,
  };
}

export function buildOpenApiDocument(specs: RouteSpec[]) {
  const paths: Record<string, Record<string, ReturnType<typeof operation>>> = {};
  for (const spec of specs) {
    const path = spec.path.replace(/:(\w+)/g, '{$1}');
    paths[path] = { ...paths[path], [spec.method]: operation(spec) };
  }

  return {
    openapi: '3.1.0',
    info: { title: 'BookLeaf Author Support API', version: '1.0.0' },
    paths,
    components: {
      securitySchemes: {
        sessionCookie: { type: 'apiKey', in: 'cookie', name: SESSION_COOKIE_NAME },
      },
    },
  };
}
