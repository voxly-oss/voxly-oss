import type { ChannelActivity } from '@/types';

/**
 * Shared derivation over the /api/v1/channels aggregate, used by both the
 * Channels page and the dashboard briefing so "quiet" means the same thing in
 * both places.
 *
 * There is no health score or SLA policy on the backend — "quiet" is simply
 * how long it has been since a channel's real `last_activity`.
 */
export const QUIET_AFTER_DAYS = 7;

const MS_PER_DAY = 86_400_000;

/** Days since an ISO timestamp, or null when there has never been activity. */
export function daysSince(iso: string | null): number | null {
    if (!iso) return null;
    return (Date.now() - new Date(iso).getTime()) / MS_PER_DAY;
}

/** A connection with real history that has gone silent for QUIET_AFTER_DAYS+. */
export function isQuietChannel(activity: Pick<ChannelActivity, 'last_activity'>): boolean {
    const days = daysSince(activity.last_activity);
    return days != null && days >= QUIET_AFTER_DAYS;
}

/** Human-readable "time since", or "never" when there is no activity at all. */
export function timeAgo(iso: string | null): string {
    if (!iso) return 'never';
    const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
}
