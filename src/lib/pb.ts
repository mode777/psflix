import PocketBase from 'pocketbase';

const url = import.meta.env.VITE_PB_URL || 'https://psx.alexklingenbeck.de';

export const pb = new PocketBase(url);

pb.autoCancellation(false);
