import axios from 'axios';
import type { PortalMessage, PortalMessagePage, PortalProfile, PortalSession } from '@/types';

/* The client's side of the Voxly chat link (backend/app/api/v1/portal.py).

   A separate HTTP client on purpose: the agency `api` instance attaches the
   agency login and redirects to /login on a 401 — neither may ever happen on
   a client's chat. 60s timeout: a sleeping free-tier backend takes ~50s to
   wake, and a client's first open shouldn't fail on that. */

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
const STORAGE_KEY = 'voxly_chat_session';

const portal = axios.create({ baseURL: BASE_URL, timeout: 60_000 });

const bearer = (token: string) => ({ headers: { Authorization: `Bearer ${token}` } });

export const portalAPI = {
    /** Exchange the link token for a 30-day session on this device. */
    openSession: (linkToken: string) => portal.post<PortalSession>('/api/v1/portal/session', { token: linkToken }),
    me: (token: string) => portal.get<PortalProfile>('/api/v1/portal/me', bearer(token)),
    messages: (token: string, before?: string) =>
        portal.get<PortalMessagePage>('/api/v1/portal/messages', { ...bearer(token), params: { before, limit: 50 } }),
    send: (token: string, text: string) => portal.post<PortalMessage>('/api/v1/portal/messages', { text }, bearer(token)),
};

export const portalSocketUrl = (token: string) =>
    `${BASE_URL.replace(/^http/, 'ws')}/api/v1/portal/ws?token=${encodeURIComponent(token)}`;

/* ─── The device session ─── */

export interface StoredSession {
    accessToken: string;
    expiresAt: number; // epoch ms
    profile: PortalProfile;
}

export function saveSession(session: PortalSession): StoredSession {
    const stored: StoredSession = {
        accessToken: session.access_token,
        expiresAt: Date.now() + session.expires_in * 1000,
        profile: session.profile,
    };
    try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
    } catch {
        // Private mode / storage blocked: the chat still works for this visit.
    }
    return stored;
}

/** The raw stored value — a stable string, so it can be a useSyncExternalStore snapshot. */
export function readSessionRaw(): string | null {
    try {
        return window.localStorage.getItem(STORAGE_KEY);
    } catch {
        return null;
    }
}

export function parseSession(raw: string | null): StoredSession | null {
    if (!raw) return null;
    try {
        const session = JSON.parse(raw) as StoredSession;
        return session.accessToken && session.expiresAt > Date.now() ? session : null;
    } catch {
        return null;
    }
}

export function clearSession() {
    try {
        window.localStorage.removeItem(STORAGE_KEY);
    } catch {
        // nothing to clear
    }
    window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY }));
}

/** Re-render when the session changes in this tab or another one. */
export function subscribeSession(onChange: () => void) {
    const handler = (event: StorageEvent) => {
        if (event.key === null || event.key === STORAGE_KEY) onChange();
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
}

export const isUnauthorized = (err: unknown) => axios.isAxiosError(err) && err.response?.status === 401;
export const isNotFound = (err: unknown) => axios.isAxiosError(err) && err.response?.status === 404;
