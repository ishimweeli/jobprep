import type { PrismaClient } from '@prisma/client';

export type ClaimOutcome = 'saved' | 'already_saved' | 'nothing_to_save';

/**
 * Link guest attempts to a new/signed-in account ("Save my result").
 * Only unowned attempts in the user's own country are claimed; a guest token is a bearer secret,
 * so it only ever moves an attempt from "nobody" to "this user" — never from one user to another.
 * The answer says what happened to every token so the screen can word it (saved / already saved / nothing to save).
 */
export async function claimGuestAttempts(
  prisma: PrismaClient,
  user: { id: string; countryCode: string },
  guestTokens: string[],
) {
  const tokens = [...new Set(guestTokens)].filter(Boolean);
  const empty = { claimed: 0, alreadyYours: 0, otherCountry: 0, belongsToSomeoneElse: 0, unknown: 0, attemptIds: [] as string[], outcome: 'nothing_to_save' as ClaimOutcome };
  if (tokens.length === 0) return empty;

  const rows = await prisma.attempt.findMany({ where: { guestToken: { in: tokens } }, select: { id: true, userId: true, countryCode: true, guestToken: true } });
  const claimable = rows.filter((r) => r.userId === null && r.countryCode === user.countryCode);
  const res = claimable.length > 0
    ? await prisma.attempt.updateMany({ where: { id: { in: claimable.map((r) => r.id) }, userId: null }, data: { userId: user.id } })
    : { count: 0 };

  const known = new Set(rows.map((r) => r.guestToken));
  const alreadyYours = rows.filter((r) => r.userId === user.id).length;
  const claimed = res.count;
  return {
    claimed,
    alreadyYours,
    otherCountry: rows.filter((r) => r.userId === null && r.countryCode !== user.countryCode).length,
    belongsToSomeoneElse: rows.filter((r) => r.userId !== null && r.userId !== user.id).length,
    unknown: tokens.filter((t) => !known.has(t)).length,
    attemptIds: claimed > 0 ? claimable.map((r) => r.id) : [],
    outcome: (claimed > 0 ? 'saved' : alreadyYours > 0 ? 'already_saved' : 'nothing_to_save') as ClaimOutcome,
  };
}
