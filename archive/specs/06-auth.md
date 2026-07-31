# Stage 6 — Auth (email/password)

Wire sign-in, sign-up, sign-out, and session persistence. The header's `account_circle` becomes a real menu when authenticated. Sessions last 5 days (PB's auth token duration, per `pb_schema.json`).

## Goal

- Click `account_circle` in the header → opens a sign-in modal.
- Sign-in / sign-up via email/password.
- Session persists across reloads (PB's `authStore` handles this in the browser).
- Sign-out clears the session.
- Sessions expire after 5 days; on 401, surfaces a "session expired" toast and re-opens sign-in.

## Decisions (locked)

- **Email/password only** for v1. OAuth2 deferred.
- React Hook Form + Zod for the forms.
- Zustand for the auth state (file added in Stage 2 as a stub).
- `pb.authStore.onChange` is the source of truth for client-side reactivity.
- 401 detection via a TanStack Query global error handler.

## Files to create / edit

### `package.json` — add deps

```bash
npm install react-hook-form @hookform/resolvers
```

### `src/features/auth/store.ts`

```ts
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
```

### `src/features/auth/SignInDialog.tsx`

`<dialog>` element, opened imperatively from the header. Form: email + password. On submit, calls `auth.signInWithPassword`. Errors mapped from PB response.

### `src/features/auth/SignUpDialog.tsx`

Same skeleton as `SignInDialog`, calls `auth.signUp`. Adds a `name` field. After successful create, immediately auths in.

### `src/features/auth/AccountMenu.tsx`

Replaces the bare `account_circle` button in the header when authenticated. Avatar (from `users.avatar` via `fileUrl`) + a dropdown with display name + sign-out button.

### `src/components/layout/Header.tsx` (edit)

- Add a `<dialog>` ref for the sign-in modal.
- Wire the `account_circle` button to open it.
- When `isAuthenticated`, render `<AccountMenu>` instead of the button.

### `src/lib/pb-query.ts`

A small wrapper around TanStack Query that handles 401s globally:

```ts
import { useAuthStore } from '@/features/auth/store';

export function onQueryError(err: unknown) {
  if (
    err &&
    typeof err === 'object' &&
    'status' in err &&
    (err as { status: number }).status === 401
  ) {
    useAuthStore.getState().setUser(null);
    // The Header's listener will open the sign-in dialog.
  }
}
```

Pass `onError: onQueryError` as a `defaultOptions.queries` callback in `QueryClient` config (edit `src/main.tsx`).

### `src/features/auth/SignInDialog.test.tsx`

Stub for Stage 8; not required here.

## Behavior checklist

- [ ] Sign-in form validates email + password (min 8 chars per PB schema).
- [ ] Server errors render inline (not via `alert`).
- [ ] Sign-up creates the user, then auto-auths.
- [ ] After auth, the header shows the avatar + dropdown.
- [ ] Sign-out clears the session and reverts the header.
- [ ] Reload preserves the session (PB SDK persists `authStore` in `localStorage`).
- [ ] After a forced 401 (e.g. invalidating `authStore` manually), the next query triggers the "session expired" recovery.

## Acceptance criteria

- [ ] Sign-in with a real PB user works.
- [ ] Sign-up creates a new user and authenticates immediately.
- [ ] Sign-out clears the session.
- [ ] Page reload preserves the session.
- [ ] Authed state is reflected in the header.
- [ ] 401 from any query clears the auth state and re-opens the sign-in modal.
- [ ] `npm run typecheck && npm run lint` pass.

## Manual verification

1. `npm run dev`.
2. Click `account_circle` → sign-in dialog opens.
3. Sign in with a real PB user → header swaps to avatar.
4. Reload → still signed in.
5. Sign out → header swaps back to `account_circle`.
6. Manually invalidate: `pb.authStore.clear()` in DevTools → trigger any query → sign-in modal re-opens.

## Out of scope

- OAuth2 (Discord / Google) — deferred.
- Password reset / email verification flows — not in v1.
- Memory card / save state UI — explicitly out of scope per `AGENTS.md`.
