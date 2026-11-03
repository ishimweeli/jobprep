import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { testSession } from '../../test/fixtures';
import { mockFetch, renderWithProviders } from '../../test/utils';
import { ChangeCountryPage } from '../account/ChangeCountryPage';
import { SetupCategoryPage, SetupCountryPage, SetupGoalPage } from './SetupPages';

const rwanda = { code: 'RW', slug: 'rw', name: 'Rwanda', status: 'LIVE', dialCode: '+250', currencyCode: 'RWF', languages: ['en', 'rw'], selectable: true };
const kenya = { code: 'KE', slug: 'ke', name: 'Kenya', status: 'LIVE', dialCode: '+254', currencyCode: 'KES', languages: ['en'], selectable: true };
const uganda = { code: 'UG', slug: 'ug', name: 'Uganda', status: 'PREPARING', dialCode: '+256', currencyCode: 'UGX', languages: ['en'], selectable: false };
const categories = [
  { id: 'c1', slug: 'teaching', name: 'Teaching positions', description: null, icon: null, featured: true, mockTestCount: 38 },
  { id: 'c2', slug: 'procurement', name: 'Procurement', description: null, icon: null, featured: false, mockTestCount: 6 },
];

function Where() {
  const l = useLocation();
  return <div data-testid="where">{`${l.pathname}${l.search}`}</div>;
}

function renderAt(route: string) {
  return renderWithProviders(
    <>
      <Routes>
        <Route path="/setup/country" element={<SetupCountryPage />} />
        <Route path="/setup/category" element={<SetupCategoryPage />} />
        <Route path="/setup/goal" element={<SetupGoalPage />} />
        <Route path="/account/country" element={<ChangeCountryPage />} />
        <Route path="*" element={null} />
      </Routes>
      <Where />
    </>,
    { route },
  );
}

interface Opts {
  session?: ReturnType<typeof testSession>;
  countries?: unknown[];
  patched?: ReturnType<typeof testSession>;
  paidTitle?: string;
}
function server(opts: Opts = {}) {
  let session = opts.session ?? testSession({ onboarding: { done: false, nextStep: 'country' } });
  return mockFetch((url, init) => {
    if (url === '/api/me/onboarding' && init?.method === 'PATCH') {
      if (opts.patched) session = opts.patched;
      // Like the API: each saved step moves `nextStep` on.
      const sent = JSON.parse(String(init.body)) as Record<string, unknown>;
      const nextStep = sent.finish || sent.skip ? null : sent.goalCategoryId ? 'goal' : sent.countryCode ? 'category' : session.user.onboarding.nextStep;
      session = { ...session, user: { ...session.user, onboarding: { done: nextStep === null, nextStep } } };
      return { body: { user: session.user } };
    }
    if (url === '/api/me') return { body: session };
    if (url === '/api/countries') return { body: { countries: opts.countries ?? [rwanda, kenya, uganda] } };
    if (url === '/api/countries/ke') return { body: { ...kenya, paymentMethods: [{ provider: 'MPESA', label: 'M-Pesa' }, { provider: 'AIRTEL', label: 'Airtel Money' }] } };
    if (url === '/api/countries/rw/categories') return { body: { categories } };
    if (url === '/api/countries/ke/categories') return { body: { categories: [{ ...categories[0], id: 'k1', mockTestCount: 24 }] } };
    if (url === '/api/countries/rw/mock-tests/accountant-mock-1') return { body: { title: opts.paidTitle ?? 'Accountant (Public Institution) — Mock 1' } };
    return undefined;
  });
}
const patchBody = (calls: { url: string; init?: RequestInit }[]) => JSON.parse(String(calls.find((c) => c.url === '/api/me/onboarding')?.init?.body));

beforeEach(() => localStorage.setItem('jobprep.session', '1'));
afterEach(() => vi.unstubAllGlobals());

describe('setup guard', () => {
  it('a guest is sent to sign-in and comes back to the step', async () => {
    localStorage.removeItem('jobprep.session');
    server();
    renderAt('/setup/goal?next=%2Frw%2Ftests');
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/sign-in?next=%2Fsetup%2Fgoal%3Fnext%3D%252Frw%252Ftests'));
  });
});

