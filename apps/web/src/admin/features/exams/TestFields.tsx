import { useId } from 'react';
import type { CatalogOptionsFull } from '../../api/types';
import type { CountryOption, MockTestExtras } from '../../api/content';
import { CheckField, Field, FieldGroup, SelectField, TextAreaField, TextField, CONTROL, edge } from '../../components/forms';
import { Btn } from '../../components/ui';
import { cx } from '../../lib/cx';
import { countryName } from '../../lib/format';
import { DIFFICULTY_OPTIONS, LANGUAGES, LIMITS, type MockTestForm, type TestProblems } from './mockTestForm';
import { moveItem } from './mockTestForm';

/** One-line explanation under a group of fields. */
const Help = ({ children }: { children: React.ReactNode }) => <p className="m-0 text-[13px] text-muted">{children}</p>;

/** The lines of the instructions list: add, change, move up or down, remove. Keyboard friendly (buttons, no drag). */
export function InstructionsEditor({ lines, onChange, readOnly, error }: { lines: string[]; onChange: (next: string[]) => void; readOnly: boolean; error?: string }) {
  const id = useId();
  return (
    <FieldGroup legend="Instructions for candidates" hint={`Shown before the test starts, one line each. Up to ${LIMITS.instructionsMax} lines.`}>
      {lines.length === 0 && <p className="m-0 text-sm text-muted">No instructions yet.</p>}
      <ol className="m-0 flex list-none flex-col gap-2 p-0">
        {lines.map((line, i) => (
          <li key={i} className="flex flex-wrap items-center gap-2">
            <span aria-hidden="true" className="w-5 text-sm font-semibold text-muted">{i + 1}</span>
            <input
              type="text"
              aria-label={`Instruction ${i + 1}`}
              value={line}
              readOnly={readOnly}
              maxLength={LIMITS.instructionMax + 50}
              onChange={(e) => onChange(lines.map((l, j) => (j === i ? e.target.value : l)))}
              className={cx(CONTROL, 'min-w-0 flex-[1_1_220px]', edge(false))}
            />
            {!readOnly && (
              <span className="flex gap-1.5">
                <Btn size="sm" aria-label={`Move instruction ${i + 1} up`} disabled={i === 0} onClick={() => onChange(moveItem(lines, i, -1))}>↑</Btn>
                <Btn size="sm" aria-label={`Move instruction ${i + 1} down`} disabled={i === lines.length - 1} onClick={() => onChange(moveItem(lines, i, 1))}>↓</Btn>
                <Btn size="sm" kind="danger" aria-label={`Remove instruction ${i + 1}`} onClick={() => onChange(lines.filter((_, j) => j !== i))}>Remove</Btn>
              </span>
            )}
          </li>
        ))}
      </ol>
      {!readOnly && (
        <Btn kind="outline-brand" className="self-start" disabled={lines.length >= LIMITS.instructionsMax} onClick={() => onChange([...lines, ''])}>
          + Add an instruction
        </Btn>
      )}
      {error && <span id={`${id}-e`} role="alert" className="text-[13px] font-semibold text-incorrect">{error}</span>}
    </FieldGroup>
  );
}

export interface FieldsProps {
  form: MockTestForm;
  set: <K extends keyof MockTestForm>(k: K, v: MockTestForm[K]) => void;
  problems: TestProblems;
  readOnly: boolean;
  creating: boolean;
  catalog?: CatalogOptionsFull;
  countries: CountryOption[];
  extras?: MockTestExtras;
}

