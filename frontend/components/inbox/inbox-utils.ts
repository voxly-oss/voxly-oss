import type { ConversationStatus, ThreadMessage } from '@/types';

/* ─── Conversation status — the backend's own enum (schemas/conversation.py) ─── */

export const STATUS_LABEL: Record<ConversationStatus, string> = {
    awaiting_human: 'Awaiting human',
    ai_handling: 'AI handling',
    resolved: 'Resolved',
    escalated: 'Escalated',
};

export const STATUS_DOT: Record<ConversationStatus, string> = {
    awaiting_human: 'bg-voxly-warning',
    ai_handling: 'bg-voxly-violet',
    resolved: 'bg-voxly-success',
    escalated: 'bg-voxly-heat',
};

export const STATUS_STYLE: Record<ConversationStatus, string> = {
    awaiting_human: 'bg-voxly-warning-soft text-voxly-warning',
    ai_handling: 'bg-voxly-violet-soft text-voxly-violet',
    resolved: 'bg-voxly-success-soft text-voxly-success',
    escalated: 'bg-voxly-heat-soft text-voxly-heat',
};

export const STATUS_KEYS = Object.keys(STATUS_LABEL) as ConversationStatus[];

/** Mirrors message_store._human_owned: only a teammate-set state pauses the AI. */
const HUMAN_OWNED: ConversationStatus[] = ['awaiting_human', 'escalated'];
export const isAiPaused = (status: ConversationStatus | null, updatedByUserId: string | null | undefined) =>
    !!status && HUMAN_OWNED.includes(status) && !!updatedByUserId;

export const CHANNEL_LABEL: Record<string, string> = { whatsapp: 'WhatsApp', telegram: 'Telegram', voxly: 'Voxly chat' };
export const channelLabel = (channel: string | null | undefined) =>
    channel ? CHANNEL_LABEL[channel] ?? channel.charAt(0).toUpperCase() + channel.slice(1) : '';

/* ─── Avatars ─── */

export function initials(name: string) {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '?';
    return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

const AVATAR_TONES = [
    'bg-voxly-violet-soft text-voxly-violet',
    'bg-voxly-success-soft text-voxly-success',
    'bg-voxly-warning-soft text-voxly-warning',
    'bg-voxly-heat-soft text-voxly-heat',
    'bg-primary/15 text-primary',
];

/** Stable per-client tone, so a client keeps the same colour everywhere. */
export function avatarTone(id: string) {
    let hash = 0;
    for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
    return AVATAR_TONES[Math.abs(hash) % AVATAR_TONES.length];
}

/* ─── Time ─── */

const toDate = (iso: string | null | undefined) => (iso ? new Date(iso) : null);

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
const DAY_MS = 86_400_000;

/** Whole calendar days between `d` and now (0 = today, 1 = yesterday). */
function daysAgo(d: Date) {
    return Math.round((startOfDay(new Date()) - startOfDay(d)) / DAY_MS);
}

export function formatClock(iso: string | null | undefined) {
    const d = toDate(iso);
    return d ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
}

/** Conversation-list timestamp, WhatsApp style: time today, then Yesterday, weekday, date. */
export function formatListTime(iso: string | null | undefined) {
    const d = toDate(iso);
    if (!d) return '';
    const days = daysAgo(d);
    if (days <= 0) return formatClock(iso);
    if (days === 1) return 'Yesterday';
    if (days < 7) return d.toLocaleDateString([], { weekday: 'short' });
    return d.toLocaleDateString([], { day: 'numeric', month: 'short', year: d.getFullYear() === new Date().getFullYear() ? undefined : '2-digit' });
}

/** Day separator inside a thread. */
export function dayLabel(iso: string | null | undefined) {
    const d = toDate(iso);
    if (!d) return '';
    const days = daysAgo(d);
    if (days <= 0) return 'Today';
    if (days === 1) return 'Yesterday';
    return d.toLocaleDateString([], {
        weekday: 'long', day: 'numeric', month: 'long',
        year: d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric',
    });
}

export function sameDay(a: string | null | undefined, b: string | null | undefined) {
    const da = toDate(a);
    const db = toDate(b);
    return !!da && !!db && startOfDay(da) === startOfDay(db);
}

/* ─── Thread cache (shared by the agency inbox and the client's chat) ─── */

/** Anything with an id, a delivery status and a timestamp. */
type CachedMessage = Pick<ThreadMessage, 'id' | 'status' | 'created_at'>;

export interface ThreadPages<T extends CachedMessage = ThreadMessage> {
    pages: { messages: T[]; has_more: boolean }[];
    pageParams: (string | undefined)[];
}

/** A message never goes back from a final state (sent/failed/received) to
 *  queued because of a late, out-of-order event. Retry forces it explicitly. */
const STATUS_RANK: Record<string, number> = { queued: 0, received: 1, sent: 1, failed: 1 };

const time = (m: CachedMessage) => (m.created_at ? Date.parse(m.created_at) : Number.MAX_SAFE_INTEGER);
const byTime = (a: CachedMessage, b: CachedMessage) => time(a) - time(b) || a.id.localeCompare(b.id);

/**
 * Insert or update one message in the infinite-query cache. pages[0] is the
 * newest page, so an unknown message is appended there.
 */
export function upsertThreadMessage<T extends CachedMessage = ThreadMessage>(
    data: ThreadPages<T> | undefined, message: T, force = false,
): ThreadPages<T> | undefined {
    if (!data) return data;
    let found = false;
    const pages = data.pages.map((page) => {
        const i = page.messages.findIndex((m) => m.id === message.id);
        if (i === -1) return page;
        found = true;
        const current = page.messages[i];
        if (!force && (STATUS_RANK[message.status] ?? 1) < (STATUS_RANK[current.status] ?? 1)) return page;
        const messages = page.messages.slice();
        messages[i] = message;
        return { ...page, messages };
    });
    if (!found) {
        const [newest, ...rest] = pages.length ? pages : [{ messages: [], has_more: false }];
        return { ...data, pages: [{ ...newest, messages: [...newest.messages, message].sort(byTime) }, ...rest] };
    }
    return { ...data, pages };
}

export function removeThreadMessage<T extends CachedMessage = ThreadMessage>(
    data: ThreadPages<T> | undefined, id: string,
): ThreadPages<T> | undefined {
    if (!data) return data;
    return { ...data, pages: data.pages.map((p) => ({ ...p, messages: p.messages.filter((m) => m.id !== id) })) };
}

/** Oldest → newest across every loaded page. */
export function flattenThread<T extends CachedMessage = ThreadMessage>(data: ThreadPages<T> | undefined): T[] {
    if (!data) return [];
    return data.pages.slice().reverse().flatMap((p) => p.messages);
}
