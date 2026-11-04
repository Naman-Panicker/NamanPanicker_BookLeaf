import express, { type Request, type RequestHandler, type Response, Router } from 'express';
import type { z } from 'zod';
import { requireAdmin } from '../auth/sessions';
import { validationFailed } from './errors';

type Schema = z.ZodType;
type OutputOf<S> = S extends Schema ? z.output<S> : undefined;

export type RouteSpec<B = Schema | undefined, Q = Schema | undefined, P = Schema | undefined> = {
  method: 'get' | 'post' | 'put' | 'patch' | 'delete';
  path: string;
  summary: string;
  tag: string;
  // Routes need a session unless they say otherwise.
  public?: boolean;
  adminOnly?: boolean;
  body?: B;
  query?: Q;
  params?: P;
  responses: Record<number, { description: string; schema?: Schema }>;
};

export type RouteInput<B, Q, P> = { body: OutputOf<B>; query: OutputOf<Q>; params: OutputOf<P> };

// Registers routes and records them for the OpenAPI document, so a route's docs
// and its validation come from the same schemas and can't drift apart.
export function createRoutes(requireSession: RequestHandler) {
  const router = Router();
  const specs: RouteSpec[] = [];

  function add<
    B extends Schema | undefined = undefined,
    Q extends Schema | undefined = undefined,
    P extends Schema | undefined = undefined,
  >(
    spec: RouteSpec<B, Q, P>,
    handler: (req: Request, res: Response, input: RouteInput<B, Q, P>) => void | Promise<void>,
  ) {
    specs.push(spec as RouteSpec);

    const middleware: RequestHandler[] = [];
    // Authenticating first means a logged-out request gets 401 whatever its body looks like.
    if (!spec.public) middleware.push(requireSession);
    // Ahead of validation, so a bad request from an Author can't reveal that an Admin route exists.
    if (spec.adminOnly) middleware.push(requireAdmin);
    // Only JSON is parsed, so a form post has no body and fails validation (ADR-0003).
    if (spec.body) middleware.push(express.json());

    router[spec.method](spec.path, ...middleware, async (req, res) => {
      await handler(req, res, parseInput(req, spec) as RouteInput<B, Q, P>);
    });
  }

  return { router, specs, add };
}

function parseInput(req: Request, { body, query, params }: Pick<RouteSpec, 'body' | 'query' | 'params'>) {
  const sources = [
    // A body that isn't JSON is never parsed. Treat it as empty, so the errors still name each field.
    { key: 'body', schema: body, value: (req.body ?? {}) as unknown, prefix: '' },
    { key: 'query', schema: query, value: req.query as unknown, prefix: 'query.' },
    { key: 'params', schema: params, value: req.params as unknown, prefix: 'params.' },
  ];

  const input: Record<string, unknown> = {};
  const fields: { field: string; message: string }[] = [];
  for (const { key, schema, value, prefix } of sources) {
    if (!schema) continue;
    const result = schema.safeParse(value);
    if (result.success) {
      input[key] = result.data;
    } else {
      for (const issue of result.error.issues) {
        fields.push({ field: prefix + issue.path.join('.'), message: issue.message });
      }
    }
  }

  if (fields.length > 0) throw validationFailed({ fields });
  return input;
}
