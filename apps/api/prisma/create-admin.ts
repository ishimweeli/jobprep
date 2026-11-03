/**
 * Creates (or upgrades) the first real admin in an environment that must not run the dev seed (production).
 *   npm run admin:create -w @jobprep/api -- you@example.com "Your Name" ["A password of 8+ characters"]
 * Admins are normal accounts: this finds or creates the account for that email (Rwanda, English) and makes sure it
 * holds an active, all-countries SYSTEM_ADMIN role. An existing account keeps its name, password, candidate history and
 * any other roles. Quote the name.
 * The password (optional, new accounts only) goes into the shell history; without it the person opens "Forgot password"
 * on the sign-in page once (that needs email to be configured) and sets their own.
 * Reads DATABASE_URL from the environment. Needs the roles to exist (migrate + reference data first).
 */
import { PrismaClient } from '@prisma/client';
import { hashPassword, PASSWORD_MAX, PASSWORD_MIN } from '../src/services/password';

async function main() {
  // Arguments: email, name (ONE quoted argument), optional password.
  const [rawEmail, rawName, password] = process.argv.slice(2);
  const name = (rawName ?? '').trim();
  const email = rawEmail?.trim().toLowerCase();
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || name.length < 2) {
    console.error('Usage: admin:create <email> "<full name>" ["<password>"]');
    process.exit(1);
  }
  if (password !== undefined && (password.length < PASSWORD_MIN || password.length > PASSWORD_MAX)) {
    console.error(`The password must be ${PASSWORD_MIN} to ${PASSWORD_MAX} characters.`);
    process.exit(1);
  }
  const prisma = new PrismaClient();
  try {
    const role = await prisma.role.findUnique({ where: { name: 'SYSTEM_ADMIN' } });
    if (!role) throw new Error('Roles are missing: load the reference data first.');
    const existing = await prisma.user.findUnique({ where: { email } });
    const now = new Date();
    // A new account is created by the operator, so its address counts as verified and it skips candidate setup.
    const user = existing ?? await prisma.user.create({
      data: {
        email, name, countryCode: 'RW', language: 'en', emailVerifiedAt: now, countryConfirmedAt: now, onboardedAt: now,
        passwordHash: password === undefined ? null : await hashPassword(password),
      },
    });
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: user.id, roleId: role.id } },
      create: { userId: user.id, roleId: role.id, countryScope: [] },
      update: { active: true, countryScope: [] },
    });
    console.log(`System admin ready: ${user.email} (${user.name})${existing ? ' - existing account upgraded' : ''}`);
    if (!existing && password === undefined) console.log('No password set: open "Forgot password" on the sign-in page to choose one (or sign in with Google).');
    if (existing && password !== undefined) console.log('The account already existed, so the password argument was ignored.');
  } finally {
    await prisma.$disconnect();
  }
}
main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
