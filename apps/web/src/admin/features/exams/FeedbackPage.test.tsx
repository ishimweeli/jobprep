import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SYSTEM_PERMS, admin, renderAdminRoutes, stubViewport } from '../../test/fixtures';
import { mockFetch } from '../../test/utils';
import { FeedbackPage } from './FeedbackPage';

afterEach(() => vi.unstubAllGlobals());

const row = (id: string, rating: number, comment: string | null, user: { name: string; email: string } | null) => ({
  id, rating, comment, createdAt: '2026-11-10T10:00:00Z', countryCode: 'RW', mockTest: { id: 'm1', title: 'Urban Planner (RHA) — Mock Exam 1' }, user,
});

describe('Exam feedback (admin)', () => {
  it('shows the average, the spread and each comment, and filters to comments', async () => {
    stubViewport(true);
    const api = mockFetch((url) => {
      if (!url.startsWith('/api/admin/feedback')) return undefined;
      const only = new URL(url, 'http://x').searchParams.get('withComment') === '1';
      const all = [row('f1', 5, 'Clear and fair.', { name: 'Aline Uwase', email: 'aline@example.com' }), row('f2', 2, null, null)];
      return { body: { total: only ? 1 : 2, page: 1, summary: { count: 2, average: 3.5, byRating: [1, 2, 3, 4, 5].map((r) => ({ rating: r, count: r === 2 || r === 5 ? 1 : 0 })) }, results: only ? [all[0]] : all } };
    });
    renderAdminRoutes([{ path: '/admin/exams/feedback', element: <FeedbackPage /> }], { route: '/admin/exams/feedback', me: admin('SYSTEM_ADMIN', SYSTEM_PERMS) });

    expect(await screen.findByText(/2 ratings · average 3\.5 of 5/)).toBeInTheDocument();
    expect(screen.getByText('“Clear and fair.”')).toBeInTheDocument();
    expect(screen.getByText('No comment')).toBeInTheDocument();
    expect(screen.getByText(/Aline Uwase · aline@example\.com/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'With a comment' }));
    await screen.findByText('“Clear and fair.”');
    expect(screen.queryByText('No comment')).not.toBeInTheDocument();
    expect(api.calls.some((c) => c.url.includes('withComment=1'))).toBe(true);
  });
});
