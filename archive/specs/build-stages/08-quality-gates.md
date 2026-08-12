# Stage 8 — Quality gates

Configure lint, typecheck, unit tests, component tests, and Playwright e2e. By the end, `npm run lint && npm run typecheck && npm run test && npm run test:e2e` is the green-light gate for any PR.

## Goal

A safety net that catches regressions before the cluster ships them.

## Decisions (locked)

- **Vitest** for unit + component tests.
- **@testing-library/react** for component tests.
- **Playwright** for e2e (read-only smoke against live PB).
- ESLint + Prettier already configured in Stage 1.
- Pre-commit hook (Husky + lint-staged) for staged-file lint/format.

## Files to create / edit

### `package.json` — add deps

```bash
npm install -D vitest @testing-library/react @testing-library/jest-dom @testing-library/user-event \
  jsdom @vitest/coverage-v8 \
  @playwright/test
```

Add scripts:

```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "test:cov": "vitest run --coverage",
    "test:e2e": "playwright test",
    "test:e2e:ui": "playwright test --ui"
  }
}
```

### `vitest.config.ts`

```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    globals: true,
    coverage: { reporter: ['text', 'html'], exclude: ['src/test/**', 'src/types/pocketbase.ts'] },
  },
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
});
```

### `src/test/setup.ts`

```ts
import '@testing-library/jest-dom/vitest';
```

### `playwright.config.ts`

```ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'html',
  use: {
    baseURL: 'https://psx.alexklingenbeck.de',
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile-safari', use: { ...devices['iPhone 13'] } },
  ],
});
```

### `e2e/browse.spec.ts`

```ts
import { test, expect } from '@playwright/test';

test('browse loads and shows games', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Browse Games' })).toBeVisible();
  await expect(page.locator('main a').first()).toBeVisible({ timeout: 10_000 });
});
```

### `e2e/details.spec.ts`

```ts
import { test, expect } from '@playwright/test';

test('browse → details → lightbox', async ({ page }) => {
  await page.goto('/');
  const firstCard = page.locator('main a').first();
  await firstCard.click();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  // Lightbox is environment-dependent; covered in Stage 7.
});
```

### `e2e/auth.spec.ts`

```ts
import { test, expect } from '@playwright/test';

test('sign-in dialog opens from header', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /account/i }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
});
```

### Component tests

Mirror the structure under `src/**/*.test.tsx`:

- `src/components/media/GameCard.test.tsx` — renders, navigates on click.
- `src/components/media/ScreenshotCarousel.test.tsx` — renders N slides, chevron clicks scroll.
- `src/components/media/MetadataPanel.test.tsx` — handles missing fields gracefully.
- `src/features/games/filter.test.ts` — table-driven tests for `buildGameFilter`.
- `src/features/auth/store.test.ts` — set/clear auth state.

### `src/test/MockPb.ts`

A tiny mock for `pb` that returns canned responses so component tests don't hit the network. Use `vi.mock('pocketbase')` in component tests that touch PB.

### Pre-commit hook

Add `husky` + `lint-staged`:

```bash
npm install -D husky lint-staged
npx husky init
```

`.husky/pre-commit`:

```sh
npx lint-staged
```

`package.json`:

```json
"lint-staged": {
  "*.{ts,tsx}": ["eslint --fix", "prettier --write"],
  "*.{css,md}": ["prettier --write"]
}
```

Add a `prepare` script: `"prepare": "husky"`.

## Acceptance criteria

- [ ] `npm run lint` passes.
- [ ] `npm run typecheck` passes.
- [ ] `npm run test` runs Vitest and passes.
- [ ] `npm run test:cov` reports ≥ 70% coverage on `src/features/**` and `src/components/**`.
- [ ] `npm run test:e2e` runs Playwright (Chromium + iPhone 13) and passes.
- [ ] Pre-commit hook runs lint + format on staged files.
- [ ] CI workflow (out of repo scope, but referenced in `README.md`) runs the same four scripts.

## Manual verification

1. `npm run lint && npm run typecheck && npm run test` — all green.
2. `npm run test:e2e` — Playwright walks through browse → details → dialog, both projects.
3. `git add -A && git commit -m "test"` — hook runs lint/format on staged files.
4. `npm run test:cov` — coverage report generated in `coverage/`.

## Out of scope

- Mutation e2e against a local PB (deferred to Stage 8b — not required for v1).
- Visual regression tests (e.g. Percy / Chromatic).
- Performance budgets in CI.
