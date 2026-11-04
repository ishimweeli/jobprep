import { Check, ChevronRight, Search } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { Landing, TestCard } from '../../api/types';
import { Badge } from '../../components/Badge';
import { buttonClasses } from '../../components/Button';
import { CategoryIcon } from '../../components/CategoryIcon';
import { PhoneBrandHeader } from '../../components/layout/Header';
import { QueryError, SkeletonList } from '../../components/states';
import { cx } from '../../lib/cx';
import { formatDate, languageList, languageListShort, plural } from '../../lib/format';
import { useT } from '../../lib/i18n';
import { useSession } from '../auth/session';
import { countryPath, useActiveCountrySlug, useCountries } from '../country/hooks';
import { HeroPreview } from './HeroPreview';
import { useLanding } from './queries';

const STEPS = [
  { title: 'Find your exam', body: 'Search by job title, subject or category.' },
  { title: 'Take a timed test', body: 'A realistic computer-based exam with a timer and question navigator.' },
  { title: 'Review every answer', body: 'See the correct answer and why, topic by topic.' },
  { title: 'Practise weak areas', body: 'Retake targeted questions and watch your score move.' },
];

/** "teaching positions, school leadership and government administration" from the country's own categories. */
export function listPhrase(names: string[]): string {
  const lower = names.map((n) => n.toLowerCase());
  if (lower.length <= 1) return lower[0] ?? 'recruitment positions';
  return `${lower.slice(0, -1).join(', ')} and ${lower[lower.length - 1]}`;
}

export function LandingPage() {
  const t = useT();
  const slug = useActiveCountrySlug();
  const landing = useLanding(slug);
  const { user } = useSession();
  const countries = useCountries();
  const data = landing.data;
  const countryName = data?.country.name ?? countries.data?.find((c) => c.slug === slug)?.name;
  const freeTest = data ? [...data.featuredTests, ...data.recentlyAdded].find((x) => x.isFree) : undefined;
  const freeHref = freeTest ? countryPath(slug, 'tests', freeTest.slug) : `${countryPath(slug, 'tests')}?price=free`;
  const [headA, headB] = splitHeadline(t('landing.headline'));

  return (
    <div className="bg-surface">
      <PhoneBrandHeader />
      <main id="main-content" tabIndex={-1}>
        {/* Hero */}
        <section className="border-b border-border bg-page">
          <div className="mx-auto flex max-w-[1200px] flex-wrap items-center gap-12 px-4 pb-7 pt-7 md:px-6 md:pb-16 md:pt-[72px]">
            <div className="flex min-w-0 flex-[1_1_520px] flex-col gap-4 md:gap-[22px]">
              <span className="inline-flex min-h-[28px] self-start rounded-pill bg-brand-soft px-2.5 py-[5px] text-[13px] font-semibold text-brand md:min-h-[34px] md:px-3 md:py-1.5 md:text-sm">
                {countryName ? (
                  <>
                    <span className="md:hidden">{countryName} recruitment exam practice</span>
                    <span className="hidden md:inline">Mock tests for {countryName} public-service recruitment</span>
                  </>
                ) : (
                  <span aria-hidden="true">&nbsp;</span>
                )}
              </span>
              <h1 className="m-0 text-[32px] font-bold leading-[1.08] tracking-[-0.03em] md:text-[52px] md:leading-[1.05]">
                {headA}
                {headB ? (
                  <>
                    <br className="hidden md:block" /> {headB}
                  </>
                ) : null}
              </h1>
              <p className="m-0 max-w-[34em] text-[17px] leading-normal text-ink-2 md:text-[19px] md:leading-[1.55]">
                Timed mock exams for {data ? listPhrase(data.categories.map((c) => c.name).slice(0, 3)) : 'recruitment positions'} — with an explanation for
                every answer
                <span className="hidden md:inline"> and practice that targets your weak topics</span>.
              </p>
              <HeroSearch slug={slug} popular={data?.popularSearches ?? []} loading={landing.isLoading} />
              <p className="m-0 hidden items-center gap-2 text-[15px] text-ink-2 md:flex">
                <Check size={18} strokeWidth={2.4} className="text-correct" aria-hidden="true" />
                {user ? 'Free sample tests — start any time, no payment.' : 'Free sample tests — start without an account or payment.'}
              </p>
              <Link to={freeHref} className="flex items-center gap-2 text-[15px] font-semibold text-free no-underline hover:text-free md:hidden">
                <Check size={18} strokeWidth={2.4} aria-hidden="true" />
                {user ? 'Try a free sample test' : 'Try a free sample test — no account needed'}
              </Link>
            </div>
            <HeroPreview />
          </div>
        </section>

        {landing.isError ? (
          <div className="mx-auto max-w-[1200px] px-4 py-10 md:px-6">
            <QueryError error={landing.error} what="the mock tests" onRetry={() => void landing.refetch()} retrying={landing.isFetching} />
          </div>
        ) : !data ? (
          <div className="mx-auto max-w-[1200px] px-4 py-10 md:px-6">
            <SkeletonList count={3} label="Loading mock tests…" />
          </div>
        ) : (
          <>
            <Categories slug={slug} data={data} />
            <Featured slug={slug} data={data} />
            <HowAndRecent slug={slug} data={data} />
          </>
        )}
      </main>
    </div>
  );
}

