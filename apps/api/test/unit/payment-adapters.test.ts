import { describe, expect, it } from 'vitest';
import { FakeProvider } from '../../src/payments/fake';
import { mapMpesaResult, MpesaProvider } from '../../src/payments/mpesa';
import { createProviderRegistry } from '../../src/payments/registry';
import { InvalidCallbackError, type FetchLike } from '../../src/payments/types';
import { loadConfig } from '../../src/config';

type Call = { url: string; method?: string; headers?: Record<string, string>; body?: unknown };

/** A scripted fetch: each call is answered by the first matching route, and recorded. */
function mockFetch(routes: [RegExp, { status?: number; json?: unknown }][]) {
  const calls: Call[] = [];
  const fn: FetchLike = async (url, init) => {
    calls.push({ url, method: init?.method, headers: init?.headers, body: init?.body ? JSON.parse(init.body) : undefined });
    const hit = routes.find(([re]) => re.test(url));
    if (!hit) throw new Error(`unexpected request ${url}`);
    const status = hit[1].status ?? 200;
    return { ok: status < 400, status, text: async () => JSON.stringify(hit[1].json ?? {}) };
  };
  return { fn, calls };
}

const input = {
  paymentId: 'pay_123', msisdn: '+250788123456', amountMinor: 2000, currencyCode: 'RWF', currencyExponent: 0,
  description: 'JobPrep Full Access', callbackUrl: 'https://api.example/cb',
};

describe('M-Pesa adapter', () => {
  const cfg = { baseUrl: 'https://daraja.test', consumerKey: 'ck', consumerSecret: 'cs', shortcode: '174379', passkey: 'pk', callbackSecret: 'mp' };
  it('sends an STK push with a derived password and a whole-shilling amount', async () => {
    const m = mockFetch([[/oauth\/v1\/generate/, { json: { access_token: 'tok', expires_in: '3599' } }], [/stkpush\/v1\/processrequest/, { json: { CheckoutRequestID: 'ws_CO_1', ResponseCode: '0' } }]]);
    const { providerReference } = await new MpesaProvider(cfg, m.fn).requestToPay({ ...input, msisdn: '+254712345678', amountMinor: 150050, currencyCode: 'KES', currencyExponent: 2 });
    expect(providerReference).toBe('ws_CO_1');
    const body = m.calls[1]!.body as Record<string, string | number>;
    expect(body).toMatchObject({ BusinessShortCode: '174379', Amount: 1501, PartyA: '254712345678', PartyB: '174379', PhoneNumber: '254712345678', TransactionType: 'CustomerPayBillOnline' });
    expect(Buffer.from(String(body.Password), 'base64').toString()).toBe(`174379pk${body.Timestamp}`);
    expect(String(body.Timestamp)).toMatch(/^\d{14}$/);
  });

  it('fails the request when Daraja does not accept it', async () => {
    const m = mockFetch([[/oauth/, { json: { access_token: 't', expires_in: '3599' } }], [/processrequest/, { json: { ResponseCode: '1' } }]]);
    await expect(new MpesaProvider(cfg, m.fn).requestToPay({ ...input, msisdn: '+254712345678' })).rejects.toThrow('stk_push_rejected');
  });

  it('maps result codes; no result yet means still waiting', async () => {
    expect([0, 1032, 1037, 1, undefined].map((c) => mapMpesaResult(c))).toEqual(['SUCCESSFUL', 'DECLINED', 'EXPIRED', 'FAILED', 'PENDING']);
    const m = mockFetch([[/oauth/, { json: { access_token: 't', expires_in: '3599' } }], [/stkpushquery/, { json: { errorCode: '500.001.1001', errorMessage: 'being processed' } }]]);
    expect((await new MpesaProvider(cfg, m.fn).getStatus('ws_CO_1')).status).toBe('PENDING');
  });

  it('parses the callback incl. the receipt number, and needs the secret', () => {
    const body = JSON.stringify({ Body: { stkCallback: { CheckoutRequestID: 'ws_CO_1', ResultCode: 0, ResultDesc: 'ok', CallbackMetadata: { Item: [{ Name: 'Amount', Value: 1500 }, { Name: 'MpesaReceiptNumber', Value: 'QGH7XYZ123' }] } } } });
    const p = new MpesaProvider(cfg, mockFetch([]).fn);
    expect(() => p.parseCallback({ rawBody: body, headers: {}, query: {} })).toThrow(InvalidCallbackError);
    expect(p.parseCallback({ rawBody: body, headers: {}, query: { token: 'mp' } })).toMatchObject({ providerReference: 'ws_CO_1', status: 'SUCCESSFUL', transactionId: 'QGH7XYZ123' });
  });
});

describe('fake provider and registry', () => {
  it('signs its callbacks and rejects tampering', () => {
    const f = new FakeProvider('secret');
    return f.requestToPay({ ...input }).then(({ providerReference }) => {
      f.settle(providerReference, 'SUCCESSFUL');
      const cb = f.callbackFor(providerReference);
      expect(f.parseCallback({ rawBody: cb.body, headers: cb.headers, query: {} })).toMatchObject({ status: 'SUCCESSFUL', paymentId: 'pay_123' });
      expect(() => f.parseCallback({ rawBody: cb.body.replace('SUCCESSFUL', 'FAILED'), headers: cb.headers, query: {} })).toThrow(InvalidCallbackError);
      expect(() => f.parseCallback({ rawBody: cb.body, headers: {}, query: {} })).toThrow(InvalidCallbackError);
    });
  });

  const env = { DATABASE_URL: 'postgresql://x', SESSION_SECRET: 'x'.repeat(20) };
  it('fake mode serves every method with the fake provider and only exposes the fake webhook', () => {
    const r = createProviderRegistry(loadConfig({ ...env, PAYMENT_PROVIDER_MODE: 'fake' }));
    expect(r.get('MTN_MOMO')).toBe(r.get('MPESA'));
    expect(r.fromSlug('fake')).not.toBeNull();
    expect(r.fromSlug('mtn-momo')).toBeNull();
    expect(r.fake).not.toBeNull();
  });

  it('sandbox/live mode without a pawaPay token exposes only the M-Pesa webhook (MTN/Airtel direct adapters were retired)', () => {
    const r = createProviderRegistry(loadConfig({ ...env, PAYMENT_PROVIDER_MODE: 'sandbox', MPESA_CALLBACK_SECRET: 'abc 123', PUBLIC_API_URL: 'https://api.jobprep.test' }));
    expect(r.fake).toBeNull();
    expect(r.fromSlug('fake')).toBeNull();
    expect(r.fromSlug('mtn-momo')).toBeNull();
    expect(r.fromSlug('airtel-money')).toBeNull();
    expect(r.fromSlug('mpesa')?.code).toBe('MPESA');
    expect(r.callbackUrl('MPESA')).toBe('https://api.jobprep.test/api/payments/webhooks/mpesa?token=abc%20123');
    expect(() => r.get('MTN_MOMO')).toThrow();
    expect(() => r.get('FAKE')).toThrow();
  });
});
