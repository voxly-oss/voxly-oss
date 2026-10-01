import { test, expect, type Page, type Route } from '@playwright/test';

// ──────────────────────────────────────────────────────────────
// Clients flow, end to end in a real browser against an in-memory API.
//
// Every /api/v1 request is answered here. A catch-all registered first (so
// it runs last — Playwright runs handlers newest-first) fails anything not
// mocked with a 501, so a test can never reach a real backend.
// ──────────────────────────────────────────────────────────────

const USER = {
    id: '00000000-0000-0000-0000-000000000001',
    email: 'owner@voxly.test',
    full_name: 'Test Owner',
    agency_name: 'E2E Agency',
    phone: null,
    subscription_tier: 'free',
    is_active: true,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
};

interface ClientRec {
    id: string;
    user_id: string;
    name: string;
    phone: string;
    email: string | null;
    company: string | null;
    telegram_chat_id: string | null;
    is_active: boolean;
    created_at: string;
    updated_at: string;
}

function client(id: string, name: string, phone: string, extra: Partial<ClientRec> = {}): ClientRec {
    return {
        id,
        user_id: USER.id,
        name,
        phone,
        email: null,
        company: null,
        telegram_chat_id: null,
        is_active: true,
        created_at: '2026-09-01T10:00:00Z',
        updated_at: '2026-09-01T10:00:00Z',
        ...extra,
    };
}

const SEED: ClientRec[] = [
    client('c-acme', 'Acme Corp', '+919000000001', { company: 'Acme Inc' }),
    client('c-beta', 'Beta Labs', '+14155550123', { email: 'ops@beta.dev', telegram_chat_id: '123456' }),
];

interface Recorded { method: string; path: string; body: Record<string, unknown> | null }

async function mockBackend(page: Page, clients: ClientRec[] = SEED) {
    const db = { clients: clients.map((c) => ({ ...c })), requests: [] as Recorded[] };
    const json = (route: Route, status: number, body: unknown) =>
        route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    const record = (route: Route) => {
        const req = route.request();
        const raw = req.postData();
        db.requests.push({ method: req.method(), path: new URL(req.url()).pathname, body: raw ? JSON.parse(raw) : null });
    };

    await page.route(/\/api\/v1\//, (route) =>
        json(route, 501, { detail: `Unmocked ${route.request().method()} ${new URL(route.request().url()).pathname}` }),
    );

    await page.route(/\/api\/v1\/auth\/me(\?.*)?$/, (route) => json(route, 200, USER));
    await page.route(/\/api\/v1\/projects(\?.*)?$/, (route) => json(route, 200, []));
    await page.route(/\/api\/v1\/channels(\?.*)?$/, (route) => json(route, 200, []));
    await page.route(/\/api\/v1\/chat\/conversations(\?.*)?$/, (route) =>
        json(route, 200, { total: 0, count: 0, conversations: [] }),
    );

    await page.route(/\/api\/v1\/clients(\?.*)?$/, (route) => {
        const req = route.request();
        if (req.method() === 'GET') {
            const url = new URL(req.url());
            const skip = Number(url.searchParams.get('skip') ?? 0);
            const limit = Math.min(Number(url.searchParams.get('limit') ?? 100), 100); // backend MAX_LIST_LIMIT
            return json(route, 200, db.clients.slice(skip, skip + limit));
        }
        if (req.method() === 'POST') {
            record(route);
            const body = req.postDataJSON() as Record<string, string | undefined>;
            const digits = (body.phone ?? '').replace(/\D/g, '');
            if (db.clients.some((c) => c.phone.replace(/\D/g, '') === digits)) {
                return json(route, 400, { detail: 'You already have a client with this phone number' });
            }
            const created = client(`c-new-${db.clients.length}`, body.name ?? '', `+${digits}`, {
                email: body.email ?? null,
                company: body.company ?? null,
                telegram_chat_id: body.telegram_chat_id ?? null,
                created_at: new Date().toISOString(),
            });
            db.clients.push(created);
            return json(route, 201, created);
        }
        return route.fallback();
    });

    await page.route(/\/api\/v1\/clients\/[^/?]+(\?.*)?$/, (route) => {
        const req = route.request();
        const id = new URL(req.url()).pathname.split('/').pop()!;
        const index = db.clients.findIndex((c) => c.id === id);
        if (index < 0) return json(route, 404, { detail: 'Client not found' });
        if (req.method() === 'GET') return json(route, 200, db.clients[index]);
        if (req.method() === 'PUT') {
            record(route);
            db.clients[index] = { ...db.clients[index], ...(req.postDataJSON() as Partial<ClientRec>) };
            return json(route, 200, db.clients[index]);
        }
        if (req.method() === 'DELETE') {
            record(route);
            db.clients.splice(index, 1);
            return route.fulfill({ status: 204 });
        }
        return route.fallback();
    });

    await page.addInitScript(() => window.localStorage.setItem('access_token', 'e2e-token'));
    return db;
}