function splitHeadline(h: string): [string, string | null] {
  const m = h.match(/^(.+?\.)\s+(.+)$/);
  return m ? [m[1]!, m[2]!] : [h, null];
}

function HeroSearch({ slug, popular, loading }: { slug: string; popular: string[]; loading: boolean }) {
  const t = useT();
  const [q, setQ] = useState('');
  const navigate = useNavigate();
  const go = (query: string) => navigate(`${countryPath(slug, 'tests')}${query.trim() ? `?q=${encodeURIComponent(query.trim())}` : ''}`);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    go(q);
  };
  const chips = popular.map((p) => (
    <Link
      key={p}
      to={`${countryPath(slug, 'tests')}?q=${encodeURIComponent(p)}`}
      className="flex-none whitespace-nowrap rounded-pill border border-border bg-surface px-3.5 py-2.5 text-sm text-ink-2 no-underline hover:bg-soft hover:text-ink md:bg-page md:px-3 md:py-1.5"
    >
      {p}
    </Link>
  ));
  return (
    <>
      <form
        role="search"
        onSubmit={submit}
        className="flex flex-col gap-2.5 rounded-card border border-border-strong bg-surface p-3.5 md:rounded-[20px] md:p-[18px] md:shadow-search"
      >
        <label htmlFor="hero-q" className="text-[15px] font-semibold md:text-base">
          {t('landing.searchPlaceholder')}
        </label>
        <div className="flex flex-col gap-2.5 md:flex-row md:flex-wrap">
          <input
            id="hero-q"
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="e.g. Secondary Mathematics teacher, Accountant"
            autoComplete="off"
            className="h-12 min-w-0 rounded-control border border-input-border bg-surface px-3.5 text-base text-ink placeholder:text-muted md:h-11 md:flex-[1_1_260px] md:px-4"
          />
          <button type="submit" className={buttonClasses({ variant: 'primary', size: 'lg', className: 'md:px-[22px]' })}>
            <Search size={18} strokeWidth={2.4} aria-hidden="true" />
            {t('landing.searchCta')}
          </button>
        </div>
        {/* Desktop: chips live inside the search card. */}
        <div className="hidden flex-wrap items-center gap-2 text-sm md:flex" aria-label="Popular searches" role="group">
          <span className="text-muted">Popular:</span>
          {loading ? <span aria-hidden="true" className="h-8 w-48 rounded-pill bg-soft" /> : chips}
        </div>
      </form>
      {/* Phone: chips scroll sideways under the card. */}
      <div role="group" aria-label="Popular searches" className="scrollbar-none -mx-4 flex gap-2 overflow-x-auto px-4 pb-0.5 md:hidden">
        {loading ? <span aria-hidden="true" className="h-11 w-full rounded-pill bg-soft" /> : chips}
      </div>
    </>
  );
}

