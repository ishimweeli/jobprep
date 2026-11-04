import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getExams } from '../../api/admin';
import { contentKeys, getImportTemplate, runImport, type ColumnMap, type ImportOutcome, type ImportReportBody } from '../../api/content';
import { AdminShell } from '../../components/AdminShell';
import { Field, CONTROL, edge } from '../../components/forms';
import { ErrorBox, SaveStatus, Skeleton } from '../../components/states';
import { Btn, LinkButton } from '../../components/ui';
import { useAdminCountry } from '../../lib/adminCountry';
import { cx } from '../../lib/cx';
import { plural } from '../../lib/format';
import { denyHint } from '../../lib/permissions';
import { useIsDesktop } from '../../lib/useMediaQuery';
import { useAdmin } from '../auth/session';
import {
  buildColumnMap, checkFile, columnName, countRows, downloadText, FORMAT_HELP, formatBytes, groupByRow, mappingComplete, MAX_ROWS, problemWords, readImportFailure,
  stepLabel, STEPS,
} from './importModel';

const card = 'flex flex-col gap-4 rounded-[16px] border border-border bg-white p-[22px] max-[899px]:gap-3.5 max-[899px]:rounded-[14px] max-[899px]:p-4';
const FALLBACK_TEMPLATE = 'section,topic,stem,option_a,option_b,option_c,option_d,correct,explanation,marks,difficulty\nGeneral,Pedagogy,"Which approach puts the learner at the centre?",Lecture only,Learner-centred teaching,Rote learning,Dictation,B,"Learner-centred teaching builds on what each learner already knows.",1,standard\n';

