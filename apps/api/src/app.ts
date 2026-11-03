import type {
  HealthResponse,
  SpikeCookieEchoResponse,
  SpikeCookieSetResponse,
  SpikeHeartbeat,
} from '@bookleaf/shared';
import { SPIKE_HEARTBEAT_EVENT } from '@bookleaf/shared';
import cookieParser from 'cookie-parser';
import express from 'express';

export type AppOptions = {
  cookieSecure: boolean;
};

const SPIKE_COOKIE = 'spike';
// Vercel drops a proxied connection after 120s with no data (ADR-0003).
const HEARTBEAT_MS = 25_000;

export function createApp({ cookieSecure }: AppOptions) {
  const app = express();

  // Vercel caches rewritten responses unless told otherwise (ADR-0003).
  app.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });

  app.use(cookieParser());

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' } satisfies HealthResponse);
  });

  // Deploy spike (ticket 01): does a cookie set by Express survive the Vercel rewrite?
  app.post('/api/spike/cookie', (_req, res) => {
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

  return app;
}
