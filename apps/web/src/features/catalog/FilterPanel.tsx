import type { CatalogFacets } from '../../api/types';
import type { CatalogFilters } from '../../lib/catalogFilters';
import { cx } from '../../lib/cx';
import { difficultyLabel, languageName } from '../../lib/format';

interface Props {
  filters: CatalogFilters;
  facets: CatalogFacets | undefined;
  onChange: (patch: Partial<CatalogFilters>) => void;
  /** `aside` = desktop sidebar rows; `sheet` = phone bottom-sheet segmented controls. */
  variant: 'aside' | 'sheet';
  idPrefix: string;
}

interface Option {
  value: string;
  label: string;
}

/** Sort choices (C32). "Free first" is the API's `free_first`. The desktop shows them in a select above the results, the phone sheet as chips. */
export const SORT_OPTIONS: { value: CatalogFilters['sort']; label: string }[] = [
  { value: '', label: 'Most relevant' },
  { value: 'free_first', label: 'Free first' },
  { value: 'recent', label: 'Newest' },
  { value: 'title', label: 'A to Z' },
];

/** Radio group (single choice) with the design's two looks. Native radios: arrow keys work for free. */
function RadioGroup({
  legend,
  name,
  value,
  options,
  onPick,
  variant,
}: {
  legend: string;
  name: string;
  value: string;
  options: Option[];
  onPick: (v: string) => void;
  variant: 'aside' | 'sheet';
}) {
  return (
    <fieldset className="m-0 flex min-w-0 flex-col border-0 p-0">
      <legend className="mb-2 p-0 text-[15px] font-semibold">{legend}</legend>
      <div className={cx(variant === 'sheet' ? 'flex flex-wrap gap-2' : 'flex flex-col gap-2')}>
        {options.map((o) => {
          const on = o.value === value;
          return (
            <label key={o.value || 'any'} className={cx(variant === 'sheet' ? 'min-w-[30%] flex-1' : 'block')}>
              <input type="radio" name={name} value={o.value} checked={on} onChange={() => onPick(o.value)} className="peer sr-only" />
              {variant === 'sheet' ? (
                <span
                  className={cx(
                    'flex min-h-[44px] cursor-pointer items-center justify-center rounded-[10px] border px-2 text-center text-sm font-semibold peer-focus-visible:outline peer-focus-visible:outline-[3px] peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand-ring',
                    on ? 'border-brand bg-brand-softer text-brand' : 'border-border-strong bg-surface text-ink',
                  )}
                >
                  {o.label}
                </span>
              ) : (
                <span
                  className={cx(
                    'flex min-h-[44px] cursor-pointer items-center gap-2.5 rounded-[10px] border px-3 text-[15px] peer-focus-visible:outline peer-focus-visible:outline-[3px] peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand-ring',
                    on ? 'border-brand bg-brand-softer' : 'border-border bg-surface',
                  )}
                >
                  <span aria-hidden="true" className="inline-flex h-[18px] w-[18px] flex-none items-center justify-center rounded-full border-2 border-muted">
                    <span className={cx('h-2 w-2 rounded-full', on ? 'bg-brand' : 'bg-transparent')} />
                  </span>
                  {o.label}
                </span>
              )}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

/** Subject / price / difficulty / language controls, shared by the desktop sidebar and the phone sheet. */
export function FilterPanel({ filters, facets, onChange, variant, idPrefix }: Props) {
  const sheet = variant === 'sheet';
  const priceOptions: Option[] = sheet
    ? [
        { value: '', label: 'All' },
        { value: 'free', label: 'Free' },
        { value: 'paid', label: 'Full Access' },
      ]
    : [
        { value: '', label: 'All tests' },
        { value: 'free', label: 'Free only' },
        { value: 'paid', label: 'Full Access only' },
      ];
  const difficultyOptions: Option[] = [
    { value: '', label: 'Any' },
    ...(facets?.difficulties ?? []).map((d) => ({ value: d, label: difficultyLabel(d) })),
  ];
  const languageOptions: Option[] = [
    { value: '', label: 'Any' },
    ...(facets?.languages ?? []).map((l) => ({ value: l, label: languageName(l) })),
  ];

  const subject = (
    <div className="flex flex-col gap-2">
      <label htmlFor={`${idPrefix}-subject`} className="text-[15px] font-semibold">
        Subject / role
      </label>
      <select
        id={`${idPrefix}-subject`}
        value={filters.subject}
        onChange={(e) => onChange({ subject: e.target.value })}
        className="h-11 rounded-[10px] border border-input-border bg-surface px-3 text-[15px] text-ink"
      >
        <option value="">All subjects</option>
        {(facets?.subjects ?? []).map((s) => (
          <option key={s.slug} value={s.slug}>
            {s.name}
          </option>
        ))}
      </select>
    </div>
  );

  return (
    <div className={cx('flex flex-col', sheet ? 'gap-4' : 'gap-5')}>
      {subject}
      <RadioGroup legend="Price" name={`${idPrefix}-price`} value={filters.price} options={priceOptions} variant={variant} onPick={(v) => onChange({ price: v as CatalogFilters['price'] })} />
      <RadioGroup
        legend="Difficulty"
        name={`${idPrefix}-difficulty`}
        value={filters.difficulty}
        options={difficultyOptions}
        variant={variant}
        onPick={(v) => onChange({ difficulty: v as CatalogFilters['difficulty'] })}
      />
      {languageOptions.length > 1 && (
        <RadioGroup legend="Language" name={`${idPrefix}-language`} value={filters.language} options={languageOptions} variant={variant} onPick={(v) => onChange({ language: v })} />
      )}
      {sheet && (
        <RadioGroup
          legend="Sort by"
          name={`${idPrefix}-sort`}
          value={filters.sort}
          options={SORT_OPTIONS}
          variant={variant}
          onPick={(v) => onChange({ sort: v as CatalogFilters['sort'] })}
        />
      )}
    </div>
  );
}
