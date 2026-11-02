import {
  jsonCall, requireTokenSecret, sha256, toMajor,
  type CallbackRequest, type FetchLike, type ParsedCallback, type PaymentProvider, type ProviderStatus,
  type RequestToPayInput, type StatusResult,
} from './types';

export interface MpesaConfig {
  baseUrl: string;
  consumerKey: string;
  consumerSecret: string;
  shortcode: string;
  passkey: string;
  callbackSecret: string;
}

/** Daraja result codes: 0 success, 1032 cancelled by payer, 1037 timed out, anything else a failure. */
export function mapMpesaResult(code: string | number | undefined): ProviderStatus {
  switch (String(code)) {
    case '0': return 'SUCCESSFUL';
    case '1032': return 'DECLINED';
    case '1037': return 'EXPIRED';
    case 'undefined': return 'PENDING';
    default: return 'FAILED';
  }
}

const timestamp = (d = new Date()) => d.toISOString().replace(/\D/g, '').slice(0, 14);

/** Safaricom M-Pesa (Daraja STK push) for Kenya. Not exercised against the live sandbox without keys. */
export class MpesaProvider implements PaymentProvider {
  readonly code = 'MPESA' as const;
  private token: { value: string; exp: number } | null = null;

  constructor(private readonly cfg: MpesaConfig, private readonly fetchFn: FetchLike = fetch as unknown as FetchLike) {}

  private async auth() {
    if (this.token && this.token.exp > Date.now() + 30_000) return this.token.value;
    const basic = Buffer.from(`${this.cfg.consumerKey}:${this.cfg.consumerSecret}`).toString('base64');
    const { data } = await jsonCall<{ access_token: string; expires_in: string }>(
      this.fetchFn, `${this.cfg.baseUrl}/oauth/v1/generate?grant_type=client_credentials`, { method: 'GET', headers: { Authorization: `Basic ${basic}` } },
    );
    this.token = { value: data.access_token, exp: Date.now() + Number(data.expires_in) * 1000 };
    return data.access_token;
  }

  private password(ts: string) {
    return Buffer.from(`${this.cfg.shortcode}${this.cfg.passkey}${ts}`).toString('base64');
  }

  async requestToPay(i: RequestToPayInput) {
    const token = await this.auth();
    const ts = timestamp();
    const { data } = await jsonCall<{ CheckoutRequestID?: string; ResponseCode?: string }>(this.fetchFn, `${this.cfg.baseUrl}/mpesa/stkpush/v1/processrequest`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        BusinessShortCode: this.cfg.shortcode,
        Password: this.password(ts),
        Timestamp: ts,
        TransactionType: 'CustomerPayBillOnline',
        Amount: Math.round(toMajor(i.amountMinor, i.currencyExponent)),
        PartyA: i.msisdn.replace(/^\+/, ''),
        PartyB: this.cfg.shortcode,
        PhoneNumber: i.msisdn.replace(/^\+/, ''),
        CallBackURL: i.callbackUrl,
        AccountReference: 'JobPrep',
        TransactionDesc: i.description.slice(0, 13),
      }),
    });
    if (!data.CheckoutRequestID || (data.ResponseCode && data.ResponseCode !== '0')) throw new Error('stk_push_rejected');
    return { providerReference: data.CheckoutRequestID };
  }

  async getStatus(providerReference: string): Promise<StatusResult> {
    const token = await this.auth();
    const ts = timestamp();
    const { data } = await jsonCall<{ ResultCode?: string; ResultDesc?: string; errorCode?: string }>(this.fetchFn, `${this.cfg.baseUrl}/mpesa/stkpushquery/v1/query`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ BusinessShortCode: this.cfg.shortcode, Password: this.password(ts), Timestamp: ts, CheckoutRequestID: providerReference }),
    });
    // While the payer has not responded Daraja answers with an error body and no ResultCode.
    return { status: mapMpesaResult(data.ResultCode), reason: data.ResultDesc };
  }

  parseCallback(req: CallbackRequest): ParsedCallback {
    requireTokenSecret(this.cfg.callbackSecret, req.query);
    const b = JSON.parse(req.rawBody) as {
      Body?: { stkCallback?: { CheckoutRequestID?: string; ResultCode?: number; ResultDesc?: string; CallbackMetadata?: { Item?: { Name: string; Value?: string | number }[] } } };
    };
    const cb = b.Body?.stkCallback;
    const receipt = cb?.CallbackMetadata?.Item?.find((x) => x.Name === 'MpesaReceiptNumber')?.Value;
    return {
      providerReference: cb?.CheckoutRequestID, status: mapMpesaResult(cb?.ResultCode), reason: cb?.ResultDesc,
      transactionId: receipt === undefined ? undefined : String(receipt), eventId: `mpesa:${sha256(req.rawBody)}`,
    };
  }
}
