import { Link } from 'react-router-dom';
import { useActiveCountry } from '../../features/country/hooks';
import { cx } from '../../lib/cx';

/**
 * Header country switcher (design: "RW Rwanda · RWF"). It opens the country picker screen.
 * The accessible name is built from the visible text plus visually-hidden words, so it always contains what is shown.
 */
export function CountryChip({ compact, nameOnly, className }: { compact?: boolean; /** Phone dashboard: "RW Rwanda" (no currency). */ nameOnly?: boolean; className?: string }) {
  const { slug, country } = useActiveCountry();
  const code = (country?.code ?? slug).toUpperCase();
  const name = country?.name ?? code;
  const currency = country?.currencyCode;

  return (
    <Link
      to="/choose-country"
      className={cx(
        'inline-flex min-h-[44px] items-center gap-1.5 rounded-pill border border-zinc-300 bg-surface px-2.5 text-[13px] font-bold text-ink no-underline hover:bg-soft hover:text-ink md:px-3 md:text-sm md:font-semibold',
        className,
      )}
    >
      <span className="sr-only">Country: </span>
      <span className="rounded bg-ink px-1 text-[11px] font-bold text-white md:px-[5px]">{code}</span>
      {nameOnly ? name : compact ? currency : `${name}${currency ? ` · ${currency}` : ''}`}
      <span className="sr-only">. Change country</span>
    </Link>
  );
}
