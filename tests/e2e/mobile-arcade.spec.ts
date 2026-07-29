import { expect, test } from '@playwright/test';

const SPACE_GAMES = [
  { id: 'asteroids', name: 'Asteroid Patrol' },
  { id: 'stardefender', name: 'Star Defender' },
] as const;

const E2E_USERNAME = process.env.E2E_USERNAME;
const E2E_PASSWORD = process.env.E2E_PASSWORD;
const E2E_SECOND_USERNAME = process.env.E2E_SECOND_USERNAME;
const E2E_SECOND_PASSWORD = process.env.E2E_SECOND_PASSWORD;

test('the signed-out front door fits the portrait viewport', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'Sign in to play' })).toBeVisible();
  await expect(page.getByLabel('Username')).toBeVisible();
  await expect(page.getByPlaceholder('Your password')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();

  const overflowsHorizontally = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(overflowsHorizontally).toBe(false);
});

test('switching parents clears the previous family cache', async ({ page }) => {
  test.skip(
    !E2E_SECOND_USERNAME || !E2E_SECOND_PASSWORD,
    'Set the second parent credentials to run the shared-device isolation check.',
  );

  await page.goto('/');
  await page.evaluate(() => {
    window.localStorage.setItem('isee-arcade:account-scope', 'parent:previous-family');
    window.localStorage.setItem(
      'isee-arcade:profiles',
      JSON.stringify([{ id: 'private-old-learner', name: 'Must disappear' }]),
    );
    window.sessionStorage.setItem('isee-arcade:player-mode', 'parent');
  });
  await page.getByLabel('Username').fill(E2E_SECOND_USERNAME!);
  await page.getByPlaceholder('Your password').fill(E2E_SECOND_PASSWORD!);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL(/\/parent(?:$|\?)/);

  const localState = await page.evaluate(() => ({
    scope: window.localStorage.getItem('isee-arcade:account-scope'),
    profiles: JSON.parse(window.localStorage.getItem('isee-arcade:profiles') ?? '[]') as Array<{
      id?: string;
    }>,
  }));
  expect(localState.scope).toMatch(/^parent:/);
  expect(localState.scope).not.toBe('parent:previous-family');
  expect(localState.profiles).toEqual([]);
});

for (const game of SPACE_GAMES) {
  test(`${game.name} loads its Kenney art and fills the portrait stage`, async ({ page }) => {
    test.skip(
      !E2E_USERNAME || !E2E_PASSWORD,
      'Set E2E_USERNAME and E2E_PASSWORD to run authenticated game checks.',
    );

    const failedAssets: string[] = [];
    const consoleErrors: string[] = [];
    page.on('requestfailed', (request) => {
      if (request.url().includes('/assets/kenney/')) failedAssets.push(request.url());
    });
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });

    await page.goto('/');
    await page.getByLabel('Username').fill(E2E_USERNAME!);
    await page.getByPlaceholder('Your password').fill(E2E_PASSWORD!);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await page.waitForURL(/\/parent(?:$|\?)/);
    await page.evaluate(({ id }) => {
      window.sessionStorage.setItem('isee-arcade:player-mode', 'parent');
      window.localStorage.setItem(`isee-arcade:howto-seen:${id}`, '1');
    }, game);

    const playerSprite = page.waitForResponse(
      (response) =>
        response.url().endsWith('/assets/kenney/space-shooter/player-ship-blue.png') &&
        response.ok(),
    );
    await page.goto(`/play/${game.id}`);
    await playerSprite;

    const stage = page.getByRole('application', { name: `${game.name} game` });
    const canvas = stage.locator('canvas');
    await expect(stage).toBeVisible();
    await expect(canvas).toBeVisible();
    const titleIsClipped = await page
      .getByText(game.name, { exact: true })
      .first()
      .evaluate((element) => element.scrollWidth > element.clientWidth);
    expect(titleIsClipped).toBe(false);

    const canvasSize = await canvas.evaluate((element) => {
      const surface = element as HTMLCanvasElement;
      return {
        clientWidth: surface.clientWidth,
        clientHeight: surface.clientHeight,
        backingWidth: surface.width,
        backingHeight: surface.height,
      };
    });
    expect(canvasSize.clientWidth).toBeGreaterThanOrEqual(320);
    expect(canvasSize.clientHeight).toBeGreaterThan(300);
    expect(canvasSize.backingWidth).toBeGreaterThanOrEqual(canvasSize.clientWidth);
    expect(canvasSize.backingHeight).toBeGreaterThanOrEqual(canvasSize.clientHeight);
    expect(failedAssets).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });
}
