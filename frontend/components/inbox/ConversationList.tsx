'use client';

import { AlertCircle, AlertTriangle, Check, Clock3, Loader2, MessageSquare, RefreshCw, Search, SquarePen } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import type { ConversationStatus, InboxConversation, ThreadMessage } from '@/types';
import { STATUS_DOT, STATUS_LABEL, avatarTone, formatListTime, initials } from './inbox-utils';

export type StatusFilter = 'all' | ConversationStatus;

const FILTERS: { key: StatusFilter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'awaiting_human', label: 'Needs attention' },
    { key: 'ai_handling', label: 'AI handling' },
    { key: 'escalated', label: 'Escalated' },
    { key: 'resolved', label: 'Resolved' },
];

function PreviewTick({ status }: { status: ThreadMessage['status'] }) {
    if (status === 'queued') return <Clock3 className="w-3 h-3 flex-none" aria-label="Sending" />;
    if (status === 'failed') return <AlertCircle className="w-3.5 h-3.5 flex-none text-voxly-heat" aria-label="Not delivered" />;
    if (status === 'sent') return <Check className="w-3.5 h-3.5 flex-none" aria-label="Sent" />;
    return null;
}

function previewPrefix(m: ThreadMessage, currentUserId: string | null) {
    if (m.direction !== 'outbound') return '';
    if (m.author_type === 'ai') return 'AI: ';
    return m.author_user_id && m.author_user_id === currentUserId ? 'You: ' : 'Teammate: ';
}

interface ConversationListProps {
    conversations: InboxConversation[];
    total: number;
    isPending: boolean;
    errorMessage: string | null;
    onRetry: () => void;
    hasMore: boolean;
    loadingMore: boolean;
    onLoadMore: () => void;
    selectedId: string | null;
    onSelect: (clientId: string) => void;
    search: string;
    searching: boolean;
    onSearch: (value: string) => void;
    statusFilter: StatusFilter;
    onStatusFilter: (value: StatusFilter) => void;
    isConnected: boolean;
    onNew: () => void;
    currentUserId: string | null;
}

