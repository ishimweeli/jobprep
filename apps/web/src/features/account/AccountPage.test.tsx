import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { testSession } from '../../test/fixtures';
import { mockFetch, renderWithProviders } from '../../test/utils';
import { AccountPage } from './AccountPage';

beforeEach(() => localStorage.setItem('jobprep.session', '1'));
afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

function server(opts: { goal?: boolean; patch?: { status?: number; body?: unknown } } = {}) {
  let session = testSession(opts.goal ? { goalCategoryId: 'c1' } : {});
  return mockFetch((url, init) => {
    if (url === '/api/me' && init?.method === 'PATCH') {
      if (opts.patch?.status) return { status: opts.patch.status, body: opts.patch.body };
      const name = JSON.parse(String(init.body)).name as string;
      session = { ...session, user: { ...session.user, name } };
      return { body: { user: session.user } };
    }
    if (url === '/api/me') return { body: session };
    if (url === '/api/countries/rw/categories') return { body: { categories: [{ id: 'c1', slug: 'teaching', name: 'Teaching positions', description: null, icon: null, featured: true, mockTestCount: 5 }] } };
    if (url === '/api/countries/rw') return { body: { code: 'RW', name: 'Rwanda', status: 'LIVE', dialCode: '+250', languages: ['en', 'rw'], disclaimer: null, plan: null, paymentMethods: [] } };
    if (url === '/api/attempts/in-progress') return { body: { attempts: [] } };
    return undefined;
  });
}

const renderPage = () =>
  renderWithProviders(
    <Routes>
      <Route path="/account/settings" element={<AccountPage />} />
    </Routes>,
    { route: '/account/settings' },
  );

describe('account page (C14)', () => {
  it('shows name, email, exam country, language, goal row, access summary and Sign out', async () => {
    server({ goal: true });
    renderPage();
    expect(await screen.findByText('Aline Uwase')).toBeInTheDocument();
    expect(screen.getByText('aline@example.test')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Exam country: Rwanda. Change' })).toHaveAttribute('href', '/account/country');
    expect(await screen.findByRole('link', { name: 'Exam goal: Teaching positions. Change' })).toHaveAttribute('href', '/account/goal');
    expect(await screen.findByRole('group', { name: 'Language' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'My access' })).toBeInTheDocument();
    expect(screen.getByText('Free tests only')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Payment history' })).toHaveAttribute('href', '/account/payments');
  });

  it('with no goal the row offers "Choose"', async () => {
    server();
    renderPage();
    expect(await screen.findByRole('link', { name: 'Exam goal: not chosen yet. Choose' })).toHaveAttribute('href', '/account/goal');
  });

  it('edits the name: validation first, then Saved.', async () => {
    const { calls } = server();
    const u = userEvent.setup();
    renderPage();
    await u.click(await screen.findByRole('button', { name: 'Edit name' }));
    const field = screen.getByLabelText('Name');
    await u.clear(field);
    await u.type(field, 'A');
    await u.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Enter your name (at least 2 characters).')).toBeInTheDocument();
    expect(calls.some((c) => c.init?.method === 'PATCH')).toBe(false);

    await u.clear(field);
    await u.type(field, 'Aline  Mukamana');
    await u.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Saved.'));
    expect(JSON.parse(String(calls.find((c) => c.init?.method === 'PATCH')!.init!.body))).toEqual({ name: 'Aline Mukamana' });
    expect(await screen.findByText('Aline Mukamana')).toBeInTheDocument();
  });

  it('Cancel leaves the name as it was', async () => {
    server();
    const u = userEvent.setup();
    renderPage();
    await u.click(await screen.findByRole('button', { name: 'Edit name' }));
    await u.type(screen.getByLabelText('Name'), 'xyz');
    await u.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByText('Aline Uwase')).toBeInTheDocument();
  });

  it('a failed save shows a friendly message and keeps the field', async () => {
    server({ patch: { status: 500, body: { error: 'internal_error' } } });
    const u = userEvent.setup();
    renderPage();
    await u.click(await screen.findByRole('button', { name: 'Edit name' }));
    await u.type(screen.getByLabelText('Name'), ' Mukamana');
    await u.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Something went wrong on our side. Please try again in a moment.')).toBeInTheDocument();
    expect(screen.getByLabelText('Name')).toBeInTheDocument();
  });
});
