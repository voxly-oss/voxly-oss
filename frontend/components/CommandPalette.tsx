'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
    FolderGit2,
    LayoutDashboard,
    MessageSquare,
    Plus,
    Radio,
    Search,
    Settings,
    Sparkles,
    Users,
    type LucideIcon,
} from 'lucide-react';
import { clientsAPI, projectsAPI } from '@/lib/api';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import type { Client, Project } from '@/types';

interface Command {
    id: string;
    group: 'Actions' | 'Pages' | 'Clients' | 'Projects';
    label: string;
    hint?: string;
    href: string;
    icon: LucideIcon;
    /** Extra text matched by the query but not shown. */
    keywords?: string;
}

const STATIC_COMMANDS: Command[] = [
    { id: 'new-client', group: 'Actions', label: 'Add a client', href: '/clients/new', icon: Plus, keywords: 'new create' },
    { id: 'ask-ai', group: 'Actions', label: 'Ask the Voxly AI assistant', href: '/chat', icon: Sparkles, keywords: 'chat agent question' },
    { id: 'needs-attention', group: 'Actions', label: 'Conversations that need a human', href: '/messages?status=awaiting_human', icon: MessageSquare, keywords: 'awaiting attention inbox' },
    { id: 'p-dashboard', group: 'Pages', label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, keywords: 'home overview' },
    { id: 'p-clients', group: 'Pages', label: 'Clients', href: '/clients', icon: Users },
    { id: 'p-projects', group: 'Pages', label: 'Projects', href: '/projects', icon: FolderGit2 },
    { id: 'p-messages', group: 'Pages', label: 'Conversations', href: '/messages', icon: MessageSquare, keywords: 'messages inbox whatsapp telegram' },
    { id: 'p-channels', group: 'Pages', label: 'Channels', href: '/channels', icon: Radio, keywords: 'whatsapp telegram connect' },
    { id: 's-general', group: 'Pages', label: 'Settings — General', href: '/settings/general', icon: Settings, keywords: 'profile account' },
    { id: 's-security', group: 'Pages', label: 'Settings — Security', href: '/settings/security', icon: Settings, keywords: 'password' },
    { id: 's-ai', group: 'Pages', label: 'Settings — AI defaults', href: '/settings/ai-defaults', icon: Settings, keywords: 'openai anthropic gemini groq key byok model' },
    { id: 's-api', group: 'Pages', label: 'Settings — API keys', href: '/settings/api-keys', icon: Settings, keywords: 'token integration' },
    { id: 's-billing', group: 'Pages', label: 'Settings — Billing', href: '/settings/billing', icon: Settings, keywords: 'plan subscription invoice upgrade' },
];

const MAX_PER_GROUP = 6;
const GROUP_ORDER: Command['group'][] = ['Actions', 'Clients', 'Projects', 'Pages'];

function matches(cmd: Command, q: string) {
    return `${cmd.label} ${cmd.hint ?? ''} ${cmd.keywords ?? ''}`.toLowerCase().includes(q);
}

/**
 * ⌘K palette — Design Language "Command palette". Jumps to any client,
 * project, page or common action. Searches the clients/projects React Query
 * cache the list pages already populate (same keys), so it's instant after
 * the first open and never invents results.
 */
