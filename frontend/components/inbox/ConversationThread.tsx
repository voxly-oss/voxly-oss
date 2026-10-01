'use client';

import { Fragment, useLayoutEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
    AlertTriangle, ArrowDown, ArrowLeft, Code2, ExternalLink, Loader2, MessageSquare, MoreVertical, RefreshCw,
} from 'lucide-react';
import { chatAPI, conversationsAPI, getApiErrorMessage } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
    DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Panel, PanelRow, PanelText } from '@/components/SidePanel';
import type { ConversationDetail, ConversationStatus, ThreadMessage } from '@/types';
import MessageBubble from './MessageBubble';
import Composer from './Composer';
import {
    STATUS_DOT, STATUS_LABEL, avatarTone, channelLabel, dayLabel, flattenThread, formatListTime, initials,
    isAiPaused, sameDay, upsertThreadMessage, type ThreadPages,
} from './inbox-utils';

const PAGE_SIZE = 50;
const RUN_GAP_MS = 5 * 60_000;   // a new author label after 5 quiet minutes
const STICK_PX = 96;             // "at the bottom" tolerance for auto-scroll

const STATUS_TOAST: Record<ConversationStatus, string> = {
    awaiting_human: 'You took over — the AI is paused',
    ai_handling: 'Handed back to the AI',
    escalated: 'Conversation escalated',
    resolved: 'Marked resolved',
};

interface ConversationThreadProps {
    clientId: string;
    /** From the inbox row, so the header has a name before the detail loads. */
    fallbackName: string | null;
    currentUserId: string | null;
    isConnected: boolean;
    onBack: () => void;
}

