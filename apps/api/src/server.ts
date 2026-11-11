import { PrismaClient } from '@prisma/client';
import { createApp } from './app';
import { loadConfig } from './config';
import { createProviderRegistry } from './payments/registry';
import { sweepExpiredAttempts } from './services/attempts';
import { sweepPayments } from './services/payments';
import { ConsoleEmailProvider, SmtpEmailProvider } from './services/email';
import { createLlmProvider } from './interview/llm';
import { createSttProvider } from './interview/stt';
import { sweepInterviews } from './interview/sessions';
import { createDataCipher } from './services/crypto';
import { ErrorAlerter } from './services/error-alerts';

const config = loadConfig();
const prisma = new PrismaClient();
const email = config.EMAIL_PROVIDER === 'smtp' ? new SmtpEmailProvider(config) : new ConsoleEmailProvider();
const providers = createProviderRegistry(config);
const llm = createLlmProvider(config);
const stt = createSttProvider(config);
// Email the owner when the app breaks for a user (see services/error-alerts.ts). Off when ERROR_ALERT_TO is empty.
const alerts = config.ERROR_ALERT_TO
  ? new ErrorAlerter({ email, to: config.ERROR_ALERT_TO, site: config.WEB_ORIGIN })
  : undefined;
const app = createApp({ prisma, config, email, providers, llm, stt, alerts });

const background = (job: string) => (e: unknown) => {
  console.error(`${job} error`, e);
  void alerts?.record({ where: `background: ${job}`, message: e instanceof Error ? e.message : String(e), stack: e instanceof Error ? e.stack : undefined });
};

// Auto-submit attempts whose time ran out even if the candidate never comes back.
const sweeper = setInterval(() => {
  sweepExpiredAttempts({ prisma, now: () => new Date() }).catch(background('attempt sweep'));
  sweepPayments({ prisma, config, email, providers, now: () => new Date() }).catch(background('payment sweep'));
  if (config.INTERVIEW_PREP_ENABLED) {
    sweepInterviews({ prisma, config, llm, stt, cipher: createDataCipher(config), now: () => new Date() }).catch(background('interview sweep'));
  }
}, 30_000);
sweeper.unref();

const server = app.listen(config.PORT, () => {
  console.log(`JobPrep API listening on http://localhost:${config.PORT}`);
});

async function shutdown() {
  clearInterval(sweeper);
  server.close();
  await prisma.$disconnect();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// A crash: email (waiting at most 8 s for it), then exit as Node would have, so Docker restarts the container.
let crashing = false;
async function crash(kind: string, e: unknown) {
  console.error(kind, e);
  if (crashing) return;
  crashing = true;
  const send = (async () => {
    await alerts?.record({ where: `process: ${kind} (the API is restarting)`, message: e instanceof Error ? e.message : String(e), stack: e instanceof Error ? e.stack : undefined });
    await alerts?.flush();
  })();
  await Promise.race([send, new Promise((r) => setTimeout(r, 8_000))]);
  process.exit(1);
}
process.on('uncaughtException', (e) => void crash('uncaught exception', e));
process.on('unhandledRejection', (e) => void crash('unhandled promise rejection', e));
