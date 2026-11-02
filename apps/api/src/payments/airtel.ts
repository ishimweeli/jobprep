import {
  jsonCall, requireTokenSecret, sha256, toMajor,
  type CallbackRequest, type FetchLike, type ParsedCallback, type PaymentProvider, type ProviderStatus,
  type RequestToPayInput, type StatusResult,
} from './types';

export interface AirtelConfig {
  baseUrl: string;
  clientId: string;
  clientSecret: string;
  callbackSecret: string;
}

/** Airtel status codes: TS success, TF failed, TE expired, TIP in progress, TA ambiguous (treated as still pending). */
export function mapAirtelStatus(code: string | undefined, message?: string): ProviderStatus {
  switch ((code ?? '').toUpperCase()) {
    case 'TS': return 'SUCCESSFUL';
    case 'TE': return 'EXPIRED';
    case 'TF': return /reject|declin|cancel/i.test(message ?? '') ? 'DECLINED' : 'FAILED';
    default: return 'PENDING';
  }
}

const countryOf = (msisdn: string, dial: Record<string, string>) =>
  Object.entries(dial).find(([, d]) => msisdn.startsWith(d))?.[0] ?? 'RW';
const DIAL: Record<string, string> = { RW: '+250', KE: '+254', UG: '+256', TZ: '+255' };

/** Airtel Money Collections. Not exercised against the live sandbox without client credentials. */
export class AirtelMoneyProvider implements PaymentProvider {
  readonly code = 'AIRTEL_MONEY' as const;
  private token: { value: string; exp: number } | null = null;

  constructor(private readonly cfg: AirtelConfig, private readonly fetchFn: FetchLike = fetch as unknown as FetchLike) {}

  private async auth() {
    if (this.token && this.token.exp > Date.now() + 30_000) return this.token.value;
    const { data } = await jsonCall<{ access_token: string; expires_in: number }>(this.fetchFn, `${this.cfg.baseUrl}/auth/oauth2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: '*/*' },
      body: JSON.stringify({ client_id: this.cfg.clientId, client_secret: this.cfg.clientSecret, grant_type: 'client_credentials' }),
    });
    this.token = { value: data.access_token, exp: Date.now() + data.expires_in * 1000 };
    return data.access_token;
  }

  async requestToPay(i: RequestToPayInput) {
    const token = await this.auth();
    const country = countryOf(i.msisdn, DIAL);
    const national = i.msisdn.replace(DIAL[country]!, '');
    await jsonCall(this.fetchFn, `${this.cfg.baseUrl}/merchant/v2/payments/`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'X-Country': country, 'X-Currency': i.currencyCode },
      body: JSON.stringify({
        reference: i.description,
        subscriber: { country, currency: i.currencyCode, msisdn: national },
        transaction: { amount: toMajor(i.amountMinor, i.currencyExponent), country, currency: i.currencyCode, id: i.paymentId },
      }),
    });
    return { providerReference: i.paymentId }; // Airtel keys the transaction by the id we send
  }

  async getStatus(providerReference: string): Promise<StatusResult> {
    const token = await this.auth();
    const { data } = await jsonCall<{ data?: { transaction?: { status?: string; message?: string; airtel_money_id?: string } } }>(
      this.fetchFn, `${this.cfg.baseUrl}/standard/v1/payments/${providerReference}`, {
        method: 'GET', headers: { Authorization: `Bearer ${token}`, 'X-Country': 'RW', 'X-Currency': 'RWF' },
      },
    );
    const t = data.data?.transaction;
    return { status: mapAirtelStatus(t?.status, t?.message), reason: t?.message, transactionId: t?.airtel_money_id };
  }

  parseCallback(req: CallbackRequest): ParsedCallback {
    requireTokenSecret(this.cfg.callbackSecret, req.query);
    const b = JSON.parse(req.rawBody) as { transaction?: { id?: string; status_code?: string; message?: string; airtel_money_id?: string } };
    return {
      paymentId: b.transaction?.id, status: mapAirtelStatus(b.transaction?.status_code, b.transaction?.message),
      reason: b.transaction?.message, transactionId: b.transaction?.airtel_money_id, eventId: `airtel:${sha256(req.rawBody)}`,
    };
  }
}