export default function ConversationThread({ clientId, fallbackName, currentUserId, isConnected, onBack }: ConversationThreadProps) {
    const queryClient = useQueryClient();
    const { toast } = useToast();
    const threadKey = ['thread', clientId];
    const detailKey = ['conversation', clientId];

    /* ── Data ── */

    const detailQuery = useQuery({
        queryKey: detailKey,
        queryFn: async () => (await conversationsAPI.get(clientId)).data,
        // Live updates come over the socket; poll only while it's down.
        refetchInterval: isConnected ? false : 20_000,
    });
    const detail = detailQuery.data;

    const threadQuery = useInfiniteQuery({
        queryKey: threadKey,
        queryFn: async ({ pageParam }) => (await conversationsAPI.messages(clientId, { before: pageParam, limit: PAGE_SIZE })).data,
        initialPageParam: undefined as string | undefined,
        getNextPageParam: (last) => (last.has_more ? last.messages[0]?.id : undefined),
        refetchInterval: isConnected ? false : 15_000,
    });

    // Sent from here but not yet acknowledged by the server. Kept out of the
    // query cache so a refetch can never drop a message the user just typed.
    const [pending, setPending] = useState<ThreadMessage[]>([]);
    const [retrying, setRetrying] = useState<string[]>([]);
    const localSeq = useRef(0);

    const serverMessages = flattenThread(threadQuery.data as ThreadPages | undefined);
    // The socket can deliver the real message a beat before the POST returns;
    // don't show both copies in that gap.
    const recentMine = new Set(
        serverMessages.slice(-20).filter((m) => m.author_type === 'agent' && m.author_user_id === currentUserId).map((m) => m.body),
    );
    const messages = [...serverMessages, ...pending.filter((p) => !(p.status === 'queued' && recentMine.has(p.body)))];

    /* ── Mutations ── */

    const sendMutation = useMutation({
        mutationFn: async ({ text, channel }: { localId: string; text: string; channel: string }) =>
            (await conversationsAPI.send(clientId, { text, channel })).data,
        onSuccess: (message, { localId }) => {
            setPending((p) => p.filter((m) => m.id !== localId));
            if (queryClient.getQueryData(threadKey)) {
                queryClient.setQueryData<ThreadPages>(threadKey, (d) => upsertThreadMessage(d, message));
            } else {
                queryClient.invalidateQueries({ queryKey: threadKey });
            }
        },
        onError: (err, { localId }) => {
            setPending((p) => p.map((m) => (m.id === localId
                ? { ...m, status: 'failed', error: getApiErrorMessage(err, 'Could not reach the server') }
                : m)));
        },
        onSettled: () => {
            // Sending claims the conversation (AI paused) — reflect it even without a socket.
            queryClient.invalidateQueries({ queryKey: detailKey });
            queryClient.invalidateQueries({ queryKey: ['inbox'] });
        },
    });

    const retryMutation = useMutation({
        mutationFn: async (m: ThreadMessage) => (await conversationsAPI.retry(clientId, m.id)).data,
        onMutate: (m) => setRetrying((ids) => [...ids, m.id]),
        onSuccess: (message) => queryClient.setQueryData<ThreadPages>(threadKey, (d) => upsertThreadMessage(d, message, true)),
        onError: (err) => toast({ variant: 'destructive', title: 'Retry failed', description: getApiErrorMessage(err, 'Please try again.') }),
        onSettled: (_data, _err, m) => {
            setRetrying((ids) => ids.filter((id) => id !== m.id));
            queryClient.invalidateQueries({ queryKey: ['inbox'] });
        },
    });

    const statusMutation = useMutation({
        mutationFn: (status: ConversationStatus) => chatAPI.setConversationStatus(clientId, status),
        onMutate: async (status) => {
            await queryClient.cancelQueries({ queryKey: detailKey });
            const previous = queryClient.getQueryData<ConversationDetail>(detailKey);
            queryClient.setQueryData<ConversationDetail>(detailKey, (d) =>
                d ? { ...d, status, ai_paused: isAiPaused(status, currentUserId) } : d);
            return { previous };
        },
        onError: (err, _status, context) => {
            if (context?.previous) queryClient.setQueryData(detailKey, context.previous);
            toast({ variant: 'destructive', title: 'Could not update the conversation', description: getApiErrorMessage(err, 'Please try again.') });
        },
        onSuccess: (_data, status) => toast({ title: STATUS_TOAST[status] }),
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: detailKey });
            queryClient.invalidateQueries({ queryKey: ['inbox'] });
            queryClient.invalidateQueries({ queryKey: ['conversations'] });
        },
    });

    /* ── Scrolling: open at the latest message, stay pinned while the user is
       at the bottom, keep their place when older messages load above. ── */

    const scrollRef = useRef<HTMLDivElement>(null);
    const stickRef = useRef(true);
    const snapRef = useRef<{ firstId: string | null; lastKey: string | null; height: number; top: number }>({
        firstId: null, lastKey: null, height: 0, top: 0,
    });
    const [atBottom, setAtBottom] = useState(true);
    const [leftAtKey, setLeftAtKey] = useState<string | null>(null);

    const first = messages[0];
    const last = messages[messages.length - 1];
    const firstId = first?.id ?? null;
    const lastKey = last ? `${last.id}:${last.status}` : null;

    useLayoutEffect(() => {
        const el = scrollRef.current;
        if (!el) return;
        const snap = snapRef.current;
        const lastId = lastKey?.split(':')[0] ?? null;
        const prevLastId = snap.lastKey?.split(':')[0] ?? null;
        if (lastKey && !snap.lastKey) {
            el.scrollTop = el.scrollHeight;
        } else if (firstId !== snap.firstId && lastId === prevLastId) {
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
        if (bottom !== atBottom) {
            setAtBottom(bottom);
            setLeftAtKey(bottom ? null : lastKey);
        }
    };

    const jumpToLatest = () => {
        const el = scrollRef.current;
        if (el) el.scrollTop = el.scrollHeight;
    };

    const loadOlder = () => {
        const el = scrollRef.current;
        if (el) {
            snapRef.current.height = el.scrollHeight;
            snapRef.current.top = el.scrollTop;
        }
        threadQuery.fetchNextPage();
    };

    /* ── Actions ── */

    const handleSend = (text: string, channel: string) => {
        localSeq.current += 1;
        const localId = `local-${Date.now()}-${localSeq.current}`;
        stickRef.current = true;
        setPending((p) => [...p, {
            id: localId, client_id: clientId, project_id: null, channel, direction: 'outbound', author_type: 'agent',
            author_user_id: currentUserId, body: text, status: 'queued', error: null, reply_to_id: null,
            model_used: null, created_at: new Date().toISOString(),
        }]);
        sendMutation.mutate({ localId, text, channel });
    };

    const handleRetry = (m: ThreadMessage) => {
        if (m.id.startsWith('local-')) {
            // Never reached the server — send it again as a fresh message.
            setPending((p) => p.filter((x) => x.id !== m.id));
            handleSend(m.body, m.channel);
            return;
        }
        retryMutation.mutate(m);
    };

    /* ── View ── */

    const name = detail?.client_name ?? fallbackName ?? (detailQuery.isPending ? 'Loading…' : 'Conversation');
    const status = detail?.status ?? null;
    const aiPaused = detail?.ai_paused ?? false;
    const busy = statusMutation.isPending;
    const notFound = detailQuery.isError;

    const authorLabel = (m: ThreadMessage) => {
        if (m.author_type === 'ai') return 'AI';
        if (m.author_type === 'agent') return m.author_user_id && m.author_user_id === currentUserId ? 'You' : 'Teammate';
        return name;
    };

    return (
        <div className="flex-1 min-h-0 min-w-0 flex">
            <div className="flex-1 min-w-0 flex flex-col">
                {/* Header */}
                <header className="flex items-center gap-3 px-3 sm:px-4 h-[60px] flex-none border-b border-border">
                    <button
                        type="button"
                        onClick={onBack}
                        aria-label="Back to conversations"
                        className="lg:hidden -ml-1 p-1.5 rounded-lg text-voxly-ink-6 hover:text-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                        <ArrowLeft className="w-[18px] h-[18px]" />
                    </button>
                    <span className={cn('w-9 h-9 rounded-full flex items-center justify-center flex-none text-[12px] font-bold', avatarTone(clientId))}>
                        {initials(name)}
                    </span>
                    <div className="min-w-0 flex-1">
                        <Link href={`/clients/${clientId}`} className="block text-[14px] font-semibold text-foreground truncate hover:text-primary transition-colors" data-testid="thread-title">
                            {name}
                        </Link>
                        <div className="text-[11.5px] text-voxly-ink-6 flex items-center gap-1.5 min-w-0">
                            {detail && detail.channels.length > 0 && (
                                <span className="truncate">{detail.channels.map(channelLabel).join(' · ')}</span>
                            )}
                            {detail && detail.channels.length > 0 && <span aria-hidden>·</span>}
                            <span className={cn('w-[6px] h-[6px] rounded-full flex-none', status ? STATUS_DOT[status] : 'bg-voxly-ink-5')} />
                            <span className="truncate" data-testid="thread-status">{status ? STATUS_LABEL[status] : 'No status yet'}</span>
                        </div>
                    </div>
                    {/* On a phone this lives in the ⋮ menu (and the composer banner) to keep the name readable. */}
                    {detail && (
                        <Button
                            variant="outline"
                            size="sm"
                            disabled={busy}
                            onClick={() => statusMutation.mutate(aiPaused ? 'ai_handling' : 'awaiting_human')}
                            className="hidden sm:inline-flex text-[12.5px] font-semibold h-8 px-3"
                        >
                            {aiPaused ? 'Hand back to AI' : 'Take over'}
                        </Button>
                    )}
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <button
                                type="button"
                                aria-label="Conversation actions"
                                className="p-1.5 rounded-lg text-voxly-ink-6 hover:text-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            >
                                <MoreVertical className="w-[18px] h-[18px]" />
                            </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-52">
                            {detail && (
                                <DropdownMenuItem
                                    disabled={busy}
                                    onSelect={() => statusMutation.mutate(aiPaused ? 'ai_handling' : 'awaiting_human')}
                                    className="sm:hidden"
                                >
                                    {aiPaused ? 'Hand back to AI' : 'Take over'}
                                </DropdownMenuItem>
                            )}
                            <DropdownMenuItem disabled={busy || status === 'escalated'} onSelect={() => statusMutation.mutate('escalated')}>
                                Escalate
                            </DropdownMenuItem>
                            <DropdownMenuItem disabled={busy || status === 'resolved'} onSelect={() => statusMutation.mutate('resolved')}>
                                Mark resolved
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem asChild>
                                <Link href={`/clients/${clientId}`}>View client profile</Link>
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </header>

                {notFound ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
                        <AlertTriangle className="w-8 h-8 text-voxly-heat mb-3" />
                        <h3 className="text-sm font-semibold text-foreground mb-1">This conversation isn&apos;t available</h3>
                        <p className="text-xs text-voxly-ink-5 max-w-xs mb-4">
                            {getApiErrorMessage(detailQuery.error, 'The client may have been deleted.')}
                        </p>
                        <Button variant="outline" onClick={onBack}>Back to conversations</Button>
                    </div>
                ) : (
                    <>
                        {/* Thread */}
                        <div className="relative flex-1 min-h-0">
                            <div
                                ref={scrollRef}
                                onScroll={onScroll}
                                role="log"
                                aria-live="polite"
                                aria-label={`Conversation with ${name}`}
                                className="absolute inset-0 overflow-y-auto px-3 sm:px-5 py-4 flex flex-col"
                            >
                                {threadQuery.hasNextPage && (
                                    <button
                                        type="button"
                                        onClick={loadOlder}
                                        disabled={threadQuery.isFetchingNextPage}
                                        className="self-center mb-2 inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-[11.5px] font-semibold text-voxly-ink-6 hover:text-foreground hover:border-voxly-ink-4 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                    >
                                        {threadQuery.isFetchingNextPage && <Loader2 className="w-3 h-3 animate-spin" />}
                                        Load earlier messages
                                    </button>
                                )}

                                {threadQuery.isError ? (
                                    <div className="m-auto text-center">
                                        <p className="text-xs text-voxly-ink-5 mb-3">
                                            {getApiErrorMessage(threadQuery.error, 'Messages could not be loaded.')}
                                        </p>
                                        <Button variant="outline" size="sm" onClick={() => threadQuery.refetch()}>
                                            <RefreshCw className="w-3.5 h-3.5 mr-1.5" />Try again
                                        </Button>
                                    </div>
                                ) : threadQuery.isPending ? (
                                    <div className="flex flex-col gap-3 mt-auto" aria-hidden>
                                        {[60, 44, 72, 38].map((w, i) => (
                                            <div key={i} className={cn('h-10 rounded-[14px] bg-secondary animate-pulse', i % 2 ? 'self-end' : 'self-start')} style={{ width: `${w}%` }} />
                                        ))}
                                    </div>
                                ) : messages.length === 0 ? (
                                    <div className="m-auto text-center max-w-xs">
                                        <MessageSquare className="w-8 h-8 text-voxly-ink-5 mx-auto mb-3" />
                                        <h3 className="text-sm font-semibold text-foreground mb-1">No messages yet</h3>
                                        <p className="text-xs text-voxly-ink-5">
                                            {detail?.channels.length
                                                ? `Say hello — your message goes out on ${channelLabel(detail.default_channel ?? detail.channels[0])}.`
                                                : 'When this client writes in, the conversation shows up here.'}
                                        </p>
                                    </div>
                                ) : (
                                    <div className="mt-auto flex flex-col">
                                        {messages.map((m, i) => {
                                            const prev = messages[i - 1];
                                            const newDay = !prev || !sameDay(prev.created_at, m.created_at);
                                            const channelHop = !!prev && prev.channel !== m.channel;
                                            const gap = prev?.created_at && m.created_at
                                                ? Date.parse(m.created_at) - Date.parse(prev.created_at) : 0;
                                            const startsRun = !prev || newDay || channelHop || gap > RUN_GAP_MS
                                                || prev.author_type !== m.author_type || prev.author_user_id !== m.author_user_id;
                                            return (
                                                <Fragment key={m.id}>
                                                    {newDay && (
                                                        <div className="self-center my-3 rounded-full bg-voxly-surface-2 border border-border px-3 py-[3px] text-[10.5px] font-semibold text-voxly-ink-6">
                                                            {dayLabel(m.created_at)}
                                                        </div>
                                                    )}
                                                    <MessageBubble
                                                        message={m}
                                                        authorLabel={startsRun ? authorLabel(m) : null}
                                                        showChannel={channelHop}
                                                        retrying={retrying.includes(m.id)}
                                                        onRetry={handleRetry}
                                                    />
                                                </Fragment>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>

                            {!atBottom && (
                                <button
                                    type="button"
                                    onClick={jumpToLatest}
                                    aria-label={leftAtKey !== lastKey ? 'New messages — jump to latest' : 'Jump to latest'}
                                    className="absolute right-4 bottom-4 w-9 h-9 rounded-full bg-voxly-surface-3 border border-border text-foreground shadow-lg flex items-center justify-center hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                >
                                    <ArrowDown className="w-4 h-4" />
                                    {leftAtKey !== lastKey && <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-primary border-2 border-card" />}
                                </button>
                            )}
                        </div>

                        {detail && (
                            <Composer
                                clientId={clientId}
                                clientName={detail.client_name}
                                channels={detail.channels}
                                defaultChannel={detail.default_channel}
                                aiPaused={aiPaused}
                                handingBack={busy}
                                onSend={handleSend}
                                onHandBack={() => statusMutation.mutate('ai_handling')}
                            />
                        )}
                    </>
                )}
            </div>

            {/* Details — the third pane, only where there's room for it. */}
            {detail && (
                <aside className="hidden 2xl:flex w-[300px] flex-none border-l border-border flex-col gap-3.5 p-4 overflow-y-auto">
                    <Panel title="Conversation">
                        <PanelRow label="Status" value={status ? STATUS_LABEL[status] : 'No status yet'} />
                        {detail.status_updated_at && <PanelRow label="Status changed" value={formatListTime(detail.status_updated_at)} />}
                        <PanelRow label="Replies by" value={aiPaused ? 'Your team' : 'AI'} />
                        <PanelRow label="Channels" value={detail.channels.length ? detail.channels.map(channelLabel).join(', ') : '—'} />
                    </Panel>
                    {detail.github_stats && (
                        <Panel title="Project Signals">
                            <PanelRow label={<span className="flex items-center gap-1.5"><Code2 className="w-3 h-3" />Commits</span>} value={detail.github_stats.commits_count} />
                            <PanelRow label="Last 7 days" value={detail.github_stats.commits_last_7_days} />
                            <PanelRow label="Open issues" value={detail.github_stats.open_issues} />
                            <PanelRow label="Progress" value={`${detail.github_stats.progress_percent}%`} />
                            {detail.github_stats.synced_at && <PanelText>Synced {formatListTime(detail.github_stats.synced_at)}.</PanelText>}
                        </Panel>
                    )}
                    <Link href={`/clients/${clientId}`} className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-primary hover:underline px-1">
                        Open client profile <ExternalLink className="w-3 h-3" />
                    </Link>
                </aside>
            )}
        </div>
    );
}
