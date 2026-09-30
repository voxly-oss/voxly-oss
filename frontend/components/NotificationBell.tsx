'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ArrowRight, Bell, CheckCircle2 } from 'lucide-react';
import { chatAPI } from '@/lib/api';
import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { ConversationsListResponse } from '@/types';

function timeAgo(iso: string) {
    const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
    if (m < 1) return 'now';
    if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h`;
    return `${Math.floor(h / 24)}d`;
}

/**
 * Header bell = conversations waiting on a human (backend status
 * `awaiting_human`). Replaces a decorative bell whose unread dot was
 * permanently lit and which did nothing on click. Lives under the
 * ['conversations'] key prefix so the Conversation Center's realtime
 * invalidations refresh it too.
 */
export default function NotificationBell() {
    const { data, isError, isPending } = useQuery({
        queryKey: ['conversations', 'awaiting_human', 'bell'],
        queryFn: async () =>
            (await chatAPI.conversations({ status: 'awaiting_human', limit: 5 })).data as ConversationsListResponse,
        refetchInterval: 60_000,
        staleTime: 30_000,
    });

    const total = data?.total ?? 0;
    const items = data?.conversations ?? [];

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button
                    variant="ghost"
                    size="icon"
                    aria-label={total > 0 ? `Notifications — ${total} conversation${total === 1 ? '' : 's'} need attention` : 'Notifications'}
                    className="relative w-9 h-9 rounded-lg bg-card border border-border hover:bg-accent text-voxly-ink-6 hover:text-foreground"
                >
                    <Bell className="w-4 h-4" />
                    {total > 0 && (
                        <span className="absolute -top-1.5 -right-1.5 min-w-[17px] h-[17px] px-1 rounded-full bg-primary text-primary-foreground text-[9.5px] font-bold leading-[17px] text-center tabular-nums">
                            {total > 9 ? '9+' : total}
                        </span>
                    )}
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-[320px] p-0">
                <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-border">
                    <span className="font-mono text-[10px] font-bold uppercase tracking-[0.07em] text-voxly-ink-5">Needs attention</span>
                    {total > 0 && <span className="text-[11px] font-semibold text-voxly-warning">{total}</span>}
                </div>
                <div className="p-1 max-h-[320px] overflow-y-auto">
                    {isError ? (
                        <div className="flex items-center gap-2 px-2.5 py-4 text-[12.5px] text-voxly-ink-5">
                            <AlertTriangle className="w-4 h-4 text-voxly-heat flex-none" />
                            Couldn’t load notifications.
                        </div>
                    ) : isPending ? (
                        <div className="space-y-1.5 p-1.5">
                            {[1, 2].map((k) => <div key={k} className="h-10 rounded-md bg-secondary animate-pulse" />)}
                        </div>
                    ) : items.length === 0 ? (
                        <div className="flex flex-col items-center gap-1.5 px-3 py-6 text-center">
                            <CheckCircle2 className="w-5 h-5 text-voxly-success" />
                            <span className="text-[13px] font-medium text-foreground">You’re all caught up</span>
                            <span className="text-[11.5px] text-voxly-ink-5">No conversation is waiting on a human.</span>
                        </div>
                    ) : (
                        items.map((c) => (
                            <DropdownMenuItem key={c.client_id} asChild className="items-start gap-2.5 py-2">
                                <Link href={`/messages?client=${c.client_id}`}>
                                    <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-voxly-warning flex-none" />
                                    <span className="flex-1 min-w-0">
                                        <span className="block text-[13px] font-medium text-foreground truncate">{c.client_name}</span>
                                        <span className="block text-[11.5px] text-voxly-ink-5 truncate">&ldquo;{c.last_message}&rdquo;</span>
                                    </span>
                                    <span className="font-mono text-[10.5px] text-voxly-ink-5 flex-none">{timeAgo(c.last_message_at)}</span>
                                </Link>
                            </DropdownMenuItem>
                        ))
                    )}
                </div>
                <DropdownMenuSeparator className="my-0" />
                <div className="p-1">
                    <DropdownMenuItem asChild className="justify-between text-[12.5px] text-voxly-ink-6">
                        <Link href={total > 0 ? '/messages?status=awaiting_human' : '/messages'}>
                            Open Conversation Center
                            <ArrowRight className="w-3.5 h-3.5" />
                        </Link>
                    </DropdownMenuItem>
                </div>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
