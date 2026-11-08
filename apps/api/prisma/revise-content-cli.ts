import { readFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';
import { reviseContent, type Revision } from './revise-content';

// Usage: tsx prisma/revise-content-cli.ts <revision.json> [--apply]
// Without --apply it only prints what it would change.
const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
const apply = args.includes('--apply');
if (!file) {
  console.error('usage: revise-content-cli.ts <revision.json> [--apply]');
  process.exit(2);
}

const prisma = new PrismaClient();
try {
  const revision = JSON.parse(readFileSync(file, 'utf8')) as Revision;
  const r = await reviseContent(prisma, revision, { apply });
  console.log(r.lines.join('\n'));
  console.log(`\n${apply ? 'Applied' : 'Dry run (add --apply to write)'}: ${r.mocks} mock(s), ${r.archived} question(s) archived, `
    + `${r.pinned} past attempt(s) pinned, ${r.explanations} explanation(s) updated.`);
} catch (err) {
  console.error(err);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
