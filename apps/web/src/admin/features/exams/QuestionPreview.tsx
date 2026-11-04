import { useState } from 'react';
import type { ExamCase } from '../../../api/types';
import { CasePanel } from '../../../features/exam/CasePanel';
import type { CaseStudy } from '../../api/types';
import { cx } from '../../lib/cx';
import type { PreviewContent } from './questionForm';

/**
 * "Preview as candidate": the question as the exam screen draws it (Exam.dc, MultiSelect.dc, CaseExam.dc), read only.
 * Single answer: round lettered buttons. Multiple-select: square checkboxes under the line "Select ALL that apply" (the
 * number of correct answers is never shown, only a "Choose N" the editor set). Case-based: the case study beside it.
 * Nothing here is saved or sent; the picks only show how it feels.
 */
export function QuestionPreview({ content, number, caseStudy }: { content: PreviewContent; number: number; caseStudy?: CaseStudy | null }) {
  const [picked, setPicked] = useState<string[]>([]);
  const pick = (key: string) => setPicked((p) => (content.multiple ? (p.includes(key) ? p.filter((k) => k !== key) : [...p, key]) : [key]));
  const asCase: ExamCase | null = caseStudy ? { id: caseStudy.id, title: caseStudy.title, passage: caseStudy.passage, tables: caseStudy.tables, notes: caseStudy.notes, questionNumbers: [number] } : null;

  return (
    <div className="flex flex-col gap-4">
      {asCase && <CasePanel c={asCase} className="flex max-h-[320px] overflow-y-auto rounded-card border border-border bg-surface" />}
      {content.caseId && !asCase && <p className="m-0 rounded-[10px] bg-flagged-bg px-3 py-2 text-sm text-flagged">The case study could not be loaded for the preview.</p>}
      <section aria-label="Question as a candidate sees it" className="flex flex-col gap-3 rounded-[14px] border border-border bg-white p-4">
        <span className="flex flex-wrap items-center gap-2 text-[13px] font-semibold text-muted">
          Question {number}
          {content.multiple && content.choose !== null && (
            <span className="inline-flex items-center rounded-full bg-brand-soft px-2.5 py-1 text-[13px] font-semibold text-brand">Choose {content.choose}</span>
          )}
        </span>
        <p className="m-0 text-[17px] leading-[1.45] text-ink">{content.stem || 'The question text appears here.'}</p>
        {content.multiple && <p className="m-0 text-sm font-semibold text-ink-2">Select ALL that apply.</p>}
        <div role="group" aria-label={content.multiple ? 'Answer options, select all that apply' : 'Answer options'} className="flex flex-col gap-2.5">
          {content.options.map((o) => {
            const on = picked.includes(o.key);
            return (
              <button
                key={o.key}
                type="button"
                role={content.multiple ? 'checkbox' : undefined}
                aria-checked={content.multiple ? on : undefined}
                aria-pressed={content.multiple ? undefined : on}
                onClick={() => pick(o.key)}
                className={cx('flex min-h-[56px] cursor-pointer items-center gap-3 rounded-[14px] px-3.5 py-2.5 text-left text-ink', on ? 'border-2 border-brand bg-brand-softer' : 'border border-border-strong bg-surface')}
              >
                {content.multiple ? (
                  <span aria-hidden="true" className={cx('inline-flex h-[26px] w-[26px] flex-none items-center justify-center rounded-[7px] border-2 text-white', on ? 'border-brand bg-brand' : 'border-muted bg-surface')}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: on ? 1 : 0 }}>
                      <path d="M5 12.5l4.5 4.5L19 7.5" />
                    </svg>
                  </span>
                ) : null}
                <span className={cx(content.multiple ? 'w-[18px] font-semibold text-ink-2' : cx('inline-flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full text-sm font-semibold', on ? 'bg-brand text-white' : 'bg-soft text-ink-2'))}>{o.key}</span>
                <span className="text-base leading-[1.4]">{o.text || <span className="text-muted">Empty option</span>}</span>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}
