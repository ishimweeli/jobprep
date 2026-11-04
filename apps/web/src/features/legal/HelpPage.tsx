import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { getSupport, supportKeys } from '../../api/countries';
import { QueryError, SkeletonList } from '../../components/states';
import { useDocumentTitle } from '../../lib/useDocumentTitle';
import { useActiveCountrySlug, useCountries } from '../country/hooks';
import { InfoPage, PlaceholderBox } from './InfoPage';
import { HELP_TOPICS, SUPPORT_MISSING_NOTE, SUPPORT_PLACEHOLDER_NOTE, supportRows, supportState } from './legalModel';

/**
 * Help and support (C25 / C36): `/help`. The contact block (phone, WhatsApp, email, hours) comes from the API for the
 * active country (`GET /countries/:code/support`); a placeholder reads as a placeholder and a country with nothing set says so.
 * The topics below it are plain links to screens that already exist.
 */
export function HelpPage() {
  useDocumentTitle('Help and support');
  const slug = useActiveCountrySlug();
  const countries = useCountries();
  const code = (countries.data?.find((c) => c.slug === slug)?.code ?? slug).toUpperCase();
  const q = useQuery({ queryKey: supportKeys.country(code), queryFn: () => getSupport(code), staleTime: 5 * 60_000, retry: false });
  const contact = q.data;
  const state = supportState(contact);
  const rows = supportRows(contact);
  const toc = [
    { id: 'contact', heading: 'Contact us' },
    ...HELP_TOPICS.map((t) => ({ id: t.id, heading: t.heading })),
  ];

  return (
    <InfoPage title="Help and support" toc={toc}>
      <section id="contact" aria-labelledby="contact-h" className="flex scroll-mt-6 flex-col gap-3 rounded-card border border-border bg-surface p-4 md:p-5">
        <h2 id="contact-h" className="m-0 text-[19px]">
          Contact us
        </h2>
        {q.isError ? (
          <QueryError error={q.error} what="the support contact" onRetry={() => void q.refetch()} retrying={q.isFetching} />
        ) : !contact ? (
          <SkeletonList count={1} label="Loading…" />
        ) : state === 'missing' ? (
          <p className="m-0 text-base leading-normal text-ink-2">{SUPPORT_MISSING_NOTE}</p>
        ) : (
          <>
            {state === 'placeholder' && <PlaceholderBox>{SUPPORT_PLACEHOLDER_NOTE}</PlaceholderBox>}
            <ul className="m-0 flex list-none flex-col p-0">
              {rows.map((r) => (
                <li key={r.kind} className="flex min-h-[48px] flex-wrap items-center justify-between gap-x-3 border-b border-soft py-2 last:border-b-0">
                  <span className="text-muted">{r.label}</span>
                  <a href={r.href} className="link inline-flex min-h-[44px] items-center break-all font-semibold" {...(r.kind === 'whatsapp' ? { target: '_blank', rel: 'noreferrer' } : {})}>
                    {r.value}
                  </a>
                </li>
              ))}
            </ul>
            {contact.hours && <p className="m-0 text-[15px] text-ink-2">{contact.hours}</p>}
          </>
        )}
      </section>
      {HELP_TOPICS.map((t) => (
        <section key={t.id} id={t.id} aria-labelledby={`${t.id}-h`} className="flex scroll-mt-6 flex-col gap-1.5">
          <h2 id={`${t.id}-h`} className="m-0 text-[19px]">
            {t.heading}
          </h2>
          <p className="m-0 text-base leading-[1.6] text-ink-2">{t.body}</p>
          <Link to={t.to(slug)} className="link self-start py-2 text-[15px] font-semibold">
            {t.link}
          </Link>
        </section>
      ))}
    </InfoPage>
  );
}
