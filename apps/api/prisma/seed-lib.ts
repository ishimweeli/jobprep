import { Prisma, type PrismaClient } from '@prisma/client';
import { catalogues } from '@jobprep/shared';
import { ROLE_LABELS, ROLE_PERMISSIONS, type AdminRoleCode } from '../src/domain/permissions';
import { hashPassword } from '../src/services/password';
import type { QDef, TestDef } from './seed-data/types';
import {
  accountantFreeSample, accountantMock1, executiveSecretaryFree, executiveSecretaryMock2,
  headteacherMock1, ictOfficerFree, keAccountantMock, keTeachingSample, procurementFree, procurementMock1,
} from './seed-data/tests-professional';
import {
  primaryTeacherGeneral, secondaryMathsS1S3, secondaryMathsS4S6, teachingProfessionCbc,
} from './seed-data/tests-teaching';

/** Password of the dev admins (system.admin@, content.editor@, support@, multi.role@jobprep.test). Never set in production. */
export const DEV_PASSWORD = 'Password123!';

const KEYS = ['A', 'B', 'C', 'D', 'E', 'F'];

const COUNTRIES = [
  { code: 'RW', slug: 'rw', name: 'Rwanda', status: 'LIVE', currencyCode: 'RWF', currencyExponent: 0, dialCode: '+250',
    languages: ['en', 'rw'], disclaimer: catalogues.en['disclaimer.rw']! },
  { code: 'KE', slug: 'ke', name: 'Kenya', status: 'PREPARING', currencyCode: 'KES', currencyExponent: 2, dialCode: '+254',
    languages: ['en', 'sw'], disclaimer: catalogues.en['disclaimer.ke']! },
  { code: 'UG', slug: 'ug', name: 'Uganda', status: 'PLANNED', currencyCode: 'UGX', currencyExponent: 0, dialCode: '+256',
    languages: ['en'], disclaimer: catalogues.en['disclaimer.default']! },
  { code: 'TZ', slug: 'tz', name: 'Tanzania', status: 'PLANNED', currencyCode: 'TZS', currencyExponent: 0, dialCode: '+255',
    languages: ['sw', 'en'], disclaimer: catalogues.en['disclaimer.default']! },
] as const;

/** Rwanda's price is the only one set. Every other country stays null until an admin sets it. */
const PLAN_PRICE_MINOR: Record<string, number | null> = { RW: 2000, KE: null, UG: null, TZ: null };

const PAYMENT_METHODS = [
  { country: 'RW', provider: 'MTN_MOMO', label: 'MTN MoMo', mode: 'SANDBOX', hint: 'MTN numbers', sortOrder: 1 },
  { country: 'RW', provider: 'AIRTEL_MONEY', label: 'Airtel Money', mode: 'SANDBOX', hint: 'Airtel numbers', sortOrder: 2 },
  { country: 'KE', provider: 'MPESA', label: 'M-Pesa', mode: 'SANDBOX', hint: 'Safaricom numbers', sortOrder: 1 },
  { country: 'KE', provider: 'AIRTEL_MONEY', label: 'Airtel Money', mode: 'DISABLED', hint: 'Airtel Kenya numbers', sortOrder: 2 },
  { country: 'UG', provider: 'MTN_MOMO', label: 'MTN MoMo', mode: 'DISABLED', hint: 'MTN numbers', sortOrder: 1 },
  { country: 'UG', provider: 'AIRTEL_MONEY', label: 'Airtel Money', mode: 'DISABLED', hint: 'Airtel numbers', sortOrder: 2 },
  { country: 'TZ', provider: 'MPESA', label: 'M-Pesa', mode: 'DISABLED', hint: 'Vodacom numbers', sortOrder: 1 },
  { country: 'TZ', provider: 'AIRTEL_MONEY', label: 'Airtel Money', mode: 'DISABLED', hint: 'Airtel numbers', sortOrder: 2 },
] as const;

const AUTHORITIES = [
  { country: 'RW', shortName: 'MIFOTRA', name: 'Ministry of Public Service and Labour' },
  { country: 'RW', shortName: 'REB', name: 'Rwanda Basic Education Board' },
  { country: 'KE', shortName: 'TSC', name: 'Teachers Service Commission' },
  { country: 'KE', shortName: 'PSC', name: 'Public Service Commission' },
] as const;

