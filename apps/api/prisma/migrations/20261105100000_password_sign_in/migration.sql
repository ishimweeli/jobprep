-- Sign-in becomes email + password (and Google). The emailed 6-digit code is used once, to verify a new
-- account's email; it is no longer a sign-in method. Data-preserving: existing people keep their account.
--   * they proved their address by code, so emailVerifiedAt = createdAt;
--   * they have no password yet (they use "Forgot password" once);
--   * they are not sent through the new setup screens (onboardedAt / countryConfirmedAt = createdAt).

-- 1. New columns on User.
ALTER TABLE "User"
  ADD COLUMN "passwordHash" TEXT,
  ADD COLUMN "emailVerifiedAt" TIMESTAMP(3),
  ADD COLUMN "googleId" TEXT,
  ADD COLUMN "failedSignIns" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "signInLockedUntil" TIMESTAMP(3),
  ADD COLUMN "countryConfirmedAt" TIMESTAMP(3),
  ADD COLUMN "level" TEXT,
  ADD COLUMN "subject" TEXT,
  ADD COLUMN "examDate" DATE,
  ADD COLUMN "onboardedAt" TIMESTAMP(3);

UPDATE "User" SET
  "emailVerifiedAt" = "createdAt",
  "countryConfirmedAt" = "createdAt",
  "onboardedAt" = "createdAt";

CREATE UNIQUE INDEX "User_googleId_key" ON "User"("googleId");

-- 2. Password-reset links (only a hash of the token is stored).
CREATE TABLE "PasswordReset" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordReset_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PasswordReset_tokenHash_key" ON "PasswordReset"("tokenHash");
CREATE INDEX "PasswordReset_userId_createdAt_idx" ON "PasswordReset"("userId", "createdAt");
ALTER TABLE "PasswordReset" ADD CONSTRAINT "PasswordReset_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 3. OtpPurpose: SIGN_UP / SIGN_IN are replaced by VERIFY_EMAIL. Pending codes were for the old purposes: delete them.
DELETE FROM "OtpCode";
DROP INDEX "OtpCode_email_purpose_createdAt_idx";
ALTER TYPE "OtpPurpose" RENAME TO "OtpPurpose_old";
CREATE TYPE "OtpPurpose" AS ENUM ('VERIFY_EMAIL');
ALTER TABLE "OtpCode" ALTER COLUMN "purpose" TYPE "OtpPurpose" USING ('VERIFY_EMAIL'::"OtpPurpose");
DROP TYPE "OtpPurpose_old";
CREATE INDEX "OtpCode_email_purpose_createdAt_idx" ON "OtpCode"("email", "purpose", "createdAt");
