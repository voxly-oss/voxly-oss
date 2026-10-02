import { test, expect, type Page, type WebSocketRoute } from '@playwright/test';
import { USER, json, guardApiAndSignIn } from './support/mockApi';

/* The inbox against a fully mocked API and a mocked realtime socket — the
   test pushes the same {event, payload} envelopes the backend broadcasts. */

const minsAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();

type Msg = {
    id: string; client_id: string; project_id: null; channel: string; direction: 'inbound' | 'outbound';
    author_type: 'client' | 'ai' | 'agent'; author_user_id: string | null; body: string;
    status: 'received' | 'queued' | 'sent' | 'failed'; error: string | null; reply_to_id: null;
    model_used: string | null; created_at: string;
};

const msg = (id: string, clientId: string, over: Partial<Msg>): Msg => ({
    id, client_id: clientId, project_id: null, channel: 'whatsapp', direction: 'inbound', author_type: 'client',
    author_user_id: null, body: '', status: 'received', error: null, reply_to_id: null, model_used: null,
    created_at: minsAgo(30), ...over,
});

const clients = [
    { id: 'c1', user_id: USER.id, name: 'Acme Corp', phone: '+919000000001', email: null, company: 'Acme', telegram_chat_id: null, is_active: true, created_at: minsAgo(9000), updated_at: minsAgo(9000) },
    { id: 'c2', user_id: USER.id, name: 'Beta Works', phone: '+919000000002', email: null, company: null, telegram_chat_id: null, is_active: true, created_at: minsAgo(9000), updated_at: minsAgo(9000) },
    { id: 'c3', user_id: USER.id, name: 'Gamma Studio', phone: '', email: null, company: null, telegram_chat_id: '700000001', is_active: true, created_at: minsAgo(9000), updated_at: minsAgo(9000) },
];

const HUMAN_OWNED = ['awaiting_human', 'escalated'];

