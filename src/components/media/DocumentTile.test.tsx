import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DocumentTile } from './DocumentTile';
import type { DocumentsResponse } from '@/types/pocketbase';

vi.mock('@/lib/pb-files', () => ({
  fileUrl: (record: { collectionId: string; id: string }, name: string) =>
    `https://cdn.example.com/${record.collectionId}/${record.id}/${name}`,
}));

function makeDocument(overrides: Partial<DocumentsResponse> = {}): DocumentsResponse {
  return {
    id: 'doc1',
    collectionId: 'docs',
    collectionName: 'documents',
    title: 'Some manual',
    type: 'manual',
    game: 'g1',
    file: 'manual.pdf' as unknown as DocumentsResponse['file'],
    ...overrides,
  } as DocumentsResponse;
}

describe('DocumentTile', () => {
  it('renders nothing when the document has no file', () => {
    const { container } = render(
      <DocumentTile
        document={makeDocument({ file: '' as unknown as DocumentsResponse['file'] })}
        kind="manual"
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders a manual tile with the right label and link', () => {
    render(<DocumentTile document={makeDocument()} kind="manual" />);
    const link = screen.getByRole('link', { name: /digital manual/i });
    expect(link).toHaveAttribute('href', 'https://cdn.example.com/docs/doc1/manual.pdf');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('renders a guide tile with the right label', () => {
    render(<DocumentTile document={makeDocument({ type: 'guide' })} kind="guide" />);
    const link = screen.getByRole('link', { name: /strategy guide/i });
    expect(link).toBeInTheDocument();
  });
});
