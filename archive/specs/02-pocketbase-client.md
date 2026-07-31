# Stage 2 — PocketBase client + generated types

Wire the PocketBase JS SDK as a typed singleton, generate TS types from `pb_schema.json`, and add a file-URL helper. After this stage, `pb.collection('games').getList(1, 5)` is fully typed.

## Goal

A typed `pb` instance + schema-derived types + zod-validated JSON fields (`languages`, `features`). No UI; this is plumbing.

## Decisions (locked)

- `pocketbase` JS SDK (official).
- `pocketbase-typegen` for codegen.
- `zod` for runtime validation of the JSON fields.
- `zustand` for the auth store (used in Stage 6, but the dep is added here).

## Files to create / edit

### `package.json` — add deps

```bash
npm install pocketbase zod zustand
npm install -D pocketbase-typegen
```

Add a `typegen` script:

```json
"typegen": "pocketbase-typegen --json ../pb_schema.json --out ./src/types/pocketbase.ts"
```

(Long-term, wire this into a pre-commit hook and a CI step; not in this stage.)

### `src/lib/pb.ts`

```ts
import PocketBase from 'pocketbase';

const url = import.meta.env.VITE_PB_URL || 'https://psx.alexklingenbeck.de';

export const pb = new PocketBase(url);

pb.autoCancellation(false);
```

Single global instance, per PocketBase docs. `autoCancellation(false)` is safe for a long-lived SPA.

### `src/lib/pb-files.ts`

```ts
import { pb } from './pb';

export function fileUrl(record: { collectionId: string; id: string }, filename: string): string {
  return pb.files.getURL(record, filename);
}
```

Never concatenate `/api/files/...` by hand; use this helper.

### `src/types/pocketbase.ts` — generated

Run `npm run typegen`. The output should:

- Define `Game`, `Disc`, `Document`, `MemoryCard`, `SaveState`, `User` types.
- For collection names, also export a `Collections` enum-like record.
- For JSON fields, types come out as `unknown` or `string | null` — **purify these in `src/types/games.ts`**, not here.

Commit the generated file. Review the diff when `pb_schema.json` changes.

### `src/types/games.ts`

```ts
import { z } from 'zod';

export const gameLanguagesSchema = z.array(z.string()).default([]);
export const gameFeaturesSchema = z.array(z.string()).default([]);

export type GameLanguages = z.infer<typeof gameLanguagesSchema>;
export type GameFeatures = z.infer<typeof gameFeaturesSchema>;

export function parseGameLanguages(value: unknown): GameLanguages {
  return gameLanguagesSchema.parse(value);
}
export function parseGameFeatures(value: unknown): GameFeatures {
  return gameFeaturesSchema.parse(value);
}
```

Same pattern for any other untyped JSON you find when wiring views (Stages 4–5).

### `src/lib/pb-auth.ts`

Stub for Stage 6. Add the file so subsequent stages can import it without a churn.

```ts
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
    const created = await pb
      .collection('users')
      .create({ email, password, passwordConfirm: password, name });
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
```

Stage 6 will wrap this in a Zustand store and add 401 handling.

### `src/types/pocketbase.test.ts` (smoke test)

A trivial test that ensures the generated types compile and `pb` instantiates. Real tests come in Stage 8; this is a placeholder so the spec's "verification" line is honest.

```ts
import { describe, it, expect } from 'vitest';
import { pb } from '@/lib/pb';

describe('pb client', () => {
  it('constructs against the production PB instance', () => {
    expect(pb).toBeDefined();
    expect(pb.baseUrl).toMatch(/psx\.alexklingenbeck\.de/);
  });
});
```

Requires Vitest, which is added in Stage 8. Defer this file until Stage 8 lands; do not add Vitest here.

## Acceptance criteria

- [ ] `npm install` succeeds; all deps in `package.json`.
- [ ] `npm run typegen` produces `src/types/pocketbase.ts` with `Game`, `Disc`, `Document`, `MemoryCard`, `SaveState`, `User` types.
- [ ] `src/types/pocketbase.ts` is committed.
- [ ] `src/lib/pb.ts`, `src/lib/pb-files.ts`, `src/lib/pb-auth.ts`, `src/types/games.ts` exist.
- [ ] `npm run typecheck` passes (it imports the generated types and the new modules).
- [ ] `npm run lint` passes.

## Manual verification

From a Node REPL or a one-off script:

```ts
import { pb } from './src/lib/pb';
const list = await pb.collection('games').getList(1, 3, { expand: 'discs' });
console.log(list.items.length, list.items[0]?.title);
```

Expected: 3 titles printed, no exceptions. (The first call may take ~200 ms — that's PB warming up.)

## When `pb_schema.json` changes

1. Refresh the schema from the PB instance (manual export — out of scope here).
2. `npm run typegen`.
3. Review the diff; update `src/types/games.ts` parsers if new JSON fields appear.
4. Re-run Stages 4, 5, 6 verification.

## Out of scope

- TanStack Query (Stage 4).
- Auth UI (Stage 6).
- 401 handling on queries (Stage 6).
- React hooks / queries (Stage 4).
