import { AREA, CONTROL, FieldGroup, TextField, edge } from '../../components/forms';
import { Btn } from '../../components/ui';
import { cx } from '../../lib/cx';
import { CASE_LIMITS, emptyTable, type CaseForm, type CaseProblems } from './caseForm';
import { moveItem } from './mockTestForm';

const ErrorLine = ({ children }: { children?: string }) => (children ? <span role="alert" className="text-[13px] font-semibold text-incorrect">{children}</span> : null);

/** A list of paragraphs or notes: each its own box, with move up / down and remove. */
function TextList({ legend, hint, itemLabel, items, onChange, readOnly, max, addLabel, rows, error, minItems = 0 }: {
  legend: string; hint?: string; itemLabel: string; items: string[]; onChange: (n: string[]) => void; readOnly: boolean; max: number; addLabel: string; rows: number; error?: string; minItems?: number;
}) {
  return (
    <FieldGroup legend={legend} hint={hint}>
      <ol className="m-0 flex list-none flex-col gap-2.5 p-0">
        {items.map((text, i) => (
          <li key={i} className="flex flex-col gap-1.5">
            <label className="text-[13px] font-semibold text-muted" htmlFor={`${itemLabel}-${i}`}>{itemLabel} {i + 1}</label>
            <textarea
              id={`${itemLabel}-${i}`}
              rows={rows}
              value={text}
              readOnly={readOnly}
              onChange={(e) => onChange(items.map((x, j) => (j === i ? e.target.value : x)))}
              className={cx(AREA, edge(false))}
            />
            {!readOnly && (
              <span className="flex flex-wrap gap-1.5">
                <Btn size="sm" aria-label={`Move ${itemLabel.toLowerCase()} ${i + 1} up`} disabled={i === 0} onClick={() => onChange(moveItem(items, i, -1))}>↑ Up</Btn>
                <Btn size="sm" aria-label={`Move ${itemLabel.toLowerCase()} ${i + 1} down`} disabled={i === items.length - 1} onClick={() => onChange(moveItem(items, i, 1))}>↓ Down</Btn>
                <Btn size="sm" kind="danger" aria-label={`Remove ${itemLabel.toLowerCase()} ${i + 1}`} disabled={items.length <= minItems} onClick={() => onChange(items.filter((_, j) => j !== i))}>Remove</Btn>
              </span>
            )}
          </li>
        ))}
      </ol>
      {!readOnly && <Btn kind="outline-brand" className="self-start" disabled={items.length >= max} onClick={() => onChange([...items, ''])}>{addLabel}</Btn>}
      <ErrorLine>{error}</ErrorLine>
    </FieldGroup>
  );
}

