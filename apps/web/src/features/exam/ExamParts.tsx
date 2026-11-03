import type { ReactNode } from 'react';
import type { ExamQuestion } from '../../api/types';
import { Dialog } from '../../components/Dialog';
import { cx } from '../../lib/cx';
import { cellState, chooseCountLabel, type CellState, type ExamCounts } from './examModel';
import type { LocalAnswers } from './queue';

/* Shared building blocks of the exam screens (Exam.dc, ExamMobile.dc, CaseExam.dc, CaseExamPhone.dc, TimeUp.dc). */

export function CheckIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

export function ClockIcon({ size = 20, stroke = 2.2 }: { size?: number; stroke?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round">
      <circle cx="12" cy="13" r="8" />
      <path d="M12 9v4l2.5 2.5 M9 2h6" />
    </svg>
  );
}

export function FlagIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 21V4 M5 4h11l-2 4 2 4H5" />
    </svg>
  );
}

/**
 * Offline banner. Phone (TimeUp.dc, "Offline"): the answers are kept on this phone. Desktop (TimeUpDesktop.dc):
 * kept on this computer, and the timer sentence is part of the banner.
 */
export function OfflineBanner() {
  return (
    <div role="status" className="border-b border-flagged-line bg-flagged-bg">
      <div className="mx-auto flex max-w-[1320px] items-start gap-2.5 px-4 py-3 md:items-center md:gap-3 md:px-6">
        <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="#8A5300" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="mt-px shrink-0 md:mt-0">
          <path d="M2 8.8a15 15 0 0 1 4.2-2.7 M10.7 5.1A15 15 0 0 1 22 8.8 M5 12.5a10 10 0 0 1 5.2-2.7 M16.8 11.2a10 10 0 0 1 2.2 1.3 M8.5 16a5 5 0 0 1 7 0 M12 20h.01 M3 3l18 18" />
        </svg>
        <p className="m-0 text-sm leading-normal text-flagged md:text-[15px]">
          <strong>No connection.</strong>{' '}
          <span className="md:hidden">Keep answering — your answers are kept on this phone and will save when you are back online.</span>
          <span className="hidden md:inline">Keep answering — your answers are kept on this computer and will save when you reconnect. The timer keeps running.</span>
        </p>
      </div>
    </div>
  );
}

/** "Back online. Your 3 waiting answers are saved." (TimeUpDesktop.dc, "Back online"). */
export function OnlineBanner({ saved }: { saved: number }) {
  return (
    <div role="status" className="hidden border-b border-correct-line bg-correct-bg md:block">
      <div className="mx-auto flex max-w-[1320px] items-center gap-3 px-6 py-3 text-[15px] text-free">
        <CheckIcon size={20} />
        <span>
          <strong>Back online.</strong> Your {saved} waiting {saved === 1 ? 'answer is' : 'answers are'} saved.
        </span>
      </div>
    </div>
  );
}

// ───────────────────────── Answer options

/** "Choose 3" badge next to the question number (MultiSelect.dc). */
export function ChooseBadge({ choose }: { choose: number }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-pill bg-brand-soft px-2.5 py-1.5 text-[13px] font-semibold text-brand">
      <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 4h16v16H4z M8 12l3 3 5-6" />
      </svg>
      Choose {choose}
    </span>
  );
}

const COUNT_INK = { neutral: 'text-ink-2', done: 'text-free', warn: 'text-flagged-ink' } as const;

/**
 * Answer options. Single answer: the A-D buttons. Multiple-select (MultiSelect.dc): square checkboxes
 * (`role="checkbox"`), at most `choose` picks, a live count and, after a pick over the limit, "Unselect one to change".
 */
