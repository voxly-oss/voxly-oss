'use client';

import { useState, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { useWebSocket } from '@/hooks/useWebSocket';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useToast } from '@/hooks/use-toast';
import { chatAPI } from '@/lib/api';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import {
    MessageSquare, Search, User as UserIcon, ChevronLeft, ChevronRight,
    Sparkles, Plus, AlertTriangle, Loader2, RefreshCw, Code2,
} from 'lucide-react';
import { Panel, PanelRow, PanelText } from '@/components/SidePanel';
import { PreviewMark } from '@/components/PreviewBadge';
import type {
    ChatHistoryResponse, ChatMessage, ConversationStatus,
    ConversationSummary, ConversationsListResponse,
} from '@/types';

const PAGE_SIZE = 20;
const THREAD_LIMIT = 50;

/* ─── Status presentation ───
   The four values below are the backend's own enum
   (backend/app/schemas/conversation.py :: ConversationStatus). `null` means
   no state row exists yet for this client — no message has been processed —
   which is a real, distinct case, not a default we invent. */

const STATUS_STYLE: Record<ConversationStatus, string> = {
    awaiting_human: 'bg-voxly-warning-soft text-voxly-warning',
    ai_handling: 'bg-voxly-violet-soft text-voxly-violet',
    resolved: 'bg-voxly-success-soft text-voxly-success',
    escalated: 'bg-voxly-heat-soft text-voxly-heat',
};
const STATUS_DOT: Record<ConversationStatus, string> = {
    awaiting_human: 'bg-voxly-warning',
    ai_handling: 'bg-voxly-violet',
    resolved: 'bg-voxly-success',
    escalated: 'bg-voxly-heat',
};
const STATUS_LABEL: Record<ConversationStatus, string> = {
    awaiting_human: 'Awaiting human',
    ai_handling: 'AI handling',
    resolved: 'Resolved',
    escalated: 'Escalated',
};

const FILTERS: { key: 'all' | ConversationStatus; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'awaiting_human', label: 'Needs attention' },
    { key: 'ai_handling', label: 'AI handling' },
    { key: 'escalated', label: 'Escalated' },
    { key: 'resolved', label: 'Resolved' },
];

function StatusChip({ status, className = '' }: { status: ConversationStatus | null; className?: string }) {
    if (!status) {
        return (
            <span className={`inline-flex items-center gap-1 text-[10.5px] font-semibold rounded-full pl-1.5 pr-2 py-[2px] whitespace-nowrap flex-none bg-voxly-surface-3 text-voxly-ink-6 ${className}`}>
                <span className="w-[5px] h-[5px] rounded-full bg-voxly-ink-5" />No status yet
            </span>
        );
    }
    return (
        <span className={`inline-flex items-center gap-1 text-[10.5px] font-semibold rounded-full pl-1.5 pr-2 py-[2px] whitespace-nowrap flex-none ${STATUS_STYLE[status]} ${className}`}>
            <span className={`w-[5px] h-[5px] rounded-full ${STATUS_DOT[status]}`} />{STATUS_LABEL[status]}
        </span>
    );
}

/* ─── Helpers ─── */

function formatTimeAgo(dateString: string) {
    const diffMins = Math.floor((Date.now() - new Date(dateString).getTime()) / 60000);
    if (diffMins < 1) return 'now';
    if (diffMins < 60) return `${diffMins}m`;
    const h = Math.floor(diffMins / 60);
    if (h < 24) return `${h}h`;
    return `${Math.floor(h / 24)}d`;
}

function truncate(str: string, len: number) {
    return str.length > len ? str.slice(0, len) + '…' : str;
}

function groupLabel(iso: string) {
    const mins = (Date.now() - new Date(iso).getTime()) / 60000;
    if (mins < 15) return 'JUST NOW';
    if (mins < 24 * 60) return 'EARLIER TODAY';
    if (mins < 48 * 60) return 'YESTERDAY';
    return 'EARLIER';
}

/** Backend stores confidence as a Float that nothing populates today (see
 *  models/chat_history.py) — so this renders the real value when one ever
 *  arrives and an honest em-dash until then. It never invents a number. */
