import { expect, test } from '@playwright/test';

test('runs the Cemetery guardian phase, safety window, and completion flow', async ({ page }) => {
  await page.goto('/?test=1&seed=cemetery-e2e-001');
  await page.waitForFunction(() => Boolean(window.__SOULRUN_TEST__));
  await page.evaluate(async () => {
    const api = window.__SOULRUN_TEST__;
    if (!api) throw new Error('Missing test API');
    await api.ready();
    await api.startAdventure({ seed: 'cemetery-e2e-001', stageId: 'cemetery' });
    await api.forceBoss();
  });

  const initial = await page.evaluate(() => window.__SOULRUN_TEST__?.snapshot());
  expect(initial).toMatchObject({
    state: 'boss-fight',
    boss: { id: 'graveyard-guardian', health: 1500, phase: 1 },
  });

  await page.evaluate(() => window.__SOULRUN_TEST__?.damagePlayer(10));
  expect((await page.evaluate(() => window.__SOULRUN_TEST__?.snapshot()))?.player.health).toBe(100);
  await page.evaluate(async () => window.__SOULRUN_TEST__?.advance(2000));
  expect(
    Object.values(
      (await page.evaluate(() => window.__SOULRUN_TEST__?.snapshot()))?.enemyCountsById ?? {},
    ).reduce((sum, count) => sum + count, 0),
  ).toBeGreaterThan(0);
  await page.evaluate(() => window.__SOULRUN_TEST__?.damagePlayer(1));
  expect((await page.evaluate(() => window.__SOULRUN_TEST__?.snapshot()))?.player.health).toBe(99);

  await page.evaluate(() => window.__SOULRUN_TEST__?.damageBoss(750));
  expect((await page.evaluate(() => window.__SOULRUN_TEST__?.snapshot()))?.boss).toMatchObject({
    health: 750,
    phase: 2,
  });
  if (process.env.CAPTURE_EVIDENCE === '1') {
    await page.screenshot({ path: 'docs/evidence/issue-9-cemetery.png' });
  }

  await page.evaluate(() => window.__SOULRUN_TEST__?.damageBoss(750));
  const completed = await page.evaluate(() => window.__SOULRUN_TEST__?.snapshot());
  expect(completed).toMatchObject({
    state: 'upgrade-choice',
    boss: { health: 0, phase: 2 },
    score: 1000,
    activeUpgradeOffer: { source: 'boss' },
    enemyCountsById: {},
  });
  const root = page.locator('[data-testid="game-root"]');
  await expect(root).toHaveAttribute('data-stage-completed', 'true');
  await expect(root).toHaveAttribute('data-active-projectile-count', '0');
  await expect(root).toHaveAttribute('data-soul-blade-count', '0');
  await expect(root).toHaveAttribute('data-enemy-count', '0');
  await expect(root).toHaveAttribute('data-xp-gem-count', '0');
  await expect(root).toHaveAttribute('data-heal-pickup-count', '0');
  await page.evaluate(async () => window.__SOULRUN_TEST__?.chooseUpgrade(0));
  expect(await page.evaluate(() => window.__SOULRUN_TEST__?.snapshot())).toMatchObject({
    state: 'playing',
    stageId: 'dungeon',
    activeUpgradeOffer: null,
  });
});