export default function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
    const router = useRouter();
    const [query, setQuery] = useState('');
    const [activeIndex, setActiveIndex] = useState(0);

    const { data: clients = [] } = useQuery({
        queryKey: ['clients'],
        queryFn: async () => (await clientsAPI.list()).data as Client[],
        enabled: open,
        staleTime: 30_000,
    });
    const { data: projects = [] } = useQuery({
        queryKey: ['projects'],
        queryFn: async () => (await projectsAPI.list()).data as Project[],
        enabled: open,
        staleTime: 30_000,
    });

    const results = useMemo(() => {
        const q = query.trim().toLowerCase();
        const clientName = new Map(clients.map((c) => [c.id, c.name]));
        const dynamic: Command[] = [
            ...clients.map((c): Command => ({
                id: `c-${c.id}`,
                group: 'Clients',
                label: c.name,
                hint: c.company ?? undefined,
                href: `/clients/${c.id}`,
                icon: Users,
                keywords: `${c.email ?? ''} ${c.phone}`,
            })),
            ...projects.map((p): Command => ({
                id: `pr-${p.id}`,
                group: 'Projects',
                label: p.name,
                hint: clientName.get(p.client_id) ?? p.github_repo ?? undefined,
                href: `/clients/${p.client_id}/projects/${p.id}/milestones`,
                icon: FolderGit2,
                keywords: p.github_repo ?? '',
            })),
        ];
        // Empty query: common actions + pages. Typing: everything that matches.
        const pool = q ? [...STATIC_COMMANDS, ...dynamic] : STATIC_COMMANDS;
        const filtered = q ? pool.filter((cmd) => matches(cmd, q)) : pool;
        return GROUP_ORDER.flatMap((group) => filtered.filter((c) => c.group === group).slice(0, MAX_PER_GROUP));
    }, [query, clients, projects]);

    const active = Math.min(activeIndex, Math.max(results.length - 1, 0));

    const close = (next: boolean) => {
        if (!next) {
            setQuery('');
            setActiveIndex(0);
        }
        onOpenChange(next);
    };

    const run = (cmd: Command | undefined) => {
        if (!cmd) return;
        close(false);
        router.push(cmd.href);
    };

    const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActiveIndex(results.length ? (active + 1) % results.length : 0);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActiveIndex(results.length ? (active - 1 + results.length) % results.length : 0);
        } else if (e.key === 'Enter') {
            e.preventDefault();
            run(results[active]);
        }
    };

    return (
        <Dialog open={open} onOpenChange={close}>
            <DialogContent
                showCloseButton={false}
                className="top-[12vh] translate-y-0 max-w-[560px] gap-0 p-0 overflow-hidden"
            >
                <DialogTitle className="sr-only">Search Voxly</DialogTitle>
                <DialogDescription className="sr-only">Jump to a client, project, page or action. Use the arrow keys and Enter.</DialogDescription>
                <div className="flex items-center gap-2.5 px-4 py-3.5 border-b border-border">
                    <Search className="w-4 h-4 text-voxly-ink-5 flex-none" aria-hidden="true" />
                    <input
                        autoFocus
                        value={query}
                        onChange={(e) => { setQuery(e.target.value); setActiveIndex(0); }}
                        onKeyDown={onKeyDown}
                        placeholder="Go to a client, project or page…"
                        role="combobox"
                        aria-expanded="true"
                        aria-controls="command-palette-list"
                        aria-activedescendant={results[active] ? `cmd-${results[active].id}` : undefined}
                        aria-autocomplete="list"
                        className="flex-1 min-w-0 bg-transparent text-[14px] text-foreground placeholder:text-voxly-ink-5 outline-none"
                    />
                    <kbd className="font-mono text-[10px] text-voxly-ink-5 border border-border rounded px-1.5 py-0.5 flex-none">Esc</kbd>
                </div>
                <div id="command-palette-list" role="listbox" aria-label="Results" className="max-h-[min(60vh,420px)] overflow-y-auto p-1.5">
                    {results.length === 0 ? (
                        <div className="px-3 py-8 text-center text-[13px] text-voxly-ink-5">
                            No matches for &ldquo;{query}&rdquo;
                        </div>
                    ) : (
                        results.map((cmd, i) => {
                            const showHeader = i === 0 || results[i - 1].group !== cmd.group;
                            const Icon = cmd.icon;
                            return (
                                <div key={cmd.id}>
                                    {showHeader && (
                                        <div className="px-2.5 pt-2.5 pb-1 font-mono text-[9.5px] font-bold uppercase tracking-[0.07em] text-voxly-ink-5" aria-hidden="true">
                                            {cmd.group}
                                        </div>
                                    )}
                                    <div
                                        id={`cmd-${cmd.id}`}
                                        role="option"
                                        aria-selected={i === active}
                                        onMouseMove={() => { if (i !== active) setActiveIndex(i); }}
                                        onClick={() => run(cmd)}
                                        className={cn(
                                            'flex items-center gap-2.5 px-2.5 py-[9px] rounded-lg cursor-pointer',
                                            i === active ? 'bg-voxly-surface-3 text-foreground' : 'text-voxly-ink-6',
                                        )}
                                    >
                                        <Icon className="w-[15px] h-[15px] flex-none text-voxly-ink-5" aria-hidden="true" />
                                        <span className="text-[13px] truncate">{cmd.label}</span>
                                        {cmd.hint && <span className="text-[11.5px] text-voxly-ink-5 truncate">{cmd.hint}</span>}
                                        {i === active && (
                                            <span className="ml-auto flex-none font-mono text-[10.5px] text-voxly-ink-5" aria-hidden="true">↵</span>
                                        )}
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
