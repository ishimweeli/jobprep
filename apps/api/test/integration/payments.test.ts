import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app';
import { FakeProvider } from '../../src/payments/fake';
import { createProviderRegistry } from '../../src/payments/registry';
import { sweepPayments } from '../../src/services/payments';
import { ConsoleSmsProvider, type SmsProvider } from '../../src/services/sms';
import { resetAndSeed, signedInAgent, testConfig, testPrisma } from '../helpers';

const prisma = testPrisma();
const sms = new ConsoleSmsProvider(() => {});
const config = testConfig();
const providers = createProviderRegistry(config);
let clock = new Date('2026-11-02T10:00:00Z');
const app = createApp({ prisma, config, sms, providers, now: () => clock });
const fake = providers.fake!;
const advance = (secs: number) => { clock = new Date(clock.getTime() + secs * 1000); };
const DAY = 86_400_000;

let seq = 500000;
const nextPhone = () => `+250788${seq++}`;
const ACCOUNTANT = 'accountant-public-institution-mock-1';

beforeAll(() => resetAndSeed(prisma));
beforeEach(() => { clock = new Date('2026-11-02T10:00:00Z'); sms.clear(); });
afterAll(() => prisma.$disconnect());

type Agent = ReturnType<typeof request.agent>;
const pay = (agent: Agent, body: object = {}) =>
  agent.post('/api/payments').send({ provider: 'MTN_MOMO', msisdn: '078 811 2233', ...body });
const simulate = (id: string, outcome: string, deliver = true) =>
  request(app).post(`/api/test/payments/${id}/simulate`).send({ outcome, deliver });
const grantsFor = (userId: string) => prisma.accessGrant.findMany({ where: { userId }, orderBy: { startsAt: 'asc' } });

async function newUser() {
  const phone = nextPhone();
  const { agent, userId } = await signedInAgent(app, sms, phone);
  return { agent, userId, phone };
}
async function pending(over: object = {}) {
  const u = await newUser();
  const res = await pay(u.agent, over);
  expect(res.status).toBe(201);
  return { ...u, id: res.body.id as string, body: res.body };
}

describe('checkout summary', () => {
  it('order summary comes from the database: price, 30 days, paid once, the country’s methods, prefilled phone', async () => {
    const { agent, phone } = await newUser();
    const b = (await agent.get('/api/me/checkout')).body;
    expect(b.plan).toMatchObject({ priceLabel: 'RWF 2,000', priceMinor: 2000, durationDays: 30, paidOnce: true, checkoutAvailable: true });
    expect(b.paymentMethods.map((m: { label: string }) => m.label)).toEqual(['MTN MoMo', 'Airtel Money']);
    expect(b.prefillPhone).toBe(phone);
    expect(b.country).toMatchObject({ code: 'RW', dialCode: '+250', currencyCode: 'RWF' });
  });

  it('needs a session', async () => {
    expect((await request(app).get('/api/me/checkout')).status).toBe(401);
    expect((await request(app).post('/api/payments').send({ provider: 'MTN_MOMO', msisdn: '0788112233' })).status).toBe(401);
  });
});

