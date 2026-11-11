import { countryPath } from '../../features/country/hooks';
import type { IconName } from '../StrokeIcon';

/** The catalog category that holds the professional licensing exams (nurses and midwives, doctors, allied health, pharmacy). */
export const LICENSING_CATEGORY = 'licensing-exams';

export interface NavItem {
  to: string;
  label: string;
  icon: IconName;
  /** Whether this item is the current page (both "Mock tests" and "Licensing exams" live under /tests). */
  isActive: (pathname: string, search: string) => boolean;
}

const under = (path: string) => (pathname: string) => pathname === path || pathname.startsWith(path + '/');
const licensingOpen = (search: string) => new URLSearchParams(search).get('category') === LICENSING_CATEGORY;

/** The signed-in primary nav, shared by the desktop sidebar and the phone menu. */
export function primaryNav(slug: string, opts: { interviewPrep?: boolean }): NavItem[] {
  const tests = countryPath(slug, 'tests');
  return [
    { to: countryPath(slug, 'progress'), label: 'Dashboard', icon: 'progress', isActive: under(countryPath(slug, 'progress')) },
    { to: tests, label: 'Mock tests', icon: 'tests', isActive: (p, s) => under(tests)(p) && !(p === tests && licensingOpen(s)) },
    { to: `${tests}?category=${LICENSING_CATEGORY}`, label: 'Licensing exams', icon: 'license', isActive: (p, s) => p === tests && licensingOpen(s) },
    ...(opts.interviewPrep
      ? [{ to: countryPath(slug, 'interview'), label: 'Interview prep', icon: 'mic' as const, isActive: under(countryPath(slug, 'interview')) }]
      : []),
    { to: countryPath(slug, 'pricing'), label: 'Pricing', icon: 'access', isActive: under(countryPath(slug, 'pricing')) },
    { to: '/account', label: 'Account', icon: 'user', isActive: under('/account') },
  ];
}
