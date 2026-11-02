import type { AnswerChangeDto, ChangeResult } from '../../api/types';

/**
 * The local save queue. Every answer / flag change is written here first (IndexedDB, keyed by attempt id)
 * and removed only when the server has acknowledged it, so changes survive a refresh and an offline period.
 *
 * One entry per question and field: a newer change replaces an older one (the server keeps the latest per
 * field anyway), so the queue never grows beyond 2 entries per question.
 */
export type ChangeField = 'selected' | 'flagged';

export interface QueueItem {
  /** `${questionId}:${field}` */
  key: string;
  questionId: string;
  field: ChangeField;
  selected?: string[];
  flagged?: boolean;
  /** When the candidate made the change (ISO). Sent as `at`; the server resolves conflicts per field by it. */
  at: string;
  /** Set when the server refused the change for good: it stays out of the retry loop and the "waiting" count. */
  rejected?: string;
}

export interface NewChange {
  questionId: string;
  selected?: string[];
  flagged?: boolean;
}

export const itemKey = (questionId: string, field: ChangeField) => `${questionId}:${field}`;

/** Add (or replace) the entries for a change. The newest `at` per key wins; equal timestamps keep the later call. */
export function enqueueChange(items: QueueItem[], change: NewChange, at: string): QueueItem[] {
  let next = items;
  const put = (item: QueueItem) => {
    const existing = next.find((i) => i.key === item.key);
    if (existing && existing.at > item.at) return; // never replace a newer change with an older one
    next = [...next.filter((i) => i.key !== item.key), item];
  };
  if (change.selected !== undefined) {
    put({ key: itemKey(change.questionId, 'selected'), questionId: change.questionId, field: 'selected', selected: [...change.selected], at });
  }
  if (change.flagged !== undefined) {
    put({ key: itemKey(change.questionId, 'flagged'), questionId: change.questionId, field: 'flagged', flagged: change.flagged, at });
  }
  return next;
}

/** Entries that still have to be sent (rejected ones are out of the loop), oldest change first. */
export const pendingItems = (items: QueueItem[]): QueueItem[] =>
  items.filter((i) => !i.rejected).sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));

/** "N answers waiting to save": distinct questions with something unsent. */
export const pendingCount = (items: QueueItem[]): number => new Set(pendingItems(items).map((i) => i.questionId)).size;

/** One wire change per entry (a flag and an answer on the same question travel separately, each with its own time). */
export function toWire(items: QueueItem[]): AnswerChangeDto[] {
  return items.map((i) =>
    i.field === 'selected'
      ? { questionId: i.questionId, selected: i.selected ?? [], at: i.at }
      : { questionId: i.questionId, flagged: i.flagged ?? false, at: i.at },
  );
}

/**
 * Apply the server's per-change results to the queue. `sent` is the exact list that was sent, in order, and
 * `results[i]` answers `sent[i]`.
 *  - saved / stale: the server has it (or has something newer), so the entry is dropped, unless the user changed
 *    the same field again while the request was in flight (then the entry's `at` differs and it stays).
 *  - rejected: kept but flagged, so it is never retried and never counted.
 *  - no result for an entry: it stays and is retried.
 */
export function applyResults(items: QueueItem[], sent: QueueItem[], results: ChangeResult[]): QueueItem[] {
  let next = items;
  sent.forEach((s, i) => {
    const r = results[i];
    if (!r || r.questionId !== s.questionId) return;
    const current = next.find((x) => x.key === s.key);
    if (!current || current.at !== s.at) return; // superseded while in flight
    if (r.status === 'saved' || r.status === 'stale') next = next.filter((x) => x.key !== s.key);
    else next = next.map((x) => (x.key === s.key ? { ...x, rejected: r.error ?? 'rejected' } : x));
  });
  return next;
}

/** Mark entries as refused for good (e.g. the server answered 400 for the whole batch). */
export function rejectItems(items: QueueItem[], sent: QueueItem[], reason: string): QueueItem[] {
  const keys = new Map(sent.map((s) => [s.key, s.at]));
  return items.map((i) => (keys.get(i.key) === i.at ? { ...i, rejected: reason } : i));
}

