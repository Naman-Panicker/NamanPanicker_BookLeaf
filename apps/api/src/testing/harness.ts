import bcrypt from 'bcryptjs';
import { createApp } from '../app';
import type { Clock } from '../clock';
import { createPrisma } from '../db';
import type { AppEvent, EventPublisher } from '../events';
import { testDatabaseUrl } from './test-database';

export const prisma = createPrisma(testDatabaseUrl());

export const PASSWORD = 'correct-horse-battery';
// The lowest cost bcrypt allows, so fixtures don't slow the suite down.
const passwordHash = bcrypt.hashSync(PASSWORD, 4);

export const SESSION_SECRET = 'test-session-secret-that-is-long-enough';
const START_TIME = new Date('2026-01-15T10:00:00.000Z');

export function fakeClock() {
  let now = START_TIME;
  return {
    now: () => now,
    advanceDays(days: number) {
      now = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
    },
  } satisfies Clock & Record<string, unknown>;
}

export function recordingPublisher() {
  const events: AppEvent[] = [];
  return { events, publish: (event: AppEvent) => void events.push(event) } satisfies EventPublisher & {
    events: AppEvent[];
  };
}

// supertest talks plain http, and its cookie jar won't send a Secure cookie back over it.
export function makeTestApp(overrides: Partial<Parameters<typeof createApp>[0]> = {}) {
  return createApp({
    cookieSecure: false,
    sessionSecret: SESSION_SECRET,
    prisma,
    clock: fakeClock(),
    publisher: recordingPublisher(),
    ...overrides,
  });
}

export function createAuthor(overrides: { email?: string; name?: string; externalRef?: string } = {}) {
  return prisma.author.create({
    data: {
      externalRef: 'AUTH-TEST-1',
      name: 'Test Author',
      email: 'author@example.com',
      phone: '+91-90000-00000',
      city: 'Pune',
      joinedDate: new Date('2024-01-01'),
      passwordHash,
      ...overrides,
    },
  });
}

export function createAdmin(overrides: { email?: string; name?: string } = {}) {
  return prisma.admin.create({
    data: { name: 'Test Admin', email: 'admin@example.com', passwordHash, ...overrides },
  });
}

export async function resetDatabase() {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
  `;
  if (tables.length === 0) return;
  const names = tables.map(({ tablename }) => `"${tablename}"`).join(', ');
  await prisma.$executeRawUnsafe(`TRUNCATE ${names} CASCADE`);
}

export function disconnectTestDatabase() {
  return prisma.$disconnect();
}
