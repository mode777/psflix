export const GENRES = [
  'All',
  'Action RPG',
  'Survival Horror',
  'Platformer',
  'Racing',
  'Fighting',
  'Shooter',
  'Sports',
] as const;

export type Genre = (typeof GENRES)[number];