describe('creating a payment', () => {
  it('sends a request-to-pay and returns the "approve on your phone" state', async () => {
    const { body } = await pending();
    expect(body).toMatchObject({
      status: 'PENDING', provider: 'MTN_MOMO', providerLabel: 'MTN MoMo', msisdn: '+250788112233',
      amountMinor: 2000, priceLabel: 'RWF 2,000', secondsLeft: 180, canSendAgain: true, canRetry: false, notCharged: false,
    });
    expect(body.approvalHint).toContain('Enter your PIN on your phone');
    expect(body.approvalHint).toContain('never asks for it');
    const row = await prisma.payment.findUniqueOrThrow({ where: { id: body.id } });
    expect(row.providerReference).toBe(`fake_${body.id}`);
    expect(row.countryCode).toBe('RW');
  });

  it('never accepts or stores a PIN, whatever the client sends', async () => {
    const u = await newUser();
    // A long sentinel, not 4 digits: random ids and timestamps could contain a short number by chance.
    const SENTINEL = 'PIN-SENTINEL-93817265';
    const res = await pay(u.agent, { pin: SENTINEL, password: SENTINEL });
    expect(res.status).toBe(201);
    const rows = JSON.stringify(await prisma.payment.findMany({ where: { userId: u.userId } }));
    const events = JSON.stringify(await prisma.paymentEvent.findMany({ where: { paymentId: res.body.id } }));
    expect(rows + events + JSON.stringify(res.body)).not.toContain(SENTINEL);
  });

  it('rejects unavailable methods, bad numbers and unknown providers', async () => {
    const { agent } = await newUser();
    expect((await pay(agent, { provider: 'MPESA' })).body.error).toBe('payment_method_unavailable'); // Kenya's method, not Rwanda's
    expect((await pay(agent, { msisdn: '078811' })).body.error).toBe('invalid_phone');
    expect((await pay(agent, { msisdn: '0788' })).body.error).toBe('validation_error'); // too short to even be a number
    expect((await pay(agent, { msisdn: '+254712345678' })).body.error).toBe('invalid_phone');
    expect((await pay(agent, { provider: 'PAYPAL' })).body.error).toBe('validation_error');
    expect((await pay(agent, { provider: 'FAKE' })).status).toBe(400);
  });

  it('reads the price on the server and snapshots it: a later price change never alters an open payment', async () => {
    const u = await pending();
    await prisma.planConfig.updateMany({ where: { countryCode: 'RW' }, data: { priceMinor: 5000 } });
    try {
      await simulate(u.id, 'success');
      const view = (await u.agent.get(`/api/payments/${u.id}`)).body;
      expect(view).toMatchObject({ status: 'SUCCESSFUL', amountMinor: 2000, priceLabel: 'RWF 2,000' });
      expect(sms.lastTo(u.phone)!.body).toContain('RWF 2,000');
    } finally {
      await prisma.planConfig.updateMany({ where: { countryCode: 'RW' }, data: { priceMinor: 2000 } });
    }
  });

  it('refuses when the country has no price set, and when the method is switched off', async () => {
    const { agent } = await newUser();
    await prisma.planConfig.updateMany({ where: { countryCode: 'RW' }, data: { priceMinor: null } });
    try {
      expect((await pay(agent)).body.error).toBe('checkout_unavailable');
    } finally {
      await prisma.planConfig.updateMany({ where: { countryCode: 'RW' }, data: { priceMinor: 2000 } });
    }
    await prisma.paymentMethodConfig.updateMany({ where: { countryCode: 'RW', provider: 'AIRTEL_MONEY' }, data: { mode: 'DISABLED' } });
    try {
      expect((await pay(agent, { provider: 'AIRTEL_MONEY' })).body.error).toBe('payment_method_unavailable');
    } finally {
      await prisma.paymentMethodConfig.updateMany({ where: { countryCode: 'RW', provider: 'AIRTEL_MONEY' }, data: { mode: 'SANDBOX' } });
    }
  });

  it('is idempotent: the same key returns the same payment; a double-tap reuses the pending request', async () => {
    const u = await newUser();
    const a = await pay(u.agent, { idempotencyKey: 'key-12345678' });
    const b = await pay(u.agent, { idempotencyKey: 'key-12345678' });
    expect([a.status, b.status]).toEqual([201, 200]);
    expect(b.body.id).toBe(a.body.id);
    const c = await pay(u.agent); // no key, same number, still pending
    expect(c.status).toBe(200);
    expect(c.body.id).toBe(a.body.id);
    expect(await prisma.payment.count({ where: { userId: u.userId } })).toBe(1);

    const other = await newUser();
    expect((await pay(other.agent, { idempotencyKey: 'key-12345678' })).body.error).toBe('idempotency_key_in_use');
  });

  it('a payment is private to its owner', async () => {
    const u = await pending();
    const other = await newUser();
    expect((await other.agent.get(`/api/payments/${u.id}`)).status).toBe(404);
    expect((await other.agent.post(`/api/payments/${u.id}/check`)).status).toBe(404);
    expect((await other.agent.post(`/api/payments/${u.id}/resend`).send({})).status).toBe(404);
  });

  it('a failing operator request marks the payment failed and tells the payer they were not charged', async () => {
    class Down extends FakeProvider {
      override async requestToPay(): Promise<{ providerReference: string }> { throw new Error('operator down'); }
    }
    const down = new Down('x');
    const reg = { ...providers, get: () => down, fake: null } as typeof providers;
    const app2 = createApp({ prisma, config, sms, providers: reg, now: () => clock });
    const phone = nextPhone();
    const { agent, userId } = await signedInAgent(app2, sms, phone);
    const res = await agent.post('/api/payments').send({ provider: 'MTN_MOMO', msisdn: phone });
    expect(res.status).toBe(502);
    expect(res.body.error).toBe('provider_unavailable');
    const row = await prisma.payment.findFirstOrThrow({ where: { userId } });
    expect(row.status).toBe('FAILED');
    expect(await grantsFor(userId)).toHaveLength(0);
    const view = (await agent.get(`/api/payments/${row.id}`)).body;
    expect(view).toMatchObject({ status: 'FAILED', notCharged: true, canRetry: true });
    expect(view.message).toContain('You were not charged');
  });
});

