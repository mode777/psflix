import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ScreenshotCarousel } from './ScreenshotCarousel';

vi.mock('@/lib/pb-files', () => ({
  fileUrl: (record: { collectionId: string; id: string }, name: string) =>
    `https://cdn.example.com/${record.collectionId}/${record.id}/${name}`,
}));

const record = { collectionId: 'c1', id: 'g1' };

describe('ScreenshotCarousel', () => {
  it('renders one slide button per screenshot', () => {
    render(<ScreenshotCarousel screenshots={['a.png', 'b.png', 'c.png']} record={record} />);
    expect(screen.getByRole('button', { name: 'Open screenshot 1 of 3' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open screenshot 2 of 3' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open screenshot 3 of 3' })).toBeInTheDocument();
  });

  it('renders nothing when no screenshots are provided', () => {
    render(<ScreenshotCarousel screenshots={[]} record={record} />);
    expect(screen.queryAllByRole('button', { name: /open screenshot/i })).toHaveLength(0);
  });

  it('resolves each screenshot to a file URL', () => {
    render(<ScreenshotCarousel screenshots={['a.png', 'b.png']} record={record} />);
    expect(screen.getByAltText('Screenshot 1')).toHaveAttribute(
      'src',
      'https://cdn.example.com/c1/g1/a.png',
    );
    expect(screen.getByAltText('Screenshot 2')).toHaveAttribute(
      'src',
      'https://cdn.example.com/c1/g1/b.png',
    );
  });

  it('clicks the right chevron call scrollBy on the track', () => {
    const scrollBySpy = vi.fn();
    render(
      <div data-testid="track">
        <ScreenshotCarousel screenshots={['a.png', 'b.png']} record={record} />
      </div>,
    );

    const track = document.querySelector('[aria-label="Screenshots carousel"]') as HTMLElement;
    track.scrollBy = scrollBySpy;

    fireEvent.click(screen.getByRole('button', { name: 'Scroll right' }));
    expect(scrollBySpy).toHaveBeenCalledTimes(1);
    expect(scrollBySpy.mock.calls[0]?.[0]).toMatchObject({
      left: expect.any(Number),
      behavior: 'smooth',
    });

    fireEvent.click(screen.getByRole('button', { name: 'Scroll left' }));
    expect(scrollBySpy).toHaveBeenCalledTimes(2);
  });

  it('opens the lightbox when a slide is clicked', () => {
    render(<ScreenshotCarousel screenshots={['a.png', 'b.png']} record={record} />);
    fireEvent.click(screen.getByRole('button', { name: 'Open screenshot 1 of 2' }));
    const dlg = screen.getByRole('dialog');
    expect(dlg).toBeInTheDocument();
  });
});
