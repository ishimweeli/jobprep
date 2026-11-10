-- Optional feedback after a finished exam: a 1-5 rating and an optional comment, one per attempt.
-- Additive only (a new table), so the running API keeps working while this migration applies.
CREATE TABLE "ExamFeedback" (
    "id" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "userId" TEXT,
    "mockTestId" TEXT NOT NULL,
    "countryCode" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExamFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ExamFeedback_attemptId_key" ON "ExamFeedback"("attemptId");

-- CreateIndex
CREATE INDEX "ExamFeedback_countryCode_createdAt_idx" ON "ExamFeedback"("countryCode", "createdAt");

-- CreateIndex
CREATE INDEX "ExamFeedback_mockTestId_idx" ON "ExamFeedback"("mockTestId");

-- AddForeignKey
ALTER TABLE "ExamFeedback" ADD CONSTRAINT "ExamFeedback_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "Attempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamFeedback" ADD CONSTRAINT "ExamFeedback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
