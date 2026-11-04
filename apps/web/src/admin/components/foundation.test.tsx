import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, Link, RouterProvider } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/client';
import { describeAdminError } from '../lib/apiErrors';
import { denyHint, rolesThatCan } from '../lib/permissions';
import { useUnsavedChanges } from '../lib/useUnsavedChanges';
import { ActionDialog, reasonProblem } from './ActionDialog';
import { SaveStatus } from './states';
import { ToastProvider, useToast } from './Toast';
import { Btn } from './ui';

afterEach(() => {
  vi.useRealTimers();
});

describe('reason rule', () => {
  it('needs 5 to 300 characters after trimming', () => {
    expect(reasonProblem('')).toMatch(/Write a reason/);
    expect(reasonProblem('  abc ')).toMatch(/at least 5/);
    expect(reasonProblem('x'.repeat(301))).toMatch(/300/);
    expect(reasonProblem('Customer called')).toBeNull();
  });
});

describe('ActionDialog', () => {
  const open = (submit: (r: string) => Promise<unknown>, extra = {}) => {
    const onClose = vi.fn();
    const onDone = vi.fn();
    render(<ActionDialog open onClose={onClose} onDone={onDone} title="Suspend Aline" confirmLabel="Suspend" kind="danger" submit={submit} {...extra}>They are signed out.</ActionDialog>);
    return { onClose, onDone };
  };

  it('is a labelled modal, asks for the reason, then submits the trimmed reason and closes', async () => {
    const submit = vi.fn().mockResolvedValue({});
    const { onClose, onDone } = open(submit);
    expect(screen.getByRole('dialog', { name: 'Suspend Aline' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Suspend' }));
    expect(await screen.findByText(/Write a reason/)).toBeInTheDocument();
    expect(submit).not.toHaveBeenCalled();
    await userEvent.type(screen.getByLabelText('Reason'), '  Abuse reported  ');
    await userEvent.click(screen.getByRole('button', { name: 'Suspend' }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(submit).toHaveBeenCalledWith('Abuse reported');
    expect(onDone).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Suspend' }).className).toContain('bg-incorrect');
  });

  it('keeps the dialog and the typed text open and shows the refusal in words', async () => {
    const { onClose } = open(vi.fn().mockRejectedValue(new ApiError(409, 'reason_too_short')));
    await userEvent.type(screen.getByLabelText('Reason'), 'Abuse reported');
    await userEvent.click(screen.getByRole('button', { name: 'Suspend' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Write a reason of at least 5 characters.');
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Reason')).toHaveValue('Abuse reported');
  });

  it('Esc closes it; a plain confirmation has no reason field', async () => {
    const { onClose } = open(vi.fn().mockResolvedValue({}), { reason: false });
    expect(screen.queryByLabelText('Reason')).not.toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });
});

describe('Btn', () => {
  it('a role that may not use it sees why, and it does nothing', async () => {
    const onClick = vi.fn();
    render(<Btn onClick={onClick} whyDisabled="Only a System admin can do this.">Grant</Btn>);
    const b = screen.getByRole('button', { name: 'Grant' });
    expect(b).toHaveAttribute('aria-disabled', 'true');
    expect(b).toHaveAccessibleDescription('Only a System admin can do this.');
    await userEvent.click(b);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('busy disables and announces', () => {
    render(<Btn busy>Save</Btn>);
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Save' })).toHaveAttribute('aria-busy', 'true');
  });
});

describe('Toast', () => {
  function Fire() {
    const toast = useToast();
    return <button type="button" onClick={() => toast({ text: 'Access extended until 4 Dec' })}>fire</button>;
  }
  it('is announced, can be dismissed and goes by itself after 6 seconds', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<ToastProvider><Fire /></ToastProvider>);
    await userEvent.click(screen.getByText('fire'));
    expect(screen.getByRole('status')).toHaveTextContent('Access extended until 4 Dec');
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    await userEvent.click(screen.getByText('fire'));
    act(() => void vi.advanceTimersByTime(6100));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});

describe('words for refusals and roles', () => {
  it('never shows a raw code', () => {
    expect(describeAdminError(new ApiError(0, 'network_error'))).toMatch(/Could not reach/);
    expect(describeAdminError(new ApiError(429, 'x', {}, 30))).toMatch(/30 seconds/);
    expect(describeAdminError(new ApiError(500, 'internal'))).toMatch(/our side/);
    expect(describeAdminError(new ApiError(409, 'custom'), { custom: 'Own words.' })).toBe('Own words.');
    expect(describeAdminError(new ApiError(418, 'teapot'))).not.toMatch(/teapot/);
    expect(describeAdminError(new Error('boom'))).toMatch(/Something went wrong/);
  });

  it('says which role may do a thing', () => {
    expect(rolesThatCan('users:manage')).toBe('System admin');
    expect(rolesThatCan('exams:write')).toBe('Content editor or System admin');
    expect(denyHint(['exams:read'], 'users:manage', 'suspend people')).toBe('Only a System admin can suspend people.');
    expect(denyHint(['users:manage'], 'users:manage')).toBeUndefined();
  });
});

describe('SaveStatus', () => {
  it('says saving, saved and the error in text', () => {
    const { rerender } = render(<SaveStatus state="saving" />);
    expect(screen.getByRole('status')).toHaveTextContent('Saving…');
    rerender(<SaveStatus state="saved" />);
    expect(screen.getByRole('status')).toHaveTextContent('Saved');
    rerender(<SaveStatus state="error" />);
    expect(screen.getByRole('alert')).toHaveTextContent('Could not save');
  });
});

describe('unsaved changes', () => {
  function Editor({ dirty }: { dirty: boolean }) {
    const { dialog } = useUnsavedChanges(dirty);
    return <div><Link to="/other">leave</Link>{dialog}</div>;
  }
  const mount = (dirty: boolean) => {
    const router = createMemoryRouter([{ path: '/', element: <Editor dirty={dirty} /> }, { path: '/other', element: <p>other page</p> }], { initialEntries: ['/'] });
    render(<RouterProvider router={router} />);
    return router;
  };

  it('asks before leaving with changes; Keep editing stays, Leave goes', async () => {
    const router = mount(true);
    await userEvent.click(screen.getByText('leave'));
    expect(await screen.findByRole('dialog', { name: 'Leave without saving?' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
    expect(router.state.location.pathname).toBe('/');
    await userEvent.click(screen.getByText('leave'));
    await userEvent.click(await screen.findByRole('button', { name: 'Leave without saving' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/other'));
  });

  it('does not ask when nothing changed', async () => {
    const router = mount(false);
    await userEvent.click(screen.getByText('leave'));
    await waitFor(() => expect(router.state.location.pathname).toBe('/other'));
  });
});
