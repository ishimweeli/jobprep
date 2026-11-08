import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * The candidate's microphone. Records one answer at a time and decides when it is over (voice activity
 * detection): the answer ends after SILENCE_MS of quiet once the candidate has spoken, or at MAX_ANSWER_MS, or when
 * they press "Done". It can also watch for the candidate starting to speak while the interviewer talks (barge-in).
 * Recordings go straight to the server for transcription and are never kept in the browser.
 */
export const SPEECH_RMS = 0.035;
export const BARGE_IN_RMS = 0.09;
export const SILENCE_MS = 1700;
export const MAX_ANSWER_MS = 3 * 60_000;
export const NO_SPEECH_MS = 25_000;

export function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined;
  return ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'].find((t) => MediaRecorder.isTypeSupported(t));
}

export const recordingSupported = () =>
  typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined';

/** RMS loudness (0..1) of the analyser's current frame. */
function rmsOf(analyser: AnalyserNode, buf: Uint8Array<ArrayBuffer>): number {
  analyser.getByteTimeDomainData(buf);
  let sum = 0;
  for (const v of buf) sum += ((v - 128) / 128) ** 2;
  return Math.sqrt(sum / buf.length);
}

export interface Answer { blob: Blob; spoke: boolean }

export function useRecorder() {
  const stream = useRef<MediaStream | null>(null);
  const audio = useRef<{ ctx: AudioContext; analyser: AnalyserNode; buf: Uint8Array<ArrayBuffer> } | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const stopTurn = useRef<(() => void) | null>(null);
  const [level, setLevel] = useState(0);
  const [recording, setRecording] = useState(false);

  /** Ask for the microphone (once). Throws the browser's error when it is refused or missing. */
  const open = useCallback(async () => {
    if (stream.current) return;
    const s = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    stream.current = s;
    const ctx = new AudioContext();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    ctx.createMediaStreamSource(s).connect(analyser);
    audio.current = { ctx, analyser, buf: new Uint8Array(new ArrayBuffer(analyser.fftSize)) };
  }, []);

  /** Record one answer; resolves when it is over. `spoke` is false when nothing was said before NO_SPEECH_MS. */
  const listen = useCallback(() => new Promise<Answer>((resolve, reject) => {
    const s = stream.current;
    const a = audio.current;
    if (!s || !a) return reject(new Error('microphone not open'));
    void a.ctx.resume();
    const mimeType = pickMimeType();
    const rec = new MediaRecorder(s, mimeType ? { mimeType } : undefined);
    recorder.current = rec;
    const chunks: BlobPart[] = [];
    let spoke = false;
    let loudSince = 0;
    let quietSince = 0;
    const startedAt = performance.now();
    let raf = 0;
    const finish = () => { cancelAnimationFrame(raf); if (rec.state !== 'inactive') rec.stop(); };
    stopTurn.current = finish;
    rec.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
    rec.onstop = () => {
      setRecording(false);
      setLevel(0);
      stopTurn.current = null;
      resolve({ blob: new Blob(chunks, { type: rec.mimeType || mimeType || 'audio/webm' }), spoke });
    };
    const tick = () => {
      const now = performance.now();
      const rms = rmsOf(a.analyser, a.buf);
      setLevel(Math.min(1, rms * 6));
      if (rms > SPEECH_RMS) {
        loudSince ||= now;
        quietSince = 0;
        if (now - loudSince > 200) spoke = true;
      } else {
        loudSince = 0;
        quietSince ||= now;
      }
      const elapsed = now - startedAt;
      if ((spoke && quietSince && now - quietSince > SILENCE_MS) || elapsed > MAX_ANSWER_MS || (!spoke && elapsed > NO_SPEECH_MS)) return finish();
      raf = requestAnimationFrame(tick);
    };
    rec.start(250);
    setRecording(true);
    raf = requestAnimationFrame(tick);
  }), []);

  /** "Done answering": end the current answer now. */
  const done = useCallback(() => stopTurn.current?.(), []);

  /** While the interviewer speaks: call `onSpeech` once if the candidate clearly starts talking. Returns a stop function. */
  const watchBargeIn = useCallback((onSpeech: () => void) => {
    const a = audio.current;
    if (!a) return () => {};
    let raf = 0;
    let loudSince = 0;
    const tick = () => {
      const rms = rmsOf(a.analyser, a.buf);
      const now = performance.now();
      if (rms > BARGE_IN_RMS) {
        loudSince ||= now;
        if (now - loudSince > 450) return onSpeech();
      } else loudSince = 0;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  /** Release the microphone. */
  const close = useCallback(() => {
    stopTurn.current?.();
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    void audio.current?.ctx.close();
    audio.current = null;
  }, []);

  useEffect(() => close, [close]);

  return { open, listen, done, watchBargeIn, close, level, recording };
}
