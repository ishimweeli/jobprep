import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../api/client';
import type { SaveAnswersResponse } from '../../api/types';
import { MemoryQueueStore } from './queue';
import { SaveEngine } from './saveEngine';

const timer = { remainingSeconds: 100, serverNow: '', deadlineAt: '', low: false, expired: false };
type Change = { questionId: string };
const ok = (changes: Change[], status: SaveAnswersResponse['status'] = 'IN_PROGRESS'): SaveAnswersResponse => ({
  results: changes.map((c) => ({ questionId: c.questionId, status: 'saved' as const })),
  savedAt: '',
  status,
  timer,
  counts: { total: 3, answered: 1, flagged: 0 },
});
const offlineError = () => new ApiError(0, 'network_error');

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function make(save: (id: string, changes: any[]) => Promise<SaveAnswersResponse>, extra: Partial<ConstructorParameters<typeof SaveEngine>[0]> = {}) {
  const store = new MemoryQueueStore();
  const submit = vi.fn(async () => ({
    status: 'SUBMITTED' as const, autoSubmitted: false, submittedAt: '', counts: { total: 3, answered: 1, flagged: 0 }, unanswered: 2,
  }));
  const saveFn = vi.fn(save);
  const engine = new SaveEngine({ attemptId: 'att', store, save: saveFn, submit, isOnline: () => true, ...extra });
  return { engine, store, submit, save: saveFn };
}

