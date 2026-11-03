/**
 * Creates (or upgrades) the first real admin in an environment that must not run the dev seed (production).
 *   npm run admin:create -w @jobprep/api -- you@example.com "Your Name"
 * Admins are normal accounts: this finds or creates the account for that email (Rwanda, English) and makes sure it
 * holds an active, all-countries SYSTEM_ADMIN role. An existing account keeps its name, candidate history and any
 * other roles. The person then signs in at the normal sign-in page with that email.
 * Reads DATABASE_URL from the environment. Needs the roles to exist (migrate + reference data first).
 */
import { PrismaClient } from '@prisma/client';

async function main() {
  const [rawEmail, ...nameParts] = process.argv.slice(2);
  const email = rawEmail?.trim().toLowerCase();
  const name = nameParts.join(' ').trim();
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || name.length < 2) {
    console.error('Usage: admin:create <email> "<full name>"');
    process.exit(1);
  }
  const prisma = new PrismaClient();
  try {
    const role = await prisma.role.findUnique({ where: { name: 'SYSTEM_ADMIN' } });
    if (!role) throw new Error('Roles are missing: load the reference data first.');
    const existing = await prisma.user.findUnique({ where: { email } });
    const user = existing ?? await prisma.user.create({ data: { email, name, countryCode: 'RW', language: 'en' } });
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: user.id, roleId: role.id } },
      create: { userId: user.id, roleId: role.id, countryScope: [] },
      update: { active: true, countryScope: [] },
    });
    console.log(`System admin ready: ${user.email} (${user.name})${existing ? ' - existing account upgraded' : ''}`);
  } finally {
    await prisma.$disconnect();
  }
}
main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
