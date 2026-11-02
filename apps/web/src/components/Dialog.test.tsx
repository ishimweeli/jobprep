import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { Dialog } from './Dialog';

function Harness() {
  const [open, setOpen] = useState(false);
  return (
    <div id="root">
      <button onClick={() => setOpen(true)}>Open filters</button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Filters" variant="sheet">
        <button>First</button>
        <button>Last</button>
      </Dialog>
    </div>
  );
}

describe('Dialog', () => {
  it('has dialog semantics, moves focus in, traps Tab, closes on Esc and returns focus', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const opener = screen.getByRole('button', { name: 'Open filters' });
    await user.click(opener);

    const dialog = screen.getByRole('dialog', { name: 'Filters' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByRole('button', { name: 'First' })).toHaveFocus();

    await user.tab();
    expect(screen.getByRole('button', { name: 'Last' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'First' })).toHaveFocus(); // wrapped
    await user.tab({ shift: true });
    expect(screen.getByRole('button', { name: 'Last' })).toHaveFocus(); // wrapped backwards

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
    expect(document.getElementById('root')).not.toHaveAttribute('inert');
  });

  it('makes the page behind inert while open', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Open filters' }));
    expect(document.getElementById('root')).toHaveAttribute('inert');
  });
});
