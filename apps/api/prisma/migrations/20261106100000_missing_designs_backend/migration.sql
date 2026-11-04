-- Demand views, waiting-list interest, report resolution notes.
CREATE TYPE "ExamRequestStatus" AS ENUM ('OPEN', 'DONE');

ALTER TABLE "WaitingListEntry"
  ADD COLUMN "interest" TEXT,
  ADD COLUMN "notifiedAt" TIMESTAMP(3);

ALTER TABLE "ExamRequest"
  ADD COLUMN "normalizedQuery" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "status" "ExamRequestStatus" NOT NULL DEFAULT 'OPEN',
  ADD COLUMN "doneAt" TIMESTAMP(3),
  ADD COLUMN "doneNote" TEXT,
  ADD COLUMN "doneById" TEXT,
  ADD COLUMN "mockTestId" TEXT;

UPDATE "ExamRequest" SET "normalizedQuery" = lower(regexp_replace(btrim("query"), '\s+', ' ', 'g'));

CREATE INDEX "ExamRequest_countryCode_normalizedQuery_idx" ON "ExamRequest"("countryCode", "normalizedQuery");

ALTER TABLE "QuestionReport" ADD COLUMN "resolutionNote" TEXT;
