import { expect, test, type Page } from '@playwright/test';

const ROOT = '[data-testid="game-root"]';

async function startTestAdventure(
  page: Page,
  seed = 'ui-seed-001',
  stageId: 'cemetery' | 'dungeon' | 'inferno' = 'cemetery',
) {
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

test('shows the Traditional Chinese title and keeps a centered 16:9 canvas with black bars', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1_000, height: 700 });
  await page.goto('/');

  const root = page.locator(ROOT);
  const canvas = page.locator('canvas');
  await expect(root).toHaveAttribute('data-game-state', 'title');
  await expect(root).toHaveAttribute('data-ui-panel', 'title');

  const box = await canvas.boundingBox();
  if (!box) throw new Error('Canvas bounds unavailable');
  expect(box.width / box.height).toBeCloseTo(16 / 9, 2);
  expect(Math.abs(box.x + box.width / 2 - 500)).toBeLessThanOrEqual(1);
  expect(Math.abs(box.y + box.height / 2 - 350)).toBeLessThanOrEqual(1);
  expect(box.height).toBeLessThan(700);
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(3, 2, 5)');

  if (process.env.CAPTURE_EVIDENCE === '1') {
    await page.screenshot({ path: 'docs/evidence/issue-13-ui.png' });
  }

  await page.mouse.click(box.x + box.width / 2, box.y + (239 / 270) * box.height);
  await expect(root).toHaveAttribute('data-game-state', 'playing');
});

test('publishes every required HUD value while playing', async ({ page }) => {
  await startTestAdventure(page);
  const root = page.locator(ROOT);

  await expect(root).toHaveAttribute('data-hud-health', '100/100');
  await expect(root).toHaveAttribute('data-hud-xp', '0');
  await expect(root).toHaveAttribute('data-hud-level', '1');
  await expect(root).toHaveAttribute('data-hud-score', '0');
  await expect(root).toHaveAttribute('data-hud-stage', '墓園');
  await expect(root).toHaveAttribute('data-hud-loop', '0');
  await expect(root).toHaveAttribute('data-hud-timer', '03:00');

  await page.evaluate(async () => {
    const api = window.__SOULRUN_TEST__;
    if (!api) throw new Error('Missing test API');
    const { x, y } = api.snapshot().player;
    await api.spawnXpGem({ value: 5, x, y });
    await api.advance(17);
  });
  await expect(root).toHaveAttribute('data-hud-level', '2');
});

test('renders pause and game-over panels, and only resumes through the pause command', async ({
  page,
}) => {
  await startTestAdventure(page, 'ui-panels-001');
  const root = page.locator(ROOT);

  await page.evaluate(() => window.__SOULRUN_TEST__?.input('pause', true));
  await expect(root).toHaveAttribute('data-ui-panel', 'pause');
  await expect(root).toHaveAttribute('data-test-state', 'paused');
  await page.evaluate(() => window.__SOULRUN_TEST__?.input('pause', true));
  await expect(root).toHaveAttribute('data-ui-panel', 'none');

  await page.evaluate(() => window.__SOULRUN_TEST__?.damagePlayer(1_000_000));
  await expect(root).toHaveAttribute('data-test-state', 'adventure-ended');
  await expect(root).toHaveAttribute('data-ui-panel', 'game-over');
  await expect(root).toHaveAttribute('data-result-score', '0');
  await expect(root).toHaveAttribute('data-result-loops', '0');
  await expect(root).toHaveAttribute('data-result-seed', 'ui-panels-001');

  await page.keyboard.press('Enter');
  await expect(root).toHaveAttribute('data-game-state', 'title');
  await expect(root).toHaveAttribute('data-ui-panel', 'title');
});

test('refresh returns to the title and never restores an active adventure', async ({ page }) => {
  await startTestAdventure(page, 'ui-refresh-001');
  const root = page.locator(ROOT);
  await expect(root).toHaveAttribute('data-game-state', 'playing');

  await page.reload();
  await expect(root).toHaveAttribute('data-game-state', 'title');
  await expect(root).toHaveAttribute('data-ui-panel', 'title');
  expect(
    await page.evaluate(() =>
      Object.keys(localStorage)
        .filter((key) => key.startsWith('soulrun:'))
        .every((key) => key === 'soulrun:v1' || key.startsWith('soulrun:invalid:')),
    ),
  ).toBe(true);
});

test('KeyM persists mute without writing adventure state', async ({ page }) => {
  await page.goto('/');
  const root = page.locator(ROOT);

  await page.keyboard.press('KeyM');
  await expect(root).toHaveAttribute('data-muted', 'true');
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('soulrun:v1') ?? '{}'));
  expect(stored).toMatchObject({ schemaVersion: 1, settings: { muted: true } });
  expect(stored).not.toHaveProperty('adventure');
  expect(stored).not.toHaveProperty('seed');

  await page.reload();
  await expect(root).toHaveAttribute('data-muted', 'true');
  await page.keyboard.press('KeyM');
  await expect(root).toHaveAttribute('data-muted', 'false');
});