function SectionHead({ id, title, sub, linkTo, linkText, phoneLinkText }: { id: string; title: React.ReactNode; sub?: string; linkTo: string; linkText: string; phoneLinkText?: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-3 md:items-end">
      <div className="flex flex-col gap-1.5">
        <h2 id={id} className="m-0 text-[17px] font-bold tracking-tight md:text-[22px]">
          {title}
        </h2>
        {sub && <p className="m-0 hidden text-base text-ink-2 md:block">{sub}</p>}
      </div>
      <Link to={linkTo} className={cx('link py-2 text-sm font-semibold no-underline md:text-[15px]', !phoneLinkText && 'max-md:hidden')}>
        <span className={phoneLinkText ? 'md:hidden' : 'hidden'}>{phoneLinkText}</span>
        <span className={phoneLinkText ? 'hidden md:inline' : ''}>{linkText}</span>
      </Link>
    </div>
  );
}

function Categories({ slug, data }: { slug: string; data: Landing }) {
  return (
    <section aria-labelledby="cats" className="mx-auto flex max-w-[1200px] flex-col gap-3.5 px-4 pb-2 pt-7 md:gap-6 md:px-6 md:pb-6 md:pt-16">
      <SectionHead id="cats" title="Browse by job category" linkTo={countryPath(slug, 'tests')} linkText="See all mock tests" />
      <div className="flex flex-col gap-3.5 md:grid md:grid-cols-[repeat(auto-fill,minmax(min(100%,340px),1fr))] md:gap-4">
        {data.categories.map((c) => {
          const featured = c.featured;
          return (
            <Link
              key={c.id}
              to={`${countryPath(slug, 'tests')}?category=${encodeURIComponent(c.slug)}`}
              className={cx(
                'flex items-center gap-3.5 rounded-[14px] p-3.5 text-ink no-underline hover:text-ink md:items-start md:gap-4 md:rounded-card md:p-5',
                featured ? 'border-2 border-brand bg-brand-softer p-[13px] md:p-[19px]' : 'border border-border bg-surface',
              )}
            >
              <span
                className={cx(
                  'inline-flex h-11 w-11 flex-none items-center justify-center rounded-control md:w-12',
                  featured ? 'bg-brand text-white' : 'bg-soft text-ink-2',
                )}
              >
                <CategoryIcon name={c.icon} />
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5 md:gap-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="text-base font-semibold md:text-lg">{c.name}</span>
                  {featured && (
                    <span className="hidden rounded-pill bg-brand px-2 py-[3px] text-xs font-semibold text-white md:inline">Most practised</span>
                  )}
                </span>
                {c.description && <span className="hidden text-[15px] leading-normal text-ink-2 md:block">{c.description}</span>}
                <span className="text-[13px] font-semibold text-muted md:mt-1 md:text-sm">
                  {plural(c.mockTestCount, 'mock test')}
                  {featured && <span className="md:hidden"> · most practised</span>}
                </span>
              </span>
              <ChevronRight size={18} strokeWidth={2.2} className="flex-none text-muted md:hidden" aria-hidden="true" />
            </Link>
          );
        })}
      </div>
    </section>
  );
}

export function TestTag({ isFree }: { isFree: boolean }) {
  return isFree ? <Badge tone="free">Free sample</Badge> : <Badge tone="fullAccess">Full Access</Badge>;
}

function Featured({ slug, data }: { slug: string; data: Landing }) {
  const cat = data.featuredCategory;
  if (!cat || data.featuredTests.length === 0) return null;
  const teaching = cat.slug === 'teaching-positions';
  return (
    <section aria-labelledby="feat" className="mx-auto flex max-w-[1200px] flex-col gap-3.5 px-0 pb-2 pt-6 md:gap-6 md:px-6 md:pb-6 md:pt-12">
      <div className="px-4 md:px-0">
        <SectionHead
          id="feat"
          title={
            teaching ? (
              <>
                <span className="md:hidden">Teacher mock tests</span>
                <span className="hidden md:inline">Teacher recruitment mock tests</span>
              </>
            ) : (
              `${cat.name} mock tests`
            )
          }
          sub={teaching ? 'Subject knowledge plus the teaching profession: pedagogy, CBC and classroom practice.' : undefined}
          linkTo={`${countryPath(slug, 'tests')}?category=${encodeURIComponent(cat.slug)}`}
          linkText={teaching ? 'All teaching tests' : `All ${cat.name.toLowerCase()} tests`}
          phoneLinkText="See all"
        />
      </div>
      <div className="scrollbar-none flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 md:grid md:grid-cols-[repeat(auto-fill,minmax(min(100%,260px),1fr))] md:gap-4 md:overflow-visible md:px-0 md:pb-0">
        {data.featuredTests.map((x) => (
          <FeaturedCard key={x.id} slug={slug} test={x} />
        ))}
      </div>
    </section>
  );
}