export function AnswerOptions({
  question,
  selected,
  onPick,
  numeric,
  blocked,
  disabled,
}: {
  question: ExamQuestion;
  selected: string[];
  onPick: (key: string) => void;
  /** Case exam options use tabular numerals (amounts). */
  numeric?: boolean;
  /** The last pick was refused because the limit was reached. */
  blocked?: boolean;
  /** Practice: after "Check answer" the options no longer change. */
  disabled?: boolean;
}) {
  if (question.multiple) {
    const choose = question.choose ?? selected.length;
    const count = chooseCountLabel(selected.length, choose, !!blocked);
    return (
      <>
        <div role="group" aria-label={`Answer options, choose ${choose}`} className="flex flex-col gap-2.5">
          {question.options.map((o) => {
            const on = selected.includes(o.key);
            return (
              <button
                key={o.key}
                type="button"
                role="checkbox"
                aria-checked={on}
                aria-disabled={disabled || undefined}
                onClick={() => !disabled && onPick(o.key)}
                className={cx(
                  'flex min-h-[58px] cursor-pointer items-center gap-3.5 rounded-[14px] px-3.5 py-2.5 text-left text-ink',
                  on ? 'border-2 border-brand bg-brand-softer' : 'border border-border-strong bg-surface',
                )}
              >
                <span
                  aria-hidden="true"
                  className={cx('inline-flex h-[26px] w-[26px] flex-none items-center justify-center rounded-[7px] border-2 text-white', on ? 'border-brand bg-brand' : 'border-muted bg-surface')}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: on ? 1 : 0 }}>
                    <path d="M5 12.5l4.5 4.5L19 7.5" />
                  </svg>
                </span>
                <span className="w-[18px] font-semibold text-ink-2">{o.key}</span>
                <span className={cx('text-base leading-[1.4] md:text-lg', numeric && 'tabular')}>{o.text}</span>
              </button>
            );
          })}
        </div>
        <p role="status" className={cx('m-0 text-sm font-semibold', COUNT_INK[count.tone])}>
          {count.text}
        </p>
      </>
    );
  }
  return (
    <div role="group" aria-label="Answer options" className="flex flex-col gap-2.5 md:gap-3">
      {question.options.map((o) => {
        const on = selected.includes(o.key);
        return (
          <button
            key={o.key}
            type="button"
            aria-pressed={on}
            aria-disabled={disabled || undefined}
            onClick={() => !disabled && onPick(o.key)}
            className={cx(
              'flex min-h-[56px] cursor-pointer items-center gap-3 rounded-[14px] px-3.5 py-2.5 text-left text-ink md:min-h-[60px] md:gap-3.5 md:px-4 md:py-3',
              on ? 'border-2 border-brand bg-brand-softer' : 'border border-border-strong bg-surface',
            )}
          >
            <span
              className={cx(
                'inline-flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full text-sm font-semibold md:h-[34px] md:w-[34px] md:text-[15px]',
                on ? 'bg-brand text-white' : 'bg-soft text-ink-2',
              )}
            >
              {o.key}
            </span>
            <span className={cx('text-[17px] leading-[1.4] md:text-[18px] md:leading-[1.45]', numeric && 'tabular')}>{o.text}</span>
          </button>
        );
      })}
    </div>
  );
}

export function FlagButton({ flagged, onToggle }: { flagged: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={flagged}
      aria-label="Flag for review"
      className={cx(
        'inline-flex min-h-[44px] cursor-pointer items-center gap-1.5 rounded-[10px] px-3 text-sm font-semibold md:gap-2 md:rounded-control md:px-4 md:text-[15px]',
        flagged ? 'border border-flagged bg-flagged-bg text-flagged-ink' : 'border border-input-border bg-surface text-ink',
      )}
    >
      <FlagIcon size={16} />
      <span className="md:hidden">{flagged ? 'Flagged' : 'Flag'}</span>
      <span className="hidden md:inline">{flagged ? 'Flagged for review' : 'Flag for review'}</span>
    </button>
  );
}

// ───────────────────────── Navigator cells

