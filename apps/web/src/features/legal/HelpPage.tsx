import { useQuery } from '@tanstack/react-query';
import { ChevronRight, Clock, CreditCard, Info, Mail, MessageCircle, Phone, Receipt, RotateCcw, ShieldCheck, type LucideIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import { getSupport, supportKeys } from '../../api/countries';
import { QueryError, Loader } from '../../components/states';
import { useDocumentTitle } from '../../lib/useDocumentTitle';
import { useActiveCountrySlug, useCountries } from '../country/hooks';
import { InfoPage } from './InfoPage';
import { HELP_TOPICS, SUPPORT_MISSING_NOTE, SUPPORT_PLACEHOLDER_NOTE, supportRows, supportState, type SupportRow } from './legalModel';

const CHANNEL_ICON: Record<SupportRow['kind'], LucideIcon> = { phone: Phone, whatsapp: MessageCircle, email: Mail };
const TOPIC_ICON: Record<string, LucideIcon> = { payments: Receipt, pricing: CreditCard, refunds: RotateCcw, privacy: ShieldCheck };

const iconBox = 'flex h-10 w-10 flex-none items-center justify-center rounded-control bg-brand-soft text-brand';
const panel = 'relative flex min-w-0 rounded-card border border-border bg-surface transition-colors hover:border-brand';

/**
 * Help and support (C25 / C36): `/help`. The contact block (phone, WhatsApp, email, hours) comes from the API for the
 * active country (`GET /countries/:code/support`); a placeholder reads as a placeholder and a country with nothing set says so.
 * The topics below it are plain links to screens that already exist.
 */
export function HelpPage() {
  useDocumentTitle('Help and support', 'Get help with JobPrep mock tests, your account and payments. Contact the support team.');
  const slug = useActiveCountrySlug();
  const countries = useCountries();
  const code = (countries.data?.find((c) => c.slug === slug)?.code ?? slug).toUpperCase();
  const q = useQuery({ queryKey: supportKeys.country(code), queryFn: () => getSupport(code), staleTime: 5 * 60_000, retry: false });
  const contact = q.data;
  const state = supportState(contact);
  const rows = supportRows(contact);

  return (
    <InfoPage
      title="Help and support"
      toc={[]}
      wide
      notice={<p className="m-0 text-base leading-normal text-ink-2 md:text-[17px]">Contact the support team, or go straight to your payments and policies.</p>}
    >
      <section id="contact" aria-labelledby="contact-h" className="mt-2 flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
          <h2 id="contact-h" className="m-0 text-lg font-bold text-heading md:text-xl">
            Contact us
          </h2>
          {state !== 'missing' && contact?.hours && (
            <p className="m-0 inline-flex items-center gap-1.5 text-sm text-ink-2">
              <Clock size={15} strokeWidth={2} aria-hidden="true" className="flex-none text-muted" />
              <span>{contact.hours}</span>
            </p>
          )}
        </div>
        {q.isError ? (
          <QueryError error={q.error} what="the support contact" onRetry={() => void q.refetch()} retrying={q.isFetching} />
        ) : !contact ? (
          <Loader label="Loading…" />
        ) : state === 'missing' ? (
          <p className="m-0 rounded-card border border-border bg-surface p-5 text-base leading-normal text-ink-2">{SUPPORT_MISSING_NOTE}</p>
        ) : (
          <>
            <ul className="m-0 flex list-none flex-wrap gap-3 p-0">
              {rows.map((r) => {
                const Icon = CHANNEL_ICON[r.kind];
                return (
                  <li key={r.kind} className={`${panel} flex-[1_1_240px] items-center gap-3.5 p-4`}>
                    <span className={iconBox}>
                      <Icon size={20} strokeWidth={2} aria-hidden="true" />
                    </span>
                    <span className="flex min-w-0 flex-col">
                      <span className="text-[13px] font-medium text-muted">{r.label}</span>
                      <a
                        href={r.href}
                        className="break-words text-[15px] font-semibold text-heading no-underline after:absolute after:inset-0 after:rounded-[inherit] after:content-[''] hover:text-brand"
                        {...(r.kind === 'whatsapp' ? { target: '_blank', rel: 'noreferrer' } : {})}
                      >
                        {r.value}
                      </a>
                    </span>
                  </li>
                );
              })}
            </ul>
            {state === 'placeholder' && (
              <p role="note" data-testid="placeholder-note" className="m-0 flex items-start gap-2 text-sm leading-snug text-flagged-ink">
                <Info size={16} strokeWidth={2} aria-hidden="true" className="mt-px flex-none" />
                <span>{SUPPORT_PLACEHOLDER_NOTE}</span>
              </p>
            )}
          </>
        )}
      </section>

      <section aria-labelledby="topics-h" className="mt-4 flex flex-col gap-3">
        <h2 id="topics-h" className="m-0 text-lg font-bold text-heading md:text-xl">
          Payments and policies
        </h2>
        <div className="grid gap-3 md:grid-cols-2">
          {HELP_TOPICS.map((t) => {
            const Icon = TOPIC_ICON[t.id] ?? Info;
            return (
              <section key={t.id} id={t.id} aria-labelledby={`${t.id}-h`} className={`${panel} gap-3.5 p-4 md:p-5`}>
                <span className={iconBox}>
                  <Icon size={20} strokeWidth={2} aria-hidden="true" />
                </span>
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <h3 id={`${t.id}-h`} className="m-0 text-base font-semibold leading-snug tracking-normal text-heading">
                    {t.heading}
                  </h3>
                  <p className="m-0 text-[15px] leading-normal text-ink-2">{t.body}</p>
                  <Link
                    to={t.to(slug)}
                    className="mt-1.5 inline-flex items-center gap-1 self-start text-[15px] font-semibold text-brand no-underline after:absolute after:inset-0 after:rounded-[inherit] after:content-[''] hover:text-brand"
                  >
                    {t.link}
                    <ChevronRight size={16} strokeWidth={2.2} aria-hidden="true" />
                  </Link>
                </div>
              </section>
            );
          })}
        </div>
      </section>
    </InfoPage>
  );
}
