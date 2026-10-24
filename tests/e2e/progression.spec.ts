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
    const game = Reflect.get(api, 'game') as {
      scene: {
        getScene(key: string): {
          spawnXpGem(value: number, x: number, y: number): string;
          collectXpGem(id: string): void;
        };
      };
    };
    const scene = game.scene.getScene('GameScene');
    scene.collectXpGem(scene.spawnXpGem(5, 960, 536));
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
    const game = Reflect.get(api, 'game') as {
      scene: {
        getScene(key: string): {
          spawnXpGem(value: number, x: number, y: number): string;
          collectXpGem(id: string): void;
        };
      };
    };
    const scene = game.scene.getScene('GameScene');
    scene.collectXpGem(scene.spawnXpGem(100_000, 960, 536));
    for (let pick = 0; pick < 200; pick += 1) {
      const offer = api.snapshot().activeUpgradeOffer;
      if (!offer) break;
      const desired = offer.optionIds.findIndex((id) => id === 'soul-blade' || id === 'death-aura');
      const normal = offer.optionIds.findIndex((id) => !id.startsWith('mastery-'));
      const index = desired >= 0 ? desired : normal >= 0 ? normal : 0;
      await api.chooseUpgrade(index as 0 | 1 | 2);
    }
    await api.advance(1500);
  });

  const root = page.locator('[data-testid="game-root"]');
  await expect(root).not.toHaveAttribute('data-soul-blade-count', '0');
  await expect(root).not.toHaveAttribute('data-death-aura-count', '0');
});
