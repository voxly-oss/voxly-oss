import { test, expect, devices, type Page } from '@playwright/test';
import { USER, json, guardApiAndSignIn } from './support/mockApi';
import { LINK, PROFILE, mockPortal, type Msg } from './support/mockPortal';

/* The client's side of the Voxly chat link (/c/<link> → /c), against a fully
   mocked portal API and socket, plus the agency's chat-link card. */

const minsAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();

const bubbles = (page: Page) => page.getByTestId('portal-message');

test.describe('Client chat (Voxly chat link)', () => {
    test.describe.configure({ timeout: 90_000 });

    test('opening the link starts a session, shows the thread, sends, and gets replies live', async ({ page }) => {
        const { db, push } = await mockPortal(page);
        await page.goto(`/c/${LINK}`);

        // The link is traded for a session and dropped from the address bar.
        await expect(page).toHaveURL(/\/c$/);
        expect(db.sessionTokens).toEqual([LINK]);
        await expect(page.getByTestId('portal-agency')).toHaveText('Northwind Studio');
        await expect(page.getByTestId('portal-live')).toHaveText('Live');

        await expect(bubbles(page)).toHaveCount(3);
        await expect(bubbles(page).nth(0)).toHaveAttribute('data-mine', 'true');
        await expect(bubbles(page).nth(1)).toContainText('Northwind Studio · AI assistant');
        await expect(bubbles(page).nth(2)).toContainText('via WhatsApp');
        expect(db.authHeaders[0]).toBe('Bearer portal-session-token');

        const box = page.getByRole('textbox', { name: 'Message Northwind Studio' });
        await box.fill('Can we add a blog page?');
        await box.press('Enter');
        await expect(box).toHaveValue('');
        const mine = bubbles(page).filter({ hasText: 'Can we add a blog page?' });
        await expect(mine).toHaveCount(1);
        await expect(mine).toHaveAttribute('data-status', 'received');
        expect(db.sends).toEqual(['Can we add a blog page?']);

        const reply: Msg = { id: 'm-ai', direction: 'outbound', author_type: 'ai', channel: 'voxly', body: 'Yes — I’ve flagged it for the team.', status: 'sent', created_at: new Date().toISOString() };
        push('message.created', reply);
        await expect(bubbles(page).filter({ hasText: 'flagged it for the team' })).toHaveAttribute('data-mine', 'false');
    });

    test('a revoked link says so instead of opening', async ({ page }) => {
        await mockPortal(page, { session: 'revoked' });
        await page.goto(`/c/${LINK}`);
        await expect(page.getByTestId('portal-ended')).toHaveText("This chat link isn't active anymore");
    });

    test('when the agency turns the link off mid-chat, the device session ends', async ({ page }) => {
        await mockPortal(page, { messages: 'ended' });
        await page.addInitScript((session) => {
            window.localStorage.setItem('voxly_chat_session', JSON.stringify(session));
        }, { accessToken: 'portal-session-token', expiresAt: Date.now() + 86_400_000, profile: PROFILE });
        await page.goto('/c');

        await expect(page.getByTestId('portal-ended')).toBeVisible();
        await expect(page.getByText('Ask Northwind Studio to send you a new link.')).toBeVisible();
        expect(await page.evaluate(() => window.localStorage.getItem('voxly_chat_session'))).toBeNull();
    });

    test('/c without a session explains how to get in', async ({ page }) => {
        await mockPortal(page);
        await page.goto('/c');
        await expect(page.getByRole('heading', { name: 'Open your chat link' })).toBeVisible();
    });

    test('a stale agency login in the same browser never bounces the client to /login', async ({ page }) => {
        await mockPortal(page);
        await page.route(/\/api\/v1\/auth\/me(\?.*)?$/, (r) => json(r, 401, { detail: 'Could not validate credentials' }));
        await page.addInitScript(() => window.localStorage.setItem('access_token', 'expired-agency-token'));
        await page.goto(`/c/${LINK}`);
        await expect(page.getByTestId('portal-agency')).toHaveText('Northwind Studio');
        await expect(page).toHaveURL(/\/c$/);
    });
});

