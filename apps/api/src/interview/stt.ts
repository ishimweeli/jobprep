import type { Config } from '../config';

/**
 * Speech to text for the candidate's spoken answers. Production: Groq Whisper. Dev/test: a fake.
 * Audio is only held in memory for the call and never stored.
 */
export interface SttResult {
  text: string;
  /** Length of the audio in seconds (as the provider measured it). */
  durationSeconds: number;
}

export interface SttProvider {
  transcribe(audio: Buffer, mime: string): Promise<SttResult>;
}

export class SttError extends Error {
  constructor(public readonly code: 'transcription_failed', message: string, options?: { cause?: unknown }) {
    super(message, options);
  }
}

type FetchFn = typeof fetch;

const EXT: Record<string, string> = { 'audio/webm': 'webm', 'audio/ogg': 'ogg', 'audio/mp4': 'mp4', 'audio/mpeg': 'mp3', 'audio/wav': 'wav', 'audio/x-wav': 'wav' };

export class GroqSttProvider implements SttProvider {
  constructor(
    private readonly cfg: Pick<Config, 'GROQ_API_KEY' | 'GROQ_BASE_URL' | 'GROQ_STT_MODEL'>,
    private readonly fetchFn: FetchFn = fetch,
  ) {}

  private async once(audio: Buffer, mime: string): Promise<SttResult> {
    const base = mime.split(';')[0]!.trim();
    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(audio)], { type: base }), `answer.${EXT[base] ?? 'webm'}`);
    form.append('model', this.cfg.GROQ_STT_MODEL);
    form.append('language', 'en');
    form.append('response_format', 'verbose_json');
    form.append('temperature', '0');
    const res = await this.fetchFn(`${this.cfg.GROQ_BASE_URL}/audio/transcriptions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.cfg.GROQ_API_KEY}` },
      body: form,
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) {
      const err = new SttError('transcription_failed', `groq http ${res.status}: ${(await res.text()).slice(0, 200)}`);
      (err as SttError & { retryable?: boolean }).retryable = res.status >= 500 || res.status === 429;
      throw err;
    }
    const data = (await res.json()) as { text?: string; duration?: number };
    return { text: (data.text ?? '').trim(), durationSeconds: Number(data.duration ?? 0) };
  }

  async transcribe(audio: Buffer, mime: string): Promise<SttResult> {
    try {
      return await this.once(audio, mime);
    } catch (e) {
      const retryable = !(e instanceof SttError) || (e as SttError & { retryable?: boolean }).retryable;
      if (!retryable) throw e;
      try {
        return await this.once(audio, mime);
      } catch (e2) {
        if (e2 instanceof SttError) throw e2;
        throw new SttError('transcription_failed', e2 instanceof Error ? e2.message : String(e2), { cause: e2 });
      }
    }
  }
}

/** Dev/test stand-in: returns `nextText` (or a stock answer) and a duration estimated from the byte count. */
export class FakeSttProvider implements SttProvider {
  readonly calls: { bytes: number; mime: string }[] = [];
  nextText: string | null = null;
  fail = false;

  async transcribe(audio: Buffer, mime: string): Promise<SttResult> {
    this.calls.push({ bytes: audio.length, mime });
    if (this.fail) throw new SttError('transcription_failed', 'fake transcription failure');
    const text = this.nextText ?? 'I have three years of experience and I enjoy solving problems with my team.';
    this.nextText = null;
    return { text, durationSeconds: Math.max(1, Math.round(audio.length / 4000)) };
  }
}

export function createSttProvider(config: Config): SttProvider {
  return config.GROQ_API_KEY ? new GroqSttProvider(config) : new FakeSttProvider();
}
