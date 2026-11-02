import { PrismaClient } from '@prisma/client';
import { seedDatabase } from './seed-lib';

const prisma = new PrismaClient();

try {
  const summary = await seedDatabase(prisma);
  console.log('Seeded:', summary);
} catch (err) {
  console.error(err);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
