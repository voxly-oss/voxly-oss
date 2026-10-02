import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

/* The chat's service worker (public/chat-sw.js), run against a fake worker
   environment: when a push shows a notification, and what a tap opens. Its
   registration in a real browser is covered by portal-notifications.spec.ts. */

const ORIGIN = 'https://voxly.test';
const SOURCE = readFileSync(path.join(__dirname, '..', 'public', 'chat-sw.js'), 'utf8');

type Win = { url: string; visibilityState: 'visible' | 'hidden'; focused?: boolean; focus?: () => Promise<void> };
type Handler = (event: Record<string, unknown>) => void;

function worker(windows: Win[]) {
    const listeners: Record<string, Handler> = {};
    const shown: { title: string; options: Record<string, unknown> }[] = [];
    const opened: string[] = [];
    const self = {
        location: { origin: ORIGIN },
        addEventListener: (type: string, fn: Handler) => { listeners[type] = fn; },
        skipWaiting: () => Promise.resolve(),
        clients: {
            claim: () => Promise.resolve(),
            matchAll: async () => windows,
            openWindow: async (url: string) => { opened.push(url); return null; },
        },
        registration: {
            showNotification: async (title: string, options: Record<string, unknown>) => { shown.push({ title, options }); },
        },
    };
    vm.runInNewContext(SOURCE, { self, URL });
    const dispatch = async (type: string, event: Record<string, unknown>) => {
        let pending: Promise<unknown> = Promise.resolve();
        listeners[type]({ ...event, waitUntil: (p: Promise<unknown>) => { pending = p; } });
        await pending;
    };
    const push = (payload: unknown) => dispatch('push', {
        data: { json: () => (typeof payload === 'string' ? JSON.parse(payload) : payload), text: () => String(payload) },
    });
    const tap = () => dispatch('notificationclick', { notification: { data: { url: '/c' }, close: () => undefined } });
    return { push, tap, shown, opened };
}

const REPLY = { title: 'Northwind Studio', body: 'Your site is live', url: '/c', tag: 'voxly-chat' };

test.describe('Chat service worker', () => {
    test('shows the reply when the chat is not on screen', async () => {
        const sw = worker([{ url: `${ORIGIN}/clients/c1`, visibilityState: 'visible' }]); // /clients is not the chat
        await sw.push(REPLY);
        expect(sw.shown).toEqual([{
            title: 'Northwind Studio',
            options: { body: 'Your site is live', icon: '/orb-icon.png', tag: 'voxly-chat', renotify: true, data: { url: '/c' } },
        }]);
    });

    test('stays quiet while the chat is on screen, but not when its tab is in the background', async () => {
        const looking = worker([{ url: `${ORIGIN}/c`, visibilityState: 'visible' }]);
        await looking.push(REPLY);
        expect(looking.shown).toEqual([]);

        const background = worker([{ url: `${ORIGIN}/c`, visibilityState: 'hidden' }]);
        await background.push(REPLY);
        expect(background.shown.map((n) => n.title)).toEqual(['Northwind Studio']);
    });

    test('a push that is not JSON still shows, with a generic title', async () => {
        const sw = worker([]);
        await sw.push('plain text');
        expect(sw.shown.map((n) => [n.title, n.options.body])).toEqual([['New message', 'plain text']]);
    });

    test('a tap focuses the open chat, or opens it', async () => {
        let focused = 0;
        const open = worker([
            { url: `${ORIGIN}/clients`, visibilityState: 'visible', focus: async () => { throw new Error('wrong window'); } },
            { url: `${ORIGIN}/c`, visibilityState: 'hidden', focus: async () => { focused += 1; } },
        ]);
        await open.tap();
        expect([focused, open.opened]).toEqual([1, []]);

        const closed = worker([]);
        await closed.tap();
        expect(closed.opened).toEqual([`${ORIGIN}/c`]);
    });
});
