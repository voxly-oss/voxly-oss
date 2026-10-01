import { test, expect, type Page } from '@playwright/test';
import { USER, json, guardApiAndSignIn } from './support/mockApi';

// /analytics must show only what the API returns. Fixtures are chosen so
// every displayed number is checkable, and the strings the old page invented
// must never appear.

const today = new Date();
const isoDay = (offset: number) => {
    const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - offset));
    return d.toISOString().slice(0, 10);
};

const STATS = {
    total_clients: 4,
    active_clients: 3,
    total_projects: 3,
    active_projects: 2,
    completed_projects: 1,
    total_messages: 40,
    messages_this_month: 12,
    messages_last_month: 0,
    clients_delta: 2,
    projects_delta: 1,
    messages_delta_pct: 100.0, // the API's sentinel for "none last month"
    messages_by_day: [0, 2, 5, 1, 0, 3, 1].map((count, i) => ({ date: isoDay(6 - i), count })),
    recent_activity: [],
    recent_ai_messages: [{ client_name: 'Acme Corp', provider: 'groq', response_length: 220, timestamp: new Date(Date.now() - 5 * 60000).toISOString() }],
    integrations: { whatsapp: true, telegram: false, github: true, ai_provider: 'groq' },
    ai_accuracy: 87.5,
};

const STATUS_TOTALS: Record<string, number> = { all: 9, awaiting_human: 2, ai_handling: 3, escalated: 1, resolved: 2 };

const client = (id: string, name: string, createdAt: string) => ({
    id, user_id: USER.id, name, phone: '+919000000000', email: null, company: null, telegram_chat_id: null,
    is_active: true, created_at: createdAt, updated_at: createdAt,
});

const CLIENTS = [
    client('c1', 'Acme Corp', '2026-01-05T00:00:00Z'),
    client('c2', 'Beta Labs', '2026-01-06T00:00:00Z'),
    client('c3', 'Cobalt Co', '2026-01-07T00:00:00Z'),
    client('c4', 'Delta Inc', new Date().toISOString()), // the one "new this month"
];

const PROJECTS = [
    {
        id: 'p1', client_id: 'c1', name: 'Checkout', description: null, github_repo: 'acme/checkout', github_sync_enabled: true,
        status: 'active', start_date: '2026-01-01', expected_end_date: '2026-02-01', // overdue
        created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
        github_stats: { commits_count: 50, commits_last_7_days: 4, open_issues: 2, closed_issues: 9, pull_requests: 1, last_commit_message: 'fix', last_commit_date: '2026-09-20T00:00:00Z', progress_percent: 60, synced_at: '2026-09-29T00:00:00Z' },
    },
    { id: 'p2', client_id: 'c2', name: 'Site', description: null, github_repo: null, github_sync_enabled: false, status: 'active', start_date: null, expected_end_date: null, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', github_stats: null },
    { id: 'p3', client_id: 'c3', name: 'App', description: null, github_repo: null, github_sync_enabled: false, status: 'completed', start_date: null, expected_end_date: null, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', github_stats: null },
];

const CHANNELS = [
    { client_id: 'c1', channel: 'whatsapp', volume_today: 5, last_activity: new Date().toISOString() },
    { client_id: 'c2', channel: 'telegram', volume_today: 2, last_activity: new Date().toISOString() },
    { client_id: 'c1', channel: 'telegram', volume_today: 0, last_activity: '2026-09-01T00:00:00Z' },
];

async function mockAnalytics(page: Page, { statsStatus = 200 }: { statsStatus?: number } = {}) {
    await guardApiAndSignIn(page);
    await page.route(/\/api\/v1\/dashboard\/stats(\?.*)?$/, (route) =>
        statsStatus === 200 ? json(route, 200, STATS) : json(route, statsStatus, { detail: 'Stats service is down' }),
    );
    await page.route(/\/api\/v1\/clients(\?.*)?$/, (route) => json(route, 200, CLIENTS));
    await page.route(/\/api\/v1\/projects(\?.*)?$/, (route) => json(route, 200, PROJECTS));
    await page.route(/\/api\/v1\/channels(\?.*)?$/, (route) => json(route, 200, CHANNELS));
    await page.route(/\/api\/v1\/chat\/conversations(\?.*)?$/, (route) => {
        const status = new URL(route.request().url()).searchParams.get('status') ?? 'all';
        return json(route, 200, { total: STATUS_TOTALS[status] ?? 0, count: 0, conversations: [] });
    });
}

test.describe('Analytics', () => {
    test.describe.configure({ timeout: 60_000 });

    test('every figure comes from the API, and invented metrics are gone', async ({ page }) => {
        await mockAnalytics(page);
        await page.goto('/analytics');

        const tiles = page.getByTestId('analytics-tiles');
        await expect(tiles).toContainText('Active clients3of 4 · 1 new this month');
        await expect(tiles).toContainText('Active projects21 completed · 1 overdue');
        await expect(tiles).toContainText('Messages this month12None last month');
        await expect(tiles).not.toContainText('100%'); // the API's sentinel, not growth
        await expect(tiles).toContainText('Messages · last 7 days1240 all-time');
        await expect(tiles).toContainText('Answered with project data87.5%');
        await expect(tiles).toContainText('Waiting on a human2conversations need a reply');

        const outcomes = page.locator('section', { hasText: 'Conversation outcomes' });
        await expect(outcomes).toContainText('Awaiting a human2');
        await expect(outcomes).toContainText('AI handling3');
        await expect(outcomes).toContainText('No status yet1');
        await expect(outcomes).toContainText('9 conversations in total');

        await expect(page.getByRole('img', { name: /Messages per day: .* 5/ })).toBeVisible();

        const github = page.locator('section', { hasText: 'GitHub · synced repos' });
        await expect(github).toContainText('Repos synced1 / 1');
        await expect(github).toContainText('Commits (7d)4');

        const channels = page.locator('section', { hasText: 'WhatsApp clients' });
        await expect(channels).toContainText('WhatsApp clients1');
        await expect(channels).toContainText('Telegram clients2');
        await expect(channels).toContainText('Messages today7');

        const mostActive = page.locator('details', { hasText: 'Most Active Today' });
        await expect(mostActive.getByRole('link').first()).toContainText('Acme Corp5 msgs');

        for (const invented of ['$48.2K', 'Fable Studio', 'Studio Bloom', 'Kessler', '99.8%', 'Revenue trend', 'Cost by Agent', 'Sentiment (30d)']) {
            await expect(page.getByText(invented)).toHaveCount(0);
        }

        // Let the shell's route fade-in finish so the review image isn't dimmed.
        await expect(page.locator('#main-content > div')).toHaveCSS('opacity', '1');
        await page.screenshot({ path: 'test-results/analytics.png', fullPage: true });
    });

    test('a failed stats request shows an error with retry, not zeros', async ({ page }) => {
        await mockAnalytics(page, { statsStatus: 500 });
        await page.goto('/analytics');

        const alert = page.getByRole('alert').filter({ hasText: 'Stats service is down' });
        // React Query's default 3 retries with backoff (~7s) run before the error shows.
        await expect(alert).toBeVisible({ timeout: 20_000 });
        await expect(alert.getByRole('button', { name: 'Retry' })).toBeVisible();
        await expect(page.getByTestId('analytics-tiles')).toContainText('Active clients—');
    });
});
