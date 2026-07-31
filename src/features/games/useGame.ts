import { useQuery } from '@tanstack/react-query';
import { pb } from '@/lib/pb';
import type { DiscsResponse, DocumentsResponse } from '@/types/pocketbase';

export type GameDetail = {
  id: string;
  collectionId: string;
  first_disc_serial: string;
  title: string;
  cover_image?: string;
  genre?: string;
  developer?: string;
  publisher?: string;
  release?: string;
  description?: string;
  manufacturer_description?: string;
  features?: unknown;
  screenshots?: string[];
  region?: string;
  players?: string;
  discs?: number;
  expand?: {
    discs?: DiscsResponse[];
    documents?: DocumentsResponse[];
  };
};

export function useGame(firstDiscSerial: string | undefined) {
  return useQuery({
    queryKey: ['game', firstDiscSerial],
    enabled: !!firstDiscSerial,
    queryFn: async () => {
      if (!firstDiscSerial) throw new Error('Missing serial');
      const list = await pb.collection('games').getList<GameDetail>(1, 1, {
        filter: `first_disc_serial = "${firstDiscSerial.replace(/"/g, '\\"')}"`,
        expand: 'discs,documents',
      });
      const game = list.items[0];
      if (!game) throw new Error('Not found');
      return game;
    },
  });
}
