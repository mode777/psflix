import { test, expect } from '@playwright/test';

test('browse → details', async ({ page }) => {
  await page.goto('/');
  const firstCard = page.locator('main a').first();
  await firstCard.waitFor({ state: 'visible', timeout: 15_000 });
  await firstCard.click();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  // Lightbox is environment-dependent; covered in Stage 7.
});