interface CategoryDef { slug: string; name: string; description: string; icon: string; featured?: boolean }

const RW_CATEGORIES: CategoryDef[] = [
  { slug: 'teaching-positions', name: 'Teaching positions', featured: true, icon: 'monitor',
    description: 'Primary teachers, secondary teachers by subject, TVET and pre-primary' },
  { slug: 'school-leadership', name: 'School leadership', icon: 'graduation-cap',
    description: 'Headteachers, deputy headteachers (studies, discipline)' },
  { slug: 'government-administration', name: 'Government administration', icon: 'landmark',
    description: 'Executive Secretaries, administrative officers, HR officers' },
  { slug: 'accounting-finance', name: 'Accounting & finance', icon: 'calculator',
    description: 'Accountants, finance officers, internal auditors' },
  { slug: 'procurement', name: 'Procurement', icon: 'clipboard-list',
    description: 'Procurement officers and specialists' },
  { slug: 'other-professional', name: 'Other professional exams', icon: 'layout-grid',
    description: 'ICT, healthcare, engineering and more' },
];

const KE_CATEGORIES: CategoryDef[] = [
  { slug: 'teaching-positions', name: 'Teaching positions', featured: true, icon: 'monitor', description: 'TSC teacher recruitment by level and subject' },
  { slug: 'national-public-service', name: 'National public service', icon: 'landmark', description: 'National government job categories' },
  { slug: 'county-government', name: 'County government', icon: 'building', description: 'County public service board posts' },
  { slug: 'accounting-finance', name: 'Accounting & finance', icon: 'calculator', description: 'Accountants and finance officers' },
  { slug: 'procurement', name: 'Procurement', icon: 'clipboard-list', description: 'Procurement officers' },
  { slug: 'other-professional', name: 'Other professional exams', icon: 'layout-grid', description: 'ICT, health, engineering and more' },
];

const ALL_TESTS: TestDef[] = [
  secondaryMathsS1S3, secondaryMathsS4S6, primaryTeacherGeneral, teachingProfessionCbc,
  headteacherMock1, executiveSecretaryFree, executiveSecretaryMock2,
  accountantMock1, accountantFreeSample, procurementFree, procurementMock1, ictOfficerFree,
  keTeachingSample, keAccountantMock,
];

const slugify = (s: string) =>
  s.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function buildPayload(q: QDef) {
  const correctIdx = Array.isArray(q.correct) ? q.correct : [q.correct];
  const options = q.options.map((text, i) => ({ key: KEYS[i]!, text }));
  return {
    type: q.caseKey ? 'CASE_BASED' : Array.isArray(q.correct) ? 'MULTIPLE_SELECT' : 'SINGLE_CHOICE',
    payload: {
      options,
      correct: correctIdx.map((i) => KEYS[i]!),
      ...(Array.isArray(q.correct) ? { scoring: q.scoring ?? 'ALL_OR_NOTHING' } : {}),
    },
  } as const;
}

/** Truncate every table. Used by tests and `db:reset`-style flows; keeps the migrations table. */
export async function truncateAll(prisma: PrismaClient) {
  const rows = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (rows.length === 0) return;
  const list = rows.map((r) => `"public"."${r.tablename}"`).join(', ');
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
}

