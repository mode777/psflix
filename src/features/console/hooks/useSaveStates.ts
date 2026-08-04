import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { emulatorService } from '../services';
import type { SaveSlot } from '../types';

const SAVES_KEY = (discId: string, userId: string) => ['save-states', discId, userId] as const;

export function useSaveStates(discId: string | undefined, userId: string | undefined) {
  return useQuery({
    queryKey: SAVES_KEY(discId ?? '', userId ?? ''),
    enabled: !!discId && !!userId,
    queryFn: () => emulatorService.listSaveStates(discId!, userId!),
  });
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
