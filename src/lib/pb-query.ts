import { useAuthStore } from '@/features/auth/store';
import { showToast } from '@/lib/toast';

type ErrorWithStatus = { status: number };

function getErrorStatus(err: unknown): number | undefined {
  if (err && typeof err === 'object' && 'status' in err) {
    const v = (err as ErrorWithStatus).status;
    if (typeof v === 'number') return v;
  }
  return undefined;
}

export function onQueryError(err: unknown) {
  const status = getErrorStatus(err);
  if (status === 401) {
    useAuthStore.getState().setUser(null);
    return;
  }
  if (status === undefined) {
    showToast('Network error. Check your connection.', {
      action: { label: 'Retry', onClick: () => window.location.reload() },
    });
    return;
  }
  if (status >= 500) {
    showToast('Server error. Please try again later.');
  }
}
