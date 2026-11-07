import { Link } from 'react-router-dom';
import { useActiveCountrySlug, useCountryDetail } from '../../features/country/hooks';
import { useT } from '../../lib/i18n';
import { LEGAL_URL, NEW_TAB } from '../../features/legal/legalModel';
import { LanguageSwitcher } from '../LanguageSwitcher';

const footLink = 'inline-flex min-h-[44px] items-center text-muted underline hover:text-ink';

/**
 * Footer with the country's independence disclaimer from the API (falls back to the generic catalogue string), the
 * language control (only when the country offers more than one language) and the links to the legal and help pages.
 */
export function Footer() {
  const slug = useActiveCountrySlug();
  const { data } = useCountryDetail(slug);
  const t = useT();
  const disclaimer = data ? (data.disclaimer ?? t('disclaimer.default')) : null;
  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex max-w-[1200px] flex-col gap-1.5 px-4 pb-7 pt-5 text-[13px] text-muted md:flex-row md:flex-wrap md:justify-between md:gap-3 md:px-6 md:py-7 md:text-sm">
        <span>JobPrep by Nexvecta · jobprep.nexvecta.com</span>
        <span className="min-h-[1.25em]" data-testid="disclaimer">
          {disclaimer}
        </span>
      </div>
      <div className="mx-auto flex max-w-[1200px] flex-wrap items-center justify-between gap-x-5 gap-y-1 px-4 pb-6 text-[13px] md:px-6 md:text-sm">
        <nav aria-label="Legal and help" className="flex flex-wrap gap-x-4">
          <a href={LEGAL_URL.terms} {...NEW_TAB} className={footLink}>
            {t('footer.terms')}
          </a>
          <a href={LEGAL_URL.privacy} {...NEW_TAB} className={footLink}>
            {t('footer.privacy')}
          </a>
          <a href={LEGAL_URL.refund} {...NEW_TAB} className={footLink}>
            {t('footer.refund')}
          </a>
          <Link to="/help" className={footLink}>
            {t('footer.help')}
          </Link>
        </nav>
        <LanguageSwitcher variant="segmented" label={t('language.label')} />
      </div>
    </footer>
  );
}
