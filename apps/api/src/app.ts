import { randomBytes } from 'node:crypto';
import cors from 'cors';
import express, { type ErrorRequestHandler } from 'express';
import helmet from 'helmet';
import type { PrismaClient } from '@prisma/client';
import { ZodError } from 'zod';
import type { Config } from './config';
import { attachUser, type Ctx } from './http/context';
import { createLimiter } from './http/rate-limit';
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
  app.use((req, res, next) => {
    req.id = randomBytes(4).toString('hex').toUpperCase();
    res.setHeader('X-Request-Id', req.id);
    next();
  });
  app.use(helmet());
  app.use(cors({ origin: config.WEB_ORIGIN, credentials: true }));
  // Keep the raw body: payment webhooks are authenticated over the exact bytes received.
  app.use(express.json({ limit: '100kb', verify: (req, _res, buf) => { (req as express.Request).rawBody = buf.toString('utf8'); } }));
  app.use(attachUser(ctx));

  // Per-IP limits (on in production). Keyed by IP behind the proxy (trust proxy is set). The per-phone OTP limits
  // live in the database and always apply.
  const limit = createLimiter(config.RATE_LIMIT_ENABLED === true);
  app.use('/api', limit({ name: 'api-all', windowSeconds: 60, max: 1200 }));
  app.post('/api/auth/otp/request', limit({ name: 'otp-request', windowSeconds: 60, max: 10 }));
  app.post(['/api/auth/sign-up', '/api/auth/sign-in'], limit({ name: 'otp-verify', windowSeconds: 60, max: 20 }));
  app.post(['/api/payments', '/api/payments/:id/resend'], limit({ name: 'payment-create', windowSeconds: 60, max: 10 }));
  app.post('/api/payments/:id/check', limit({ name: 'payment-check', windowSeconds: 60, max: 30 }));
  app.post('/api/payments/webhooks/:slug', limit({ name: 'webhooks', windowSeconds: 60, max: 600 }));
  app.post(['/api/countries/:code/exam-requests', '/api/countries/:code/waiting-list'], limit({ name: 'requests', windowSeconds: 3600, max: 10 }));
  app.post(['/api/countries/:code/mock-tests/:slug/attempts', '/api/countries/:code/practice', '/api/attempts/:id/practice'], limit({ name: 'attempt-start', windowSeconds: 60, max: 30 }));

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
    res.status(404).json({ error: 'not_found', requestId: _req.id });
  });

  const onError: ErrorRequestHandler = (err, req, res, _next) => {
    if (err instanceof HttpError) {
      if (err.status === 429 && typeof err.extra.retryAfterSeconds === 'number') {
        res.set('Retry-After', String(err.extra.retryAfterSeconds));
      }
      return res.status(err.status).json({ error: err.code, ...err.extra, requestId: req.id });
    }
    if (err instanceof ZodError) {
      return res.status(400).json({
        error: 'validation_error',
        requestId: req.id,
        issues: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
    }
    if (err instanceof SyntaxError && 'body' in err) return res.status(400).json({ error: 'invalid_json', requestId: req.id });
    console.error(`[${req.id}]`, err);
    // The id is what the error page shows as "Reference"; it is also in the server log line above.
    res.status(500).json({ error: 'internal_error', requestId: req.id });
  };
  app.use(onError);

  return app;
}