describe('success', () => {
  it('payer approves → webhook → Full Access for 30 days in their country, SMS receipt, paid tests unlock', async () => {
    const u = await pending();
    expect((await simulate(u.id, 'success')).status).toBe(200);

    const view = (await u.agent.get(`/api/payments/${u.id}`)).body;
    expect(view).toMatchObject({ status: 'SUCCESSFUL', terminal: true, notCharged: false, message: 'Payment confirmed.' });
    expect(view.transactionId).toMatch(/^FAKE-TXN-/);
    expect(view.access).toMatchObject({ countryCode: 'RW', daysLeft: 30 });

    const [grant] = await grantsFor(u.userId);
    expect(grant).toMatchObject({ countryCode: 'RW', source: 'PAYMENT', status: 'ACTIVE', paymentId: u.id });
    expect(grant!.endsAt.getTime() - grant!.startsAt.getTime()).toBe(30 * DAY);
    expect(grant!.startsAt).toEqual(clock);

    const receipt = sms.lastTo(u.phone)!;
    expect(receipt.body).toContain('RWF 2,000');
    expect(receipt.body).toContain('MTN MoMo');
    expect(receipt.body).toContain('2 Dec 2026');
    expect(receipt.body).toContain(view.transactionId);

    // Flow B: the paid, case-based test is now playable, and /me shows the access.
    const start = await u.agent.post(`/api/countries/RW/mock-tests/${ACCOUNTANT}/attempts`).send({});
    expect(start.status).toBe(201);
    expect((await u.agent.get('/api/me')).body.access.current.daysLeft).toBe(30);
    const detail = (await u.agent.get(`/api/countries/RW/mock-tests/${ACCOUNTANT}`)).body;
    expect(detail.access).toMatchObject({ state: 'GRANTED', canStart: true });
  });

  it('a second purchase while active extends from the current end (no paid days lost)', async () => {
    const u = await pending();
    await simulate(u.id, 'success');
    advance(10 * 86400);
    const second = await pay(u.agent);
    expect(second.status).toBe(201);
    await simulate(second.body.id, 'success');
    const grants = await grantsFor(u.userId);
    expect(grants).toHaveLength(2);
    expect(grants[1]!.startsAt).toEqual(grants[0]!.endsAt);
    expect((await u.agent.get('/api/me')).body.access.current.daysLeft).toBe(50); // 20 left + 30
  });

  it('the polling fallback settles a payment whose callback never arrives', async () => {
    const u = await pending();
    await simulate(u.id, 'success', false); // approved at the operator, but no webhook delivered
    advance(5);
    const view = (await u.agent.get(`/api/payments/${u.id}`)).body;
    expect(view.status).toBe('SUCCESSFUL');
    expect(await grantsFor(u.userId)).toHaveLength(1);
    expect(sms.lastTo(u.phone)).toBeDefined();
  });

  it('"Check payment" asks the operator right away, ignoring the polling throttle', async () => {
    const u = await pending();
    await u.agent.get(`/api/payments/${u.id}`); // a poll just happened
    await simulate(u.id, 'success', false);
    const checked = await u.agent.post(`/api/payments/${u.id}/check`);
    expect(checked.body.status).toBe('SUCCESSFUL');
  });

  it('keeps the payment and the access even if the SMS gateway is down', async () => {
    const failing: SmsProvider = { send: async () => { throw new Error('gateway down'); } };
    const flaky = new ConsoleSmsProvider(() => {});
    const app2 = createApp({ prisma, config, sms: { send: (to, body) => (/receipt|received/i.test(body) ? failing.send(to, body) : flaky.send(to, body)) }, providers, now: () => clock });
    const phone = nextPhone();
    const { agent, userId } = await signedInAgent(app2, flaky, phone);
    const created = await agent.post('/api/payments').send({ provider: 'AIRTEL_MONEY', msisdn: phone });
    await request(app2).post(`/api/test/payments/${created.body.id}/simulate`).send({ outcome: 'success' });
    expect((await agent.get(`/api/payments/${created.body.id}`)).body.status).toBe('SUCCESSFUL');
    expect(await grantsFor(userId)).toHaveLength(1);
  });
});

