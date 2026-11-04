import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SYSTEM_PERMS, admin, renderAdminRoutes, stubViewport } from '../../test/fixtures';
import { mockFetch } from '../../test/utils';
import { TeamPanel } from './TeamPanel';

afterEach(() => vi.unstubAllGlobals());

const person = (over = {}) => ({
  id: 'u2', name: 'Marie Claire', email: 'marie@example.com', active: true, countryScope: ['RW'], lastActiveAt: null, role: 'CONTENT_EDITOR', roleLabel: 'Content editor',
  roles: [{ code: 'CONTENT_EDITOR', label: 'Content editor', countryScope: ['RW'], active: true }], ...over,
});

function setup() {
  stubViewport(true);
  const api = mockFetch((url, init) => {
    if (url.startsWith('/api/admin/team') && init?.method === 'POST') return { status: 201, body: { admin: person(), addedToExistingAccount: false } };
    if (url.startsWith('/api/admin/team/u2') && init?.method === 'PATCH') return { body: { admin: person() } };
    if (url.startsWith('/api/admin/team')) return { body: { team: [person()] } };
    return undefined;
  });
  const r = renderAdminRoutes([{ path: '/', element: <TeamPanel phone={false} /> }], { route: '/', me: admin('SYSTEM_ADMIN', SYSTEM_PERMS) });
  return { api, ...r };
}

describe('Admin team (A13)', () => {
  it('lists people with role, countries and last active', async () => {
    setup();
    expect(await screen.findByText('Marie Claire')).toBeInTheDocument();
    expect(screen.getByText('Content editor')).toBeInTheDocument();
    expect(screen.getByText('Rwanda')).toBeInTheDocument();
    expect(screen.getByText('Never signed in')).toBeInTheDocument();
  });

  it('invite: needs name, email and a reason, sends the role and countries', async () => {
    const { api } = setup();
    await screen.findByText('Marie Claire');
    await userEvent.click(screen.getByRole('button', { name: 'Invite' }));
    const dlg = await screen.findByRole('dialog', { name: 'Invite an admin' });
    await userEvent.click(within(dlg).getByRole('button', { name: 'Give access' }));
    expect(await within(dlg).findByText(/Fill in the name/)).toBeInTheDocument();
    await userEvent.type(within(dlg).getByLabelText('Name'), 'Eric H.');
    await userEvent.type(within(dlg).getByLabelText('Email address'), 'eric@example.com');
    await userEvent.click(within(dlg).getByRole('radio', { name: /Support/ }));
    await userEvent.click(within(dlg).getByRole('checkbox', { name: 'Kenya' }));
    await userEvent.type(within(dlg).getByLabelText('Reason'), 'Covers Kenya');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Give access' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    const post = api.calls.find((c) => c.init?.method === 'POST')!;
    expect(JSON.parse(String(post.init!.body))).toEqual({ name: 'Eric H.', email: 'eric@example.com', role: 'SUPPORT', countryScope: ['KE'], reason: 'Covers Kenya' });
  });

  it('deactivate asks for a reason and names the consequence', async () => {
    const { api } = setup();
    await userEvent.click(await screen.findByRole('button', { name: 'Deactivate Content editor role of Marie Claire' }));
    const dlg = await screen.findByRole('dialog', { name: /Deactivate Content editor for Marie Claire/ });
    expect(dlg).toHaveTextContent('They lose the pages of this role at once');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Deactivate' }));
    expect(await within(dlg).findByText(/Write a reason/)).toBeInTheDocument();
    await userEvent.type(within(dlg).getByLabelText('Reason'), 'Left the team');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Deactivate' }));
    await waitFor(() => expect(api.calls.some((c) => c.init?.method === 'PATCH')).toBe(true));
    const patch = api.calls.find((c) => c.init?.method === 'PATCH')!;
    expect(JSON.parse(String(patch.init!.body))).toEqual({ role: 'CONTENT_EDITOR', active: false, reason: 'Left the team' });
  });

  it('change role: the button does nothing until something changed', async () => {
    setup();
    await userEvent.click(await screen.findByRole('button', { name: 'Change Content editor role of Marie Claire' }));
    const dlg = await screen.findByRole('dialog', { name: 'Change role of Marie Claire' });
    await userEvent.type(within(dlg).getByLabelText('Reason'), 'Same as before');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Save change' }));
    expect(await within(dlg).findByText('Nothing has changed yet.')).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});
