import { useId } from 'react';
import type { ExamCase } from '../../api/types';
import { cx } from '../../lib/cx';
import { caseRange } from './examModel';

/**
 * The case study (CaseExam.dc desktop left panel, CaseExamPhone.dc "Case study" view): passage, tables, notes.
 * One markup for both sizes. On phones it is the whole screen; on desktop it sits beside the question.
 */
export function CasePanel({ c, className }: { c: ExamCase; className?: string }) {
  const titleId = useId();
  const range = caseRange(c);
  return (
    <section
      aria-labelledby={titleId}
      tabIndex={0}
      className={cx('min-h-0 min-w-0 flex-col overflow-y-auto md:max-h-[720px] md:flex-[1_1_520px] md:overflow-hidden md:rounded-[18px] md:border md:border-border md:bg-surface', className)}
    >
      <div className="flex flex-col gap-0.5 px-4 pb-0 pt-4 md:border-b md:border-border md:px-[22px] md:py-[18px]">
        <span className="text-xs font-bold text-brand-hover md:text-[13px]">
          <span className="uppercase md:hidden">Case study · questions {range}</span>
          <span className="hidden md:inline">Case study · applies to questions {range}</span>
        </span>
        <h2 id={titleId} className="m-0 text-lg leading-[1.35] md:text-[19px]">
          {c.title}
        </h2>
      </div>
      <div tabIndex={0} aria-label="Case study text" className="flex flex-col gap-3 [&>*]:shrink-0 px-4 pb-4 pt-3 text-[15px] leading-[1.6] text-[#27272A] md:gap-3.5 md:overflow-y-auto md:px-[22px] md:py-[18px] md:text-base md:leading-[1.65]">
        {c.passage.map((p, i) => (
          <p key={i} className="m-0">
            {p}
          </p>
        ))}
        {c.tables.map((t, i) => (
          <div key={i} tabIndex={0} role="group" aria-label={t.caption} className="overflow-x-auto rounded-[12px] border border-border md:rounded-none md:border-0">
            <table className="w-full border-collapse text-sm md:min-w-[380px] md:text-[15px]">
              <caption className="px-3 pb-2 pt-3 text-left font-bold md:px-0 md:pt-0">{t.caption}</caption>
              <tbody>
                {t.rows.map((r, j) => (
                  <tr key={j} className={cx('border-t border-border', r.heading ? 'bg-page font-bold' : 'bg-surface font-normal', )}>
                    <td className="px-3 py-2 md:px-2 md:py-[9px]">{r.label}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-right tabular md:px-2 md:py-[9px]">{r.value ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
        {c.notes.length > 0 && (
          <>
            <p className="m-0 font-bold text-ink md:text-inherit">Additional information</p>
            <ol className="m-0 flex list-decimal flex-col gap-1.5 pl-5 md:pl-[22px]">
              {c.notes.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ol>
          </>
        )}
      </div>
    </section>
  );
}
