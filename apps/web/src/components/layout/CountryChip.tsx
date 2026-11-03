import { Link } from 'react-router-dom';
import { useActiveCountry } from '../../features/country/hooks';
import { cx } from '../../lib/cx';

/**
 * Header country switcher: the code chip and the country name ("RW Rwanda"). It opens the country picker screen.
 * No currency is shown beside the country: choosing a country and money are separate (design ba8f27b).
 * The accessible name is "Country: RW Rwanda. Change country": axe (WCAG 2.5.3) needs the visible "RW Rwanda" inside it, so the artboard's "Country: Rwanda…" label is lengthened by the code.
 */
export function CountryChip({ className }: { className?: string }) {
  const { slug, country } = useActiveCountry();
  const code = (country?.code ?? slug).toUpperCase();
  const name = country?.name ?? code;

  return (
    <Link
      to="/choose-country"
      aria-label={`Country: ${code} ${name}. Change country`}
      className={cx(
        'inline-flex min-h-[44px] items-center gap-1.5 rounded-pill border border-border-strong bg-surface px-2.5 text-[13px] font-semibold text-ink no-underline hover:bg-soft hover:text-ink md:px-3 md:text-sm',
        className,
      )}
    >
      {/* the accessible name already carries the code */}
      <span aria-hidden="true" className="rounded border border-border bg-page px-1 text-[11px] font-semibold text-muted md:px-[5px]">
        {code}
      </span>
      {` ${name}`}
    </Link>
  );
}
