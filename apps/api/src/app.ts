import type {
  HealthResponse,
  SpikeCookieEchoResponse,
  SpikeCookieSetResponse,
  SpikeHeartbeat,
} from '@bookleaf/shared';
import { healthResponseSchema, SPIKE_HEARTBEAT_EVENT } from '@bookleaf/shared';
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

const SPIKE_COOKIE = 'spike';
// Vercel drops a proxied connection after 120s with no data (ADR-0003).
const HEARTBEAT_MS = 25_000;

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

  // Deploy spike (ticket 01): does a cookie set by Express survive the Vercel rewrite?
  app.post('/api/spike/cookie', (_req, res) => {
    // eslint-disable-next-line no-restricted-syntax -- deploy spike, deleted once ticket 01's checks pass
    res.cookie(SPIKE_COOKIE, 'round-trip', {
      httpOnly: true,
      sameSite: 'lax',
      secure: cookieSecure,
      path: '/',
      maxAge: 10 * 60 * 1000,
    });
    res.json({ set: true } satisfies SpikeCookieSetResponse);
  });

  app.get('/api/spike/cookie', (req, res) => {
    // eslint-disable-next-line no-restricted-syntax -- deploy spike, deleted once ticket 01's checks pass
    const received = typeof req.cookies[SPIKE_COOKIE] === 'string';
    res.json({ received } satisfies SpikeCookieEchoResponse);
  });

  // Deploy spike (ticket 01): does an SSE stream stay open through the rewrite past 2 minutes?
  app.get('/api/spike/stream', (req, res) => {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    let count = 0;
    const beat = () => {
      const heartbeat: SpikeHeartbeat = { count, at: new Date().toISOString() };
      res.write(`id: ${count}\nevent: ${SPIKE_HEARTBEAT_EVENT}\ndata: ${JSON.stringify(heartbeat)}\n\n`);
      count += 1;
    };

    beat();
    const timer = setInterval(beat, HEARTBEAT_MS);
    req.on('close', () => clearInterval(timer));
  });

  // A logged-out caller gets 401 even for a URL that doesn't exist.
  app.use(sessions.requireSession, () => {
    throw notFound();
  });

  app.use(errorHandler);

  return { app, classifier };
}
