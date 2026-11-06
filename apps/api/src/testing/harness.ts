import bcrypt from 'bcryptjs';
import request from 'supertest';
import type { AiClient, AiPrompt } from '../ai-client';
import { createApp } from '../app';
import type { Clock } from '../clock';
import { createPrisma } from '../db';
import type { Prisma } from '../generated/prisma/client';
import { testDatabaseUrl } from './test-database';

export const prisma = createPrisma(testDatabaseUrl());

export const PASSWORD = 'correct-horse-battery';
// The lowest cost bcrypt allows, so fixtures don't slow the suite down.
const passwordHash = bcrypt.hashSync(PASSWORD, 4);

export const SESSION_SECRET = 'test-session-secret-that-is-long-enough';
const START_TIME = new Date('2026-01-15T10:00:00.000Z');

// Waiting takes no time, and each wait is noted so a test can check it.
export function fakeClock() {
  let now = START_TIME;
  const sleeps: number[] = [];
  return {
    now: () => now,
    sleeps,
    sleep(ms: number) {
      sleeps.push(ms);
      return Promise.resolve();
    },
    advanceDays(days: number) {
      now = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
    },
  } satisfies Clock & Record<string, unknown>;
}

// Gives each answer in turn, then keeps repeating the last. An Error makes that attempt fail.
export function fakeAi(...answers: unknown[]) {
  const prompts: AiPrompt[] = [];
  const answerNext = async (prompt: AiPrompt) => {
    prompts.push(prompt);
    const answer = answers[Math.min(prompts.length, answers.length) - 1];
    if (answer instanceof Error) throw answer;
    return answer;
  };
  return { prompts, classify: answerNext, draft: answerNext } satisfies AiClient & Record<string, unknown>;
}

// Doesn't answer until the test says so, to play out what happens while the AI is thinking.
export function heldAi(answer: unknown) {
  let release = () => {};
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  let noteAsked = () => {};
  const asked = new Promise<void>((resolve) => {
    noteAsked = resolve;
  });
  let timesAsked = 0;
  const answerWhenReleased = async () => {
    timesAsked += 1;
    noteAsked();
    await released;
    return answer;
  };
  return {
    asked,
    release: () => release(),
    timesAsked: () => timesAsked,
    classify: answerWhenReleased,
    draft: answerWhenReleased,
  } satisfies AiClient & Record<string, unknown>;
}

// The default, so tests about something else never have background work writing to the database.
const silentAi: AiClient = { classify: () => new Promise(() => {}), draft: () => new Promise(() => {}) };

type AppOverrides = Partial<Parameters<typeof createApp>[0]>;

// supertest talks plain http, and its cookie jar won't send a Secure cookie back over it.
export function makeTestServer(overrides: AppOverrides = {}) {
  return createApp({
    cookieSecure: false,
    sessionSecret: SESSION_SECRET,
    prisma,
    clock: fakeClock(),
    ai: silentAi,
    ...overrides,
  });
}

export function makeTestApp(overrides: AppOverrides = {}) {
  return makeTestServer(overrides).app;
}

// Tests sign in through this, so only this helper knows how a session travels with a request.
export async function signedInAgent(app: ReturnType<typeof makeTestApp>, email: string, password = PASSWORD) {
  const agent = request.agent(app);
  const res = await agent.post('/api/session').send({ email, password });
  if (res.status !== 200) throw new Error(`Could not sign in ${email}: got ${res.status}`);
  return agent;
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

export type BookFixture = Partial<Prisma.BookUncheckedCreateInput>;

export function createBook(authorId: string, overrides: BookFixture = {}) {
  return prisma.book.create({
    data: {
      authorId,
      externalRef: 'BK-TEST-1',
      title: 'Test Book',
      isbn: '978-93-5XXXX-00-0',
      genre: 'Fiction',
      productionStage: 'PUBLISHED_LIVE',
      copiesSold: 0,
      royaltyEarned: 0,
      royaltyPaid: 0,
      royaltyPending: 0,
      ...overrides,
    },
  });
}

export function createAdmin(overrides: { email?: string; name?: string } = {}) {
  return prisma.admin.create({
    data: { name: 'Test Admin', email: 'admin@example.com', passwordHash, ...overrides },
  });
}

type TicketFixture = Partial<Prisma.TicketUncheckedCreateInput>;

// Starts the thread with the Author's description, as raising a Ticket does.
export function createTicket(authorId: string, overrides: TicketFixture = {}) {
  const raisedAt = overrides.createdAt ?? START_TIME;
  return prisma.ticket.create({
    data: {
      authorId,
      subject: 'Test Ticket',
      latestAuthorMessageAt: raisedAt,
      lastUpdateAt: raisedAt,
      createdAt: raisedAt,
      messages: { create: { authorId, body: 'Test description', createdAt: raisedAt } },
      ...overrides,
    },
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
