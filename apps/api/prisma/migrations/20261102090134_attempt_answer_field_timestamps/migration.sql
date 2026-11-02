/*
  Warnings:

  - You are about to drop the column `clientSeq` on the `AttemptAnswer` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "AttemptAnswer" DROP COLUMN "clientSeq",
ADD COLUMN     "flaggedAt" TIMESTAMP(3),
ADD COLUMN     "selectedAt" TIMESTAMP(3);
