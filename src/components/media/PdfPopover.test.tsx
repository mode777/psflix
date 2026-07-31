import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PdfPopover } from './PdfPopover';

vi.mock('@/hooks/useFocusOnDialog', () => ({
  useFocusOnDialog: vi.fn(),
}));

describe('PdfPopover', () => {
  it('renders nothing when closed', () => {
    render(
      <PdfPopover
        open={false}
        url="https://example.com/manual.pdf"
        title="Manual"
        onClose={vi.fn()}
      />,
    );
    const dialog = screen.getByRole('dialog', { hidden: true });
    expect(dialog).not.toHaveAttribute('open');
  });

  it('renders an iframe with the correct src when open', () => {
    render(
      <PdfPopover
        open
        url="https://example.com/manual.pdf"
        title="Digital Manual"
        onClose={vi.fn()}
      />,
    );
    const iframe = screen.getByTitle('Digital Manual');
    expect(iframe).toHaveAttribute('src', 'https://example.com/manual.pdf');
  });

  it('renders a close button', () => {
    render(
      <PdfPopover open url="https://example.com/manual.pdf" title="Manual" onClose={vi.fn()} />,
    );
    expect(screen.getByRole('button', { name: /close/i })).toBeInTheDocument();
  });

  it('calls onClose when the close button is clicked', async () => {
    const onClose = vi.fn();
    render(
      <PdfPopover open url="https://example.com/manual.pdf" title="Manual" onClose={onClose} />,
    );
    await userEvent.click(screen.getByRole('button', { name: /close/i }));
    expect(onClose).toHaveBeenCalled();
  });
});
