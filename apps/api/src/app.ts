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
import { adminRouter } from './routes/admin';
import { interviewsRouter } from './routes/interviews';
import { attemptsRouter } from './routes/attempts';
import { authRouter } from './routes/auth';
import { catalogRouter } from './routes/catalog';
import { countriesRouter } from './routes/countries';
import { meRouter } from './routes/me';
import { paymentsRouter } from './routes/payments';
import { publicRouter } from './routes/public';
import { sitemapRouter } from './routes/sitemap';
import { testSupportRouter } from './routes/test-support';
import { createProviderRegistry, type ProviderRegistry } from './payments/registry';
import type { FetchLike } from './payments/types';
import { ConsoleEmailProvider, type EmailProvider } from './services/email';
import { serveWeb } from './http/static-web';
import { FakeLlmProvider, type LlmProvider } from './interview/llm';
import { FakeSttProvider, type SttProvider } from './interview/stt';
import { createDataCipher } from './services/crypto';
import { routeOf, type ErrorAlerter } from './services/error-alerts';

export interface AppDeps {
  prisma: PrismaClient;
  config: Config;
  email?: EmailProvider;
  providers?: ProviderRegistry;
  now?: () => Date;
  /** Outbound HTTP for Google sign-in (tests inject a mock). */
  fetch?: FetchLike;
  /** Interview prep providers. Default: the fakes (server.ts passes the real ones). */
  llm?: LlmProvider;
  stt?: SttProvider;
  /** Emails the owner when a request fails with a 5xx (server.ts passes it in production; none in tests). */
  alerts?: ErrorAlerter;
}

export function createApp(deps: AppDeps) {
  const { prisma, config } = deps;
  const ctx: Ctx = {
    prisma, config, email: deps.email ?? new ConsoleEmailProvider(),
    providers: deps.providers ?? createProviderRegistry(config),
    now: deps.now ?? (() => new Date()),
    fetch: deps.fetch,
    llm: deps.llm ?? new FakeLlmProvider(),
    stt: deps.stt ?? new FakeSttProvider(),
    cipher: createDataCipher(config),
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

  // Per-IP limits (on in production). Keyed by IP behind the proxy (trust proxy is set). The per-email OTP limits
  // live in the database and always apply.
  const limit = createLimiter(config.RATE_LIMIT_ENABLED === true);
  app.use('/api', limit({ name: 'api-all', windowSeconds: 60, max: 1200 }));
  app.post('/api/attempts/:id/reports', limit({ name: 'question-report', windowSeconds: 3600, max: 20 }));
  app.post('/api/auth/sign-up', limit({ name: 'sign-up', windowSeconds: 60, max: 10 }));
  app.post('/api/auth/sign-in', limit({ name: 'sign-in', windowSeconds: 60, max: 20 }));
  app.post('/api/auth/verify-email', limit({ name: 'verify-email', windowSeconds: 60, max: 20 }));
  app.post('/api/auth/verify-email/resend', limit({ name: 'verify-resend', windowSeconds: 60, max: 10 }));
  app.post('/api/auth/forgot-password', limit({ name: 'forgot-password', windowSeconds: 60, max: 10 }));
  app.post('/api/auth/reset-password', limit({ name: 'reset-password', windowSeconds: 60, max: 10 }));
  app.post(['/api/me/password', '/api/me/email-change', '/api/me/email-change/verify'], limit({ name: 'account-change', windowSeconds: 60, max: 10 }));
  app.post(['/api/payments', '/api/payments/:id/resend'], limit({ name: 'payment-create', windowSeconds: 60, max: 10 }));
  app.post('/api/payments/:id/check', limit({ name: 'payment-check', windowSeconds: 60, max: 30 }));
  app.post('/api/payments/webhooks/:slug', limit({ name: 'webhooks', windowSeconds: 60, max: 600 }));
  app.post(['/api/countries/:code/exam-requests', '/api/countries/:code/waiting-list'], limit({ name: 'requests', windowSeconds: 3600, max: 10 }));
  app.post(['/api/countries/:code/mock-tests/:slug/attempts', '/api/countries/:code/practice', '/api/attempts/:id/practice'], limit({ name: 'attempt-start', windowSeconds: 60, max: 30 }));
  // Interview prep calls paid AI services: limit per account (falls back to the IP when signed out).
  const perUser = (req: express.Request) => req.user?.id ?? req.ip ?? 'unknown';
  app.post(['/api/interviews/jobs', '/api/interviews/jobs/upload', '/api/interviews/jobs/from-exam'], limit({ name: 'interview-jd', windowSeconds: 3600, max: 30, key: perUser }));
  app.post('/api/interviews/sessions/:id/turns', limit({ name: 'interview-turn', windowSeconds: 60, max: 20, key: perUser }));
  app.post(['/api/interviews/sessions', '/api/interviews/sessions/:id/practice'], limit({ name: 'interview-session', windowSeconds: 3600, max: 40, key: perUser }));

  app.get('/api/health', async (_req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      res.json({ status: 'ok', db: 'up' });
    } catch {
      res.status(503).json({ status: 'degraded', db: 'down' });
    }
  });

  app.use('/api/countries', countriesRouter(ctx));
  app.use('/api/countries/:code', catalogRouter(ctx));
  app.use('/api', publicRouter(ctx)); // legal pages, maintenance status
  app.use('/api/auth', authRouter(ctx));
  app.use('/api', paymentsRouter(ctx)); // before /api/me so /api/me/checkout is handled here
  app.use('/api/me', meRouter(ctx));
  app.use('/api/admin', adminRouter(ctx));
  app.use('/api/interviews', interviewsRouter(ctx));
  app.use('/api', attemptsRouter(ctx));
  if (config.ENABLE_TEST_ENDPOINTS) app.use('/api/test', testSupportRouter(ctx));

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'not_found', requestId: _req.id });
  });

  const alert = (req: express.Request, status: number, code: string | undefined, err: unknown) => {
    void deps.alerts?.record({
      where: routeOf(req.method, req.originalUrl),
      status, code,
      message: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
      requestId: req.id,
      userId: req.user?.id,
    });
  };
  const onError: ErrorRequestHandler = (err, req, res, _next) => {
    if (err instanceof HttpError) {
      if (err.status >= 500) alert(req, err.status, err.code, err);
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
    if ((err as { type?: string }).type === 'entity.too.large') return res.status(413).json({ error: 'payload_too_large', requestId: req.id });
    console.error(`[${req.id}]`, err);
    alert(req, 500, 'internal_error', err);
    // The id is what the error page shows as "Reference"; it is also in the server log line above.
    res.status(500).json({ error: 'internal_error', requestId: req.id });
  };
  app.use(sitemapRouter(ctx)); // /sitemap.xml: before serveWeb, which 404s any path with a file extension
  if (config.WEB_DIST_DIR) serveWeb(app, config.WEB_DIST_DIR);

  app.use(onError);

  return app;
}
