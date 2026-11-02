import {
  InvalidCallbackError, hmacHex, safeEqual, sha256,
  type CallbackRequest, type ParsedCallback, type PaymentProvider, type ProviderStatus, type RequestToPayInput,
  type StatusResult,
} from './types';

/**
 * Local development and test provider. It behaves like an operator whose payer has not approved yet
 * (PENDING) until a test calls `settle`. Its webhooks are signed with HMAC-SHA256 like a real operator's.
 * Never available in production (config refuses PAYMENT_PROVIDER_MODE=fake there).
 */
export class FakeProvider implements PaymentProvider {
  readonly code = 'FAKE' as const;
  private readonly requests = new Map<string, StatusResult & { paymentId: string; msisdn: string }>();

  constructor(private readonly webhookSecret: string) {}

  async requestToPay(input: RequestToPayInput) {
    const providerReference = `fake_${input.paymentId}`;
    this.requests.set(providerReference, { status: 'PENDING', paymentId: input.paymentId, msisdn: input.msisdn });
    return { providerReference };
  }

  async getStatus(providerReference: string): Promise<StatusResult> {
    const r = this.requests.get(providerReference);
    // Unknown after a server restart: report it as still waiting; the payment then expires normally.
    return r ? { status: r.status, reason: r.reason, transactionId: r.transactionId } : { status: 'PENDING' };
  }

  /** Test control: the payer approves / declines / the request fails. */
  settle(providerReference: string, status: ProviderStatus, reason?: string) {
    const r = this.requests.get(providerReference);
    if (!r) throw new Error(`unknown fake request ${providerReference}`);
    r.status = status;
    r.reason = reason;
    if (status === 'SUCCESSFUL') r.transactionId = `FAKE-TXN-${r.paymentId.slice(-8).toUpperCase()}`;
    return r;
  }

  /** The exact body + signature header a real operator would POST to our webhook. */
  callbackFor(providerReference: string): { body: string; headers: Record<string, string> } {
    const r = this.requests.get(providerReference);
    if (!r) throw new Error(`unknown fake request ${providerReference}`);
    const body = JSON.stringify({
      providerReference, paymentId: r.paymentId, status: r.status, reason: r.reason, transactionId: r.transactionId,
    });
    return { body, headers: { 'x-fake-signature': hmacHex(this.webhookSecret, body) } };
  }

  parseCallback(req: CallbackRequest): ParsedCallback {
    const sig = req.headers['x-fake-signature'];
    if (!sig || !safeEqual(sig, hmacHex(this.webhookSecret, req.rawBody))) throw new InvalidCallbackError('bad_signature');
    const b = JSON.parse(req.rawBody) as {
      providerReference?: string; paymentId?: string; status: ProviderStatus; reason?: string; transactionId?: string;
    };
    return {
      providerReference: b.providerReference, paymentId: b.paymentId, status: b.status, reason: b.reason,
      transactionId: b.transactionId, eventId: `fake:${sha256(req.rawBody)}`,
    };
  }
}