export default function ConversationList({
    conversations, total, isPending, errorMessage, onRetry, hasMore, loadingMore, onLoadMore,
    selectedId, onSelect, search, searching, onSearch, statusFilter, onStatusFilter, isConnected, onNew, currentUserId,
}: ConversationListProps) {
    const isFiltering = !!search.trim() || statusFilter !== 'all';

    return (
        <>
            <div className="px-4 pt-4 pb-3 flex-none border-b border-border">
                <div className="flex items-center justify-between gap-3 mb-3">
                    <div className="min-w-0">
                        <h1 className="font-display font-bold text-[19px] text-foreground tracking-[-0.01em]">Inbox</h1>
                        <p className="text-[11.5px] text-voxly-ink-6 flex items-center gap-1.5" data-testid="inbox-meta">
                            {total} conversation{total === 1 ? '' : 's'}
                            <span aria-hidden>·</span>
                            <span className={cn('inline-flex items-center gap-1', isConnected ? 'text-voxly-success' : 'text-voxly-ink-5')}>
                                <span className={cn('w-[6px] h-[6px] rounded-full', isConnected ? 'bg-voxly-success' : 'bg-voxly-ink-5')} />
                                {isConnected ? 'Live' : 'Reconnecting…'}
                            </span>
                        </p>
                    </div>
                    <Button onClick={onNew} size="sm" className="h-8 px-3 gap-1.5 text-[12.5px] font-semibold">
                        <SquarePen className="w-3.5 h-3.5" /> New message
                    </Button>
                </div>
                <div className="relative mb-2.5">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-voxly-ink-5" />
                    <input
                        type="search"
                        aria-label="Search conversations"
                        placeholder="Search name or message…"
                        value={search}
                        onChange={(e) => onSearch(e.target.value)}
                        className="w-full h-9 pl-8 pr-8 text-[12.5px] bg-voxly-surface-2 border border-border rounded-lg text-foreground placeholder:text-voxly-ink-5 focus:outline-none focus:border-primary focus:ring-[3px] focus:ring-primary/15 transition-all"
                    />
                    {searching && <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-voxly-ink-5 animate-spin" />}
                </div>
                <div className="flex flex-wrap gap-1.5">
                    {FILTERS.map((f) => (
                        <button
                            key={f.key}
                            type="button"
                            onClick={() => onStatusFilter(f.key)}
                            aria-pressed={statusFilter === f.key}
                            className={cn(
                                'text-[11.5px] rounded-full px-[11px] py-[4px] whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                                statusFilter === f.key
                                    ? 'font-semibold text-primary-foreground bg-primary'
                                    : 'text-voxly-ink-6 border border-border hover:border-voxly-ink-4 hover:text-foreground',
                            )}
                        >
                            {f.label}
                        </button>
                    ))}
                </div>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto" data-testid="conversation-list">
                {errorMessage ? (
                    <div className="flex flex-col items-center text-center py-14 px-6">
                        <AlertTriangle className="w-7 h-7 text-voxly-heat mb-3" />
                        <h3 className="text-sm font-semibold text-foreground mb-1">Couldn&apos;t load conversations</h3>
                        <p className="text-xs text-voxly-ink-5 mb-4">{errorMessage}</p>
                        <Button variant="outline" size="sm" onClick={onRetry}><RefreshCw className="w-3.5 h-3.5 mr-1.5" />Try again</Button>
                    </div>
                ) : isPending ? (
                    <div className="p-3 space-y-1.5" aria-hidden>
                        {[1, 2, 3, 4, 5, 6].map((k) => <div key={k} className="h-[62px] bg-secondary rounded-lg animate-pulse" />)}
                    </div>
                ) : conversations.length === 0 ? (
                    <div className="flex flex-col items-center text-center py-14 px-6">
                        <MessageSquare className="w-7 h-7 text-voxly-ink-5 mb-3" />
                        <h3 className="text-sm font-semibold text-foreground mb-1">
                            {isFiltering ? 'No conversations match' : 'No conversations yet'}
                        </h3>
                        <p className="text-xs text-voxly-ink-5 mb-4 max-w-[240px]">
                            {isFiltering
                                ? 'Try a different search or filter.'
                                : 'When a client messages you on WhatsApp or Telegram, the conversation lands here. You can also start one.'}
                        </p>
                        {isFiltering ? (
                            <Button variant="outline" size="sm" onClick={() => { onSearch(''); onStatusFilter('all'); }}>Clear filters</Button>
                        ) : (
                            <Button size="sm" onClick={onNew}><SquarePen className="w-3.5 h-3.5 mr-1.5" />New message</Button>
                        )}
                    </div>
                ) : (
                    <ul>
                        {conversations.map((c) => {
                            const selected = c.client_id === selectedId;
                            const last = c.last_message;
                            return (
                                <li key={c.client_id}>
                                    <button
                                        type="button"
                                        onClick={() => onSelect(c.client_id)}
                                        aria-current={selected ? 'true' : undefined}
                                        data-testid="conversation-row"
                                        className={cn(
                                            'relative w-full flex items-center gap-3 px-4 py-3 text-left border-b border-border transition-colors focus-visible:outline-none focus-visible:bg-voxly-surface-2',
                                            selected ? 'bg-voxly-surface-2' : 'hover:bg-white/[0.025]',
                                        )}
                                    >
                                        {selected && <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r bg-primary" />}
                                        <span className={cn('w-10 h-10 rounded-full flex items-center justify-center flex-none text-[12.5px] font-bold', avatarTone(c.client_id))}>
                                            {initials(c.client_name)}
                                        </span>
                                        <span className="flex-1 min-w-0">
                                            <span className="flex items-baseline gap-2">
                                                <span className="flex-1 min-w-0 truncate text-[13.5px] font-semibold text-foreground">{c.client_name}</span>
                                                <span className={cn('flex-none font-mono text-[10.5px]', c.awaiting_reply ? 'text-primary' : 'text-voxly-ink-5')}>
                                                    {formatListTime(last.created_at)}
                                                </span>
                                            </span>
                                            <span className="flex items-center gap-1.5 mt-[3px]">
                                                <span className={cn(
                                                    'flex-1 min-w-0 flex items-center gap-1 text-[12px] truncate',
                                                    c.awaiting_reply ? 'text-foreground font-medium' : 'text-voxly-ink-6',
                                                )}>
                                                    {last.direction === 'outbound' && <PreviewTick status={last.status} />}
                                                    <span className="truncate">{previewPrefix(last, currentUserId)}{last.body}</span>
                                                </span>
                                                {c.status && c.status !== 'ai_handling' && (
                                                    <span
                                                        title={STATUS_LABEL[c.status]}
                                                        className={cn('flex-none w-[7px] h-[7px] rounded-full', STATUS_DOT[c.status])}
                                                    >
                                                        <span className="sr-only">{STATUS_LABEL[c.status]}</span>
                                                    </span>
                                                )}
                                                {c.awaiting_reply && (
                                                    <span className="flex-none w-[9px] h-[9px] rounded-full bg-primary" title="Waiting for a reply">
                                                        <span className="sr-only">Waiting for a reply</span>
                                                    </span>
                                                )}
                                            </span>
                                        </span>
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                )}
                {hasMore && !errorMessage && (
                    <div className="p-3 flex justify-center">
                        <Button variant="outline" size="sm" onClick={onLoadMore} disabled={loadingMore} className="text-[12px]">
                            {loadingMore && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}Load more
                        </Button>
                    </div>
                )}
            </div>
        </>
    );
}
