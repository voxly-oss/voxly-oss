import { test, expect, devices, type Page } from '@playwright/test';
import { USER, json, guardApiAndSignIn } from './support/mockApi';
import { LINK, PROFILE, mockPortal } from './support/mockPortal';

/* Notifications for the client chat. The browser's push service is faked in
   the page (permission + PushManager), so nothing leaves the machine. The
   service worker is tested on its own in chat-service-worker.spec.ts. */

const ENDPOINT = 'https://fcm.googleapis.com/fcm/send/test-device';

/** Fake Notification permission and PushManager, before any page script runs. */
async function fakePush(page: Page, opts: { permission: NotificationPermission; answer?: NotificationPermission; subscribed?: boolean }) {
    await page.addInitScript(({ permission, answer, subscribed, endpoint }) => {
        let current = permission;
        Object.defineProperty(Notification, 'permission', { get: () => current, configurable: true });
        Notification.requestPermission = async () => {
            current = answer ?? 'granted';
            return current;
        };
        let subscription: unknown = null;
        const make = (key: ArrayBuffer | null) => ({
            endpoint,
            options: { applicationServerKey: key },
            toJSON: () => ({ endpoint, expirationTime: null, keys: { p256dh: 'B' + 'p'.repeat(86), auth: 'a'.repeat(22) } }),
            unsubscribe: async () => {
                subscription = null;
                return true;
            },
        });
        if (subscribed) subscription = make(null);
        PushManager.prototype.getSubscription = async () => subscription as PushSubscription | null;
        PushManager.prototype.subscribe = async (options?: PushSubscriptionOptionsInit) => {
            const key = options?.applicationServerKey as Uint8Array;
            subscription = make(key.buffer.slice(0) as ArrayBuffer);
            return subscription as PushSubscription;
        };
    }, { ...opts, endpoint: ENDPOINT });
}

async function withSession(page: Page) {
    await page.addInitScript((profile) => {
        window.localStorage.setItem('voxly_chat_session', JSON.stringify({ accessToken: 'portal-session-token', expiresAt: Date.now() + 86_400_000, profile }));
    }, PROFILE);
}

const toggle = (page: Page) => page.getByTestId('portal-notify-toggle');
const prompt = (page: Page) => page.getByTestId('portal-notify-prompt');

test.describe('Client chat notifications', () => {
    test.describe.configure({ timeout: 90_000 });

    test('turn on from the prompt, then off from the bell', async ({ page }) => {
        const { db } = await mockPortal(page, { push: true });
        await fakePush(page, { permission: 'default', answer: 'granted' });
        await page.goto(`/c/${LINK}`);

        await expect(prompt(page)).toContainText('Get a notification when Northwind Studio replies.');
        await prompt(page).getByRole('button', { name: 'Turn on' }).click();

        await expect(toggle(page)).toHaveAttribute('data-state', 'on');
        await expect(toggle(page)).toHaveAccessibleName('Turn off notifications');
        await expect(prompt(page)).toHaveCount(0);
        expect(db.pushSubscriptions).toEqual([
            { endpoint: ENDPOINT, expirationTime: null, keys: { p256dh: 'B' + 'p'.repeat(86), auth: 'a'.repeat(22) } },
        ]);

        await toggle(page).click();
        await expect(toggle(page)).toHaveAttribute('data-state', 'off');
        expect(db.pushUnsubscribes).toEqual([ENDPOINT]);
        await expect(prompt(page)).toHaveCount(0); // they chose off; don't nag
    });

    test('a blocked permission is explained, not retried', async ({ page }) => {
        const { db } = await mockPortal(page, { push: true });
        await fakePush(page, { permission: 'default', answer: 'denied' });
        await page.goto(`/c/${LINK}`);

        await prompt(page).getByRole('button', { name: 'Turn on' }).click();
        await expect(prompt(page)).toContainText('Notifications are blocked for this site');
        await expect(toggle(page)).toHaveAttribute('data-state', 'denied');
        expect(db.pushSubscriptions).toEqual([]);
    });

    test('a device that already has them on is re-registered on open, silently', async ({ page }) => {
        const { db } = await mockPortal(page, { push: true });
        await fakePush(page, { permission: 'granted', subscribed: true });
        await withSession(page);
        await page.goto('/c');

        await expect(toggle(page)).toHaveAttribute('data-state', 'on');
        await expect(prompt(page)).toHaveCount(0);
        expect(db.pushSubscriptions.map((s) => s.endpoint)).toEqual([ENDPOINT]);
    });

    test('nothing is offered while the server has notifications off', async ({ page }) => {
        await mockPortal(page, { push: false });
        await fakePush(page, { permission: 'default' });
        await page.goto(`/c/${LINK}`);
        await expect(page.getByTestId('portal-message')).toHaveCount(3);
        await expect(toggle(page)).toHaveCount(0);
        await expect(prompt(page)).toHaveCount(0);
    });

    test('the agency sees which clients will be notified', async ({ page }) => {
        await guardApiAndSignIn(page);
        const client = { id: 'c1', user_id: USER.id, name: 'Acme Corp', phone: '+919000000001', email: null, company: null, telegram_chat_id: null, is_active: true, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
        await page.route(/\/api\/v1\/chat\/conversations(\?.*)?$/, (r) => json(r, 200, { total: 0, count: 0, conversations: [] }));
        await page.route(/\/api\/v1\/projects(\?.*)?$/, (r) => json(r, 200, []));
        await page.route(/\/api\/v1\/clients\/c1(\?.*)?$/, (r) => json(r, 200, client));
        await page.route(/\/api\/v1\/clients\/c1\/chat-link$/, (r) => json(r, 200, {
            active: true, url: `http://localhost:3001/c/${LINK}`, created_at: new Date().toISOString(),
            last_opened_at: new Date().toISOString(), last_opened_device: 'Chrome on Android', notification_devices: 2,
        }));
        await page.goto('/clients/c1');
        await expect(page.getByTestId('chat-link-notifications')).toHaveText('Notifications on · 2 devices');
    });
});

// iPhone Safari outside the Home Screen can't do Web Push; run its user agent
// on Chromium (minus defaultBrowserType, which can't be set in a describe).
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const { defaultBrowserType: _browser, ...IPHONE } = devices['iPhone 15'];

test.describe('Client chat notifications on an iPhone', () => {
    test.use(IPHONE);
    test.describe.configure({ timeout: 90_000 });

    test('explains adding the chat to the Home Screen', async ({ page }) => {
        await mockPortal(page, { push: true });
        await page.goto(`/c/${LINK}`);
        await expect(prompt(page)).toContainText('add this chat to your Home Screen');
        await expect(toggle(page)).toHaveCount(0);
    });
});
