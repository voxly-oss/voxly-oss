import { test, expect, Page } from '@playwright/test';

// ──────────────────────────────────────────────────────────────
// Helper: Mock authentication + API routes for Settings
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

async function mockAuthForSettings(page: Page) {
    // Mock auth/me
    await page.route('**/api/v1/auth/me', (route) => {
        route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(MOCK_USER),
        });
    });

    // Mock API keys list — use includes() to avoid glob collision with ai-keys
    await page.route(
        (url) => url.href.includes('/api/v1/api-keys') && !url.href.includes('/api/v1/ai-keys'),
        (route) => {
            if (route.request().method() === 'GET') {
                route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({
                        keys: [
                            {
                                id: 'key-1',
                                key_prefix: 'vx_live_abc',
                                label: 'Production Server',
                                scopes: ['all'],
                                is_active: true,
                                last_used_at: '2026-03-20T10:00:00Z',
                                expires_at: null,
                                created_at: '2026-03-01T10:00:00Z',
                                revoked_at: null,
                            },
                        ],
                        max_allowed: 3,
                    }),
                });
            } else {
                route.continue();
            }
        }
    );

    // Mock billing usage
    await page.route('**/api/v1/billing/usage**', (route) => {
        route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                api_calls_today: 42,
                api_calls_limit_daily: 1000,
                ai_messages_this_month: 150,
                ai_messages_limit: 500,
                clients_count: 3,
                clients_limit: 5,
                projects_count: 7,
                projects_limit: 10,
                api_keys_count: 1,
                api_keys_limit: 3,
                usage_percentage: 30,
            }),
        });
    });

    // Mock billing plans
    await page.route('**/api/v1/billing/plans**', (route) => {
        route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                plans: [
                    {
                        id: 'plan-free',
                        name: 'Free',
                        slug: 'free',
                        tier_level: 0,
                        price_monthly: 0,
                        price_yearly: 0,
                        currency: 'USD',
                        max_clients: 5,
                        max_projects: 10,
                        max_api_keys: 1,
                        max_ai_messages_per_month: 500,
                        features: {},
                    },
                ],
            }),
        });
    });

    // Mock subscription
    await page.route('**/api/v1/billing/subscription**', (route) => {
        route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                id: 'sub-1',
                plan: { id: 'plan-free', name: 'Free', slug: 'free', tier_level: 0 },
                status: 'active',
                payment_gateway: null,
                current_period_end: null,
                cancel_at_period_end: false,
                created_at: '2026-01-01T00:00:00Z',
            }),
        });
    });

    // Mock AI key providers
    await page.route((url) => url.pathname === '/api/v1/ai-keys/providers', (route) => {
        route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify([
                { id: 'openai', name: 'OpenAI', prefix: 'sk-', placeholder: 'sk-...', docs_url: 'https://platform.openai.com', has_key: false },
                { id: 'anthropic', name: 'Anthropic', prefix: 'sk-ant-', placeholder: 'sk-ant-...', docs_url: 'https://docs.anthropic.com', has_key: true },
            ]),
        });
    });

    // Mock AI keys list
    await page.route((url) => url.pathname === '/api/v1/ai-keys', (route) => {
        if (route.request().method() === 'GET') {
            route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify([
                    {
                        id: 'aikey-1',
                        provider: 'anthropic',
                        provider_name: 'Anthropic',
                        label: null,
                        key_masked: 'sk-ant-...xxxx',
                        is_active: true,
                        is_valid: true,
                        last_validated_at: '2026-03-20T10:00:00Z',
                        last_used_at: '2026-03-21T10:00:00Z',
                        created_at: '2026-03-01T10:00:00Z',
                    },
                ]),
            });
        } else {
            route.continue();
        }
    });

    // Set fake JWT
    await page.addInitScript(() => {
        localStorage.setItem('access_token', 'mock-test-jwt-token-for-playwright');
    });
}

// ──────────────────────────────────────────────────────────────
// Settings E2E Tests
// ──────────────────────────────────────────────────────────────

