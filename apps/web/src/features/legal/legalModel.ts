import type { LegalSlug, SupportContact } from '../../api/types';

/** Legal and help page rules (C25 / C36; not drawn, built to the page template of MISSING_DESIGNS C25). Pure, unit-tested. */

export const LEGAL_SLUGS: LegalSlug[] = ['terms', 'privacy', 'refund', 'cookies'];

export const isLegalSlug = (s: string | undefined): s is LegalSlug => !!s && (LEGAL_SLUGS as string[]).includes(s);

/** The short names used in links. The page's own title comes from the API. */
export const LEGAL_LINK_LABEL: Record<LegalSlug, string> = { terms: 'Terms of use', privacy: 'Privacy policy', refund: 'Refund policy', cookies: 'Cookie notice' };

/** Shown while the API says the text is a placeholder: it must read as one, never as real legal text. */
export const PLACEHOLDER_NOTE = 'Placeholder text, pending legal review. This is not the final text and should not be relied on.';

export const SUPPORT_PLACEHOLDER_NOTE = 'These are placeholder contact details, not real ones. Real details will appear here once they are set.';
export const SUPPORT_MISSING_NOTE = 'Support contact details for this country are not available yet.';

/** "Last updated 3 Nov 2026", or `null` when the API sent no date. */
export function lastUpdatedLine(iso: string | null | undefined, formatDate: (iso: string) => string): string | null {
  return iso ? `Last updated ${formatDate(iso)}` : null;
}

export interface TocItem {
  id: string;
  heading: string;
}

/** The table of contents (desktop): one entry per section, ids made safe to use as anchors. */
export function tocFor(sections: { id: string; heading: string }[]): TocItem[] {
  return sections.map((s, i) => ({ id: anchorId(s.id, i), heading: s.heading }));
}

export const anchorId = (id: string, index: number): string => `s-${(id || String(index + 1)).toLowerCase().replace(/[^a-z0-9_-]+/g, '-')}`;

export interface SupportRow {
  kind: 'phone' | 'whatsapp' | 'email';
  label: string;
  value: string;
  href: string;
}

const digits = (s: string) => s.replace(/[^\d]/g, '');

/** The contact rows to draw: only the ones the country has, each with a tappable link. */
export function supportRows(c: Pick<SupportContact, 'phone' | 'whatsapp' | 'email' | 'people'> | null | undefined): SupportRow[] {
  const rows: SupportRow[] = (c?.people ?? []).map((p) => ({ kind: 'phone', label: p.name, value: p.phone, href: `tel:${p.phone.replace(/[^\d+]/g, '')}` }));
  if (c?.phone) rows.push({ kind: 'phone', label: 'Phone', value: c.phone, href: `tel:${c.phone.replace(/[^\d+]/g, '')}` });
  if (c?.whatsapp) rows.push({ kind: 'whatsapp', label: 'WhatsApp', value: c.whatsapp, href: `https://wa.me/${digits(c.whatsapp)}` });
  if (c?.email) rows.push({ kind: 'email', label: 'Email', value: c.email, href: `mailto:${c.email}` });
  return rows;
}

/** What the Help page says about the contact block: real, placeholder, or not set. */
export function supportState(c: SupportContact | null | undefined): 'ready' | 'placeholder' | 'missing' {
  if (!c || !c.configured || supportRows(c).length === 0) return 'missing';
  return c.placeholder ? 'placeholder' : 'ready';
}

/** Help topics (links inside the app), in the order shown. Each is a plain link: no text of its own is invented. */
export const HELP_TOPICS: { id: string; heading: string; body: string; to: (slug: string) => string; link: string }[] = [
  { id: 'payments', heading: 'Payments and Full Access', body: 'See what you paid, download a receipt, or check a payment that is still waiting.', to: () => '/account/payments', link: 'Payment history' },
  { id: 'pricing', heading: 'Prices and what Full Access covers', body: 'One price unlocks every mock test in your country for a set time. No auto-renew.', to: (s) => `/${s}/pricing`, link: 'See pricing' },
  { id: 'refunds', heading: 'Refunds', body: 'Read when a payment can be refunded.', to: () => '/refund', link: 'Refund policy' },
  { id: 'privacy', heading: 'Your data', body: 'Read how your details and results are used.', to: () => '/privacy', link: 'Privacy policy' },
];
