import { describe, expect, it } from 'vitest';
import { AirtelMoneyProvider, mapAirtelStatus } from '../../src/payments/airtel';
import { FakeProvider } from '../../src/payments/fake';
import { mapMpesaResult, MpesaProvider } from '../../src/payments/mpesa';
import { MtnMomoProvider, mapMtnStatus } from '../../src/payments/mtn';
import { createProviderRegistry } from '../../src/payments/registry';
import { InvalidCallbackError, ProviderError, type FetchLike } from '../../src/payments/types';
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

describe('MTN MoMo adapter', () => {
  const cfg = { baseUrl: 'https://momo.test', subscriptionKey: 'sub-key', apiUser: 'user', apiKey: 'key', targetEnvironment: 'sandbox', callbackSecret: 's3cret' };
  const routes: [RegExp, { status?: number; json?: unknown }][] = [
    [/\/collection\/token\//, { json: { access_token: 'tok', expires_in: 3600 } }],
    [/\/requesttopay\/[0-9a-f-]{36}$/, { json: { status: 'SUCCESSFUL', financialTransactionId: 'FIN-1' } }],
    [/\/requesttopay$/, { status: 202 }],
  ];

  it('gets a token, then sends a request-to-pay with the reference, callback URL and payer MSISDN (no PIN anywhere)', async () => {
    const m = mockFetch(routes);
    const { providerReference } = await new MtnMomoProvider(cfg, m.fn).requestToPay(input);
    expect(providerReference).toMatch(/^[0-9a-f-]{36}$/);
    const [tokenCall, rtp] = m.calls;
    expect(tokenCall!.headers!.Authorization).toBe(`Basic ${Buffer.from('user:key').toString('base64')}`);
    expect(rtp!.url).toBe('https://momo.test/collection/v1_0/requesttopay');
    expect(rtp!.headers).toMatchObject({
      Authorization: 'Bearer tok', 'X-Reference-Id': providerReference, 'X-Callback-Url': 'https://api.example/cb',
      'X-Target-Environment': 'sandbox', 'Ocp-Apim-Subscription-Key': 'sub-key',
    });
    expect(rtp!.body).toEqual({
      amount: '2000', currency: 'RWF', externalId: 'pay_123', payer: { partyIdType: 'MSISDN', partyId: '250788123456' },
      payerMessage: 'JobPrep Full Access', payeeNote: 'JobPrep Full Access',
    });
    expect(JSON.stringify(rtp!.body)).not.toMatch(/pin/i);
  });

  it('reuses the token and reads the status and transaction id', async () => {
    const m = mockFetch(routes);
    const p = new MtnMomoProvider(cfg, m.fn);
    await p.requestToPay(input);
    const res = await p.getStatus('11111111-1111-1111-1111-111111111111');
    expect(res).toMatchObject({ status: 'SUCCESSFUL', transactionId: 'FIN-1' });
    expect(m.calls.filter((c) => /token/.test(c.url))).toHaveLength(1);
  });

  it('maps statuses: rejected → declined, timeout → expired, other failure → failed, unknown → keep waiting', () => {
    expect(mapMtnStatus('SUCCESSFUL')).toBe('SUCCESSFUL');
    expect(mapMtnStatus('PENDING')).toBe('PENDING');
    expect(mapMtnStatus('FAILED', 'APPROVAL_REJECTED')).toBe('DECLINED');
    expect(mapMtnStatus('FAILED', 'EXPIRED')).toBe('EXPIRED');
    expect(mapMtnStatus('FAILED', 'PAYER_LIMIT_REACHED')).toBe('FAILED');
    expect(mapMtnStatus('SOMETHING_NEW')).toBe('PENDING');
  });

  it('callbacks need the shared secret in the URL (fail closed), then map externalId and status', () => {
    const body = JSON.stringify({ externalId: 'pay_123', status: 'SUCCESSFUL', financialTransactionId: 'FIN-9' });
    const p = new MtnMomoProvider(cfg, mockFetch([]).fn);
    expect(() => p.parseCallback({ rawBody: body, headers: {}, query: {} })).toThrow(InvalidCallbackError);
    expect(() => p.parseCallback({ rawBody: body, headers: {}, query: { token: 'wrong' } })).toThrow(InvalidCallbackError);
    const ok = p.parseCallback({ rawBody: body, headers: {}, query: { token: 's3cret' } });
    expect(ok).toMatchObject({ paymentId: 'pay_123', status: 'SUCCESSFUL', transactionId: 'FIN-9' });
    expect(ok.eventId).toBe(p.parseCallback({ rawBody: body, headers: {}, query: { token: 's3cret' } }).eventId); // identical retry → same id
    const noSecret = new MtnMomoProvider({ ...cfg, callbackSecret: '' }, mockFetch([]).fn);
    expect(() => noSecret.parseCallback({ rawBody: body, headers: {}, query: { token: '' } })).toThrow(InvalidCallbackError);
  });

  it('turns a network failure or a provider error into a ProviderError', async () => {
    const boom: FetchLike = async () => { throw new Error('ECONNRESET'); };
    await expect(new MtnMomoProvider(cfg, boom).requestToPay(input)).rejects.toBeInstanceOf(ProviderError);
    const m = mockFetch([[/token/, { json: { access_token: 't', expires_in: 3600 } }], [/requesttopay$/, { status: 500 }]]);
    await expect(new MtnMomoProvider(cfg, m.fn).requestToPay(input)).rejects.toMatchObject({ status: 500 });
  });
});

describe('Airtel Money adapter', () => {
  const cfg = { baseUrl: 'https://airtel.test', clientId: 'cid', clientSecret: 'csec', callbackSecret: 'abc' };
  it('requests a payment keyed by our payment id, with country, currency and the national number', async () => {
    const m = mockFetch([[/oauth2\/token/, { json: { access_token: 'tok', expires_in: 180 } }], [/merchant\/v2\/payments/, { json: { status: { success: true } } }]]);
    const { providerReference } = await new AirtelMoneyProvider(cfg, m.fn).requestToPay(input);
    expect(providerReference).toBe('pay_123');
    const rtp = m.calls[1]!;
    expect(rtp.headers).toMatchObject({ Authorization: 'Bearer tok', 'X-Country': 'RW', 'X-Currency': 'RWF' });
    expect(rtp.body).toMatchObject({
      subscriber: { country: 'RW', currency: 'RWF', msisdn: '788123456' },
      transaction: { amount: 2000, country: 'RW', currency: 'RWF', id: 'pay_123' },
    });
  });

  it('maps status codes', () => {
    expect(mapAirtelStatus('TS')).toBe('SUCCESSFUL');
    expect(mapAirtelStatus('TIP')).toBe('PENDING');
    expect(mapAirtelStatus('TA')).toBe('PENDING');
    expect(mapAirtelStatus('TE')).toBe('EXPIRED');
    expect(mapAirtelStatus('TF', 'Transaction rejected by user')).toBe('DECLINED');
    expect(mapAirtelStatus('TF', 'Insufficient funds')).toBe('FAILED');
  });

  it('polls and parses callbacks (secret required)', async () => {
    const m = mockFetch([[/oauth2\/token/, { json: { access_token: 'tok', expires_in: 180 } }], [/standard\/v1\/payments\/pay_123/, { json: { data: { transaction: { status: 'TS', airtel_money_id: 'AM-7' } } } }]]);
    const p = new AirtelMoneyProvider(cfg, m.fn);
    expect(await p.getStatus('pay_123')).toMatchObject({ status: 'SUCCESSFUL', transactionId: 'AM-7' });
    const body = JSON.stringify({ transaction: { id: 'pay_123', status_code: 'TF', message: 'declined by customer', airtel_money_id: 'AM-8' } });
    expect(() => p.parseCallback({ rawBody: body, headers: {}, query: {} })).toThrow(InvalidCallbackError);
    expect(p.parseCallback({ rawBody: body, headers: {}, query: { token: 'abc' } })).toMatchObject({ paymentId: 'pay_123', status: 'DECLINED' });
  });
});

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

  it('sandbox/live mode exposes the real webhooks only, never the fake one, and puts the secret in the callback URL', () => {
    const r = createProviderRegistry(loadConfig({ ...env, PAYMENT_PROVIDER_MODE: 'sandbox', MTN_MOMO_CALLBACK_SECRET: 'abc 123', PUBLIC_API_URL: 'https://api.jobprep.test' }));
    expect(r.fake).toBeNull();
    expect(r.fromSlug('fake')).toBeNull();
    expect(r.fromSlug('mtn-momo')?.code).toBe('MTN_MOMO');
    expect(r.fromSlug('airtel-money')?.code).toBe('AIRTEL_MONEY');
    expect(r.fromSlug('mpesa')?.code).toBe('MPESA');
    expect(r.callbackUrl('MTN_MOMO')).toBe('https://api.jobprep.test/api/payments/webhooks/mtn-momo?token=abc%20123');
    expect(() => r.get('FAKE')).toThrow();
  });
});
