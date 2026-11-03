import { Router } from 'express';
import type { AdminRoleName, PaymentProviderCode, PrismaClient, Role, User, UserRole } from '@prisma/client';
import { z } from 'zod';
import { assertCountry, requirePermission } from '../../admin/auth';
import { describeAudit, writeAudit } from '../../admin/audit';
import { emailInput } from '../../domain/email';
import { ROLE_LABELS, type AdminRoleCode } from '../../domain/permissions';
import { formatMoney } from '../../domain/pricing';
import type { Ctx } from '../../http/context';
import { badRequest, conflict, HttpError, notFound } from '../../http/errors';
import { countryCodes, inCodes, pageSchema, settingBool, settingNumber } from './util';

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
  // The team is the accounts that hold (or once held) a role. Roles are assignments on normal accounts: one person can
  // hold several, each with its own country scope. Nothing is emailed on invite: the person signs in with that address.

  const roleRow = async (name: AdminRoleName) => prisma.role.findUniqueOrThrow({ where: { name } });
  type TeamUser = User & { roles: (UserRole & { role: Role })[] };
  const roleView = (r: UserRole & { role: Role }) => ({ code: r.role.name, label: ROLE_LABELS[r.role.name as AdminRoleCode], countryScope: r.countryScope, active: r.active });
  const teamRow = (u: TeamUser) => {
    const roles = [...u.roles].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    // The legacy single-valued fields describe the first active role (else the first one held).
    const first = roles.find((r) => r.active) ?? roles[0]!;
    return {
      id: u.id, name: u.name, email: u.email, active: roles.some((r) => r.active), status: u.status,
      roles: roles.map(roleView),
      role: first.role.name, roleLabel: ROLE_LABELS[first.role.name as AdminRoleCode], countryScope: first.countryScope,
      createdAt: u.createdAt,
    };
  };
  const loadTeamUser = (id: string) => prisma.user.findUnique({ where: { id }, include: { roles: { include: { role: true } } } });
  const scopeSchema = z.array(z.string().length(2)).max(10).transform((l) => [...new Set(l.map((x) => x.toUpperCase()))]);

  router.get('/team', requirePermission('admins:manage'), async (_req, res) => {
    const people = await prisma.user.findMany({ where: { roles: { some: {} } }, include: { roles: { include: { role: true } } }, orderBy: { createdAt: 'asc' } });
    const rows = people.map(teamRow);
    res.json({ team: [...rows.filter((r) => r.active), ...rows.filter((r) => !r.active)] });
  });

  /** Give someone a role. An existing account gets the role added (or reactivated); a new address gets a new account. */
  router.post('/team', requirePermission('admins:manage'), async (req, res) => {
    const b = z.object({ email: emailInput, name: z.string().trim().min(2).max(80), role: z.enum(ROLES), countryScope: scopeSchema.default([]), reason: reasonField }).parse(req.body);
    if (b.countryScope.length > 0 && b.role === 'SYSTEM_ADMIN') throw badRequest('system_admin_has_all_countries');
    const role = await roleRow(b.role);
    const out = await prisma.$transaction(async (tx) => {
      let user = await tx.user.findUnique({ where: { email: b.email }, include: { roles: true } });
      const held = user?.roles.find((r) => r.roleId === role.id);
      if (held?.active) throw conflict('already_has_role');
      const addedToExisting = !!user;
      if (!user) user = { ...(await tx.user.create({ data: { email: b.email, name: b.name, countryCode: 'RW', language: 'en' } })), roles: [] };
      if (held) await tx.userRole.update({ where: { id: held.id }, data: { active: true, countryScope: b.countryScope } });
      else await tx.userRole.create({ data: { userId: user.id, roleId: role.id, countryScope: b.countryScope } });
      await writeAudit(tx, req.admin!, {
        action: 'admin.invite', entityType: 'admin', entityId: user.id, reason: b.reason,
        metadata: { name: user.name, role: ROLE_LABELS[b.role], addedToExistingAccount: addedToExisting, reactivated: !!held },
      });
      return { id: user.id, addedToExisting };
    });
    const created = await loadTeamUser(out.id);
    res.status(201).json({ admin: teamRow(created!), addedToExistingAccount: out.addedToExisting });
  });

  /**
   * Change one role assignment of a person. `role` says which assignment (default: their first active one);
   * `newRole` moves it to another role; `active:false` removes it (access stops on their next request, and
   * `active:true` brings it back). `name` renames the account.
   */
  router.patch('/team/:id', requirePermission('admins:manage'), async (req, res) => {
    const b = z.object({
      name: z.string().trim().min(2).max(80).optional(), role: z.enum(ROLES).optional(), newRole: z.enum(ROLES).optional(),
      countryScope: scopeSchema.optional(), active: z.boolean().optional(), reason: reasonField,
    }).parse(req.body);
    const u = await loadTeamUser(String(req.params.id));
    if (!u || u.roles.length === 0) throw notFound('admin_not_found');
    const roles = [...u.roles].sort((a, c) => a.createdAt.getTime() - c.createdAt.getTime());
    const a = b.role ? roles.find((r) => r.role.name === b.role) : (roles.find((r) => r.active) ?? roles[0]);
    if (!a) throw notFound('role_not_assigned');
    const code = a.role.name as AdminRoleCode;
    const self = u.id === req.admin!.id;
    const nextRole = b.newRole ?? code;
    const nextActive = b.active ?? a.active;
    // Nobody locks themselves out, and the platform always keeps one active system admin.
    if (self && code === 'SYSTEM_ADMIN' && b.newRole && b.newRole !== 'SYSTEM_ADMIN') throw conflict('cannot_change_own_role');
    if (self && code === 'SYSTEM_ADMIN' && b.active === false) throw conflict('cannot_deactivate_self');
    if (b.newRole && b.newRole !== code && roles.some((r) => r.role.name === b.newRole)) throw conflict('already_has_role');
    if (code === 'SYSTEM_ADMIN' && a.active && (nextRole !== 'SYSTEM_ADMIN' || !nextActive)) {
      const others = await prisma.userRole.count({ where: { id: { not: a.id }, active: true, role: { name: 'SYSTEM_ADMIN' }, user: { status: 'ACTIVE' } } });
      if (others === 0) throw conflict('last_system_admin');
    }
    if ((b.countryScope ?? a.countryScope).length > 0 && nextRole === 'SYSTEM_ADMIN') throw badRequest('system_admin_has_all_countries');

    const changes: string[] = [];
    if (b.newRole && b.newRole !== code) changes.push(`role ${ROLE_LABELS[code]} → ${ROLE_LABELS[b.newRole]}`);
    if (b.countryScope && b.countryScope.join(',') !== a.countryScope.join(',')) changes.push(`${ROLE_LABELS[code]} countries ${a.countryScope.join(',') || 'all'} → ${b.countryScope.join(',') || 'all'}`);
    if (b.active !== undefined && b.active !== a.active) changes.push(`${ROLE_LABELS[code]} ${b.active ? 'reactivated' : 'removed'}`);
    if (b.name && b.name !== u.name) changes.push('name');
    if (changes.length === 0) throw badRequest('nothing_to_change');

    const newRole = b.newRole && b.newRole !== code ? await roleRow(b.newRole) : null;
    await prisma.$transaction(async (tx) => {
      if (b.name && b.name !== u.name) await tx.user.update({ where: { id: u.id }, data: { name: b.name } });
      await tx.userRole.update({
        where: { id: a.id },
        data: { ...(newRole && { roleId: newRole.id }), ...(b.countryScope && { countryScope: b.countryScope }), ...(b.active !== undefined && { active: b.active }) },
      });
      // No session surgery needed: roles are read on every request, so the change applies at once.
      await writeAudit(tx, req.admin!, {
        action: b.active === false && a.active ? 'admin.deactivate' : 'admin.update', entityType: 'admin', entityId: u.id, reason: b.reason,
        metadata: { name: b.name ?? u.name, change: changes.join('; ') },
      });
    });
    res.json({ admin: teamRow((await loadTeamUser(u.id))!) });
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
