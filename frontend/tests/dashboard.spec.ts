import { test, expect, Page } from '@playwright/test';

// ──────────────────────────────────────────────────────────────
// Helper: Mock authentication by intercepting API calls
// This avoids needing real credentials in test files
// ──────────────────────────────────────────────────────────────
const MOCK_USER = {
    id: '00000000-0000-0000-0000-000000000001',
    email: 'test@voxly.dev',
    full_name: 'Test User',
    agency_name: 'Voxly Test Agency',
    subscription_tier: 'free',
    billing_region: 'INTL',
    is_active: true,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
};

async function mockAuth(page: Page) {
    // Intercept auth/me to return a mock user
    await page.route('**/api/v1/auth/me', (route) => {
        route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(MOCK_USER),
        });
    });

    // Intercept dashboard stats
    await page.route('**/api/v1/dashboard/stats', (route) => {
        route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                total_clients: 5,
                active_clients: 3,
                total_projects: 12,
                active_projects: 4,
                completed_projects: 6,
                total_messages: 342,
                messages_this_month: 89,
                ai_accuracy: 97.3,
            }),
        });
    });

    // Intercept clients list
    await page.route('**/api/v1/clients**', (route) => {
        if (route.request().method() === 'GET') {
            route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify([
                    { id: '1', name: 'Acme Corp', company: 'Acme Inc', created_at: '2026-03-01T10:00:00Z' },
                    { id: '2', name: 'Beta Labs', company: 'Beta Ltd', created_at: '2026-03-10T10:00:00Z' },
                ]),
            });
        } else {
            route.continue();
        }
    });

    // Intercept projects list
    await page.route('**/api/v1/projects**', (route) => {
        if (route.request().method() === 'GET') {
            route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify([
                    { id: 'p1', name: 'Website Redesign', status: 'active', client_id: '1', expected_end_date: '2026-04-15T00:00:00Z' },
                    { id: 'p2', name: 'Mobile App', status: 'active', client_id: '2', expected_end_date: '2026-05-01T00:00:00Z' },
                ]),
            });
        } else {
            route.continue();
        }
    });

    // Set fake JWT token in localStorage BEFORE navigation
    await page.addInitScript(() => {
        localStorage.setItem('access_token', 'mock-test-jwt-token-for-playwright');
    });
}

// ──────────────────────────────────────────────────────────────
// Dashboard E2E Tests
// ──────────────────────────────────────────────────────────────

test.describe('Dashboard', () => {
    test.beforeEach(async ({ page }) => {
        await mockAuth(page);
        await page.goto('/dashboard');
        // Wait for dashboard to fully render
        await expect(page.locator('h1')).toContainText('Dashboard', { timeout: 15000 });
    });

    test('should display the Dashboard heading', async ({ page }) => {
        await expect(page.locator('h1')).toContainText('Dashboard');
    });

    test('should display stat cards (Total Clients, Active Projects, etc.)', async ({ page }) => {
        await expect(page.locator('text=/Total Clients/i')).toBeVisible({ timeout: 10000 });
        await expect(page.locator('text=/Active Projects/i')).toBeVisible();
        await expect(page.locator('text=/Messages This Month/i')).toBeVisible();
        await expect(page.locator('text=/AI Accuracy/i')).toBeVisible();
    });

    test('should display quick action buttons', async ({ page }) => {
        await expect(page.locator('text=/Quick actions/i')).toBeVisible({ timeout: 10000 });
        await expect(page.getByRole('link', { name: /New Client/i })).toBeVisible();
        await expect(page.getByRole('link', { name: /New Project/i })).toBeVisible();
        await expect(page.getByRole('link', { name: /API Keys/i })).toBeVisible();
    });

    test('should show Recent Clients section with mocked data', async ({ page }) => {
        await expect(page.locator('text=/Recent Clients/i')).toBeVisible({ timeout: 10000 });
        // Should show the mocked clients
        await expect(page.locator('text=/Acme Corp/i')).toBeVisible({ timeout: 5000 });
        await expect(page.locator('text=/Beta Labs/i')).toBeVisible();
    });

    test('should show Active Projects section with mocked data', async ({ page }) => {
        await expect(page.locator('text=/Active Projects/i').first()).toBeVisible({ timeout: 10000 });
        await expect(page.locator('text=/Website Redesign/i')).toBeVisible({ timeout: 5000 });
        await expect(page.locator('text=/Mobile App/i')).toBeVisible();
    });

    test('should have "Add Client" button that navigates to new client page', async ({ page }) => {
        const addClientBtn = page.getByRole('link', { name: /Add Client/i }).first();
        await expect(addClientBtn).toBeVisible({ timeout: 10000 });
        await addClientBtn.click();
        await expect(page).toHaveURL(/clients\/new/);
    });

    test('dashboard sidebar should have navigation links', async ({ page }) => {
        await expect(page.getByRole('link', { name: /dashboard/i }).first()).toBeVisible({ timeout: 10000 });
        await expect(page.getByRole('link', { name: /clients/i }).first()).toBeVisible();
        await expect(page.getByRole('link', { name: /settings/i }).first()).toBeVisible();
    });

    test('"View all" links should exist for clients and projects', async ({ page }) => {
        const viewAllLinks = page.getByRole('link', { name: /View all/i });
        await expect(viewAllLinks.first()).toBeVisible({ timeout: 10000 });
        // There should be at least 2 "View all" links (clients + projects)
        expect(await viewAllLinks.count()).toBeGreaterThanOrEqual(2);
    });
});
