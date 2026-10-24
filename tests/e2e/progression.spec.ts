import { expect, test } from '@playwright/test';

test('pauses live simulation for a deterministic upgrade and resumes after selection', async ({
  page,
}) => {
  await page.goto('/?test=1&seed=upgrade-seed-001');
  await page.waitForFunction(() => Boolean(window.__SOULRUN_TEST__));
  await page.evaluate(async () => {
    const api = window.__SOULRUN_TEST__;
    if (!api) throw new Error('Missing test API');
    await api.ready();
    await api.startAdventure({ seed: 'upgrade-seed-001' });
    await api.spawnXpGem({ value: 5, x: 960, y: 536 });
    await api.advance(17);
  });

  const before = await page.evaluate(() => window.__SOULRUN_TEST__?.snapshot());
  expect(before).toMatchObject({ state: 'level-up', player: { level: 2, xp: 0 } });
  expect(before?.activeUpgradeOffer?.optionIds).toHaveLength(3);
  expect(new Set(before?.activeUpgradeOffer?.optionIds).size).toBe(3);
  if (process.env.CAPTURE_EVIDENCE === '1') {
    await page.screenshot({ path: 'docs/evidence/issue-7-progression.png' });
  }

  await page.evaluate(async () => window.__SOULRUN_TEST__?.advance(1000));
  const paused = await page.evaluate(() => window.__SOULRUN_TEST__?.snapshot());
  expect(paused?.simulationTimeMs).toBe(before?.simulationTimeMs);

  await page.evaluate(async () => window.__SOULRUN_TEST__?.chooseUpgrade(0));
  const after = await page.evaluate(() => window.__SOULRUN_TEST__?.snapshot());
  expect(after?.state).toBe('playing');
  expect(after?.activeUpgradeOffer).toBeNull();
  expect(after?.eventSequence).toBeGreaterThan(before?.eventSequence ?? 0);

  await page.evaluate(async () => {
    const api = window.__SOULRUN_TEST__;
    if (!api) throw new Error('Missing test API');
    const player = api.snapshot().player;
    await api.spawnXpGem({ value: 1, x: player.x + 31, y: player.y });
    await api.advance(17);
    if (api.snapshot().player.xp !== 0) throw new Error('Base pickup radius collected distant gem');

    await api.spawnXpGem({ value: 100_000, x: player.x, y: player.y });
    await api.advance(17);
    for (let pick = 0; pick < 200; pick += 1) {
      const offer = api.snapshot().activeUpgradeOffer;
      if (!offer) break;
      const desired = offer.optionIds.findIndex(
        (id) => id === 'pickup-range' || id === 'soul-blade' || id === 'death-aura',
      );
      const normal = offer.optionIds.findIndex((id) => !id.startsWith('mastery-'));
      const index = desired >= 0 ? desired : normal >= 0 ? normal : 0;
      await api.chooseUpgrade(index as 0 | 1 | 2);
    }
    if (!api.snapshot().passiveLevels['pickup-range']) {
      throw new Error('Fixed seed did not acquire pickup range');
    }
    const xpBeforePickup = api.snapshot().player.xp;
    await api.advance(17);
    if (api.snapshot().player.xp !== xpBeforePickup + 1) {
      throw new Error('Pickup-range upgrade did not collect the retained distant gem');
    }
    await api.advance(1500);
  });

  const root = page.locator('[data-testid="game-root"]');
  await expect(root).not.toHaveAttribute('data-soul-blade-count', '0');
  await expect(root).not.toHaveAttribute('data-death-aura-count', '0');
});

test('freezes non-test Arcade motion during an upgrade and restores boss-fight state', async ({
  page,
}) => {
  await page.goto('/?test=1&seed=upgrade-seed-001');
  await page.waitForFunction(() => Boolean(window.__SOULRUN_TEST__));
  const root = page.locator('[data-testid="game-root"]');
  await expect(root).toHaveAttribute('data-game-state', 'title');
  await page.keyboard.press('Enter');
  await expect(root).toHaveAttribute('data-game-state', 'playing');

  await page.keyboard.down('KeyD');
  await expect
    .poll(async () => Number(await root.getAttribute('data-player-x')))
    .toBeGreaterThan(960);
  await expect
    .poll(async () => Number(await root.getAttribute('data-active-projectile-count')))
    .toBeGreaterThan(0);
  await page.evaluate(async () => {
    const api = window.__SOULRUN_TEST__;
    if (!api) throw new Error('Missing test API');
    const { x, y } = api.snapshot().player;
    await api.spawnXpGem({ value: 5, x, y });
  });
  await expect(root).toHaveAttribute('data-game-state', 'level-up');
  const frozen = await page.evaluate(() => window.__SOULRUN_TEST__?.snapshot());
  const frozenProjectileX = await root.getAttribute('data-first-projectile-x');
  await page.waitForTimeout(400);
  const stillFrozen = await page.evaluate(() => window.__SOULRUN_TEST__?.snapshot());
  expect(stillFrozen?.player.x).toBeCloseTo(frozen?.player.x ?? 0, 5);
  expect(stillFrozen?.simulationTimeMs).toBe(frozen?.simulationTimeMs);
  await expect(root).toHaveAttribute('data-first-projectile-x', frozenProjectileX ?? '');

  await page.evaluate(async () => window.__SOULRUN_TEST__?.chooseUpgrade(0));
  await expect(root).toHaveAttribute('data-game-state', 'playing');
  await expect
    .poll(async () => Number(await root.getAttribute('data-player-x')))
    .toBeGreaterThan(frozen?.player.x ?? 0);
  await page.keyboard.up('KeyD');

  await page.evaluate(async () => {
    const api = window.__SOULRUN_TEST__;
    if (!api) throw new Error('Missing test API');
    await api.forceBoss();
    const { x, y } = api.snapshot().player;
    await api.spawnXpGem({ value: 8, x, y });
  });
  await expect(root).toHaveAttribute('data-game-state', 'level-up');
  expect(
    (await page.evaluate(() => window.__SOULRUN_TEST__?.snapshot()))?.activeUpgradeOffer?.source,
  ).toBe('level');
  await page.evaluate(async () => window.__SOULRUN_TEST__?.chooseUpgrade(0));
  expect((await page.evaluate(() => window.__SOULRUN_TEST__?.snapshot()))?.state).toBe(
    'boss-fight',
  );
});
