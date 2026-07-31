import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CoverImage } from './CoverImage';

vi.mock('@/lib/pb-files', () => ({
  fileUrl: (record: { collectionId: string; id: string }, name: string) =>
    `https://cdn.example.com/${record.collectionId}/${record.id}/${name}`,
}));

const record = { collectionId: 'c1', id: 'g1' };

describe('CoverImage', () => {
  it('renders an icon placeholder when no filename is provided', () => {
    const { container } = render(<CoverImage record={record} />);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(container.querySelector('.material-symbols-outlined')).toBeInTheDocument();
  });

  it('renders an <img> with the file URL when filename is set', () => {
    render(<CoverImage record={record} filename="cover.jpg" alt="Cover" />);
    const img = screen.getByRole('img', { name: 'Cover' });
    expect(img).toHaveAttribute('src', 'https://cdn.example.com/c1/g1/cover.jpg');
  });

  it('uses an empty alt when none is provided', () => {
    const { container } = render(<CoverImage record={record} filename="cover.jpg" />);
    const img = container.querySelector('img') as HTMLImageElement;
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute('alt', '');
  });
});
