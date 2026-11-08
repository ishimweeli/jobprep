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

/** When a job's posting opened: the most recent opening date among its mock tests (a re-advertised post is newer). */
export function deriveJobPostedAt(dates: (Date | null)[]): Date | null {
  const known = dates.filter((d): d is Date => d !== null);
  return known.length === 0 ? null : new Date(Math.max(...known.map((d) => d.getTime())));
}

export interface SearchableMock {
  examId: string;
  examName: string;
  jobDeadlineAt: Date | null;
}

/**
 * The suggested searches on the home page: jobs that are still open, the ones closing soonest first, then jobs with no
 * deadline (the most mock exams first). A job whose deadline has passed is left out, so a suggestion always leads to a
 * job someone can still apply for.
 */
export function activeJobSearches(mocks: SearchableMock[], now: Date, limit = 5): string[] {
  const byJob = new Map<string, SearchableMock[]>();
  for (const m of mocks) byJob.set(m.examId, [...(byJob.get(m.examId) ?? []), m]);
  const jobs = [...byJob.values()].map((rows) => ({
    name: rows[0]!.examName,
    deadline: deriveJobDeadline(rows.map((r) => r.jobDeadlineAt), now),
    mocks: rows.length,
  }));
  return jobs
    .filter((j) => j.deadline === null || j.deadline.getTime() >= now.getTime())
    .sort((a, b) => (a.deadline?.getTime() ?? Infinity) - (b.deadline?.getTime() ?? Infinity) || b.mocks - a.mocks || a.name.localeCompare(b.name))
    .slice(0, limit)
    .map((j) => j.name);
}
