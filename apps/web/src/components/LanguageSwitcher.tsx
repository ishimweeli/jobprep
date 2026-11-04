import { isLocale } from '@jobprep/shared';
import { cx } from '../lib/cx';
import { languageOwnName } from '../lib/format';
import { useLocale, useOfferedLanguages, useSetLocale } from '../lib/i18n';

/**
 * The language control (C22 / C33; not drawn, built in the existing chip / segmented style). It lists only the languages
 * the country offers and renders nothing when there is just one (English), unless `always` is set (the account page
 * shows the single language as plain text instead).
 *  - `header`: a compact select in the desktop header.
 *  - `segmented`: pressed buttons (phone menu sheet, footer, account page).
 */
export function LanguageSwitcher({ variant, className, label = 'Language' }: { variant: 'header' | 'segmented'; className?: string; label?: string }) {
  const offered = useOfferedLanguages().filter(isLocale);
  const locale = useLocale();
  const { setLocale, pending, error } = useSetLocale();
  if (offered.length < 2) return null;

  if (variant === 'header') {
    return (
      <label className={cx('inline-flex min-h-[44px] items-center', className)}>
        <span className="sr-only">{label}</span>
        <select
          value={locale}
          disabled={pending}
          onChange={(e) => isLocale(e.target.value) && setLocale(e.target.value)}
          className="h-[44px] cursor-pointer rounded-pill border border-border-strong bg-surface px-3 text-[13px] font-semibold text-ink md:text-sm"
        >
          {offered.map((l) => (
            <option key={l} value={l}>
              {languageOwnName(l)}
            </option>
          ))}
        </select>
      </label>
    );
  }

  return (
    <div className={cx('flex flex-col gap-1', className)}>
      <span role="group" aria-label={label} className="inline-flex flex-wrap gap-1 rounded-[10px] bg-soft p-[3px]">
        {offered.map((l) => (
          <button
            key={l}
            type="button"
            aria-pressed={l === locale}
            disabled={pending}
            onClick={() => setLocale(l)}
            className={cx(
              'min-h-[44px] cursor-pointer rounded-lg border-0 px-3 text-sm font-semibold',
              l === locale ? 'bg-surface text-ink' : 'bg-transparent text-ink-2',
            )}
          >
            {languageOwnName(l)}
          </button>
        ))}
      </span>
      {error && (
        <span role="alert" className="text-[13px] font-semibold text-incorrect">
          {error}
        </span>
      )}
    </div>
  );
}
