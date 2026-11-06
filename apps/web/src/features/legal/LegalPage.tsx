import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { getLegalPage, legalKeys } from '../../api/legal';
import { QueryError, Loader } from '../../components/states';
import { formatDate } from '../../lib/format';
import { useDocumentTitle } from '../../lib/useDocumentTitle';
import { useActiveCountrySlug } from '../country/hooks';
import { NotFoundPage } from '../system/SystemPage';
import { InfoPage, PlaceholderBox } from './InfoPage';
import { isLegalSlug, lastUpdatedLine, LEGAL_LINK_LABEL, PLACEHOLDER_NOTE, tocFor } from './legalModel';

/**
 * Terms of use, Privacy policy, Refund policy and Cookie notice (C25): `/terms`, `/privacy`, `/refund`, `/cookies`.
 * The text, title and date come from `GET /api/legal/:page?country=` (the country's own text when an admin entered one).
 * While the API says `placeholder`, an amber note says so on top: placeholder text must read as a placeholder.
 */
export function LegalPage({ slug: forced }: { slug?: string }) {
  const params = useParams();
  const raw = forced ?? params.page ?? '';
  return isLegalSlug(raw) ? <LegalBody slug={raw} /> : <NotFoundPage />;
}

function LegalBody({ slug }: { slug: 'terms' | 'privacy' | 'refund' | 'cookies' }) {
  const country = useActiveCountrySlug();
  const q = useQuery({ queryKey: legalKeys.page(slug, country), queryFn: () => getLegalPage(slug, country), staleTime: 5 * 60_000, retry: false });
  useDocumentTitle(q.data?.title ?? LEGAL_LINK_LABEL[slug], `${q.data?.title ?? LEGAL_LINK_LABEL[slug]} for JobPrep, the independent recruitment exam practice platform.`);
  const d = q.data;

  if (q.isError) {
    return (
      <InfoPage title={LEGAL_LINK_LABEL[slug]} toc={[]}>
        <QueryError error={q.error} what={`the ${LEGAL_LINK_LABEL[slug].toLowerCase()}`} onRetry={() => void q.refetch()} retrying={q.isFetching} />
      </InfoPage>
    );
  }
  if (!d) {
    return (
      <InfoPage title={LEGAL_LINK_LABEL[slug]} toc={[]}>
        <Loader label="Loading…" />
      </InfoPage>
    );
  }
  const toc = tocFor(d.sections);
  return (
    <InfoPage
      title={d.title}
      updated={lastUpdatedLine(d.lastUpdated, (iso) => formatDate(iso, true))}
      notice={d.placeholder ? <PlaceholderBox>{PLACEHOLDER_NOTE}</PlaceholderBox> : null}
      toc={toc}
      footer={d.country?.disclaimer ? <p className="m-0 text-sm text-muted">{d.country.disclaimer}</p> : null}
    >
      {d.intro && <p className="m-0 text-base leading-[1.65] text-ink-2 md:text-[17px]">{d.intro}</p>}
      {d.sections.map((s, i) => (
        <section key={s.id || i} id={toc[i]!.id} aria-labelledby={`${toc[i]!.id}-h`} className="flex scroll-mt-6 flex-col gap-2">
          <h2 id={`${toc[i]!.id}-h`} className="m-0 text-[19px]">
            {s.heading}
          </h2>
          {s.paragraphs.map((p, j) => (
            <p key={j} className="m-0 text-base leading-[1.65] text-ink">
              {p}
            </p>
          ))}
        </section>
      ))}
    </InfoPage>
  );
}
