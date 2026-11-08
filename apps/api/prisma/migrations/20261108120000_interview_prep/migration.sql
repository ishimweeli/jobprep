-- AI interview preparation (off until INTERVIEW_PREP_ENABLED=true): the Full Access + Interview prep plan, the
-- interview minute wallet (buckets + an audit trail of charged time) and the interview records. Additive only.

-- CreateEnum
CREATE TYPE "PaymentKind" AS ENUM ('PURCHASE', 'UPGRADE');

-- CreateEnum
CREATE TYPE "InterviewMode" AS ENUM ('REAL', 'PRACTICE');

-- CreateEnum
CREATE TYPE "InterviewKind" AS ENUM ('MIXED', 'TECHNICAL', 'BEHAVIORAL');

-- CreateEnum
CREATE TYPE "InterviewLevel" AS ENUM ('BEGINNER', 'INTERMEDIATE', 'ADVANCED');

-- CreateEnum
CREATE TYPE "InterviewStatus" AS ENUM ('READY', 'ACTIVE', 'PAUSED', 'ENDED', 'EVALUATED', 'FAILED');

-- CreateEnum
CREATE TYPE "InterviewJobSource" AS ENUM ('PASTE', 'UPLOAD', 'JOBPREP');

-- CreateEnum
CREATE TYPE "InterviewRole" AS ENUM ('INTERVIEWER', 'CANDIDATE');

-- CreateEnum
CREATE TYPE "MinuteSource" AS ENUM ('TRIAL', 'PURCHASE', 'ADMIN');

-- AlterTable
ALTER TABLE "PlanConfig" ADD COLUMN     "interviewMinutes" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "kind" "PaymentKind" NOT NULL DEFAULT 'PURCHASE';

-- CreateTable
CREATE TABLE "InterviewJob" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "countryCode" TEXT NOT NULL,
    "source" "InterviewJobSource" NOT NULL,
    "examId" TEXT,
    "title" TEXT NOT NULL,
    "fileName" TEXT,
    "textEnc" TEXT NOT NULL,
    "profile" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InterviewJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InterviewSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "previousSessionId" TEXT,
    "mode" "InterviewMode" NOT NULL DEFAULT 'REAL',
    "kind" "InterviewKind" NOT NULL DEFAULT 'MIXED',
    "level" "InterviewLevel" NOT NULL DEFAULT 'INTERMEDIATE',
    "durationMinutes" INTEGER NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'en',
    "focus" TEXT[],
    "status" "InterviewStatus" NOT NULL DEFAULT 'READY',
    "plan" JSONB NOT NULL,
    "summaryEnc" TEXT,
    "summarizedThrough" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3),
    "lastBeatAt" TIMESTAMP(3),
    "activeSeconds" INTEGER NOT NULL DEFAULT 0,
    "endedAt" TIMESTAMP(3),
    "endReason" TEXT,
    "reportEnc" TEXT,
    "overallScore" INTEGER,
    "evaluationAttempts" INTEGER NOT NULL DEFAULT 0,
    "llmInputTokens" INTEGER NOT NULL DEFAULT 0,
    "llmOutputTokens" INTEGER NOT NULL DEFAULT 0,
    "sttSeconds" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InterviewSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InterviewTurn" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "role" "InterviewRole" NOT NULL,
    "textEnc" TEXT NOT NULL,
    "topicId" TEXT,
    "audioSeconds" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InterviewTurn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InterviewScore" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "competency" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "score" INTEGER NOT NULL,

    CONSTRAINT "InterviewScore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MinuteBucket" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "source" "MinuteSource" NOT NULL,
    "key" TEXT NOT NULL,
    "accessGrantId" TEXT,
    "seconds" INTEGER NOT NULL,
    "remainingSeconds" INTEGER NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MinuteBucket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MinuteDebit" (
    "id" TEXT NOT NULL,
    "bucketId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sessionId" TEXT,
    "seconds" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MinuteDebit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InterviewJob_userId_createdAt_idx" ON "InterviewJob"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "InterviewSession_userId_createdAt_idx" ON "InterviewSession"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "InterviewSession_status_lastBeatAt_idx" ON "InterviewSession"("status", "lastBeatAt");

-- CreateIndex
CREATE UNIQUE INDEX "InterviewTurn_sessionId_seq_key" ON "InterviewTurn"("sessionId", "seq");

-- CreateIndex
CREATE UNIQUE INDEX "InterviewScore_sessionId_competency_key" ON "InterviewScore"("sessionId", "competency");

-- CreateIndex
CREATE UNIQUE INDEX "MinuteBucket_key_key" ON "MinuteBucket"("key");

-- CreateIndex
CREATE UNIQUE INDEX "MinuteBucket_accessGrantId_key" ON "MinuteBucket"("accessGrantId");

-- CreateIndex
CREATE INDEX "MinuteBucket_userId_expiresAt_idx" ON "MinuteBucket"("userId", "expiresAt");

-- CreateIndex
CREATE INDEX "MinuteDebit_userId_idx" ON "MinuteDebit"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "MinuteDebit_bucketId_sessionId_key" ON "MinuteDebit"("bucketId", "sessionId");

-- AddForeignKey
ALTER TABLE "InterviewJob" ADD CONSTRAINT "InterviewJob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterviewJob" ADD CONSTRAINT "InterviewJob_examId_fkey" FOREIGN KEY ("examId") REFERENCES "Exam"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterviewSession" ADD CONSTRAINT "InterviewSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterviewSession" ADD CONSTRAINT "InterviewSession_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "InterviewJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterviewSession" ADD CONSTRAINT "InterviewSession_previousSessionId_fkey" FOREIGN KEY ("previousSessionId") REFERENCES "InterviewSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterviewTurn" ADD CONSTRAINT "InterviewTurn_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "InterviewSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterviewScore" ADD CONSTRAINT "InterviewScore_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "InterviewSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MinuteBucket" ADD CONSTRAINT "MinuteBucket_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MinuteBucket" ADD CONSTRAINT "MinuteBucket_accessGrantId_fkey" FOREIGN KEY ("accessGrantId") REFERENCES "AccessGrant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MinuteDebit" ADD CONSTRAINT "MinuteDebit_bucketId_fkey" FOREIGN KEY ("bucketId") REFERENCES "MinuteBucket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MinuteDebit" ADD CONSTRAINT "MinuteDebit_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "InterviewSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- The second tier: everything Full Access gives plus 300 interview minutes, 3,000 RWF for 30 days. Plans are not
-- seeded in production, so the row is created here (Rwanda only; other countries get one when they go live).
INSERT INTO "PlanConfig" ("id", "countryCode", "code", "name", "priceMinor", "currencyCode", "durationDays", "autoRenew", "active", "interviewMinutes", "updatedAt")
SELECT 'plan_rw_full_access_interview', 'RW', 'FULL_ACCESS_INTERVIEW', 'Full Access + Interview prep', 3000, 'RWF', 30, false, true, 300, CURRENT_TIMESTAMP
WHERE EXISTS (SELECT 1 FROM "Country" WHERE "code" = 'RW')
ON CONFLICT ("countryCode", "code") DO NOTHING;
