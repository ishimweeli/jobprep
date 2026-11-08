import type { MinuteSource, Prisma, PrismaClient } from '@prisma/client';

/**
 * Interview minutes. Each source of minutes is a bucket (the free trial, one per paid access grant, admin gifts);
 * charged time is taken from the bucket that expires first and recorded per interview in MinuteDebit (the audit
 * trail). Buckets are counted in seconds; people see minutes.
 */
type Db = PrismaClient | Prisma.TransactionClient;

export interface WalletBucket { source: MinuteSource; seconds: number; remainingSeconds: number; expiresAt: Date | null }
export interface Wallet {
  remainingSeconds: number;
  /** Total of the usable buckets, so the page can say "4h 20m remaining of 5 hours". */
  totalSeconds: number;
  /** When the soonest-expiring usable minutes run out (null = never, or nothing left). */
  nextExpiry: Date | null;
  hasPurchased: boolean;
  trialUsed: boolean;
  buckets: WalletBucket[];
}

const usable = (now: Date) => ({ OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] });

/** The free trial: created once per account, on first visit (idempotent through the bucket's unique key). */
export async function ensureTrial(db: Db, userId: string, minutes: number): Promise<void> {
  if (minutes <= 0) return;
  await db.minuteBucket.createMany({
    data: [{ userId, source: 'TRIAL', key: `trial:${userId}`, seconds: minutes * 60, remainingSeconds: minutes * 60, expiresAt: null }],
    skipDuplicates: true,
  });
}

/** Minutes bought with an access grant; they expire with it. Called inside the payment transaction. */
export async function creditGrantMinutes(tx: Db, a: { userId: string; accessGrantId: string; minutes: number; expiresAt: Date }) {
  if (a.minutes <= 0) return;
  await tx.minuteBucket.createMany({
    data: [{
      userId: a.userId, source: 'PURCHASE', key: `grant:${a.accessGrantId}`, accessGrantId: a.accessGrantId,
      seconds: a.minutes * 60, remainingSeconds: a.minutes * 60, expiresAt: a.expiresAt,
    }],
    skipDuplicates: true,
  });
}

/** Spend order: the soonest-expiring minutes first; the never-expiring trial last. */
function spendOrder(a: { expiresAt: Date | null; createdAt: Date }, b: { expiresAt: Date | null; createdAt: Date }) {
  const ea = a.expiresAt?.getTime() ?? Number.POSITIVE_INFINITY;
  const eb = b.expiresAt?.getTime() ?? Number.POSITIVE_INFINITY;
  return ea - eb || a.createdAt.getTime() - b.createdAt.getTime();
}

export async function getWallet(db: Db, userId: string, now: Date): Promise<Wallet> {
  const all = await db.minuteBucket.findMany({ where: { userId } });
  const live = all.filter((b) => b.expiresAt === null || b.expiresAt > now).sort(spendOrder);
  const withTime = live.filter((b) => b.remainingSeconds > 0);
  const trial = all.find((b) => b.source === 'TRIAL');
  return {
    remainingSeconds: withTime.reduce((s, b) => s + b.remainingSeconds, 0),
    totalSeconds: live.reduce((s, b) => s + b.seconds, 0),
    nextExpiry: withTime.find((b) => b.expiresAt)?.expiresAt ?? null,
    hasPurchased: live.some((b) => b.source === 'PURCHASE'),
    trialUsed: !!trial && trial.remainingSeconds < trial.seconds,
    buckets: live.map((b) => ({ source: b.source, seconds: b.seconds, remainingSeconds: b.remainingSeconds, expiresAt: b.expiresAt })),
  };
}

/** Seconds left right now (cheap; used on every interview request). */
export async function remainingSeconds(db: Db, userId: string, now: Date): Promise<number> {
  const r = await db.minuteBucket.aggregate({ where: { userId, remainingSeconds: { gt: 0 }, ...usable(now) }, _sum: { remainingSeconds: true } });
  return r._sum.remainingSeconds ?? 0;
}

/**
 * Charge `seconds` of interview time. Must run inside a transaction: the person's buckets are locked so two
 * requests can never spend the same second. Returns the seconds actually charged (less when the balance ran out).
 */
export async function debitSeconds(tx: Prisma.TransactionClient, userId: string, sessionId: string, seconds: number, now: Date): Promise<number> {
  if (seconds <= 0) return 0;
  await tx.$queryRaw`SELECT id FROM "MinuteBucket" WHERE "userId" = ${userId} FOR UPDATE`;
  const buckets = (await tx.minuteBucket.findMany({ where: { userId, remainingSeconds: { gt: 0 }, ...usable(now) } })).sort(spendOrder);
  let left = seconds;
  for (const b of buckets) {
    if (left === 0) break;
    const take = Math.min(left, b.remainingSeconds);
    await tx.minuteBucket.update({ where: { id: b.id }, data: { remainingSeconds: { decrement: take } } });
    await tx.minuteDebit.upsert({
      where: { bucketId_sessionId: { bucketId: b.id, sessionId } },
      create: { bucketId: b.id, userId, sessionId, seconds: take },
      update: { seconds: { increment: take } },
    });
    left -= take;
  }
  return seconds - left;
}
