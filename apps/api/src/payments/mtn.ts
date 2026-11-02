import { randomUUID } from 'node:crypto';
import {
  jsonCall, requireTokenSecret, sha256, toMajor,
  type CallbackRequest, type FetchLike, type ParsedCallback, type PaymentProvider, type ProviderStatus,
  type RequestToPayInput, type StatusResult,
} from './types';

export interface MtnConfig {
  baseUrl: string;
  subscriptionKey: string;
  apiUser: string;
  apiKey: string;
  /** "sandbox" or the live target environment name (e.g. "mtnrwanda"). */
  targetEnvironment: string;
  callbackSecret: string;
}

const REJECTED = new Set(['APPROVAL_REJECTED', 'PAYER_REJECTED', 'REJECTED']);
const TIMED_OUT = new Set(['EXPIRED', 'APPROVAL_TIMEOUT', 'TIMEOUT']);

export function mapMtnStatus(status: string | undefined, reason?: string): ProviderStatus {
  switch ((status ?? '').toUpperCase()) {
    case 'SUCCESSFUL': return 'SUCCESSFUL';
    case 'PENDING': return 'PENDING';
    case 'FAILED':
    case 'REJECTED':
    case 'TIMEOUT': {
      const r = (reason ?? status ?? '').toUpperCase();
      if (REJECTED.has(r)) return 'DECLINED';
      if (TIMED_OUT.has(r)) return 'EXPIRED';
      return 'FAILED';
    }
    default: return 'PENDING'; // unknown → keep waiting; the payment expires on its own if nothing arrives
  }
}

/** MTN MoMo Collections API (request-to-pay). Not exercised against the live sandbox without developer keys. */
export class MtnMomoProvider implements PaymentProvider {
  readonly code = 'MTN_MOMO' as const;
  private token: { value: string; exp: number } | null = null;

  constructor(private readonly cfg: MtnConfig, private readonly fetchFn: FetchLike = fetch as unknown as FetchLike) {}

  private async auth() {
    if (this.token && this.token.exp > Date.now() + 30_000) return this.token.value;
    const basic = Buffer.from(`${this.cfg.apiUser}:${this.cfg.apiKey}`).toString('base64');
    const { data } = await jsonCall<{ access_token: string; expires_in: number }>(this.fetchFn, `${this.cfg.baseUrl}/collection/token/`, {
      method: 'POST',
      headers: { Authorization: `Basic ${basic}`, 'Ocp-Apim-Subscription-Key': this.cfg.subscriptionKey },
    });
    this.token = { value: data.access_token, exp: Date.now() + data.expires_in * 1000 };
    return data.access_token;
  }

  private headers(token: string, extra: Record<string, string> = {}) {
    return {
      Authorization: `Bearer ${token}`,
      'X-Target-Environment': this.cfg.targetEnvironment,
      'Ocp-Apim-Subscription-Key': this.cfg.subscriptionKey,
      'Content-Type': 'application/json',
      ...extra,
    };
  }

  async requestToPay(i: RequestToPayInput) {
    const token = await this.auth();
    const referenceId = randomUUID(); // X-Reference-Id: also what we poll with
    await jsonCall(this.fetchFn, `${this.cfg.baseUrl}/collection/v1_0/requesttopay`, {
      method: 'POST',
      headers: this.headers(token, { 'X-Reference-Id': referenceId, 'X-Callback-Url': i.callbackUrl }),
      body: JSON.stringify({
        amount: String(toMajor(i.amountMinor, i.currencyExponent)),
        currency: i.currencyCode,
        externalId: i.paymentId,
        payer: { partyIdType: 'MSISDN', partyId: i.msisdn.replace(/^\+/, '') },
        payerMessage: i.description,
        payeeNote: i.description,
      }),
    });
    return { providerReference: referenceId };
  }

  async getStatus(providerReference: string): Promise<StatusResult> {
    const token = await this.auth();
    const { data } = await jsonCall<{ status?: string; reason?: string | { code?: string }; financialTransactionId?: string }>(
      this.fetchFn, `${this.cfg.baseUrl}/collection/v1_0/requesttopay/${providerReference}`, { method: 'GET', headers: this.headers(token) },
    );
    const reason = typeof data.reason === 'string' ? data.reason : data.reason?.code;
    return { status: mapMtnStatus(data.status, reason), reason, transactionId: data.financialTransactionId };
  }

  parseCallback(req: CallbackRequest): ParsedCallback {
    requireTokenSecret(this.cfg.callbackSecret, req.query);
    const b = JSON.parse(req.rawBody) as { externalId?: string; status?: string; reason?: string | { code?: string }; financialTransactionId?: string };
    const reason = typeof b.reason === 'string' ? b.reason : b.reason?.code;
    return {
      paymentId: b.externalId, status: mapMtnStatus(b.status, reason), reason, transactionId: b.financialTransactionId,
      eventId: `mtn:${sha256(req.rawBody)}`,
    };
  }
}