describe('setup 1 of 3: country (OnboardCountry.dc)', () => {
  it('lists live countries, disables coming-soon rows, marks the suggestion and offers "Tell us your country"', async () => {
    server();
    renderAt('/setup/country');
    expect(await screen.findByRole('heading', { name: 'Where are you sitting your exam?' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Step 1 of 3' })).toBeInTheDocument();
    const rw = await screen.findByRole('radio', { name: /Rwanda/ });
    expect(rw).toHaveAttribute('aria-checked', 'true');
    await waitFor(() => expect(rw).toHaveTextContent('Suggested · 44 mock tests'));
    expect(await screen.findByText('24 mock tests')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Kenya/ })).not.toHaveTextContent('KES'); // no currency beside a country
    const ug = screen.getByRole('radio', { name: /Uganda/ });
    expect(ug).toHaveAttribute('aria-disabled', 'true');
    expect(ug).toHaveTextContent('Coming soon');
    expect(screen.getByText('Tell us your country')).toBeInTheDocument();
  });

  it('a coming-soon row cannot be picked; search filters the list', async () => {
    server();
    const u = userEvent.setup();
    renderAt('/setup/country');
    await u.click(await screen.findByRole('radio', { name: /Uganda/ }));
    expect(screen.getByRole('radio', { name: /Rwanda/ })).toHaveAttribute('aria-checked', 'true');
    await u.type(screen.getByLabelText('Search countries'), 'ken');
    expect(screen.queryByRole('radio', { name: /Rwanda/ })).not.toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Kenya/ })).toBeInTheDocument();
  });

  it('Continue saves the country and opens step 2, keeping next', async () => {
    const { calls } = server();
    const u = userEvent.setup();
    renderAt('/setup/country?next=%2Frw%2Fcheckout%3Ftest%3Daccountant-mock-1');
    await u.click(await screen.findByRole('radio', { name: /Kenya/ }));
    await u.click(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/setup/category?next=%2Frw%2Fcheckout%3Ftest%3Daccountant-mock-1'));
    expect(patchBody(calls)).toEqual({ countryCode: 'KE' });
    expect(localStorage.getItem('jobprep.country')).toBe('ke');
  });
});

