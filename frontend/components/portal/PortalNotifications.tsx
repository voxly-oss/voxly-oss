'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Bell, BellOff, BellRing, Loader2, Share, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { portalAPI } from '@/lib/portal';
import {
    needsHomeScreen, pushSupported, syncNotifications, turnOffNotifications, turnOnNotifications,
} from '@/lib/portal-push';

/* "Notify me when they reply" for the client chat: a bell in the header and
   a one-time prompt under it. Hidden entirely while the server has no push
   key, or in a browser that can't do Web Push. */

const PROMPT_KEY = 'voxly_chat_notify_prompt';

type Status = 'checking' | 'off' | 'on' | 'denied' | 'busy';

export interface ChatNotifications {
    /** What this browser can offer: nothing, the Home Screen hint (iPhone/iPad), or the toggle. */
    mode: 'none' | 'home-screen' | 'toggle';
    status: Status;
    failed: boolean;
    promptOpen: boolean;
    enable: () => void;
    disable: () => void;
    showPrompt: () => void;
    dismissPrompt: () => void;
}

const statusFromPermission = (): Status => (Notification.permission === 'denied' ? 'denied' : 'off');

function promptDismissed(): boolean {
    try {
        return window.localStorage.getItem(PROMPT_KEY) === 'dismissed';
    } catch {
        return false;
    }
}

export function useChatNotifications(token: string): ChatNotifications {
    // PortalChat only renders in the browser, so these can read navigator.
    const [supported] = useState(pushSupported);
    const [homeScreen] = useState(needsHomeScreen);
    const configQuery = useQuery({
        queryKey: ['portal-push-config', token],
        queryFn: async () => (await portalAPI.pushConfig(token)).data,
        enabled: supported || homeScreen,
        staleTime: Infinity,
        retry: false,
    });
    const publicKey = configQuery.data?.enabled ? configQuery.data.public_key : null;
    const mode: ChatNotifications['mode'] = !publicKey ? 'none' : homeScreen ? 'home-screen' : supported ? 'toggle' : 'none';

    const [status, setStatus] = useState<Status>('checking');
    const [failed, setFailed] = useState(false);
    const [dismissed, setDismissed] = useState(promptDismissed);

    // Already on for this device? Re-register it, in case the link was
    // regenerated or the server's key replaced since the last visit.
    useEffect(() => {
        if (mode !== 'toggle' || !publicKey) return;
        let live = true;
        syncNotifications(token, publicKey)
            .then((on) => { if (live) setStatus(on ? 'on' : statusFromPermission()); })
            .catch(() => { if (live) setStatus(statusFromPermission()); });
        return () => { live = false; };
    }, [mode, token, publicKey]);

    const dismissPrompt = () => {
        setDismissed(true);
        try {
            window.localStorage.setItem(PROMPT_KEY, 'dismissed');
        } catch {
            // remembered for this visit only
        }
    };

    const enable = () => {
        if (!publicKey) return;
        setStatus('busy');
        setFailed(false);
        // No await before this call: the permission prompt needs the tap.
        turnOnNotifications(token, publicKey)
            .then((permission) => setStatus(permission === 'granted' ? 'on' : permission === 'denied' ? 'denied' : 'off'))
            .catch(() => {
                setFailed(true);
                setStatus(statusFromPermission());
            });
    };

    const disable = () => {
        dismissPrompt(); // they chose this; don't ask again
        setStatus('busy');
        turnOffNotifications(token).catch(() => undefined).finally(() => setStatus('off'));
    };

    const promptOpen = !dismissed && (mode === 'home-screen' || (mode === 'toggle' && ['off', 'busy', 'denied'].includes(status)));

    return { mode, status, failed, promptOpen, enable, disable, showPrompt: () => setDismissed(false), dismissPrompt };
}

/** The header bell. */
export function NotificationToggle({ notifications: n }: { notifications: ChatNotifications }) {
    if (n.mode !== 'toggle' || n.status === 'checking') return null;
    const on = n.status === 'on';
    const denied = n.status === 'denied';
    const label = denied ? 'Notifications are blocked' : on ? 'Turn off notifications' : 'Turn on notifications';
    return (
        <button
            type="button"
            onClick={on ? n.disable : denied ? n.showPrompt : n.enable}
            disabled={n.status === 'busy'}
            aria-label={label}
            aria-pressed={on}
            title={label}
            data-testid="portal-notify-toggle"
            data-state={n.status}
            className={cn(
                'w-9 h-9 flex-none rounded-full border border-border flex items-center justify-center transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60',
                on ? 'text-primary' : 'text-voxly-ink-6 hover:text-foreground',
            )}
        >
            {n.status === 'busy' ? <Loader2 className="w-4 h-4 animate-spin" />
                : on ? <BellRing className="w-4 h-4" />
                    : denied ? <BellOff className="w-4 h-4" />
                        : <Bell className="w-4 h-4" />}
        </button>
    );
}

/** The prompt under the header: ask once, explain a block, or (on iPhone) say how. */
export function NotificationPrompt({ notifications: n, agencyName }: { notifications: ChatNotifications; agencyName: string }) {
    if (!n.promptOpen) return null;
    const busy = n.status === 'busy';
    let message: ReactNode;
    let action: ReactNode = null;
    if (n.mode === 'home-screen') {
        message = (
            <>
                To get notified when {agencyName} replies, add this chat to your Home Screen: tap{' '}
                <Share className="inline w-3.5 h-3.5 -mt-0.5" aria-label="Share" />, then <span className="font-semibold text-foreground">Add to Home Screen</span>.
            </>
        );
    } else if (n.status === 'denied') {
        message = `Notifications are blocked for this site. Allow them in your browser's site settings to hear when ${agencyName} replies.`;
    } else {
        message = n.failed ? 'Couldn’t turn on notifications. Try again.' : `Get a notification when ${agencyName} replies.`;
        action = (
            <button
                type="button"
                onClick={n.enable}
                disabled={busy}
                className="inline-flex items-center gap-1.5 flex-none rounded-full bg-primary text-primary-foreground px-3 py-1.5 text-[12px] font-semibold hover:opacity-90 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
                {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Turn on
            </button>
        );
    }
    return (
        <div
            role="status"
            data-testid="portal-notify-prompt"
            className="flex items-center gap-3 px-4 py-2.5 border-b border-border bg-voxly-surface-2 flex-none"
        >
            <Bell className="w-4 h-4 text-primary flex-none" aria-hidden />
            <p className="flex-1 min-w-0 text-[12.5px] leading-snug text-voxly-ink-6">{message}</p>
            {action}
            <button
                type="button"
                onClick={n.dismissPrompt}
                aria-label="Dismiss"
                className="w-7 h-7 flex-none rounded-full flex items-center justify-center text-voxly-ink-5 hover:text-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
                <X className="w-3.5 h-3.5" />
            </button>
        </div>
    );
}
