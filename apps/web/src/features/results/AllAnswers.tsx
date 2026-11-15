import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { attemptKeys, getReview } from '../../api/attempts';
import { cx } from '../../lib/cx';
import { useLocale } from '../../lib/i18n';
import { QuestionCard } from '../review/ReviewPage';

type Show = 'all' | 'right' | 'wrong' | 'skipped';
const FIRST = 10;

/**
 * Every question of the attempt on the results page: the ones answered correctly and the ones missed, each with the
 * right answer marked and its explanation. Reads the same review data as the Answer review page; when that cannot be
 * loaded (offline, or a guest whose answers open after sign-up) the section simply stays out of the way.
 */
export function AllAnswers({ attemptId }: { attemptId: string }) {
  const locale = useLocale();
  const q = useQuery({ queryKey: attemptKeys.review(attemptId, 'all', locale), queryFn: () => getReview(attemptId, 'all', locale), retry: false, staleTime: 30_000 });
  const [show, setShow] = useState<Show>('all');
  const [limit, setLimit] = useState(FIRST);
  const items = q.data?.items;
  const cases = useMemo(() => new Map((q.data?.cases ?? []).map((c) => [c.id, c])), [q.data?.cases]);
  if (!items || items.length === 0) return null;

  const right = items.filter((i) => i.status === 'correct');
  const wrong = items.filter((i) => i.status === 'incorrect' || i.status === 'partial');
  const skipped = items.filter((i) => i.status === 'unanswered');
  const tabs: { id: Show; label: string; list: typeof items }[] = [
    { id: 'all', label: `All (${items.length})`, list: items },
    { id: 'right', label: `Right (${right.length})`, list: right },
    { id: 'wrong', label: `Wrong (${wrong.length})`, list: wrong },
    ...(skipped.length ? [{ id: 'skipped' as const, label: `Skipped (${skipped.length})`, list: skipped }] : []),
  ];
  const current = tabs.find((t) => t.id === show) ?? tabs[0]!;
  const shown = current.list.slice(0, limit);

  return (
    <section aria-labelledby="all-answers" className="order-7 flex min-w-0 flex-col gap-3.5 rounded-card border border-border bg-surface p-4 md:rounded-card-lg md:p-6">
      <h2 id="all-answers" className="m-0 text-[17px]">All your answers, with explanations</h2>
      <p className="m-0 text-sm text-ink-2">What you got right and what you missed, question by question.</p>
      <div role="group" aria-label="Show questions" className="flex flex-wrap gap-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            aria-pressed={show === t.id}
            onClick={() => { setShow(t.id); setLimit(FIRST); }}
            className={cx('min-h-[44px] cursor-pointer rounded-pill border px-4 text-sm font-semibold', show === t.id ? 'border-brand bg-brand-softer text-brand' : 'border-input-border bg-surface text-ink hover:bg-soft')}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="flex flex-col gap-4">
        {shown.map((item) => (
          <QuestionCard key={item.id} item={item} shownOnPhone caseData={item.caseId ? cases.get(item.caseId) : undefined} />
        ))}
      </div>
      {current.list.length > shown.length && (
        <button
          type="button"
          onClick={() => setLimit((n) => n + FIRST)}
          className="min-h-[44px] cursor-pointer self-start rounded-control border border-input-border bg-surface px-4 text-[15px] font-semibold text-link hover:bg-soft"
        >
          Show {Math.min(FIRST, current.list.length - shown.length)} more
        </button>
      )}
    </section>
  );
}
