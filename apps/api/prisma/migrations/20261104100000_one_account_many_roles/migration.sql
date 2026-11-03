-- One account, many roles: admin people stop being a separate account type. An admin is a normal User
-- (identified by email, signs in with the emailed code) who holds one or more UserRole rows.
-- Data-preserving: every AdminUser becomes (or is matched to) a User and keeps its role, scope and
-- active flag as a UserRole; every foreign key that pointed at AdminUser is re-pointed at that User.
-- Runs cleanly on empty tables (production has no admin rows).

-- 1. Admin-only sign-in codes and sessions cannot survive the change.
DELETE FROM "OtpCode" WHERE "purpose" = 'ADMIN_SIGN_IN';
DELETE FROM "Session" WHERE "userId" IS NULL;

-- 2. The new table.
CREATE TABLE "UserRole" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "countryScope" TEXT[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserRole_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "UserRole_userId_roleId_key" ON "UserRole"("userId", "roleId");
CREATE INDEX "UserRole_roleId_active_idx" ON "UserRole"("roleId", "active");
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 3. Map every AdminUser to a User (matched by email, otherwise created in Rwanda, English).
CREATE TABLE "_AdminUserMap" (
    "adminId" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL
);
INSERT INTO "User" ("id", "countryCode", "email", "name", "status", "language", "createdAt")
SELECT 'adm_' || a."id", 'RW', lower(a."email"), a."name", 'ACTIVE', 'en', a."createdAt"
FROM "AdminUser" a
WHERE NOT EXISTS (SELECT 1 FROM "User" u WHERE u."email" = lower(a."email"));
INSERT INTO "_AdminUserMap" ("adminId", "userId")
SELECT a."id", u."id" FROM "AdminUser" a JOIN "User" u ON u."email" = lower(a."email");
INSERT INTO "UserRole" ("id", "userId", "roleId", "countryScope", "active", "createdAt")
SELECT 'ur_' || a."id", m."userId", a."roleId", a."countryScope", a."active", a."createdAt"
FROM "AdminUser" a JOIN "_AdminUserMap" m ON m."adminId" = a."id";

-- 4. Re-point the foreign keys (drop first, so the new ids are accepted, then add them back at User).
ALTER TABLE "AccessGrant" DROP CONSTRAINT "AccessGrant_grantedById_fkey";
ALTER TABLE "QuestionReport" DROP CONSTRAINT "QuestionReport_resolvedById_fkey";
ALTER TABLE "AuditLog" DROP CONSTRAINT "AuditLog_actorId_fkey";

UPDATE "AccessGrant" g SET "grantedById" = m."userId" FROM "_AdminUserMap" m WHERE g."grantedById" = m."adminId";
UPDATE "QuestionReport" r SET "resolvedById" = m."userId" FROM "_AdminUserMap" m WHERE r."resolvedById" = m."adminId";
UPDATE "AuditLog" l SET "actorId" = m."userId" FROM "_AdminUserMap" m WHERE l."actorId" = m."adminId";

ALTER TABLE "AccessGrant" ADD CONSTRAINT "AccessGrant_grantedById_fkey" FOREIGN KEY ("grantedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "QuestionReport" ADD CONSTRAINT "QuestionReport_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 5. Sessions belong to a User only.
ALTER TABLE "Session" DROP CONSTRAINT "Session_adminUserId_fkey";
ALTER TABLE "Session" DROP COLUMN "adminUserId";
ALTER TABLE "Session" ALTER COLUMN "userId" SET NOT NULL;

-- 6. AdminUser is gone.
DROP TABLE "_AdminUserMap";
DROP TABLE "AdminUser";

-- 7. No admin sign-in purpose any more (pending codes were deleted above).
ALTER TYPE "OtpPurpose" RENAME TO "OtpPurpose_old";
CREATE TYPE "OtpPurpose" AS ENUM ('SIGN_UP', 'SIGN_IN');
ALTER TABLE "OtpCode" ALTER COLUMN "purpose" TYPE "OtpPurpose" USING ("purpose"::text::"OtpPurpose");
DROP TYPE "OtpPurpose_old";
