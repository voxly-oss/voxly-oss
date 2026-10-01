'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Loader2, Search, UserPlus } from 'lucide-react';
import { clientsQuery } from '@/lib/queries';
import { cn } from '@/lib/utils';
import {
    Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { avatarTone, initials } from './inbox-utils';

interface NewConversationDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onPick: (clientId: string) => void;
}

/** "New chat": pick a client, land in their thread with the composer ready. */
export default function NewConversationDialog({ open, onOpenChange, onPick }: NewConversationDialogProps) {
    const [filter, setFilter] = useState('');
    const { data: clients = [], isLoading } = useQuery({ ...clientsQuery, enabled: open });

    const needle = filter.trim().toLowerCase();
    const shown = needle
        ? clients.filter((c) => c.name.toLowerCase().includes(needle) || (c.company ?? '').toLowerCase().includes(needle))
        : clients;

    const close = (next: boolean) => {
        if (!next) setFilter('');
        onOpenChange(next);
    };

    return (
        <Dialog open={open} onOpenChange={close}>
            <DialogContent className="sm:max-w-[440px] p-0 gap-0 overflow-hidden">
                <DialogHeader className="px-5 pt-5 pb-3">
                    <DialogTitle>New message</DialogTitle>
                    <DialogDescription>Pick a client — the reply goes out on their WhatsApp or Telegram.</DialogDescription>
                </DialogHeader>
                <div className="px-5 pb-3">
                    <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-voxly-ink-5" />
                        <input
                            autoFocus
                            type="search"
                            aria-label="Search clients"
                            placeholder="Search clients…"
                            value={filter}
                            onChange={(e) => setFilter(e.target.value)}
                            className="w-full h-9 pl-8 pr-3 text-[12.5px] bg-voxly-surface-3/50 border border-border rounded-lg text-foreground placeholder:text-voxly-ink-5 focus:outline-none focus:border-primary focus:ring-[3px] focus:ring-primary/15"
                        />
                    </div>
                </div>
                <div className="max-h-[340px] overflow-y-auto border-t border-border">
                    {isLoading ? (
                        <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-voxly-ink-5" /></div>
                    ) : shown.length === 0 ? (
                        <div className="text-center py-10 px-6">
                            <p className="text-[12.5px] text-voxly-ink-6 mb-3">
                                {clients.length === 0 ? 'You don’t have any clients yet.' : 'No client matches that search.'}
                            </p>
                            {clients.length === 0 && (
                                <Link href="/clients?new=1" className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-primary hover:underline">
                                    <UserPlus className="w-3.5 h-3.5" /> Add a client
                                </Link>
                            )}
                        </div>
                    ) : (
                        <ul>
                            {shown.map((c) => {
                                const channels = [c.phone && 'WhatsApp', c.telegram_chat_id && 'Telegram'].filter(Boolean).join(' · ');
                                return (
                                    <li key={c.id}>
                                        <button
                                            type="button"
                                            onClick={() => { close(false); onPick(c.id); }}
                                            className="w-full flex items-center gap-3 px-5 py-2.5 text-left hover:bg-white/[0.03] focus-visible:outline-none focus-visible:bg-white/[0.05] transition-colors"
                                        >
                                            <span className={cn('w-9 h-9 rounded-full flex items-center justify-center flex-none text-[12px] font-bold', avatarTone(c.id))}>
                                                {initials(c.name)}
                                            </span>
                                            <span className="flex-1 min-w-0">
                                                <span className="block text-[13px] font-semibold text-foreground truncate">{c.name}</span>
                                                <span className="block text-[11.5px] text-voxly-ink-5 truncate">
                                                    {[c.company, channels || 'No messaging channel'].filter(Boolean).join(' · ')}
                                                </span>
                                            </span>
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
