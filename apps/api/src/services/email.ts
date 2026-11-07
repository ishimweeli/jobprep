import nodemailer from 'nodemailer';
import type { Config } from '../config';

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  /** Optional HTML part; sent alongside `text` (multipart), which mail filters trust more than text alone. */
  html?: string;
}

/** The verification-code email as simple, inline-styled HTML. `code` is six digits, so nothing needs escaping. */
export function codeEmailHtml(code: string, minutes: number): string {
  return `<!doctype html><html><body style="margin:0;padding:24px;background:#f4f6f9;font-family:Arial,Helvetica,sans-serif;color:#1b2330">
<div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:12px;padding:28px">
<p style="margin:0 0 8px;font-size:18px;font-weight:bold">Your JobPrep verification code</p>
<p style="margin:0 0 20px;font-size:15px;color:#4a5363">Enter this code to verify your email address.</p>
<p style="margin:0 0 20px;font-size:34px;font-weight:bold;letter-spacing:8px;color:#164A7A">${code}</p>
<p style="margin:0;font-size:13px;color:#5e6573">It works for ${minutes} minutes. Never share it with anyone. If you did not create a JobPrep account, ignore this email.</p>
</div></body></html>`;
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

  /** The most recent 6-digit verification code sent to an address (reset-link emails are skipped). */
  lastCode(to: string): string | null {
    const last = [...this.sent].reverse().find((x) => x.to === to && !x.text.includes('reset-password?token='));
    const m = last?.text.match(/\b(\d{6})\b/);
    return m ? m[1]! : null;
  }

  /** The token in the most recent password-reset link sent to an address. */
  lastResetToken(to: string): string | null {
    for (const msg of [...this.sent].reverse()) {
      if (msg.to !== to) continue;
      const m = msg.text.match(/reset-password\?token=([\w-]+)/);
      if (m) return m[1]!;
    }
    return null;
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
    await this.transport.sendMail({ from: this.from, to: message.to, subject: message.subject, text: message.text, ...(message.html ? { html: message.html } : {}) });
  }
}
