import { setTimeout as delay } from 'node:timers/promises';

export type Clock = {
  now(): Date;
  sleep(ms: number): Promise<void>;
};

export const systemClock: Clock = {
  now: () => new Date(),
  sleep: async (ms) => {
    await delay(ms);
  },
};
