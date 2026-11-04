import { describe, expect, it } from 'vitest';
import type { ExamRequestGroup } from '../../api/questions-demand';
import { canNotify, doneNote, emailWords, markDoneBody, markDoneResult, notifyResult, parseRequestsQuery, planExamUrl, requestLine, requestsSearch, waitingLine, waitingSearch } from './demandModel';

const g: ExamRequestGroup = {
  key: 'veterinary officer|RW', query: 'Veterinary officer', countryCode: 'RW', count: 7, withEmail: 3, firstAt: '2026-10-20T10:00:00Z', lastAt: '2026-11-01T10:00:00Z',
  status: 'OPEN', doneAt: null, doneNote: null, doneBy: null,
};

describe('exam requests', () => {
  it('the line is written as the brief says: grouped by search, with the count and the last date', () => {
    expect(requestLine(g)).toBe('Veterinary officer — 7 requests, last 1 Nov');
    expect(requestLine({ ...g, count: 1 })).toBe('Veterinary officer — 1 request, last 1 Nov');
  });
  it('email words', () => {
    expect(emailWords(0)).toBe('No email addresses');
    expect(emailWords(1)).toBe('1 left an email address');
    expect(emailWords(3)).toBe('3 left an email address');
  });
  it('Plan exam opens the mock test form with the search as title and the country', () => {
    expect(planExamUrl(g)).toBe('/admin/exams/new?title=Veterinary+officer&country=RW');
    expect(new URL(planExamUrl({ query: 'Tax & customs / audit', countryCode: 'KE' }), 'http://x').searchParams.get('title')).toBe('Tax & customs / audit');
  });
  it('query string: open and page 1 are the defaults', () => {
    expect(parseRequestsQuery(new URLSearchParams(''))).toEqual({ status: 'open', q: '', page: 1 });
    expect(parseRequestsQuery(new URLSearchParams('status=done&q=vet%20&page=3'))).toEqual({ status: 'done', q: 'vet', page: 3 });
    expect(parseRequestsQuery(new URLSearchParams('status=nonsense&page=0')).status).toBe('open');
    const cur = { status: 'open' as const, q: '', page: 2 };
    expect(requestsSearch({ status: 'done' }, cur)).toBe('?status=done');
    expect(requestsSearch({ q: 'vet' }, cur)).toBe('?q=vet');
    expect(requestsSearch({ page: 2 }, cur)).toBe('?page=2');
    expect(requestsSearch({}, { status: 'open', q: '', page: 1 })).toBe('');
  });
  it('Mark done sends the group and only the options that were chosen', () => {
    expect(markDoneBody(g, { reason: '', notify: false, mockTestId: '' })).toEqual({ countryCode: 'RW', query: 'Veterinary officer' });
    expect(markDoneBody(g, { reason: ' added ', notify: true, mockTestId: 'm1' })).toEqual({ countryCode: 'RW', query: 'Veterinary officer', reason: 'added', notify: true, mockTestId: 'm1' });
  });
  it('the result sentence', () => {
    expect(markDoneResult({ marked: 7, notified: 3 })).toBe('Marked 7 requests done, 3 emails sent.');
    expect(markDoneResult({ marked: 1, notified: 0 })).toBe('Marked 1 request done.');
    expect(markDoneResult({ marked: 2, notified: 1 })).toBe('Marked 2 requests done, 1 email sent.');
  });
  it('who marked it done', () => {
    expect(doneNote({ doneAt: '2026-11-02T10:00:00Z', doneBy: 'Jean', doneNote: 'Added' })).toBe('Done 2 Nov by Jean · Added');
  });
});

describe('waiting list', () => {
  it('counts and who was told', () => {
    expect(waitingLine({ count: 12, notified: 0 })).toBe('12 people waiting');
    expect(waitingLine({ count: 1, notified: 1 })).toBe('1 person waiting · 1 told');
  });
  it('can only tell people when the country is Live and somebody has not been told', () => {
    expect(canNotify({ status: 'LIVE', count: 5, notified: 2 })).toBe(true);
    expect(canNotify({ status: 'LIVE', count: 5, notified: 5 })).toBe(false);
    expect(canNotify({ status: 'PREPARING', count: 5, notified: 0 })).toBe(false);
  });
  it('result sentence and query string', () => {
    expect(notifyResult(3)).toBe('3 emails sent.');
    expect(notifyResult(0)).toMatch(/Nobody to tell/);
    expect(waitingSearch('KE', 1)).toBe('?country=KE');
    expect(waitingSearch('KE', 2)).toBe('?country=KE&page=2');
    expect(waitingSearch(null, 1)).toBe('');
  });
});