function FeaturedCard({ slug, test }: { slug: string; test: TestCard }) {
  return (
    <article className="flex w-[280px] flex-none snap-start flex-col gap-2.5 rounded-card border border-border bg-surface p-4 md:w-auto md:gap-3.5 md:p-5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[13px] font-semibold text-muted">{test.profession}</span>
        <TestTag isFree={test.isFree} />
      </div>
      <h3 className="m-0 text-[17px] leading-snug">{test.title}</h3>
      <div className="flex flex-wrap gap-x-3.5 gap-y-1.5 text-sm text-ink-2">
        <span>{plural(test.questionCount, 'question')}</span>
        <span>{test.durationMinutes} min</span>
        <span className="md:hidden">{languageListShort(test.languages)}</span>
        <span className="hidden md:inline">{languageList(test.languages)}</span>
      </div>
      <Link
        to={countryPath(slug, 'tests', test.slug)}
        aria-label={`View test: ${test.title}`}
        className={buttonClasses({ variant: 'secondary', size: 'sm', className: 'mt-auto py-3 md:mt-auto' })}
      >
        View test
      </Link>
    </article>
  );
}

function HowAndRecent({ slug, data }: { slug: string; data: Landing }) {
  return (
    <section className="mx-auto flex max-w-[1200px] flex-wrap gap-8 px-4 pb-2 pt-6 md:px-6 md:pb-[72px] md:pt-12">
      <div aria-labelledby="how" role="region" className="flex min-w-0 flex-[1_1_520px] flex-col gap-3 md:gap-5">
        <h2 id="how" className="m-0 text-[17px] font-bold tracking-tight md:text-[22px]">
          How JobPrep works
        </h2>
        <ol className="m-0 flex list-none flex-col gap-2.5 p-0 md:grid md:grid-cols-[repeat(auto-fill,minmax(min(100%,230px),1fr))] md:gap-3.5">
          {STEPS.map((s, i) => (
            <li key={s.title} className="flex items-start gap-3 md:flex-col md:gap-2 md:rounded-card md:border md:border-border md:p-[18px]">
              <span className="inline-flex h-[30px] w-[30px] flex-none items-center justify-center rounded-full bg-brand-soft text-sm font-semibold text-brand md:h-8 md:w-8 md:text-base">
                {i + 1}
              </span>
              <span className="flex flex-col gap-0.5 md:gap-2">
                <span className="text-base font-semibold md:text-[17px]">{s.title}</span>
                <span className="text-[15px] leading-normal text-ink-2">{s.body}</span>
              </span>
            </li>
          ))}
        </ol>
      </div>
      <div aria-labelledby="recent" role="region" className="flex min-w-0 flex-[1_1_380px] flex-col gap-3 md:gap-5">
        <h2 id="recent" className="m-0 text-[17px] font-bold tracking-tight md:text-[22px]">
          Recently added
        </h2>
        <ul className="m-0 list-none overflow-hidden rounded-[14px] border border-border p-0 md:rounded-card">
          {data.recentlyAdded.map((r) => (
            <li key={r.id} className="border-b border-border last:border-b-0">
              <Link
                to={countryPath(slug, 'tests', r.slug)}
                className="flex items-center justify-between gap-3 p-3.5 text-ink no-underline hover:bg-page hover:text-ink md:px-[18px] md:py-4"
              >
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-[15px] font-semibold md:text-base">{r.title}</span>
                  <span className="text-[13px] text-muted md:text-sm">
                    {r.category.name}
                    <span className="hidden md:inline"> · {plural(r.questionCount, 'question')}</span>
                    <span className="md:hidden"> · {formatDate(r.publishedAt)}</span>
                  </span>
                </span>
                <span className="hidden flex-none text-[13px] text-muted md:block">{formatDate(r.publishedAt)}</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
