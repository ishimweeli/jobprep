import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import {
  applyResults, enqueueChange, FallbackQueueStore, IndexedDbQueueStore, MemoryQueueStore, mergeQueueOnto, pendingCount, pendingItems,
  rejectItems, toWire, type QueueItem,
} from './queue';

const T1 = '2026-11-02T10:00:00.000Z';
const T2 = '2026-11-02T10:00:05.000Z';
const T3 = '2026-11-02T10:00:09.000Z';

describe('enqueueChange', () => {
  it('keeps one entry per question and field, the latest change winning', () => {
    let q = enqueueChange([], { questionId: 'q1', selected: ['A'] }, T1);
    q = enqueueChange(q, { questionId: 'q1', selected: ['B'] }, T2);
    expect(q).toHaveLength(1);
    expect(q[0]).toMatchObject({ key: 'q1:selected', selected: ['B'], at: T2 });
  });

  it('keeps an answer and a flag on the same question as separate entries with their own times', () => {
    let q = enqueueChange([], { questionId: 'q1', selected: ['A'] }, T1);
    q = enqueueChange(q, { questionId: 'q1', flagged: true }, T2);
    expect(q.map((i) => i.key).sort()).toEqual(['q1:flagged', 'q1:selected']);
    expect(toWire(pendingItems(q))).toEqual([
      { questionId: 'q1', selected: ['A'], at: T1 },
      { questionId: 'q1', flagged: true, at: T2 },
    ]);
  });

  it('never replaces a newer entry with an older one', () => {
    const q = enqueueChange(enqueueChange([], { questionId: 'q1', selected: ['B'] }, T2), { questionId: 'q1', selected: ['A'] }, T1);
    expect(q[0]?.selected).toEqual(['B']);
  });

  it('a change that sets both fields makes two entries', () => {
    const q = enqueueChange([], { questionId: 'q1', selected: ['C'], flagged: false }, T1);
    expect(q).toHaveLength(2);
  });
});

describe('pending count', () => {
  it('counts distinct questions, so "3 answers waiting to save" is 3 questions', () => {
    let q: QueueItem[] = [];
    q = enqueueChange(q, { questionId: 'a', selected: ['A'] }, T1);
    q = enqueueChange(q, { questionId: 'a', flagged: true }, T1);
    q = enqueueChange(q, { questionId: 'b', selected: ['B'] }, T2);
    q = enqueueChange(q, { questionId: 'c', selected: ['C'] }, T3);
    expect(pendingCount(q)).toBe(3);
  });
});

describe('applyResults (ack and drop rules)', () => {
  const q0 = enqueueChange(
    enqueueChange(enqueueChange([], { questionId: 'a', selected: ['A'] }, T1), { questionId: 'b', selected: ['B'] }, T2),
    { questionId: 'c', flagged: true },
    T3,
  );

  it('drops an item only when the response says saved or stale', () => {
    const sent = pendingItems(q0);
    const next = applyResults(q0, sent, [
      { questionId: 'a', status: 'saved' },
      { questionId: 'b', status: 'stale' },
      { questionId: 'c', status: 'rejected', error: 'after_deadline' },
    ]);
    expect(next.map((i) => i.key)).toEqual(['c:flagged']);
    expect(next[0]?.rejected).toBe('after_deadline');
  });

  it('keeps rejected items out of the retry loop and out of the count', () => {
    const sent = pendingItems(q0);
    const next = applyResults(q0, sent, [
      { questionId: 'a', status: 'rejected', error: 'invalid_option' },
      { questionId: 'b', status: 'saved' },
      { questionId: 'c', status: 'saved' },
    ]);
    expect(pendingItems(next)).toHaveLength(0);
    expect(pendingCount(next)).toBe(0);
  });

  it('keeps an item that was changed again while its request was in flight', () => {
    const sent = pendingItems(q0);
    const newer = enqueueChange(q0, { questionId: 'a', selected: ['D'] }, '2026-11-02T10:01:00.000Z');
    const next = applyResults(newer, sent, sent.map((s) => ({ questionId: s.questionId, status: 'saved' as const })));
    expect(next.map((i) => [i.key, i.selected])).toEqual([['a:selected', ['D']]]);
  });

  it('keeps items the response does not mention', () => {
    const sent = pendingItems(q0);
    const next = applyResults(q0, sent, [{ questionId: 'a', status: 'saved' }]);
    expect(next).toHaveLength(2);
  });

  it('rejectItems takes a whole refused batch out of the loop', () => {
    const sent = pendingItems(q0);
    expect(pendingItems(rejectItems(q0, sent, 'validation_error'))).toHaveLength(0);
  });
});

describe('mergeQueueOnto (resume)', () => {
  it('lays the unsent queue on top of the server state', () => {
    const server = { a: { selected: ['A'], flagged: false }, b: { selected: [], flagged: true } };
    let q = enqueueChange([], { questionId: 'a', selected: ['C'] }, T1);
    q = enqueueChange(q, { questionId: 'b', flagged: false }, T2);
    q = enqueueChange(q, { questionId: 'z', selected: ['B'] }, T3);
    expect(mergeQueueOnto(server, q)).toEqual({
      a: { selected: ['C'], flagged: false },
      b: { selected: [], flagged: false },
      z: { selected: ['B'], flagged: false },
    });
    expect(server.a.selected).toEqual(['A']); // the server copy is not mutated
  });

  it('ignores rejected entries', () => {
    const base = enqueueChange([], { questionId: 'a', selected: ['C'] }, T1);
    const q = rejectItems(base, base, 'x');
    expect(mergeQueueOnto({ a: { selected: ['A'], flagged: false } }, q).a?.selected).toEqual(['A']);
  });
});

describe('stores', () => {
  const items = enqueueChange([], { questionId: 'a', selected: ['A'] }, T1);

  it('IndexedDB: one record per attempt id, survives a new store instance (a refresh)', async () => {
    const factory = new IDBFactory();
    const first = new IndexedDbQueueStore(factory);
    await first.save('att1', items);
    await first.save('att2', []);
    const second = new IndexedDbQueueStore(factory);
    expect(await second.load('att1')).toEqual(items);
    expect(await second.load('missing')).toEqual([]);
    await second.clear('att1');
    expect(await second.load('att1')).toEqual([]);
  });

  it('falls back to memory when IndexedDB throws', async () => {
    const broken = {
      load: () => Promise.reject(new Error('x')),
      save: () => Promise.reject(new Error('x')),
      clear: () => Promise.reject(new Error('x')),
    };
    const store = new FallbackQueueStore(broken, new MemoryQueueStore());
    await store.save('a', items);
    expect(await store.load('a')).toEqual(items);
  });
});
