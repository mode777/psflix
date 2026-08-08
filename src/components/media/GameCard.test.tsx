import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GameCard, type GameCardGame } from './GameCard';

vi.mock('@/lib/pb-files', () => ({
  fileUrl: (record: { collectionId: string; id: string }, name: string) =>
    `https://cdn.example.com/${record.collectionId}/${record.id}/${name}`,
}));

function renderCard(game: GameCardGame) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } },
  });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={client}>
        <GameCard game={game} />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

const baseGame: GameCardGame = {
  id: 'g1',
  collectionId: 'c1',
  first_disc_serial: 'SCUS-12345',
  title: 'Crash Bandicoot',
};

describe('GameCard', () => {
  it('renders the title as an accessible label and heading', () => {
    renderCard(baseGame);
    expect(screen.getByLabelText('Crash Bandicoot')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Crash Bandicoot' })).toBeInTheDocument();
  });

  it('links to /game/<first_disc_serial>', () => {
    renderCard(baseGame);
    const link = screen.getByRole('link', { name: 'Crash Bandicoot' });
    expect(link).toHaveAttribute('href', '/game/SCUS-12345');
  });

  it('encodes the first_disc_serial in the URL', () => {
    renderCard({ ...baseGame, first_disc_serial: 'SCUS/123 45' });
    const link = screen.getByRole('link', { name: 'Crash Bandicoot' });
    expect(link).toHaveAttribute('href', '/game/SCUS%2F123%2045');
  });

  it('renders a cover image when cover_image is provided', () => {
    renderCard({ ...baseGame, cover_image: 'cover.jpg' });
    const img = screen.getByAltText('Cover art for Crash Bandicoot');
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute('src', 'https://cdn.example.com/c1/g1/cover.jpg');
  });

  it('renders a fallback with the title when no cover image is set', () => {
    renderCard({ ...baseGame, cover_image: undefined });
    expect(screen.queryByAltText(/cover art/i)).not.toBeInTheDocument();
    expect(screen.getAllByText('Crash Bandicoot').length).toBeGreaterThanOrEqual(1);
  });

  it('shows the genre pill when present', () => {
    renderCard({ ...baseGame, genre: 'Platformer' });
    expect(screen.getByText('Platformer')).toBeInTheDocument();
  });

  it('hides the genre pill when no genre is set', () => {
    renderCard({ ...baseGame, genre: undefined });
    expect(screen.queryByText('Platformer')).not.toBeInTheDocument();
  });
});
