import { Link } from 'react-router-dom';
import { countryPath, useActiveCountrySlug } from '../country/hooks';
import { useLanding } from './queries';

/** Desktop header call-to-action on the landing page: the first free sample test, else the free filter. */
export function FreeTestCta() {
  const slug = useActiveCountrySlug();
  const { data } = useLanding(slug);
  const free = data ? [...data.featuredTests, ...data.recentlyAdded].find((t) => t.isFree) : undefined;
  const to = free ? countryPath(slug, 'tests', free.slug) : `${countryPath(slug, 'tests')}?price=free`;
  return (
    <Link
      to={to}
      className="inline-flex min-h-[44px] items-center rounded-pill bg-brand px-[18px] text-[15px] font-semibold text-white no-underline hover:bg-brand-hover hover:text-white"
    >
      Try a free test
    </Link>
  );
}
