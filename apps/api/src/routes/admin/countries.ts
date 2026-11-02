import { Router } from 'express';
import type { AdminRoleName, PaymentProviderCode, PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { assertCountry, requirePermission } from '../../admin/auth';
import { describeAudit, writeAudit } from '../../admin/audit';
import { ROLE_LABELS, type AdminRoleCode } from '../../domain/permissions';
import { formatMoney } from '../../domain/pricing';
import type { Ctx } from '../../http/context';
import { badRequest, conflict, HttpError, notFound } from '../../http/errors';
import { countryCodes, inCodes, normalizeAdminPhone, pageSchema, settingBool, settingNumber } from './util';

const reasonField = z.string().trim().min(5, 'reason_too_short').max(300);
const ROLES = ['SYSTEM_ADMIN', 'CONTENT_EDITOR', 'SUPPORT'] as const;

export interface ChecklistItem { key: 'price' | 'payment' | 'freeSamples' | 'legal'; label: string; ok: boolean; detail?: string }

/** What must be true before a country goes live (the design's "ready to launch?" list). */
export async function goLiveChecklist(prisma: PrismaClient, code: string): Promise<ChecklistItem[]> {
  const [plan, methods, categories, legal] = await Promise.all([
    prisma.planConfig.findFirst({ where: { countryCode: code, code: 'FULL_ACCESS', active: true } }),
    prisma.paymentMethodConfig.findMany({ where: { countryCode: code } }),
    prisma.category.findMany({ where: { countryCode: code }, include: { _count: { select: { mockTests: { where: { status: 'PUBLISHED', isFree: true } } } } } }),
    prisma.setting.findUnique({ where: { key: `country.legalReviewed:${code}` } }),
  ]);
  const missing = categories.filter((c) => c._count.mockTests === 0).map((c) => c.name);
  return [
    { key: 'price', label: 'Set the Full Access price', ok: !!plan?.priceMinor && plan.priceMinor > 0 },
    { key: 'payment', label: 'Move a payment method from sandbox to live', ok: methods.some((m) => m.mode === 'LIVE'), detail: methods.map((m) => `${m.label}: ${m.mode.toLowerCase()}`).join(', ') },
    { key: 'freeSamples', label: 'At least one free sample test in every category', ok: categories.length > 0 && missing.length === 0, detail: missing.length ? `Missing in: ${missing.join(', ')}` : undefined },
    { key: 'legal', label: 'Legal review of terms and refund policy', ok: legal?.value === true },
  ];
}

export function adminCountriesRouter(ctx: Ctx) {
  const router = Router();
  const { prisma, now } = ctx;
  const read = requirePermission('countries:read');
  const write = requirePermission('countries:write');

  const loadCountry = async (codeParam: string, admin: NonNullable<import('express').Request['admin']>) => {
    const code = codeParam.toUpperCase();
    const c = await prisma.country.findUnique({ where: { code } });
    if (!c) throw notFound('country_not_found');
    assertCountry(admin, code, 'country_not_found');
    return c;
  };

  // ───────────────────────── Countries

  router.get('/countries', read, async (req, res) => {
    const codes = countryCodes(req.admin!);
    const countries = await prisma.country.findMany({ where: { code: inCodes(codes) }, orderBy: { name: 'asc' } });
    const rows = await Promise.all(countries.map(async (c) => {
      const [plan, users, tests, draft, waiting] = await Promise.all([
        prisma.planConfig.findFirst({ where: { countryCode: c.code, code: 'FULL_ACCESS', active: true } }),
        prisma.user.count({ where: { countryCode: c.code } }),
        prisma.mockTest.count({ where: { countryCode: c.code, status: 'PUBLISHED' } }),
        prisma.mockTest.count({ where: { countryCode: c.code, status: 'DRAFT' } }),
        prisma.waitingListEntry.count({ where: { countryCode: c.code } }),
      ]);
      return {
        code: c.code, name: c.name, status: c.status, currencyCode: c.currencyCode, users, publishedTests: tests, draftTests: draft, waitingList: waiting,
        priceLabel: formatMoney(plan?.priceMinor ?? null, c.currencyCode, c.currencyExponent),
      };
    }));
    res.json({
      countries: rows,
      counts: { live: rows.filter((r) => r.status === 'LIVE').length, preparing: rows.filter((r) => r.status === 'PREPARING').length, planned: rows.filter((r) => r.status === 'PLANNED').length },
    });
  });

  router.get('/countries/:code', read, async (req, res) => {
    const c = await loadCountry(String(req.params.code), req.admin!);
    const [plan, methods, cats, checklist, publishedQuestions, users, tests, waiting] = await Promise.all([
      prisma.planConfig.findFirst({ where: { countryCode: c.code, code: 'FULL_ACCESS', active: true } }),
      prisma.paymentMethodConfig.findMany({ where: { countryCode: c.code }, orderBy: { sortOrder: 'asc' } }),
      prisma.category.findMany({ where: { countryCode: c.code }, orderBy: { sortOrder: 'asc' }, include: { _count: { select: { mockTests: true } } } }),
      goLiveChecklist(prisma, c.code),
      prisma.question.count({ where: { status: 'PUBLISHED', mockTest: { countryCode: c.code } } }),
      prisma.user.count({ where: { countryCode: c.code } }),
      prisma.mockTest.count({ where: { countryCode: c.code } }),
      prisma.waitingListEntry.count({ where: { countryCode: c.code } }),
    ]);
    // Translation progress per language (the first language is the source, so it is complete by definition)
    const languages = await Promise.all(c.languages.map(async (lang, i) => ({
      code: lang,
      completionPercent: i === 0 || publishedQuestions === 0 ? 100
        : Math.round(((await prisma.questionTranslation.count({ where: { language: lang, question: { status: 'PUBLISHED', mockTest: { countryCode: c.code } } } })) / publishedQuestions) * 100),
    })));
    res.json({
      country: {
        code: c.code, name: c.name, status: c.status, currencyCode: c.currencyCode, dialCode: c.dialCode, slug: c.slug,
        url: `jobprep.nexvecta.com/${c.slug}`, disclaimer: c.disclaimer, users, mockTests: tests, waitingList: waiting,
      },
      plan: plan && { priceMinor: plan.priceMinor, priceLabel: formatMoney(plan.priceMinor, plan.currencyCode, c.currencyExponent), durationDays: plan.durationDays, autoRenew: plan.autoRenew },
      paymentMethods: methods.map((m) => ({ provider: m.provider, label: m.label, mode: m.mode, hint: m.hint })),
      languages,
      categories: cats.map((x) => ({ id: x.id, name: x.name, mockTests: x._count.mockTests })),
      checklist,
      readyToLaunch: checklist.every((x) => x.ok),
    });
  });

  /** Disclaimer, legal-review flag, and status. A status change needs a reason, and going live needs the whole checklist. */
  router.patch('/countries/:code', write, async (req, res) => {
    const b = z.object({
      status: z.enum(['LIVE', 'PREPARING', 'PLANNED']).optional(), disclaimer: z.string().trim().min(10).max(300).optional(),
      legalReviewed: z.boolean().optional(), reason: z.string().trim().max(300).optional(), force: z.boolean().optional(),
    }).parse(req.body);
    const c = await loadCountry(String(req.params.code), req.admin!);

    await prisma.$transaction(async (tx) => {
      if (b.disclaimer !== undefined && b.disclaimer !== c.disclaimer) {
        await tx.country.update({ where: { code: c.code }, data: { disclaimer: b.disclaimer } });
        await writeAudit(tx, req.admin!, { action: 'country.disclaimer.set', entityType: 'country', entityId: c.code, countryCode: c.code, metadata: { country: c.name } });
      }
      if (b.legalReviewed !== undefined) {
        await tx.setting.upsert({ where: { key: `country.legalReviewed:${c.code}` }, update: { value: b.legalReviewed }, create: { key: `country.legalReviewed:${c.code}`, value: b.legalReviewed } });
        await writeAudit(tx, req.admin!, { action: 'country.legal_reviewed', entityType: 'country', entityId: c.code, countryCode: c.code, reason: b.reason, metadata: { country: c.name, to: b.legalReviewed } });
      }
      if (b.status && b.status !== c.status) {
        let action = 'country.status.set';
        if (b.status === 'LIVE') {
          const checklist = await goLiveChecklist(tx as unknown as PrismaClient, c.code);
          if (!checklist.every((x) => x.ok)) {
            // Only a deliberate, reasoned override may skip the list (e.g. testing a launch).
            if (!b.force) throw new HttpError(409, 'go_live_blocked', { checklist });
            action = 'country.status.force_live';
          }
        }
        await tx.country.update({ where: { code: c.code }, data: { status: b.status } });
        await writeAudit(tx, req.admin!, { action, entityType: 'country', entityId: c.code, countryCode: c.code, reason: b.reason, metadata: { country: c.name, from: c.status, to: b.status } });
      }
    });
    res.json({ ok: true });
  });

  /** Price and duration. Applies to NEW payments only; open payments keep their snapshot and active access is never shortened. */
  router.patch('/countries/:code/plan', write, async (req, res) => {
    const b = z.object({ priceMinor: z.number().int().min(1).max(100_000_000), durationDays: z.number().int().min(1).max(365).optional(), reason: reasonField }).parse(req.body);
    const c = await loadCountry(String(req.params.code), req.admin!);
    const plan = await prisma.planConfig.findFirst({ where: { countryCode: c.code, code: 'FULL_ACCESS', active: true } });
    if (!plan) throw notFound('plan_not_found');
    const from = formatMoney(plan.priceMinor, plan.currencyCode, c.currencyExponent) ?? 'not set';
    await prisma.$transaction(async (tx) => {
      await tx.planConfig.update({ where: { id: plan.id }, data: { priceMinor: b.priceMinor, ...(b.durationDays && { durationDays: b.durationDays }) } });
      await writeAudit(tx, req.admin!, {
        action: 'country.plan.set', entityType: 'country', entityId: c.code, countryCode: c.code, reason: b.reason,
        metadata: { country: c.name, from, to: formatMoney(b.priceMinor, plan.currencyCode, c.currencyExponent), durationDays: b.durationDays ?? plan.durationDays },
      });
    });
    res.json({ ok: true, priceLabel: formatMoney(b.priceMinor, plan.currencyCode, c.currencyExponent) });
  });

  /** Sandbox → live (or off). The operator's secrets are never shown or stored here. */
  router.patch('/countries/:code/payment-methods/:provider', write, async (req, res) => {
    const b = z.object({ mode: z.enum(['DISABLED', 'SANDBOX', 'LIVE']), reason: reasonField }).parse(req.body);
    const provider = z.enum(['MTN_MOMO', 'AIRTEL_MONEY', 'MPESA']).parse(String(req.params.provider)) as PaymentProviderCode;
    const c = await loadCountry(String(req.params.code), req.admin!);
    const m = await prisma.paymentMethodConfig.findUnique({ where: { countryCode_provider: { countryCode: c.code, provider } } });
    if (!m) throw notFound('payment_method_not_found');
    await prisma.$transaction(async (tx) => {
      await tx.paymentMethodConfig.update({ where: { id: m.id }, data: { mode: b.mode } });
      await writeAudit(tx, req.admin!, { action: 'country.payment_method.set', entityType: 'country', entityId: c.code, countryCode: c.code, reason: b.reason, metadata: { country: c.name, label: m.label, from: m.mode, to: b.mode } });
    });
    res.json({ ok: true, mode: b.mode });
  });

  // ───────────────────────── Settings

  const SETTING_KEYS = {
    stuckAfterMinutes: 'payments.stuckAfterMinutes',
    showExplanationsOnFreeResults: 'free.showExplanationsOnResults',
    showPassMarks: 'results.showPassMarks',
  } as const;

  router.get('/settings', requirePermission('settings:write'), async (_req, res) => {
    res.json({
      stuckAfterMinutes: await settingNumber(prisma, SETTING_KEYS.stuckAfterMinutes, 10),
      showExplanationsOnFreeResults: await settingBool(prisma, SETTING_KEYS.showExplanationsOnFreeResults, true),
      showPassMarks: await settingBool(prisma, SETTING_KEYS.showPassMarks, true),
      // Free samples are playable without an account in every country: a product rule, not a switch.
      freeSamplesOpenWithoutAccount: true,
    });
  });

  router.put('/settings', requirePermission('settings:write'), async (req, res) => {
    const b = z.object({
      stuckAfterMinutes: z.number().int().min(1).max(240), showExplanationsOnFreeResults: z.boolean(), showPassMarks: z.boolean(),
    }).partial().parse(req.body);
    await prisma.$transaction(async (tx) => {
      for (const [field, key] of Object.entries(SETTING_KEYS) as [keyof typeof SETTING_KEYS, string][]) {
        const next = b[field];
        if (next === undefined) continue;
        const before = (await tx.setting.findUnique({ where: { key } }))?.value ?? null;
        if (before === next) continue;
        await tx.setting.upsert({ where: { key }, update: { value: next }, create: { key, value: next } });
        await writeAudit(tx, req.admin!, { action: 'settings.update', entityType: 'setting', entityId: key, metadata: { key: field, from: before, to: next } });
      }
    });
    res.json({ ok: true });
  });

  // ───────────────────────── Admin team

  const roleRow = async (name: AdminRoleName) => prisma.role.findUniqueOrThrow({ where: { name } });
  const teamRow = (a: { id: string; name: string; phone: string; active: boolean; countryScope: string[]; createdAt: Date; role: { name: string } }) => ({
    id: a.id, name: a.name, phone: a.phone, active: a.active, countryScope: a.countryScope, role: a.role.name, roleLabel: ROLE_LABELS[a.role.name as AdminRoleCode], createdAt: a.createdAt,
  });
  const scopeSchema = z.array(z.string().length(2)).max(10).transform((l) => [...new Set(l.map((x) => x.toUpperCase()))]);

  router.get('/team', requirePermission('admins:manage'), async (_req, res) => {
    const admins = await prisma.adminUser.findMany({ include: { role: true }, orderBy: [{ active: 'desc' }, { createdAt: 'asc' }] });
    res.json({ team: admins.map(teamRow) });
  });

  router.post('/team', requirePermission('admins:manage'), async (req, res) => {
    const b = z.object({ phone: z.string().min(6).max(24), name: z.string().trim().min(2).max(80), role: z.enum(ROLES), countryScope: scopeSchema.default([]), reason: reasonField }).parse(req.body);
    const phone = await normalizeAdminPhone(prisma, b.phone);
    if (!phone) throw badRequest('invalid_phone');
    if (await prisma.adminUser.findUnique({ where: { phone } })) throw conflict('admin_exists');
    if (b.countryScope.length > 0 && b.role === 'SYSTEM_ADMIN') throw badRequest('system_admin_has_all_countries');
    const role = await roleRow(b.role);
    const a = await prisma.$transaction(async (tx) => {
      const created = await tx.adminUser.create({ data: { phone, name: b.name, roleId: role.id, countryScope: b.countryScope }, include: { role: true } });
      await writeAudit(tx, req.admin!, { action: 'admin.invite', entityType: 'admin', entityId: created.id, reason: b.reason, metadata: { name: b.name, role: ROLE_LABELS[b.role] } });
      return created;
    });
    res.status(201).json({ admin: teamRow(a) });
  });

  router.patch('/team/:id', requirePermission('admins:manage'), async (req, res) => {
    const b = z.object({
      name: z.string().trim().min(2).max(80).optional(), role: z.enum(ROLES).optional(), countryScope: scopeSchema.optional(), active: z.boolean().optional(), reason: reasonField,
    }).parse(req.body);
    const a = await prisma.adminUser.findUnique({ where: { id: String(req.params.id) }, include: { role: true } });
    if (!a) throw notFound('admin_not_found');
    const self = a.id === req.admin!.id;
    const nextRole = b.role ?? (a.role.name as AdminRoleCode);
    const nextActive = b.active ?? a.active;
    // Nobody locks themselves out, and the platform always keeps one active system admin.
    if (self && (b.role && b.role !== 'SYSTEM_ADMIN')) throw conflict('cannot_change_own_role');
    if (self && b.active === false) throw conflict('cannot_deactivate_self');
    if (a.role.name === 'SYSTEM_ADMIN' && a.active && (nextRole !== 'SYSTEM_ADMIN' || !nextActive)) {
      const others = await prisma.adminUser.count({ where: { id: { not: a.id }, active: true, role: { name: 'SYSTEM_ADMIN' } } });
      if (others === 0) throw conflict('last_system_admin');
    }
    if ((b.countryScope ?? a.countryScope).length > 0 && nextRole === 'SYSTEM_ADMIN') throw badRequest('system_admin_has_all_countries');

    const changes: string[] = [];
    if (b.role && b.role !== a.role.name) changes.push(`role ${ROLE_LABELS[a.role.name as AdminRoleCode]} → ${ROLE_LABELS[b.role]}`);
    if (b.countryScope) changes.push(`countries ${a.countryScope.join(',') || 'all'} → ${b.countryScope.join(',') || 'all'}`);
    if (b.active !== undefined && b.active !== a.active) changes.push(b.active ? 'reactivated' : 'deactivated');
    if (b.name && b.name !== a.name) changes.push('name');
    if (changes.length === 0) throw badRequest('nothing_to_change');

    const role = b.role ? await roleRow(b.role) : null;
    const updated = await prisma.$transaction(async (tx) => {
      const u = await tx.adminUser.update({
        where: { id: a.id },
        data: { ...(b.name && { name: b.name }), ...(role && { roleId: role.id }), ...(b.countryScope && { countryScope: b.countryScope }), ...(b.active !== undefined && { active: b.active }) },
        include: { role: true },
      });
      // A changed role or a deactivation takes effect now, not at the next sign-in.
      if (b.active === false || role) await tx.session.deleteMany({ where: { adminUserId: a.id } });
      await writeAudit(tx, req.admin!, {
        action: b.active === false ? 'admin.deactivate' : 'admin.update', entityType: 'admin', entityId: a.id, reason: b.reason,
        metadata: { name: u.name, change: changes.join('; ') },
      });
      return u;
    });
    res.json({ admin: teamRow(updated) });
  });

  // ───────────────────────── Audit log

  router.get('/audit', requirePermission('audit:read'), async (req, res) => {
    const f = pageSchema.extend({
      actorId: z.string().optional(), action: z.string().max(60).optional(), entityType: z.string().max(40).optional(),
      country: z.string().length(2).optional(), from: z.iso.datetime().optional(), to: z.iso.datetime().optional(),
    }).parse(req.query);
    const where = {
      ...(f.actorId && { actorId: f.actorId }),
      ...(f.action && { action: { startsWith: f.action } }),
      ...(f.entityType && { entityType: f.entityType }),
      ...(f.country && { countryCode: f.country.toUpperCase() }),
      ...((f.from || f.to) && { createdAt: { ...(f.from && { gte: new Date(f.from) }), ...(f.to && { lte: new Date(f.to) }) } }),
    };
    const [total, rows] = await Promise.all([
      prisma.auditLog.count({ where }),
      prisma.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (f.page - 1) * f.pageSize, take: f.pageSize, include: { actor: { select: { id: true, name: true } } } }),
    ]);
    res.json({
      total, page: f.page, pageSize: f.pageSize,
      results: rows.map((r) => ({
        id: r.id, at: r.createdAt, actor: r.actor, action: r.action, entityType: r.entityType, entityId: r.entityId, countryCode: r.countryCode, reason: r.reason,
        metadata: r.metadata, summary: describeAudit({ action: r.action, reason: r.reason, metadata: r.metadata, entityId: r.entityId }),
      })),
    });
  });

  void now;
  return router;
}
