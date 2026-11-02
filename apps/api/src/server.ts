import { PrismaClient } from '@prisma/client';
import { createApp } from './app';
import { loadConfig } from './config';
import { sweepExpiredAttempts } from './services/attempts';

const config = loadConfig();
const prisma = new PrismaClient();
const app = createApp({ prisma, config });

// Auto-submit attempts whose time ran out even if the candidate never comes back.
const sweeper = setInterval(() => {
  sweepExpiredAttempts({ prisma, now: () => new Date() }).catch((e) => console.error('sweep error', e));
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
