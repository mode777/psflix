import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ScreenshotStack } from './ScreenshotStack';

vi.mock('@/lib/pb-files', () => ({
  fileUrl: (record: { collectionId: string; id: string }, name: string) =>
    `https://cdn.example.com/${record.collectionId}/${record.id}/${name}`,
}));

const record = { collectionId: 'c1', id: 'g1' };

describe('ScreenshotStack', () => {
  it('renders one button per screenshot', () => {
    render(<ScreenshotStack screenshots={['a.png', 'b.png', 'c.png']} record={record} />);
    expect(screen.getByRole('button', { name: 'Open screenshot 1 of 3' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open screenshot 2 of 3' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open screenshot 3 of 3' })).toBeInTheDocument();
  });

  it('renders nothing when no screenshots are provided', () => {
    render(<ScreenshotStack screenshots={[]} record={record} />);
    expect(screen.queryAllByRole('button', { name: /open screenshot/i })).toHaveLength(0);
  });

  it('resolves each screenshot to a file URL', () => {
    render(<ScreenshotStack screenshots={['a.png', 'b.png']} record={record} />);
    expect(screen.getByAltText('Screenshot 1')).toHaveAttribute(
      'src',
      'https://cdn.example.com/c1/g1/a.png',
    );
    expect(screen.getByAltText('Screenshot 2')).toHaveAttribute(
      'src',
      'https://cdn.example.com/c1/g1/b.png',
    );
  });

  it('opens the lightbox when a screenshot is clicked', () => {
    render(<ScreenshotStack screenshots={['a.png', 'b.png']} record={record} />);
    fireEvent.click(screen.getByRole('button', { name: 'Open screenshot 1 of 2' }));
    const dlg = screen.getByRole('dialog');
    expect(dlg).toBeInTheDocument();
  });
});
