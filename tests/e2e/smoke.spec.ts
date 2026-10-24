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

test('drives the live GameScene through the deterministic API', async ({ page }) => {
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
  const initial = await page.evaluate(() => window.__SOULRUN_TEST__?.snapshot());
  expect(initial?.player).toMatchObject({ x: 960, y: 536, health: 100 });
  expect(Number(await root.getAttribute('data-player-x'))).toBe(initial?.player.x);

  await page.evaluate(async () => {
    const api = window.__SOULRUN_TEST__;
    if (!api) throw new Error('Missing test API');
    api.input('right', true);
    await api.advance(1000);
    api.input('right', false);
  });
  const moved = await page.evaluate(() => window.__SOULRUN_TEST__?.snapshot());
  expect(moved?.player.x).toBeCloseTo(1050, 8);
  expect(Number(await root.getAttribute('data-player-x'))).toBeCloseTo(moved?.player.x ?? 0, 2);

  await page.evaluate(() => {
    const api = window.__SOULRUN_TEST__;
    const snapshot = api?.snapshot();
    if (!api || !snapshot) throw new Error('Missing test API');
    api.aimAt(snapshot.player.x, snapshot.player.y - 100);
  });
  await expect(root).toHaveAttribute('data-aim-direction', 'n');
  await expect(root).toHaveAttribute('data-last-projectile-body', '24x8');

  await page.evaluate(() => window.__SOULRUN_TEST__?.input('pause', true));
  await expect(root).toHaveAttribute('data-test-state', 'paused');
  const projectileCount = await root.getAttribute('data-active-projectile-count');
  await page.waitForTimeout(1800);
  await expect(root).toHaveAttribute('data-active-projectile-count', projectileCount ?? '0');
  await page.evaluate(() => window.__SOULRUN_TEST__?.input('pause', true));

  await page.evaluate(async () => {
    const api = window.__SOULRUN_TEST__;
    if (!api) throw new Error('Missing test API');
    await api.forceBoss();
    api.damagePlayer(100);
  });
  expect((await page.evaluate(() => window.__SOULRUN_TEST__?.snapshot()))?.player.health).toBe(100);
  await page.evaluate(async () => {
    const api = window.__SOULRUN_TEST__;
    if (!api) throw new Error('Missing test API');
    await api.advance(2017);
    api.damagePlayer(100);
  });
  const ended = await page.evaluate(() => window.__SOULRUN_TEST__?.snapshot());
  expect(ended).toMatchObject({
    state: 'adventure-ended',
    boss: { id: 'graveyard-guardian' },
    player: { health: 0, aimDirection: 'n' },
  });
  await expect(root).toHaveAttribute('data-test-state', 'adventure-ended');
  expect(Number(await root.getAttribute('data-event-sequence'))).toBe(ended?.eventSequence);

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
