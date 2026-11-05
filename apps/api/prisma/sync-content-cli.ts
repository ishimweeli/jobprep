import { PrismaClient } from '@prisma/client';
import { syncContent } from './sync-content';

const prisma = new PrismaClient();

try {
  const summary = await syncContent(prisma);
  console.log('Content sync:', summary);
} catch (err) {
  console.error(err);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
