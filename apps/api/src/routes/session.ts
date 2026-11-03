import {
  apiErrorSchema,
  loginRequestSchema,
  sessionResponseSchema,
  type SessionResponse,
} from '@bookleaf/shared';
import { findAccountByEmail, findAccountForSession, toSessionUser } from '../auth/accounts';
import { verifyPassword } from '../auth/passwords';
import { currentSession, type Sessions } from '../auth/sessions';
import type { PrismaClient } from '../db';
import { ApiError, unauthenticated } from '../http/errors';
import type { createRoutes } from '../http/routes';

type Deps = {
  routes: ReturnType<typeof createRoutes>;
  prisma: PrismaClient;
  sessions: Sessions;
};

export function addSessionRoutes({ routes, prisma, sessions }: Deps) {
  routes.add(
    {
      method: 'post',
      path: '/api/session',
      summary: 'Log in',
      tag: 'Session',
      public: true,
      body: loginRequestSchema,
      responses: {
        200: { description: 'Logged in. Sets the session cookie.', schema: sessionResponseSchema },
        401: { description: 'The email and password do not match.', schema: apiErrorSchema },
      },
    },
    async (_req, res, { body }) => {
      const account = await findAccountByEmail(prisma, body.email);
      if (!(await verifyPassword(body.password, account?.passwordHash)) || !account) {
        throw new ApiError(401, 'INVALID_CREDENTIALS', 'That email and password do not match.');
      }
      await sessions.start(res, account);
      res.json({ user: toSessionUser(account) } satisfies SessionResponse);
    },
  );

  routes.add(
    {
      method: 'get',
      path: '/api/session',
      summary: 'Get the current user',
      tag: 'Session',
      responses: { 200: { description: 'The signed-in user.', schema: sessionResponseSchema } },
    },
    async (_req, res) => {
      const account = await findAccountForSession(prisma, currentSession(res));
      if (!account) throw unauthenticated();
      res.json({ user: toSessionUser(account) } satisfies SessionResponse);
    },
  );

  routes.add(
    {
      method: 'delete',
      path: '/api/session',
      summary: 'Log out',
      tag: 'Session',
      responses: { 204: { description: 'Logged out. Clears the session cookie.' } },
    },
    (_req, res) => {
      sessions.end(res);
      res.status(204).end();
    },
  );
}