describe('declined, failed and expired — "You were not charged"', () => {
  it('decline', async () => {
    const u = await pending();
    await simulate(u.id, 'decline');
    const v = (await u.agent.get(`/api/payments/${u.id}`)).body;
    expect(v).toMatchObject({ status: 'DECLINED', notCharged: true, canRetry: true, canSendAgain: false, terminal: true });
    expect(v.message).toContain('You were not charged');
    expect(await grantsFor(u.userId)).toHaveLength(0);
    expect(sms.sent.some((m) => m.to === u.phone && /received/.test(m.body))).toBe(false); // no receipt
    expect((await u.agent.post(`/api/countries/RW/mock-tests/${ACCOUNTANT}/attempts`).send({})).status).toBe(402);
  });

  it('operator failure', async () => {
    const u = await pending();
    await simulate(u.id, 'fail');
    const v = (await u.agent.get(`/api/payments/${u.id}`)).body;
    expect(v).toMatchObject({ status: 'FAILED', notCharged: true });
    expect(await grantsFor(u.userId)).toHaveLength(0);
  });

  it('a request nobody approves expires after the time limit, with no access', async () => {
    const u = await pending();
    advance(179);
    expect((await u.agent.get(`/api/payments/${u.id}`)).body).toMatchObject({ status: 'PENDING', secondsLeft: 1 });
    advance(2);
    const v = (await u.agent.get(`/api/payments/${u.id}`)).body;
    expect(v).toMatchObject({ status: 'EXPIRED', notCharged: true, canRetry: true });
    expect(v.message).toContain('You were not charged');
    expect(await grantsFor(u.userId)).toHaveLength(0);
  });

  it('a payment approved right at the deadline is caught by the last look before expiring', async () => {
    const u = await pending();
    await simulate(u.id, 'success', false);
    advance(181);
    const v = (await u.agent.get(`/api/payments/${u.id}`)).body;
    expect(v.status).toBe('SUCCESSFUL');
    expect(await grantsFor(u.userId)).toHaveLength(1);
  });

  it('a success callback that arrives AFTER the timeout is honoured: the payer was charged, so they get access', async () => {
    const u = await pending();
    advance(200);
    expect((await u.agent.get(`/api/payments/${u.id}`)).body.status).toBe('EXPIRED');
    await simulate(u.id, 'success');
    const v = (await u.agent.get(`/api/payments/${u.id}`)).body;
    expect(v).toMatchObject({ status: 'SUCCESSFUL', notCharged: false });
    expect(await grantsFor(u.userId)).toHaveLength(1);
    expect(sms.lastTo(u.phone)!.body).toContain('Full Access is active');
  });

  it('the timeout simulator makes a request due without waiting three minutes', async () => {
    const u = await pending();
    await simulate(u.id, 'timeout');
    expect((await u.agent.get(`/api/payments/${u.id}`)).body.status).toBe('EXPIRED');
  });

  it('a decline is final: a later success signal for a declined payment changes nothing', async () => {
    const u = await pending();
    await simulate(u.id, 'decline');
    fake.settle(`fake_${u.id}`, 'SUCCESSFUL');
    const cb = fake.callbackFor(`fake_${u.id}`);
    await request(app).post('/api/payments/webhooks/fake').set('x-fake-signature', cb.headers['x-fake-signature']!).set('Content-Type', 'application/json').send(cb.body);
    expect((await u.agent.get(`/api/payments/${u.id}`)).body.status).toBe('DECLINED');
    expect(await grantsFor(u.userId)).toHaveLength(0);
  });
});

