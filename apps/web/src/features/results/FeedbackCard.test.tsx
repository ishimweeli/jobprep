import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mockFetch, renderWithProviders } from '../../test/utils';
import { FeedbackCard } from './FeedbackCard';

afterEach(() => vi.unstubAllGlobals());

describe('optional feedback after an exam', () => {
  it('is optional: the send button stays off until a rating is chosen, then sends rating and comment', async () => {
    const api = mockFetch((url, init) => (url === '/api/attempts/a1/feedback' && init?.method === 'POST' ? { status: 201, body: { feedback: { rating: 4, comment: 'Q7 looked wrong' } } } : undefined));
    renderWithProviders(<FeedbackCard attemptId="a1" saved={null} />);
    const send = screen.getByRole('button', { name: 'Send feedback' });
    expect(send).toBeDisabled();
    expect(screen.getByText('Choose a rating to send.')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('radio', { name: '4 of 5, Very good' }));
    await userEvent.type(screen.getByLabelText(/Anything wrong, unclear or missing/), 'Q7 looked wrong');
    expect(send).toBeEnabled();
    await userEvent.click(send);

    expect(await screen.findByText('Thank you. Your feedback was sent.')).toBeInTheDocument();
    const call = api.calls.find((c) => c.url === '/api/attempts/a1/feedback')!;
    expect(JSON.parse(String(call.init?.body))).toEqual({ rating: 4, comment: 'Q7 looked wrong' });
    expect(screen.getByRole('button', { name: 'Sent' })).toBeDisabled();
  });

  it('sends a rating without a comment', async () => {
    const api = mockFetch(() => ({ status: 201, body: { feedback: { rating: 2, comment: null } } }));
    renderWithProviders(<FeedbackCard attemptId="a1" saved={null} />);
    await userEvent.click(screen.getByRole('radio', { name: '2 of 5, Fair' }));
    await userEvent.click(screen.getByRole('button', { name: 'Send feedback' }));
    await waitFor(() => expect(api.calls.length).toBeGreaterThan(0));
    expect(JSON.parse(String(api.calls[0]!.init?.body))).toEqual({ rating: 2 });
  });

  it('shows what was sent before and lets the person change it', async () => {
    renderWithProviders(<FeedbackCard attemptId="a1" saved={{ rating: 5, comment: 'Clear and fair.' }} />);
    expect(screen.getByRole('radio', { name: '5 of 5, Excellent' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByDisplayValue('Clear and fair.')).toBeInTheDocument();
    expect(screen.getByText('Thank you. Your feedback was sent.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('radio', { name: '3 of 5, Good' }));
    expect(screen.getByRole('button', { name: 'Send feedback' })).toBeEnabled();
  });

  it('says so when sending fails, and keeps what was typed', async () => {
    mockFetch(() => ({ status: 500, body: { error: 'server_error' } }));
    renderWithProviders(<FeedbackCard attemptId="a1" saved={null} />);
    await userEvent.click(screen.getByRole('radio', { name: '1 of 5, Poor' }));
    await userEvent.type(screen.getByLabelText(/Anything wrong, unclear or missing/), 'Broken');
    await userEvent.click(screen.getByRole('button', { name: 'Send feedback' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('We could not send your feedback');
    expect(screen.getByDisplayValue('Broken')).toBeInTheDocument();
  });
});
