import { api, buildUrl } from './client';
import type { AuditEntry, AuditQuery, CountryDetail, CountryStatus, SupportContact } from './types';

/** Endpoints added for the audit log screen and the country actions (docs/API_ADDITIONS.md: Audit log, Countries). */

export interface AuditFilters { actions: string[]; entityTypes: string[]; actors: { id: string; name: string }[] }
export const getAuditFilters = () => api<AuditFilters>('/audit/filters');

export interface AuditEntryDetail extends Omit<AuditEntry, 'actor'> {
  actor: { id: string; name: string; email?: string } | null;
  metadata: Record<string, unknown>;
}
export const getAuditEntry = (id: string) => api<{ entry: AuditEntryDetail }>(`/audit/${encodeURIComponent(id)}`).then((r) => r.entry);

export type AuditListQuery = AuditQuery & { q?: string };
/** The export takes the list's filters without paging. */
export const auditExportUrl = (q: AuditListQuery) => {
  const { page: _p, pageSize: _s, ...rest } = q;
  return buildUrl('/audit/export', { ...rest });
};

export interface StatusImpact {
  from: CountryStatus; to: CountryStatus; users: number; activeAccessGrants: number; attemptsInProgress: number; publishedTests: number;
  checklist: { key: string; label: string; ok: boolean; detail?: string }[]; readyToLaunch: boolean;
}
export const getStatusImpact = (code: string, to: CountryStatus) =>
  api<StatusImpact>(`/countries/${encodeURIComponent(code)}/status-impact`, { query: { to } });

/** The extra fields `GET /countries/:code` now carries per payment method (never a secret). */
export interface ProviderStatus {
  adapter: 'pawapay' | 'direct' | 'fake'; credentialsConfigured: boolean; callbackUrl: string; lastPaymentAt: string | null; lastSuccessAt: string | null;
}

/** `GET /countries/:code` with what the missing-designs pass added (provider status per method, support contact, legal review). */
export type CountryDetailX = Omit<CountryDetail, 'paymentMethods'> & {
  paymentMethods: (CountryDetail['paymentMethods'][number] & { providerStatus?: ProviderStatus })[];
  supportContact?: SupportContact | null;
  legal?: { reviewed: boolean; pages: { slug: string; overridden: boolean }[] };
};
