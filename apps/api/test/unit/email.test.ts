import { beforeEach, describe, expect, it, vi } from 'vitest';

// nodemailer is mocked so no network or SMTP server is ever involved.
const sendMail = vi.fn(async (_msg: unknown) => ({ messageId: 'x' }));
const createTransport = vi.fn((_opts: unknown) => ({ sendMail }));
vi.mock('nodemailer', () => ({ default: { createTransport: (o: unknown) => createTransport(o) } }));

import { emailInput, normalizeEmail } from '../../src/domain/email';
import { ConsoleEmailProvider, SmtpEmailProvider } from '../../src/services/email';

const smtp = (over: Partial<ConstructorParameters<typeof SmtpEmailProvider>[0]> = {}) => new SmtpEmailProvider({
  MAIL_HOST: 'smtp.example.test', MAIL_PORT: 465, MAIL_USERNAME: 'noreply@jobprep.test', MAIL_PASSWORD: 'secret-pass',
  MAIL_STARTTLS: false, MAIL_FROM_ADDRESS: 'noreply@jobprep.test', MAIL_FROM_NAME: 'JobPrep', ...over,
});

describe('ConsoleEmailProvider', () => {
  it('keeps what it "sent", newest last, and prints it to the log', async () => {
    const log = vi.fn();
    const mail = new ConsoleEmailProvider(log);
    await mail.send({ to: 'a@example.com', subject: 'Hello', text: 'Body one' });
    await mail.send({ to: 'b@example.com', subject: 'Hi', text: 'Body two' });
    expect(mail.sent.map((m) => m.to)).toEqual(['a@example.com', 'b@example.com']);
    expect(mail.sent[0]).toMatchObject({ subject: 'Hello', text: 'Body one' });
    expect(mail.sent[0]!.sentAt).toBeInstanceOf(Date);
    expect(log).toHaveBeenCalledTimes(2);
    expect(log.mock.calls[0]![0]).toContain('to=a@example.com');
    expect(log.mock.calls[0]![0]).toContain('Body one');
  });

  it('lastTo returns the most recent message for that exact address, or undefined', async () => {
    const mail = new ConsoleEmailProvider(() => {});
    await mail.send({ to: 'a@example.com', subject: 'First', text: 'one' });
    await mail.send({ to: 'b@example.com', subject: 'Other', text: 'other' });
    await mail.send({ to: 'a@example.com', subject: 'Second', text: 'two' });
    expect(mail.lastTo('a@example.com')!.subject).toBe('Second');
    expect(mail.lastTo('c@example.com')).toBeUndefined();
  });

  it('lastCode finds the latest 6-digit code, and null when there is none', async () => {
    const mail = new ConsoleEmailProvider(() => {});
    expect(mail.lastCode('a@example.com')).toBeNull();
    await mail.send({ to: 'a@example.com', subject: 'Your JobPrep code: 111111', text: 'Your JobPrep code is 111111.' });
    await mail.send({ to: 'a@example.com', subject: 'Your JobPrep code: 222222', text: 'Your JobPrep code is 222222. It expires in 5 minutes.' });
    expect(mail.lastCode('a@example.com')).toBe('222222');
    await mail.send({ to: 'b@example.com', subject: 'No code', text: 'Order 12345 and 1234567 are not codes' });
    expect(mail.lastCode('b@example.com')).toBeNull();
  });

  it('clear forgets everything, and the in-memory list is capped', async () => {
    const mail = new ConsoleEmailProvider(() => {});
    for (let i = 0; i < 210; i++) await mail.send({ to: `u${i}@example.com`, subject: 's', text: 't' });
    expect(mail.sent).toHaveLength(200);
    expect(mail.lastTo('u0@example.com')).toBeUndefined(); // the oldest were dropped
    expect(mail.lastTo('u209@example.com')).toBeDefined();
    mail.clear();
    expect(mail.sent).toHaveLength(0);
  });
});

describe('SmtpEmailProvider', () => {
  beforeEach(() => { sendMail.mockClear(); createTransport.mockClear(); });

  it('port 465 is TLS from the first byte (secure), never STARTTLS', () => {
    smtp({ MAIL_PORT: 465, MAIL_STARTTLS: true });
    expect(createTransport).toHaveBeenCalledWith(expect.objectContaining({ host: 'smtp.example.test', port: 465, secure: true, requireTLS: false }));
  });

  it('other ports are not secure from the start, and require STARTTLS only when asked to', () => {
    smtp({ MAIL_PORT: 587, MAIL_STARTTLS: true });
    expect(createTransport).toHaveBeenLastCalledWith(expect.objectContaining({ port: 587, secure: false, requireTLS: true }));
    smtp({ MAIL_PORT: 80, MAIL_STARTTLS: false });
    expect(createTransport).toHaveBeenLastCalledWith(expect.objectContaining({ port: 80, secure: false, requireTLS: false }));
  });

  it('authenticates with the configured account and sets connection timeouts', () => {
    smtp();
    const opts = createTransport.mock.calls[0]![0] as { auth: unknown; connectionTimeout: number; greetingTimeout: number; socketTimeout: number };
    expect(opts.auth).toEqual({ user: 'noreply@jobprep.test', pass: 'secret-pass' });
    for (const t of [opts.connectionTimeout, opts.greetingTimeout, opts.socketTimeout]) expect(t).toBeGreaterThan(0);
  });

  it('sends a plain-text message from "Name" <address>', async () => {
    await smtp({ MAIL_FROM_NAME: 'JobPrep Rwanda', MAIL_FROM_ADDRESS: 'hello@jobprep.test' })
      .send({ to: 'candidate@example.com', subject: 'Your JobPrep code: 123456', text: 'Your JobPrep code is 123456.' });
    expect(sendMail).toHaveBeenCalledWith({
      from: '"JobPrep Rwanda" <hello@jobprep.test>',
      to: 'candidate@example.com',
      subject: 'Your JobPrep code: 123456',
      text: 'Your JobPrep code is 123456.',
    });
  });

  it('strips double quotes from the display name so the From header cannot be broken', async () => {
    await smtp({ MAIL_FROM_NAME: 'Job"Prep" <evil@x.test>' }).send({ to: 'a@example.com', subject: 's', text: 't' });
    const from = (sendMail.mock.calls[0]![0] as { from: string }).from;
    expect(from).toBe('"JobPrep <evil@x.test>" <noreply@jobprep.test>');
    expect(from.match(/"/g)).toHaveLength(2);
  });

  it('lets a transport failure reach the caller (callers decide what a failed email means)', async () => {
    sendMail.mockRejectedValueOnce(new Error('connection refused'));
    await expect(smtp().send({ to: 'a@example.com', subject: 's', text: 't' })).rejects.toThrow('connection refused');
  });
});

describe('email identity helpers', () => {
  it('normalizeEmail trims and lower-cases', () => {
    expect(normalizeEmail('  Aline.Uwase@Example.COM ')).toBe('aline.uwase@example.com');
  });

  it('emailInput accepts valid addresses, normalised', () => {
    expect(emailInput.parse('  A@X.com ')).toBe('a@x.com');
    expect(emailInput.parse('first.last+tag@sub.example.co.rw')).toBe('first.last+tag@sub.example.co.rw');
  });

  it.each(['', 'plain', 'a@', '@x.com', 'a b@x.com', '0788123456', 'a@@x.com', `${'x'.repeat(250)}@x.com`])('emailInput rejects %j', (bad) => {
    expect(emailInput.safeParse(bad).success).toBe(false);
  });
});
