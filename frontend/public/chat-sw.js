/* Service worker for the client chat (/c) — notifications only, no caching.

   The backend sends a Web Push when the agency replies on Voxly chat
   (backend/app/services/portal_push.py). Show it unless the chat is already
   on screen, and open (or focus) the chat when it's tapped. */

const CHAT_PATH = '/c';

const isChat = (url) => {
    const { pathname } = new URL(url);
    return pathname === CHAT_PATH || pathname.startsWith(`${CHAT_PATH}/`);
};

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
    let data = {};
    try {
        data = event.data ? event.data.json() : {};
    } catch {
        data = { body: event.data ? event.data.text() : '' };
    }
    event.waitUntil((async () => {
        const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
        if (windows.some((w) => w.visibilityState === 'visible' && isChat(w.url))) return;
        await self.registration.showNotification(data.title || 'New message', {
            body: data.body || '',
            icon: '/orb-icon.png',
            tag: data.tag || 'voxly-chat',
            renotify: true,
            data: { url: data.url || CHAT_PATH },
        });
    })());
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const target = new URL((event.notification.data && event.notification.data.url) || CHAT_PATH, self.location.origin).href;
    event.waitUntil((async () => {
        const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
        const chat = windows.find((w) => isChat(w.url));
        if (chat) {
            await chat.focus();
            return;
        }
        await self.clients.openWindow(target);
    })());
});
