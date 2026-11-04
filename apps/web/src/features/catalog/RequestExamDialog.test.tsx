import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { testSession } from '../../test/fixtures';
import { mockFetch, renderWithProviders } from '../../test/utils';
import { RequestExamDialog } from './RequestExamDialog';

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

const renderDialog = (initialQuery = 'Veterinary officer') => renderWithProviders(<RequestExamDialog open onClose={vi.fn()} slug="rw" initialQuery={initialQuery} />);

describe('Request this exam dialog (C10)', () => {
  it('is a labelled dialog that shows what was searched and an optional email', () => {
    mockFetch(() => undefined);
    renderDialog();
    expect(screen.getByRole('dialog', { name: 'Request this exam' })).toBeInTheDocument();
    expect(screen.getByLabelText('Job or exam')).toHaveValue('Veterinary officer');
    expect(screen.getByLabelText('Email (optional)')).toHaveValue('');
  });

  it('prefills the email for a signed-in person', async () => {
    localStorage.setItem('jobprep.session', '1');
    mockFetch((url) => (url === '/api/me' ? { body: testSession() } : undefined));
    renderDialog();
    await waitFor(() => expect(screen.getByLabelText('Email (optional)')).toHaveValue('aline@example.test'));
  });

  it('a bad email shows the inline error and sends nothing', async () => {
    const { calls } = mockFetch(() => undefined);
    const u = userEvent.setup();
    renderDialog();
    await u.type(screen.getByLabelText('Email (optional)'), 'nope');
    await u.click(screen.getByRole('button', { name: 'Send request' }));
    expect(await screen.findByText('Enter a valid email address, like name@example.com.')).toBeInTheDocument();
    expect(calls).toHaveLength(0);
  });

  it('sends the request and shows the success state', async () => {
    const { calls } = mockFetch((url, init) =>
      url === '/api/countries/rw/exam-requests' && init?.method === 'POST' ? { status: 201, body: { ok: true, alreadyRequested: false, requestCount: 1 } } : undefined,
    );
    const u = userEvent.setup();
    renderDialog();
    await u.type(screen.getByLabelText('Email (optional)'), 'a@b.co');
    await u.click(screen.getByRole('button', { name: 'Send request' }));
    expect(await screen.findByRole('dialog', { name: 'Request sent' })).toBeInTheDocument();
    expect(screen.getByText('Thank you. We will email you when this test is added.')).toBeInTheDocument();
    expect(JSON.parse(String(calls[0]!.init!.body))).toEqual({ query: 'Veterinary officer', email: 'a@b.co' });
  });

  it('says so when the same person asked before', async () => {
    mockFetch(() => ({ status: 200, body: { ok: true, alreadyRequested: true, requestCount: 3 } }));
    const u = userEvent.setup();
    renderDialog();
    await u.click(screen.getByRole('button', { name: 'Send request' }));
    expect(await screen.findByRole('dialog', { name: 'You already asked for this' })).toBeInTheDocument();
  });

  it('an error keeps the form and offers Try again', async () => {
    let fail = true;
    mockFetch(() => (fail ? { status: 500, body: { error: 'internal_error' } } : { status: 201, body: { ok: true, alreadyRequested: false } }));
    const u = userEvent.setup();
    renderDialog();
    await u.click(screen.getByRole('button', { name: 'Send request' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong on our side. Please try again in a moment.');
    expect(screen.getByLabelText('Job or exam')).toHaveValue('Veterinary officer');
    fail = false;
    await u.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('dialog', { name: 'Request sent' })).toBeInTheDocument();
  });
});
