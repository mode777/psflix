import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { GenreChips } from './GenreChips';

describe('GenreChips', () => {
  const genres = ['All', 'Action', 'Platformer'] as const;

  it('renders one button per genre', () => {
    render(<GenreChips genres={genres} value="All" onChange={() => {}} />);
    expect(screen.getByRole('button', { name: 'All' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Action' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Platformer' })).toBeInTheDocument();
  });

  it('marks the active genre with aria-pressed=true', () => {
    render(<GenreChips genres={genres} value="Platformer" onChange={() => {}} />);
    expect(screen.getByRole('button', { name: 'Platformer' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('calls onChange with the clicked genre', () => {
    const onChange = vi.fn();
    render(<GenreChips genres={genres} value="All" onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Action' }));
    expect(onChange).toHaveBeenCalledWith('Action');
  });
});
