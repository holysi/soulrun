import { expect, test } from '@playwright/test';

test('production preview serves required runtime PNG assets without loader errors', async ({
  page,
}) => {
  const imageResponses = new Map<string, { status: number; contentType: string }>();
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('response', (response) => {
    for (const name of ['player-soul-guide', 'weapon-ghost-arrow']) {
      if (!response.url().includes(name)) continue;
      imageResponses.set(name, {
        status: response.status(),
        contentType: response.headers()['content-type'] ?? '',
      });
    }
  });

  await page.goto('/');
  await page.locator('canvas').waitFor({ state: 'visible' });
  await page.keyboard.down('Enter');
  await page.waitForTimeout(50);
  await page.keyboard.up('Enter');
  await expect(page.locator('[data-testid="game-root"]')).toHaveAttribute(
    'data-game-state',
    'playing',
  );

  for (const name of ['player-soul-guide', 'weapon-ghost-arrow']) {
    expect(imageResponses.get(name), `${name} must be served as a PNG`).toEqual({
      status: 200,
      contentType: 'image/png',
    });
  }
  expect(errors).toEqual([]);
});
