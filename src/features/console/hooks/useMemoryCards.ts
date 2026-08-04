import { useQuery } from '@tanstack/react-query';
import { emulatorService } from '../services';

export function useMemoryCards(userId: string | undefined) {
  return useQuery({
    queryKey: ['memory-cards', userId ?? ''],
    enabled: !!userId,
    queryFn: () => emulatorService.listMemoryCards(userId!),
  });
}
