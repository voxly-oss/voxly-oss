'use client';

import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
    AlertCircle, ArrowDown, Check, Clock3, Download, Loader2, Lock, RefreshCw, RotateCw, SendHorizontal, Sparkles,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { isUnauthorized, portalAPI, portalSocketUrl, type StoredSession } from '@/lib/portal';
import { getApiErrorMessage } from '@/lib/api';
import type { PortalMessage } from '@/types';
import {
    avatarTone, channelLabel, dayLabel, flattenThread, formatClock, initials, sameDay, upsertThreadMessage,
    type ThreadPages,
} from '@/components/inbox/inbox-utils';

const MESSAGE_MAX = 4096;      // the backend's PortalSendIn limit
const RUN_GAP_MS = 5 * 60_000;
const STICK_PX = 96;

type PortalEvent = { event?: string; payload?: { message?: PortalMessage } };

/** Live messages for this client. Reconnects with backoff; the thread polls
 *  while it's down, which is also how a revoked link is noticed. */
function usePortalSocket(token: string, onEvent: (event: PortalEvent) => void) {
    const [connected, setConnected] = useState(false);
    const onEventRef = useRef(onEvent);
    useEffect(() => {
        onEventRef.current = onEvent;
    }, [onEvent]);

    useEffect(() => {
        let socket: WebSocket | null = null;
        let ping: ReturnType<typeof setInterval> | undefined;
        let retry: ReturnType<typeof setTimeout> | undefined;
        let attempt = 0;
        let stopped = false;

        const open = () => {
            socket = new WebSocket(portalSocketUrl(token));
            socket.onopen = () => {
                attempt = 0;
                setConnected(true);
                ping = setInterval(() => {
                    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'ping' }));
                }, 30_000);
            };
            socket.onmessage = (message) => {
                try {
                    const data = JSON.parse(message.data);
                    if (data?.type !== 'pong') onEventRef.current(data);
                } catch {
                    // not ours
                }
            };
            socket.onclose = () => {
                setConnected(false);
                clearInterval(ping);
                if (stopped) return;
                retry = setTimeout(open, Math.min(30_000, 1000 * 2 ** attempt));
                attempt += 1;
            };
        };
        open();
        return () => {
            stopped = true;
            clearTimeout(retry);
            clearInterval(ping);
            socket?.close();
        };
    }, [token]);

    return connected;
}

interface BeforeInstallPromptEvent extends Event {
    prompt: () => Promise<void>;
}

/* ─── Bubble, from the client's side: their messages on the right ─── */

function Bubble({ message: m, label, agencyName, onRetry }: {
    message: PortalMessage;
    label: boolean;
    agencyName: string;
    onRetry: (m: PortalMessage) => void;
}) {
    const mine = m.direction === 'inbound';
    const ai = m.author_type === 'ai';
    const via = m.channel !== 'voxly' ? ` · via ${channelLabel(m.channel)}` : '';

    return (
        <div
            data-testid="portal-message"
            data-mine={mine ? 'true' : 'false'}
            data-status={m.status}
            className={cn('flex flex-col max-w-[min(82%,560px)]', mine ? 'items-end self-end' : 'items-start self-start', label ? 'mt-3' : 'mt-0.5')}
        >
            {label && (
                <span className={cn('text-[11px] font-semibold mb-1 px-1 flex items-center gap-1', mine ? 'text-primary' : ai ? 'text-voxly-violet' : 'text-voxly-ink-6')}>
                    {!mine && ai && <Sparkles className="w-3 h-3" />}
                    {mine ? 'You' : ai ? `${agencyName} · AI assistant` : agencyName}
                    {via && <span className="font-normal text-voxly-ink-5">{via}</span>}
                </span>
            )}
            <div className={cn(
                'rounded-[16px] px-3 py-[7px] text-[14px] leading-relaxed text-foreground whitespace-pre-wrap [overflow-wrap:anywhere] border',
                mine ? 'bg-primary/[0.13] border-primary/25' : ai ? 'bg-voxly-violet-soft border-voxly-violet/20' : 'bg-voxly-surface-3/60 border-border',
                label && (mine ? 'rounded-tr-[4px]' : 'rounded-tl-[4px]'),
                m.status === 'failed' && 'border-voxly-heat/50',
            )}>
                {m.body}
                <span className="float-right ml-3 mt-[7px] -mb-[3px] inline-flex items-center gap-1 text-[10.5px] leading-none text-voxly-ink-5 select-none">
                    {formatClock(m.created_at)}
                    {mine && m.status === 'queued' && <Clock3 className="w-3 h-3" aria-label="Sending" />}
                    {mine && m.status === 'received' && <Check className="w-3.5 h-3.5" aria-label="Sent" />}
                    {mine && m.status === 'failed' && <AlertCircle className="w-3.5 h-3.5 text-voxly-heat" aria-label="Not sent" />}
                </span>
            </div>
            {m.status === 'failed' && (
                <button
                    type="button"
                    onClick={() => onRetry(m)}
                    className="mt-1 px-1 inline-flex items-center gap-1 text-[11.5px] text-voxly-heat hover:text-foreground rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                    Not sent — <RotateCw className="w-3 h-3" /> tap to retry
                </button>
            )}
        </div>
    );
}

