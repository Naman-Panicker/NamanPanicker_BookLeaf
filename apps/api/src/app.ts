import type { HealthResponse } from '@bookleaf/shared';
import { healthResponseSchema } from '@bookleaf/shared';
import cookieParser from 'cookie-parser';
import express from 'express';
import type { AiClient } from './ai-client';
import { createSessions } from './auth/sessions';
import { createClassifier } from './classification';
import type { Clock } from './clock';
import type { PrismaClient } from './db';
import { createDrafts } from './drafts';
import type { EventPublisher } from './events';
import { createDocsRouter } from './http/docs';
import { errorHandler, notFound } from './http/errors';
import { createRoutes } from './http/routes';
import { addAdminTicketRoutes } from './routes/admin-tickets';
import { addBookRoutes } from './routes/books';
import { addSessionRoutes } from './routes/session';
import { addTicketRoutes } from './routes/tickets';

export type AppOptions = {
  cookieSecure: boolean;
  sessionSecret: string;
  prisma: PrismaClient;
  clock: Clock;
  publisher: EventPublisher;
  ai: AiClient;
};

export function createApp({ cookieSecure, sessionSecret, prisma, clock, ai }: AppOptions) {
  const app = express();
  const classifier = createClassifier({ prisma, clock, ai });
  const drafts = createDrafts({ prisma, clock, ai });

  // Vercel caches rewritten responses unless told otherwise (ADR-0003).
  app.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });

  app.use(cookieParser());

  const sessions = createSessions({ secret: sessionSecret, cookieSecure, clock });
  const routes = createRoutes(sessions.requireSession);

  routes.add(
    {
      method: 'get',
      path: '/api/health',
      summary: 'Check the API is up',
      tag: 'Health',
      public: true,
      responses: { 200: { description: 'The API is up.', schema: healthResponseSchema } },
    },
    (_req, res) => {
      res.json({ status: 'ok' } satisfies HealthResponse);
    },
  );

  addSessionRoutes({ routes, prisma, sessions });
  addBookRoutes({ routes, prisma, clock });
  addTicketRoutes({ routes, prisma, clock, classifier });
  addAdminTicketRoutes({ routes, prisma, clock, classifier, drafts });

  app.use(routes.router);
  app.use(createDocsRouter(routes.specs));

  // A logged-out caller gets 401 even for a URL that doesn't exist.
  app.use(sessions.requireSession, () => {
    throw notFound();
  });

  app.use(errorHandler);

  return { app, classifier };
}
