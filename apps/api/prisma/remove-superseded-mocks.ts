import { PrismaClient } from '@prisma/client';

/**
 * One-off cleanup: removes the 30 "first pass" MININTER/Ndera-clinical/Ndera-ICT mocks that were superseded by
 * their "full" (100-question) replacements but never retired from ALL_TESTS, so both sets were live at once.
 * Never deletes a mock that any candidate has actually attempted — reports it instead, so a real attempt is
 * never silently destroyed. Safe to run more than once: already-removed slugs are just reported as not found.
 */
const SLUGS = [
  'accountant-mininter-standards-risk-mock-1', 'accountant-mininter-budgeting-ifmis-mtef-mock-2',
  'accountant-mininter-reconciliation-reporting-mock-3', 'accountant-mininter-psychometric-mock-4', 'accountant-mininter-case-study-mock-5',
  'internal-auditor-mininter-standards-governance-mock-1', 'internal-auditor-mininter-risk-based-planning-mock-2',
  'internal-auditor-mininter-review-reporting-mock-3', 'internal-auditor-mininter-psychometric-mock-4', 'internal-auditor-mininter-case-study-mock-5',
  'biostatistician-research-methods-mock-1', 'biostatistician-data-management-mock-2', 'biostatistician-epidemiology-ethics-mock-3',
  'biostatistician-psychometric-reasoning-mock-4', 'biostatistician-case-study-mock-5',
  'clinical-psychologist-assessment-fundamentals-mock-1', 'clinical-psychologist-therapeutic-interventions-mock-2',
  'clinical-psychologist-risk-ethics-mock-3', 'clinical-psychologist-judgment-mock-4', 'clinical-psychologist-case-study-mock-5',
  'biomedical-technician-equipment-lifecycle-mock-1', 'biomedical-technician-standards-procurement-mock-2',
  'biomedical-technician-troubleshooting-fundamentals-mock-3', 'biomedical-technician-psychometric-mock-4', 'biomedical-technician-case-infusion-pump-mock-5',
  'network-specialist-fundamentals-mock-1', 'network-specialist-services-vlan-vpn-mock-2', 'network-specialist-security-troubleshooting-mock-3',
  'network-specialist-psychometric-mock-4', 'network-specialist-case-emr-connectivity-mock-5',
];

async function main() {
  const prisma = new PrismaClient();
  let removed = 0, notFound = 0, hadAttempts = 0;
  try {
    for (const slug of SLUGS) {
      const mock = await prisma.mockTest.findUnique({ where: { countryCode_slug: { countryCode: 'RW', slug } } });
      if (!mock) { notFound++; continue; }
      const attempts = await prisma.attempt.count({ where: { mockTestId: mock.id } });
      if (attempts > 0) {
        console.log(`SKIPPED (has ${attempts} real attempt(s), not deleted): ${slug}`);
        hadAttempts++;
        continue;
      }
      await prisma.mockTest.delete({ where: { id: mock.id } });
      removed++;
    }
    console.log(`\nRemoved: ${removed}, not found (already gone): ${notFound}, skipped (had attempts): ${hadAttempts}`);
  } finally {
    await prisma.$disconnect();
  }
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
