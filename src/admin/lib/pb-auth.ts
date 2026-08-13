import { adminClient } from './pb';

export type AdminUser = {
  id: string;
  email: string;
};

export const adminAuth = {
  async signInWithPassword(email: string, password: string): Promise<AdminUser> {
    const result = await adminClient.collection('_superusers').authWithPassword(email, password);
    return result.record as unknown as AdminUser;
  },
  async signOut(): Promise<void> {
    adminClient.authStore.clear();
  },
  get currentUser(): AdminUser | null {
    return adminClient.authStore.record as unknown as AdminUser | null;
  },
  isAuthenticated(): boolean {
    return adminClient.authStore.isValid;
  },
};
