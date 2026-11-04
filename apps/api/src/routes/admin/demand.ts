import { Router } from 'express';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { assertCountry, requirePermission } from '../../admin/auth';
import { writeAudit } from '../../admin/audit';
import type { Ctx } from '../../http/context';
import { conflict, notFound } from '../../http/errors';
import { normalizeQuery } from '../../services/demand';
import { countryCodes, csvSafe, inCodes, pageSchema, sendCsv } from './util';

const reasonField = z.string().trim().min(5, 'reason_too_short').max(300);
/** At most this many emails go out in one admin action (the rest wait for the next click). */
const MAX_EMAILS_PER_ACTION = 500;

/**
 * Demand: what people asked for. "Request this exam" searches grouped by what was searched, and the "notify me when
 * {country} opens" waiting list per country. Exam requests follow the exams permissions, the waiting list the
 * countries permissions; a country-scoped admin only sees their own countries.
 */
export function adminDemandRouter(ctx: Ctx) {
  const router = Router();
  const { prisma, now } = ctx;
  const readRequests = requirePermission('exams:read');
  const writeRequests = requirePermission('exams:write');

  /** Send mail to many people without letting one bad address stop the rest. Returns the addresses that went out. */
  async function sendEach(to: string[], subject: string, text: string) {
    const sent: string[] = [];
    for (const address of to) {
      try { await ctx.email.send({ to: address, subject, text }); sent.push(address); } catch { /* counted as not sent */ }
    }
    return sent;
  }

  // ───────────────────────── Exam requests

  router.get('/demand/exam-requests', readRequests, async (req, res) => {
    const f = pageSchema.extend({
      status: z.enum(['open', 'done']).default('open'), country: z.string().length(2).optional(), q: z.string().trim().max(80).optional(),
    }).parse(req.query);
    const codes = countryCodes(req.admin!, f.country);
    const where: Prisma.ExamRequestWhereInput = {
      countryCode: inCodes(codes), status: f.status === 'open' ? 'OPEN' : 'DONE',
      ...(f.q && { normalizedQuery: { contains: normalizeQuery(f.q) } }),
    };
    const [all, page] = await Promise.all([
      prisma.examRequest.groupBy({ by: ['countryCode', 'normalizedQuery'], where }),
      prisma.examRequest.groupBy({
        by: ['countryCode', 'normalizedQuery'], where, _count: { _all: true }, _min: { createdAt: true }, _max: { createdAt: true, doneAt: true },
        orderBy: [{ _count: { normalizedQuery: 'desc' } }, { _max: { createdAt: 'desc' } }], skip: (f.page - 1) * f.pageSize, take: f.pageSize,
      }),
    ]);
    const rows = page.length === 0 ? [] : await prisma.examRequest.findMany({
      where: { ...where, OR: page.map((g) => ({ countryCode: g.countryCode, normalizedQuery: g.normalizedQuery })) },
      select: { countryCode: true, normalizedQuery: true, query: true, email: true, doneAt: true, doneNote: true, doneById: true },
    });
    const doers = await prisma.user.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.doneById).filter((x): x is string => !!x))] } }, select: { id: true, name: true } });
    res.json({
      total: all.length, page: f.page, pageSize: f.pageSize, status: f.status,
      results: page.map((g) => {
        const mine = rows.filter((r) => r.countryCode === g.countryCode && r.normalizedQuery === g.normalizedQuery);
        // The most common spelling of the search ("Veterinary officer", not "veterinary  officer").
        const spellings = new Map<string, number>();
        for (const r of mine) spellings.set(r.query.trim(), (spellings.get(r.query.trim()) ?? 0) + 1);
        const query = [...spellings.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? g.normalizedQuery;
        const done = mine.filter((r) => r.doneAt).sort((a, b) => b.doneAt!.getTime() - a.doneAt!.getTime())[0];
        return {
          key: `${g.countryCode}:${g.normalizedQuery}`, query, countryCode: g.countryCode, count: g._count._all, withEmail: mine.filter((r) => r.email).length,
          firstAt: g._min.createdAt, lastAt: g._max.createdAt, status: f.status === 'open' ? 'OPEN' : 'DONE',
          doneAt: done?.doneAt ?? null, doneNote: done?.doneNote ?? null, doneBy: doers.find((d) => d.id === done?.doneById)?.name ?? null,
        };
      }),
    });
  });

  /** "Mark done / notify": every open request for that search is closed; optionally the requesters are emailed. */
  router.post('/demand/exam-requests/done', writeRequests, async (req, res) => {
    const b = z.object({
      countryCode: z.string().length(2), query: z.string().trim().min(2).max(120), reason: reasonField.optional(), notify: z.boolean().default(false),
      mockTestId: z.string().min(1).optional(),
    }).parse(req.body);
    const code = b.countryCode.toUpperCase();
    assertCountry(req.admin!, code, 'country_not_found');
    const country = await prisma.country.findUnique({ where: { code } });
    if (!country) throw notFound('country_not_found');
    const normalizedQuery = normalizeQuery(b.query);
    const open = await prisma.examRequest.findMany({ where: { countryCode: code, normalizedQuery, status: 'OPEN' } });
    if (open.length === 0) throw notFound('request_not_found');
    // Say the search the way most people typed it, not the way the admin happened to type it.
    const spellings = new Map<string, number>();
    for (const r of open) spellings.set(r.query.trim(), (spellings.get(r.query.trim()) ?? 0) + 1);
    const label = [...spellings.entries()].sort((a, b) => b[1] - a[1])[0]![0];
    if (b.mockTestId && !(await prisma.mockTest.findFirst({ where: { id: b.mockTestId, countryCode: code }, select: { id: true } }))) throw notFound('mock_test_not_found');

    const recipients = b.notify ? [...new Set(open.map((r) => r.email).filter((e): e is string => !!e))].slice(0, MAX_EMAILS_PER_ACTION) : [];
    await prisma.$transaction(async (tx) => {
      await tx.examRequest.updateMany({
        where: { id: { in: open.map((r) => r.id) } },
        data: { status: 'DONE', doneAt: now(), doneNote: b.reason ?? null, doneById: req.admin!.id, mockTestId: b.mockTestId ?? null },
      });
      await writeAudit(tx, req.admin!, {
        action: 'demand.exam_request.done', entityType: 'exam_request', entityId: `${code}:${normalizedQuery}`, countryCode: code, reason: b.reason,
        metadata: { query: label, marked: open.length, notified: recipients.length, country: country.name },
      });
    });
    const sent = await sendEach(
      recipients,
      `JobPrep: a mock test for "${label}" is ready`,
      `You asked us for a mock test for "${label}". We have added practice material for it.\n\nOpen JobPrep to take a test: ${ctx.config.WEB_ORIGIN}/${country.slug}\n\nYou are getting this one email because you asked. We will not email you about anything else.`,
    );
    res.json({ ok: true, marked: open.length, notified: sent.length });
  });

  // ───────────────────────── Waiting list

  router.get('/demand/waiting-list', requirePermission('countries:read'), async (req, res) => {
    const f = pageSchema.extend({ country: z.string().length(2).optional() }).parse(req.query);
    const codes = countryCodes(req.admin!, f.country);
    const countries = await prisma.country.findMany({ where: { code: inCodes(codes) }, orderBy: { name: 'asc' } });
    const [counts, notified] = await Promise.all([
      prisma.waitingListEntry.groupBy({ by: ['countryCode'], where: { countryCode: inCodes(codes) }, _count: { _all: true } }),
      prisma.waitingListEntry.groupBy({ by: ['countryCode'], where: { countryCode: inCodes(codes), notifiedAt: { not: null } }, _count: { _all: true } }),
    ]);
    const body: Record<string, unknown> = {
      countries: countries.map((c) => ({
        code: c.code, name: c.name, status: c.status,
        count: counts.find((x) => x.countryCode === c.code)?._count._all ?? 0, notified: notified.find((x) => x.countryCode === c.code)?._count._all ?? 0,
      })),
    };
    if (f.country) {
      const code = f.country.toUpperCase();
      const [total, entries] = await Promise.all([
        prisma.waitingListEntry.count({ where: { countryCode: code } }),
        prisma.waitingListEntry.findMany({ where: { countryCode: code }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: (f.page - 1) * f.pageSize, take: f.pageSize }),
      ]);
      Object.assign(body, {
        total, page: f.page, pageSize: f.pageSize,
        entries: entries.map((e) => ({ id: e.id, email: e.email, interest: e.interest, createdAt: e.createdAt, notifiedAt: e.notifiedAt })),
      });
    }
    res.json(body);
  });

  router.get('/demand/waiting-list/export', requirePermission('countries:read'), async (req, res) => {
    const f = z.object({ country: z.string().length(2).optional() }).parse(req.query);
    const codes = countryCodes(req.admin!, f.country);
    const rows = await prisma.waitingListEntry.findMany({ where: { countryCode: inCodes(codes) }, orderBy: [{ countryCode: 'asc' }, { createdAt: 'asc' }], take: 50_000 });
    await writeAudit(prisma, req.admin!, {
      action: 'export.waiting_list', entityType: 'waiting_list', countryCode: f.country?.toUpperCase() ?? null, metadata: { rows: rows.length, country: f.country?.toUpperCase() ?? 'all' },
    });
    sendCsv(res, `waiting-list-${f.country?.toLowerCase() ?? 'all'}.csv`, [
      ['country', 'email', 'interest', 'joined', 'notified'],
      ...rows.map((r) => [r.countryCode, csvSafe(r.email), csvSafe(r.interest), r.createdAt.toISOString(), r.notifiedAt?.toISOString() ?? '']),
    ]);
  });

  /** "{Country} is open": one email to each person on the list who has not been told yet. */
  router.post('/demand/waiting-list/notify', requirePermission('countries:write'), async (req, res) => {
    const b = z.object({ countryCode: z.string().length(2), reason: reasonField }).parse(req.body);
    const code = b.countryCode.toUpperCase();
    assertCountry(req.admin!, code, 'country_not_found');
    const country = await prisma.country.findUnique({ where: { code } });
    if (!country) throw notFound('country_not_found');
    if (country.status !== 'LIVE') throw conflict('country_not_live');
    const pending = await prisma.waitingListEntry.findMany({ where: { countryCode: code, notifiedAt: null }, orderBy: { createdAt: 'asc' }, take: MAX_EMAILS_PER_ACTION });
    const sent = await sendEach(
      pending.map((e) => e.email),
      `JobPrep is open in ${country.name}`,
      `You asked us to tell you when JobPrep opens in ${country.name}. It is open now.\n\nStart here: ${ctx.config.WEB_ORIGIN}/${country.slug}\n\nThis is the one email you asked for. To be taken off our list, reply to this message.`,
    );
    await prisma.$transaction(async (tx) => {
      await tx.waitingListEntry.updateMany({ where: { id: { in: pending.filter((e) => sent.includes(e.email)).map((e) => e.id) } }, data: { notifiedAt: now() } });
      await writeAudit(tx, req.admin!, {
        action: 'demand.waiting_list.notify', entityType: 'waiting_list', entityId: code, countryCode: code, reason: b.reason,
        metadata: { country: country.name, notified: sent.length, failed: pending.length - sent.length },
      });
    });
    res.json({ ok: true, notified: sent.length, failed: pending.length - sent.length });
  });

  return router;
}
