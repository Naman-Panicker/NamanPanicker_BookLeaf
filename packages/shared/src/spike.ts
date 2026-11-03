import { z } from 'zod';

// Response shapes for the deploy spike (ticket 01). The web spike page parses
// the API's answers with these, so both sides agree on the wire format.

export const spikeCookieSetResponseSchema = z.object({ set: z.literal(true) });
export type SpikeCookieSetResponse = z.infer<typeof spikeCookieSetResponseSchema>;

export const spikeCookieEchoResponseSchema = z.object({ received: z.boolean() });
export type SpikeCookieEchoResponse = z.infer<typeof spikeCookieEchoResponseSchema>;

// A named SSE event rather than a comment line, because EventSource never surfaces comments.
export const SPIKE_HEARTBEAT_EVENT = 'heartbeat';

export const spikeHeartbeatSchema = z.object({ count: z.number().int(), at: z.iso.datetime() });
export type SpikeHeartbeat = z.infer<typeof spikeHeartbeatSchema>;
