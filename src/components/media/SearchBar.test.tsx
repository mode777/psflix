import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { SearchBar } from './SearchBar';

describe('SearchBar', () => {
  it('renders the default placeholder when none is provided', () => {
    render(<SearchBar value="" onChange={() => {}} />);
    expect(screen.getByPlaceholderText('Search library...')).toBeInTheDocument();
  });

  it('uses a custom placeholder when provided', () => {
    render(<SearchBar value="" onChange={() => {}} placeholder="Find a title" />);
    expect(screen.getByPlaceholderText('Find a title')).toBeInTheDocument();
  });

  it('reflects the current value', () => {
    render(<SearchBar value="crash" onChange={() => {}} />);
    const input = screen.getByLabelText('Search games') as HTMLInputElement;
    expect(input.value).toBe('crash');
  });

  it('calls onChange with the new value as the user types', () => {
    const onChange = vi.fn();
    render(<SearchBar value="" onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Search games'), { target: { value: 'crash' } });
    expect(onChange).toHaveBeenCalledWith('crash');
  });
});
