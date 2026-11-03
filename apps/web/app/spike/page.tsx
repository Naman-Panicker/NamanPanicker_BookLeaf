'use client';

import {
  SPIKE_HEARTBEAT_EVENT,
  spikeCookieEchoResponseSchema,
  spikeCookieSetResponseSchema,
  spikeHeartbeatSchema,
} from '@bookleaf/shared';
import { useEffect, useRef, useState } from 'react';

// Deploy spike (ticket 01). Open this page on the live Vercel URL to check that
// the API's cookie and SSE stream both survive the /api rewrite.

const STREAM_TARGET_MS = 2 * 60 * 1000;

type CookieResult = { state: 'idle' } | { state: 'running' } | { state: 'done'; received: boolean } | { state: 'error'; message: string };

type StreamState = {
  openedAt: number;
  heartbeats: number;
  lastHeartbeatAt: number | null;
  errors: number;
};

export default function SpikePage() {
  const [cookie, setCookie] = useState<CookieResult>({ state: 'idle' });
  const [stream, setStream] = useState<StreamState | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const source = useRef<EventSource | null>(null);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      clearInterval(timer);
      source.current?.close();
    };
  }, []);

  async function runCookieCheck() {
    setCookie({ state: 'running' });
    try {
      const set = await fetch('/api/spike/cookie', { method: 'POST' });
      spikeCookieSetResponseSchema.parse(await set.json());
      const echo = await fetch('/api/spike/cookie');
      const { received } = spikeCookieEchoResponseSchema.parse(await echo.json());
      setCookie({ state: 'done', received });
    } catch (error) {
      setCookie({ state: 'error', message: String(error) });
    }
  }

  function startStream() {
    source.current?.close();
    const es = new EventSource('/api/spike/stream');
    source.current = es;
    setStream({ openedAt: Date.now(), heartbeats: 0, lastHeartbeatAt: null, errors: 0 });
    es.addEventListener(SPIKE_HEARTBEAT_EVENT, (event) => {
      spikeHeartbeatSchema.parse(JSON.parse(event.data));
      setStream((s) => s && { ...s, heartbeats: s.heartbeats + 1, lastHeartbeatAt: Date.now() });
    });
    // EventSource reconnects by itself, so any error means the stream dropped at least once.
    es.addEventListener('error', () => {
      setStream((s) => s && { ...s, errors: s.errors + 1 });
    });
  }

  const sinceOpen = (at: number | null) => (stream && at ? Math.round((at - stream.openedAt) / 1000) : null);
  const streamPassed =
    stream !== null &&
    stream.errors === 0 &&
    stream.lastHeartbeatAt !== null &&
    stream.lastHeartbeatAt - stream.openedAt > STREAM_TARGET_MS;

  return (
    <main>
      <h1>Deploy spike</h1>

      <section>
        <h2>Cookie through the rewrite</h2>
        <button onClick={runCookieCheck} disabled={cookie.state === 'running'}>
          Run cookie check
        </button>
        <p data-testid="cookie-result">
          {cookie.state === 'idle' && 'Not run yet.'}
          {cookie.state === 'running' && 'Running…'}
          {cookie.state === 'done' &&
            (cookie.received ? 'PASS: the cookie came back on the next request.' : 'FAIL: the cookie did not come back.')}
          {cookie.state === 'error' && `ERROR: ${cookie.message}`}
        </p>
      </section>

      <section>
        <h2>SSE stream past 2 minutes</h2>
        <button onClick={startStream}>{stream ? 'Restart stream' : 'Open stream'}</button>
        {stream && (
          <dl data-testid="stream-result">
            <dt>Open for</dt>
            <dd>{sinceOpen(now)}s</dd>
            <dt>Heartbeats received</dt>
            <dd>{stream.heartbeats}</dd>
            <dt>Last heartbeat</dt>
            <dd>{stream.lastHeartbeatAt ? `${sinceOpen(stream.lastHeartbeatAt)}s after opening` : 'none yet'}</dd>
            <dt>Drops (EventSource errors)</dt>
            <dd>{stream.errors}</dd>
            <dt>Result</dt>
            <dd>
              {streamPassed
                ? 'PASS: still receiving heartbeats after 2 minutes with no drops.'
                : stream.errors > 0
                  ? 'FAIL: the stream dropped.'
                  : 'Waiting for a heartbeat after the 2-minute mark…'}
            </dd>
          </dl>
        )}
      </section>
    </main>
  );
}
