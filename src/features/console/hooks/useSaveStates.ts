import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { emulatorService } from '../services';
import type { DiscsResponse } from '@/types/pocketbase';
import type { SaveSlot, SaveStateInfo } from '../types';

const SAVES_KEY = (discId: string, userId: string) => ['save-states', discId, userId] as const;

export function useSaveStates(discId: string | undefined, userId: string | undefined) {
  return useQuery({
    queryKey: SAVES_KEY(discId ?? '', userId ?? ''),
    enabled: !!discId && !!userId,
    queryFn: () => emulatorService.listSaveStates(discId!, userId!),
  });
}

/**
 * Fetches save states for *every* disc of a game at once, merging them into a
 * flat list. Reuses the per-disc `SAVES_KEY` cache keys so results are shared
 * with the single-disc `useSaveStates` used in the console view (and refreshed
 * together when a sync pass invalidates `['save-states']`).
 *
 * Used by the details view to surface the latest save across all discs (a save
 * state is keyed per-disc, not per-game), so Continue can target the right disc.
 */
export function useGameSaveStates(discs: DiscsResponse[], userId: string | undefined) {
  const queries = useQueries({
    queries: discs.map((disc) => ({
      queryKey: SAVES_KEY(disc.id, userId ?? ''),
      enabled: !!userId,
      queryFn: () => emulatorService.listSaveStates(disc.id, userId!),
    })),
  });
  const all: SaveStateInfo[] = [];
  for (const q of queries) {
    if (q.data) all.push(...q.data);
  }
  return all;
}

export function useSaveStateMutation(discId: string | undefined, userId: string | undefined) {
  const qc = useQueryClient();
  const key = SAVES_KEY(discId ?? '', userId ?? '');

  const invalidate = () => qc.invalidateQueries({ queryKey: key });

  const save = useMutation({
    mutationFn: (slot: SaveSlot) => emulatorService.saveState(slot, discId!, userId!),
    onSuccess: invalidate,
  });

  const load = useMutation({
    mutationFn: (slot: SaveSlot) => emulatorService.loadState(slot, discId!, userId!),
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: (slot: SaveSlot) => emulatorService.deleteState(slot, discId!, userId!),
    onSuccess: invalidate,
  });

  return { save, load, remove };
}

export { SAVES_KEY };
