import { test, expect } from '@playwright/test';

test.describe('Smoke Test', () => {
  test('should load home page and verify title', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/Voxly/);
  });

  test('should navigate to login page', async ({ page }) => {
    await page.goto('/login');
    // Check for a known element on the login page (e.g., "Sign in" heading or button)
    // Adjust selector based on actual login page content
    await expect(page.getByRole('heading', { name: /Sign in|Login/i })).toBeVisible();
  });
});