describe('duplicate and replayed callbacks', () => {
  it('the same success delivered twice grants once and sends one receipt', async () => {
    const u = await pending();
    await simulate(u.id, 'duplicate');
    expect(await grantsFor(u.userId)).toHaveLength(1);
    expect(sms.sent.filter((m) => m.to === u.phone && /received/.test(m.body))).toHaveLength(1);
    expect(await prisma.paymentEvent.count({ where: { paymentId: u.id, source: 'webhook' } })).toBe(1);
  });

  it('replaying the exact same HTTP webhook any number of times is harmless', async () => {
    const u = await pending();
    await simulate(u.id, 'success');
    const cb = fake.callbackFor(`fake_${u.id}`);
    const replays = await Promise.all(Array.from({ length: 5 }, () =>
      request(app).post('/api/payments/webhooks/fake').set('x-fake-signature', cb.headers['x-fake-signature']!).set('Content-Type', 'application/json').send(cb.body)));
    expect(replays.every((r) => r.status === 200)).toBe(true);
    expect(await grantsFor(u.userId)).toHaveLength(1);
    expect((await prisma.payment.findUniqueOrThrow({ where: { id: u.id } })).status).toBe('SUCCESSFUL');
  });

  it('a webhook racing the poller still grants exactly once', async () => {
    const u = await pending();
    await simulate(u.id, 'success', false);
    advance(10);
    const cb = fake.callbackFor(`fake_${u.id}`);
    await Promise.all([
      u.agent.get(`/api/payments/${u.id}`),
      request(app).post('/api/payments/webhooks/fake').set('x-fake-signature', cb.headers['x-fake-signature']!).set('Content-Type', 'application/json').send(cb.body),
      u.agent.post(`/api/payments/${u.id}/check`),
      request(app).post('/api/payments/webhooks/fake').set('x-fake-signature', cb.headers['x-fake-signature']!).set('Content-Type', 'application/json').send(cb.body),
    ]);
    expect(await grantsFor(u.userId)).toHaveLength(1);
  });
});

