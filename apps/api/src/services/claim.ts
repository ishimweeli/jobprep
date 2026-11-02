import type { PrismaClient } from '@prisma/client';

/**
 * Link guest attempts to a new/signed-in account ("Save my result").
 * Only unowned attempts in the user's own country are claimed; a guest token is a bearer secret,
 * so it only ever moves an attempt from "nobody" to "this user" — never from one user to another.
 */
export async function claimGuestAttempts(
  prisma: PrismaClient,
  user: { id: string; countryCode: string },
  guestTokens: string[],
) {
  const tokens = [...new Set(guestTokens)].filter(Boolean);
  if (tokens.length === 0) return { claimed: 0 };
  const res = await prisma.attempt.updateMany({
    where: { guestToken: { in: tokens }, userId: null, countryCode: user.countryCode },
    data: { userId: user.id },
  });
  return { claimed: res.count };
}
