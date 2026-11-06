-- AlterTable
ALTER TABLE "User" ADD COLUMN     "preferredExamId" TEXT;

-- CreateIndex
CREATE INDEX "User_preferredExamId_idx" ON "User"("preferredExamId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_preferredExamId_fkey" FOREIGN KEY ("preferredExamId") REFERENCES "Exam"("id") ON DELETE SET NULL ON UPDATE CASCADE;