describe('webhook security', () => {
  it('rejects a missing, wrong or tampered signature', async () => {
    const u = await pending();
    fake.settle(`fake_${u.id}`, 'SUCCESSFUL');
    const cb = fake.callbackFor(`fake_${u.id}`);
    const post = (body: string, sig?: string) => {
      const r = request(app).post('/api/payments/webhooks/fake').set('Content-Type', 'application/json');
      return (sig ? r.set('x-fake-signature', sig) : r).send(body);
    };
    expect((await post(cb.body)).status).toBe(401);
    expect((await post(cb.body, 'deadbeef')).status).toBe(401);
    expect((await post(cb.body.replace('SUCCESSFUL', 'FAILED'), cb.headers['x-fake-signature'])).status).toBe(401);
    expect((await post(cb.body, cb.headers['x-fake-signature'])).status).toBe(200);
    // (the settled-at-provider state does not matter: only the webhook above could have granted access)
    expect(await grantsFor(u.userId)).toHaveLength(1);
  });

  it('forged webhooks never create access', async () => {
    const u = await pending();
    const forged = JSON.stringify({ paymentId: u.id, providerReference: `fake_${u.id}`, status: 'SUCCESSFUL' });
    const res = await request(app).post('/api/payments/webhooks/fake').set('Content-Type', 'application/json').set('x-fake-signature', 'a'.repeat(64)).send(forged);
    expect(res.status).toBe(401);
    expect(await grantsFor(u.userId)).toHaveLength(0);
  });

  it('acknowledges an unknown payment reference without doing anything', async () => {
    const body = JSON.stringify({ providerReference: 'fake_unknown', paymentId: 'nope', status: 'SUCCESSFUL' });
    const sig = (await import('../../src/payments/types')).hmacHex(config.FAKE_WEBHOOK_SECRET, body);
    const res = await request(app).post('/api/payments/webhooks/fake').set('Content-Type', 'application/json').set('x-fake-signature', sig).send(body);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, matched: false });
  });

  it('operator webhook routes do not exist in fake mode', async () => {
    expect((await request(app).post('/api/payments/webhooks/mtn-momo').send({})).status).toBe(404);
    expect((await request(app).post('/api/payments/webhooks/nope').send({})).status).toBe(404);
  });

  it('the simulator only exists when test endpoints are on', async () => {
    const off = createApp({ prisma, config: testConfig({ ENABLE_TEST_ENDPOINTS: 'false' }), sms, providers, now: () => clock });
    expect((await request(off).post('/api/test/payments/x/simulate').send({ outcome: 'success' })).status).toBe(404);
  });
});

describe('send again / use a different number', () => {
  it('closes the old request and starts a new one on the new number', async () => {
    const u = await pending();
    const res = await u.agent.post(`/api/payments/${u.id}/resend`).send({ msisdn: '0722 000 111' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ status: 'PENDING', msisdn: '+250722000111' });
    expect(res.body.id).not.toBe(u.id);
    expect((await prisma.payment.findUniqueOrThrow({ where: { id: u.id } })).status).toBe('EXPIRED');
  });

  it('"Send again" on the same number makes a fresh prompt', async () => {
    const u = await pending();
    const res = await u.agent.post(`/api/payments/${u.id}/resend`).send({});
    expect(res.status).toBe(201);
    expect(res.body.msisdn).toBe('+250788112233');
  });

  it('never charges twice: if the first request was approved meanwhile, resend returns it instead', async () => {
    const u = await pending();
    await simulate(u.id, 'success', false);
    const res = await u.agent.post(`/api/payments/${u.id}/resend`).send({});
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: u.id, status: 'SUCCESSFUL' });
    expect(await prisma.payment.count({ where: { userId: u.userId } })).toBe(1);
  });

  it('a declined payment can be retried with a new request', async () => {
    const u = await pending();
    await simulate(u.id, 'decline');
    const retry = await u.agent.post(`/api/payments/${u.id}/resend`).send({});
    expect(retry.status).toBe(201);
    expect(retry.body.status).toBe('PENDING');
  });
});

describe('the background sweep', () => {
  it('expires overdue requests and settles ones whose callback was lost, with no client involved', async () => {
    const lost = await pending();
    const overdue = await pending();
    await simulate(lost.id, 'success', false);
    advance(200);
    const n = await sweepPayments({ prisma, config, sms, providers, now: () => clock });
    expect(n).toBeGreaterThanOrEqual(2);
    expect((await prisma.payment.findUniqueOrThrow({ where: { id: lost.id } })).status).toBe('SUCCESSFUL');
    expect((await prisma.payment.findUniqueOrThrow({ where: { id: overdue.id } })).status).toBe('EXPIRED');
    expect(await grantsFor(lost.userId)).toHaveLength(1);
    expect(await grantsFor(overdue.userId)).toHaveLength(0);
  });
});