function formatConfidence(confidence: number | null) {
    if (confidence == null) return null;
    const pct = confidence <= 1 ? confidence * 100 : confidence;
    return Math.round(pct);
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
    return (
        <div className="flex flex-col items-center justify-center py-16 text-center px-4">
            <AlertTriangle className="w-8 h-8 text-voxly-heat mb-3" />
            <h3 className="text-sm font-semibold text-foreground mb-1">Couldn&apos;t load conversations</h3>
            <p className="text-xs text-voxly-ink-5 max-w-sm mb-4">{message}</p>
            <Button onClick={onRetry} className="bg-secondary hover:bg-accent text-foreground border border-voxly-ink-4">
                <RefreshCw className="w-3.5 h-3.5 mr-2" />Try again
            </Button>
        </div>
    );
}

/* ─── Page ─── */

export default function ConversationCenterPage() {
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(0);
    const [statusFilter, setStatusFilter] = useState<'all' | ConversationStatus>('all');
    const [selectedClientId, setSelectedClientId] = useState<string | null>(null);

    const debouncedSearch = useDebouncedValue(search, 300);
    const queryClient = useQueryClient();
    const { toast } = useToast();

    // Changing a server-side filter resets pagination, so we never sit on a
    // page index that no longer exists in the newly filtered set. Done in the
    // handlers rather than an effect to avoid a cascading render.
    const handleSearchChange = (value: string) => { setSearch(value); setPage(0); };
    const handleFilterChange = (value: 'all' | ConversationStatus) => { setStatusFilter(value); setPage(0); };

    /* ── Conversation list — grouped, filtered, and paginated by the backend ── */

    const conversationsQuery = useQuery<ConversationsListResponse>({
        queryKey: ['conversations', debouncedSearch, statusFilter, page],
        queryFn: async () => {
            const res = await chatAPI.conversations({
                search: debouncedSearch || undefined,
                status: statusFilter === 'all' ? undefined : statusFilter,
                skip: page * PAGE_SIZE,
                limit: PAGE_SIZE,
            });
            return res.data as ConversationsListResponse;
        },
        placeholderData: keepPreviousData,
    });

    const conversations = conversationsQuery.data?.conversations ?? [];
    const total = conversationsQuery.data?.total ?? 0;
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

    const selected: ConversationSummary | null =
        conversations.find(c => c.client_id === selectedClientId) ?? conversations[0] ?? null;
    const selectedId = selected?.client_id ?? null;

    /* ── Selected conversation thread ── */

    const threadQuery = useQuery<ChatHistoryResponse>({
        queryKey: ['conversation-thread', selectedId],
        queryFn: async () => {
            const res = await chatAPI.clientHistory(selectedId as string, THREAD_LIMIT);
            return res.data as ChatHistoryResponse;
        },
        enabled: !!selectedId,
    });

    const thread: ChatMessage[] = threadQuery.data?.messages ?? [];
    // The thread endpoint is the authoritative read for this conversation's
    // status; the list row is a snapshot from the same source.
    const liveStatus: ConversationStatus | null = threadQuery.data?.status ?? selected?.status ?? null;
    const githubStats = threadQuery.data?.github_stats ?? selected?.github_stats ?? null;

    /* ── Status transitions (Take over / Resolve / Escalate) ── */

    /** Patch a single conversation row across every cached page/filter combo,
     *  so a status change is reflected without waiting for a refetch. */
    const patchConversationInCache = useCallback((clientId: string, status: ConversationStatus) => {
        queryClient.setQueriesData<ConversationsListResponse>(
            { queryKey: ['conversations'] },
            (old) => {
                if (!old) return old;
                if (!old.conversations.some(c => c.client_id === clientId)) return old;
                return {
                    ...old,
                    conversations: old.conversations.map(c =>
                        c.client_id === clientId ? { ...c, status } : c
                    ),
                };
            }
        );
    }, [queryClient]);

    const statusMutation = useMutation({
        mutationFn: ({ clientId, status }: { clientId: string; status: ConversationStatus }) =>
            chatAPI.setConversationStatus(clientId, status),
        onMutate: async ({ clientId, status }) => {
            // Optimistic: reflect the new status immediately in both the list
            // row and the open thread, then reconcile from the server response.
            await queryClient.cancelQueries({ queryKey: ['conversation-thread', clientId] });
            const previousThread = queryClient.getQueryData<ChatHistoryResponse>(['conversation-thread', clientId]);
            if (previousThread) {
                queryClient.setQueryData<ChatHistoryResponse>(['conversation-thread', clientId], {
                    ...previousThread, status,
                });
            }
            patchConversationInCache(clientId, status);
            return { previousThread };
        },
        onError: (err: unknown, variables, context) => {
            if (context?.previousThread) {
                queryClient.setQueryData(['conversation-thread', variables.clientId], context.previousThread);
            }
            queryClient.invalidateQueries({ queryKey: ['conversations'] });
            const detail =
                (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
            toast({
                title: 'Could not update status',
                description: typeof detail === 'string' ? detail : 'Please try again.',
                variant: 'destructive',
            });
        },
        onSuccess: (_data, { status }) => {
            toast({ title: 'Conversation updated', description: `Marked as ${STATUS_LABEL[status].toLowerCase()}.` });
        },
        onSettled: (_data, _err, { clientId }) => {
            queryClient.invalidateQueries({ queryKey: ['conversations'] });
            queryClient.invalidateQueries({ queryKey: ['conversation-thread', clientId] });
        },
    });

    /* ── Realtime ──
       Envelope is {event, timestamp, conversation_id, organization_id, payload}
       (backend/app/websockets/manager.py :: build_event). `conversation_id` is
       the client id. */

    const { lastMessage, isConnected } = useWebSocket();

    useEffect(() => {
        if (!lastMessage) return;
        const conversationId = lastMessage.conversation_id;

        switch (lastMessage.event) {
            case 'conversation.state_changed': {
                const status = lastMessage.payload?.status as ConversationStatus | undefined;
                if (conversationId && status) {
                    patchConversationInCache(conversationId, status);
                    queryClient.setQueryData<ChatHistoryResponse>(
                        ['conversation-thread', conversationId],
                        (old) => (old ? { ...old, status } : old),
                    );
                }
                break;
            }
            case 'conversation.message_received':
            case 'conversation.message_completed': {
                // Both change the list ordering, last message, and count, so the
                // server-grouped list has to be re-fetched rather than patched.
                queryClient.invalidateQueries({ queryKey: ['conversations'] });
                if (conversationId) {
                    queryClient.invalidateQueries({ queryKey: ['conversation-thread', conversationId] });
                }
                break;
            }
            default:
                break;
        }
    }, [lastMessage, queryClient, patchConversationInCache]);

    /* ── Derived view state ── */

    const needsAttention = conversations.filter(c => c.status === 'awaiting_human').slice(0, 2);
    const statusCounts = {
        resolved: conversations.filter(c => c.status === 'resolved').length,
        ai_handling: conversations.filter(c => c.status === 'ai_handling').length,
        awaiting_human: conversations.filter(c => c.status === 'awaiting_human').length,
        escalated: conversations.filter(c => c.status === 'escalated').length,
    };

    const grouped: { label: string; items: ConversationSummary[] }[] = [];
    for (const c of conversations) {
        const label = groupLabel(c.last_message_at);
        const last = grouped[grouped.length - 1];
        if (last && last.label === label) last.items.push(c);
        else grouped.push({ label, items: [c] });
    }

    const isFiltering = !!debouncedSearch || statusFilter !== 'all';
    const selectedConfidence = formatConfidence(selected?.confidence ?? null);
    const isMutatingThis = statusMutation.isPending && statusMutation.variables?.clientId === selectedId;

    return (
        <div className="flex flex-col xl:flex-row gap-6 items-start">
            <div className="flex-1 min-w-0 w-full flex flex-col gap-[18px]">
                <div className="flex items-end justify-between gap-4 flex-wrap">
                    <div>
                        <h1 className="font-display font-bold text-[22px] text-foreground tracking-[-0.01em] flex items-center gap-2">
                            Conversation Center <Sparkles className="w-4 h-4 text-voxly-violet" />
                        </h1>
                        <p className="text-[13px] text-voxly-ink-6 mt-[3px]">
                            {total} conversation{total === 1 ? '' : 's'}
                            {statusCounts.awaiting_human > 0 && ` · ${statusCounts.awaiting_human} need attention`}
                            {isConnected && <span className="text-voxly-success"> · live</span>}
                        </p>
                    </div>
                    <button disabled title="Compose requires selecting a client first" className="bg-primary/60 text-primary-foreground font-semibold text-[13px] rounded-lg px-4 py-[9px] flex items-center gap-[7px] cursor-not-allowed">
                        <Plus className="w-[15px] h-[15px]" /> Compose
                    </button>
                </div>

                {needsAttention.length > 0 && (
                    <div className="rounded-[14px] border border-voxly-violet/30 bg-voxly-violet-soft px-[18px] py-3.5">
                        <div className="font-mono text-[9.5px] font-bold tracking-[0.07em] text-voxly-violet mb-2.5">NEEDS ATTENTION</div>
                        <div className="flex flex-col gap-2.5">
                            {needsAttention.map(c => (
                                <div key={c.client_id} className="flex items-center gap-2.5">
                                    <AlertTriangle className="w-3.5 h-3.5 text-voxly-warning flex-none" />
                                    <span className="flex-1 text-[12.5px] text-foreground/90 leading-relaxed">{c.client_name} — awaiting a human reply</span>
                                    <button onClick={() => setSelectedClientId(c.client_id)} className="font-semibold text-[11px] text-voxly-warning border border-voxly-warning/40 hover:bg-voxly-warning-soft rounded-md px-2.5 py-[3px] flex-none transition-colors">
                                        Review
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Status row — every count below is a real backend status */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
                    <div className="border border-border rounded-xl bg-card px-4 py-3.5">
                        <div className="font-mono text-[9.5px] font-bold uppercase tracking-wider text-voxly-ink-5 mb-2.5">Conversation Status</div>
                        <PanelRow dot={STATUS_DOT.resolved} label="Resolved" value={statusCounts.resolved} />
                        <PanelRow dot={STATUS_DOT.ai_handling} label="AI handling" value={statusCounts.ai_handling} />
                        <PanelRow dot={STATUS_DOT.awaiting_human} label="Awaiting human" value={statusCounts.awaiting_human} />
                        <PanelRow dot={STATUS_DOT.escalated} label="Escalated" value={statusCounts.escalated} />
                    </div>
                    <div className="border border-border rounded-xl bg-card px-4 py-3.5">
                        <div className="font-mono text-[9.5px] font-bold uppercase tracking-wider text-voxly-ink-5 mb-2.5">Volume</div>
                        <PanelRow dot="bg-voxly-violet" label="Conversations" value={total} />
                        <PanelRow dot="bg-voxly-ink-5" label="Messages (this page)" value={conversations.reduce((n, c) => n + c.message_count, 0)} />
                        <PanelRow dot="bg-voxly-ink-5" label="Channels" value={new Set(conversations.map(c => c.channel)).size} />
                    </div>
                    <div className="border border-border rounded-xl bg-card px-4 py-3.5">
                        <div className="font-mono text-[9.5px] font-bold uppercase tracking-wider text-voxly-ink-5 mb-2.5 flex items-center">
                            SLA<PreviewMark />
                        </div>
                        <PanelText>
                            No SLA policy or response-time target is configured on the backend yet, so nothing real can be reported here.
                        </PanelText>
                    </div>
                </div>

                {/* Filter bar — search and status are both applied server-side */}
                <div className="flex items-center gap-2 flex-wrap">
                    <div className="relative flex-1 max-w-[260px] min-w-[160px]">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-voxly-ink-5" />
                        <input
                            placeholder="Search conversations…"
                            value={search}
                            onChange={(e) => handleSearchChange(e.target.value)}
                            className="w-full h-9 pl-8 pr-8 text-[12.5px] bg-card border border-border rounded-lg text-foreground placeholder:text-voxly-ink-5 focus:outline-none focus:border-primary focus:ring-[3px] focus:ring-primary/15 transition-all"
                        />
                        {search !== debouncedSearch && (
                            <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-voxly-ink-5 animate-spin" />
                        )}
                    </div>
                    {FILTERS.map(f => (
                        <button
                            key={f.key}
                            onClick={() => handleFilterChange(f.key)}
                            className={`text-[11.5px] rounded-full px-[11px] py-[5px] transition-colors ${
                                statusFilter === f.key ? 'font-semibold text-primary-foreground bg-primary' : 'text-voxly-ink-6 border border-border hover:border-voxly-ink-4 hover:text-foreground'
                            }`}>
                            {f.label}
                        </button>
                    ))}
                </div>

                {/* Conversation list */}
                <div className="border border-border rounded-[14px] bg-card overflow-hidden">
                    {conversationsQuery.isError ? (
                        <ErrorState
                            message={
                                (conversationsQuery.error as { response?: { data?: { detail?: string } } })
                                    ?.response?.data?.detail ?? 'The conversations service did not respond.'
                            }
                            onRetry={() => conversationsQuery.refetch()}
                        />
                    ) : conversationsQuery.isPending ? (
                        <div className="p-4 space-y-2">
                            {[1, 2, 3, 4, 5].map(k => <div key={k} className="h-12 bg-secondary rounded-lg animate-pulse" />)}
                        </div>
                    ) : conversations.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-16 text-center px-4">
                            <MessageSquare className="w-8 h-8 text-voxly-ink-5 mb-3" />
                            <h3 className="text-sm font-semibold text-foreground mb-1">
                                {isFiltering ? 'No conversations match these filters' : 'No conversations yet'}
                            </h3>
                            <p className="text-xs text-voxly-ink-5 max-w-sm mb-4">
                                {isFiltering
                                    ? 'Try a different search term or clear the status filter.'
                                    : 'Messages from WhatsApp- and Telegram-connected clients will appear here.'}
                            </p>
                            {isFiltering ? (
                                <Button onClick={() => { handleSearchChange(''); handleFilterChange('all'); }} className="bg-secondary hover:bg-accent text-foreground border border-voxly-ink-4">
                                    Clear filters
                                </Button>
                            ) : (
                                <Link href="/clients/new">
                                    <Button className="bg-primary hover:bg-primary/90 text-primary-foreground">
                                        <UserIcon className="w-4 h-4 mr-2" />Add a Client
                                    </Button>
                                </Link>
                            )}
                        </div>
                    ) : (
                        grouped.map(group => (
                            <div key={group.label}>
                                <div className="px-4 py-2 bg-voxly-surface-2 font-mono text-[9.5px] font-bold tracking-[0.07em] text-voxly-ink-5">{group.label}</div>
                                {group.items.map(c => {
                                    const isSelected = selectedId === c.client_id;
                                    return (
                                        <button
                                            key={c.client_id}
                                            onClick={() => setSelectedClientId(c.client_id)}
                                            className={`w-full flex items-center gap-3 px-4 py-[11px] border-b border-border last:border-b-0 text-left transition-colors ${
                                                isSelected ? 'bg-voxly-surface-2' : 'hover:bg-white/[0.02]'
                                            }`}
                                        >
                                            <span className={`w-[3px] self-stretch rounded-sm flex-none ${isSelected ? 'bg-primary' : 'bg-transparent'}`} />
                                            <span className="w-7 h-7 rounded-lg bg-voxly-surface-3 flex items-center justify-center flex-none text-voxly-ink-6">
                                                <MessageSquare className="w-3.5 h-3.5" />
                                            </span>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-[13px] font-semibold text-foreground truncate">{c.client_name}</span>
                                                    <StatusChip status={c.status} />
                                                </div>
                                                <div className="text-xs text-voxly-ink-6 truncate mt-0.5">&quot;{truncate(c.last_message, 60)}&quot;</div>
                                            </div>
                                            <div className="flex-none text-right hidden sm:block">
                                                <div className="text-[10.5px] text-voxly-ink-6 capitalize">{c.channel}</div>
                                                <div className="text-[10.5px] text-voxly-ink-5 mt-0.5">{c.message_count} msg{c.message_count === 1 ? '' : 's'}</div>
                                            </div>
                                            <span className="font-mono text-[11px] text-voxly-ink-5 flex-none w-8 text-right">{formatTimeAgo(c.last_message_at)}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        ))
                    )}
                </div>

                {total > PAGE_SIZE && (
                    <div className="flex items-center justify-between">
                        <span className="text-xs text-voxly-ink-5">
                            Page {page + 1} of {totalPages} · {total} conversation{total === 1 ? '' : 's'}
                            {conversationsQuery.isFetching && ' · updating…'}
                        </span>
                        <div className="flex gap-1.5">
                            <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} className="w-7 h-7 border border-border rounded-[7px] flex items-center justify-center text-voxly-ink-6 disabled:opacity-40 disabled:cursor-not-allowed hover:border-voxly-ink-4 transition-colors">
                                <ChevronLeft className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} className="w-7 h-7 border border-border rounded-[7px] flex items-center justify-center text-voxly-ink-6 disabled:opacity-40 disabled:cursor-not-allowed hover:border-voxly-ink-4 transition-colors">
                                <ChevronRight className="w-3.5 h-3.5" />
                            </button>
                        </div>
                    </div>
                )}

                {/* Selected conversation */}
                {selected && (
                    <>
                        <div className="flex items-center gap-2.5 pt-2 border-t border-border">
                            <span className="font-mono text-[9.5px] font-bold uppercase tracking-wider text-voxly-ink-5">Selected conversation</span>
                        </div>
                        <div className="flex items-start justify-between gap-4 flex-wrap">
                            <div className="flex gap-3 min-w-0">
                                <div className="w-10 h-10 rounded-[11px] bg-voxly-surface-3 flex items-center justify-center flex-none">
                                    <MessageSquare className="w-[18px] h-[18px] text-voxly-ink-6" />
                                </div>
                                <div className="min-w-0">
                                    <div className="flex items-center gap-2.5">
                                        <Link href={`/clients/${selected.client_id}`} className="font-display font-bold text-[22px] text-foreground tracking-[-0.01em] truncate hover:text-primary transition-colors">
                                            {selected.client_name}
                                        </Link>
                                        <StatusChip status={liveStatus} />
                                    </div>
                                    <div className="text-[12.5px] text-voxly-ink-6 mt-1 capitalize">
                                        {selected.channel} · {selected.message_count} message{selected.message_count === 1 ? '' : 's'}
                                        {selectedConfidence != null && <span className="normal-case"> · confidence {selectedConfidence}%</span>}
                                        {selected.sentiment && <span className="normal-case"> · sentiment {selected.sentiment}</span>}
                                    </div>
                                </div>
                            </div>
                            <div className="flex items-center gap-2 flex-none">
                                <button
                                    onClick={() => statusMutation.mutate({ clientId: selected.client_id, status: 'escalated' })}
                                    disabled={isMutatingThis || liveStatus === 'escalated'}
                                    className="font-semibold text-[13px] text-voxly-ink-6 hover:text-foreground border border-border hover:border-voxly-ink-4 rounded-lg px-3.5 py-2 transition-colors whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed">
                                    Escalate
                                </button>
                                <button
                                    onClick={() => statusMutation.mutate({ clientId: selected.client_id, status: 'awaiting_human' })}
                                    disabled={isMutatingThis || liveStatus === 'awaiting_human'}
                                    className="font-semibold text-[13px] text-voxly-ink-6 hover:text-foreground border border-border hover:border-voxly-ink-4 rounded-lg px-3.5 py-2 transition-colors whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed">
                                    Take over
                                </button>
                                <button
                                    onClick={() => statusMutation.mutate({ clientId: selected.client_id, status: 'resolved' })}
                                    disabled={isMutatingThis || liveStatus === 'resolved'}
                                    className="font-semibold text-[13px] bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg px-3.5 py-2 transition-colors whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2">
                                    {isMutatingThis && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                                    Mark resolved
                                </button>
                            </div>
                        </div>

                        {/* Conversation log — full thread from GET /chat/history/{client_id} */}
                        <div className="border border-border rounded-[14px] bg-card overflow-hidden">
                            <div className="px-4 py-2 bg-voxly-surface-2 font-mono text-[9.5px] font-bold tracking-[0.07em] text-voxly-ink-5 flex items-center gap-2">
                                CONVERSATION LOG
                                {threadQuery.isFetching && <Loader2 className="w-3 h-3 animate-spin" />}
                            </div>
                            {threadQuery.isError ? (
                                <ErrorState
                                    message="This conversation's history could not be loaded."
                                    onRetry={() => threadQuery.refetch()}
                                />
                            ) : threadQuery.isPending ? (
                                <div className="p-4 space-y-2">
                                    {[1, 2, 3].map(k => <div key={k} className="h-16 bg-secondary rounded-lg animate-pulse" />)}
                                </div>
                            ) : thread.length === 0 ? (
                                <div className="px-4 py-10 text-center text-xs text-voxly-ink-5">No messages in this conversation yet.</div>
                            ) : (
                                thread.map(m => (
                                    <div key={m.id} className="border-b border-border last:border-b-0">
                                        <div className="flex items-start gap-3 px-4 py-3.5">
                                            <span className="w-7 h-7 rounded-lg bg-voxly-surface-2 flex items-center justify-center flex-none text-voxly-ink-6">
                                                <UserIcon className="w-3.5 h-3.5" />
                                            </span>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <span className="text-[12.5px] font-semibold text-foreground">{m.client_name}</span>
                                                    <span className="text-[10px] text-voxly-ink-5 uppercase tracking-wide">{m.channel}</span>
                                                </div>
                                                <div className="text-[13px] text-foreground/90 mt-1 break-words">&quot;{m.message}&quot;</div>
                                            </div>
                                            <span className="font-mono text-[11px] text-voxly-ink-5 flex-none">{formatTimeAgo(m.created_at)} ago</span>
                                        </div>
                                        {m.ai_response && (
                                            <div className="flex items-start gap-3 px-4 py-3.5 border-t border-border bg-voxly-surface-2/30">
                                                <span className="w-7 h-7 rounded-lg bg-voxly-violet-soft flex items-center justify-center flex-none text-voxly-violet">
                                                    <Sparkles className="w-3.5 h-3.5" />
                                                </span>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <span className="text-[12.5px] font-semibold text-voxly-violet">AI</span>
                                                        {m.model_used && <span className="text-[10px] text-voxly-ink-5 font-mono">{m.model_used}</span>}
                                                    </div>
                                                    <div className="text-[13px] text-foreground/90 mt-1 p-2.5 border border-dashed border-voxly-ink-4 rounded-lg break-words">{m.ai_response}</div>
                                                    <div className="flex items-center gap-3 mt-1.5 text-[10.5px] text-voxly-ink-5 flex-wrap">
                                                        {m.tokens_used > 0 && <span>{m.tokens_used} tokens</span>}
                                                        {m.ai_response_time_ms != null && <span>{m.ai_response_time_ms} ms</span>}
                                                        {m.language && <span>{m.language}</span>}
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                ))
                            )}
                        </div>
                    </>
                )}
            </div>

            {/* Right column */}
            {selected && (
                <div className="w-full xl:w-80 flex-none flex flex-col gap-3.5">
                    <Panel title="Conversation Detail">
                        <PanelRow label="Status" value={liveStatus ? STATUS_LABEL[liveStatus] : 'No status yet'} />
                        <PanelRow label="Channel" value={<span className="capitalize">{selected.channel}</span>} />
                        <PanelRow label="Messages" value={selected.message_count} />
                        <PanelRow label="Last activity" value={`${formatTimeAgo(selected.last_message_at)} ago`} />
                        {threadQuery.data?.status_updated_at && (
                            <PanelRow label="Status changed" value={`${formatTimeAgo(threadQuery.data.status_updated_at)} ago`} />
                        )}
                    </Panel>

                    {/* Real synced GitHub stats for the conversation's project —
                        same github_cache row Projects already reads. Rendered
                        only when the project exists, has a repo, and has synced. */}
                    {githubStats && (
                        <Panel title="Project Signals">
                            <PanelRow
                                label={<span className="flex items-center gap-1.5"><Code2 className="w-3 h-3" />Commits</span>}
                                value={githubStats.commits_count}
                            />
                            <PanelRow label="Last 7 days" value={githubStats.commits_last_7_days} />
                            <PanelRow label="Open issues" value={githubStats.open_issues} />
                            <PanelRow label="Pull requests" value={githubStats.pull_requests} />
                            <PanelRow label="Progress" value={`${githubStats.progress_percent}%`} />
                            {githubStats.synced_at && (
                                <PanelText>Synced {formatTimeAgo(githubStats.synced_at)} ago.</PanelText>
                            )}
                        </Panel>
                    )}

                    <Panel title="Quality Signals" defaultOpen={false}>
                        <PanelRow
                            label={<span className="flex items-center">Confidence<PreviewMark /></span>}
                            value={selectedConfidence != null ? `${selectedConfidence}%` : '—'}
                        />
                        <PanelRow
                            label={<span className="flex items-center">Sentiment<PreviewMark /></span>}
                            value={selected.sentiment ?? '—'}
                        />
                        <PanelText>
                            These columns are stored per message, but no scoring or sentiment model runs in the pipeline yet — so they read as empty rather than guessed.
                        </PanelText>
                    </Panel>

                    <Panel title="Linked Client" defaultOpen={false}>
                        <PanelRow
                            label={selected.client_name}
                            value={<Link href={`/clients/${selected.client_id}`} className="text-primary">View →</Link>}
                        />
                    </Panel>
                </div>
            )}
        </div>
    );
}