function Stepper({ current, skippedColumns }: { current: number; skippedColumns: boolean }) {
  return (
    <nav aria-label="Import steps" className="flex flex-col gap-1.5">
      <p className="m-0 text-sm font-semibold text-muted" aria-live="polite">{stepLabel(current)}: {STEPS[current - 1]}</p>
      <ol className="m-0 flex list-none gap-1.5 p-0">
        {STEPS.map((s, i) => {
          const n = i + 1;
          const done = n < current;
          return (
            <li key={s} aria-current={n === current ? 'step' : undefined} className="flex-1">
              <span className={cx('block h-1.5 rounded-full', n === current ? 'bg-brand' : done ? 'bg-brand-light' : 'bg-border')} />
              <span className={cx('mt-1 block text-xs', n === current ? 'font-semibold text-brand' : 'text-muted')}>
                {s}
                {n === 2 && skippedColumns && done ? ' (matched)' : ''}
              </span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export function FormatHelp() {
  return (
    <details className="rounded-[10px] border border-border bg-page px-3.5 py-3">
      <summary className="cursor-pointer text-sm font-semibold text-ink">CSV format help</summary>
      <div className="mt-2.5 flex flex-col gap-2 text-sm text-ink-2">
        <p className="m-0">One row per question, with a header row. Columns can be in any order and their names are not case sensitive. Questions arrive as <strong>drafts</strong>: nothing is shown to candidates until you publish it.</p>
        <dl className="m-0 flex flex-col gap-1.5">
          {FORMAT_HELP.map((c) => (
            <div key={c.name} className="flex flex-col">
              <dt className="font-semibold text-ink">{c.name} <span className="font-normal text-muted">{c.required ? '(required)' : '(optional)'}</span></dt>
              <dd className="m-0">{c.help}</dd>
            </div>
          ))}
        </dl>
        <p className="m-0">Up to 1 MB and {MAX_ROWS.toLocaleString('en-US')} rows per file. Save from Excel or Sheets as CSV (UTF-8).</p>
      </div>
    </details>
  );
}

function ProblemsView({ report, phone }: { report: ImportReportBody; phone: boolean }) {
  if (report.problems.length === 0) return null;
  if (phone) {
    return (
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {groupByRow(report.problems).map((g) => (
          <li key={g.row} className="flex flex-col gap-1 rounded-[12px] border border-incorrect-line bg-incorrect-bg p-3 text-sm">
            <span className="font-semibold text-incorrect">Row {g.row}</span>
            {g.items.map((p, i) => (
              <span key={i} className="text-ink">{p.column ? <strong>{columnName(p.column)}: </strong> : null}{problemWords(p)}</span>
            ))}
          </li>
        ))}
      </ul>
    );
  }
  return (
    <div className="max-h-[360px] overflow-auto rounded-[12px] border border-border">
      <table className="w-full border-collapse text-sm">
        <caption className="sr-only">Problems found in the file</caption>
        <thead>
          <tr className="sticky top-0 bg-page text-left text-xs text-muted">
            <th scope="col" className="px-3 py-2.5 font-semibold">Row</th>
            <th scope="col" className="px-3 py-2.5 font-semibold">Column</th>
            <th scope="col" className="px-3 py-2.5 font-semibold">Problem</th>
          </tr>
        </thead>
        <tbody>
          {report.problems.map((p, i) => (
            <tr key={i} className="border-t border-soft align-top">
              <td className="whitespace-nowrap px-3 py-2 tabular">{p.row}</td>
              <td className="whitespace-nowrap px-3 py-2">{columnName(p.column)}</td>
              <td className="px-3 py-2">{problemWords(p)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PreviewView({ report, phone }: { report: ImportReportBody; phone: boolean }) {
  const rows = report.preview ?? [];
  if (rows.length === 0) return null;
  const optionLine = (o: { key: string; text: string }[]) => o.map((x) => `${x.key}. ${x.text}`).join('  ·  ');
  return (
    <section aria-labelledby="imp-prev" className="flex flex-col gap-2">
      <h3 id="imp-prev" className="m-0 text-[15px]">Preview of the first {plural(rows.length, 'valid question')}</h3>
      {phone ? (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {rows.map((r) => (
            <li key={r.row} className="flex flex-col gap-1 rounded-[12px] border border-border bg-white p-3 text-sm">
              <span className="text-xs text-muted">Row {r.row} · {r.section} · {r.topic}</span>
              <span className="font-semibold">{r.stem}</span>
              <span className="text-ink-2">{optionLine(r.options)}</span>
              <span className="text-correct">Correct: {r.correct.join(', ')}</span>
            </li>
          ))}
        </ul>
      ) : (
        <div className="overflow-x-auto rounded-[12px] border border-border">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <caption className="sr-only">Preview of valid questions</caption>
            <thead>
              <tr className="bg-page text-left text-xs text-muted">
                <th scope="col" className="px-3 py-2.5 font-semibold">Row</th>
                <th scope="col" className="px-3 py-2.5 font-semibold">Section · topic</th>
                <th scope="col" className="px-3 py-2.5 font-semibold">Question and options</th>
                <th scope="col" className="px-3 py-2.5 font-semibold">Correct</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.row} className="border-t border-soft align-top">
                  <td className="px-3 py-2 tabular">{r.row}</td>
                  <td className="px-3 py-2">{r.section} · {r.topic}</td>
                  <td className="px-3 py-2"><span className="block font-semibold">{r.stem}</span><span className="text-xs text-ink-2">{optionLine(r.options)}</span></td>
                  <td className="px-3 py-2 font-semibold text-correct">{r.correct.join(', ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/**
 * CSV import of questions (A6): choose the test and the file, match columns when the headers differ, read the validation
 * report (a dry run: nothing is saved), then import. `/admin/exams/import` and `/admin/exams/:testId/import`.
 */
export function ImportPage() {
  const params = useParams();
  const isDesktop = useIsDesktop();
  const admin = useAdmin();
  const qc = useQueryClient();
  const { country } = useAdminCountry();
  const hint = denyHint(admin.permissions, 'exams:write', 'import questions');
  const fileInput = useRef<HTMLInputElement>(null);

  const tests = useQuery({ queryKey: ['admin', 'exams', 'import-choices', country], queryFn: () => getExams({ country, pageSize: 100 }) });
  const template = useQuery({ queryKey: contentKeys.importTemplate, queryFn: getImportTemplate, staleTime: 10 * 60_000, retry: false });

  const [step, setStep] = useState(1);
  const [testId, setTestId] = useState(params.testId ?? '');
  const [file, setFile] = useState<{ name: string; size: number } | null>(null);
  const [text, setText] = useState('');
  const [fileError, setFileError] = useState<string | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [missing, setMissing] = useState<string[]>([]);
  const [selection, setSelection] = useState<Partial<Record<string, string>>>({});
  const [report, setReport] = useState<ImportReportBody | null>(null);
  const [skippedColumns, setSkippedColumns] = useState(true);
  const [result, setResult] = useState<(ImportOutcome & { dryRun: false }) | null>(null);
  const [tried, setTried] = useState(false);

  const testTitle = tests.data?.results.find((t) => t.id === testId)?.title ?? 'the mock test';
  const columnMap: ColumnMap | undefined = Object.keys(selection).length ? buildColumnMap(selection) : undefined;

  const check = useMutation({
    mutationFn: (map?: ColumnMap) => runImport(testId, { csv: text, dryRun: true, ...(map && Object.keys(map).length ? { columnMap: map } : {}) }),
    onSuccess: (r, map) => {
      setReport(r);
      setSkippedColumns(!map || Object.keys(map).length === 0);
      setFileError(null);
      setStep(3);
    },
    onError: (e) => {
      const f = readImportFailure(e);
      if (f.kind === 'mapping') {
        setHeaders(f.headers);
        setMissing(f.missing);
        setSelection({});
        setSkippedColumns(false);
        setStep(2);
      } else {
        setFileError(f.message);
        setStep(1);
      }
    },
  });

  const doImport = useMutation({
    mutationFn: () => runImport(testId, { csv: text, importValidRows: (report?.problems.length ?? 0) > 0, ...(columnMap ? { columnMap } : {}) }),
    onSuccess: async (r) => {
      setResult(r as ImportOutcome & { dryRun: false });
      void qc.invalidateQueries({ queryKey: ['admin', 'exams'] });
      void qc.invalidateQueries({ queryKey: ['admin', 'mock-test'] });
    },
    onError: (e) => {
      const f = readImportFailure(e);
      setFileError(f.kind === 'file' ? f.message : 'The columns no longer match. Start again.');
    },
  });

  const pickFile = async (f: File | undefined) => {
    setFileError(null);
    if (!f) return;
    const c = checkFile(f);
    if (!c.ok) {
      setFile(null);
      setText('');
      setFileError(c.message ?? 'This file cannot be used.');
      return;
    }
    const content = await f.text();
    if (countRows(content) > MAX_ROWS) {
      setFile(null);
      setText('');
      setFileError(`The file has more than ${MAX_ROWS.toLocaleString('en-US')} rows. Split it into smaller files.`);
      return;
    }
    setFile({ name: f.name, size: f.size });
    setText(content);
  };

  const begin = () => {
    setTried(true);
    if (!testId || !text) return;
    check.mutate(undefined);
  };
  const restart = () => {
    setStep(1);
    setFile(null);
    setText('');
    setReport(null);
    setResult(null);
    setSelection({});
    setFileError(null);
    setTried(false);
    if (fileInput.current) fileInput.current.value = '';
  };

  const downloadTemplate = () => downloadText('jobprep-questions-template.csv', template.data?.csv ?? FALLBACK_TEMPLATE);
  const phone = !isDesktop;
  const valid = report?.validRows ?? 0;
  const bad = report?.invalidRows ?? 0;
  const busy = check.isPending || doImport.isPending;

  let body: ReactNode;
  if (step === 1) {
    body = (
      <section aria-labelledby="imp-1" className={card}>
        <h2 id="imp-1" className="m-0 text-[17px]">Choose the mock test and the file</h2>
        {hint && <p role="note" className="m-0 rounded-[10px] bg-soft px-3.5 py-2.5 text-sm text-ink-2">{hint}</p>}
        {tests.isError ? <ErrorBox error={tests.error} onRetry={() => void tests.refetch()} /> : (
          <Field label="Mock test" error={tried && !testId ? 'Choose the mock test the questions go into.' : null} hint="Sections and topics in the file must already exist in this test.">
            {(aria) => (
              <select {...aria} value={testId} disabled={tests.isPending || !!hint} onChange={(e) => setTestId(e.target.value)} className={cx(CONTROL, edge(tried && !testId))}>
                <option value="">{tests.isPending ? 'Loading…' : 'Choose a mock test'}</option>
                {(tests.data?.results ?? []).map((t) => <option key={t.id} value={t.id}>{t.title} ({t.countryCode})</option>)}
              </select>
            )}
          </Field>
        )}
        <Field label="CSV file" error={fileError ?? (tried && !text ? 'Choose a .csv file.' : null)} hint={file ? undefined : 'A .csv file of up to 1 MB.'}>
          {(aria) => (
            <input {...aria} ref={fileInput} type="file" accept=".csv,text/csv" disabled={!!hint} onChange={(e) => void pickFile(e.target.files?.[0])} className="min-h-11 w-full rounded-[10px] border border-input-border bg-white px-3 py-2 text-sm" />
          )}
        </Field>
        {file && <p className="m-0 text-sm text-ink-2" role="status">Chosen: <strong>{file.name}</strong> · {formatBytes(file.size)} · about {plural(countRows(text), 'question row')}</p>}
        <FormatHelp />
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
          <button type="button" onClick={downloadTemplate} className="min-h-11 border-0 bg-transparent px-0 text-[15px] font-semibold text-brand underline">Download the template</button>
          <Btn kind="primary" busy={check.isPending} whyDisabled={hint} onClick={begin}>{check.isPending ? 'Checking the file…' : 'Check the file'}</Btn>
        </div>
      </section>
    );
  } else if (step === 2) {
    body = (
      <section aria-labelledby="imp-2" className={card}>
        <h2 id="imp-2" className="m-0 text-[17px]">Match the columns</h2>
        <p className="m-0 text-[15px] text-ink-2">JobPrep could not find {missing.length === 1 ? 'a column' : 'some columns'} by name. Say which column of your file holds each one.</p>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,240px),1fr))] gap-3.5">
          {missing.map((m) => (
            <Field key={m} label={`${columnName(m)} is in`} error={tried && !selection[m] ? 'Choose a column.' : null}>
              {(aria) => (
                <select {...aria} value={selection[m] ?? ''} onChange={(e) => setSelection({ ...selection, [m]: e.target.value })} className={cx(CONTROL, edge(tried && !selection[m]))}>
                  <option value="">Choose a column</option>
                  {headers.map((h) => <option key={h} value={h}>{h}</option>)}
                </select>
              )}
            </Field>
          ))}
        </div>
        <div className="flex flex-wrap justify-between gap-2 border-t border-border pt-3">
          <Btn onClick={() => setStep(1)}>Back</Btn>
          <Btn kind="primary" busy={check.isPending} onClick={() => { setTried(true); if (mappingComplete(missing, selection)) check.mutate(buildColumnMap(selection)); }}>{check.isPending ? 'Checking…' : 'Check the file'}</Btn>
        </div>
      </section>
    );
  } else if (step === 3 && report) {
    body = (
      <section aria-labelledby="imp-3" className={card}>
        <h2 id="imp-3" className="m-0 text-[17px]">What was found</h2>
        <dl className="m-0 grid grid-cols-3 gap-2.5">
          {[['Rows read', report.totalRows, 'text-ink'], ['Ready to import', valid, 'text-correct'], ['With problems', bad, bad ? 'text-incorrect' : 'text-ink']].map(([k, v, c]) => (
            <div key={String(k)} className="flex flex-col gap-0.5 rounded-[12px] border border-border bg-white p-3">
              <dt className="text-xs font-semibold text-muted">{k}</dt>
              <dd className={cx('m-0 text-[22px] font-semibold tabular', String(c))}>{Number(v).toLocaleString('en-US')}</dd>
            </div>
          ))}
        </dl>
        <p className="m-0 text-sm text-muted">Nothing has been saved yet. This is only a check.</p>
        {bad === 0 && <p role="status" className="m-0 rounded-[10px] border border-correct-line bg-correct-bg px-3.5 py-3 text-sm font-semibold text-correct">No problems found. All {plural(valid, 'row')} can be imported.</p>}
        {bad > 0 && (
          <section aria-labelledby="imp-probs" className="flex flex-col gap-2">
            <h3 id="imp-probs" className="m-0 text-[15px]">Problems ({plural(report.problems.length, 'problem')} in {plural(bad, 'row')})</h3>
            <ProblemsView report={report} phone={phone} />
            {report.errorCsv && (
              <button type="button" onClick={() => downloadText('import-errors.csv', report.errorCsv!)} className="min-h-11 self-start border-0 bg-transparent px-0 text-[15px] font-semibold text-brand underline">Download the rows with problems (CSV)</button>
            )}
          </section>
        )}
        <PreviewView report={report} phone={phone} />
        {bad > 0 && valid > 0 && <p className="m-0 text-sm text-ink-2">You can import the {plural(valid, 'valid row')} now and skip the rest, or fix the file and upload it again.</p>}
        {bad > 0 && valid === 0 && <p role="alert" className="m-0 text-sm font-semibold text-incorrect">No row can be imported. Fix the file and upload it again.</p>}
        <div className="flex flex-col-reverse gap-2 border-t border-border pt-3 min-[520px]:flex-row min-[520px]:justify-between">
          <Btn onClick={restart}>{bad > 0 ? 'Fix the file and upload again' : 'Choose another file'}</Btn>
          {valid > 0 && <Btn kind="primary" onClick={() => { setFileError(null); setStep(4); }}>{bad > 0 ? `Continue with ${plural(valid, 'valid row')}` : 'Continue'}</Btn>}
        </div>
      </section>
    );
  } else if (step === 4 && report) {
    body = result ? (
      <section aria-labelledby="imp-4" className={card}>
        <h2 id="imp-4" className="m-0 text-[17px]">Import finished</h2>
        <p role="status" className="m-0 rounded-[10px] border border-correct-line bg-correct-bg px-3.5 py-3 text-[15px] font-semibold text-correct">
          {plural(result.created, 'question')} added to {testTitle} as drafts{result.invalidRows > 0 ? `, ${plural(result.invalidRows, 'row')} skipped` : ''}.
        </p>
        <p className="m-0 text-sm text-ink-2">The questions are drafts. Read them, then publish each one (or the whole test) when they are ready.</p>
        {(result.errorCsv || report.errorCsv) && (
          <button type="button" onClick={() => downloadText('import-errors.csv', result.errorCsv || report.errorCsv || '')} className="min-h-11 self-start border-0 bg-transparent px-0 text-[15px] font-semibold text-brand underline">Download the skipped rows (CSV)</button>
        )}
        <div className="flex flex-col gap-2 border-t border-border pt-3 min-[520px]:flex-row min-[520px]:justify-end">
          <Btn onClick={restart}>Import another file</Btn>
          <LinkButton to={`/admin/exams/${testId}`} kind="primary">Open {testTitle}</LinkButton>
        </div>
      </section>
    ) : (
      <section aria-labelledby="imp-4" className={card}>
        <h2 id="imp-4" className="m-0 text-[17px]">Confirm the import</h2>
        <p className="m-0 text-[15px] text-ink-2">
          {plural(valid, 'question')} will be added to <strong>{testTitle}</strong> as drafts{bad > 0 ? `. The ${plural(bad, 'row')} with problems will be skipped.` : '.'} Drafts are not shown to candidates until you publish them.
        </p>
        <p className="m-0 text-xs text-muted">This is recorded in the audit log.</p>
        {fileError && <div role="alert" className="rounded-[10px] border border-incorrect-line bg-incorrect-bg px-3.5 py-3 text-sm font-semibold text-incorrect">{fileError}</div>}
        <SaveStatus state={doImport.isPending ? 'saving' : 'idle'} />
        <div className="flex flex-col-reverse gap-2 border-t border-border pt-3 min-[520px]:flex-row min-[520px]:justify-between">
          <Btn onClick={() => setStep(3)} disabled={busy}>Back</Btn>
          <Btn kind="primary" busy={doImport.isPending} onClick={() => doImport.mutate()}>{doImport.isPending ? 'Importing…' : `Import ${plural(valid, 'question')}`}</Btn>
        </div>
      </section>
    );
  } else {
    body = <Skeleton label="Loading…" />;
  }

  return (
    <AdminShell title="Import questions" back={phone ? (params.testId ? `/admin/exams/${params.testId}` : '/admin/exams') : undefined}>
      {isDesktop && (
        <div className="flex flex-col gap-1">
          <Link to={params.testId ? `/admin/exams/${params.testId}` : '/admin/exams'} className="self-start text-sm font-semibold">← Exams &amp; questions</Link>
          <h1 className="m-0 text-[28px] tracking-[-0.02em]">Import questions (CSV)</h1>
          <span className="text-sm text-muted">Add many questions at once from a spreadsheet.</span>
        </div>
      )}
      <div className="mx-auto flex w-full max-w-[860px] flex-col gap-4">
        <Stepper current={step} skippedColumns={skippedColumns} />
        {body}
      </div>
    </AdminShell>
  );
}

