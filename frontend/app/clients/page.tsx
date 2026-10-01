'use client';

import { Suspense, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { projectsAPI, channelsAPI } from '@/lib/api';
import { clientsQuery } from '@/lib/queries';
import { useDeleteClient, useSetClientActive } from '@/hooks/useClientMutations';
import { Button } from '@/components/ui/button';
import ConfirmDialog from '@/components/ConfirmDialog';
import ClientFormDialog from '@/components/ClientFormDialog';
import {
    DropdownMenu,
    DropdownMenuCheckboxItem,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
    Plus, Search, MoreVertical, Pencil, Trash2, Users, Loader2, Filter,
    ChevronLeft, ChevronRight, MessageSquare, ArrowUpRight, PauseCircle, PlayCircle,
} from 'lucide-react';
import Link from 'next/link';
import { formatPhone, getInitials } from '@/lib/utils';
import type { Client, Project, ChannelActivity } from '@/types';
import { motion, AnimatePresence } from 'framer-motion';
import EmptyState from '@/components/EmptyState';
import StatusBadge from '@/components/StatusBadge';
import { Panel, PanelRow, PanelText } from '@/components/SidePanel';

const PAGE_SIZE = 6;
const CHANNEL_TYPES = ['WhatsApp', 'Telegram'] as const;
const STATUS_FILTERS = ['All', 'Active', 'Inactive'] as const;

/* Every figure on this page comes from GET /clients, /projects and /channels.
   The old Health score and MRR columns were hashes of the client UUID dressed
   up as metrics — and the Healthy/At-risk filters sorted real clients by
   them. No health-scoring or billing-per-client data exists, so they're gone
   rather than faked. */

/* "Email" never appears here — chat_history.channel is constrained to
   whatsapp/telegram (see backend/app/schemas/channel.py). */
function channelLabel(ch: string) {
    return ch === 'whatsapp' ? 'WhatsApp' : ch === 'telegram' ? 'Telegram' : ch;
}

const timeAgo = (ts: string) => {
    const d = Date.now() - new Date(ts).getTime();
    const m = Math.floor(d / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
};

const GRID_COLS = 'grid grid-cols-[2fr_0.9fr_1.3fr_0.8fr_1fr_32px]';

interface ClientRow {
    client: Client;
    channels: string[];
    projectCount: number;
    /** Most recent real message across the client's channels; null = none yet. */
    lastMessageAt: string | null;
}

// useSearchParams (for /clients?new=1) needs a Suspense boundary or
// `next build` fails the static prerender of this route.
export default function ClientsListPage() {
    return (
        <Suspense fallback={<div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>}>
            <ClientsList />
        </Suspense>
    );
}

function ClientsList() {
    const searchParams = useSearchParams();
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState<typeof STATUS_FILTERS[number]>('All');
    const [channelFilter, setChannelFilter] = useState<Set<string>>(new Set());
    const [page, setPage] = useState(1);
    const [createOpen, setCreateOpen] = useState(false);
    const [editingClient, setEditingClient] = useState<Client | null>(null);
    const [clientToDeactivate, setClientToDeactivate] = useState<Client | null>(null);
    const [clientToDelete, setClientToDelete] = useState<Client | null>(null);

    // "Add a client" anywhere in the app links to /clients?new=1 — derived
    // rather than copied into state, so it also works when we're already here.
    const wantsCreate = searchParams.get('new') === '1';
    const createDialogOpen = createOpen || wantsCreate;
    const setCreateDialogOpen = (open: boolean) => {
        setCreateOpen(open);
        // Native replaceState, not router.replace: Next syncs it into
        // useSearchParams without a navigation. In production builds
        // router.replace('/clients') from /clients?new=1 never committed, so
        // the param stuck and the dialog could not be closed.
        if (!open && wantsCreate) window.history.replaceState(null, '', '/clients');
    };

    const { data: clients = [], isLoading } = useQuery(clientsQuery);

    const { data: projects = [] } = useQuery({
        queryKey: ['projects'],
        queryFn: async () => (await projectsAPI.list()).data as Project[],
    });

    const { data: channelActivity = [] } = useQuery({
        queryKey: ['channel-activity'],
        queryFn: async () => (await channelsAPI.list()).data as ChannelActivity[],
        staleTime: 30_000,
    });

    const setActive = useSetClientActive();
    const deleteMutation = useDeleteClient({ onDeleted: () => setClientToDelete(null) });

    const projectCountByClient = useMemo(() => {
        const map = new Map<string, number>();
        for (const p of projects) map.set(p.client_id, (map.get(p.client_id) ?? 0) + 1);
        return map;
    }, [projects]);

    const rows = useMemo<ClientRow[]>(() => {
        const byClient = new Map<string, { channels: Set<string>; last: string | null }>();
        for (const a of channelActivity) {
            const entry = byClient.get(a.client_id) ?? { channels: new Set<string>(), last: null };
            entry.channels.add(channelLabel(a.channel));
            if (a.last_activity && (!entry.last || a.last_activity > entry.last)) entry.last = a.last_activity;
            byClient.set(a.client_id, entry);
        }
        return clients.map((c) => {
            const activity = byClient.get(c.id);
            return {
                client: c,
                channels: activity ? Array.from(activity.channels) : [],
                projectCount: projectCountByClient.get(c.id) ?? 0,
                lastMessageAt: activity?.last ?? null,
            };
        });
    }, [clients, channelActivity, projectCountByClient]);

    const activeCount = clients.filter((c) => c.is_active).length;
    const inactiveCount = clients.length - activeCount;
    const messagingCount = rows.filter((r) => r.channels.length > 0).length;
    const channelTypesInUse = new Set(rows.flatMap((r) => r.channels)).size;
    const withProjects = rows.filter((r) => r.projectCount > 0).length;
    const now = new Date();
    const newThisMonth = clients.filter((c) => {
        const created = new Date(c.created_at);
        return created.getFullYear() === now.getFullYear() && created.getMonth() === now.getMonth();
    }).length;

    const query = searchQuery.trim().toLowerCase();
    const filtered = rows.filter(({ client, channels }) => {
        const matchesSearch = !query
            || client.name.toLowerCase().includes(query)
            || client.company?.toLowerCase().includes(query)
            || client.email?.toLowerCase().includes(query);
        const matchesStatus = statusFilter === 'All'
            || (statusFilter === 'Active' && client.is_active)
            || (statusFilter === 'Inactive' && !client.is_active);
        const matchesChannel = channelFilter.size === 0 || channels.some((ch) => channelFilter.has(ch));
        return matchesSearch && matchesStatus && matchesChannel;
    });

    const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    const pageClamped = Math.min(page, totalPages);
    const paged = filtered.slice((pageClamped - 1) * PAGE_SIZE, pageClamped * PAGE_SIZE);

    const recentConversations = rows
        .filter((r) => r.lastMessageAt)
        .sort((a, b) => (b.lastMessageAt! > a.lastMessageAt! ? 1 : -1))
        .slice(0, 4);
    const whatsappCount = rows.filter((r) => r.channels.includes('WhatsApp')).length;
    const telegramCount = rows.filter((r) => r.channels.includes('Telegram')).length;

    const resetToFirstPage = () => setPage(1);
    const isFiltering = !!query || statusFilter !== 'All' || channelFilter.size > 0;
    const deleteProjectCount = clientToDelete ? projectCountByClient.get(clientToDelete.id) ?? 0 : 0;

    return (
        <div className="flex flex-col xl:flex-row gap-6 items-start">
            <div className="flex-1 min-w-0 w-full flex flex-col gap-[18px]">

                {/* Header */}
                <div className="flex items-end justify-between gap-4">
                    <div>
                        <h1 className="font-display font-bold text-[22px] text-foreground tracking-[-0.01em]">Clients</h1>
                        <p className="text-[13px] text-voxly-ink-6 mt-[3px]">
                            {activeCount} active
                            {channelTypesInUse > 0
                                ? ` · talking on ${channelTypesInUse} ${channelTypesInUse === 1 ? 'channel' : 'channels'}`
                                : clients.length > 0 ? ' · no conversations yet' : ''}
                        </p>
                    </div>
                    <Button onClick={() => setCreateDialogOpen(true)} className="font-semibold text-[13px] rounded-lg px-4 py-[9px] h-auto gap-[7px]">
                        <Plus className="w-[15px] h-[15px]" /> New client
                    </Button>
                </div>

                {/* Stat strip */}
                <motion.div
                    className="grid grid-cols-2 gap-3 sm:flex sm:items-center sm:gap-[22px] px-[18px] py-3.5 border border-border rounded-xl bg-card"
                    initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
                >
                    <div className="whitespace-nowrap">
                        <span className="font-display font-bold text-[17px] text-foreground tabular-nums">{clients.length}</span>
                        <span className="text-[11.5px] text-voxly-ink-5 ml-1.5">total</span>
                    </div>
                    <div className="hidden sm:block w-px h-4 bg-border" />
                    <div className="whitespace-nowrap">
                        <span className="font-display font-bold text-[17px] text-voxly-success tabular-nums">{activeCount}</span>
                        <span className="text-[11.5px] text-voxly-ink-5 ml-1.5">active</span>
                    </div>
                    <div className="hidden sm:block w-px h-4 bg-border" />
                    <div className="whitespace-nowrap" title="Clients who have exchanged at least one WhatsApp or Telegram message">
                        <span className="font-display font-bold text-[17px] text-foreground tabular-nums">{messagingCount}</span>
                        <span className="text-[11.5px] text-voxly-ink-5 ml-1.5">in conversation</span>
                    </div>
                    <div className="hidden sm:block w-px h-4 bg-border" />
                    <div className="whitespace-nowrap">
                        <span className="font-display font-bold text-[17px] text-foreground tabular-nums">{newThisMonth}</span>
                        <span className="text-[11.5px] text-voxly-ink-5 ml-1.5">new this month</span>
                    </div>
                </motion.div>

                {/* Filter row */}
                <div className="flex flex-wrap items-center gap-2">
                    <div className="relative flex-1 max-w-[280px] min-w-[160px]">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-voxly-ink-5" />
                        <input
                            placeholder="Search clients…"
                            aria-label="Search clients"
                            value={searchQuery}
                            onChange={(e) => { setSearchQuery(e.target.value); resetToFirstPage(); }}
                            className="w-full h-9 pl-8 pr-3 text-[12.5px] bg-card border border-border rounded-lg text-foreground placeholder:text-voxly-ink-5 focus:outline-none focus:border-primary focus:ring-[3px] focus:ring-primary/15 transition-all"
                        />
                    </div>
                    {STATUS_FILTERS.map((f) => (
                        <button
                            key={f}
                            onClick={() => { setStatusFilter(f); resetToFirstPage(); }}
                            aria-pressed={statusFilter === f}
                            className={`text-[11.5px] rounded-full px-[11px] py-[5px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                                statusFilter === f
                                    ? 'font-semibold text-primary-foreground bg-primary'
                                    : 'text-voxly-ink-6 border border-border hover:border-voxly-ink-4 hover:text-foreground'
                            }`}>
                            {f}
                        </button>
                    ))}
                    <div className="flex-1" />
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <button className="flex items-center gap-1.5 text-[11.5px] text-voxly-ink-6 border border-border hover:border-voxly-ink-4 hover:text-foreground rounded-lg px-[11px] py-[5px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                                <Filter className="w-[13px] h-[13px]" /> Channel{channelFilter.size > 0 ? ` (${channelFilter.size})` : ''}
                            </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            {CHANNEL_TYPES.map((ch) => (
                                <DropdownMenuCheckboxItem
                                    key={ch}
                                    checked={channelFilter.has(ch)}
                                    onCheckedChange={(checked) => {
                                        setChannelFilter((prev) => {
                                            const next = new Set(prev);
                                            if (checked) next.add(ch); else next.delete(ch);
                                            return next;
                                        });
                                        resetToFirstPage();
                                    }}
                                >
                                    {ch}
                                </DropdownMenuCheckboxItem>
                            ))}
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>

                {/* Table */}
                <motion.div
                    className="border border-border rounded-[14px] bg-card overflow-hidden"
                    initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.1 }}
                >
                    {isLoading ? (
                        <div className="p-12 text-center">
                            <Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" />
                        </div>
                    ) : filtered.length === 0 && isFiltering ? (
                        <div className="p-12 text-center">
                            <div className="w-14 h-14 rounded-2xl bg-secondary border border-border flex items-center justify-center mx-auto mb-4">
                                <Users className="w-6 h-6 text-voxly-ink-5" />
                            </div>
                            <h3 className="text-sm font-semibold text-foreground mb-1">No clients found</h3>
                            <p className="text-xs text-voxly-ink-5 max-w-sm mx-auto mb-4">Try adjusting your search or filters.</p>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => { setSearchQuery(''); setStatusFilter('All'); setChannelFilter(new Set()); resetToFirstPage(); }}
                            >
                                Clear filters
                            </Button>
                        </div>
                    ) : filtered.length === 0 ? (
                        <EmptyState icon={Users} title="No clients yet" description="Add your first client — Voxly will answer them on WhatsApp and Telegram." href="/clients?new=1" label="Add client" />
                    ) : (
                        <div className="overflow-x-auto">
                        {/* 600px fits the main column beside the right rail at xl
                            (1280px) — 720 clipped "Last message" on laptops. */}
                        <div className="min-w-[600px]">
                            <div className={`${GRID_COLS} px-4 py-2.5 font-mono text-[10px] font-semibold tracking-[0.04em] uppercase text-voxly-ink-5 border-b border-border`}>
                                <div>Client</div><div>Status</div><div>Channels</div><div>Projects</div><div>Last message</div><div />
                            </div>
                            <AnimatePresence>
                                {paged.map(({ client, channels, projectCount, lastMessageAt }, index) => (
                                    <motion.div
                                        key={client.id}
                                        data-testid="client-row"
                                        initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: -8 }}
                                        transition={{ duration: 0.25, delay: index * 0.03 }}
                                        className={`${GRID_COLS} px-4 py-3 items-center border-b border-border last:border-b-0 hover:bg-white/[0.02] transition-colors group`}
                                    >
                                        <Link href={`/clients/${client.id}`} className="flex items-center gap-2.5 min-w-0 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                                            <div className="w-7 h-7 rounded-lg bg-voxly-surface-3 flex items-center justify-center flex-none text-[10px] font-bold font-display text-voxly-ink-6">
                                                {getInitials(client.name)}
                                            </div>
                                            <div className="min-w-0">
                                                <div className="text-[13px] font-semibold text-foreground group-hover:text-primary transition-colors truncate">{client.name}</div>
                                                <div className="text-[11px] text-voxly-ink-5 truncate">{client.company || client.email || formatPhone(client.phone)}</div>
                                            </div>
                                        </Link>
                                        <div>
                                            <StatusBadge status={client.is_active ? 'active' : 'inactive'} />
                                        </div>
                                        <div className="flex gap-[5px] flex-wrap">
                                            {channels.length === 0 ? (
                                                <span className="text-[10.5px] text-voxly-ink-5" title="No WhatsApp or Telegram messages yet">—</span>
                                            ) : channels.map((ch) => (
                                                <span key={ch} className="text-[10.5px] text-voxly-ink-6 border border-border rounded-[5px] px-1.5 py-0.5">{ch}</span>
                                            ))}
                                        </div>
                                        <div className="text-[13px] text-foreground tabular-nums">{projectCount}</div>
                                        <div className="text-[12px] text-voxly-ink-5">
                                            {lastMessageAt ? (
                                                <Link href={`/messages?client=${client.id}`} className="hover:text-primary transition-colors">{timeAgo(lastMessageAt)}</Link>
                                            ) : (
                                                <span title="No messages yet">—</span>
                                            )}
                                        </div>
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <Button variant="ghost" size="icon" className="hover:bg-accent text-voxly-ink-5 hover:text-foreground w-7 h-7" aria-label={`Actions for ${client.name}`}>
                                                    <MoreVertical className="w-4 h-4" />
                                                </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end">
                                                <DropdownMenuItem asChild>
                                                    <Link href={`/clients/${client.id}`}>
                                                        <ArrowUpRight className="w-4 h-4 mr-2" /> Open
                                                    </Link>
                                                </DropdownMenuItem>
                                                <DropdownMenuItem onSelect={() => setEditingClient(client)}>
                                                    <Pencil className="w-4 h-4 mr-2" /> Edit
                                                </DropdownMenuItem>
                                                <DropdownMenuItem asChild>
                                                    <Link href={`/messages?client=${client.id}`}>
                                                        <MessageSquare className="w-4 h-4 mr-2" /> Conversation
                                                    </Link>
                                                </DropdownMenuItem>
                                                <DropdownMenuSeparator />
                                                {client.is_active ? (
                                                    <DropdownMenuItem onSelect={() => setClientToDeactivate(client)}>
                                                        <PauseCircle className="w-4 h-4 mr-2" /> Mark inactive
                                                    </DropdownMenuItem>
                                                ) : (
                                                    <DropdownMenuItem onSelect={() => setActive.mutate({ client, active: true })}>
                                                        <PlayCircle className="w-4 h-4 mr-2" /> Reactivate
                                                    </DropdownMenuItem>
                                                )}
                                                <DropdownMenuItem
                                                    className="text-voxly-heat focus:bg-voxly-heat-soft focus:text-voxly-heat"
                                                    onSelect={() => setClientToDelete(client)}
                                                >
                                                    <Trash2 className="w-4 h-4 mr-2" /> Delete
                                                </DropdownMenuItem>
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </motion.div>
                                ))}
                            </AnimatePresence>
                        </div>
                        </div>
                    )}
                </motion.div>

                {/* Pagination */}
                {filtered.length > 0 && (
                    <div className="flex items-center justify-between">
                        <span className="text-xs text-voxly-ink-5">
                            Showing {paged.length} of {filtered.length} {filtered.length === 1 ? 'client' : 'clients'}
                        </span>
                        <div className="flex gap-1.5">
                            <button
                                onClick={() => setPage((p) => Math.max(1, p - 1))}
                                disabled={pageClamped <= 1}
                                aria-label="Previous page"
                                className="w-7 h-7 border border-border rounded-[7px] flex items-center justify-center text-voxly-ink-6 disabled:opacity-40 disabled:cursor-not-allowed hover:border-voxly-ink-4 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            >
                                <ChevronLeft className="w-3.5 h-3.5" />
                            </button>
                            <button
                                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                                disabled={pageClamped >= totalPages}
                                aria-label="Next page"
                                className="w-7 h-7 border border-border rounded-[7px] flex items-center justify-center text-voxly-ink-6 disabled:opacity-40 disabled:cursor-not-allowed hover:border-voxly-ink-4 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            >
                                <ChevronRight className="w-3.5 h-3.5" />
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Right column — real aggregates only */}
            <div className="w-full xl:w-80 flex-none flex flex-col gap-3.5">
                <Panel title="Client Status">
                    <PanelRow dot="bg-voxly-success" label="Active" value={activeCount} />
                    <PanelRow dot="bg-voxly-ink-4" label="Inactive" value={inactiveCount} />
                    <PanelRow dot="bg-voxly-violet" label="With a project" value={withProjects} />
                    <PanelRow dot="bg-voxly-ink-4" label="No project yet" value={clients.length - withProjects} />
                </Panel>

                <Panel title="Channels">
                    <PanelRow dot={whatsappCount > 0 ? 'bg-voxly-success' : 'bg-voxly-ink-4'} label="On WhatsApp" value={whatsappCount} />
                    <PanelRow dot={telegramCount > 0 ? 'bg-voxly-success' : 'bg-voxly-ink-4'} label="On Telegram" value={telegramCount} />
                    <PanelRow dot="bg-voxly-ink-4" label="No messages yet" value={clients.length - messagingCount} />
                </Panel>

                <Panel title="Recent Conversations" defaultOpen={false}>
                    {recentConversations.length === 0 ? (
                        <PanelText>No client has messaged yet.</PanelText>
                    ) : (
                        <div className="pb-1">
                            {recentConversations.map((r) => (
                                <Link
                                    key={r.client.id}
                                    href={`/messages?client=${r.client.id}`}
                                    className="flex items-center gap-2 px-3.5 py-[7px] border-t border-border first:border-t-0 hover:bg-white/[0.02] transition-colors"
                                >
                                    <span className="w-1.5 h-1.5 rounded-full flex-none bg-voxly-success" />
                                    <span className="flex-1 text-[11.5px] text-foreground/90 truncate">{r.client.name}</span>
                                    <span className="text-[11px] text-voxly-ink-5 flex-none">{timeAgo(r.lastMessageAt!)}</span>
                                </Link>
                            ))}
                        </div>
                    )}
                </Panel>
            </div>

            <ClientFormDialog open={createDialogOpen} onOpenChange={setCreateDialogOpen} />
            <ClientFormDialog
                open={!!editingClient}
                onOpenChange={(open) => { if (!open) setEditingClient(null); }}
                client={editingClient}
            />

            <ConfirmDialog
                open={!!clientToDeactivate}
                onOpenChange={(open) => { if (!open) setClientToDeactivate(null); }}
                title={`Mark ${clientToDeactivate?.name ?? 'client'} inactive?`}
                description="Voxly will stop replying to their WhatsApp and Telegram messages until you reactivate them. Projects and conversation history are kept."
                confirmLabel="Mark inactive"
                destructive={false}
                pending={setActive.isPending}
                onConfirm={() => {
                    if (!clientToDeactivate) return;
                    setActive.mutate(
                        { client: clientToDeactivate, active: false },
                        { onSuccess: () => setClientToDeactivate(null) },
                    );
                }}
            />

            <ConfirmDialog
                open={!!clientToDelete}
                onOpenChange={(open) => { if (!open) setClientToDelete(null); }}
                title="Delete client?"
                description={
                    <>
                        &ldquo;{clientToDelete?.name}&rdquo; will be deleted
                        {deleteProjectCount > 0 ? <>, along with {deleteProjectCount} {deleteProjectCount === 1 ? 'project' : 'projects'} and their milestones</> : null}.
                        This can&rsquo;t be undone.
                    </>
                }
                confirmLabel="Delete client"
                pending={deleteMutation.isPending}
                onConfirm={() => clientToDelete && deleteMutation.mutate(clientToDelete)}
            />
        </div>
    );
}
