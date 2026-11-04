import { describe, expect, it } from 'vitest';
import { closeBody, countWords, EMPTY_TEXT, latestMessage, parseReportsQuery, reportsSearch, summaryLine } from './reportsModel';

describe('reports queue model', () => {
  it('the filter lives in the query string; Open is the default', () => {
    expect(parseReportsQuery(new URLSearchParams(''))).toEqual({ status: 'OPEN', page: 1 });
    expect(parseReportsQuery(new URLSearchParams('status=resolved'))).toEqual({ status: 'RESOLVED', page: 1 });
    expect(parseReportsQuery(new URLSearchParams('status=dismissed&page=2'))).toEqual({ status: 'DISMISSED', page: 2 });
    expect(parseReportsQuery(new URLSearchParams('status=junk')).status).toBe('OPEN');
    expect(reportsSearch({ status: 'RESOLVED' }, { status: 'OPEN', page: 3 })).toBe('?status=resolved');
    expect(reportsSearch({ status: 'OPEN' }, { status: 'DISMISSED', page: 1 })).toBe('');
    expect(reportsSearch({ page: 2 }, { status: 'DISMISSED', page: 1 })).toBe('?status=dismissed&page=2');
  });
  it('count words', () => {
    expect(countWords(1)).toBe('Reported once');
    expect(countWords(2)).toBe('Reported twice');
    expect(countWords(5)).toBe('Reported 5 times');
  });
  it('latest message falls back to the newest one with text', () => {
    expect(latestMessage({ latestMessage: ' Wrong answer ', messages: [] })).toBe('Wrong answer');
    expect(latestMessage({ latestMessage: null, messages: [{ id: '1', message: null, createdAt: '' }, { id: '2', message: 'Typo', createdAt: '' }] })).toBe('Typo');
    expect(latestMessage({ latestMessage: null, messages: [] })).toBe('No message');
  });
  it('dismiss always carries its reason; resolve only when one was written', () => {
    expect(closeBody('dismiss', 'The question is fine')).toEqual({ status: 'DISMISSED', reason: 'The question is fine' });
    expect(closeBody('resolve', '')).toEqual({ status: 'RESOLVED' });
    expect(closeBody('resolve', ' fixed offline ')).toEqual({ status: 'RESOLVED', reason: 'fixed offline' });
  });
  it('every filter has its own empty state', () => {
    expect(new Set(Object.values(EMPTY_TEXT).map((e) => e.title)).size).toBe(3);
    expect(summaryLine('OPEN', 4)).toBe('4 questions with open reports');
    expect(summaryLine('DISMISSED', 1)).toBe('1 report dismissed');
  });
});
