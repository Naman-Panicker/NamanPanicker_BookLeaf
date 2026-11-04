import { type Role, roleSchema } from '@bookleaf/shared';
import type { CookieOptions, RequestHandler, Response } from 'express';
import { errors, jwtVerify, SignJWT } from 'jose';
import type { Clock } from '../clock';
import { notFound, unauthenticated } from '../http/errors';

export type Session = { id: string; role: Role };

export const SESSION_COOKIE_NAME = 'bookleaf_session';
const LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;
const ALGORITHM = 'HS256';

type Options = {
  secret: string;
  cookieSecure: boolean;
  clock: Clock;
};

// The session lives entirely in a signed cookie, so nothing is stored on the server.
export function createSessions({ secret, cookieSecure, clock }: Options) {
  const key = new TextEncoder().encode(secret);
  const cookieOptions: CookieOptions = { httpOnly: true, sameSite: 'lax', secure: cookieSecure, path: '/' };

  async function verify(token: string): Promise<Session | undefined> {
    try {
      const { payload } = await jwtVerify(token, key, { algorithms: [ALGORITHM], currentDate: clock.now() });
      const role = roleSchema.safeParse(payload.role);
      return payload.sub && role.success ? { id: payload.sub, role: role.data } : undefined;
    } catch (error) {
      if (error instanceof errors.JOSEError) return undefined;
      throw error;
    }
  }

  const requireSession: RequestHandler = async (req, res, next) => {
    const token: unknown = req.cookies[SESSION_COOKIE_NAME];
    const session = typeof token === 'string' ? await verify(token) : undefined;
    if (!session) throw unauthenticated();
    res.locals.session = session;
    next();
  };

  return {
    requireSession,

    async start(res: Response, { id, role }: Session) {
      const now = clock.now();
      const token = await new SignJWT({ role })
        .setProtectedHeader({ alg: ALGORITHM })
        .setSubject(id)
        .setIssuedAt(now)
        .setExpirationTime(new Date(now.getTime() + LIFETIME_MS))
        .sign(key);
      res.cookie(SESSION_COOKIE_NAME, token, { ...cookieOptions, maxAge: LIFETIME_MS });
    },

    end(res: Response) {
      res.clearCookie(SESSION_COOKIE_NAME, cookieOptions);
    },
  };
}

export type Sessions = ReturnType<typeof createSessions>;

// For handlers behind requireSession. Using it on a public route returns undefined.
export function currentSession(res: Response): Session {
  return res.locals.session as Session;
}

// For routes about the caller's own records. An Admin has none, so to them the routes don't exist.
export function currentAuthorId(res: Response) {
  const { id, role } = currentSession(res);
  if (role !== 'AUTHOR') throw notFound();
  return id;
}
