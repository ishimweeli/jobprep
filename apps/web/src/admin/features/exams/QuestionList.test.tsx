import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SUPPORT_PERMS, SYSTEM_PERMS, admin, renderAdminRoutes, stubViewport } from '../../test/fixtures';
import { mockFetch } from '../../test/utils';
import { QuestionList } from './QuestionList';

afterEach(() => vi.unstubAllGlobals());

const q = (id: string, number: number, type: string, openReports = 0) => ({ id, number, stem: `Question text number ${number}`, type, status: 'PUBLISHED', section: 'Section A', topic: 'T', marks: 1, openReports });
const test = (questions: ReturnType<typeof q>[]) => ({ mockTest: { id: 'm1', title: 'Mock 1', status: 'DRAFT', isFree: false, countryCode: 'RW', languages: ['en'], category: { id: 'c1', name: 'T' } }, sections: [], cases: [], questions });

function setup(questions = [q('a', 1, 'SINGLE_CHOICE'), q('b', 2, 'MULTIPLE_SELECT', 2), q('c', 3, 'CASE_BASED')], phone = false, perms = SYSTEM_PERMS) {
  stubViewport(!phone);
  const api = mockFetch((url, init) => {
    if (url === '/api/admin/mock-tests/m1/questions/reorder' && init?.method === 'POST') return { body: { ok: true } };
    if (url === '/api/admin/mock-tests/m1') return { body: test(questions) };
    return undefined;
  });
  renderAdminRoutes([{ path: '/admin/exams/:testId', element: <QuestionList testId="m1" phone={phone} /> }], { route: '/admin/exams/m1', me: admin('SYSTEM_ADMIN', perms) });
  return api;
}

describe('question list', () => {
  it('lists number, start, type, status and open reports, with an Add question link', async () => {
    setup();
    expect(await screen.findByText('Question text number 2')).toBeInTheDocument();
    expect(screen.getByText('Multiple answers')).toBeInTheDocument();
    expect(screen.getByText('Case-based')).toBeInTheDocument();
    expect(screen.getByText('2 reported')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Add question' })).toHaveAttribute('href', '/admin/exams/m1/q/new');
  });

  it('move down sends every question id in the new order; the ends cannot move further', async () => {
    const api = setup();
    await screen.findByText('Question text number 1');
    expect(screen.getByRole('button', { name: 'Move question 1 up' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Move question 3 down' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Move question 1 down' }));
    await waitFor(() => expect(api.calls.some((c) => c.url.endsWith('/questions/reorder'))).toBe(true));
    expect(JSON.parse(String(api.calls.find((c) => c.url.endsWith('/reorder'))!.init!.body))).toEqual({ ids: ['b', 'a', 'c'] });
    expect(await screen.findByText('Order saved')).toBeInTheDocument();
  });

  it('an empty test says so and offers the first question', async () => {
    setup([]);
    expect(await screen.findByText('This mock test has no questions yet.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Add question' })).toBeInTheDocument();
  });

  it('a role that may not write sees no move buttons and no Add question', async () => {
    setup(undefined, false, SUPPORT_PERMS);
    await screen.findByText('Question text number 1');
    expect(screen.queryByRole('button', { name: /Move question/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Add question' })).not.toBeInTheDocument();
  });

  it('phone: a collapsible section', async () => {
    setup(undefined, true);
    const toggle = await screen.findByRole('button', { name: /Questions in this test/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Question text number 3')).toBeVisible();
  });
});
