import type { InterviewRole } from '@prisma/client';
import type { LlmMessage } from './llm';

/**
 * Pure pieces of the conversation engine: the markers the interviewer writes ([[topic:t3]] at the start,
 * [[end]] at the end) are removed from the text while it streams, and the conversation sent to the model is a
 * rolling summary plus a window of recent turns (never the whole history, never the raw job description).
 */
const END = '[[end]]';
const TOPIC_RE = /^\s*\[\[topic:([a-z0-9_-]{1,20})\]\]\s*/i;
const TAG_START = '[[topic:';
/** The start of the reply so far may still turn into a topic tag. */
const couldBeTag = (h: string) =>
  h.length <= TAG_START.length ? TAG_START.startsWith(h.toLowerCase()) : h.toLowerCase().startsWith(TAG_START) && !h.includes(']]');

export class MarkerStripper {
  private head = '';
  private headDone = false;
  private tail = '';
  topicId: string | null = null;
  ended = false;

  /** Feed a chunk; returns the text that is safe to show/speak now. */
  push(chunk: string): string {
    let text = chunk;
    if (!this.headDone) {
      this.head += text;
      const m = TOPIC_RE.exec(this.head);
      if (m) {
        this.topicId = m[1]!.toLowerCase() === 'none' ? null : m[1]!;
        text = this.head.slice(m[0].length);
        this.headDone = true;
      } else if (couldBeTag(this.head.trimStart()) && this.head.length < 40) {
        return ''; // still reading a possible tag
      } else {
        text = this.head;
        this.headDone = true;
      }
    }
    // Hold back a few characters: "[[end]]" may be split across chunks.
    const all = this.tail + text;
    const cut = Math.max(0, all.length - END.length);
    this.tail = all.slice(cut);
    return this.clean(all.slice(0, cut));
  }

  /** The rest of the text once the stream is over. */
  finish(): string {
    if (!this.headDone) {
      const m = TOPIC_RE.exec(this.head);
      this.tail = m ? this.head.slice(m[0].length) : this.head;
      if (m) this.topicId = m[1]!.toLowerCase() === 'none' ? null : m[1]!;
      this.headDone = true;
    }
    const rest = this.tail;
    this.tail = '';
    return this.clean(rest);
  }

  private started = false;

  private clean(s: string): string {
    if (s.toLowerCase().includes(END)) this.ended = true;
    // Any stray tag the model put mid-text is dropped too.
    let out = s.replace(/\[\[end\]\]/gi, '').replace(/\[\[topic:[^\]]*\]\]/gi, '');
    // The space after the tag may arrive in a later chunk: nothing spoken starts with whitespace.
    if (!this.started) {
      out = out.trimStart();
      this.started = out.length > 0;
    }
    return out;
  }
}

/** Strip the markers from a whole reply (non-streaming). */
export function stripMarkers(text: string): { text: string; topicId: string | null; ended: boolean } {
  const s = new MarkerStripper();
  const out = (s.push(text) + s.finish()).trim();
  return { text: out, topicId: s.topicId, ended: s.ended };
}

export interface TurnRow { seq: number; role: InterviewRole; text: string }

/** About this many recent turns are sent verbatim; older ones are folded into the summary. */
export const WINDOW_TURNS = 12;
/** Summarise when this many turns are outside the summary (so the window never exceeds it by much). */
export const SUMMARY_TRIGGER = WINDOW_TURNS + 6;

/**
 * The conversation for the next interviewer turn. `turns` are the turns after the summary, oldest first; the
 * last one may be the candidate's new answer, which gets the state note appended.
 */
export function buildMessages(opts: { summary: string | null; turns: TurnRow[]; opening: string; note: string }): LlmMessage[] {
  // The summariser keeps the turns outside the summary between WINDOW_TURNS / 2 and SUMMARY_TRIGGER.
  const recent = [...opts.turns];
  // The conversation must start with a user message and alternate. Begin the window at an interviewer turn.
  while (recent.length && recent[0]!.role === 'CANDIDATE') recent.shift();
  const intro = opts.summary
    ? `[Interviewer notes: the interview is under way. Summary of the earlier part:\n${opts.summary}\nThe conversation continues below.]`
    : opts.opening;
  const messages: LlmMessage[] = [{ role: 'user', content: intro }];
  for (const t of recent) {
    const role = t.role === 'INTERVIEWER' ? 'assistant' : 'user';
    const last = messages[messages.length - 1]!;
    if (last.role === role) last.content += `\n\n${t.text}`; // never two in a row
    else messages.push({ role, content: t.text });
  }
  const last = messages[messages.length - 1]!;
  if (last.role === 'user') last.content += `\n\n${opts.note}`;
  else messages.push({ role: 'user', content: opts.note }); // e.g. the candidate stayed silent and asked to continue
  return messages;
}