// A phone (touch, coarse pointer, small viewport) — minus defaultBrowserType,
// which can't be set inside a describe.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const { defaultBrowserType: _browser, ...PHONE } = devices['Pixel 7'];

test.describe('Client chat on a phone', () => {
    test.use(PHONE);
    test.describe.configure({ timeout: 90_000 });

    test('fits the screen; Enter is a new line and the button sends', async ({ page }) => {
        const { db } = await mockPortal(page);
        await page.goto(`/c/${LINK}`);
        await expect(bubbles(page)).toHaveCount(3);
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);

        const box = page.getByRole('textbox', { name: 'Message Northwind Studio' });
        await box.fill('Line one');
        await box.press('Enter');
        await box.pressSequentially('Line two');
        expect(db.sends).toEqual([]);
        await page.getByRole('button', { name: 'Send message' }).tap();
        await expect.poll(() => db.sends).toEqual(['Line one\nLine two']);
    });
});

test.describe('Agency: the client’s chat link', () => {
    test.describe.configure({ timeout: 90_000 });

    test('create, copy, turn off', async ({ page, context }) => {
        await context.grantPermissions(['clipboard-read', 'clipboard-write']);
        await guardApiAndSignIn(page);
        const client = { id: 'c1', user_id: USER.id, name: 'Acme Corp', phone: '+919000000001', email: null, company: null, telegram_chat_id: null, is_active: true, created_at: minsAgo(9000), updated_at: minsAgo(9000) };
        const url = 'http://localhost:3001/c/' + LINK;
        let link = { active: false, url: null as string | null, created_at: null as string | null, last_opened_at: null as string | null, last_opened_device: null as string | null };
        const calls: string[] = [];
        await page.route(/\/api\/v1\/chat\/conversations(\?.*)?$/, (r) => json(r, 200, { total: 0, count: 0, conversations: [] }));
        await page.route(/\/api\/v1\/projects(\?.*)?$/, (r) => json(r, 200, []));
        await page.route(/\/api\/v1\/clients\/c1(\?.*)?$/, (r) => json(r, 200, client));
        await page.route(/\/api\/v1\/clients\/c1\/chat-link$/, (r) => {
            const method = r.request().method();
            calls.push(method);
            if (method === 'POST') {
                link = { active: true, url, created_at: new Date().toISOString(), last_opened_at: null, last_opened_device: null };
                return json(r, 201, link);
            }
            if (method === 'DELETE') {
                link = { active: false, url: null, created_at: null, last_opened_at: null, last_opened_device: null };
                return r.fulfill({ status: 204 });
            }
            return json(r, 200, link);
        });

        await page.goto('/clients/c1');
        const card = page.getByTestId('chat-link-card');
        await card.getByRole('button', { name: 'Create chat link' }).click();
        await expect(card.getByRole('textbox', { name: 'Chat link' })).toHaveValue(url);
        await expect(card.getByTestId('chat-link-opened')).toHaveText('Not opened yet');
        await expect(card.getByRole('link', { name: 'Send on WhatsApp' })).toHaveAttribute('href', /^https:\/\/wa\.me\/919000000001\?text=/);

        await card.getByRole('button', { name: 'Copy' }).click();
        await expect(card.getByRole('button', { name: 'Copied' })).toBeVisible();
        expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(url);

        await card.getByRole('button', { name: 'Turn off' }).click();
        await page.getByRole('dialog').getByRole('button', { name: 'Turn off' }).click();
        await expect(card.getByRole('button', { name: 'Create chat link' })).toBeVisible();
        expect(calls.filter((m) => m !== 'GET')).toEqual(['POST', 'DELETE']);
    });
});
