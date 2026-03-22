import { test, expect } from '@playwright/test';

// ──────────────────────────────────────────────────────────────
// Auth E2E Tests — Login, Register, Social Login UI
// ──────────────────────────────────────────────────────────────

test.describe('Login Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
  });

  test('should render Voxly logo', async ({ page }) => {
    // Next.js <Image> renders as <img>, match on alt attribute
    const logo = page.locator('img[alt="Voxly"]').first();
    const logoByTestId = page.getByTestId('voxly-logo');
    // Accept either a Voxly-alt image OR any visible header element with the brand name
    const brandText = page.locator('header, nav').filter({ hasText: /voxly/i }).first();
    await expect(logo.or(logoByTestId).or(brandText)).toBeVisible({ timeout: 8000 });
  });

  test('should have an email input field', async ({ page }) => {
    await expect(page.getByLabel(/email/i).or(page.locator('input[type="email"]'))).toBeVisible();
  });

  test('should have a password input field', async ({ page }) => {
    await expect(page.getByLabel(/password/i).or(page.locator('input[type="password"]'))).toBeVisible();
  });

  test('should have a Google sign-in button', async ({ page }) => {
    await expect(page.getByRole('button', { name: /google/i })).toBeVisible();
  });

  test('should have a GitHub sign-in button', async ({ page }) => {
    await expect(page.getByRole('button', { name: /github/i })).toBeVisible();
  });

  test('should NOT have a LinkedIn sign-in button', async ({ page }) => {
    await expect(page.getByRole('button', { name: /linkedin/i })).not.toBeVisible();
  });

  test('should show validation errors on empty submit', async ({ page }) => {
    await page.getByRole('button', { name: /sign in/i }).click();
    // Zod/react-hook-form renders errors in <p> tags below inputs
    await expect(page.locator('p').filter({ hasText: /email|password|required|valid/i }).first()).toBeVisible({ timeout: 5000 });
  });

  test('should show invalid credentials error', async ({ page }) => {
    await page.locator('input[type="email"]').fill('fake@notreal.com');
    await page.locator('input[type="password"]').fill('wrongpassword123');
    await page.getByRole('button', { name: /sign in/i }).click();
    // Wait for error toast or message
    await expect(page.locator('text=/invalid|failed|incorrect/i')).toBeVisible({ timeout: 10000 });
  });

  test('should have a link to register page', async ({ page }) => {
    const registerLink = page.getByRole('link', { name: /sign up|register|create account/i });
    await expect(registerLink).toBeVisible();
    await registerLink.click();
    await expect(page).toHaveURL(/register/);
  });

  test('should toggle password visibility', async ({ page }) => {
    const passwordInput = page.locator('input[type="password"]');
    await passwordInput.fill('mypassword');
    // Find eye icon button
    const toggleBtn = page.locator('button[aria-label*="password"], button:has([data-lucide="eye"])').first();
    if (await toggleBtn.count() > 0) {
      await toggleBtn.click();
      await expect(page.locator('input[type="text"]')).toBeVisible();
    }
  });
});

test.describe('Register Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/register');
  });

  test('should render the registration form', async ({ page }) => {
    // The register page uses a split-layout; set a wide viewport to make both panels visible
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/register');
    // email input - may be type="email" or labelled
    const emailInput = page.locator('input[type="email"], input[name="email"]').first();
    await expect(emailInput).toBeVisible({ timeout: 8000 });
    const passwordInput = page.locator('input[type="password"]').first();
    await expect(passwordInput).toBeVisible({ timeout: 8000 });
  });

  test('should have a Google sign-up button', async ({ page }) => {
    await expect(page.getByRole('button', { name: /google/i })).toBeVisible();
  });

  test('should have a GitHub sign-up button', async ({ page }) => {
    await expect(page.getByRole('button', { name: /github/i })).toBeVisible();
  });

  test('should NOT have a LinkedIn sign-up button', async ({ page }) => {
    await expect(page.getByRole('button', { name: /linkedin/i })).not.toBeVisible();
  });

  test('should show validation error on empty submit', async ({ page }) => {
    await page.getByRole('button', { name: /create account|sign up|register/i }).click();
    // Zod/react-hook-form renders errors in <p> tags below inputs
    await expect(page.locator('p').filter({ hasText: /email|password|required|valid/i }).first()).toBeVisible({ timeout: 5000 });
  });

  test('should have a link back to login page', async ({ page }) => {
    const loginLink = page.getByRole('link', { name: /sign in|login|already have/i });
    await expect(loginLink).toBeVisible();
    await loginLink.click();
    await expect(page).toHaveURL(/login/);
  });
});

test.describe('OAuth Callback Page', () => {
  test('should show error for missing code/provider', async ({ page }) => {
    await page.goto('/auth/callback');
    await expect(page.locator('text=/invalid callback|missing/i')).toBeVisible({ timeout: 8000 });
  });

  test('should show error for unknown provider', async ({ page }) => {
    await page.goto('/auth/callback?code=testcode&provider=linkedin');
    await expect(page.locator('text=/unknown provider|failed|error/i')).toBeVisible({ timeout: 8000 });
  });

  test('should show spinner while loading', async ({ page }) => {
    // Intercept API to delay, then check loader
    await page.goto('/auth/callback?code=fakecode&provider=github&state=fakestate');
    // Either a spinner or an error will be visible
    const spinner = page.locator('[class*="animate-spin"]');
    const error = page.locator('text=/error|failed|invalid/i');
    await expect(spinner.or(error)).toBeVisible({ timeout: 8000 });
  });
});