const toneClass: Record<CellState['tone'], string> = {
  flagged: 'border border-flagged bg-flagged-bg text-flagged-ink',
  answered: 'border border-brand bg-brand text-white',
  open: 'border border-input-border bg-surface text-ink',
};
/** Answered but not saved yet (TimeUpDesktop.dc, offline): dashed amber outline. */
const WAITING = 'border-2 border-dashed border-flagged bg-flagged-bg text-flagged-ink';
const RING = 'shadow-[0_0_0_2px_#FFFFFF,0_0_0_4px_#164A7A]';

export function NavCell({ cell, onGo, size, className }: { cell: CellState; onGo: () => void; size: 'sheet' | 'aside'; className?: string }) {
  return (
    <button
      type="button"
      onClick={onGo}
      aria-label={cell.aria}
      aria-current={cell.current ? 'true' : undefined}
      className={cx(
        'relative cursor-pointer p-0 font-semibold',
        size === 'sheet' ? 'h-[46px] rounded-[10px] text-[15px]' : 'h-[40px] rounded-[9px] text-sm',
        cell.waiting ? WAITING : toneClass[cell.tone],
        cell.current && RING,
        className,
      )}
    >
      {cell.number}
      {cell.flagged && (
        <span
          aria-hidden="true"
          className={cx('absolute h-0 w-0 border-l-transparent border-t-flagged', size === 'sheet' ? 'right-1 top-[3px] border-l-8 border-t-8' : 'right-[3px] top-0.5 border-l-[7px] border-t-[7px]')}
        />
      )}
    </button>
  );
}

/** Desktop navigator card ("Question navigator" aside). */
export function NavigatorAside({
  questions, answers, currentId, counts, onGo, waitingIds = [],
}: { questions: ExamQuestion[]; answers: LocalAnswers; currentId: string | undefined; counts: ExamCounts; onGo: (index: number) => void; waitingIds?: string[] }) {
  const legend: { label: ReactNode; box: string }[] = [
    { label: 'Answered', box: 'bg-brand' },
    { label: 'Not answered', box: 'border border-input-border bg-surface' },
    { label: `Flagged (${counts.flagged})`, box: 'border border-flagged bg-flagged-bg' },
    { label: 'Current', box: 'bg-surface shadow-[0_0_0_2px_#164A7A]' },
  ];
  return (
    <aside aria-label="Question navigator" className="flex min-w-0 flex-[1_1_300px] flex-col gap-4 rounded-card border border-border bg-surface p-5">
      <div className="flex items-baseline justify-between">
        <h2 className="m-0 text-[17px] font-bold">Questions</h2>
        <span className="text-sm text-ink-2">
          {counts.answered} of {counts.total} answered
        </span>
      </div>
      <div className="grid grid-cols-7 gap-1.5">
        {questions.map((q, i) => (
          <NavCell key={q.id} cell={cellState(q, answers, currentId, true, waitingIds)} onGo={() => onGo(i)} size="aside" />
        ))}
      </div>
      {waitingIds.length > 0 && (
        <p className="m-0 flex items-center gap-2 text-[13px] text-flagged-ink">
          <span aria-hidden="true" className="h-3.5 w-3.5 rounded border-2 border-dashed border-flagged" />
          Answered, waiting to save ({waitingIds.length})
        </p>
      )}
      <ul className="m-0 grid list-none grid-cols-2 gap-2 p-0 text-[13px] text-ink-2">
        {legend.map((l, i) => (
          <li key={i} className="flex items-center gap-2">
            <span aria-hidden="true" className={cx('h-4 w-4 rounded-[5px]', l.box)} />
            {l.label}
          </li>
        ))}
      </ul>
    </aside>
  );
}

// ───────────────────────── Dialogs

