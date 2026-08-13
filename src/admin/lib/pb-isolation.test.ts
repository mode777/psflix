import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import PocketBase, { LocalAuthStore } from 'pocketbase';

const URL = 'http://localhost:8090';
const USER_KEY = 'pocketbase_auth';
const ADMIN_KEY = 'pocketbase_admin_auth';

const userRecord = { id: 'u1', email: 'user@example.com', collectionName: 'users' };
const adminRecord = { id: 's1', email: 'admin@example.com', collectionName: '_superusers' };

/** Minimal JWT with a future `exp` so PocketBase's `isValid` considers it valid. */
function jwt(): string {
  const b64obj = (o: unknown) =>
    btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const header = { alg: 'HS256', typ: 'JWT' };
  const payload = { exp: Math.floor(Date.now() / 1000) + 3600 };
  return `${b64obj(header)}.${b64obj(payload)}.sig`;
}

const userToken = jwt();
const adminToken = jwt();

describe('admin / user auth-store isolation', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('persists each token under a distinct localStorage key', () => {
    const userClient = new PocketBase(URL);
    const adminClient = new PocketBase(URL, new LocalAuthStore(ADMIN_KEY));

    userClient.authStore.save(userToken, userRecord as never);
    adminClient.authStore.save(adminToken, adminRecord as never);

    expect(localStorage.getItem(USER_KEY)).toContain(userToken);
    expect(localStorage.getItem(ADMIN_KEY)).toContain(adminToken);
    expect(localStorage.getItem(USER_KEY)).not.toBe(localStorage.getItem(ADMIN_KEY));
  });

  it('writing the user token does not touch the admin client authStore', () => {
    const userClient = new PocketBase(URL);
    const adminClient = new PocketBase(URL, new LocalAuthStore(ADMIN_KEY));

    expect(adminClient.authStore.isValid).toBe(false);
    expect(adminClient.authStore.token).toBe('');

    userClient.authStore.save(userToken, userRecord as never);

    // The admin client, constructed with a distinct key, is untouched.
    expect(adminClient.authStore.isValid).toBe(false);
    expect(adminClient.authStore.token).toBe('');
    expect(userClient.authStore.token).toBe(userToken);
    expect(userClient.authStore.isValid).toBe(true);
  });

  it('clearing the admin store does not clear the user store', () => {
    const userClient = new PocketBase(URL);
    const adminClient = new PocketBase(URL, new LocalAuthStore(ADMIN_KEY));

    userClient.authStore.save(userToken, userRecord as never);
    adminClient.authStore.save(adminToken, adminRecord as never);

    adminClient.authStore.clear();

    expect(adminClient.authStore.isValid).toBe(false);
    expect(userClient.authStore.isValid).toBe(true);
    expect(userClient.authStore.token).toBe(userToken);
    expect(localStorage.getItem(USER_KEY)).toContain(userToken);
    expect(localStorage.getItem(ADMIN_KEY)).toBeNull();
  });

  it('a freshly constructed client restores only its own realm', () => {
    const userClient = new PocketBase(URL);
    userClient.authStore.save(userToken, userRecord as never);

    // Simulate a reload: brand-new client instances read localStorage.
    const reloadedUser = new PocketBase(URL);
    const reloadedAdmin = new PocketBase(URL, new LocalAuthStore(ADMIN_KEY));

    expect(reloadedUser.authStore.token).toBe(userToken);
    expect(reloadedUser.authStore.isValid).toBe(true);
    expect(reloadedAdmin.authStore.token).toBe('');
    expect(reloadedAdmin.authStore.isValid).toBe(false);
  });
});