describe('access is country-scoped', () => {
  it('a Rwanda purchase does not unlock Kenya tests', async () => {
    const u = await pending();
    await simulate(u.id, 'success');
    await prisma.country.update({ where: { code: 'KE' }, data: { status: 'LIVE' } });
    try {
      const sw = await u.agent.post('/api/me/country').send({ countryCode: 'KE', confirm: true });
      expect(sw.status).toBe(200);
      expect(sw.body.access.current).toBeNull();
      expect(sw.body.access.otherCountries[0]).toMatchObject({ countryCode: 'RW', daysLeft: 30 });
      const kenyaPaid = await u.agent.post('/api/countries/KE/mock-tests/accountant-mock-1/attempts').send({});
      expect(kenyaPaid.status).toBe(402);
      expect(kenyaPaid.body.error).toBe('full_access_required');
      // Kenya's free sample is still open, Rwanda's paid test is not reachable from Kenya.
      expect((await u.agent.post('/api/countries/KE/mock-tests/secondary-mathematics-teacher-sample/attempts').send({})).status).toBe(201);
      expect((await u.agent.post(`/api/countries/RW/mock-tests/${ACCOUNTANT}/attempts`).send({})).status).toBe(403);
    } finally {
      await prisma.country.update({ where: { code: 'KE' }, data: { status: 'PREPARING' } });
    }
  });

  it('Kenya: a KES price, M-Pesa checkout and a Kenya-only grant', async () => {
    await prisma.country.update({ where: { code: 'KE' }, data: { status: 'LIVE' } });
    const noPrice = await signedInAgent(app, sms, '+254712000111', 'KE');
    expect((await noPrice.agent.get('/api/me/checkout')).body.plan).toMatchObject({ priceLabel: null, checkoutAvailable: false });
    expect((await noPrice.agent.post('/api/payments').send({ provider: 'MPESA', msisdn: '0712000111' })).body.error).toBe('checkout_unavailable');

    await prisma.planConfig.updateMany({ where: { countryCode: 'KE' }, data: { priceMinor: 150000 } }); // KES 1,500.00
    try {
      const co = (await noPrice.agent.get('/api/me/checkout')).body;
      expect(co.plan).toMatchObject({ priceLabel: 'KES 1,500.00', checkoutAvailable: true });
      expect(co.paymentMethods.map((m: { label: string }) => m.label)).toEqual(['M-Pesa']); // Airtel Kenya is disabled
      const created = await noPrice.agent.post('/api/payments').send({ provider: 'MPESA', msisdn: '0712000111' });
      expect(created.status).toBe(201);
      expect(created.body).toMatchObject({ currencyCode: 'KES', priceLabel: 'KES 1,500.00', providerLabel: 'M-Pesa', msisdn: '+254712000111' });
      expect((await noPrice.agent.post('/api/payments').send({ provider: 'MTN_MOMO', msisdn: '0712000111' })).body.error).toBe('payment_method_unavailable');
      await simulate(created.body.id, 'success');
      const grant = await prisma.accessGrant.findFirstOrThrow({ where: { userId: noPrice.userId } });
      expect(grant.countryCode).toBe('KE');
      expect((await noPrice.agent.post('/api/countries/KE/mock-tests/accountant-mock-1/attempts').send({})).status).toBe(201);
      expect(sms.lastTo('+254712000111')!.body).toContain('KES 1,500.00');
    } finally {
      await prisma.planConfig.updateMany({ where: { countryCode: 'KE' }, data: { priceMinor: null } });
      await prisma.country.update({ where: { code: 'KE' }, data: { status: 'PREPARING' } });
    }
  });
});
