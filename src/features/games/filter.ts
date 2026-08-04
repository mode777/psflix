export type GameFilters = {
  search?: string;
  genre?: string;
};

export function buildGameFilter({ search, genre }: GameFilters): string | undefined {
  const clauses: string[] = [];

  if (search && search.trim().length > 0) {
    const escaped = search.trim().replace(/"/g, '\\"');
    clauses.push(`(title ~ "${escaped}" || first_disc_serial ~ "${escaped}")`);
  }

  if (genre && genre !== 'All') {
    const escapedLower = genre.toLowerCase().replace(/"/g, '\\"');
    clauses.push(`genre:lower = "${escapedLower}"`);
  }

  return clauses.length === 0 ? undefined : clauses.join(' && ');
}
