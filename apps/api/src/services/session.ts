import { createHmac, randomBytes } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';

export const SESSION_COOKIE = 'jp_session';
export const SESSION_TTL_DAYS = 30;

/** Only a keyed hash of the token is stored, so a database leak does not leak live sessions. */
export const hashToken = (secret: string, token: string) =>
  createHmac('sha256', secret).update(token).digest('hex');

export async function createSession(
  prisma: PrismaClient,
  secret: string,
  userId: string,
  now: Date,
  userAgent?: string,
) {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(now.getTime() + SESSION_TTL_DAYS * 86_400_000);
  await prisma.session.create({
    // createdAt is the caller's clock: the admin 12-hour freshness rule is measured from it.
    data: { tokenHash: hashToken(secret, token), userId, expiresAt, createdAt: now, userAgent: userAgent?.slice(0, 200) },
  });
  return { token, expiresAt };
}

export async function findSessionUser(prisma: PrismaClient, secret: string, token: string, now: Date) {
  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(secret, token) },
    include: { user: { include: { roles: { where: { active: true }, include: { role: true } } } } },
  });
  if (!session || !session.user || session.expiresAt <= now) return null;
  if (session.user.status !== 'ACTIVE') return null;
  const { roles, ...user } = session.user;
  return { session, user, roles };
}

export async function destroySession(prisma: PrismaClient, secret: string, token: string) {
  await prisma.session.deleteMany({ where: { tokenHash: hashToken(secret, token) } });
}

export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (header ?? '').split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    if (k) out[k] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

/** The person's active role assignments (what makes an account an admin). */
export function loadActiveRoles(prisma: PrismaClient, userId: string) {
  return prisma.userRole.findMany({ where: { userId, active: true }, include: { role: true }, orderBy: { createdAt: 'asc' } });
}
