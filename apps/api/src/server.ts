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

const config = loadConfig();
const prisma = new PrismaClient();
const email = config.EMAIL_PROVIDER === 'smtp' ? new SmtpEmailProvider(config) : new ConsoleEmailProvider();
const providers = createProviderRegistry(config);
const llm = createLlmProvider(config);
const stt = createSttProvider(config);
const app = createApp({ prisma, config, email, providers, llm, stt });

// Auto-submit attempts whose time ran out even if the candidate never comes back.
const sweeper = setInterval(() => {
  sweepExpiredAttempts({ prisma, now: () => new Date() }).catch((e) => console.error('sweep error', e));
  sweepPayments({ prisma, config, email, providers, now: () => new Date() }).catch((e) => console.error('payment sweep error', e));
  if (config.INTERVIEW_PREP_ENABLED) {
    sweepInterviews({ prisma, config, llm, stt, cipher: createDataCipher(config), now: () => new Date() }).catch((e) => console.error('interview sweep error', e));
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
