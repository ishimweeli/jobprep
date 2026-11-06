/**
 * The one deadline shown on a job card/page when its mock tests each carry their own `jobDeadlineAt`
 * (normally identical, since they're all tied to the same real posting, but derived defensively in case
 * they ever drift): the soonest one still open, else the most recent one that already closed.
 */
export function deriveJobDeadline(deadlines: (Date | null)[], now: Date): Date | null {
  const known = deadlines.filter((d): d is Date => d !== null);
  if (known.length === 0) return null;
  const upcoming = known.filter((d) => d.getTime() >= now.getTime()).sort((a, b) => a.getTime() - b.getTime());
  if (upcoming.length > 0) return upcoming[0]!;
  return known.reduce((latest, d) => (d.getTime() > latest.getTime() ? d : latest), known[0]!);
}