export type LocalAnswers = Record<string, { selected: string[]; flagged: boolean }>;

/**
 * Resume: start from the server's state and lay the unsent queue on top, oldest first, so what the
 * candidate did last on this device wins locally. The server then resolves it per field by timestamp.
 */
export function mergeQueueOnto(server: LocalAnswers, items: QueueItem[]): LocalAnswers {
  const merged: LocalAnswers = Object.fromEntries(
    Object.entries(server).map(([k, v]) => [k, { selected: [...v.selected], flagged: v.flagged }]),
  );
  for (const i of pendingItems(items)) {
    const cur = merged[i.questionId] ?? { selected: [], flagged: false };
    if (i.field === 'selected') cur.selected = [...(i.selected ?? [])];
    else cur.flagged = i.flagged ?? false;
    merged[i.questionId] = cur;
  }
  return merged;
}

// ───────────────────────── Persistence

export interface QueueStore {
  load(attemptId: string): Promise<QueueItem[]>;
  save(attemptId: string, items: QueueItem[]): Promise<void>;
  clear(attemptId: string): Promise<void>;
}

export class MemoryQueueStore implements QueueStore {
  private data = new Map<string, QueueItem[]>();
  async load(attemptId: string) {
    return structuredClone(this.data.get(attemptId) ?? []);
  }
  async save(attemptId: string, items: QueueItem[]) {
    this.data.set(attemptId, structuredClone(items));
  }
  async clear(attemptId: string) {
    this.data.delete(attemptId);
  }
}

const DB_NAME = 'jobprep-exam';
const STORE = 'queues';

/** IndexedDB-backed store: one record per attempt id. */
export class IndexedDbQueueStore implements QueueStore {
  private dbPromise: Promise<IDBDatabase> | null = null;

  constructor(private readonly factory: IDBFactory = indexedDB) {}

  private db(): Promise<IDBDatabase> {
    this.dbPromise ??= new Promise((resolve, reject) => {
      const req = this.factory.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        req.result.createObjectStore(STORE, { keyPath: 'attemptId' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error('indexeddb_open_failed'));
    });
    return this.dbPromise;
  }

  private async run<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    const db = await this.db();
    return new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = () => reject(tx.error ?? new Error('indexeddb_failed'));
      tx.onabort = () => reject(tx.error ?? new Error('indexeddb_aborted'));
    });
  }

  async load(attemptId: string): Promise<QueueItem[]> {
    const row = await this.run<{ attemptId: string; items: QueueItem[] } | undefined>('readonly', (s) => s.get(attemptId));
    return row?.items ?? [];
  }

  async save(attemptId: string, items: QueueItem[]): Promise<void> {
    await this.run('readwrite', (s) => s.put({ attemptId, items, updatedAt: Date.now() }));
  }

  async clear(attemptId: string): Promise<void> {
    await this.run('readwrite', (s) => s.delete(attemptId));
  }
}

/** Tries IndexedDB first and silently degrades to memory if it throws (quota, private mode). */
export class FallbackQueueStore implements QueueStore {
  private broken = false;
  constructor(private readonly primary: QueueStore, private readonly backup: QueueStore) {}

  private async guard<T>(op: (s: QueueStore) => Promise<T>): Promise<T> {
    if (!this.broken) {
      try {
        return await op(this.primary);
      } catch {
        this.broken = true;
      }
    }
    return op(this.backup);
  }
  load(attemptId: string) {
    return this.guard((s) => s.load(attemptId));
  }
  save(attemptId: string, items: QueueItem[]) {
    return this.guard((s) => s.save(attemptId, items));
  }
  clear(attemptId: string) {
    return this.guard((s) => s.clear(attemptId));
  }
}

/**
 * IndexedDB when the browser has it. A private window or blocked storage falls back to memory: the exam still
 * works, but a refresh while offline would lose the unsent changes (the server copy is always loaded first).
 */
export function createQueueStore(): QueueStore {
  try {
    if (typeof indexedDB !== 'undefined') return new FallbackQueueStore(new IndexedDbQueueStore(), new MemoryQueueStore());
  } catch {
    /* fall through */
  }
  return new MemoryQueueStore();
}
