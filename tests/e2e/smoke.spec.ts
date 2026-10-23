import { expect, test } from '@playwright/test';

test('loads a 480x270 nearest-neighbor Phaser canvas', async ({ page }) => {
  await page.goto('/');

  await expect(page).toHaveTitle('魂夜輪迴');
  const canvas = page.locator('canvas');
  await expect(canvas).toBeVisible();
  await expect(canvas).toHaveAttribute('width', '480');
  await expect(canvas).toHaveAttribute('height', '270');
  await expect(canvas).toHaveCSS('image-rendering', 'pixelated');
});
