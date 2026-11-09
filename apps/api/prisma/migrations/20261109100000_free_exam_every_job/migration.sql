-- Every job offers exactly one free mock exam (its Mock Exam 1). Nine jobs had none; this opens theirs.
-- Data only and idempotent: a mock that is missing, or already free, is left as it is. sync-content never changes
-- isFree on a mock that exists, so production needs this to catch up with seed-data.
UPDATE "MockTest" SET "isFree" = true
WHERE "countryCode" = 'RW' AND "slug" IN (
  'sedo-full-mock-1',
  'executive-secretary-full-mock-1',
  'human-capital-social-development-officer-mock-exam-1',
  'accountant-mininter-full-mock-exam-1',
  'internal-auditor-mininter-full-mock-exam-1',
  'biomedical-technician-full-mock-1',
  'biostatistician-full-mock-1',
  'clinical-psychologist-full-mock-1',
  'network-specialist-full-mock-1'
);