/** Phone "All questions" bottom sheet. A real dialog: focus trap, Esc, focus returns to the opener. */
export function NavSheet({
  open, onClose, questions, answers, currentId, counts, onGo,
}: {
  open: boolean; onClose: () => void; questions: ExamQuestion[]; answers: LocalAnswers; currentId: string | undefined; counts: ExamCounts; onGo: (index: number) => void;
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Questions"
      variant="sheet"
      titleClassName="m-0 text-[17px] font-bold"
      panelClassName="flex !max-h-[80dvh] flex-col gap-3.5 !pb-[22px]"
      headerAction={
        <button type="button" onClick={onClose} className="min-h-[44px] cursor-pointer border-0 bg-transparent px-3 text-[15px] font-semibold text-brand">
          Close
        </button>
      }
    >
      <div className="flex gap-3.5 text-[13px] text-ink-2">
        <span>{counts.answered} answered</span>
        <span>{counts.unanswered} left</span>
        <span>{counts.flagged} flagged</span>
      </div>
      <div className="grid grid-cols-6 gap-2 overflow-y-auto">
        {questions.map((q, i) => (
          <NavCell key={q.id} cell={cellState(q, answers, currentId, false)} onGo={() => onGo(i)} size="sheet" />
        ))}
      </div>
    </Dialog>
  );
}

export function SubmitDialog({
  open, onClose, counts, clock, onGoUnanswered, onSubmit, submitting, error,
}: {
  open: boolean; onClose: () => void; counts: ExamCounts; clock: string; onGoUnanswered: () => void; onSubmit: () => void; submitting: boolean; error: string | null;
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Submit your exam?"
      variant="responsive"
      titleClassName="m-0 text-[17px] font-bold md:text-[22px]"
      desktopPanelClassName="md:max-w-[480px] md:rounded-[20px] md:p-7"
      panelClassName="flex flex-col gap-3.5 !pt-[22px] !pb-6 md:gap-[18px] md:!pt-7"
    >
      <p className="m-0 hidden text-base text-ink-2 md:block">
        You still have <strong className="text-ink">{clock}</strong>. After submitting you cannot change your answers.
      </p>
      <p className="m-0 text-[15px] text-ink-2 md:hidden">
        <strong className="text-ink">{counts.unanswered} unanswered</strong> and <strong className="text-flagged-ink">{counts.flagged} flagged</strong>. You still have {clock}.
      </p>
      <dl className="m-0 hidden grid-cols-3 gap-2.5 text-center md:grid">
        <div className="flex flex-col-reverse rounded-control bg-brand-softer p-3">
          <dt className="text-[13px] text-ink-2">Answered</dt>
          <dd className="m-0 text-2xl font-bold text-brand">{counts.answered}</dd>
        </div>
        <div className="flex flex-col-reverse rounded-control bg-soft p-3">
          <dt className="text-[13px] text-ink-2">Unanswered</dt>
          <dd className="m-0 text-2xl font-bold">{counts.unanswered}</dd>
        </div>
        <div className="flex flex-col-reverse rounded-control bg-flagged-bg p-3">
          <dt className="text-[13px] text-flagged-ink">Flagged</dt>
          <dd className="m-0 text-2xl font-bold text-flagged-ink">{counts.flagged}</dd>
        </div>
      </dl>
      {error && (
        <p role="alert" className="m-0 rounded-control border border-incorrect-line bg-incorrect-bg p-3 text-sm font-semibold text-incorrect">
          {error}
        </p>
      )}
      <div className="flex flex-col gap-2.5">
        {counts.unanswered > 0 && (
          <button
            type="button"
            onClick={onGoUnanswered}
            className="min-h-[48px] cursor-pointer rounded-control border border-brand bg-surface text-base font-semibold text-brand md:min-h-[44px]"
          >
            <span className="md:hidden">Go to unanswered</span>
            <span className="hidden md:inline">Go to first unanswered question</span>
          </button>
        )}
        <button
          type="button"
          onClick={onSubmit}
          disabled={submitting}
          aria-busy={submitting || undefined}
          className="min-h-[48px] cursor-pointer rounded-control border-0 bg-brand p-3 text-center text-base font-semibold text-white disabled:opacity-60 md:min-h-[44px] md:p-[11px]"
        >
          Submit now
        </button>
        <button
          type="button"
          onClick={onClose}
          className="min-h-[44px] cursor-pointer border-0 bg-transparent text-[15px] font-semibold text-ink-2"
        >
          Keep working
        </button>
      </div>
    </Dialog>
  );
}
