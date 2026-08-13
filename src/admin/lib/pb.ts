import PocketBase, { LocalAuthStore } from 'pocketbase';

const url = import.meta.env.VITE_PB_URL || 'https://psx.alexklingenbeck.de';

/**
 * Dedicated admin PocketBase client.
 *
 * The user app (`src/lib/pb.ts`) persists its auth token under the default
 * `'pocketbase_auth'` localStorage key. This client uses a **distinct**
 * `'pocketbase_admin_auth'` key (via `LocalAuthStore`) so the admin superuser
 * session and the end-user session never overwrite each other — they are two
 * independent realms (see design.md, Decision 2).
 */
export const adminAuthStore = new LocalAuthStore('pocketbase_admin_auth');

export const adminClient = new PocketBase(url, adminAuthStore);

adminClient.autoCancellation(false);
