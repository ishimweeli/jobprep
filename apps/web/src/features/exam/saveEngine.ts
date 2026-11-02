import { ApiError } from '../../api/client';
import type { AttemptStatus, SaveAnswersResponse, SubmitResponse } from '../../api/types';
import {
  applyResults, enqueueChange, pendingCount, pendingItems, rejectItems, toWire,
  type NewChange, type QueueItem, type QueueStore,
} from './queue';

export type Connection = 'online' | 'offline' | 'retrying';

export interface EngineSnapshot {
  /** Questions with an unsent change. */
  pending: number;
  connection: Connection;
  /** An unsent change has been waiting for more than `STALE_AFTER_MS`. */
  stale: boolean;
  /** The server closed the attempt (409 attempt_closed or 404): nothing more can be saved. */
  closed: boolean;
  /** `true` when the header should say "N answers waiting to save" instead of "All answers saved". */
  waiting: boolean;
}

export interface EngineDeps {
  attemptId: string;
  store: QueueStore;
  save: (attemptId: string, changes: ReturnType<typeof toWire>) => Promise<SaveAnswersResponse>;
  submit: (attemptId: string, changes: ReturnType<typeof toWire>) => Promise<SubmitResponse>;
  /** Best-effort send that may outlive the page (used on pagehide). */
  saveKeepalive?: (attemptId: string, changes: ReturnType<typeof toWire>) => Promise<unknown>;
  now?: () => Date;
  isOnline?: () => boolean;
  /** Called when a save response shows the attempt is no longer in progress (time ran out). */
  onStatus?: (status: AttemptStatus, response: SaveAnswersResponse) => void;
  /** Called when the server says the attempt is closed for good. */
  onClosed?: () => void;
  debounceMs?: number;
  /** Retry delays after consecutive failures; the last one repeats. */
  backoffMs?: number[];
  maxBatch?: number;
}

export const DEFAULT_DEBOUNCE_MS = 300;
export const DEFAULT_BACKOFF_MS = [1000, 2000, 4000, 8000, 15_000, 30_000];
/** A change unsent for longer than this shows as "waiting to save" even when we think we are online. */
export const STALE_AFTER_MS = 3000;

/**
 * Autosave. `enqueue` writes the change to the local queue immediately (so a refresh keeps it) and sends it
 * after a short debounce. Failures retry with backoff; the browser's `online` event retries at once. An item
 * leaves the queue only when the server answers saved/stale for it. Sending the same change twice is safe.
 */
export class SaveEngine {
  private items: QueueItem[] = [];
  private connection: Connection = 'online';
  private closed = false;
  private failures = 0;
  private inFlight: Promise<void> | null = null;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private staleTimer: ReturnType<typeof setTimeout> | null = null;
  private listeners = new Set<() => void>();
  private snapshot: EngineSnapshot;
  private persisting: Promise<void> = Promise.resolve();
  private destroyed = false;

  constructor(private deps: EngineDeps) {
    this.snapshot = this.compute();
  }

  private get now() {
    return (this.deps.now ?? (() => new Date()))();
  }
  private get online() {
    return (this.deps.isOnline ?? (() => (typeof navigator === 'undefined' ? true : navigator.onLine)))();
  }

  /** Load whatever an earlier page load left unsent. Returns it so the screen can merge it onto the server state. */
  async load(): Promise<QueueItem[]> {
    this.items = await this.deps.store.load(this.deps.attemptId);
    if (!this.online) this.connection = 'offline';
    this.emit();
    if (pendingItems(this.items).length > 0) this.schedule(0);
    return this.items;
  }

  getSnapshot = (): EngineSnapshot => this.snapshot;

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  /** Items currently in the queue (a copy). */
  queue(): QueueItem[] {
    return [...this.items];
  }

  enqueue(change: NewChange): void {
    if (this.closed) return;
    this.items = enqueueChange(this.items, change, this.now.toISOString());
    this.persist();
    this.emit();
    this.armStaleTimer();
    this.schedule(this.deps.debounceMs ?? DEFAULT_DEBOUNCE_MS);
  }

  /** Replace the callbacks (the screen that owns the engine re-binds them as its handlers change). */
  setCallbacks(cb: Pick<EngineDeps, 'onStatus' | 'onClosed'>): void {
    this.deps = { ...this.deps, ...cb };
  }

  /** (Re)start after a mount: React StrictMode mounts, unmounts and mounts again. */
  attach(): void {
    this.destroyed = false;
    if (pendingItems(this.items).length > 0 && !this.closed) this.schedule(0);
  }

  /** The browser says the connection is back: retry immediately. */
  notifyOnline(): void {
    this.failures = 0;
    this.connection = 'online';
    this.emit();
    this.schedule(0);
  }

  notifyOffline(): void {
    this.connection = 'offline';
    this.emit();
  }

  destroy(): void {
    this.destroyed = true;
    for (const t of [this.debounceTimer, this.retryTimer, this.staleTimer]) if (t) clearTimeout(t);
    this.listeners.clear();
  }

