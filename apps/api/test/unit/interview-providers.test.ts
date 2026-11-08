import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { loadConfig } from '../../src/config';
import { createDataCipher } from '../../src/services/crypto';
import { extractJson, FakeLlmProvider } from '../../src/interview/llm';
import { GroqSttProvider, SttError } from '../../src/interview/stt';

const SECRET = 'x'.repeat(40);

describe('data cipher', () => {
  it('round-trips text and never stores it in the clear', () => {
    const c = createDataCipher({ DATA_ENCRYPTION_KEY: '', SESSION_SECRET: SECRET });
    const stored = c.encrypt('I tested the payments API with Playwright.');
    expect(stored.startsWith('v1:')).toBe(true);
    expect(stored).not.toContain('Playwright');
    expect(c.decrypt(stored)).toBe('I tested the payments API with Playwright.');
    expect(c.encrypt('same')).not.toBe(c.encrypt('same')); // fresh IV each time
  });

  it('uses the configured key, and a different key cannot read it', () => {
    const key = Buffer.alloc(32, 7).toString('base64');
    const a = createDataCipher({ DATA_ENCRYPTION_KEY: key, SESSION_SECRET: SECRET });
    const b = createDataCipher({ DATA_ENCRYPTION_KEY: '', SESSION_SECRET: SECRET });
    const stored = a.encrypt('secret transcript');
    expect(a.decrypt(stored)).toBe('secret transcript');
    expect(() => b.decrypt(stored)).toThrow();
  });
});

describe('interview config', () => {
  const prod = {
    NODE_ENV: 'production', DATABASE_URL: 'postgres://x', SESSION_SECRET: 'a-very-long-random-session-secret-1234567890',
    PAYMENT_PROVIDER_MODE: 'live', EMAIL_PROVIDER: 'smtp', MAIL_HOST: 'h', MAIL_USERNAME: 'u', MAIL_PASSWORD: 'p', MAIL_FROM_ADDRESS: 'a@b.c',
    PUBLIC_API_URL: 'https://x.y', WEB_ORIGIN: 'https://x.y', PAWAPAY_CALLBACK_SECRET: 'x'.repeat(20), PAWAPAY_API_TOKEN: 't',
  };

  it('production refuses interview prep without real providers and an encryption key', () => {
    expect(() => loadConfig({ ...prod, INTERVIEW_PREP_ENABLED: 'true' })).toThrow(/OPENROUTER_API_KEY.*GROQ_API_KEY.*DATA_ENCRYPTION_KEY/);
    expect(() => loadConfig({ ...prod, INTERVIEW_PREP_ENABLED: 'true', OPENROUTER_API_KEY: 'k', GROQ_API_KEY: 'g', DATA_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString('base64') })).not.toThrow();
    expect(() => loadConfig(prod)).not.toThrow(); // off by default: nothing extra required
  });
});

describe('llm helpers', () => {
  it('extracts a JSON object from fenced or chatty replies', () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
    expect(extractJson('Here you go:\n```json\n{"a": [1,2]}\n```')).toEqual({ a: [1, 2] });
    expect(() => extractJson('no json here')).toThrow();
  });

  it('the fake streams in pieces and validates JSON replies', async () => {
    const llm = new FakeLlmProvider();
    llm.handler = () => 'Hello there, welcome to the interview.';
    const chunks: string[] = [];
    const r = await llm.stream({ purpose: 'turn', system: 's', maxTokens: 10, messages: [{ role: 'user', content: 'hi' }] }, (c) => chunks.push(c));
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.join('')).toBe(r.text);
    llm.handler = () => '{"n": 3}';
    await expect(llm.json({ purpose: 'extract', system: 's', maxTokens: 10, messages: [] }, z.object({ n: z.number() }))).resolves.toMatchObject({ data: { n: 3 } });
    llm.handler = () => 'nope';
    await expect(llm.json({ purpose: 'extract', system: 's', maxTokens: 10, messages: [] }, z.object({ n: z.number() }))).rejects.toMatchObject({ code: 'llm_bad_output' });
  });
});

describe('Groq speech to text', () => {
  const cfg = { GROQ_API_KEY: 'gk', GROQ_BASE_URL: 'https://api.groq.test/openai/v1', GROQ_STT_MODEL: 'whisper-large-v3' };

  it('posts the audio as multipart with English and returns text and duration', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const fetchFn = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({ text: ' I check the database too. ', duration: 4.2 }), { status: 200 });
    }) as unknown as typeof fetch;
    const r = await new GroqSttProvider(cfg, fetchFn).transcribe(Buffer.from('abc'), 'audio/webm;codecs=opus');
    expect(r).toEqual({ text: 'I check the database too.', durationSeconds: 4.2 });
    expect(calls[0]!.url).toBe('https://api.groq.test/openai/v1/audio/transcriptions');
    expect((calls[0]!.init.headers as Record<string, string>).Authorization).toBe('Bearer gk');
    const form = calls[0]!.init.body as FormData;
    expect(form.get('model')).toBe('whisper-large-v3');
    expect(form.get('language')).toBe('en');
    expect((form.get('file') as File).name).toBe('answer.webm');
  });

  it('retries once on a server error, but not on a client error', async () => {
    let n = 0;
    const flaky = (async () => (++n === 1 ? new Response('busy', { status: 503 }) : new Response(JSON.stringify({ text: 'ok', duration: 1 })))) as unknown as typeof fetch;
    await expect(new GroqSttProvider(cfg, flaky).transcribe(Buffer.from('a'), 'audio/webm')).resolves.toMatchObject({ text: 'ok' });
    expect(n).toBe(2);
    let m = 0;
    const bad = (async () => { m++; return new Response('bad file', { status: 400 }); }) as unknown as typeof fetch;
    await expect(new GroqSttProvider(cfg, bad).transcribe(Buffer.from('a'), 'audio/webm')).rejects.toBeInstanceOf(SttError);
    expect(m).toBe(1);
  });
});
