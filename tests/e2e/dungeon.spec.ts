import { expect, test } from '@playwright/test';

test('loads the Dungeon map and runs ranged and splitting enemy behaviors', async ({ page }) => {
  await page.goto('/?test=1&seed=dungeon-e2e-001');
  await page.waitForFunction(() => Boolean(window.__SOULRUN_TEST__));
  await page.evaluate(async () => {
    const api = window.__SOULRUN_TEST__;
    if (!api) throw new Error('Missing test API');
    await api.ready();
    await api.startAdventure({ seed: 'dungeon-e2e-001', stageId: 'dungeon' });
    const player = api.snapshot().player;
    await api.spawnXpGem({ value: 100_000, x: player.x, y: player.y });
    await api.advance(17);
    for (let pick = 0; pick < 240 && api.snapshot().activeUpgradeOffer; pick += 1) {
      const offer = api.snapshot().activeUpgradeOffer;
      if (!offer) break;
      const aura = offer.optionIds.findIndex((id) => id === 'death-aura');
      const health = offer.optionIds.findIndex((id) => id === 'max-health');
      const normal = offer.optionIds.findIndex((id) => !id.startsWith('mastery-'));
      await api.chooseUpgrade(
        (aura >= 0 ? aura : health >= 0 ? health : normal >= 0 ? normal : 0) as 0 | 1 | 2,
      );
    }
    await api.advance(30_000);
  });

  const root = page.locator('[data-testid="game-root"]');
  await expect(root).toHaveAttribute('data-stage-id', 'dungeon');
  await expect(root).toHaveAttribute('data-map-key', 'map-dungeon');
  await expect(root).toHaveAttribute('data-obstacle-count', '10');
  expect(Number(await root.getAttribute('data-enemy-ranged-shot-count'))).toBeGreaterThan(0);
  expect(Number(await root.getAttribute('data-split-spawn-count'))).toBeGreaterThan(0);
  expect(
    Object.keys(
      (await page.evaluate(() => window.__SOULRUN_TEST__?.snapshot()))?.enemyCountsById ?? {},
    ).every((id) => ['skeleton-archer', 'splitting-slime', 'small-slime', 'zombie'].includes(id)),
  ).toBe(true);
  if (process.env.CAPTURE_EVIDENCE === '1') {
    await page.screenshot({ path: 'docs/evidence/issue-10-dungeon.png' });
  }
});

test('blocks the player and Ghost Arrow at Dungeon walls', async ({ page }) => {
  await page.goto('/?test=1&seed=dungeon-collision-001');
  await page.waitForFunction(() => Boolean(window.__SOULRUN_TEST__));
  await page.evaluate(async () => {
    const api = window.__SOULRUN_TEST__;
    if (!api) throw new Error('Missing test API');
    await api.ready();
    await api.startAdventure({ seed: 'dungeon-collision-001', stageId: 'dungeon' });
    api.aimAt(1400, 536);
    await api.advance(800);
  });

  const root = page.locator('[data-testid="game-root"]');
  await expect(root).toHaveAttribute('data-ghost-arrow-count', '1');
  await expect(root).toHaveAttribute('data-active-ghost-arrow-count', '0');

  await page.evaluate(async () => {
    const api = window.__SOULRUN_TEST__;
    if (!api) throw new Error('Missing test API');
    api.input('right', true);
    await api.advance(2000);
    api.input('right', false);
  });
  expect((await page.evaluate(() => window.__SOULRUN_TEST__?.snapshot()))?.player.x).toBeCloseTo(
    1128,
    4,
  );
});

test('runs the Skeleton Warden phases and hands off to Inferno', async ({ page }) => {
  await page.goto('/?test=1&seed=dungeon-boss-001');
  await page.waitForFunction(() => Boolean(window.__SOULRUN_TEST__));
  await page.evaluate(async () => {
    const api = window.__SOULRUN_TEST__;
    if (!api) throw new Error('Missing test API');
    await api.ready();
    await api.startAdventure({ seed: 'dungeon-boss-001', stageId: 'dungeon' });
    await api.forceBoss();
  });
  const root = page.locator('[data-testid="game-root"]');
  await expect(root).toHaveAttribute('data-boss-x', '960.00');
  await expect(root).toHaveAttribute('data-boss-y', '176.00');
  await page.evaluate(async () => {
    const api = window.__SOULRUN_TEST__;
    if (!api) throw new Error('Missing test API');
    api.damageBoss(1200);
    await api.advance(1000);
  });

  expect(await page.evaluate(() => window.__SOULRUN_TEST__?.snapshot())).toMatchObject({
    state: 'boss-fight',
    stageId: 'dungeon',
    boss: { id: 'skeleton-warden', health: 1000, phase: 2 },
  });
  expect(Number(await root.getAttribute('data-boss-pattern-shot-count'))).toBeGreaterThanOrEqual(7);

  await page.evaluate(() => window.__SOULRUN_TEST__?.damageBoss(2200));
  expect(await page.evaluate(() => window.__SOULRUN_TEST__?.snapshot())).toMatchObject({
    state: 'upgrade-choice',
    boss: { id: 'skeleton-warden', health: 0, phase: 2 },
    activeUpgradeOffer: { source: 'boss' },
  });
  await page.evaluate(async () => window.__SOULRUN_TEST__?.chooseUpgrade(0));
  expect(await page.evaluate(() => window.__SOULRUN_TEST__?.snapshot())).toMatchObject({
    state: 'loading-stage',
    stageId: 'inferno',
  });
});

test('activates and removes the Warden corridor block after its telegraph', async ({ page }) => {
  await page.goto('/?test=1&seed=dungeon-block-001');
  await page.waitForFunction(() => Boolean(window.__SOULRUN_TEST__));
  await page.evaluate(async () => {
    const api = window.__SOULRUN_TEST__;
    if (!api) throw new Error('Missing test API');
    await api.ready();
    await api.startAdventure({ seed: 'dungeon-block-001', stageId: 'dungeon' });
    await api.forceBoss();
    await api.advance(6100);
    api.input('down', true);
    await api.advance(700);
    api.input('down', false);
    await api.advance(200);
  });

  const root = page.locator('[data-testid="game-root"]');
  await expect(root).toHaveAttribute('data-boss-block-active', 'true');
  await page.evaluate(async () => {
    const api = window.__SOULRUN_TEST__;
    if (!api) throw new Error('Missing test API');
    api.input('up', true);
    await api.advance(1000);
    api.input('up', false);
  });
  expect(
    (await page.evaluate(() => window.__SOULRUN_TEST__?.snapshot()))?.player.y,
  ).toBeGreaterThanOrEqual(556);
  await page.evaluate(async () => window.__SOULRUN_TEST__?.advance(900));
  await expect(root).toHaveAttribute('data-boss-block-active', 'false');
});
