import { test, expect } from '@playwright/test';

test('sign-in dialog opens from header', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /account/i }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
});
