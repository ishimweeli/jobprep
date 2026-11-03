import { useNavigate } from 'react-router-dom';
import { Dialog } from '../../components/Dialog';
import { LogoMark } from '../../components/Logo';
import { setStoredCountry } from '../../lib/country';
import { useDocumentTitle } from '../../lib/useDocumentTitle';
import { useIsDesktop } from '../../lib/useMediaQuery';
import { useSession } from '../auth/session';
import { CountryPickerBody } from './CountryPicker';
import { countryPath, useActiveCountrySlug } from './hooks';

const DESKTOP_NOTE =
  'Mock tests are independent practice material, not affiliated with any government recruitment body.';

/**
 * `/choose-country`. Phone: a full page (CountryPickerPhone). Desktop: the picker modal over a dimmed page
 * skeleton (CountryPicker). Both use the same body, so behaviour is identical.
 * A signed-in user's country is locked: choosing a live country opens Change exam country (ChangeCountry.dc) with it selected.
 */
export function ChooseCountryPage() {
  useDocumentTitle('Choose your country');
  const navigate = useNavigate();
  const desktop = useIsDesktop();
  const slug = useActiveCountrySlug();
  const { user } = useSession();

  const onContinue = (country: { slug: string; code: string }) => {
    if (user) return navigate(`/account/country?to=${country.code}`);
    setStoredCountry(country.slug);
    navigate(countryPath(country.slug));
  };

  if (desktop) {
    return (
      <div className="min-h-screen bg-page">
        <div aria-hidden="true" className="flex items-center gap-2.5 border-b border-border bg-surface px-8 py-[18px] text-xl font-bold">
          <LogoMark />
          JobPrep
        </div>
        <div aria-hidden="true" className="mx-auto flex max-w-[1100px] flex-col gap-[18px] px-6 py-[72px]">
          <div className="h-14 w-3/5 rounded-control bg-border" />
          <div className="h-5 w-[45%] rounded-lg bg-border" />
          <div className="h-[120px] w-[55%] rounded-card bg-soft" />
        </div>
        <Dialog open onClose={() => navigate(countryPath(slug))} title="Where are you sitting your exam?" variant="modal" titleAs="h1" titleClassName="m-0 text-[26px] font-bold tracking-tight">
          <p className="m-0 mb-4 text-base text-ink-2">
            We show mock tests, prices and payment methods for your country. You can change this later from the top of any page.
          </p>
          <CountryPickerBody currentSlug={slug} onContinue={onContinue} showLanguage desktop footnote={DESKTOP_NOTE} />
        </Dialog>
      </div>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-[480px] flex-col gap-4 bg-surface px-4 pb-8 pt-7">
      <LogoMark size={40} />
      <h1 className="m-0 text-2xl font-bold leading-tight tracking-tight">Where are you sitting your exam?</h1>
      <p className="m-0 text-base leading-normal text-ink-2">We’ll show mock tests, prices and payment methods for your country.</p>
      <CountryPickerBody currentSlug={slug} onContinue={onContinue} />
    </main>
  );
}