async function mockInbox(page: Page) {
    const db = {
        threads: {
            c1: [
                msg('m1', 'c1', { body: 'Any update on the checkout page?', created_at: minsAgo(30) }),
                msg('m2', 'c1', { direction: 'outbound', author_type: 'ai', body: 'The checkout page is 80% done — payments land this week.', status: 'sent', model_used: 'gemini', created_at: minsAgo(29) }),
                msg('m3', 'c1', { direction: 'outbound', author_type: 'agent', author_user_id: USER.id, body: 'Sending the invoice tonight', status: 'failed', error: 'Provider rejected the message', created_at: minsAgo(10) }),
                msg('m4', 'c1', { body: 'ok, also is the staging link live?', created_at: minsAgo(5) }),
            ],
            c2: [
                msg('m5', 'c2', { body: 'Thanks for the update', created_at: minsAgo(60 * 30) }),
                msg('m6', 'c2', { direction: 'outbound', author_type: 'ai', body: 'Happy to help!', status: 'sent', created_at: minsAgo(60 * 30 - 1) }),
            ],
            c3: [],
        } as Record<string, Msg[]>,
        details: {
            c1: { client_id: 'c1', client_name: 'Acme Corp', status: 'ai_handling', status_updated_at: minsAgo(29), ai_paused: false, channels: ['whatsapp'], default_channel: 'whatsapp', github_stats: null },
            c2: { client_id: 'c2', client_name: 'Beta Works', status: 'resolved', status_updated_at: minsAgo(1000), ai_paused: false, channels: ['whatsapp'], default_channel: 'whatsapp', github_stats: null },
            c3: { client_id: 'c3', client_name: 'Gamma Studio', status: null, status_updated_at: null, ai_paused: false, channels: ['telegram'], default_channel: 'telegram', github_stats: null },
        } as Record<string, { client_name: string; status: string | null; ai_paused: boolean } & Record<string, unknown>>,
        sends: [] as unknown[],
        statusPatches: [] as string[],
        listQueries: [] as URLSearchParams[],
    };

    await guardApiAndSignIn(page);
    await page.route(/\/api\/v1\/chat\/conversations(\?.*)?$/, (r) => json(r, 200, { total: 0, count: 0, conversations: [] }));
    await page.route(/\/api\/v1\/clients(\?.*)?$/, (r) => json(r, 200, clients));

    await page.route(/\/api\/v1\/conversations(\?.*)?$/, (r) => {
        const params = new URL(r.request().url()).searchParams;
        db.listQueries.push(params);
        const status = params.get('status');
        const rows = Object.entries(db.threads)
            .filter(([id, thread]) => thread.length > 0 && (!status || db.details[id].status === status))
            .map(([id, thread]) => {
                const last = thread[thread.length - 1];
                return {
                    client_id: id, client_name: db.details[id].client_name, channel: last.channel, last_message: last,
                    message_count: thread.length, status: db.details[id].status, awaiting_reply: last.direction === 'inbound',
                };
            })
            .sort((a, b) => b.last_message.created_at.localeCompare(a.last_message.created_at));
        return json(r, 200, { total: rows.length, conversations: rows });
    });

    await page.route(/\/api\/v1\/conversations\/[^/?]+(\?.*)?$/, (r) => {
        const id = new URL(r.request().url()).pathname.split('/').pop()!;
        return db.details[id] ? json(r, 200, db.details[id]) : json(r, 404, { detail: 'Client not found' });
    });

    await page.route(/\/api\/v1\/conversations\/[^/]+\/messages(\?.*)?$/, (r) => {
        const id = new URL(r.request().url()).pathname.split('/')[4];
        if (r.request().method() === 'GET') return json(r, 200, { messages: db.threads[id], has_more: false });
        const body = r.request().postDataJSON() as { text: string; channel: string };
        db.sends.push(body);
        const created = msg(`m-sent-${db.sends.length}`, id, {
            direction: 'outbound', author_type: 'agent', author_user_id: USER.id, body: body.text,
            channel: body.channel, status: 'sent', created_at: new Date().toISOString(),
        });
        db.threads[id].push(created);
        if (!HUMAN_OWNED.includes(db.details[id].status ?? '')) {
            db.details[id] = { ...db.details[id], status: 'awaiting_human', ai_paused: true };
        }
        return json(r, 201, created);
    });

    await page.route(/\/api\/v1\/conversations\/[^/]+\/messages\/[^/]+\/retry$/, (r) => {
        const [, , , , clientId, , messageId] = new URL(r.request().url()).pathname.split('/');
        const m = db.threads[clientId].find((x) => x.id === messageId)!;
        Object.assign(m, { status: 'sent', error: null });
        return json(r, 200, m);
    });

    await page.route(/\/api\/v1\/chat\/conversations\/[^/]+\/status$/, (r) => {
        const id = new URL(r.request().url()).pathname.split('/')[5];
        const { status } = r.request().postDataJSON() as { status: string };
        db.statusPatches.push(status);
        db.details[id] = { ...db.details[id], status, ai_paused: HUMAN_OWNED.includes(status) };
        return json(r, 200, { client_id: id, status, updated_at: new Date().toISOString(), updated_by_user_id: USER.id });
    });

    let socket: WebSocketRoute | null = null;
    await page.routeWebSocket(/\/api\/v1\/chat\/ws/, (ws) => {
        socket = ws;
        ws.onMessage(() => { /* keep-alive pings */ });
        // Dev-mode StrictMode opens a socket and closes it at once before the
        // real one; without a close handler the mock sometimes never opens
        // the second socket for the page.
        ws.onClose(() => { /* nothing to forward: there is no server */ });
    });
    const push = (event: string, conversationId: string, payload: unknown) =>
        socket!.send(JSON.stringify({ event, timestamp: new Date().toISOString(), conversation_id: conversationId, organization_id: null, payload }));

    return { db, push };
}

const rows = (page: Page) => page.getByTestId('conversation-row');
const bubbles = (page: Page) => page.getByRole('log').getByTestId('message');

