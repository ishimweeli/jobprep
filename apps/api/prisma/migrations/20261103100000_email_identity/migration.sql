-- Accounts are identified by email (one-time codes are emailed); phone numbers are only used as the
-- mobile-money payer number at checkout (Payment.msisdn). Column renames keep any existing rows;
-- pending one-time codes are dropped because they were keyed by phone number.
DELETE FROM "OtpCode";

ALTER TABLE "User" RENAME COLUMN "phone" TO "email";
ALTER INDEX "User_phone_key" RENAME TO "User_email_key";

ALTER TABLE "OtpCode" RENAME COLUMN "phone" TO "email";
ALTER INDEX "OtpCode_phone_purpose_createdAt_idx" RENAME TO "OtpCode_email_purpose_createdAt_idx";

ALTER TABLE "WaitingListEntry" RENAME COLUMN "phone" TO "email";
ALTER INDEX "WaitingListEntry_countryCode_phone_key" RENAME TO "WaitingListEntry_countryCode_email_key";

ALTER TABLE "ExamRequest" RENAME COLUMN "phone" TO "email";

ALTER TABLE "AdminUser" RENAME COLUMN "phone" TO "email";
ALTER INDEX "AdminUser_phone_key" RENAME TO "AdminUser_email_key";
