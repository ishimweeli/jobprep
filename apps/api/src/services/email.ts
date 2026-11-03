import nodemailer from 'nodemailer';
import type { Config } from '../config';

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
}

export interface EmailProvider {
  send(message: EmailMessage): Promise<void>;
}

/**
 * Dev/test provider: prints to the server log and keeps the messages in memory so the
 * test-only endpoint (and tests) can read OTP codes. Never used in production (see config).
 */
export class ConsoleEmailProvider implements EmailProvider {
  readonly sent: (EmailMessage & { sentAt: Date })[] = [];

  constructor(private readonly log: (line: string) => void = console.log) {}

  async send(message: EmailMessage) {
    this.sent.push({ ...message, sentAt: new Date() });
    if (this.sent.length > 200) this.sent.shift();
    this.log(`[email:console] to=${message.to} subject="${message.subject}"\n${message.text}`);
  }

  lastTo(to: string) {
    return [...this.sent].reverse().find((m) => m.to === to);
  }

  /** The most recent 6-digit code sent to an address. */
  lastCode(to: string): string | null {
    const m = this.lastTo(to)?.text.match(/\b(\d{6})\b/);
    return m ? m[1]! : null;
  }

  clear() {
    this.sent.length = 0;
  }
}

/** Sends through the SMTP account in MAIL_* (the same DirectMail account the other apps use). */
export class SmtpEmailProvider implements EmailProvider {
  private readonly transport;
  private readonly from: string;

  constructor(config: Pick<Config, 'MAIL_HOST' | 'MAIL_PORT' | 'MAIL_USERNAME' | 'MAIL_PASSWORD' | 'MAIL_STARTTLS' | 'MAIL_FROM_ADDRESS' | 'MAIL_FROM_NAME'>) {
    this.transport = nodemailer.createTransport({
      host: config.MAIL_HOST,
      port: config.MAIL_PORT,
      // Port 465 is TLS from the first byte; other ports upgrade with STARTTLS when asked to.
      secure: config.MAIL_PORT === 465,
      requireTLS: config.MAIL_PORT !== 465 && config.MAIL_STARTTLS,
      auth: { user: config.MAIL_USERNAME, pass: config.MAIL_PASSWORD },
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    });
    this.from = `"${config.MAIL_FROM_NAME.replace(/"/g, '')}" <${config.MAIL_FROM_ADDRESS}>`;
  }

  async send(message: EmailMessage) {
    await this.transport.sendMail({ from: this.from, to: message.to, subject: message.subject, text: message.text });
  }
}