describe('setup 2 of 3: job category (OnboardCategory.dc)', () => {
  const at2 = testSession({ onboarding: { done: false, nextStep: 'category' } });

  it('lists the country’s categories from the API with their test counts', async () => {
    server({ session: at2 });
    renderAt('/setup/category');
    expect(await screen.findByRole('heading', { name: 'What job are you preparing for?' })).toBeInTheDocument();
    expect(screen.getByText('Job categories in Rwanda. We’ll show these mock tests first — you can change this anytime.')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Step 2 of 3' })).toBeInTheDocument();
    const teaching = await screen.findByRole('radio', { name: /Teaching positions/ });
    expect(teaching).toHaveTextContent('38 mock tests');
    expect(teaching).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('link', { name: /Back/ })).toHaveAttribute('href', '/setup/country');
  });

  it('Continue saves the chosen category and opens step 3', async () => {
    const { calls } = server({ session: at2 });
    const u = userEvent.setup();
    renderAt('/setup/category');
    await u.click(await screen.findByRole('radio', { name: /Procurement/ }));
    await u.click(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/setup/goal'));
    expect(patchBody(calls)).toEqual({ goalCategoryId: 'c2' });
  });
});

describe('setup 3 of 3: level, subject, exam date (OnboardGoal.dc)', () => {
  const at3 = testSession({ onboarding: { done: false, nextStep: 'goal' } });

  it('draws the level and subject chips and the optional date', async () => {
    server({ session: at3 });
    renderAt('/setup/goal');
    expect(await screen.findByRole('heading', { name: 'Which position?' })).toBeInTheDocument();
    for (const l of ['Primary', 'Secondary (S1–S3)', 'Secondary (S4–S6)', 'TVET']) expect(screen.getByRole('button', { name: l })).toHaveAttribute('aria-pressed', 'false');
    for (const s of ['Mathematics', 'English', 'Kinyarwanda', 'Physics', 'Chemistry', 'Biology', 'ICT', 'Teaching profession only']) {
      expect(screen.getByRole('button', { name: s })).toBeInTheDocument();
    }
    expect(screen.getByLabelText('Exam date (optional)')).toHaveAttribute('placeholder', 'e.g. 14 Dec 2026');
    expect(screen.getByRole('button', { name: 'Finish setup' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Skip for now' })).toBeInTheDocument();
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
  });

  it('Finish setup saves level, subject and the date as YYYY-MM-DD, then opens the dashboard', async () => {
    const { calls } = server({ session: at3 });
    const u = userEvent.setup();
    renderAt('/setup/goal');
    await u.click(await screen.findByRole('button', { name: 'Secondary (S1–S3)' }));
    await u.click(screen.getByRole('button', { name: 'Mathematics' }));
    expect(screen.getByRole('button', { name: 'Mathematics' })).toHaveAttribute('aria-pressed', 'true');
    await u.type(screen.getByLabelText('Exam date (optional)'), '14 Dec 2026');
    await u.click(screen.getByRole('button', { name: 'Finish setup' }));
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/rw/progress'));
    expect(patchBody(calls)).toEqual({ level: 'Secondary (S1–S3)', subject: 'Mathematics', examDate: '2026-12-14', finish: true });
  });

  it('a date that is not a date is an inline message and nothing is saved', async () => {
    const { calls } = server({ session: at3 });
    const u = userEvent.setup();
    renderAt('/setup/goal');
    await u.type(await screen.findByLabelText('Exam date (optional)'), 'soon');
    await u.click(screen.getByRole('button', { name: 'Finish setup' }));
    expect(await screen.findByText('Enter the date like 14 Dec 2026.')).toBeInTheDocument();
    expect(calls.some((c) => c.url === '/api/me/onboarding')).toBe(false);
  });

  it('Skip for now sends skip and opens the dashboard', async () => {
    const { calls } = server({ session: at3 });
    const u = userEvent.setup();
    renderAt('/setup/goal');
    await u.click(await screen.findByRole('button', { name: 'Skip for now' }));
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/rw/progress'));
    expect(patchBody(calls)).toEqual({ skip: true });
  });

  it('the fromPaid variant names the test, relabels the button and continues to payment', async () => {
    const { calls } = server({ session: at3 });
    const u = userEvent.setup();
    renderAt('/setup/goal?next=%2Frw%2Fcheckout%3Ftest%3Daccountant-mock-1');
    expect(await screen.findByRole('note')).toHaveTextContent('Next: payment for Accountant (Public Institution) — Mock 1. You can change these choices later.');
    expect(screen.queryByRole('button', { name: 'Finish setup' })).not.toBeInTheDocument();
    await u.click(screen.getByRole('button', { name: 'Finish and continue to payment' }));
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/rw/checkout?test=accountant-mock-1'));
    expect(patchBody(calls)).toEqual({ examDate: null, finish: true });
  });
});

describe('Change exam country (ChangeCountry.dc)', () => {
  const session = { ...testSession(), access: { current: { endsAt: '2026-11-24T00:00:00Z', daysLeft: 23, endingSoon: false }, expired: null, otherCountries: [] } };

  it('shows the radio list with the current row, starts on Kenya and explains what switching does', async () => {
    server({ session });
    renderAt('/account/country');
    expect(await screen.findByRole('heading', { name: 'Change exam country' })).toBeInTheDocument();
    const rw = await screen.findByRole('radio', { name: /Rwanda/ });
    expect(rw).toHaveTextContent('Current · Full Access until 24 Nov 2026');
    expect(screen.getByRole('radio', { name: /Kenya/ })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: /Uganda/ })).toHaveAttribute('aria-disabled', 'true');
    expect(await screen.findByText('If you switch to Kenya')).toBeInTheDocument();
    expect(await screen.findByText('You’ll see only Kenya mock tests, prices in KES and M-Pesa or Airtel Money.')).toBeInTheDocument();
    expect(screen.getByText('Your Rwanda Full Access (23 days left) only covers Rwanda tests. It keeps running and is there if you switch back.')).toBeInTheDocument();
    expect(screen.getByText('Your Rwanda results stay in your history. Your job goal is cleared, so you’ll choose one for Kenya next.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Keep Rwanda' })).toHaveAttribute('href', '/rw/progress');
  });

  it('choosing the current country disables the button ("Choose a different country")', async () => {
    server({ session });
    const u = userEvent.setup();
    renderAt('/account/country');
    await u.click(await screen.findByRole('radio', { name: /Rwanda/ }));
    expect(screen.getByRole('button', { name: 'Choose a different country' })).toBeDisabled();
    expect(screen.queryByText(/If you switch to/)).not.toBeInTheDocument();
  });

  it('Switch to Kenya patches the onboarding country and goes to setup step 2', async () => {
    const { calls } = server({ session });
    const u = userEvent.setup();
    renderAt('/account/country?to=KE');
    await u.click(await screen.findByRole('button', { name: 'Switch to Kenya' }));
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/setup/category'));
    expect(patchBody(calls)).toEqual({ countryCode: 'KE' });
    expect(localStorage.getItem('jobprep.country')).toBe('ke');
  });
});