export async function seedDatabase(prisma: PrismaClient) {
  if ((await prisma.country.count()) > 0) {
    throw new Error('Database already seeded. Run `npm run db:reset` for a fresh start.');
  }

  // ── Roles & dev admins. An admin is a normal account (Rwanda) holding one or more role assignments; they sign in
  // with email + DEV_PASSWORD (verified and set up, so e2e tests go straight to the app). Production seeds no passwords.
  const devPasswordHash = process.env.NODE_ENV === 'production' ? null : await hashPassword(DEV_PASSWORD);
  const roleIds = {} as Record<AdminRoleCode, string>;
  for (const name of Object.keys(ROLE_PERMISSIONS) as AdminRoleCode[]) {
    const role = await prisma.role.create({
      data: { name, label: ROLE_LABELS[name], permissions: [...ROLE_PERMISSIONS[name]] },
    });
    roleIds[name] = role.id;
  }
  const devAdmins: { email: string; name: string; roles: { role: AdminRoleCode; countryScope: string[] }[] }[] = [
    { email: 'system.admin@jobprep.test', name: 'Jean Bosco N.', roles: [{ role: 'SYSTEM_ADMIN', countryScope: [] }] },
    { email: 'content.editor@jobprep.test', name: 'Marie C.', roles: [{ role: 'CONTENT_EDITOR', countryScope: ['RW'] }] },
    { email: 'support@jobprep.test', name: 'Support Agent', roles: [{ role: 'SUPPORT', countryScope: [] }] },
    // One account, two roles: edits Rwanda content AND does support everywhere (used by the multi-role tests).
    { email: 'multi.role@jobprep.test', name: 'Multi Role', roles: [{ role: 'CONTENT_EDITOR', countryScope: ['RW'] }, { role: 'SUPPORT', countryScope: [] }] },
  ];

  // ── Countries, plans, payment methods, authorities
  for (const c of COUNTRIES) {
    await prisma.country.create({ data: { ...c, languages: [...c.languages] } });
    await prisma.planConfig.create({
      data: {
        countryCode: c.code, code: 'FULL_ACCESS', name: 'Full Access',
        priceMinor: PLAN_PRICE_MINOR[c.code] ?? null, currencyCode: c.currencyCode,
        durationDays: 30, autoRenew: false, active: true,
      },
    });
  }
  for (const a of devAdmins) {
    await prisma.user.create({
      data: {
        email: a.email, name: a.name, countryCode: 'RW', language: 'en',
        passwordHash: devPasswordHash, emailVerifiedAt: new Date(), countryConfirmedAt: new Date(), onboardedAt: new Date(),
        roles: { create: a.roles.map((r) => ({ roleId: roleIds[r.role], countryScope: r.countryScope })) },
      },
    });
  }
  await prisma.paymentMethodConfig.createMany({
    data: PAYMENT_METHODS.map((m) => ({
      countryCode: m.country, provider: m.provider, label: m.label, mode: m.mode, hint: m.hint, sortOrder: m.sortOrder,
    })),
  });
  await prisma.authority.createMany({
    data: AUTHORITIES.map((a) => ({ countryCode: a.country, shortName: a.shortName, name: a.name })),
  });

  // ── Categories
  const categoryId = new Map<string, string>(); // `${country}:${slug}`
  for (const [country, defs] of [['RW', RW_CATEGORIES], ['KE', KE_CATEGORIES]] as const) {
    let order = 0;
    for (const d of defs) {
      const cat = await prisma.category.create({
        data: {
          countryCode: country, slug: d.slug, name: d.name, description: d.description,
          icon: d.icon, featured: d.featured ?? false, sortOrder: order++,
        },
      });
      categoryId.set(`${country}:${d.slug}`, cat.id);
    }
  }

  // ── Tests
  const professionId = new Map<string, string>();
  const examId = new Map<string, string>();
  const topicId = new Map<string, string>();

  for (const t of ALL_TESTS) {
    const catKey = `${t.country}:${t.category}`;
    const catId = categoryId.get(catKey);
    if (!catId) throw new Error(`Unknown category ${catKey} for ${t.slug}`);

    const profKey = `${catKey}:${t.profession.slug}`;
    if (!professionId.has(profKey)) {
      const p = await prisma.profession.create({
        data: { categoryId: catId, slug: t.profession.slug, name: t.profession.name },
      });
      professionId.set(profKey, p.id);
    }

    const examKey = `${t.country}:${t.profession.slug}`;
    if (!examId.has(examKey)) {
      const authority = t.authority
        ? await prisma.authority.findUnique({
            where: { countryCode_shortName: { countryCode: t.country, shortName: t.authority } },
          })
        : null;
      const e = await prisma.exam.create({
        data: {
          professionId: professionId.get(profKey)!, authorityId: authority?.id ?? null,
          slug: `${t.country.toLowerCase()}-${t.profession.slug}`, name: t.profession.name,
        },
      });
      examId.set(examKey, e.id);
    }

    const totalMarks = t.questions.reduce((sum, q) => sum + (q.marks ?? 1), 0);
    const mock = await prisma.mockTest.create({
      data: {
        examId: examId.get(examKey)!, countryCode: t.country, categoryId: catId, slug: t.slug, title: t.title,
        summary: t.summary, status: 'PUBLISHED', isFree: t.free, difficulty: t.difficulty,
        // Only languages we actually have text for. Translations are added by native-speaking editors.
        languages: ['en'],
        durationMinutes: t.minutes, totalMarks,
        // No pass mark is ever invented: passMarkPercent / passMarkSource stay null.
        negativeMarkPerWrong: 0,
        instructions: [
          'The timer starts when you press Start Mock Test and cannot be paused.',
          'There is no negative marking.',
          'Flag questions to come back to them. You can change any answer before you submit.',
          'Answers save automatically. If your connection drops, reopen the test and continue where you stopped.',
          'When time runs out, your answers are submitted automatically.',
        ],
        publishedAt: new Date(),
      },
    });

    const sectionId = new Map<string, string>();
    let sOrder = 0;
    for (const s of t.sections) {
      const sec = await prisma.section.create({
        data: { mockTestId: mock.id, name: s.name, questionTypeLabel: s.label ?? 'Multiple choice', sortOrder: sOrder++ },
      });
      sectionId.set(s.name, sec.id);
    }

    const caseId = new Map<string, string>();
    let cOrder = 0;
    for (const c of t.cases ?? []) {
      const created = await prisma.case.create({
        data: {
          mockTestId: mock.id, title: c.title, passage: c.passage, notes: c.notes, sortOrder: cOrder++,
          tables: c.tables as unknown as Prisma.InputJsonValue,
        },
      });
      caseId.set(c.key, created.id);
    }

    let qOrder = 0;
    for (const q of t.questions) {
      const tKey = `${catKey}:${q.topic}`;
      if (!topicId.has(tKey)) {
        const topic = await prisma.topic.create({
          data: { categoryId: catId, slug: slugify(q.topic), name: q.topic },
        });
        topicId.set(tKey, topic.id);
      }
      const { type, payload } = buildPayload(q);
      await prisma.question.create({
        data: {
          mockTestId: mock.id, sectionId: sectionId.get(q.section)!, topicId: topicId.get(tKey)!,
          caseId: q.caseKey ? caseId.get(q.caseKey)! : null,
          type, stem: q.stem, payload: payload as unknown as Prisma.InputJsonValue,
          explanation: q.explanation, marks: q.marks ?? 1, sortOrder: qOrder++, status: 'PUBLISHED',
        },
      });
    }
  }

  // ── Settings (admin → Settings screen)
  await prisma.setting.createMany({
    data: [
      { key: 'payments.stuckAfterMinutes', value: 10 },
      { key: 'payments.requestTtlMinutes', value: 3 },
      { key: 'free.showExplanationsOnResults', value: true },
      { key: 'results.showPassMarks', value: true }, // only ever renders where an official source is entered
      { key: 'landing.popularSearches:RW', value: ['Secondary Mathematics', 'Primary teacher', 'Headteacher', 'Accountant', 'Executive Secretary'] },
      // Dev placeholders for the Help page. Clearly flagged; a production seed never writes them (the owner enters real ones).
      ...(process.env.NODE_ENV === 'production' ? [] : [
        { key: 'support.contact:RW', value: { phone: '+250 700 000 000', whatsapp: '+250 700 000 000', email: 'support@example.invalid', hours: 'Mon to Fri, 08:00 to 17:00', placeholder: true } },
        { key: 'support.contact:KE', value: { phone: '+254 700 000 000', whatsapp: '+254 700 000 000', email: 'support@example.invalid', hours: 'Mon to Fri, 08:00 to 17:00', placeholder: true } },
      ]),
    ],
  });

  return {
    countries: await prisma.country.count(),
    mockTests: await prisma.mockTest.count(),
    questions: await prisma.question.count(),
  };
}
