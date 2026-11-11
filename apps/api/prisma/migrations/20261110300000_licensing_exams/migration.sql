-- The "Professional licensing exams" category (council licensing exams: NCNM, RMDC, RAHPC, NPC), opened from the
-- "Licensing exams" item in the nav. sync-content never creates categories, so production gets it here.
-- Data only and idempotent; the same row is in seed-lib RW_CATEGORIES (last, sortOrder 6).
INSERT INTO "Category" ("id", "countryCode", "slug", "name", "description", "icon", "sortOrder", "featured", "createdAt")
SELECT 'cat_rw_licensing_exams', 'RW', 'licensing-exams', 'Professional licensing exams',
       'Council licensing exams: nurses and midwives, doctors and dentists, allied health, pharmacy', 'award', 6, false, now()
WHERE EXISTS (SELECT 1 FROM "Country" WHERE "code" = 'RW')
ON CONFLICT ("countryCode", "slug") DO NOTHING;
