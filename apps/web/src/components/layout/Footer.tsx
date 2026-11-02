import { t } from '@jobprep/shared';
import { useActiveCountrySlug, useCountryDetail } from '../../features/country/hooks';

/** Footer with the country's independence disclaimer from the API (falls back to the generic catalogue string). */
export function Footer() {
  const slug = useActiveCountrySlug();
  const { data } = useCountryDetail(slug);
  const disclaimer = data ? (data.disclaimer ?? t('en', 'disclaimer.default')) : null;
  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex max-w-[1200px] flex-col gap-1.5 px-4 pb-7 pt-5 text-[13px] text-muted md:flex-row md:flex-wrap md:justify-between md:gap-3 md:px-6 md:py-7 md:text-sm">
        <span>JobPrep by Nexvecta · jobprep.nexvecta.com</span>
        <span className="min-h-[1.25em]" data-testid="disclaimer">
          {disclaimer}
        </span>
      </div>
    </footer>
  );
}
