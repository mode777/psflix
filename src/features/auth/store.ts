import { create } from 'zustand';
import { pb } from '@/lib/pb';
import type { AuthUser } from '@/lib/pb-auth';

type AuthState = {
  user: AuthUser | null;
  isAuthenticated: boolean;
  setUser: (user: AuthUser | null) => void;
};

export const useAuthStore = create<AuthState>((set) => ({
  user: (pb.authStore.record as unknown as AuthUser | null) ?? null,
  isAuthenticated: pb.authStore.isValid,
  setUser: (user) => set({ user, isAuthenticated: !!user }),
}));

pb.authStore.onChange(() => {
  useAuthStore.getState().setUser((pb.authStore.record as unknown as AuthUser | null) ?? null);
});
