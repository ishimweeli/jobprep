import { Router } from 'express';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { assertCountry, requirePermission } from '../../admin/auth';
import { writeAudit } from '../../admin/audit';
import type { Ctx } from '../../http/context';
import { badRequest, conflict, notFound } from '../../http/errors';
import { countryCodes, inCodes } from './util';

const slugify = (s: string) => s.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
const name = z.string().trim().min(2).max(120);

const tableSchema = z.object({
  caption: z.string().trim().max(200).default(''),
  rows: z.array(z.object({ label: z.string().trim().min(1).max(300), value: z.string().trim().max(100).optional(), heading: z.boolean().optional() })).min(1).max(60),
});
const caseFields = {
  title: z.string().trim().min(3).max(200),
  passage: z.array(z.string().trim().min(1).max(3000)).min(1).max(20),
  tables: z.array(tableSchema).max(6),
  notes: z.array(z.string().trim().min(1).max(1000)).max(20),
};

/** Categories, sections, topics and case studies: the building blocks the exam editor picks from. */
export function adminCatalogRouter(ctx: Ctx) {
  const router = Router();
  const { prisma } = ctx;
  const write = requirePermission('exams:write');
  const read = requirePermission('exams:read');

  // ───────────────────────── Categories

  router.get('/categories', read, async (req, res) => {
    const { country } = z.object({ country: z.string().length(2).optional() }).parse(req.query);
    const cats = await prisma.category.findMany({
      where: { countryCode: inCodes(countryCodes(req.admin!, country)) }, orderBy: [{ countryCode: 'asc' }, { sortOrder: 'asc' }],
      include: { _count: { select: { mockTests: true, topics: true, professions: true } } },
    });
    res.json({
      categories: cats.map((c) => ({
        id: c.id, countryCode: c.countryCode, slug: c.slug, name: c.name, description: c.description, icon: c.icon, sortOrder: c.sortOrder,
        featured: c.featured, mockTests: c._count.mockTests, topics: c._count.topics, professions: c._count.professions,
      })),
    });
  });

  router.post('/categories', write, async (req, res) => {
    const b = z.object({
      countryCode: z.string().length(2), name, description: z.string().trim().max(300).default(''), icon: z.string().max(40).default(''),
      sortOrder: z.number().int().min(0).max(999).optional(), featured: z.boolean().default(false),
    }).parse(req.body);
    const code = b.countryCode.toUpperCase();
    assertCountry(req.admin!, code, 'country_not_found');
    if (!(await prisma.country.findUnique({ where: { code } }))) throw notFound('country_not_found');
    let slug = slugify(b.name);
    for (let n = 2; await prisma.category.findUnique({ where: { countryCode_slug: { countryCode: code, slug } } }); n++) slug = `${slugify(b.name)}-${n}`;
    const last = await prisma.category.aggregate({ where: { countryCode: code }, _max: { sortOrder: true } });
    const c = await prisma.$transaction(async (tx) => {
      if (b.featured) await tx.category.updateMany({ where: { countryCode: code }, data: { featured: false } });
      const created = await tx.category.create({
        data: { countryCode: code, slug, name: b.name, description: b.description, icon: b.icon, featured: b.featured, sortOrder: b.sortOrder ?? (last._max.sortOrder ?? -1) + 1 },
      });
      await writeAudit(tx, req.admin!, { action: 'category.create', entityType: 'category', entityId: created.id, countryCode: code, metadata: { name: created.name } });
      return created;
    });
    res.status(201).json({ id: c.id, slug: c.slug });
  });

  router.patch('/categories/:id', write, async (req, res) => {
    const b = z.object({
      name, description: z.string().trim().max(300), icon: z.string().max(40), sortOrder: z.number().int().min(0).max(999), featured: z.boolean(),
    }).partial().parse(req.body);
    const c = await prisma.category.findUnique({ where: { id: String(req.params.id) } });
    if (!c) throw notFound('category_not_found');
    assertCountry(req.admin!, c.countryCode, 'category_not_found');
    await prisma.$transaction(async (tx) => {
      if (b.featured) await tx.category.updateMany({ where: { countryCode: c.countryCode, id: { not: c.id } }, data: { featured: false } }); // one featured category per country
      await tx.category.update({ where: { id: c.id }, data: b });
      await writeAudit(tx, req.admin!, { action: 'category.update', entityType: 'category', entityId: c.id, countryCode: c.countryCode, metadata: { name: b.name ?? c.name, fields: Object.keys(b) } });
    });
    res.json({ ok: true });
  });

  router.delete('/categories/:id', write, async (req, res) => {
    const c = await prisma.category.findUnique({ where: { id: String(req.params.id) }, include: { _count: { select: { mockTests: true, topics: true, professions: true, users: true } } } });
    if (!c) throw notFound('category_not_found');
    assertCountry(req.admin!, c.countryCode, 'category_not_found');
    if (c._count.mockTests + c._count.topics + c._count.professions + c._count.users > 0) throw conflict('category_in_use');
    await prisma.$transaction(async (tx) => {
      await tx.category.delete({ where: { id: c.id } });
      await writeAudit(tx, req.admin!, { action: 'category.delete', entityType: 'category', entityId: c.id, countryCode: c.countryCode, metadata: { name: c.name } });
    });
    res.json({ ok: true });
  });

  // ───────────────────────── Sections (inside a mock test)

  const loadTest = async (id: string, admin: NonNullable<import('express').Request['admin']>) => {
    const t = await prisma.mockTest.findUnique({ where: { id } });
    if (!t) throw notFound('mock_test_not_found');
    assertCountry(admin, t.countryCode, 'mock_test_not_found');
    return t;
  };

  router.post('/mock-tests/:id/sections', write, async (req, res) => {
    const b = z.object({ name, questionTypeLabel: z.string().trim().min(2).max(80).default('Multiple choice') }).parse(req.body);
    const t = await loadTest(String(req.params.id), req.admin!);
    if (await prisma.section.findUnique({ where: { mockTestId_name: { mockTestId: t.id, name: b.name } } })) throw conflict('section_exists');
    const last = await prisma.section.aggregate({ where: { mockTestId: t.id }, _max: { sortOrder: true } });
    const s = await prisma.$transaction(async (tx) => {
      const created = await tx.section.create({ data: { mockTestId: t.id, name: b.name, questionTypeLabel: b.questionTypeLabel, sortOrder: (last._max.sortOrder ?? -1) + 1 } });
      await writeAudit(tx, req.admin!, { action: 'section.create', entityType: 'section', entityId: created.id, countryCode: t.countryCode, metadata: { name: b.name, title: t.title } });
      return created;
    });
    res.status(201).json({ id: s.id });
  });

  const loadSection = async (id: string, admin: NonNullable<import('express').Request['admin']>) => {
    const s = await prisma.section.findUnique({ where: { id }, include: { mockTest: true } });
    if (!s) throw notFound('section_not_found');
    assertCountry(admin, s.mockTest.countryCode, 'section_not_found');
    return s;
  };
  router.patch('/sections/:id', write, async (req, res) => {
    const b = z.object({ name, questionTypeLabel: z.string().trim().min(2).max(80), sortOrder: z.number().int().min(0).max(99) }).partial().parse(req.body);
    const s = await loadSection(String(req.params.id), req.admin!);
    if (b.name && b.name !== s.name && (await prisma.section.findUnique({ where: { mockTestId_name: { mockTestId: s.mockTestId, name: b.name } } }))) throw conflict('section_exists');
    await prisma.$transaction(async (tx) => {
      await tx.section.update({ where: { id: s.id }, data: b });
      await writeAudit(tx, req.admin!, { action: 'section.update', entityType: 'section', entityId: s.id, countryCode: s.mockTest.countryCode, metadata: { name: b.name ?? s.name, title: s.mockTest.title } });
    });
    res.json({ ok: true });
  });
  router.delete('/sections/:id', write, async (req, res) => {
    const s = await loadSection(String(req.params.id), req.admin!);
    if (await prisma.question.count({ where: { sectionId: s.id } })) throw conflict('section_in_use');
    await prisma.$transaction(async (tx) => {
      await tx.section.delete({ where: { id: s.id } });
      await writeAudit(tx, req.admin!, { action: 'section.delete', entityType: 'section', entityId: s.id, countryCode: s.mockTest.countryCode, metadata: { name: s.name, title: s.mockTest.title } });
    });
    res.json({ ok: true });
  });

  // ───────────────────────── Topics (per category; the unit of weak-area analysis)

  router.get('/topics', read, async (req, res) => {
    const { categoryId } = z.object({ categoryId: z.string().min(1) }).parse(req.query);
    const cat = await prisma.category.findUnique({ where: { id: categoryId } });
    if (!cat) throw notFound('category_not_found');
    assertCountry(req.admin!, cat.countryCode, 'category_not_found');
    const topics = await prisma.topic.findMany({ where: { categoryId }, orderBy: { name: 'asc' }, include: { _count: { select: { questions: true } } } });
    res.json({ topics: topics.map((t) => ({ id: t.id, slug: t.slug, name: t.name, questions: t._count.questions })) });
  });

  router.post('/topics', write, async (req, res) => {
    const b = z.object({ categoryId: z.string().min(1), name }).parse(req.body);
    const cat = await prisma.category.findUnique({ where: { id: b.categoryId } });
    if (!cat) throw notFound('category_not_found');
    assertCountry(req.admin!, cat.countryCode, 'category_not_found');
    const slug = slugify(b.name);
    if (await prisma.topic.findUnique({ where: { categoryId_slug: { categoryId: cat.id, slug } } })) throw conflict('topic_exists');
    const t = await prisma.$transaction(async (tx) => {
      const created = await tx.topic.create({ data: { categoryId: cat.id, slug, name: b.name } });
      await writeAudit(tx, req.admin!, { action: 'topic.create', entityType: 'topic', entityId: created.id, countryCode: cat.countryCode, metadata: { name: b.name } });
      return created;
    });
    res.status(201).json({ id: t.id, slug: t.slug });
  });

  const loadTopic = async (id: string, admin: NonNullable<import('express').Request['admin']>) => {
    const t = await prisma.topic.findUnique({ where: { id }, include: { category: true } });
    if (!t) throw notFound('topic_not_found');
    assertCountry(admin, t.category.countryCode, 'topic_not_found');
    return t;
  };
  router.patch('/topics/:id', write, async (req, res) => {
    const b = z.object({ name }).parse(req.body);
    const t = await loadTopic(String(req.params.id), req.admin!);
    const slug = slugify(b.name);
    const clash = await prisma.topic.findUnique({ where: { categoryId_slug: { categoryId: t.categoryId, slug } } });
    if (clash && clash.id !== t.id) throw conflict('topic_exists');
    await prisma.$transaction(async (tx) => {
      await tx.topic.update({ where: { id: t.id }, data: { name: b.name, slug } });
      await writeAudit(tx, req.admin!, { action: 'topic.update', entityType: 'topic', entityId: t.id, countryCode: t.category.countryCode, metadata: { from: t.name, name: b.name } });
    });
    res.json({ ok: true });
  });
  router.delete('/topics/:id', write, async (req, res) => {
    const t = await loadTopic(String(req.params.id), req.admin!);
    if (await prisma.question.count({ where: { topicId: t.id } })) throw conflict('topic_in_use'); // topics drive weak-area results
    await prisma.$transaction(async (tx) => {
      await tx.topic.delete({ where: { id: t.id } });
      await writeAudit(tx, req.admin!, { action: 'topic.delete', entityType: 'topic', entityId: t.id, countryCode: t.category.countryCode, metadata: { name: t.name } });
    });
    res.json({ ok: true });
  });

  // ───────────────────────── Case studies (passage + tables + notes)

  router.get('/cases/:id', read, async (req, res) => {
    const c = await prisma.case.findUnique({ where: { id: String(req.params.id) }, include: { mockTest: true, _count: { select: { questions: true } } } });
    if (!c) throw notFound('case_not_found');
    assertCountry(req.admin!, c.mockTest.countryCode, 'case_not_found');
    res.json({ case: { id: c.id, mockTestId: c.mockTestId, title: c.title, passage: c.passage, tables: c.tables, notes: c.notes, questions: c._count.questions } });
  });

  router.post('/mock-tests/:id/cases', write, async (req, res) => {
    const b = z.object({ ...caseFields, tables: caseFields.tables.default([]), notes: caseFields.notes.default([]) }).parse(req.body);
    const t = await loadTest(String(req.params.id), req.admin!);
    const last = await prisma.case.aggregate({ where: { mockTestId: t.id }, _max: { sortOrder: true } });
    const c = await prisma.$transaction(async (tx) => {
      const created = await tx.case.create({
        data: { mockTestId: t.id, title: b.title, passage: b.passage, tables: b.tables as unknown as Prisma.InputJsonValue, notes: b.notes, sortOrder: (last._max.sortOrder ?? -1) + 1 },
      });
      await writeAudit(tx, req.admin!, { action: 'case.create', entityType: 'case', entityId: created.id, countryCode: t.countryCode, metadata: { name: b.title, title: t.title } });
      return created;
    });
    res.status(201).json({ id: c.id });
  });

  const loadCase = async (id: string, admin: NonNullable<import('express').Request['admin']>) => {
    const c = await prisma.case.findUnique({ where: { id }, include: { mockTest: true } });
    if (!c) throw notFound('case_not_found');
    assertCountry(admin, c.mockTest.countryCode, 'case_not_found');
    return c;
  };
  router.patch('/cases/:id', write, async (req, res) => {
    const b = z.object(caseFields).partial().parse(req.body);
    if (Object.keys(b).length === 0) throw badRequest('nothing_to_change');
    const c = await loadCase(String(req.params.id), req.admin!);
    await prisma.$transaction(async (tx) => {
      await tx.case.update({
        where: { id: c.id },
        data: { ...(b.title !== undefined && { title: b.title }), ...(b.passage !== undefined && { passage: b.passage }), ...(b.notes !== undefined && { notes: b.notes }), ...(b.tables !== undefined && { tables: b.tables as unknown as Prisma.InputJsonValue }) },
      });
      await writeAudit(tx, req.admin!, { action: 'case.update', entityType: 'case', entityId: c.id, countryCode: c.mockTest.countryCode, metadata: { name: b.title ?? c.title, title: c.mockTest.title } });
    });
    res.json({ ok: true });
  });
  router.delete('/cases/:id', write, async (req, res) => {
    const c = await loadCase(String(req.params.id), req.admin!);
    if (await prisma.question.count({ where: { caseId: c.id } })) throw conflict('case_in_use');
    await prisma.$transaction(async (tx) => {
      await tx.case.delete({ where: { id: c.id } });
      await writeAudit(tx, req.admin!, { action: 'case.delete', entityType: 'case', entityId: c.id, countryCode: c.mockTest.countryCode, metadata: { name: c.title, title: c.mockTest.title } });
    });
    res.json({ ok: true });
  });

  return router;
}