const rowFor = (page: Page, name: string) => page.getByTestId('client-row').filter({ hasText: name });

test.describe('Clients', () => {
    test.describe.configure({ timeout: 90_000 });

    test('creates a client in the modal: inline validation, then blank optionals are omitted', async ({ page }) => {
        const db = await mockBackend(page);
        await page.goto('/clients');
        await expect(rowFor(page, 'Acme Corp')).toBeVisible();

        await page.getByRole('button', { name: 'New client' }).click();
        const dialog = page.getByRole('dialog');
        await expect(dialog.getByRole('heading', { name: 'New client' })).toBeVisible();

        // Empty submit: field errors, and nothing is sent.
        await dialog.getByRole('button', { name: 'Create client' }).click();
        await expect(dialog.getByText('Name is required')).toBeVisible();
        await expect(dialog.getByText('Phone is required')).toBeVisible();
        expect(db.requests.filter((r) => r.method === 'POST')).toHaveLength(0);

        // A pasted number with spaces is accepted (the server normalises it).
        await dialog.locator('#client-form-name').fill('Priya Sharma');
        await dialog.locator('#client-form-phone').fill('+91 98765 43210');
        await dialog.getByRole('button', { name: 'Create client' }).click();

        await expect(dialog).toBeHidden();
        // exact: Radix also mirrors the toast into a hidden aria-live announcer.
        await expect(page.getByText('Client created', { exact: true })).toBeVisible();
        await expect(rowFor(page, 'Priya Sharma')).toBeVisible();

        const post = db.requests.find((r) => r.method === 'POST');
        expect(post?.body).toEqual({ name: 'Priya Sharma', phone: '+91 98765 43210' });
    });

    test('shows an API duplicate-phone error on the phone field, not as a toast', async ({ page }) => {
        await mockBackend(page);
        await page.goto('/clients');
        await page.getByRole('button', { name: 'New client' }).click();
        const dialog = page.getByRole('dialog');

        await dialog.locator('#client-form-name').fill('Duplicate');
        await dialog.locator('#client-form-phone').fill('+91 90000 00001'); // same number as Acme Corp
        await dialog.getByRole('button', { name: 'Create client' }).click();

        await expect(dialog.locator('#client-form-phone-error')).toHaveText('You already have a client with this phone number');
        await expect(dialog.locator('#client-form-phone')).toHaveAttribute('aria-invalid', 'true');
        await expect(dialog).toBeVisible();
    });

    test('/clients/new redirects to the create modal, and closing it clears the URL', async ({ page }) => {
        await mockBackend(page);
        await page.goto('/clients/new');
        await expect(page).toHaveURL(/\/clients\?new=1$/);
        const dialog = page.getByRole('dialog');
        await expect(dialog.getByRole('heading', { name: 'New client' })).toBeVisible();

        await dialog.getByRole('button', { name: 'Cancel' }).click();
        await expect(dialog).toBeHidden();
        await expect(page).toHaveURL(/\/clients$/);
    });

    test('edits a client from the detail page; clearing a field sends null', async ({ page }) => {
        const db = await mockBackend(page);
        await page.goto('/clients/c-beta');
        await expect(page.getByRole('heading', { name: 'Beta Labs', level: 1 })).toBeVisible();

        await page.getByRole('button', { name: 'Edit client' }).click();
        const dialog = page.getByRole('dialog');
        await expect(dialog.locator('#client-form-email')).toHaveValue('ops@beta.dev');

        await dialog.locator('#client-form-name').fill('Beta Labs Ltd');
        await dialog.locator('#client-form-email').fill('');
        await dialog.getByRole('button', { name: 'Save changes' }).click();

        await expect(dialog).toBeHidden();
        await expect(page.getByRole('heading', { name: 'Beta Labs Ltd', level: 1 })).toBeVisible();
        const put = db.requests.find((r) => r.method === 'PUT');
        expect(put?.body).toMatchObject({ name: 'Beta Labs Ltd', email: null, telegram_chat_id: '123456', is_active: true });
    });

    test('marks a client inactive (with confirmation) and reactivates it from the list', async ({ page }) => {
        const db = await mockBackend(page);
        await page.goto('/clients');
        const row = rowFor(page, 'Acme Corp');
        await expect(row.getByText('Active', { exact: true })).toBeVisible();

        await page.getByRole('button', { name: 'Actions for Acme Corp' }).click();
        await page.getByRole('menuitem', { name: 'Mark inactive' }).click();
        const confirm = page.getByRole('dialog');
        await expect(confirm.getByText(/stop replying to their WhatsApp and Telegram messages/)).toBeVisible();
        await confirm.getByRole('button', { name: 'Mark inactive' }).click();

        await expect(confirm).toBeHidden();
        await expect(row.getByText('Inactive', { exact: true })).toBeVisible();
        expect(db.requests.at(-1)).toMatchObject({ method: 'PUT', path: '/api/v1/clients/c-acme', body: { is_active: false } });

        await page.getByRole('button', { name: 'Inactive', exact: true }).click();
        await expect(page.getByTestId('client-row')).toHaveCount(1);

        await page.getByRole('button', { name: 'Actions for Acme Corp' }).click();
        await page.getByRole('menuitem', { name: 'Reactivate' }).click();
        await expect(page.getByTestId('client-row')).toHaveCount(0);
        expect(db.requests.at(-1)).toMatchObject({ method: 'PUT', body: { is_active: true } });
    });

    test('deletes a client from the detail page and returns to the list', async ({ page }) => {
        const db = await mockBackend(page);
        await page.goto('/clients/c-acme');
        await page.getByRole('button', { name: 'More actions for Acme Corp' }).click();
        await page.getByRole('menuitem', { name: 'Delete client' }).click();
        await page.getByRole('dialog').getByRole('button', { name: 'Delete client' }).click();

        await expect(page).toHaveURL(/\/clients$/);
        await expect(rowFor(page, 'Beta Labs')).toBeVisible();
        await expect(rowFor(page, 'Acme Corp')).toHaveCount(0);
        expect(db.requests.at(-1)).toMatchObject({ method: 'DELETE', path: '/api/v1/clients/c-acme' });
    });

    test('loads every client, not just the API’s first 100', async ({ page }) => {
        const many = Array.from({ length: 120 }, (_, i) =>
            client(`c-${i}`, `Client ${String(i).padStart(3, '0')}`, `+9198765${String(i).padStart(5, '0')}`),
        );
        await mockBackend(page, many);
        await page.goto('/clients');
        await expect(page.getByText('120', { exact: true }).first()).toBeVisible();
        await expect(page.getByText('Showing 6 of 120 clients')).toBeVisible();
    });

    test('modals render with the app theme (lime primary on a surface-2 card), not the cosmic :root theme', async ({ page }) => {
        await mockBackend(page);
        await page.goto('/clients');
        await page.getByRole('button', { name: 'New client' }).click();
        const dialog = page.getByRole('dialog');
        await expect(dialog).toBeVisible();

        const submitBg = await dialog.getByRole('button', { name: 'Create client' }).evaluate((el) => getComputedStyle(el).backgroundColor);
        const [r, g, b] = submitBg.match(/\d+/g)!.map(Number);
        // hsl(76 86% 63%) ≈ rgb(199, 242, 80). The portal bug rendered violet ≈ rgb(110, 38, 217).
        expect(g).toBeGreaterThan(220);
        expect(r).toBeGreaterThan(170);
        expect(b).toBeLessThan(110);

        // Design Language "Elevated (modals)": surface-2 #1A1A1E.
        await expect(dialog).toHaveCSS('background-color', 'rgb(26, 26, 30)');

        // Review artifacts (test-results/ is gitignored).
        await dialog.screenshot({ path: 'test-results/clients-create-modal.png' });
        await dialog.getByRole('button', { name: 'Cancel' }).click();
        await expect(dialog).toBeHidden(); // wait out the close animation before capturing
        await page.screenshot({ path: 'test-results/clients-list.png', fullPage: true });
        await page.goto('/clients/c-beta');
        await expect(page.getByRole('heading', { name: 'Beta Labs', level: 1 })).toBeVisible();
        await page.screenshot({ path: 'test-results/client-detail.png', fullPage: true });
    });
});
