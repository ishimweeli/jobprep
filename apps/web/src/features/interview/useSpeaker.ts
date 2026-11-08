import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * The interviewer's voice: the browser's own speech synthesis (no cost, no audio leaves the device). Sentences are
 * queued as the reply streams in, so speaking starts before the whole reply has arrived.
 */
export const speechSupported = () => typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;

const PREFERRED = [/en-GB/i, /en-US/i, /^en/i];

function pickVoice(): SpeechSynthesisVoice | null {
  if (!speechSupported()) return null;
  const voices = window.speechSynthesis.getVoices();
  for (const re of PREFERRED) {
    const natural = voices.find((v) => re.test(v.lang) && /natural|neural|google|online/i.test(v.name));
    if (natural) return natural;
    const any = voices.find((v) => re.test(v.lang));
    if (any) return any;
  }
  return null;
}

function utterance(text: string): SpeechSynthesisUtterance {
  const u = new SpeechSynthesisUtterance(text);
  const voice = pickVoice();
  if (voice) u.voice = voice;
  u.lang = voice?.lang ?? 'en-GB';
  u.rate = 1;
  return u;
}

/** "Test speaker" on the configuration screen. */
export function speakTest() {
  if (!speechSupported()) return;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance('Hello. This is how your interviewer will sound.'));
}

export function useSpeaker(enabled = true) {
  const pending = useRef(0);
  const waiters = useRef<(() => void)[]>([]);
  const [speaking, setSpeaking] = useState(false);

  const settle = useCallback(() => {
    if (pending.current > 0) return;
    setSpeaking(false);
    const w = waiters.current;
    waiters.current = [];
    w.forEach((fn) => fn());
  }, []);

  /** Queue a sentence. */
  const say = useCallback((text: string) => {
    const t = text.trim();
    if (!t || !enabled || !speechSupported()) return;
    pending.current += 1;
    setSpeaking(true);
    const u = utterance(t);
    const finish = () => { pending.current = Math.max(0, pending.current - 1); settle(); };
    u.onend = finish;
    u.onerror = finish;
    window.speechSynthesis.speak(u);
  }, [enabled, settle]);

  /** Resolves once everything queued has been spoken (immediately when nothing is). */
  const whenDone = useCallback(() => new Promise<void>((resolve) => {
    if (pending.current === 0) resolve();
    else waiters.current.push(resolve);
  }), []);

  /** Stop talking now (the candidate started speaking, or the page is closing). */
  const cancel = useCallback(() => {
    if (speechSupported()) window.speechSynthesis.cancel();
    pending.current = 0;
    settle();
  }, [settle]);

  useEffect(() => {
    // Voices load asynchronously in some browsers; asking once warms the list.
    if (speechSupported()) window.speechSynthesis.getVoices();
    return () => { if (speechSupported()) window.speechSynthesis.cancel(); };
  }, []);

  return { say, whenDone, cancel, speaking };
}