test('persists volume, shake, and reduced-flash controls from the title', async ({ page }) => {
  await page.goto('/');
  const root = page.locator(ROOT);
  const canvas = page.locator('canvas');
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Canvas bounds unavailable');
  const clickLogical = (x: number, y: number) =>
    page.mouse.click(box.x + (x / 480) * box.width, box.y + (y / 270) * box.height);

  await clickLogical(60, 207);
  await clickLogical(160, 207);
  await clickLogical(260, 207);
  await clickLogical(350, 207);

  await expect(root).toHaveAttribute('data-music-volume', '0.8');
  await expect(root).toHaveAttribute('data-sound-volume', '0.9');
  await expect(root).toHaveAttribute('data-screen-shake', 'false');
  await expect(root).toHaveAttribute('data-reduced-flashes', 'true');
  expect(
    await page.evaluate(() => JSON.parse(localStorage.getItem('soulrun:v1') ?? '{}')),
  ).toMatchObject({
    schemaVersion: 1,
    settings: {
      musicVolume: 0.8,
      soundVolume: 0.9,
      screenShake: false,
      reducedFlashes: true,
    },
  });
});

test('records results only at adventure end and exposes them on the title', async ({ page }) => {
  await startTestAdventure(page, 'ui-records-001');
  await page.evaluate(async () => {
    const api = window.__SOULRUN_TEST__;
    if (!api) throw new Error('Missing test API');
    await api.advance(1_017);
    api.damagePlayer(1_000_000);
  });
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('soulrun:v1') ?? '{}'));
  expect(stored).toMatchObject({
    schemaVersion: 1,
    records: { highScore: 0, bestCompletedLoops: 0 },
  });
  expect(stored.records.bestSurvivalTimeMs).toBeGreaterThanOrEqual(1_000);

  await page.keyboard.press('Enter');
  const root = page.locator(ROOT);
  await expect(root).toHaveAttribute('data-game-state', 'title');
  await expect(root).toHaveAttribute(
    'data-best-survival-ms',
    String(stored.records.bestSurvivalTimeMs),
  );
});

test('hydrates the HUD when an adventure starts directly at Inferno', async ({ page }) => {
  await startTestAdventure(page, 'ui-inferno-hud-001', 'inferno');
  await expect(page.locator(ROOT)).toHaveAttribute('data-hud-stage', '煉獄');
});

test('recreates upgrade UI safely for a second adventure in the same page', async ({ page }) => {
  await startTestAdventure(page, 'ui-second-run-001');
  await page.evaluate(() => window.__SOULRUN_TEST__?.damagePlayer(1_000_000));
  await page.keyboard.press('Enter');
  await expect(page.locator(ROOT)).toHaveAttribute('data-game-state', 'title');
  await page.evaluate(async () => {
    const api = window.__SOULRUN_TEST__;
    if (!api) throw new Error('Missing test API');
    await api.startAdventure({ seed: 'ui-second-run-002' });
    const { x, y } = api.snapshot().player;
    await api.spawnXpGem({ value: 5, x, y });
    await api.advance(17);
  });
  await expect(page.locator(ROOT)).toHaveAttribute('data-ui-panel', 'upgrade');
});

test('clearStorage resets the live settings singleton before returning to title', async ({
  page,
}) => {
  await page.goto('/?test=1&seed=ui-clear-storage-001');
  await page.waitForFunction(() => Boolean(window.__SOULRUN_TEST__));
  await page.keyboard.press('KeyM');
  await expect(page.locator(ROOT)).toHaveAttribute('data-muted', 'true');
  await page.evaluate(() => window.__SOULRUN_TEST__?.reset({ clearStorage: true }));
  await expect(page.locator(ROOT)).toHaveAttribute('data-game-state', 'title');
  await expect(page.locator(ROOT)).toHaveAttribute('data-muted', 'false');
  expect(await page.evaluate(() => localStorage.getItem('soulrun:v1'))).toBeNull();
});

test('reduced flashes keep Boss telegraphs at a stable alpha', async ({ page }) => {
  await page.goto('/?test=1&seed=ui-reduced-flash-001');
  await page.waitForFunction(() => Boolean(window.__SOULRUN_TEST__));
  const canvas = page.locator('canvas');
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Canvas bounds unavailable');
  await page.mouse.click(box.x + (350 / 480) * box.width, box.y + (207 / 270) * box.height);
  await page.evaluate(async () => {
    const api = window.__SOULRUN_TEST__;
    if (!api) throw new Error('Missing test API');
    await api.startAdventure({ seed: 'ui-reduced-flash-001', stageId: 'inferno' });
    await api.forceBoss();
    await api.advance(17);
  });
  const root = page.locator(ROOT);
  await expect(root).toHaveAttribute('data-telegraph-alpha', '0.65');
  await page.evaluate(() => window.__SOULRUN_TEST__?.advance(50));
  await expect(root).toHaveAttribute('data-telegraph-alpha', '0.65');
});
