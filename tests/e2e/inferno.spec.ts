import { expect, test } from '@playwright/test';

const INFERNO_ASSETS = [
  'enemy-swift-demon',
  'enemy-flame-skull',
  'boss-flame-demon',
  'tileset-inferno',
  'map-inferno',
  'vfx-lava',
] as const;

test('loads the Inferno arena, fixed lava, and production enemy behaviors', async ({ page }) => {
  const responses = new Map<string, number>();
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('response', (response) => {
    for (const asset of INFERNO_ASSETS) {
      if (response.url().includes(asset)) responses.set(asset, response.status());
    }
  });

  await page.goto('/?test=1&seed=inferno-e2e-001');
  await page.waitForFunction(() => Boolean(window.__SOULRUN_TEST__));
  await page.evaluate(async () => {
    const api = window.__SOULRUN_TEST__;
    if (!api) throw new Error('Missing test API');
    await api.ready();
    await api.startAdventure({ seed: 'inferno-e2e-001', stageId: 'inferno' });
    api.input('down', true);
    await api.advance(1300);
    api.input('down', false);
    const player = api.snapshot().player;
    await api.spawnXpGem({ value: 100_000, x: player.x, y: player.y });
    await api.advance(17);
    for (let pick = 0; pick < 240 && api.snapshot().activeUpgradeOffer; pick += 1) {
      const offer = api.snapshot().activeUpgradeOffer;
      if (!offer) break;
      const health = offer.optionIds.findIndex(
        (id) => id === 'max-health' || id === 'mastery-health',
      );
      const normal = offer.optionIds.findIndex((id) => !id.startsWith('mastery-'));
      await api.chooseUpgrade((health >= 0 ? health : normal >= 0 ? normal : 0) as 0 | 1 | 2);
    }
    api.aimAt(0, 1072);
    await api.advance(30_000);
  });

  const root = page.locator('[data-testid="game-root"]');
  await expect(root).toHaveAttribute('data-stage-id', 'inferno');
  await expect(root).toHaveAttribute('data-map-key', 'map-inferno');
  expect(Number(await root.getAttribute('data-hazard-count'))).toBeGreaterThanOrEqual(3);
  expect(Number(await root.getAttribute('data-enemy-ranged-shot-count'))).toBeGreaterThan(0);
  expect(Number(await root.getAttribute('data-flank-repath-count'))).toBeGreaterThan(0);
  expect(
    Object.keys(
      (await page.evaluate(() => window.__SOULRUN_TEST__?.snapshot()))?.enemyCountsById ?? {},
    ).every((id) => ['flame-skull', 'swift-demon'].includes(id)),
  ).toBe(true);
  for (const asset of INFERNO_ASSETS) expect(responses.get(asset), asset).toBe(200);
  expect(errors).toEqual([]);

  if (process.env.CAPTURE_EVIDENCE === '1') {
    await page.screenshot({ path: 'docs/evidence/issue-11-inferno.png' });
  }
});

test('applies damage when the player enters an authored lava zone', async ({ page }) => {
  await page.goto('/?test=1&seed=inferno-lava-001');
  await page.waitForFunction(() => Boolean(window.__SOULRUN_TEST__));
  await page.evaluate(async () => {
    const api = window.__SOULRUN_TEST__;
    if (!api) throw new Error('Missing test API');
    await api.ready();
    await api.startAdventure({ seed: 'inferno-lava-001', stageId: 'inferno' });
    api.input('down', true);
    await api.advance(1800);
    api.input('down', false);
  });

  const snapshot = await page.evaluate(() => window.__SOULRUN_TEST__?.snapshot());
  expect(snapshot?.player.health).toBeLessThan(snapshot?.player.maxHealth ?? 0);
  expect(
    Number(await page.locator('[data-testid="game-root"]').getAttribute('data-hazard-tick-count')),
  ).toBeGreaterThan(0);
});

test('runs the Flame Demon charge, temporary lava, ring, and phase two', async ({ page }) => {
  await page.goto('/?test=1&seed=inferno-boss-001');
  await page.waitForFunction(() => Boolean(window.__SOULRUN_TEST__));
  await page.evaluate(async () => {
    const api = window.__SOULRUN_TEST__;
    if (!api) throw new Error('Missing test API');
    await api.ready();
    await api.startAdventure({ seed: 'inferno-boss-001', stageId: 'inferno' });
    api.aimAt(0, 1072);
    await api.forceBoss();
    api.damageBoss(1500);
    api.input('right', true);
    await api.advance(5200);
    api.input('right', false);
    api.input('left', true);
    await api.advance(10_900);
    api.input('left', false);
  });

  const snapshot = await page.evaluate(() => window.__SOULRUN_TEST__?.snapshot());
  expect(snapshot).toMatchObject({
    state: 'boss-fight',
    stageId: 'inferno',
    boss: { id: 'flame-demon', phase: 2 },
  });
  expect(snapshot?.boss?.health).toBeGreaterThan(0);
  const root = page.locator('[data-testid="game-root"]');
  expect(Number(await root.getAttribute('data-boss-charge-count'))).toBeGreaterThan(0);
  expect(Number(await root.getAttribute('data-boss-hazard-count'))).toBeGreaterThan(0);
  expect(Number(await root.getAttribute('data-boss-pattern-shot-count'))).toBeGreaterThanOrEqual(
    16,
  );
});

test('defeats the Flame Demon and hands Inferno back to Cemetery', async ({ page }) => {
  await page.goto('/?test=1&seed=inferno-handoff-001');
  await page.waitForFunction(() => Boolean(window.__SOULRUN_TEST__));
  await page.evaluate(async () => {
    const api = window.__SOULRUN_TEST__;
    if (!api) throw new Error('Missing test API');
    await api.ready();
    await api.startAdventure({ seed: 'inferno-handoff-001', stageId: 'inferno' });
    await api.forceBoss();
    api.damageBoss(1500);
    api.damageBoss(1500);
  });

  expect(await page.evaluate(() => window.__SOULRUN_TEST__?.snapshot())).toMatchObject({
    state: 'upgrade-choice',
    stageId: 'inferno',
    boss: { id: 'flame-demon', health: 0, phase: 2 },
    activeUpgradeOffer: { source: 'boss' },
  });
  const root = page.locator('[data-testid="game-root"]');
  await expect(root).toHaveAttribute('data-hazard-count', '0');
  await expect(root).toHaveAttribute('data-temporary-hazard-count', '0');
  await page.evaluate(async () => window.__SOULRUN_TEST__?.chooseUpgrade(0));
  expect(await page.evaluate(() => window.__SOULRUN_TEST__?.snapshot())).toMatchObject({
    state: 'loading-stage',
    stageId: 'cemetery',
    activeUpgradeOffer: null,
  });
});
