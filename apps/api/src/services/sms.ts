export interface SmsMessage {
  to: string;
  body: string;
  sentAt: Date;
}

export interface SmsProvider {
  send(to: string, body: string): Promise<void>;
}

/**
 * Dev/test provider: prints to the server log and keeps the messages in memory so the
 * test-only endpoint (and tests) can read OTP codes. Never used in production (see config).
 */
export class ConsoleSmsProvider implements SmsProvider {
  readonly sent: SmsMessage[] = [];

  constructor(private readonly log: (line: string) => void = console.log) {}

  async send(to: string, body: string) {
    this.sent.push({ to, body, sentAt: new Date() });
    if (this.sent.length > 200) this.sent.shift();
    this.log(`[sms:console] to=${to} body="${body}"`);
  }

  lastTo(to: string): SmsMessage | undefined {
    return [...this.sent].reverse().find((m) => m.to === to);
  }

  /** The most recent 6-digit code sent to a number. */
  lastCode(to: string): string | null {
    const m = this.lastTo(to)?.body.match(/\b(\d{6})\b/);
    return m ? m[1]! : null;
  }

  clear() {
    this.sent.length = 0;
  }
}