  /**
   * The page is going away (tab closed, navigation): fire what is unsent with `keepalive` so it still reaches the
   * server. The queue is kept (the server answer cannot be read), and a later load simply resends it: that is safe.
   */
  flushOnHide(): void {
    const pend = pendingItems(this.items).slice(0, this.deps.maxBatch ?? 100);
    if (this.closed || pend.length === 0 || !this.deps.saveKeepalive) return;
    void this.deps.saveKeepalive(this.deps.attemptId, toWire(pend)).catch(() => undefined);
  }

  /** Send everything now and wait until the queue is empty or a send fails. */
  async flushNow(): Promise<void> {
    this.clearTimers();
    for (let guard = 0; guard < 20; guard++) {
      await this.sendOnce();
      if (this.closed || pendingItems(this.items).length === 0 || this.failures > 0) return;
    }
  }

  /**
   * Submit the exam. Anything unsent travels with the submit call (the first 100 in chunks before it). A failure
   * (offline) throws and leaves the queue untouched so the candidate can try again.
   */
  async submit(): Promise<SubmitResponse> {
    this.clearTimers();
    await this.inFlight?.catch(() => undefined);
    const max = this.deps.maxBatch ?? 100;
    const pend = pendingItems(this.items);
    const head = pend.slice(0, Math.max(0, pend.length - max));
    for (let i = 0; i < head.length; i += max) {
      const chunk = head.slice(i, i + max);
      const res = await this.deps.save(this.deps.attemptId, toWire(chunk));
      this.items = applyResults(this.items, chunk, res.results);
    }
    const last = pendingItems(this.items);
    const out = await this.deps.submit(this.deps.attemptId, toWire(last));
    this.closed = true;
    this.items = [];
    await this.persisting;
    await this.deps.store.clear(this.deps.attemptId).catch(() => undefined);
    this.emit();
    return out;
  }

  // ───────────────────────── internals

  private compute(): EngineSnapshot {
    const pending = pendingCount(this.items);
    const oldest = pendingItems(this.items)[0];
    const stale = !!oldest && this.now.getTime() - Date.parse(oldest.at) > STALE_AFTER_MS;
    return {
      pending,
      connection: this.connection,
      stale,
      closed: this.closed,
      waiting: pending > 0 && (this.connection !== 'online' || stale),
    };
  }

  private emit(): void {
    if (this.destroyed) return;
    const next = this.compute();
    const prev = this.snapshot;
    if (
      next.pending === prev.pending && next.connection === prev.connection && next.stale === prev.stale &&
      next.closed === prev.closed && next.waiting === prev.waiting
    ) return;
    this.snapshot = next;
    for (const l of this.listeners) l();
  }

  private persist(): void {
    const copy = this.items;
    this.persisting = this.persisting
      .then(() => this.deps.store.save(this.deps.attemptId, copy))
      .catch(() => undefined);
  }

  private armStaleTimer(): void {
    if (this.staleTimer) clearTimeout(this.staleTimer);
    this.staleTimer = setTimeout(() => this.emit(), STALE_AFTER_MS + 50);
  }

  private clearTimers(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.debounceTimer = null;
    this.retryTimer = null;
  }

  private schedule(delayMs: number): void {
    if (this.closed || this.destroyed) return;
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      void this.sendOnce();
    }, delayMs);
  }

  private sendOnce(): Promise<void> {
    if (this.inFlight) return this.inFlight;
    this.inFlight = this.runSend().finally(() => {
      this.inFlight = null;
    });
    return this.inFlight;
  }

  private async runSend(): Promise<void> {
    if (this.closed || this.destroyed) return;
    const pend = pendingItems(this.items);
    if (pend.length === 0) {
      this.connection = 'online';
      this.emit();
      return;
    }
    const batch = pend.slice(0, this.deps.maxBatch ?? 100);
    try {
      const res = await this.deps.save(this.deps.attemptId, toWire(batch));
      this.items = applyResults(this.items, batch, res.results);
      this.failures = 0;
      this.connection = 'online';
      this.persist();
      this.emit();
      if (res.status !== 'IN_PROGRESS') this.deps.onStatus?.(res.status, res);
      if (pendingItems(this.items).length > 0) this.schedule(0);
    } catch (e) {
      if (e instanceof ApiError && (e.code === 'attempt_closed' || e.status === 404)) {
        this.closed = true;
        this.items = [];
        this.persist();
        this.emit();
        this.deps.onClosed?.();
        return;
      }
      if (e instanceof ApiError && e.status === 400) {
        // The server will never accept this batch: take it out of the retry loop instead of looping forever.
        this.items = rejectItems(this.items, batch, e.code);
        this.persist();
        this.emit();
        if (pendingItems(this.items).length > 0) this.schedule(0);
        return;
      }
      this.failures += 1;
      this.connection = this.online ? 'retrying' : 'offline';
      this.emit();
      const steps = this.deps.backoffMs ?? DEFAULT_BACKOFF_MS;
      const delay = steps[Math.min(this.failures - 1, steps.length - 1)] ?? 30_000;
      if (this.retryTimer) clearTimeout(this.retryTimer);
      if (!this.destroyed && !this.closed) {
        this.retryTimer = setTimeout(() => {
          this.retryTimer = null;
          void this.sendOnce();
        }, delay);
      }
    }
  }
}
