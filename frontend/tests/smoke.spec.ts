import { test, expect } from '@playwright/test';

// ──────────────────────────────────────────────────────────────
// Smoke Tests — Home & Navigation
// ──────────────────────────────────────────────────────────────

test.describe('Smoke Tests', () => {
  test('home page loads with Voxly title', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/Voxly/i);
  });

  test('home page shows primary hero heading', async ({ page }) => {
    await page.goto('/');
    // Page should have some h1 heading visible
    const heading = page.locator('h1').first();
    await expect(heading).toBeVisible();
  });

  test('login page is reachable', async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('input[type="email"]')).toBeVisible();
  });

  test('register page is reachable', async ({ page }) => {
    await page.goto('/register');
    await expect(page.locator('input[type="email"]')).toBeVisible();
  });

  test('unauthenticated user is redirected from /dashboard', async ({ page }) => {
    await page.goto('/dashboard');
    // Should redirect to login
    await expect(page).toHaveURL(/login|\/$/);
  });

  test('404 page shows for unknown route', async ({ page }) => {
    const response = await page.goto('/some-really-bad-route-12345');
    // Either a 404 status or a Next.js not found page
    const status = response?.status();
    const body = await page.content();
    const has404 = status === 404 || body.toLowerCase().includes('not found') || body.toLowerCase().includes('404');
    expect(has404).toBeTruthy();
  });
});
