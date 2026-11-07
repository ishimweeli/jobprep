import { screen } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mockFetch, renderWithProviders } from '../../test/utils';
import { HelpPage } from './HelpPage';
import { LegalPage } from './LegalPage';

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

const countries = { countries: [{ code: 'RW', slug: 'rw', name: 'Rwanda', status: 'LIVE', dialCode: '+250', currencyCode: 'RWF', languages: ['en'], selectable: true }] };
const detail = { code: 'RW', name: 'Rwanda', status: 'LIVE', dialCode: '+250', languages: ['en'], disclaimer: null, plan: null, paymentMethods: [] };

const legal = (placeholder: boolean) => ({
  slug: 'terms', title: 'Terms of use', lastUpdated: '2026-11-05', placeholder, intro: 'These terms describe how JobPrep may be used.',
  sections: [{ id: 'about', heading: 'About JobPrep', paragraphs: ['First.', 'Second.'] }, { id: 'accounts', heading: 'Your account', paragraphs: ['Third.'] }],
  country: { code: 'RW', name: 'Rwanda', disclaimer: 'Independent practice platform.' },
});

describe('legal pages (C25)', () => {
  it('title, last updated, table of contents, sections and the placeholder note come from the API', async () => {
    const { calls } = mockFetch((url) => {
      if (url === '/api/legal/terms?country=RW') return { body: legal(true) };
      if (url === '/api/countries/rw') return { body: detail };
      if (url === '/api/countries') return { body: countries };
      return undefined;
    });
    renderWithProviders(
      <Routes>
        <Route path="/terms" element={<LegalPage slug="terms" />} />
      </Routes>,
      { route: '/terms' },
    );
    expect(await screen.findByRole('heading', { level: 1, name: 'Terms of use' })).toBeInTheDocument();
    expect(await screen.findByText('Last updated 5 Nov 2026')).toBeInTheDocument();
    expect(screen.getByTestId('placeholder-note')).toHaveTextContent('Placeholder text, pending legal review.');
    const toc = screen.getByRole('navigation', { name: 'On this page' });
    expect(toc.querySelectorAll('a')).toHaveLength(2);
    expect(screen.getByRole('heading', { level: 2, name: 'About JobPrep' })).toBeInTheDocument();
    expect(screen.getByText('Third.')).toBeInTheDocument();
    expect(screen.getByText('Independent practice platform.')).toBeInTheDocument();
    expect(calls.some((c) => c.url === '/api/legal/terms?country=RW')).toBe(true);
  });

  it('final text has no placeholder note', async () => {
    mockFetch((url) => (url.startsWith('/api/legal/terms') ? { body: legal(false) } : url === '/api/countries/rw' ? { body: detail } : { body: countries }));
    renderWithProviders(
      <Routes>
        <Route path="/terms" element={<LegalPage slug="terms" />} />
      </Routes>,
      { route: '/terms' },
    );
    await screen.findByRole('heading', { level: 1, name: 'Terms of use' });
    expect(screen.queryByTestId('placeholder-note')).not.toBeInTheDocument();
  });

  it('an unknown legal page is the 404 page', () => {
    mockFetch(() => ({ body: countries }));
    renderWithProviders(
      <Routes>
        <Route path="/x/:page" element={<LegalPage />} />
      </Routes>,
      { route: '/x/nope' },
    );
    expect(screen.getByText('Error 404')).toBeInTheDocument();
  });
});

describe('help page (C25 / C36)', () => {
  const support = (over: Record<string, unknown>) => ({ supportContact: { phone: '+250788000000', whatsapp: null, email: 'help@jobprep.test', hours: 'Mon–Fri 8:00–17:00', configured: true, placeholder: false, ...over } });
  const run = (body: unknown) => {
    mockFetch((url) => (url === '/api/countries/rw/support' ? { body } : url === '/api/countries' ? { body: countries } : url === '/api/countries/rw' ? { body: detail } : undefined));
    renderWithProviders(
      <Routes>
        <Route path="/help" element={<HelpPage />} />
      </Routes>,
      { route: '/help' },
    );
  };

  it('shows the real contact as tappable links and the hours', async () => {
    run(support({}));
    expect(await screen.findByRole('link', { name: '+250788000000' })).toHaveAttribute('href', 'tel:+250788000000');
    expect(screen.getByRole('link', { name: 'help@jobprep.test' })).toHaveAttribute('href', 'mailto:help@jobprep.test');
    expect(screen.getByText('Mon–Fri 8:00–17:00')).toBeInTheDocument();
    expect(screen.queryByTestId('placeholder-note')).not.toBeInTheDocument();
  });

  it('named contacts each get their own card with their name and a number to call', async () => {
    run(support({ phone: null, people: [{ name: 'Abel', phone: '+250 785 969 446' }, { name: 'Pacifique', phone: '+250 783 137 606' }] }));
    expect(await screen.findByRole('link', { name: '+250 785 969 446' })).toHaveAttribute('href', 'tel:+250785969446');
    expect(screen.getByRole('link', { name: '+250 783 137 606' })).toHaveAttribute('href', 'tel:+250783137606');
    expect(screen.getByText('Abel')).toBeInTheDocument();
    expect(screen.getByText('Pacifique')).toBeInTheDocument();
  });

  it('placeholder contact details read as placeholders', async () => {
    run(support({ placeholder: true }));
    expect(await screen.findByTestId('placeholder-note')).toHaveTextContent('These are placeholder contact details, not real ones.');
  });

  it('a country with nothing set says so instead of showing an empty block', async () => {
    run(support({ configured: false, phone: null, email: null, hours: null }));
    expect(await screen.findByText('Support contact details for this country are not available yet.')).toBeInTheDocument();
  });

  it('links to the payment history and the policies', async () => {
    run(support({}));
    expect(await screen.findByRole('link', { name: 'Payment history' })).toHaveAttribute('href', '/account/payments');
    expect(screen.getAllByRole('link', { name: 'Refund policy' })[0]).toHaveAttribute('href', 'https://nexvecta.com/refund');
  });
});
