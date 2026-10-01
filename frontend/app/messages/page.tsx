'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { keepPreviousData, useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, MessagesSquare, SquarePen } from 'lucide-react';
import { useWebSocket, type WebSocketMessage } from '@/hooks/useWebSocket';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useAuth } from '@/hooks/useAuth';
import { conversationsAPI, getApiErrorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import type { ConversationDetail, ConversationStatus, InboxConversation, ThreadMessage } from '@/types';
import ConversationList, { type StatusFilter } from '@/components/inbox/ConversationList';
import ConversationThread from '@/components/inbox/ConversationThread';
import NewConversationDialog from '@/components/inbox/NewConversationDialog';
import { STATUS_KEYS, isAiPaused, upsertThreadMessage, type ThreadPages } from '@/components/inbox/inbox-utils';

const PAGE_SIZE = 30;

// useSearchParams needs a Suspense boundary or `next build` fails the
// static prerender of this route.
export default function InboxPage() {
    return (
        <Suspense fallback={<div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>}>
            <Inbox />
        </Suspense>
    );
}

function Inbox() {
    // ?client=<id> is the open conversation — deep links (dashboard, client and
    // project pages, the bell), refresh and the phone's back button all work.
    // ?status=awaiting_human pre-filters the list.
    const searchParams = useSearchParams();
    const selectedId = searchParams.get('client');
    const { user } = useAuth();
    const currentUserId = user?.id ?? null;
    const queryClient = useQueryClient();

    const [search, setSearch] = useState('');
    const debouncedSearch = useDebouncedValue(search, 300);
    const [statusFilter, setStatusFilter] = useState<StatusFilter>(() => {
        const s = searchParams.get('status');
        return s && (STATUS_KEYS as string[]).includes(s) ? (s as ConversationStatus) : 'all';
    });
    const [newOpen, setNewOpen] = useState(false);

    /* ── Selection lives in the URL ── */

    const pushedRef = useRef(false);
    useEffect(() => {
        const onPop = () => { pushedRef.current = false; };
        window.addEventListener('popstate', onPop);
        return () => window.removeEventListener('popstate', onPop);
    }, []);

    const select = (clientId: string) => {
        const url = new URL(window.location.href);
        url.searchParams.set('client', clientId);
        if (selectedId) {
            window.history.replaceState(null, '', url);
        } else {
            // list → thread is a step the phone's back button should undo
            window.history.pushState(null, '', url);
            pushedRef.current = true;
        }
    };

    const back = () => {
        if (pushedRef.current) {
            pushedRef.current = false;
            window.history.back();
            return;
        }
        const url = new URL(window.location.href);
        url.searchParams.delete('client');
        window.history.replaceState(null, '', url);
    };

    /* ── Realtime: every event, in order (not just the last one per render) ── */

    const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    useEffect(() => () => { if (refreshTimer.current) clearTimeout(refreshTimer.current); }, []);

    // One AI turn emits several events back to back; refetch the list once.
    const refreshInbox = useCallback(() => {
        if (refreshTimer.current) clearTimeout(refreshTimer.current);
        refreshTimer.current = setTimeout(() => queryClient.invalidateQueries({ queryKey: ['inbox'] }), 300);
    }, [queryClient]);

    const onEvent = useCallback((event: WebSocketMessage) => {
        switch (event.event) {
            case 'message.created':
            case 'message.updated': {
                const message = event.payload?.message as ThreadMessage | undefined;
                if (message?.client_id) {
                    queryClient.setQueryData<ThreadPages>(['thread', message.client_id], (d) => upsertThreadMessage(d, message));
                }
                refreshInbox();
                break;
            }
            case 'conversation.state_changed': {
                const clientId = event.conversation_id;
                const status = event.payload?.status as ConversationStatus | undefined;
                if (clientId && status) {
                    queryClient.setQueryData<ConversationDetail>(['conversation', clientId], (d) =>
                        d ? { ...d, status, ai_paused: isAiPaused(status, event.payload?.updated_by_user_id) } : d);
                }
                refreshInbox();
                // The bell and dashboard read the chat_history-based list.
                queryClient.invalidateQueries({ queryKey: ['conversations'] });
                break;
            }
            default:
                break;
        }
    }, [queryClient, refreshInbox]);

    const { isConnected } = useWebSocket(onEvent);

    /* ── Inbox list ── */

    const inboxQuery = useInfiniteQuery({
        queryKey: ['inbox', debouncedSearch, statusFilter],
        queryFn: async ({ pageParam }) => (await conversationsAPI.list({
            search: debouncedSearch.trim() || undefined,
            status: statusFilter === 'all' ? undefined : statusFilter,
            skip: pageParam,
            limit: PAGE_SIZE,
        })).data,
        initialPageParam: 0,
        getNextPageParam: (last, all) => {
            const loaded = all.reduce((n, p) => n + p.conversations.length, 0);
            return loaded < last.total ? loaded : undefined;
        },
        placeholderData: keepPreviousData,
        refetchInterval: isConnected ? false : 20_000,
    });

    // Live reordering can shift a row across a page boundary between fetches.
    const seen = new Set<string>();
    const conversations: InboxConversation[] = [];
    for (const page of inboxQuery.data?.pages ?? []) {
        for (const c of page.conversations) {
            if (!seen.has(c.client_id)) {
                seen.add(c.client_id);
                conversations.push(c);
            }
        }
    }
    const total = inboxQuery.data?.pages[0]?.total ?? 0;
    const fallbackName = conversations.find((c) => c.client_id === selectedId)?.client_name ?? null;

    return (
        <div className="flex h-[calc(100dvh-5.5rem)] lg:h-[calc(100dvh-7.5rem)] min-h-[440px] rounded-[14px] border border-border bg-card overflow-hidden">
            <aside className={cn(
                'w-full lg:w-[340px] xl:w-[360px] flex-none lg:border-r border-border flex-col min-h-0',
                selectedId ? 'hidden lg:flex' : 'flex',
            )}>
                <ConversationList
                    conversations={conversations}
                    total={total}
                    isPending={inboxQuery.isPending}
                    errorMessage={inboxQuery.isError ? getApiErrorMessage(inboxQuery.error, 'The inbox did not respond.') : null}
                    onRetry={() => inboxQuery.refetch()}
                    hasMore={!!inboxQuery.hasNextPage}
                    loadingMore={inboxQuery.isFetchingNextPage}
                    onLoadMore={() => inboxQuery.fetchNextPage()}
                    selectedId={selectedId}
                    onSelect={select}
                    search={search}
                    searching={search !== debouncedSearch}
                    onSearch={setSearch}
                    statusFilter={statusFilter}
                    onStatusFilter={setStatusFilter}
                    isConnected={isConnected}
                    onNew={() => setNewOpen(true)}
                    currentUserId={currentUserId}
                />
            </aside>

            <section className={cn('flex-1 min-w-0 min-h-0', selectedId ? 'flex' : 'hidden lg:flex')}>
                {selectedId ? (
                    <ConversationThread
                        key={selectedId}
                        clientId={selectedId}
                        fallbackName={fallbackName}
                        currentUserId={currentUserId}
                        isConnected={isConnected}
                        onBack={back}
                    />
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
                        <span className="w-14 h-14 rounded-2xl bg-voxly-surface-2 border border-border flex items-center justify-center mb-4">
                            <MessagesSquare className="w-6 h-6 text-voxly-ink-6" />
                        </span>
                        <h2 className="text-[15px] font-semibold text-foreground mb-1">Pick a conversation</h2>
                        <p className="text-[12.5px] text-voxly-ink-5 max-w-xs mb-4">
                            Client messages from WhatsApp and Telegram arrive here live. Reply in the thread and it goes out on their channel.
                        </p>
                        <Button variant="outline" size="sm" onClick={() => setNewOpen(true)}>
                            <SquarePen className="w-3.5 h-3.5 mr-1.5" />New message
                        </Button>
                    </div>
                )}
            </section>

            <NewConversationDialog open={newOpen} onOpenChange={setNewOpen} onPick={select} />
        </div>
    );
}
