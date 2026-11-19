import { expect, test } from '@playwright/test';

test.describe('SocialPulse Security & Private Route Protection E2E', () => {
  test('redirects unauthenticated users from /dashboard to /login', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByText(/Privacidad y Seguridad/i)).toBeVisible();
  });

  test('renders public /signup page for open user registration', async ({ page }) => {
    await page.goto('/signup');
    await expect(page).toHaveURL(/\/signup/);
    await expect(page.getByRole('button', { name: /Crear Cuenta Gratis/i })).toBeVisible();
  });

  test('returns HTTP 401 on /api/sync/cron when CRON_SECRET Authorization header is missing', async ({
    request,
  }) => {
    const response = await request.get('/api/sync/cron');
    expect(response.status()).toBe(401);
  });
});
