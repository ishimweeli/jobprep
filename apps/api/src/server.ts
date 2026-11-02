import { PrismaClient } from '@prisma/client';
import { createApp } from './app';
import { loadConfig } from './config';

const config = loadConfig();
const prisma = new PrismaClient();
const app = createApp({ prisma, config });

const server = app.listen(config.PORT, () => {
  console.log(`JobPrep API listening on http://localhost:${config.PORT}`);
});

async function shutdown() {
  server.close();
  await prisma.$disconnect();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
