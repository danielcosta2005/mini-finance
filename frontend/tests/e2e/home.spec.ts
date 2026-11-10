import { expect, test } from '@playwright/test';

test('loads Home and reaches the real backend through the Vite proxy', async ({
  page,
  request,
}) => {
  const response = await request.get('/api/health');
  expect(response.status()).toBe(200);
  expect(await response.json()).toEqual({ status: 'ok' });

  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'Seu controle financeiro começa aqui',
  );
  await expect(page.getByText('Backend disponível')).toBeVisible();
});
