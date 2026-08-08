export type FavoriteGame = {
  id: string;
  collectionId: string;
  first_disc_serial: string;
  title: string;
  cover_image?: string;
  genre?: string;
};

export type FavoriteRecord = {
  id: string;
  user: string;
  game: string;
  created: string;
  updated: string;
  expand?: {
    game?: FavoriteGame;
  };
};
