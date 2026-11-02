import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { getCatalogOptions, getExams, getMockTest, keys } from '../../api/admin';
import type { ExamRow, MockTestDetail } from '../../api/types';
import { AdminShell } from '../../components/AdminShell';
import { EmptyLine, ErrorBox, Skeleton } from '../../components/states';
import { InertButton, Pill } from '../../components/ui';
import { TEST_TONE } from '../../lib/badges';
import { cx } from '../../lib/cx';
import { formatCount, plural } from '../../lib/format';
import { examsSearch, parseExamsQuery } from '../../lib/queryState';
import { useDebouncedSearch } from '../../lib/useDebouncedSearch';
import { useIsDesktop } from '../../lib/useMediaQuery';
import { QuestionEditor } from './QuestionEditor';

/** Which question opens first in a test: the first with an open report, else the first. */
export function firstQuestionId(t: Pick<MockTestDetail, 'questions'>): string | undefined {
  return (t.questions.find((q) => q.openReports > 0) ?? t.questions[0])?.id;
}

function ExamRows({ rows, selectedId }: { rows: ExamRow[]; selectedId?: string }) {
  return (
    <>
      {rows.map((e) => {
        const on = e.id === selectedId;
        const t = TEST_TONE[e.status];
        return (
          <Link
            key={e.id}
            to={`/exams/${e.id}`}
            aria-current={on ? 'true' : undefined}
            className={cx('flex items-center gap-2.5 border-l-[3px] border-t border-t-[#F4F4F5] px-4 py-3 text-ink no-underline hover:text-ink', on ? 'border-l-brand bg-brand-softer' : 'border-l-transparent bg-white')}
          >
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="text-sm font-semibold">{e.title}</span>
              <span className="text-xs text-muted">{e.category.name} · {plural(e.questionCount, 'question')} · {e.durationMinutes} min</span>
            </span>
            {e.openReports > 0 && (
              <Pill tone={{ bg: '#FEF3C7', ink: '#92400E' }} className="px-[7px] py-0.5 !text-[11px]">{e.openReports} reported</Pill>
            )}
            <Pill tone={t} className="px-[7px] py-0.5 !text-[11px]">{t.label}</Pill>
          </Link>
        );
      })}
    </>
  );
}

/**
 * Exams & questions (AdminExams.dc, AdminExamsPhone.dc). The list of mock tests, and for the chosen test one question
 * at a time in the editor (previous / next). Desktop shows both side by side; on a phone the list opens the editor
 * as its own page. Import (CSV) and + New mock test have no design yet (A6, A9) and do nothing.
 */
export function ExamsPage() {
  const isDesktop = useIsDesktop();
  const { testId, questionId } = useParams();
  const [sp, setSp] = useSearchParams();
  const query = parseExamsQuery(sp);

  const list = useQuery({
    queryKey: keys.exams({ ...query }),
    queryFn: () => getExams({ q: query.q || undefined, category: query.category || undefined, pageSize: 100 }),
    placeholderData: keepPreviousData,
  });
  const catalog = useQuery({ queryKey: keys.catalog, queryFn: getCatalogOptions, staleTime: 5 * 60_000 });

  const rows = list.data?.results ?? [];
  // Desktop always shows a test (the first one until another is picked); the phone shows the list until one is opened.
  const selectedTest = testId ?? (isDesktop ? rows[0]?.id : undefined);
  const test = useQuery({ queryKey: keys.mockTest(selectedTest ?? ''), queryFn: () => getMockTest(selectedTest!), enabled: !!selectedTest });
  const qid = questionId ?? (test.data ? firstQuestionId(test.data) : undefined);

  const [text, setText] = useDebouncedSearch(query.q, (q) => setSp(new URLSearchParams(examsSearch({ q }, query)), { replace: true }));
  const categories = [...new Map((catalog.data?.categories ?? []).map((c) => [c.slug, c.name])).entries()];

  const search = (
    <div className="flex flex-wrap gap-2 border-b border-border px-4 py-3.5">
      <label htmlFor="ae-q" className="sr-only">Search mock tests</label>
      <input
        id="ae-q"
        type="search"
        placeholder="Search mock tests"
        value={text}
        onChange={(e) => setText(e.target.value)}
        className="h-10 min-w-0 flex-[1_1_200px] rounded-[10px] border border-input-border px-3 text-sm text-ink"
      />
      <select
        aria-label="Category"
        value={query.category}
        onChange={(e) => setSp(new URLSearchParams(examsSearch({ category: e.target.value }, query)), { replace: true })}
        className="h-10 rounded-[10px] border border-input-border bg-white px-2.5 text-sm text-ink"
      >
        <option value="">All categories</option>
        {categories.map(([slug, name]) => <option key={slug} value={slug}>{name}</option>)}
      </select>
    </div>
  );

  const listCard = (
    <section aria-label="Mock tests" className="min-w-0 flex-[1_1_420px] overflow-hidden rounded-[16px] border border-border bg-white">
      {search}
      {list.isPending ? (
        <div className="p-4"><Skeleton label="Loading mock tests…" /></div>
      ) : list.isError ? (
        <div className="p-4"><ErrorBox error={list.error} onRetry={() => void list.refetch()} /></div>
      ) : (
        <>
          <ExamRows rows={rows} selectedId={selectedTest} />
          {rows.length === 0 && <EmptyLine>No mock tests match this search.</EmptyLine>}
        </>
      )}
    </section>
  );

  let editor = null;
  if (selectedTest) {
    if (test.isError) editor = <ErrorBox error={test.error} onRetry={() => void test.refetch()} className="min-w-0 flex-[999_1_560px]" />;
    else if (!qid) editor = test.data ? <EmptyLine className="min-w-0 flex-[999_1_560px] rounded-[16px] border border-border bg-white">This mock test has no questions yet.</EmptyLine> : <Skeleton label="Loading the mock test…" className="min-w-0 flex-[999_1_560px]" />;
    else editor = <QuestionEditor testId={selectedTest} questionId={qid} phone={!isDesktop} />;
  }

  if (!isDesktop) {
    if (selectedTest) {
      return (
        <AdminShell title={`Question ${test.data?.questions.find((q) => q.id === qid)?.number ?? ''}${test.data ? ` of ${test.data.questions.length}` : ''}`.trim()} back="/exams">
          {editor}
        </AdminShell>
      );
    }
    return (
      <AdminShell title="Exams">
        {listCard}
      </AdminShell>
    );
  }

  const t = list.data?.totals;
  return (
    <AdminShell title="Exams & questions">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <h1 className="m-0 text-[28px] tracking-[-0.02em]">Exams &amp; questions</h1>
          <span className="text-sm text-muted">{t ? `${formatCount(t.mockTests)} mock tests · ${formatCount(t.questions)} questions · ${plural(t.categories, 'category', 'categories')}` : ' '}</span>
        </div>
        <div className="flex flex-wrap gap-2">
          <InertButton kind="secondary" sizeClass="h-11 rounded-[10px] px-4 text-[15px] font-semibold">Import questions (CSV)</InertButton>
          <InertButton kind="primary" sizeClass="h-11 rounded-[10px] px-4 text-[15px] font-bold">+ New mock test</InertButton>
        </div>
      </div>
      <div className="flex flex-wrap items-start gap-[18px]">
        {listCard}
        {editor}
      </div>
    </AdminShell>
  );
}
