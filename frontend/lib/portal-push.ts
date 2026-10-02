import { portalAPI } from '@/lib/portal';

/* Notifications for the client chat — the browser side of Web Push.

   The service worker (public/chat-sw.js) shows them; the backend
   (app/services/portal_push.py) sends one when the agency replies on Voxly
   chat. Scoped to /c, so the agency app is never involved. */

const WORKER_URL = '/chat-sw.js';
const WORKER_SCOPE = '/c';

export const pushSupported = () =>
    typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

/** iPhone and iPad only allow web notifications once the chat is on the Home Screen. */
export function needsHomeScreen(): boolean {
    if (typeof window === 'undefined') return false;
    const ua = navigator.userAgent;
    const ios = /iPhone|iPad|iPod/.test(ua) || (ua.includes('Macintosh') && navigator.maxTouchPoints > 1);
    const installed = window.matchMedia('(display-mode: standalone)').matches
        || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    return ios && !installed;
}

async function chatWorker(): Promise<ServiceWorkerRegistration> {
    await navigator.serviceWorker.register(WORKER_URL, { scope: WORKER_SCOPE });
    return navigator.serviceWorker.ready; // subscribing needs an active worker
}

function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
    const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (base64url.length % 4)) % 4);
    const raw = atob(base64);
    const bytes = new Uint8Array(new ArrayBuffer(raw.length));
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
    return bytes;
}

function sameKey(subscription: PushSubscription, key: Uint8Array): boolean {
    const current = subscription.options?.applicationServerKey;
    if (!current) return true; // the browser doesn't say; assume it's ours
    const bytes = new Uint8Array(current);
    return bytes.length === key.length && bytes.every((b, i) => b === key[i]);
}

/** This device's subscription for the server's current key (a replaced key means re-subscribing). */
async function subscriptionFor(registration: ServiceWorkerRegistration, publicKey: string): Promise<PushSubscription> {
    const key = keyBytes(publicKey);
    const existing = await registration.pushManager.getSubscription();
    if (existing && sameKey(existing, key)) return existing;
    if (existing) await existing.unsubscribe();
    return registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
}

async function currentSubscription(): Promise<PushSubscription | null> {
    const registration = await navigator.serviceWorker.getRegistration(WORKER_SCOPE);
    return (await registration?.pushManager.getSubscription()) ?? null;
}

/** Call straight from a tap: browsers (Safari strictly) only show the permission prompt then. */
export async function turnOnNotifications(token: string, publicKey: string): Promise<NotificationPermission> {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return permission;
    const subscription = await subscriptionFor(await chatWorker(), publicKey);
    await portalAPI.subscribePush(token, subscription.toJSON());
    return permission;
}

/** On every open: if this device has notifications on, make sure the server
 *  still has it — the link may have been regenerated or the key replaced.
 *  Resolves to whether notifications are on. */
export async function syncNotifications(token: string, publicKey: string): Promise<boolean> {
    if (Notification.permission !== 'granted') return false;
    const registration = await chatWorker();
    if (!(await registration.pushManager.getSubscription())) return false;
    const subscription = await subscriptionFor(registration, publicKey);
    await portalAPI.subscribePush(token, subscription.toJSON());
    return true;
}

export async function turnOffNotifications(token: string): Promise<void> {
    const subscription = await currentSubscription();
    if (!subscription) return;
    await portalAPI.unsubscribePush(token, subscription.endpoint).catch(() => undefined);
    await subscription.unsubscribe();
}

/** The chat link ended: stop notifying this device (the server already forgot it). */
export async function forgetNotifications(): Promise<void> {
    if (!pushSupported()) return;
    try {
        await (await currentSubscription())?.unsubscribe();
    } catch {
        // nothing to undo
    }
}