/** Tables: a caption and rows of label, value and a heading-row switch. Up to 6 tables of 60 rows. */
function TablesEditor({ tables, onChange, readOnly, error }: { tables: CaseForm['tables']; onChange: (t: CaseForm['tables']) => void; readOnly: boolean; error?: string }) {
  const setTable = (i: number, next: CaseForm['tables'][number]) => onChange(tables.map((t, j) => (j === i ? next : t)));
  return (
    <FieldGroup legend="Tables" hint="Figures the candidate reads from. A heading row is shown in bold.">
      {tables.length === 0 && <p className="m-0 text-sm text-muted">No tables.</p>}
      {tables.map((t, i) => (
        <div key={i} className="flex flex-col gap-2.5 rounded-[12px] border border-border bg-page p-3.5">
          <div className="flex flex-wrap items-end gap-2">
            <TextField label={`Table ${i + 1} caption`} value={t.caption} readOnly={readOnly} className="min-w-0 flex-[1_1_240px]" onChange={(e) => setTable(i, { ...t, caption: e.target.value })} />
            {!readOnly && <Btn kind="danger" aria-label={`Remove table ${i + 1}`} onClick={() => onChange(tables.filter((_, j) => j !== i))}>Remove table</Btn>}
          </div>
          <ol className="m-0 flex list-none flex-col gap-2 p-0">
            {t.rows.map((r, k) => (
              <li key={k} className="flex flex-wrap items-center gap-2 rounded-[10px] bg-white p-2">
                <input aria-label={`Table ${i + 1} row ${k + 1} label`} placeholder="Label" value={r.label} readOnly={readOnly} onChange={(e) => setTable(i, { ...t, rows: t.rows.map((x, j) => (j === k ? { ...x, label: e.target.value } : x)) })} className={cx(CONTROL, 'min-w-0 flex-[2_1_160px]', edge(false))} />
                <input aria-label={`Table ${i + 1} row ${k + 1} value`} placeholder="Value" value={r.value ?? ''} readOnly={readOnly} onChange={(e) => setTable(i, { ...t, rows: t.rows.map((x, j) => (j === k ? { ...x, value: e.target.value } : x)) })} className={cx(CONTROL, 'min-w-0 flex-[1_1_110px]', edge(false))} />
                <label className="flex min-h-11 items-center gap-2 text-sm">
                  <input type="checkbox" className="h-5 w-5 accent-brand" checked={!!r.heading} disabled={readOnly} aria-label={`Table ${i + 1} row ${k + 1} is a heading row`} onChange={(e) => setTable(i, { ...t, rows: t.rows.map((x, j) => (j === k ? { ...x, heading: e.target.checked } : x)) })} />
                  Heading
                </label>
                {!readOnly && (
                  <span className="flex gap-1.5">
                    <Btn size="sm" aria-label={`Move table ${i + 1} row ${k + 1} up`} disabled={k === 0} onClick={() => setTable(i, { ...t, rows: moveItem(t.rows, k, -1) })}>↑</Btn>
                    <Btn size="sm" aria-label={`Move table ${i + 1} row ${k + 1} down`} disabled={k === t.rows.length - 1} onClick={() => setTable(i, { ...t, rows: moveItem(t.rows, k, 1) })}>↓</Btn>
                    <Btn size="sm" kind="danger" aria-label={`Remove table ${i + 1} row ${k + 1}`} disabled={t.rows.length <= 1} onClick={() => setTable(i, { ...t, rows: t.rows.filter((_, j) => j !== k) })}>Remove</Btn>
                  </span>
                )}
              </li>
            ))}
          </ol>
          {!readOnly && <Btn size="sm" className="self-start" disabled={t.rows.length >= CASE_LIMITS.rows} onClick={() => setTable(i, { ...t, rows: [...t.rows, { label: '', value: '' }] })}>+ Add a row to table {i + 1}</Btn>}
        </div>
      ))}
      {!readOnly && <Btn kind="outline-brand" className="self-start" disabled={tables.length >= CASE_LIMITS.tables} onClick={() => onChange([...tables, emptyTable()])}>+ Add a table</Btn>}
      <ErrorLine>{error}</ErrorLine>
    </FieldGroup>
  );
}

/** Title, passage paragraphs, tables and numbered notes: the content of a case study (and of each translation). */
export function CaseFields({ form, onChange, readOnly, problems = {}, titleLabel = 'Title' }: { form: CaseForm; onChange: (f: CaseForm) => void; readOnly: boolean; problems?: CaseProblems; titleLabel?: string }) {
  return (
    <div className="flex flex-col gap-5">
      <TextField label={titleLabel} value={form.title} readOnly={readOnly} error={problems.title} onChange={(e) => onChange({ ...form, title: e.target.value })} />
      <TextList legend="Passage" hint="The text of the case, one paragraph per box." itemLabel="Paragraph" items={form.passage} onChange={(passage) => onChange({ ...form, passage })} readOnly={readOnly} max={CASE_LIMITS.paragraphs} addLabel="+ Add a paragraph" rows={4} error={problems.passage} minItems={1} />
      <TablesEditor tables={form.tables} onChange={(tables) => onChange({ ...form, tables })} readOnly={readOnly} error={problems.tables} />
      <TextList legend="Additional information" hint="Numbered notes shown after the tables." itemLabel="Note" items={form.notes} onChange={(notes) => onChange({ ...form, notes })} readOnly={readOnly} max={CASE_LIMITS.notes} addLabel="+ Add a note" rows={2} error={problems.notes} />
    </div>
  );
}