test.describe('Inbox', () => {
    test.describe.configure({ timeout: 90_000 });

    test('opens a thread, retries a failed message, replies, and receives new messages live', async ({ page }) => {
        const { db, push } = await mockInbox(page);
        await page.goto('/messages');

        await expect(rows(page)).toHaveCount(2);
        await expect(rows(page).first()).toContainText('Acme Corp');
        await expect(rows(page).first()).toContainText('ok, also is the staging link live?');
        await expect(rows(page).nth(1)).toContainText('AI: Happy to help!');
        await expect(page.getByText('Pick a conversation')).toBeVisible();

        await rows(page).first().click();
        await expect(page).toHaveURL(/\?client=c1$/);
        await expect(page.getByTestId('thread-title')).toHaveText('Acme Corp');
        await expect(bubbles(page)).toHaveCount(4);
        await expect(bubbles(page).nth(0)).toHaveAttribute('data-author', 'client');
        await expect(bubbles(page).nth(1)).toHaveAttribute('data-author', 'ai');

        // A failed send says why and retries in place.
        const failed = bubbles(page).filter({ hasText: 'Sending the invoice tonight' });
        await expect(failed).toHaveAttribute('data-status', 'failed');
        await expect(failed).toContainText('Not delivered — Provider rejected the message');
        await failed.getByRole('button', { name: 'Retry' }).click();
        await expect(failed).toHaveAttribute('data-status', 'sent');
        await expect(failed).not.toContainText('Not delivered');

        // Replying sends on the client's channel and hands the conversation to us.
        await expect(page.getByText('The AI replies automatically')).toBeVisible();
        const composer = page.getByRole('textbox', { name: 'Message Acme Corp' });
        await composer.fill('On it — call you at 3?');
        await composer.press('Enter');
        await expect(composer).toHaveValue('');
        const mine = bubbles(page).filter({ hasText: 'On it — call you at 3?' });
        await expect(mine).toHaveCount(1);
        await expect(mine).toHaveAttribute('data-status', 'sent');
        await expect(mine).toContainText('You');
        expect(db.sends).toEqual([{ text: 'On it — call you at 3?', channel: 'whatsapp' }]);
        await expect(page.getByText('You’re handling this conversation')).toBeVisible();

        // A client message arrives over the socket — no reload.
        await expect(page.getByTestId('inbox-meta')).toContainText('Live');
        const live = msg('m-live', 'c1', { body: 'Perfect, thanks!', created_at: new Date().toISOString() });
        db.threads.c1.push(live);
        push('message.created', 'c1', { message: live });
        await expect(bubbles(page).filter({ hasText: 'Perfect, thanks!' })).toHaveAttribute('data-author', 'client');
        await expect(rows(page).first()).toContainText('Perfect, thanks!');
    });

    test('take over pauses the AI, hand back resumes it, and a teammate’s change arrives live', async ({ page }) => {
        const { db, push } = await mockInbox(page);
        await page.goto('/messages?client=c1');
        await expect(page.getByTestId('thread-status')).toHaveText('AI handling');

        await page.getByRole('button', { name: 'Take over' }).click();
        await expect(page.getByTestId('thread-status')).toHaveText('Awaiting human');
        await expect(page.getByText('You’re handling this conversation')).toBeVisible();

        await page.getByRole('button', { name: 'Hand back to AI' }).first().click();
        await expect(page.getByTestId('thread-status')).toHaveText('AI handling');
        await expect(page.getByText('The AI replies automatically')).toBeVisible();
        await expect.poll(() => db.statusPatches).toEqual(['awaiting_human', 'ai_handling']);

        await expect(page.getByTestId('inbox-meta')).toContainText('Live');
        db.details.c1 = { ...db.details.c1, status: 'escalated', ai_paused: true };
        push('conversation.state_changed', 'c1', { client_id: 'c1', status: 'escalated', updated_by_user_id: 'teammate-id' });
        await expect(page.getByTestId('thread-status')).toHaveText('Escalated');
        await expect(page.getByText('You’re handling this conversation')).toBeVisible();
    });

    test('starts a new conversation with a client who has never written in', async ({ page }) => {
        const { db } = await mockInbox(page);
        await page.goto('/messages?status=awaiting_human');

        // The dashboard's "needs attention" deep link pre-filters the list server-side.
        await expect(page.getByRole('button', { name: 'Needs attention' })).toHaveAttribute('aria-pressed', 'true');
        await expect.poll(() => db.listQueries.at(-1)?.get('status')).toBe('awaiting_human');

        await page.getByRole('button', { name: 'New message' }).first().click();
        const dialog = page.getByRole('dialog', { name: 'New message' });
        await dialog.getByRole('searchbox', { name: 'Search clients' }).fill('gamma');
        await dialog.getByRole('button', { name: /Gamma Studio/ }).click();

        await expect(dialog).toBeHidden();
        await expect(page).toHaveURL(/client=c3/);
        await expect(page.getByTestId('thread-title')).toHaveText('Gamma Studio');
        await expect(page.getByText('Say hello — your message goes out on Telegram.')).toBeVisible();
        await expect(page.getByRole('textbox', { name: 'Message Gamma Studio' })).toHaveAttribute('placeholder', 'Message Gamma Studio on Telegram');
    });

    test('on a phone the list and the thread are separate screens', async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await mockInbox(page);
        await page.goto('/messages');

        await expect(rows(page)).toHaveCount(2);
        await expect(page.getByText('Pick a conversation')).toBeHidden();

        await rows(page).first().click();
        await expect(page.getByTestId('thread-title')).toBeVisible();
        await expect(rows(page).first()).toBeHidden();
        // The thread fits the screen — nothing pushed off the right edge.
        await expect(page.getByRole('button', { name: 'Retry' })).toBeInViewport({ ratio: 1 });
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
        // Take over lives in the ⋮ menu on a phone.
        await page.getByRole('button', { name: 'Conversation actions' }).click();
        await expect(page.getByRole('menuitem', { name: 'Take over' })).toBeVisible();
        await page.keyboard.press('Escape');

        await page.getByRole('button', { name: 'Back to conversations' }).click();
        await expect(rows(page).first()).toBeVisible();
        await expect(page).not.toHaveURL(/client=/);
    });
});