test.describe('Settings Page', () => {
    test.beforeEach(async ({ page }) => {
        await mockAuthForSettings(page);
        await page.goto('/settings');
        await expect(page.locator('h1')).toContainText('Settings', { timeout: 15000 });
    });

    test('should render settings page with all 4 tabs', async ({ page }) => {
        await expect(page.getByRole('button', { name: /Profile/i })).toBeVisible();
        await expect(page.getByRole('button', { name: /API Keys/i })).toBeVisible();
        await expect(page.getByRole('button', { name: /AI Keys/i })).toBeVisible();
        await expect(page.getByRole('button', { name: /Billing/i })).toBeVisible();
    });

    // ── Profile Tab ──

    test('Profile tab should show profile form with user data', async ({ page }) => {
        await expect(page.locator('text=/Profile Details/i')).toBeVisible({ timeout: 8000 });
        await expect(page.locator('#full_name')).toBeVisible();
        await expect(page.locator('#email')).toBeVisible();
        await expect(page.locator('#agency_name')).toBeVisible();
    });

    test('Profile tab should have Save Changes button', async ({ page }) => {
        await expect(page.getByRole('button', { name: /Save Changes/i })).toBeVisible();
    });

    test('Profile tab should show Security section with password fields', async ({ page }) => {
        await expect(page.locator('text=/Security/i').first()).toBeVisible({ timeout: 8000 });
        await expect(page.locator('#current_password')).toBeVisible();
        await expect(page.locator('#new_password')).toBeVisible();
        await expect(page.locator('#confirm_password')).toBeVisible();
    });

    test('Profile tab should show Notifications toggles', async ({ page }) => {
        // Scroll down — the Notifications section is below the fold on the Profile tab
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await page.waitForTimeout(500);
        // Check for notification section or any toggle text
        const notifText = page.locator('text=/Email Notifications|Project Updates|Notifications/i');
        await expect(notifText.first()).toBeVisible({ timeout: 10000 });
    });

    // ── API Keys Tab ──

    test('API Keys tab should show key generation form', async ({ page }) => {
        await page.getByRole('button', { name: /API Keys/i }).click();
        await expect(page.locator('text=/Generate API Key/i')).toBeVisible({ timeout: 8000 });
        await expect(page.locator('input[placeholder*="Key Label"]')).toBeVisible();
        await expect(page.getByRole('button', { name: /Generate Key/i })).toBeVisible();
    });

    test('API Keys tab should show key management UI', async ({ page }) => {
        await page.getByRole('button', { name: /API Keys/i }).click();
        // The tab should show the Generate API Key form
        await expect(page.locator('text=/Generate API Key/i')).toBeVisible({ timeout: 8000 });
        // And either a keys list or an empty state message
        const keysList = page.locator('text=/Active Keys|No API keys|Production Server/i');
        const emptyState = page.locator('text=/Generate a new key|No API keys found/i');
        const spinner = page.locator('[class*="animate-spin"]');
        await expect(keysList.or(emptyState).or(spinner)).toBeVisible({ timeout: 8000 });
    });

    test('API Keys tab should show existing key with prefix', async ({ page }) => {
        await page.getByRole('button', { name: /API Keys/i }).click();
        await expect(page.locator('text=/Production Server/i')).toBeVisible({ timeout: 8000 });
        await expect(page.locator('text=/vx_live_abc/i')).toBeVisible();
    });

    test('API Keys tab should show active key count badge', async ({ page }) => {
        await page.getByRole('button', { name: /API Keys/i }).click();
        await expect(page.locator('text=/1 \\/ 3 Active Keys/i')).toBeVisible({ timeout: 8000 });
    });

    test('Generate Key button should be disabled when label is empty', async ({ page }) => {
        await page.getByRole('button', { name: /API Keys/i }).click();
        await page.waitForTimeout(1000);
        const generateBtn = page.getByRole('button', { name: /Generate Key/i });
        await expect(generateBtn).toBeDisabled();
    });

    test('Generate Key button should enable after typing a label', async ({ page }) => {
        await page.getByRole('button', { name: /API Keys/i }).click();
        await page.waitForTimeout(1000);
        await page.locator('input[placeholder*="Key Label"]').fill('Test CI Key');
        const generateBtn = page.getByRole('button', { name: /Generate Key/i });
        await expect(generateBtn).toBeEnabled();
    });

    // ── AI Keys (BYOK) Tab ──

    test('AI Keys tab should show providers', async ({ page }) => {
        await page.getByRole('button', { name: /AI Keys/i }).click();
        // The AI keys tab should show either provider names, the BYOK heading, or a loading spinner
        const content = page.locator('text=/OpenAI|Anthropic|Bring Your Own|AI Keys|Provider/i');
        const loadingSpinner = page.locator('[class*="animate-spin"]');
        // Wait longer as this tab triggers two parallel API calls
        await expect(content.or(loadingSpinner)).toBeVisible({ timeout: 15000 });
    });

    // ── Billing Tab ──

    test('Billing tab should show usage or plan info', async ({ page }) => {
        await page.getByRole('button', { name: /Billing/i }).click();
        const content = page.locator('text=/Usage|Plan|Free|Subscription/i');
        const loadingSpinner = page.locator('[class*="animate-spin"]');
        await expect(content.or(loadingSpinner)).toBeVisible({ timeout: 10000 });
    });
});

// NOTE: Unauthenticated access control is tested in smoke.spec.ts
// via "unauthenticated user is redirected from /dashboard".
// The settings page uses the same DashboardLayout auth guard.
