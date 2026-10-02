import type { Page, WebSocketRoute } from '@playwright/test';
import { json } from './mockApi';

/* The client's side of the Voxly chat link (/c), fully mocked: a client has no
   agency login, so only portal endpoints answer — anything else is a 501. */

export const LINK = 'AAAAAAAAAAAAAAAAAAAAAA.BBBBBBBBBBBBBBBBBBBBBB';
export const PROFILE = { client_id: 'c1', client_name: 'Acme Corp', agency_name: 'Northwind Studio' };
export const SESSION = { access_token: 'portal-session-token', token_type: 'bearer', expires_in: 2592000, profile: PROFILE };
/** A well-formed applicationServerKey (65 bytes, base64url). */
export const PUSH_KEY = 'B' + 'A'.repeat(86);

const minsAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();

export type Msg = { id: string; direction: 'inbound' | 'outbound'; author_type: 'client' | 'ai' | 'agent'; channel: string; body: string; status: string; created_at: string };

const thread = (): Msg[] => [
    { id: 'm1', direction: 'inbound', author_type: 'client', channel: 'voxly', body: 'When do we launch?', status: 'received', created_at: minsAgo(30) },
    { id: 'm2', direction: 'outbound', author_type: 'ai', channel: 'voxly', body: 'Your site goes live on Friday.', status: 'sent', created_at: minsAgo(29) },
    { id: 'm3', direction: 'outbound', author_type: 'agent', channel: 'whatsapp', body: 'Sent you the invoice too.', status: 'sent', created_at: minsAgo(10) },
];

export interface PortalMockOptions {
    session?: 'ok' | 'revoked';
    messages?: 'ok' | 'ended';
    /** Is Web Push configured on the server (default: no). */
    push?: boolean;
}

export async function mockPortal(page: Page, opts: PortalMockOptions = {}) {
    const db = {
        messages: thread(),
        sends: [] as unknown[],
        sessionTokens: [] as string[],
        authHeaders: [] as (string | null)[],
        pushSubscriptions: [] as { endpoint: string; keys: { p256dh: string; auth: string } }[],
        pushUnsubscribes: [] as string[],
    };
    await page.route(/\/api\/v1\//, (r) => json(r, 501, { detail: `Unmocked ${new URL(r.request().url()).pathname}` }));
    await page.route(/\/api\/v1\/portal\/session$/, (r) => {
        db.sessionTokens.push((r.request().postDataJSON() as { token: string }).token);
        return opts.session === 'revoked'
            ? json(r, 404, { detail: "This chat link isn't active anymore. Ask your agency for a new one." })
            : json(r, 200, SESSION);
    });
    await page.route(/\/api\/v1\/portal\/messages(\?.*)?$/, (r) => {
        db.authHeaders.push(r.request().headers()['authorization'] ?? null);
        if (opts.messages === 'ended') return json(r, 401, { detail: 'This chat link is no longer active.' });
        if (r.request().method() === 'GET') return json(r, 200, { messages: db.messages, has_more: false });
        const { text } = r.request().postDataJSON() as { text: string };
        db.sends.push(text);
        const created: Msg = { id: `m-new-${db.sends.length}`, direction: 'inbound', author_type: 'client', channel: 'voxly', body: text, status: 'received', created_at: new Date().toISOString() };
        db.messages.push(created);
        return json(r, 201, created);
    });
    await page.route(/\/api\/v1\/portal\/push$/, (r) =>
        json(r, 200, opts.push ? { enabled: true, public_key: PUSH_KEY } : { enabled: false, public_key: null }));
    await page.route(/\/api\/v1\/portal\/push\/subscriptions$/, (r) => {
        db.pushSubscriptions.push(r.request().postDataJSON());
        return r.fulfill({ status: 204 });
    });
    await page.route(/\/api\/v1\/portal\/push\/unsubscribe$/, (r) => {
        db.pushUnsubscribes.push((r.request().postDataJSON() as { endpoint: string }).endpoint);
        return r.fulfill({ status: 204 });
    });
    let socket: WebSocketRoute | null = null;
    await page.routeWebSocket(/\/api\/v1\/portal\/ws/, (ws) => {
        socket = ws;
        ws.onMessage(() => { /* pings */ });
        // Dev-mode StrictMode opens a socket and closes it at once before the
        // real one; without a close handler the mock sometimes never opens
        // the second socket for the page.
        ws.onClose(() => { /* nothing to forward: there is no server */ });
    });
    const push = (event: string, message: Msg) =>
        socket!.send(JSON.stringify({ event, timestamp: new Date().toISOString(), conversation_id: 'c1', organization_id: null, payload: { message } }));
    return { db, push };
}
