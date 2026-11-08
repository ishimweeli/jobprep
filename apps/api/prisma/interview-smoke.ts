import { readFileSync } from 'node:fs';
import { z } from 'zod';
import { loadConfig } from '../src/config';
import { OpenRouterLlmProvider } from '../src/interview/llm';
import { GroqSttProvider } from '../src/interview/stt';

/**
 * One real call to each interview provider, to prove the keys, the model id and the features we rely on
 * (streaming, `effort`, structured output, Whisper transcription) work before anything is built on them.
 *
 *   npm run interview:smoke -w @jobprep/api -- [path/to/spoken-english.wav|webm|mp3]
 *
 * Needs OPENROUTER_API_KEY (and GROQ_API_KEY for the audio part) in the repo-root .env. Costs a fraction of a cent.
 */
async function main() {
  const config = loadConfig();
  let failed = false;
  const check = async (name: string, fn: () => Promise<string>) => {
    const t0 = Date.now();
    try {
      const out = await fn();
      console.log(`OK   ${name} → ${out} [${Date.now() - t0}ms]`);
    } catch (e) {
      failed = true;
      console.log(`FAIL ${name}: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  if (!config.OPENROUTER_API_KEY) {
    console.log('SKIP llm: OPENROUTER_API_KEY is not set');
  } else {
    const llm = new OpenRouterLlmProvider(config);
    const system = 'You are a job interviewer. Reply in one short sentence.';
    await check(`complete (${config.INTERVIEW_MODEL}, effort low)`, async () => {
      const r = await llm.complete({ purpose: 'smoke', system, maxTokens: 200, effort: 'low', messages: [{ role: 'user', content: 'Start the interview.' }] });
      return `${JSON.stringify(r.text)} usage=${JSON.stringify(r.usage)}`;
    });
    await check('stream', async () => {
      let chunks = 0;
      let firstAt = 0;
      const t0 = Date.now();
      const r = await llm.stream({ purpose: 'smoke', system, maxTokens: 200, effort: 'low', messages: [{ role: 'user', content: 'Ask me one question about teamwork.' }] }, () => {
        chunks++;
        firstAt ||= Date.now() - t0;
      });
      return `${chunks} chunks, first after ${firstAt}ms: ${JSON.stringify(r.text)}`;
    });
    await check('structured output', async () => {
      const schema = z.object({ position: z.string(), skills: z.array(z.string()) });
      const r = await llm.json({ purpose: 'smoke', system: 'Extract the job details.', maxTokens: 400, messages: [{ role: 'user', content: 'We are hiring a Software QA Engineer with Java, SQL and Playwright skills.' }] }, schema);
      return JSON.stringify(r.data);
    });
  }

  const audioPath = process.argv[2];
  if (!config.GROQ_API_KEY) console.log('SKIP stt: GROQ_API_KEY is not set');
  else if (!audioPath) console.log('SKIP stt: pass an audio file of spoken English');
  else {
    const stt = new GroqSttProvider(config);
    const ext = audioPath.split('.').pop()!.toLowerCase();
    const mime = { wav: 'audio/wav', webm: 'audio/webm', mp3: 'audio/mpeg', ogg: 'audio/ogg', m4a: 'audio/mp4', mp4: 'audio/mp4' }[ext] ?? 'audio/webm';
    await check(`transcribe (${config.GROQ_STT_MODEL})`, async () => {
      const r = await stt.transcribe(readFileSync(audioPath), mime);
      return `${JSON.stringify(r.text)} (${r.durationSeconds}s of audio)`;
    });
  }
  process.exitCode = failed ? 1 : 0;
}

main();
