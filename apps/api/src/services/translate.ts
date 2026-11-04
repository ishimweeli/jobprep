import type { PrismaClient } from '@prisma/client';
import { z } from 'zod';

export const LANGS = ['en', 'rw', 'sw'] as const;
export type Lang = (typeof LANGS)[number];
export const langQuery = z.enum(LANGS).optional();

interface QuestionPart { id: string; stem: string; options: { key: string; text: string }[]; explanation?: string | null }
interface CasePart { id: string; title: string; passage: string[]; tables: unknown; notes: string[] }

/** A translation counts as complete when the stem, the explanation and every option are filled in. */
export function translationState(
  t: { stem: string; explanation: string; optionTexts: unknown } | undefined,
  optionKeys: string[],
): 'complete' | 'partial' | 'missing' {
  if (!t) return 'missing';
  const texts = (t.optionTexts ?? {}) as Record<string, unknown>;
  const filled = optionKeys.filter((k) => typeof texts[k] === 'string' && (texts[k] as string).trim() !== '').length;
  const hasStem = t.stem.trim() !== '';
  const hasExplanation = t.explanation.trim() !== '';
  if (hasStem && hasExplanation && filled === optionKeys.length) return 'complete';
  return !hasStem && filled === 0 && !hasExplanation ? 'missing' : 'partial';
}

/**
 * Overlay the Kinyarwanda / Kiswahili text onto what an attempt screen is about to return (in place). Questions and
 * case studies without a translation stay in English. Returns what was served so the screen can say "available in
 * English only". Correctness never lives in a translation, so nothing here can leak an answer.
 */
export async function overlayLanguage(
  prisma: PrismaClient,
  lang: Lang | undefined,
  parts: { questions: QuestionPart[]; cases: CasePart[] },
) {
  if (!lang) return undefined;
  const total = parts.questions.length;
  if (lang === 'en') return { requested: lang, served: 'en' as Lang, translatedQuestions: total, totalQuestions: total };

  const [qRows, cRows] = await Promise.all([
    prisma.questionTranslation.findMany({ where: { language: lang, questionId: { in: parts.questions.map((q) => q.id) } } }),
    parts.cases.length ? prisma.caseTranslation.findMany({ where: { language: lang, caseId: { in: parts.cases.map((c) => c.id) } } }) : Promise.resolve([]),
  ]);
  const byQ = new Map(qRows.map((r) => [r.questionId, r]));
  let translated = 0;
  for (const q of parts.questions) {
    const t = byQ.get(q.id);
    if (!t) continue;
    const texts = t.optionTexts as Record<string, unknown>;
    if (translationState(t, q.options.map((o) => o.key)) === 'complete') translated++;
    if (t.stem.trim()) q.stem = t.stem;
    for (const o of q.options) if (typeof texts[o.key] === 'string' && (texts[o.key] as string).trim()) o.text = texts[o.key] as string;
    if (q.explanation !== undefined && q.explanation !== null && t.explanation.trim()) q.explanation = t.explanation;
  }
  const byC = new Map(cRows.map((r) => [r.caseId, r]));
  for (const c of parts.cases) {
    const t = byC.get(c.id);
    if (!t) continue;
    c.title = t.title || c.title;
    if (t.passage.length > 0) c.passage = t.passage;
    if (Array.isArray(t.tables) && t.tables.length > 0) c.tables = t.tables;
    if (t.notes.length > 0) c.notes = t.notes;
  }
  return { requested: lang, served: (translated > 0 ? lang : 'en') as Lang, translatedQuestions: translated, totalQuestions: total };
}
