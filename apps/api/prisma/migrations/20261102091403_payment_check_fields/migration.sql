-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "lastCheckedAt" TIMESTAMP(3),
ADD COLUMN     "transactionId" TEXT;
