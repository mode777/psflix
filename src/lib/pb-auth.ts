import { pb } from './pb';

export type AuthUser = {
  id: string;
  email: string;
  name?: string;
  avatar?: string;
};

export const auth = {
  async signInWithPassword(email: string, password: string): Promise<AuthUser> {
    const result = await pb.collection('users').authWithPassword(email, password);
    return result.record as unknown as AuthUser;
  },
  async signUp(email: string, password: string, name?: string): Promise<AuthUser> {
    await pb.collection('users').create({ email, password, passwordConfirm: password, name });
    const result = await pb.collection('users').authWithPassword(email, password);
    return result.record as unknown as AuthUser;
  },
  async signOut(): Promise<void> {
    pb.authStore.clear();
  },
  get currentUser(): AuthUser | null {
    return pb.authStore.record as unknown as AuthUser | null;
  },
  isAuthenticated(): boolean {
    return pb.authStore.isValid;
  },
};
