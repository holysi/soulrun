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
  });
  await expect(page.locator('[data-testid="game-root"]')).toHaveAttribute(
    'data-stage-completed',
    'true',
  );
  await page.evaluate(async () => window.__SOULRUN_TEST__?.chooseUpgrade(0));
  expect((await page.evaluate(() => window.__SOULRUN_TEST__?.snapshot()))?.state).toBe(
    'boss-cleanup',
  );
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