describe('SaveEngine', () => {
  it('debounces: several quick changes make one request', async () => {
    const { engine, save } = make(async (_id, changes) => ok(changes));
    engine.enqueue({ questionId: 'a', selected: ['A'] });
    engine.enqueue({ questionId: 'a', selected: ['B'] });
    engine.enqueue({ questionId: 'b', flagged: true });
    expect(save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(300);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0]?.[1]).toHaveLength(2);
    expect(engine.getSnapshot().pending).toBe(0);
    expect(engine.getSnapshot().waiting).toBe(false);
  });

  it('writes to the local queue immediately, before anything is sent', async () => {
    const { engine, store } = make(async () => {
      throw offlineError();
    });
    engine.enqueue({ questionId: 'a', selected: ['A'] });
    await vi.advanceTimersByTimeAsync(0);
    expect((await store.load('att'))[0]).toMatchObject({ questionId: 'a', selected: ['A'] });
  });

  it('offline: keeps the queue, backs off, shows N waiting, and flushes when the browser says it is online', async () => {
    let online = false;
    const { engine, store, save } = make(
      async (_id, changes) => {
        if (!online) throw offlineError();
        return ok(changes);
      },
      { isOnline: () => online },
    );
    engine.notifyOffline();
    for (const id of ['a', 'b', 'c']) engine.enqueue({ questionId: id, selected: ['A'] });
    await vi.advanceTimersByTimeAsync(300);
    expect(engine.getSnapshot()).toMatchObject({ pending: 3, connection: 'offline', waiting: true });
    const first = save.mock.calls.length;
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(2000);
    expect(save.mock.calls.length).toBeGreaterThan(first);
    expect(engine.getSnapshot().pending).toBe(3);

    online = true;
    engine.notifyOnline();
    await vi.advanceTimersByTimeAsync(0);
    expect(engine.getSnapshot()).toMatchObject({ pending: 0, connection: 'online', waiting: false });
    expect(await store.load('att')).toEqual([]);
  });

  it('backoff grows and is capped', async () => {
    const { engine, save } = make(
      async () => {
        throw new ApiError(503, 'unavailable');
      },
      { backoffMs: [100, 200, 400] },
    );
    engine.enqueue({ questionId: 'a', selected: ['A'] });
    await vi.advanceTimersByTimeAsync(300);
    expect(save).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(100);
    expect(save).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(200);
    expect(save).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(400);
    await vi.advanceTimersByTimeAsync(400);
    expect(save).toHaveBeenCalledTimes(5);
    expect(engine.getSnapshot().connection).toBe('retrying');
  });

  it('a stale answer also leaves the queue (the server has something newer)', async () => {
    const { engine } = make(async (_id, changes) => ({
      ...ok(changes),
      results: changes.map((c: Change) => ({ questionId: c.questionId, status: 'stale' as const })),
    }));
    engine.enqueue({ questionId: 'a', selected: ['A'] });
    await vi.advanceTimersByTimeAsync(300);
    expect(engine.getSnapshot().pending).toBe(0);
  });

  it('rejected changes are not retried and are not counted', async () => {
    const { engine, save } = make(async () => ({
      ...ok([]),
      results: [{ questionId: 'a', status: 'rejected' as const, error: 'after_deadline' as const }],
    }));
    engine.enqueue({ questionId: 'a', selected: ['A'] });
    await vi.advanceTimersByTimeAsync(300);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(save).toHaveBeenCalledTimes(1);
    expect(engine.getSnapshot().pending).toBe(0);
  });

  it('409 attempt_closed stops everything and tells the screen', async () => {
    const onClosed = vi.fn();
    const { engine, save } = make(
      async () => {
        throw new ApiError(409, 'attempt_closed');
      },
      { onClosed },
    );
    engine.enqueue({ questionId: 'a', selected: ['A'] });
    await vi.advanceTimersByTimeAsync(300);
    expect(onClosed).toHaveBeenCalledTimes(1);
    expect(engine.getSnapshot().closed).toBe(true);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(save).toHaveBeenCalledTimes(1);
    engine.enqueue({ questionId: 'b', selected: ['B'] });
    expect(engine.getSnapshot().pending).toBe(0);
  });

  it('reports a status other than IN_PROGRESS (time ran out) to the screen', async () => {
    const onStatus = vi.fn();
    const { engine } = make(async (_id, changes) => ok(changes, 'AUTO_SUBMITTED'), { onStatus });
    engine.enqueue({ questionId: 'a', selected: ['A'] });
    await vi.advanceTimersByTimeAsync(300);
    expect(onStatus).toHaveBeenCalledWith('AUTO_SUBMITTED', expect.anything());
  });

  it('load() picks up what an earlier page load left unsent and sends it', async () => {
    const save = vi.fn(async (_id: string, changes: Change[]) => ok(changes));
    const store = new MemoryQueueStore();
    await store.save('att', [{ key: 'a:selected', questionId: 'a', field: 'selected', selected: ['C'], at: '2026-11-02T10:00:00.000Z' }]);
    const engine = new SaveEngine({ attemptId: 'att', store, save, submit: vi.fn(), isOnline: () => true });
    const items = await engine.load();
    expect(items).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(0);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0]?.[1]).toEqual([{ questionId: 'a', selected: ['C'], at: '2026-11-02T10:00:00.000Z' }]);
  });

  it('submit sends the unsent queue with the submit call, then clears it', async () => {
    const { engine, store, submit } = make(async () => {
      throw offlineError();
    });
    engine.enqueue({ questionId: 'a', selected: ['A'] });
    engine.enqueue({ questionId: 'b', flagged: true });
    const out = await engine.submit();
    expect(out.status).toBe('SUBMITTED');
    expect(submit).toHaveBeenCalledWith(
      'att',
      expect.arrayContaining([expect.objectContaining({ questionId: 'a' }), expect.objectContaining({ questionId: 'b' })]),
    );
    expect(await store.load('att')).toEqual([]);
  });

  it('a failed submit (offline) throws and keeps the queue', async () => {
    const { engine, store } = make(async () => {
      throw offlineError();
    });
    (engine as unknown as { deps: { submit: unknown } }).deps.submit = async () => {
      throw offlineError();
    };
    engine.enqueue({ questionId: 'a', selected: ['A'] });
    await expect(engine.submit()).rejects.toBeInstanceOf(ApiError);
    await vi.advanceTimersByTimeAsync(0);
    expect(await store.load('att')).toHaveLength(1);
  });

  it('shows "waiting" after 3 s even when online (a slow save), not for a quick one', async () => {
    let release: (() => void) | undefined;
    const { engine } = make(
      (_id, changes) =>
        new Promise<SaveAnswersResponse>((res) => {
          release = () => res(ok(changes));
        }),
    );
    engine.enqueue({ questionId: 'a', selected: ['A'] });
    await vi.advanceTimersByTimeAsync(300);
    expect(engine.getSnapshot().waiting).toBe(false);
    await vi.advanceTimersByTimeAsync(3000);
    expect(engine.getSnapshot().waiting).toBe(true);
    release?.();
    await vi.advanceTimersByTimeAsync(0);
    expect(engine.getSnapshot().waiting).toBe(false);
  });
});
