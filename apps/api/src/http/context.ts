import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { PrismaClient, User } from '@prisma/client';
import type { Config } from '../config';
import { unauthorized } from './errors';
import { findSessionUser, parseCookies, SESSION_COOKIE } from '../services/session';
import type { ProviderRegistry } from '../payments/registry';
import type { ConsoleSmsProvider, SmsProvider } from '../services/sms';

export interface Ctx {
  prisma: PrismaClient;
  config: Config;
  sms: SmsProvider;
  providers: ProviderRegistry;
  now: () => Date;
}

declare module 'express-serve-static-core' {
  interface Request {
    user?: User;
    sessionToken?: string;
    /** Raw JSON body, kept for webhook signature checks. */
    rawBody?: string;
  }
}

export function isConsoleSms(sms: SmsProvider): sms is ConsoleSmsProvider {
  return typeof (sms as ConsoleSmsProvider).lastCode === 'function';
}

/** Resolves the session cookie (if any) onto `req.user`. Never rejects; use requireUser for that. */
export function attachUser(ctx: Ctx): RequestHandler {
  return async (req: Request, _res: Response, next: NextFunction) => {
    const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
    if (token) {
      const found = await findSessionUser(ctx.prisma, ctx.config.SESSION_SECRET, token, ctx.now());
      if (found) {
        req.user = found.user;
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
