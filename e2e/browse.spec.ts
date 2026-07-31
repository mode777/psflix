import { test, expect } from '@playwright/test';

test('browse loads and shows games', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Browse Games' })).toBeVisible();
  await expect(page.locator('main a').first()).toBeVisible({ timeout: 10_000 });
});
