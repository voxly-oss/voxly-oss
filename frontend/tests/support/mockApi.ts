import type { Page, Route } from '@playwright/test';

/** Shared e2e plumbing: a signed-in session against an API the test fully controls. */

export const USER = {
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

export const json = (route: Route, status: number, body: unknown) =>
    route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

/**
 * Call FIRST in every test. Playwright runs route handlers newest-first, so
 * this catch-all only answers requests no later handler claimed — with a 501
 * — and a test can never reach a real backend. Also signs the browser in.
 */
export async function guardApiAndSignIn(page: Page) {
    await page.route(/\/api\/v1\//, (route) =>
        json(route, 501, { detail: `Unmocked ${route.request().method()} ${new URL(route.request().url()).pathname}` }),
    );
    await page.route(/\/api\/v1\/auth\/me(\?.*)?$/, (route) => json(route, 200, USER));
    await page.addInitScript(() => window.localStorage.setItem('access_token', 'e2e-token'));
}
