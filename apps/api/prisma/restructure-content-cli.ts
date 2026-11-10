import { PrismaClient } from '@prisma/client';
import { restructureContent } from './restructure-content';

// Usage: tsx prisma/restructure-content-cli.ts [--apply]
// Without --apply it only prints what it would change.
const apply = process.argv.includes('--apply');
const prisma = new PrismaClient();
try {
  const r = await restructureContent(prisma, { apply });
  console.log(r.lines.join('\n'));
  console.log(`\n${apply ? 'Applied' : 'Dry run (add --apply to write)'}: ${r.mocks} mock(s), ${r.questions} question(s) updated.`);
} catch (err) {
  console.error(err);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