/* ─── Chat ─── */

interface PortalChatProps {
    session: StoredSession;
    /** The link was revoked or regenerated (or the session expired). */
    onEnded: () => void;
}

export default function PortalChat({ session, onEnded }: PortalChatProps) {
    const queryClient = useQueryClient();
    const token = session.accessToken;
    const { agency_name: agencyName, client_id: clientId } = session.profile;
    const threadKey = ['portal-thread', clientId];

    const onEvent = useCallback((event: PortalEvent) => {
        const message = event.payload?.message;
        if ((event.event === 'message.created' || event.event === 'message.updated') && message) {
            queryClient.setQueryData<ThreadPages<PortalMessage>>(['portal-thread', clientId], (d) => upsertThreadMessage(d, message));
        }
    }, [queryClient, clientId]);
    const connected = usePortalSocket(token, onEvent);

    const threadQuery = useInfiniteQuery({
        queryKey: threadKey,
        queryFn: async ({ pageParam }) => (await portalAPI.messages(token, pageParam)).data,
        initialPageParam: undefined as string | undefined,
        getNextPageParam: (last) => (last.has_more ? last.messages[0]?.id : undefined),
        refetchInterval: connected ? false : 15_000,
        retry: (count, err) => !isUnauthorized(err) && count < 2,
    });

    useEffect(() => {
        if (isUnauthorized(threadQuery.error)) onEnded();
    }, [threadQuery.error, onEnded]);

    // Typed but not yet acknowledged; kept out of the cache so a refetch never drops them.
    const [pending, setPending] = useState<PortalMessage[]>([]);
    const localSeq = useRef(0);

    const sendMutation = useMutation({
        mutationFn: async ({ text }: { localId: string; text: string }) => (await portalAPI.send(token, text)).data,
        onSuccess: (message, { localId }) => {
            setPending((p) => p.filter((m) => m.id !== localId));
            queryClient.setQueryData<ThreadPages<PortalMessage>>(threadKey, (d) => upsertThreadMessage(d, message));
        },
        onError: (err, { localId }) => {
            if (isUnauthorized(err)) {
                onEnded();
                return;
            }
            setPending((p) => p.map((m) => (m.id === localId ? { ...m, status: 'failed' } : m)));
        },
    });

    const serverMessages = flattenThread(threadQuery.data as ThreadPages<PortalMessage> | undefined);
    const recentMine = new Set(serverMessages.slice(-20).filter((m) => m.direction === 'inbound').map((m) => m.body));
    const messages = [...serverMessages, ...pending.filter((p) => !(p.status === 'queued' && recentMine.has(p.body)))];

    /* ── Scrolling (same rules as the agency inbox) ── */

    const scrollRef = useRef<HTMLDivElement>(null);
    const stickRef = useRef(true);
    const snapRef = useRef<{ firstId: string | null; lastKey: string | null; height: number; top: number }>({
        firstId: null, lastKey: null, height: 0, top: 0,
    });
    const [atBottom, setAtBottom] = useState(true);
    const firstId = messages[0]?.id ?? null;
    const last = messages[messages.length - 1];
    const lastKey = last ? `${last.id}:${last.status}` : null;

    useLayoutEffect(() => {
        const el = scrollRef.current;
        if (!el) return;
        const snap = snapRef.current;
        const sameLast = lastKey?.split(':')[0] === snap.lastKey?.split(':')[0];
        if (lastKey && !snap.lastKey) {
            el.scrollTop = el.scrollHeight;
        } else if (firstId !== snap.firstId && sameLast) {
            el.scrollTop = el.scrollHeight - snap.height + snap.top;
        } else if (lastKey !== snap.lastKey && stickRef.current) {
            el.scrollTop = el.scrollHeight;
        }
        snapRef.current = { firstId, lastKey, height: el.scrollHeight, top: el.scrollTop };
    }, [firstId, lastKey]);

    const onScroll = () => {
        const el = scrollRef.current;
        if (!el) return;
        const bottom = el.scrollHeight - el.scrollTop - el.clientHeight < STICK_PX;
        stickRef.current = bottom;
        snapRef.current.top = el.scrollTop;
        snapRef.current.height = el.scrollHeight;
        if (bottom !== atBottom) setAtBottom(bottom);
    };

    const loadOlder = () => {
        const el = scrollRef.current;
        if (el) {
            snapRef.current.height = el.scrollHeight;
            snapRef.current.top = el.scrollTop;
        }
        threadQuery.fetchNextPage();
    };

    /* ── Composer ── */

    const [text, setText] = useState('');
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const canSend = text.trim().length > 0 && text.length <= MESSAGE_MAX;

    const send = (body: string) => {
        localSeq.current += 1;
        const localId = `local-${Date.now()}-${localSeq.current}`;
        stickRef.current = true;
        setPending((p) => [...p, {
            id: localId, direction: 'inbound', author_type: 'client', channel: 'voxly', body,
            status: 'queued', created_at: new Date().toISOString(),
        }]);
        sendMutation.mutate({ localId, text: body });
    };

    const submit = () => {
        if (!canSend) return;
        send(text.trim());
        setText('');
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
            textareaRef.current.focus();
        }
    };

    const retry = (m: PortalMessage) => {
        setPending((p) => p.filter((x) => x.id !== m.id));
        send(m.body);
    };

    /* ── Install as an app, where the browser offers it ── */

    const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
    useEffect(() => {
        const onPrompt = (event: Event) => {
            event.preventDefault();
            setInstallPrompt(event as BeforeInstallPromptEvent);
        };
        window.addEventListener('beforeinstallprompt', onPrompt);
        return () => window.removeEventListener('beforeinstallprompt', onPrompt);
    }, []);

    return (
        <div className="h-dvh flex flex-col max-w-3xl mx-auto w-full sm:border-x sm:border-border bg-card">
            <header className="flex items-center gap-3 px-4 pt-[max(12px,env(safe-area-inset-top))] pb-3 border-b border-border flex-none">
                <span className={cn('w-10 h-10 rounded-full flex items-center justify-center flex-none text-[13px] font-bold', avatarTone(agencyName))}>
                    {initials(agencyName)}
                </span>
                <div className="min-w-0 flex-1">
                    <h1 className="text-[15px] font-semibold text-foreground truncate" data-testid="portal-agency">{agencyName}</h1>
                    <p className="text-[11.5px] flex items-center gap-1.5 text-voxly-ink-6">
                        <Lock className="w-3 h-3" /> Private chat
                        <span aria-hidden>·</span>
                        <span className={cn('inline-flex items-center gap-1', connected ? 'text-voxly-success' : 'text-voxly-ink-5')} data-testid="portal-live">
                            <span className={cn('w-[6px] h-[6px] rounded-full', connected ? 'bg-voxly-success' : 'bg-voxly-ink-5')} />
                            {connected ? 'Live' : 'Connecting…'}
                        </span>
                    </p>
                </div>
                {installPrompt && (
                    <button
                        type="button"
                        onClick={() => { installPrompt.prompt(); setInstallPrompt(null); }}
                        className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-[12px] font-semibold text-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                        <Download className="w-3.5 h-3.5" /> Install app
                    </button>
                )}
            </header>

            <div className="relative flex-1 min-h-0">
                <div
                    ref={scrollRef}
                    onScroll={onScroll}
                    role="log"
                    aria-live="polite"
                    aria-label={`Chat with ${agencyName}`}
                    className="absolute inset-0 overflow-y-auto px-3 sm:px-5 py-4 flex flex-col"
                >
                    {threadQuery.hasNextPage && (
                        <button
                            type="button"
                            onClick={loadOlder}
                            disabled={threadQuery.isFetchingNextPage}
                            className="self-center mb-2 inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-[11.5px] font-semibold text-voxly-ink-6 hover:text-foreground disabled:opacity-60"
                        >
                            {threadQuery.isFetchingNextPage && <Loader2 className="w-3 h-3 animate-spin" />}
                            Load earlier messages
                        </button>
                    )}

                    {threadQuery.isError && !isUnauthorized(threadQuery.error) ? (
                        <div className="m-auto text-center">
                            <p className="text-xs text-voxly-ink-5 mb-3">{getApiErrorMessage(threadQuery.error, 'Messages could not be loaded.')}</p>
                            <button type="button" onClick={() => threadQuery.refetch()} className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-[12px] font-semibold">
                                <RefreshCw className="w-3.5 h-3.5" /> Try again
                            </button>
                        </div>
                    ) : threadQuery.isPending ? (
                        <div className="m-auto flex flex-col items-center gap-2 text-voxly-ink-5 text-[12.5px]">
                            <Loader2 className="w-5 h-5 animate-spin text-primary" />
                            Opening your chat…
                        </div>
                    ) : messages.length === 0 ? (
                        <div className="m-auto text-center max-w-xs">
                            <span className={cn('w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-3 text-[16px] font-bold', avatarTone(agencyName))}>
                                {initials(agencyName)}
                            </span>
                            <h2 className="text-[15px] font-semibold text-foreground mb-1">Say hello to {agencyName}</h2>
                            <p className="text-[12.5px] text-voxly-ink-5">
                                Ask about your project anytime. {agencyName}&apos;s team — and their AI assistant — reply right here.
                            </p>
                        </div>
                    ) : (
                        <div className="mt-auto flex flex-col">
                            {messages.map((m, i) => {
                                const prev = messages[i - 1];
                                const newDay = !prev || !sameDay(prev.created_at, m.created_at);
                                const gap = prev?.created_at && m.created_at ? Date.parse(m.created_at) - Date.parse(prev.created_at) : 0;
                                const label = !prev || newDay || gap > RUN_GAP_MS || prev.author_type !== m.author_type || prev.channel !== m.channel;
                                return (
                                    <Fragment key={m.id}>
                                        {newDay && (
                                            <div className="self-center my-3 rounded-full bg-voxly-surface-2 border border-border px-3 py-[3px] text-[10.5px] font-semibold text-voxly-ink-6">
                                                {dayLabel(m.created_at)}
                                            </div>
                                        )}
                                        <Bubble message={m} label={label} agencyName={agencyName} onRetry={retry} />
                                    </Fragment>
                                );
                            })}
                        </div>
                    )}
                </div>
                {!atBottom && (
                    <button
                        type="button"
                        onClick={() => { const el = scrollRef.current; if (el) el.scrollTop = el.scrollHeight; }}
                        aria-label="Jump to latest"
                        className="absolute right-4 bottom-4 w-9 h-9 rounded-full bg-voxly-surface-3 border border-border text-foreground shadow-lg flex items-center justify-center"
                    >
                        <ArrowDown className="w-4 h-4" />
                    </button>
                )}
            </div>

            <form
                className="flex items-end gap-2 px-3 pt-2.5 pb-[max(10px,env(safe-area-inset-bottom))] border-t border-border flex-none"
                onSubmit={(e) => { e.preventDefault(); submit(); }}
            >
                <textarea
                    ref={textareaRef}
                    rows={1}
                    value={text}
                    aria-label={`Message ${agencyName}`}
                    placeholder="Message"
                    onChange={(e) => {
                        setText(e.target.value);
                        e.target.style.height = 'auto';
                        e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`;
                    }}
                    onKeyDown={(e) => {
                        // Desktop: Enter sends, Shift+Enter is a new line. On a phone's
                        // keyboard Enter is a new line and the button sends, like WhatsApp.
                        const touch = window.matchMedia('(pointer: coarse)').matches;
                        if (e.key === 'Enter' && !e.shiftKey && !touch && !e.nativeEvent.isComposing) {
                            e.preventDefault();
                            submit();
                        }
                    }}
                    className="flex-1 min-w-0 block resize-none rounded-[20px] border border-border bg-voxly-surface-2 px-4 py-[9px] text-[14px] leading-relaxed text-foreground placeholder:text-voxly-ink-5 focus:outline-none focus:border-primary focus:ring-[3px] focus:ring-primary/15"
                />
                <button
                    type="submit"
                    disabled={!canSend}
                    aria-label="Send message"
                    className="h-10 w-10 flex-none rounded-full bg-primary text-primary-foreground flex items-center justify-center transition-[opacity,transform] hover:opacity-90 active:scale-95 disabled:opacity-35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                    <SendHorizontal className="w-[18px] h-[18px]" />
                </button>
            </form>
        </div>
    );
}
