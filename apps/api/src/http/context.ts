import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { PrismaClient, User } from '@prisma/client';
import type { Config } from '../config';
import { unauthorized } from './errors';
import { findSessionUser, parseCookies, SESSION_COOKIE } from '../services/session';
import type { ProviderRegistry } from '../payments/registry';
import type { FetchLike } from '../payments/types';
import type { ConsoleEmailProvider, EmailProvider } from '../services/email';
import type { LlmProvider } from '../interview/llm';
import type { SttProvider } from '../interview/stt';
import type { DataCipher } from '../services/crypto';

export interface Ctx {
  prisma: PrismaClient;
  config: Config;
  email: EmailProvider;
  providers: ProviderRegistry;
  now: () => Date;
  /** Outbound HTTP for sign-in with Google (injected in tests; never call Google from a test). Default: global fetch. */
  fetch?: FetchLike;
  /** AI interview preparation: the language model, speech to text, and encryption at rest. */
  llm: LlmProvider;
  stt: SttProvider;
  cipher: DataCipher;
}

declare module 'express-serve-static-core' {
  interface Request {
    user?: User;
    sessionToken?: string;
    /** Raw JSON body, kept for webhook signature checks. */
    rawBody?: string;
    /** Short id echoed in X-Request-Id and in error bodies, so support can find the log line. */
    id?: string;
    /** The signed-in person's ACTIVE role assignments (empty for a plain candidate). */
    userRoles?: import('../admin/auth').RoleAssignment[];
    /** When the current session was created (sign-in time): the admin freshness rule is measured from it. */
    sessionCreatedAt?: Date;
    /** Set by requireAdmin on /api/admin routes: the signed-in person as an admin principal. */
    admin?: import('../admin/auth').AdminPrincipal;
  }
}

export function isConsoleEmail(email: EmailProvider): email is ConsoleEmailProvider {
  return typeof (email as ConsoleEmailProvider).lastCode === 'function';
}

/** "Last active" is refreshed at most this often per person, so it costs one small write every few minutes. */
export const LAST_SEEN_REFRESH_MS = 5 * 60_000;

/** Resolves the session cookie (if any) onto `req.user`. Never rejects; use requireUser for that. */
export function attachUser(ctx: Ctx): RequestHandler {
  return async (req: Request, _res: Response, next: NextFunction) => {
    const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
    if (token) {
      const now = ctx.now();
      const found = await findSessionUser(ctx.prisma, ctx.config.SESSION_SECRET, token, now);
      if (found) {
        // Signing in used to be the only thing that set lastSeenAt, so anyone who stayed signed in looked
        // idle since their sign-in. Any request made with a live session now counts as being active.
        const seen = found.user.lastSeenAt;
        if (!seen || now.getTime() - seen.getTime() >= LAST_SEEN_REFRESH_MS) {
          try {
            await ctx.prisma.user.update({ where: { id: found.user.id }, data: { lastSeenAt: now } });
            found.user.lastSeenAt = now;
          } catch {
            // Never fail a request because the activity stamp could not be written.
          }
        }
        req.user = found.user;
        req.userRoles = found.roles;
        req.sessionCreatedAt = found.session.createdAt;
        req.sessionToken = token;
      }
    }
    next();
  };
}

export const requireUser: RequestHandler = (req, _res, next) => {
  if (!req.user) return next(unauthorized());
  next();
};