/** Every field of the test form (A9), in the order a person fills them in. */
export function TestFields({ form, set, problems, readOnly, creating, catalog, countries, extras }: FieldsProps) {
  const categories = (catalog?.categories ?? []).filter((c) => !form.countryCode || c.countryCode === form.countryCode);
  const professions = (catalog?.professions ?? []).filter((p) => p.categoryId === form.categoryId);
  const toggleLanguage = (code: string, on: boolean) => set('languages', on ? [...form.languages, code] : form.languages.filter((l) => l !== code));
  const hasMark = form.passMark.trim() !== '' && form.passSource.trim() !== '';

  return (
    <div className="flex flex-col gap-5">
      <TextField label="Title" value={form.title} readOnly={readOnly} maxLength={LIMITS.titleMax + 20} error={problems.title} onChange={(e) => set('title', e.target.value)} />
      <TextAreaField label="Summary" optional rows={3} value={form.summary} readOnly={readOnly} error={problems.summary} hint="One or two sentences shown in the catalogue." onChange={(e) => set('summary', e.target.value)} />

      <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,220px),1fr))] gap-3.5">
        {creating ? (
          <SelectField
            label="Country"
            value={form.countryCode}
            disabled={readOnly}
            onChange={(e) => {
              set('countryCode', e.target.value);
              set('categoryId', '');
              set('professionId', '');
            }}
          >
            <option value="">Choose a country</option>
            {countries.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
          </SelectField>
        ) : (
          <TextField label="Country" value={countryName(form.countryCode)} readOnly hint="A test stays in its country." />
        )}
        <SelectField
          label="Category"
          value={form.categoryId}
          disabled={readOnly || (creating && !form.countryCode)}
          error={problems.category}
          onChange={(e) => {
            set('categoryId', e.target.value);
            if (creating) set('professionId', '');
          }}
        >
          <option value="">Choose a category</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </SelectField>
        {creating ? (
          <SelectField label="Profession or exam" value={form.professionId} disabled={readOnly || !form.categoryId} error={problems.profession} hint="The exam this test belongs to." onChange={(e) => set('professionId', e.target.value)}>
            <option value="">Choose a profession</option>
            {professions.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </SelectField>
        ) : (
          <TextField label="Profession or exam" value={extras?.profession?.name ?? extras?.exam?.name ?? ''} readOnly hint="Fixed once the test exists." />
        )}
        {!creating && <TextField label="Authority" value={extras?.authority ? `${extras.authority.shortName} · ${extras.authority.name}` : 'None'} readOnly />}
      </div>

      <FieldGroup legend="Who can take it">
        <div className="flex flex-col gap-1 sm:flex-row sm:gap-5">
          <label className="flex min-h-11 items-center gap-2.5 text-[15px]">
            <input type="radio" name="access" className="h-5 w-5 accent-brand" checked={form.isFree} disabled={readOnly} onChange={() => set('isFree', true)} />
            Free sample (anyone, no account needed)
          </label>
          <label className="flex min-h-11 items-center gap-2.5 text-[15px]">
            <input type="radio" name="access" className="h-5 w-5 accent-brand" checked={!form.isFree} disabled={readOnly} onChange={() => set('isFree', false)} />
            Full Access (paid)
          </label>
        </div>
      </FieldGroup>

      <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,220px),1fr))] gap-3.5">
        <SelectField label="Difficulty" value={form.difficulty} disabled={readOnly} onChange={(e) => set('difficulty', e.target.value as MockTestForm['difficulty'])}>
          {DIFFICULTY_OPTIONS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
        </SelectField>
        <TextField label="Time limit (minutes)" type="number" inputMode="numeric" min={1} max={LIMITS.durationMax} value={form.durationMinutes} readOnly={readOnly} error={problems.duration} onChange={(e) => set('durationMinutes', e.target.value)} />
      </div>

      <FieldGroup legend="Languages" hint="The first language is the source; the others need translations of each question.">
        <div className="flex flex-wrap gap-x-5">
          {LANGUAGES.map((l) => (
            <CheckField key={l.code} label={l.label} checked={form.languages.includes(l.code)} disabled={readOnly} onChange={(e) => toggleLanguage(l.code, e.target.checked)} />
          ))}
        </div>
        {problems.languages && <span role="alert" className="text-[13px] font-semibold text-incorrect">{problems.languages}</span>}
      </FieldGroup>

      <InstructionsEditor lines={form.instructions} onChange={(l) => set('instructions', l)} readOnly={readOnly} error={problems.instructions} />

      <FieldGroup legend="Marking">
        <TextField
          label="Marks taken off for each wrong answer"
          type="number"
          step="any"
          min={0}
          max={LIMITS.negativeMax}
          value={form.negativeMark}
          readOnly={readOnly}
          error={problems.negative}
          hint="0 means no negative marking, which is the default. A wrong answer never takes the score below zero."
          className="max-w-[320px]"
          onChange={(e) => set('negativeMark', e.target.value)}
        />
        <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,260px),1fr))] gap-3.5">
          <TextField label="Official pass mark (%)" optional type="number" min={1} max={100} value={form.passMark} readOnly={readOnly} error={problems.passMark} onChange={(e) => set('passMark', e.target.value)} />
          <Field label="Source of the pass mark" optional error={problems.passSource} hint="For example the name and date of the authority's notice.">
            {(aria) => <input {...aria} type="text" value={form.passSource} readOnly={readOnly} maxLength={LIMITS.sourceMax + 50} onChange={(e) => set('passSource', e.target.value)} className={cx(CONTROL, edge(!!problems.passSource))} />}
          </Field>
        </div>
        <Help>
          {hasMark
            ? 'Candidates will see this pass mark with its source.'
            : 'Empty by default. JobPrep only shows a pass mark when both the percentage and its source are entered; otherwise candidates see their score and percentage only.'}
        </Help>
      </FieldGroup>
    </div>
  );
}
