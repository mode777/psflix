import { create } from 'zustand';

export type ToastKind = 'error' | 'info';

export type Toast = {
  id: number;
  kind: ToastKind;
  message: string;
  action?: { label: string; onClick: () => void };
};

type ToastStore = {
  toasts: Toast[];
  show: (t: Omit<Toast, 'id'>) => number;
  dismiss: (id: number) => void;
};

let nextId = 1;
const DEFAULT_TIMEOUT_MS = 5000;

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  show: (t) => {
    const id = nextId++;
    set((s) => ({ toasts: [...s.toasts, { ...t, id }] }));
    if (t.action === undefined) {
      setTimeout(() => {
        set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) }));
      }, DEFAULT_TIMEOUT_MS);
    }
    return id;
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })),
}));

export function showToast(
  message: string,
  opts: { kind?: ToastKind; action?: { label: string; onClick: () => void } } = {},
) {
  return useToastStore.getState().show({
    kind: opts.kind ?? 'error',
    message,
    action: opts.action,
  });
}
