import { test, expect, type Page } from '@playwright/test';
import { USER, json, guardApiAndSignIn } from './support/mockApi';

// (The older tests/dashboard.spec.ts targets a dashboard UI that no longer
// exists — see DEBT-03 — so this lives alongside it rather than replacing it.)

const emptyStats = {
    total_clients: 0, active_clients: 0, total_projects: 0, active_projects: 0, completed_projects: 0,
    total_messages: 0, messages_this_month: 0, messages_last_month: 0,
    clients_delta: 0, projects_delta: 0, messages_delta_pct: 0,
    messages_by_day: Array.from({ length: 7 }, (_, i) => ({ date: `2026-09-2${i + 1}`, count: 0 })),
    recent_activity: [], recent_ai_messages: [],
    integrations: { whatsapp: true, telegram: false, github: true, ai_provider: 'none' },
    ai_accuracy: 0,
};

const client = { id: 'c1', user_id: USER.id, name: 'Acme Corp', phone: '+919000000001', email: null, company: null, telegram_chat_id: null, is_active: true, created_at: '2026-01-05T00:00:00Z', updated_at: '2026-01-05T00:00:00Z' };
const project = { id: 'p1', client_id: 'c1', name: 'Checkout', description: null, github_repo: 'acme/checkout', github_sync_enabled: true, status: 'active', start_date: null, expected_end_date: null, created_at: '2026-01-05T00:00:00Z', updated_at: '2026-01-05T00:00:00Z', github_stats: null };

async function mockDashboard(page: Page, opts: { setUp: boolean }) {
    await guardApiAndSignIn(page);
    const stats = opts.setUp
        ? {
            ...emptyStats, total_clients: 1, active_clients: 1, total_projects: 1, active_projects: 1,
            total_messages: 30, messages_this_month: 12, messages_last_month: 0, messages_delta_pct: 100.0,
            messages_by_day: emptyStats.messages_by_day.map((d, i) => ({ ...d, count: [0, 2, 5, 1, 0, 3, 1][i] })),
            integrations: { ...emptyStats.integrations, ai_provider: 'groq' }, ai_accuracy: 90,
        }
        : emptyStats;
    await page.route(/\/api\/v1\/dashboard\/stats(\?.*)?$/, (r) => json(r, 200, stats));
    await page.route(/\/api\/v1\/clients(\?.*)?$/, (r) => json(r, 200, opts.setUp ? [client] : []));
    await page.route(/\/api\/v1\/projects(\?.*)?$/, (r) => json(r, 200, opts.setUp ? [project] : []));
    await page.route(/\/api\/v1\/channels(\?.*)?$/, (r) =>
        json(r, 200, opts.setUp ? [{ client_id: 'c1', channel: 'whatsapp', volume_today: 1, last_activity: new Date().toISOString() }] : []),
    );
    await page.route(/\/api\/v1\/ai-keys(\?.*)?$/, (r) => json(r, 200, []));
    await page.route(/\/api\/v1\/chat\/conversations(\?.*)?$/, (r) => {
        const awaiting = opts.setUp && new URL(r.request().url()).searchParams.get('status') === 'awaiting_human';
        return json(r, 200, awaiting
            ? { total: 1, count: 1, conversations: [{ client_id: 'c1', client_name: 'Acme Corp', channel: 'whatsapp', last_message: 'Any update?', last_response: null, last_message_at: new Date().toISOString(), message_count: 3, status: 'awaiting_human', status_updated_at: null, confidence: null, sentiment: null, github_stats: null }] }
            : { total: 0, count: 0, conversations: [] });
    });
}

test.describe('Dashboard', () => {
    test.describe.configure({ timeout: 60_000 });

    test('a brand-new workspace gets a setup checklist with the next step one click away', async ({ page }) => {
        await mockDashboard(page, { setUp: false });
        await page.goto('/dashboard');

        const checklist = page.getByTestId('setup-checklist');
        await expect(checklist).toContainText('0 of 5 done');
        await expect(checklist.getByRole('link', { name: /Add client/ })).toHaveAttribute('href', '/clients?new=1');
        await expect(checklist.getByRole('link', { name: /New project/ })).toHaveAttribute('href', '/projects?new=1');
        // No platform AI provider and no BYOK key → the AI step is open.
        await expect(checklist).toContainText('Make sure AI replies are ready');
        await expect(page.getByTestId('snapshot-tiles')).toContainText('No messages yet');
    });

    test('a set-up workspace hides the checklist and shows only real trends and deltas', async ({ page }) => {
        await mockDashboard(page, { setUp: true });
        await page.goto('/dashboard');

        const tiles = page.getByTestId('snapshot-tiles');
        await expect(tiles).toContainText('None last month');
        await expect(tiles).not.toContainText('100%'); // messages_delta_pct sentinel
        await expect(tiles.getByTestId('sparkline')).toHaveCount(2); // only the two message tiles
        await expect(page.getByTestId('setup-checklist')).toHaveCount(0);

        const attention = page.locator('details', { hasText: 'Needs Attention' });
        await expect(attention.getByRole('link', { name: /Acme Corp/ })).toHaveAttribute('href', '/messages?client=c1');
        await expect(page.getByRole('link', { name: 'Review' })).toHaveAttribute('href', '/messages?client=c1');
    });

    test('/projects?new=1 opens the project modal and closing it clears the URL', async ({ page }) => {
        await mockDashboard(page, { setUp: true });
        await page.goto('/projects?new=1');
        const dialog = page.getByRole('dialog');
        await expect(dialog.getByRole('heading', { name: 'New project' })).toBeVisible();
        await dialog.getByRole('button', { name: 'Cancel' }).click();
        await expect(dialog).toBeHidden();
        await expect(page).toHaveURL(/\/projects$/);
    });
});
