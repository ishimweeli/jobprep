import { randomUUID } from 'node:crypto';
import {
  jsonCall, ProviderError, requireTokenSecret, sha256, toMajor,
  type CallbackRequest, type FetchLike, type ParsedCallback, type PaymentProvider, type ProviderStatus,
  type RequestToPayInput, type StatusResult,
} from './types';

export interface PawaPayConfig {
  /** https://api.pawapay.io (live) or https://api.sandbox.pawapay.io */
  baseUrl: string;
  apiToken: string;
  /** pawaPay does not sign callbacks, so the secret in the callback URL (`?token=`) is the only authentication. */
  callbackSecret: string;
}

/**
 * Payer said no, or cannot pay: final, shown as "declined". Matched on pawaPay's `failureCode`.
 * PAYMENT_NOT_APPROVED is pawaPay's generic "the payer did not approve"; a timeout is told apart by its message (below).
 * These names come from pawaPay's v2 documentation as remembered by the owner's other integration; they have never been
 * checked against live traffic. Any code not listed here maps to FAILED, which is also final and never charges the payer.
 */
const DECLINED_CODES = new Set(['PAYMENT_NOT_APPROVED', 'INSUFFICIENT_BALANCE', 'WRONG_PIN', 'INVALID_PIN', 'PAYER_REJECTED']);
/** Payer never answered in time: EXPIRED, which (unlike declined) still honours a late approval. */
const TIMEOUT_CODES = new Set(['PAYMENT_TIMEOUT', 'TIMEOUT', 'EXPIRED', 'APPROVAL_TIMEOUT', 'PAYER_TIMEOUT']);
const TIMEOUT_TEXT = /time(d)?[\s_-]*out|expired/i;

export interface PawaPayFailure { failureCode?: string; failureMessage?: string }

/** pawaPay deposit status → ours. Unknown or in-flight statuses keep waiting; the payment expires on its own. */
export function mapPawaPayStatus(status: string | undefined, failure?: PawaPayFailure): ProviderStatus {
  switch ((status ?? '').toUpperCase()) {
    case 'COMPLETED': return 'SUCCESSFUL';
    case 'FAILED': {
      const code = (failure?.failureCode ?? '').toUpperCase();
      // A "not approved" worded as a timeout is the payer not answering, not a refusal.
      if (TIMEOUT_CODES.has(code) || TIMEOUT_TEXT.test(`${code} ${failure?.failureMessage ?? ''}`)) return 'EXPIRED';
      return DECLINED_CODES.has(code) ? 'DECLINED' : 'FAILED';
    }
    // ACCEPTED, PROCESSING, IN_RECONCILIATION (pawaPay is still working it out), DUPLICATE_IGNORED (the original goes on)
    default: return 'PENDING';
  }
}

interface DepositBody {
  depositId?: string;
  status?: string;
  failureReason?: PawaPayFailure;
  providerTransactionId?: string;
}

/** The callback body is the deposit itself; tolerate it arriving in the same `{status:'FOUND', data}` envelope as a lookup. */
const unwrap = (b: DepositBody & { data?: DepositBody }): DepositBody => (b.data && typeof b.data === 'object' ? b.data : b);

const reasonOf = (f?: PawaPayFailure) => f?.failureCode || undefined;

/**
 * pawaPay v2 (mobile-money aggregator). One adapter serves every payment method: the operator is worked out from the
 * phone number (predict-provider), so the payer's choice of MTN / Airtel / M-Pesa in the checkout does not matter.
 * Not exercised against the live or sandbox API yet. Never sends a PIN; never logs the token.
 */
export class PawaPayProvider implements PaymentProvider {
  readonly code = 'PAWAPAY' as const;
  readonly aggregator = true;
  /** A callback carries only a shared secret, so a success is confirmed with a status lookup before access is granted. */
  readonly confirmSuccessByStatus = true;

  constructor(private readonly cfg: PawaPayConfig, private readonly fetchFn: FetchLike = fetch as unknown as FetchLike) {}

  private url(path: string) {
    return `${this.cfg.baseUrl.replace(/\/$/, '')}${path}`;
  }

  private headers() {
    return { Authorization: `Bearer ${this.cfg.apiToken}`, 'Content-Type': 'application/json', Accept: 'application/json' };
  }

  async requestToPay(i: RequestToPayInput) {
    const digits = i.msisdn.replace(/\D/g, '');
    const predicted = await jsonCall<{ provider?: string; country?: string; phoneNumber?: string }>(this.fetchFn, this.url('/v2/predict-provider'), {
      method: 'POST', headers: this.headers(), body: JSON.stringify({ phoneNumber: digits }),
    });
    const provider = predicted.data.provider;
    if (!provider) throw new ProviderError('provider_not_predicted');

    const depositId = randomUUID(); // pawaPay requires a UUID; it is also what we poll with and match callbacks by
    // The callback URL is not sent: pawaPay takes deposit callbacks from the dashboard setting (which must include ?token=).
    const { data } = await jsonCall<{ status?: string; failureReason?: PawaPayFailure }>(this.fetchFn, this.url('/v2/deposits'), {
      method: 'POST', headers: this.headers(),
      body: JSON.stringify({
        depositId,
        amount: String(toMajor(i.amountMinor, i.currencyExponent)),
        currency: i.currencyCode,
        payer: { type: 'MMO', accountDetails: { phoneNumber: predicted.data.phoneNumber?.replace(/\D/g, '') || digits, provider } },
      }),
    });
    const status = (data.status ?? '').toUpperCase();
    // DUPLICATE_IGNORED can only mean this id already exists, so the prompt is on its way: carry on with it.
    if (status !== 'ACCEPTED' && status !== 'DUPLICATE_IGNORED') {
      throw new ProviderError(`deposit_${status.toLowerCase() || 'unknown'}${data.failureReason?.failureCode ? `:${data.failureReason.failureCode}` : ''}`);
    }
    return { providerReference: depositId };
  }

  async getStatus(providerReference: string): Promise<StatusResult> {
    const { status: http, data } = await jsonCall<{ status?: string; data?: DepositBody }>(
      this.fetchFn, this.url(`/v2/deposits/${encodeURIComponent(providerReference)}`), { method: 'GET', headers: this.headers() },
    );
    if (http === 404 || data.status === 'NOT_FOUND' || !data.data) return { status: 'PENDING', reason: 'not_found' }; // not visible (yet): keep waiting
    const d = data.data;
    return { status: mapPawaPayStatus(d.status, d.failureReason), reason: reasonOf(d.failureReason), transactionId: d.providerTransactionId };
  }

  parseCallback(req: CallbackRequest): ParsedCallback {
    requireTokenSecret(this.cfg.callbackSecret, req.query);
    const d = unwrap(JSON.parse(req.rawBody) as DepositBody);
    if (!d.depositId || typeof d.depositId !== 'string') throw new SyntaxError('missing depositId');
    return {
      providerReference: d.depositId, status: mapPawaPayStatus(d.status, d.failureReason), reason: reasonOf(d.failureReason),
      transactionId: d.providerTransactionId, eventId: `pawapay:${sha256(req.rawBody)}`,
    };
  }
}
