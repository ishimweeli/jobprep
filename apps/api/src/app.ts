import cors from 'cors';
import express, { type ErrorRequestHandler } from 'express';
import helmet from 'helmet';
import type { PrismaClient } from '@prisma/client';
import { ZodError } from 'zod';
import type { Config } from './config';
import { attachUser, type Ctx } from './http/context';
import { HttpError } from './http/errors';
import { attemptsRouter } from './routes/attempts';
import { authRouter } from './routes/auth';
import { catalogRouter } from './routes/catalog';
import { countriesRouter } from './routes/countries';
import { meRouter } from './routes/me';
import { paymentsRouter } from './routes/payments';
import { testSupportRouter } from './routes/test-support';
import { createProviderRegistry, type ProviderRegistry } from './payments/registry';
import { ConsoleSmsProvider, type SmsProvider } from './services/sms';

export interface AppDeps {
  prisma: PrismaClient;
  config: Config;
  sms?: SmsProvider;
  providers?: ProviderRegistry;
  now?: () => Date;
}

export function createApp(deps: AppDeps) {
  const { prisma, config } = deps;
  const ctx: Ctx = {
    prisma, config, sms: deps.sms ?? new ConsoleSmsProvider(),
    providers: deps.providers ?? createProviderRegistry(config),
    now: deps.now ?? (() => new Date()),
  };

  const app = express();
  app.disable('x-powered-by');
  // Behind a proxy (nginx / platform) the client IP is in X-Forwarded-For; needed for rate limiting later.
  app.set('trust proxy', 1);
  app.use(helmet());
  app.use(cors({ origin: config.WEB_ORIGIN, credentials: true }));
  // Keep the raw body: payment webhooks are authenticated over the exact bytes received.
  app.use(express.json({ limit: '100kb', verify: (req, _res, buf) => { (req as express.Request).rawBody = buf.toString('utf8'); } }));
  app.use(attachUser(ctx));

  app.get('/api/health', async (_req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      res.json({ status: 'ok', db: 'up' });
    } catch {
      res.status(503).json({ status: 'degraded', db: 'down' });
    }
  });

  app.use('/api/countries', countriesRouter(prisma));
  app.use('/api/countries/:code', catalogRouter(ctx));
  app.use('/api/auth', authRouter(ctx));
  app.use('/api', paymentsRouter(ctx)); // before /api/me so /api/me/checkout is handled here
  app.use('/api/me', meRouter(ctx));
  app.use('/api', attemptsRouter(ctx));
  if (config.ENABLE_TEST_ENDPOINTS) app.use('/api/test', testSupportRouter(ctx));

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'not_found' });
  });

  const onError: ErrorRequestHandler = (err, _req, res, _next) => {
    if (err instanceof HttpError) {
      if (err.status === 429 && typeof err.extra.retryAfterSeconds === 'number') {
        res.set('Retry-After', String(err.extra.retryAfterSeconds));
      }
      return res.status(err.status).json({ error: err.code, ...err.extra });
    }
    if (err instanceof ZodError) {
      return res.status(400).json({
        error: 'validation_error',
        issues: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
    }
    if (err instanceof SyntaxError && 'body' in err) return res.status(400).json({ error: 'invalid_json' });
    console.error(err);
    res.status(500).json({ error: 'internal_error' });
  };
  app.use(onError);

  return app;
}
