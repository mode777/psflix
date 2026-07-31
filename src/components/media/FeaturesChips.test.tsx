import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FeaturesChips } from './FeaturesChips';

describe('FeaturesChips', () => {
  it('renders nothing when features is empty', () => {
    const { container } = render(<FeaturesChips features={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders one chip per feature', () => {
    render(<FeaturesChips features={['Rumble', 'Multi-tap', 'Memory Card']} />);
    expect(screen.getByText('Rumble')).toBeInTheDocument();
    expect(screen.getByText('Multi-tap')).toBeInTheDocument();
    expect(screen.getByText('Memory Card')).toBeInTheDocument();
  });
});
