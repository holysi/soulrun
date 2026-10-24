import { expect, test } from '@playwright/test';

test('loads a 480x270 nearest-neighbor Phaser canvas', async ({ page }) => {
  await page.goto('/');

  await expect(page).toHaveTitle('魂夜輪迴');
  const canvas = page.locator('canvas');
  await expect(canvas).toBeVisible();
  await expect(canvas).toHaveAttribute('width', '480');
  await expect(canvas).toHaveAttribute('height', '270');
  await expect(canvas).toHaveCSS('image-rendering', 'pixelated');
  await expect(page.locator('[data-testid="game-root"]')).not.toHaveAttribute('data-test-state');
});

test('exposes a deterministic start, pause, and restart hook only in test mode', async ({
  page,
}) => {
  await page.goto('/?test=1&seed=smoke-seed-001');

  await page.waitForFunction(() => Boolean(window.__SOULRUN_TEST__));
  await page.evaluate(async () => {
    const api = window.__SOULRUN_TEST__;
    if (!api) throw new Error('Missing test API');
    await api.ready();
    await api.startAdventure({ seed: 'smoke-seed-001' });
  });

  const root = page.locator('[data-testid="game-root"]');
  await expect(root).toHaveAttribute('data-test-state', 'playing');
  await page.evaluate(() => window.__SOULRUN_TEST__?.input('pause', true));
  await expect(root).toHaveAttribute('data-test-state', 'paused');
  await page.evaluate(() => window.__SOULRUN_TEST__?.reset({ clearStorage: true }));
  await expect(root).toHaveAttribute('data-test-state', 'idle');

  const snapshot = await page.evaluate(() => window.__SOULRUN_TEST__?.snapshot());
  expect(snapshot).toMatchObject({ state: 'idle', seed: 'smoke-seed-001', eventSequence: 0 });
});

test('moves, aims, auto-fires, and pauses the playable Soul Guide', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('Enter');

  const root = page.locator('[data-testid="game-root"]');
  await expect(root).toHaveAttribute('data-game-state', 'playing');
  const startX = Number(await root.getAttribute('data-player-x'));

  await page.keyboard.down('KeyD');
  await page.waitForTimeout(300);
  await page.keyboard.up('KeyD');
  await expect
    .poll(async () => Number(await root.getAttribute('data-player-x')))
    .toBeGreaterThan(startX);

  const canvas = page.locator('canvas');
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Canvas bounds unavailable');
  await page.mouse.move(box.x + box.width - 8, box.y + box.height / 2);
  await expect(root).toHaveAttribute('data-aim-direction', 'e');
  await expect
    .poll(async () => Number(await root.getAttribute('data-ghost-arrow-count')))
    .toBeGreaterThan(0);

  await page.keyboard.down('Escape');
  await page.waitForTimeout(50);
  await page.keyboard.up('Escape');
  await expect(root).toHaveAttribute('data-game-state', 'paused');
  await page.keyboard.down('Escape');
  await page.waitForTimeout(50);
  await page.keyboard.up('Escape');
  await expect(root).toHaveAttribute('data-game-state', 'playing');

  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await expect(root).toHaveAttribute('data-game-state', 'paused');
});