test('secondary weapons damage production enemies and the Guardian', async ({ page }) => {
  await page.goto('/?test=1&seed=upgrade-seed-001');
  await page.waitForFunction(() => Boolean(window.__SOULRUN_TEST__));
  await page.evaluate(async () => {
    const api = window.__SOULRUN_TEST__;
    if (!api) throw new Error('Missing test API');
    await api.ready();
    await api.startAdventure({ seed: 'upgrade-seed-001' });
    const player = api.snapshot().player;
    await api.spawnXpGem({ value: 100_000, x: player.x, y: player.y });
    await api.advance(17);
    for (let pick = 0; pick < 240 && api.snapshot().activeUpgradeOffer; pick += 1) {
      const offer = api.snapshot().activeUpgradeOffer;
      if (!offer) break;
      const desired = offer.optionIds.findIndex((id) => id === 'soul-blade' || id === 'death-aura');
      const normal = offer.optionIds.findIndex((id) => !id.startsWith('mastery-'));
      await api.chooseUpgrade((desired >= 0 ? desired : normal >= 0 ? normal : 0) as 0 | 1 | 2);
    }
    const upgraded = api.snapshot();
    if (!upgraded.weaponLevels['soul-blade'] || !upgraded.weaponLevels['death-aura']) {
      throw new Error('Seed did not acquire both secondary weapons');
    }
    api.aimAt(player.x - 1000, player.y);
    await api.advance(30_000);
    const root = document.querySelector<HTMLElement>('[data-testid="game-root"]');
    if (
      !root ||
      Number(root.dataset.hitsSoulBladeEnemy) < 1 ||
      Number(root.dataset.hitsDeathAuraEnemy) < 1
    ) {
      throw new Error(
        `Secondary weapons did not damage ordinary enemies: blade=${root?.dataset.hitsSoulBladeEnemy}, aura=${root?.dataset.hitsDeathAuraEnemy}, state=${api.snapshot().state}`,
      );
    }
    await api.forceBoss();
    await api.advance(8000);
  });

  const root = page.locator('[data-testid="game-root"]');
  expect(Number(await root.getAttribute('data-secondary-hit-count'))).toBeGreaterThan(0);
  expect(Number(await root.getAttribute('data-penetration-used-count'))).toBeGreaterThan(0);
  expect(Number(await root.getAttribute('data-hits-soul-blade-boss'))).toBeGreaterThan(0);
  expect(Number(await root.getAttribute('data-hits-death-aura-boss'))).toBeGreaterThan(0);
  expect(Number(await root.getAttribute('data-guardian-contact-hit-count'))).toBeGreaterThan(0);
  expect(
    (await page.evaluate(() => window.__SOULRUN_TEST__?.snapshot()))?.boss?.health ?? 0,
  ).toBeLessThan(1500);
});

test('collects queued cleanup XP before summary and reaches next-stage handoff', async ({
  page,
}) => {
  await page.goto('/?test=1&seed=cemetery-cleanup-001');
  await page.waitForFunction(() => Boolean(window.__SOULRUN_TEST__));
  await page.evaluate(async () => {
    const api = window.__SOULRUN_TEST__;
    if (!api) throw new Error('Missing test API');
    await api.ready();
    await api.startAdventure({ seed: 'cemetery-cleanup-001' });
    await api.spawnXpGem({ value: 5, x: 0, y: 0 });
    await api.forceBoss();
    await api.advance(2000);
    api.damagePlayer(50);
    api.damageBoss(1500);
  });
  expect(await page.evaluate(() => window.__SOULRUN_TEST__?.snapshot())).toMatchObject({
    state: 'level-up',
    player: { level: 2, health: 50 },
    activeUpgradeOffer: { source: 'level' },
  });
  await page.evaluate(async () => window.__SOULRUN_TEST__?.chooseUpgrade(0));
  expect(await page.evaluate(() => window.__SOULRUN_TEST__?.snapshot())).toMatchObject({
    state: 'upgrade-choice',
    activeUpgradeOffer: { source: 'boss' },
  });
  expect(
    (await page.evaluate(() => window.__SOULRUN_TEST__?.snapshot()))?.player.health ?? 0,
  ).toBeGreaterThan(50);
  await page.evaluate(async () => window.__SOULRUN_TEST__?.chooseUpgrade(0));
  expect(await page.evaluate(() => window.__SOULRUN_TEST__?.snapshot())).toMatchObject({
    state: 'playing',
    stageId: 'dungeon',
  });
});

test('renders a readable bounded cemetery with production enemies', async ({ page }) => {
  await page.goto('/?test=1&seed=cemetery-render-001');
  await page.waitForFunction(() => Boolean(window.__SOULRUN_TEST__));
  await page.evaluate(async () => {
    const api = window.__SOULRUN_TEST__;
    if (!api) throw new Error('Missing test API');
    await api.ready();
    await api.startAdventure({ seed: 'cemetery-render-001' });
    await api.advance(1100);
  });
  const snapshot = await page.evaluate(() => window.__SOULRUN_TEST__?.snapshot());
  expect(
    Object.values(snapshot?.enemyCountsById ?? {}).reduce((sum, count) => sum + count, 0),
  ).toBeGreaterThan(0);
  await expect(page.locator('[data-testid="game-root"]')).toHaveAttribute(
    'data-stage-id',
    'cemetery',
  );
});
