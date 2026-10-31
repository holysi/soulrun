import { expect, test, type Page } from '@playwright/test';

type StageId = 'cemetery' | 'dungeon' | 'inferno';

async function startAdventure(page: Page, seed: string, stageId: StageId = 'cemetery') {
  await page.goto(`/?test=1&seed=${seed}`);
  await page.waitForFunction(() => Boolean(window.__SOULRUN_TEST__));
  await page.evaluate(
    async ({ adventureSeed, initialStage }) => {
      const api = window.__SOULRUN_TEST__;
      if (!api) throw new Error('Missing test API');
      await api.ready();
      await api.startAdventure({ seed: adventureSeed, stageId: initialStage });
    },
    { adventureSeed: seed, initialStage: stageId },
  );
}

async function defeatBossAndChooseNonHealthUpgrade(page: Page, expectedNextStage: StageId) {
  const before = await page.evaluate(async () => {
    const api = window.__SOULRUN_TEST__;
    if (!api) throw new Error('Missing test API');
    await api.forceBoss();
    api.damageBoss(1_000_000);
    const defeated = api.snapshot();
    const offer = defeated.activeUpgradeOffer;
    if (!offer || offer.source !== 'boss') throw new Error('Missing Boss upgrade offer');
    const soulBladeIndex = offer.optionIds.indexOf('soul-blade');
    const selectedIndex =
      soulBladeIndex >= 0
        ? soulBladeIndex
        : offer.optionIds.findIndex((id) => id !== 'max-health' && id !== 'mastery-health');
    if (selectedIndex < 0) throw new Error('Expected a non-health Boss upgrade');
    const selectedId = offer.optionIds[selectedIndex]!;
    await api.chooseUpgrade(selectedIndex as 0 | 1 | 2);
    return { defeated, selectedId };
  });

  await page.waitForFunction((stageId) => {
    const snapshot = window.__SOULRUN_TEST__?.snapshot();
    return snapshot?.stageId === stageId && snapshot.state === 'playing';
  }, expectedNextStage);
  return before;
}

function selectedLevel(
  snapshot: {
    weaponLevels: Readonly<Record<string, number>>;
    passiveLevels: Readonly<Record<string, number>>;
    masteryLevels: Readonly<Record<string, number>>;
  },
  id: string,
) {
  return snapshot.weaponLevels[id] ?? snapshot.passiveLevels[id] ?? snapshot.masteryLevels[id] ?? 0;
}

test('heals after the Boss, applies one upgrade, and preserves the adventure on stage reload', async ({
  page,
}) => {
  await startAdventure(page, 'stage-loop-preserve-005');
  await page.evaluate(() => window.__SOULRUN_TEST__?.damagePlayer(40));
  const damaged = await page.evaluate(() => window.__SOULRUN_TEST__?.snapshot());
  expect(damaged?.player.health).toBe(60);

  const { defeated, selectedId } = await defeatBossAndChooseNonHealthUpgrade(page, 'dungeon');
  expect(defeated).toMatchObject({
    state: 'upgrade-choice',
    stageId: 'cemetery',
    completedLoops: 0,
    player: { health: 90, maxHealth: 100 },
    activeUpgradeOffer: { source: 'boss' },
  });

  const reloaded = await page.evaluate(() => window.__SOULRUN_TEST__?.snapshot());
  expect(reloaded).toMatchObject({
    state: 'playing',
    stageId: 'dungeon',
    completedLoops: 0,
    player: { health: 90, maxHealth: 100 },
    score: defeated.score,
  });
  expect(selectedId).toBe('soul-blade');
  expect(selectedLevel(reloaded!, selectedId)).toBe(selectedLevel(defeated, selectedId) + 1);
  const root = page.locator('[data-testid="game-root"]');
  await expect(root).not.toHaveAttribute('data-soul-blade-count', '0');
  await expect(root).toHaveAttribute('data-player-x', '960.00');
  await expect(root).toHaveAttribute('data-player-y', '536.00');
  expect(reloaded!.eventSequence).toBeGreaterThan(defeated.eventSequence);
  expect(reloaded!.simulationTimeMs).toBeGreaterThanOrEqual(defeated.simulationTimeMs);
});

test('returns Inferno to a stronger Cemetery loop without ending the adventure', async ({
  page,
}) => {
  await startAdventure(page, 'stage-loop-wrap-001', 'inferno');
  const { defeated, selectedId } = await defeatBossAndChooseNonHealthUpgrade(page, 'cemetery');

  const looped = await page.evaluate(() => window.__SOULRUN_TEST__?.snapshot());
  expect(looped).toMatchObject({
    state: 'playing',
    stageId: 'cemetery',
    completedLoops: 1,
    score: defeated.score,
  });
  expect(selectedLevel(looped!, selectedId)).toBe(1);
  expect(looped!.state).not.toBe('adventure-ended');
});

test('survives two complete fixed-seed loops and ends only when the player dies', async ({
  page,
}) => {
  await startAdventure(page, 'stage-loop-multiple-001');
  const stages: readonly StageId[] = [
    'dungeon',
    'inferno',
    'cemetery',
    'dungeon',
    'inferno',
    'cemetery',
  ];

  let previousScore = 0;
  for (const stage of stages) {
    const { defeated } = await defeatBossAndChooseNonHealthUpgrade(page, stage);
    expect(defeated.score).toBeGreaterThan(previousScore);
    previousScore = defeated.score;
  }

  const looped = await page.evaluate(() => window.__SOULRUN_TEST__?.snapshot());
  expect(looped).toMatchObject({
    state: 'playing',
    stageId: 'cemetery',
    completedLoops: 2,
    score: previousScore,
  });

  await page.evaluate(() => window.__SOULRUN_TEST__?.damagePlayer(1_000_000));
  expect(await page.evaluate(() => window.__SOULRUN_TEST__?.snapshot())).toMatchObject({
    state: 'adventure-ended',
    completedLoops: 2,
    player: { health: 0 },
  });
});
