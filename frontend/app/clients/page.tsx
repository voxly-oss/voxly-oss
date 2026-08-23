'use client';

import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { clientsAPI, projectsAPI, channelsAPI } from '@/lib/api';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import {
    DropdownMenu,
    DropdownMenuCheckboxItem,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useToast } from '@/hooks/use-toast';
import { Plus, Search, MoreVertical, Pencil, Trash2, Users, Loader2, Filter, ChevronLeft, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { formatPhone, getInitials } from '@/lib/utils';
import type { Client, Project, ChannelActivity } from '@/types';
import { motion, AnimatePresence } from 'framer-motion';
import EmptyState from '@/components/EmptyState';
import PreviewBadge, { PreviewMark } from '@/components/PreviewBadge';

const PAGE_SIZE = 6;
const CHANNEL_TYPES = ['WhatsApp', 'Telegram'] as const;

// Deterministic placeholder — no client health-scoring or MRR/billing endpoint
// exists yet. Stable per client id (not randomized per render) so the score
// stays consistent across the stat strip, table, and side panels. Replace
// with real data once a health/billing endpoint ships.
function hashOf(s: string) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
}
// Skewed toward healthy (~85% land 75-100) to mirror a realistic health-score
// distribution rather than a uniform spread.
const mockHealth = (id: string) => {
    const h = hashOf(id);
    return (h % 100) < 85 ? 75 + (Math.floor(h / 100) % 26) : 40 + (Math.floor(h / 100) % 35);
};
const mockMRR = (id: string) => (8 + (hashOf(`${id}-mrr`) % 68)) / 10;

type Bucket = 'excellent' | 'good' | 'risk' | 'inactive';
function bucketOf(client: Client, health: number): Bucket {
    if (!client.is_active) return 'inactive';
    if (health >= 90) return 'excellent';
    if (health >= 75) return 'good';
    return 'risk';
}

/* "Email" no longer appears here — chat_history.channel is constrained to
   whatsapp/telegram, so it's never a real conversation channel (see
   backend/app/schemas/channel.py). Real activity, from GET /channels, replaces
   inferring a channel from whether a contact field is merely populated. */
function channelsOf(clientId: string, activityByClient: Map<string, Set<string>>) {
    const active = activityByClient.get(clientId);
    if (!active) return [];
    return Array.from(active).map(ch => ch === 'whatsapp' ? 'WhatsApp' : ch === 'telegram' ? 'Telegram' : ch);
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

function Panel({ title, badge, defaultOpen = true, children }: { title: string; badge?: React.ReactNode; defaultOpen?: boolean; children: React.ReactNode }) {
    return (
        <details open={defaultOpen} className="group rounded-xl border border-border bg-card overflow-hidden flex-none">
            <summary className="flex items-center gap-2 px-3.5 py-[11px] list-none cursor-pointer select-none [&::-webkit-details-marker]:hidden">
                <ChevronRight className="w-3.5 h-3.5 text-voxly-ink-5 transition-transform group-open:rotate-90" />
                <span className="flex-1 font-mono text-[11px] font-bold uppercase tracking-wider text-voxly-ink-5">{title}</span>
                {badge}
            </summary>
            {children}
        </details>
    );
}

const GRID_COLS = 'grid grid-cols-[2fr_0.8fr_1.3fr_0.9fr_0.9fr_1fr_32px]';

export default function ClientsListPage() {
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState<'All' | 'Healthy' | 'At risk' | 'Inactive'>('All');
    const [channelFilter, setChannelFilter] = useState<Set<string>>(new Set());
    const [page, setPage] = useState(1);
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [clientToDelete, setClientToDelete] = useState<Client | null>(null);
    const { toast } = useToast();
    const queryClient = useQueryClient();

    const { data: clients = [], isLoading } = useQuery({
        queryKey: ['clients'],
        queryFn: async () => (await clientsAPI.list()).data as Client[],
    });

    const { data: projects = [] } = useQuery({
        queryKey: ['projects'],
        queryFn: async () => (await projectsAPI.list()).data as Project[],
    });

    const { data: channelActivity = [] } = useQuery({
        queryKey: ['channel-activity'],
        queryFn: async () => (await channelsAPI.list()).data as ChannelActivity[],
        staleTime: 30_000,
    });

    const deleteMutation = useMutation({
        mutationFn: (id: string) => clientsAPI.delete(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['clients'] });
            toast({ title: 'Client deleted', description: 'The client has been removed.' });
            setDeleteDialogOpen(false);
            setClientToDelete(null);
        },
        onError: () => {
            toast({ variant: 'destructive', title: 'Error', description: 'Failed to delete client.' });
        },
    });

    const projectCountByClient = useMemo(() => {
        const map = new Map<string, number>();
        for (const p of projects) map.set(p.client_id, (map.get(p.client_id) ?? 0) + 1);
        return map;
    }, [projects]);

    const activityByClient = useMemo(() => {
        const map = new Map<string, Set<string>>();
        for (const a of channelActivity) {
            const set = map.get(a.client_id) ?? new Set<string>();
            set.add(a.channel);
            map.set(a.client_id, set);
        }
        return map;
    }, [channelActivity]);

    const enriched = useMemo(() => clients.map(c => {
        const health = mockHealth(c.id);
        return {
            client: c,
            health,
            bucket: bucketOf(c, health),
            mrr: mockMRR(c.id),
            channels: channelsOf(c.id, activityByClient),
            projectCount: projectCountByClient.get(c.id) ?? 0,
        };
    }), [clients, projectCountByClient, activityByClient]);

    const activeCount = clients.filter(c => c.is_active).length;
    const inactiveCount = clients.length - activeCount;
    const healthyCount = enriched.filter(e => e.bucket === 'excellent' || e.bucket === 'good').length;
    const riskCount = enriched.filter(e => e.bucket === 'risk').length;
    const channelTypesInUse = new Set(enriched.flatMap(e => e.channels)).size;
    const now = new Date();
    const newThisMonth = clients.filter((c) => {
        const created = new Date(c.created_at);
        return created.getFullYear() === now.getFullYear() && created.getMonth() === now.getMonth();
    }).length;

    const filtered = enriched.filter(({ client, bucket, channels }) => {
        const matchesSearch = client.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            client.company?.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesStatus = statusFilter === 'All'
            || (statusFilter === 'Healthy' && (bucket === 'excellent' || bucket === 'good'))
            || (statusFilter === 'At risk' && bucket === 'risk')
            || (statusFilter === 'Inactive' && bucket === 'inactive');
        const matchesChannel = channelFilter.size === 0 || channels.some(ch => channelFilter.has(ch));
        return matchesSearch && matchesStatus && matchesChannel;
    });

    const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    const pageClamped = Math.min(page, totalPages);
    const paged = filtered.slice((pageClamped - 1) * PAGE_SIZE, pageClamped * PAGE_SIZE);

    const topByRevenue = [...enriched].sort((a, b) => b.mrr - a.mrr).slice(0, 3);
    const recentActivity = [...clients].sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()).slice(0, 4);

    const resetToFirstPage = () => setPage(1);

    return (
        <div className="flex flex-col xl:flex-row gap-6 items-start">
            <div className="flex-1 min-w-0 w-full flex flex-col gap-[18px]">

                {/* Header */}
                <div className="flex items-end justify-between">
                    <div>
                        <h1 className="font-display font-bold text-[22px] text-foreground tracking-[-0.01em]">Clients</h1>
                        <p className="text-[13px] text-voxly-ink-6 mt-[3px]">
                            {activeCount} active across {channelTypesInUse || 1} {channelTypesInUse === 1 ? 'channel' : 'channels'}
                        </p>
                    </div>
                    <Link href="/clients/new">
                        <Button className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-[13px] rounded-lg px-4 py-[9px] h-auto gap-[7px]">
                            <Plus className="w-[15px] h-[15px]" /> New client
                        </Button>
                    </Link>
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
                        <span className="font-display font-bold text-[17px] text-voxly-success tabular-nums">{healthyCount}</span>
                        <span className="text-[11.5px] text-voxly-ink-5 ml-1.5">healthy<PreviewMark /></span>
                    </div>
                    <div className="hidden sm:block w-px h-4 bg-border" />
                    <div className="whitespace-nowrap">
                        <span className="font-display font-bold text-[17px] text-voxly-warning tabular-nums">{riskCount}</span>
                        <span className="text-[11.5px] text-voxly-ink-5 ml-1.5">at risk<PreviewMark /></span>
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
                            value={searchQuery}
                            onChange={(e) => { setSearchQuery(e.target.value); resetToFirstPage(); }}
                            className="w-full h-9 pl-8 pr-3 text-[12.5px] bg-card border border-border rounded-lg text-foreground placeholder:text-voxly-ink-5 focus:outline-none focus:border-primary focus:ring-[3px] focus:ring-primary/15 transition-all"
                        />
                    </div>
                    {(['All', 'Healthy', 'At risk', 'Inactive'] as const).map(f => (
                        <button
                            key={f}
                            onClick={() => { setStatusFilter(f); resetToFirstPage(); }}
                            className={`text-[11.5px] rounded-full px-[11px] py-[5px] transition-colors ${
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
                            <button className="flex items-center gap-1.5 text-[11.5px] text-voxly-ink-6 border border-border hover:border-voxly-ink-4 hover:text-foreground rounded-lg px-[11px] py-[5px] transition-colors">
                                <Filter className="w-[13px] h-[13px]" /> Channel
                            </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="bg-popover border-border">
                            {CHANNEL_TYPES.map(ch => (
                                <DropdownMenuCheckboxItem
                                    key={ch}
                                    checked={channelFilter.has(ch)}
                                    onCheckedChange={(checked) => {
                                        setChannelFilter(prev => {
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
                    ) : filtered.length === 0 && (searchQuery || statusFilter !== 'All' || channelFilter.size > 0) ? (
                        <div className="p-12 text-center">
                            <div className="w-14 h-14 rounded-2xl bg-secondary border border-border flex items-center justify-center mx-auto mb-4">
                                <Users className="w-6 h-6 text-voxly-ink-5" />
                            </div>
                            <h3 className="text-sm font-semibold text-foreground mb-1">No clients found</h3>
                            <p className="text-xs text-voxly-ink-5 max-w-sm mx-auto">Try adjusting your search or filters.</p>
                        </div>
                    ) : filtered.length === 0 ? (
                        <EmptyState icon={Users} title="No clients yet" description="Get started by adding your first client to manage their projects." href="/clients/new" label="Add Client" />
                    ) : (
                        <div className="overflow-x-auto">
                        <div className="min-w-[760px]">
                            <div className={`${GRID_COLS} px-4 py-2.5 font-mono text-[10px] font-semibold tracking-[0.04em] uppercase text-voxly-ink-5 border-b border-border`}>
                                <div>Client</div><div>Health<PreviewMark /></div><div>Channels</div><div>Projects</div><div>MRR<PreviewMark /></div><div>Last activity</div><div />
                            </div>
                            <AnimatePresence>
                                {paged.map(({ client, health, bucket, mrr, channels, projectCount }, index) => (
                                    <motion.div
                                        key={client.id}
                                        initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: -8 }}
                                        transition={{ duration: 0.25, delay: index * 0.03 }}
                                        className={`${GRID_COLS} px-4 py-3 items-center border-b border-border last:border-b-0 hover:bg-white/[0.02] transition-colors group ${bucket === 'risk' ? 'bg-voxly-heat-soft' : ''}`}
                                    >
                                        <Link href={`/clients/${client.id}`} className="flex items-center gap-2.5 min-w-0">
                                            <div className="w-7 h-7 rounded-lg bg-voxly-surface-3 flex items-center justify-center flex-none text-[10px] font-bold font-display text-voxly-ink-6">
                                                {getInitials(client.name)}
                                            </div>
                                            <div className="min-w-0">
                                                <div className="text-[13px] font-semibold text-foreground group-hover:text-primary transition-colors truncate">{client.name}</div>
                                                <div className="text-[11px] text-voxly-ink-5 truncate">{client.company || client.email || formatPhone(client.phone)}</div>
                                            </div>
                                        </Link>
                                        <div>
                                            <span className={`font-display font-bold text-[12.5px] ${bucket === 'excellent' || bucket === 'good' ? 'text-voxly-success' : bucket === 'risk' ? 'text-voxly-warning' : 'text-voxly-ink-5'}`}>
                                                {client.is_active ? health : '—'}
                                            </span>
                                        </div>
                                        <div className="flex gap-[5px] flex-wrap">
                                            {channels.length === 0 ? (
                                                <span className="text-[10.5px] text-voxly-ink-5">—</span>
                                            ) : channels.map(ch => (
                                                <span key={ch} className="text-[10.5px] text-voxly-ink-6 border border-border rounded-[5px] px-1.5 py-0.5">{ch}</span>
                                            ))}
                                        </div>
                                        <div className="text-[13px] text-foreground">{projectCount}</div>
                                        <div className="text-[13px] text-foreground tabular-nums">${mrr.toFixed(1)}K</div>
                                        <div className={`text-[12px] ${bucket === 'risk' ? 'text-voxly-heat' : 'text-voxly-ink-5'}`}>{timeAgo(client.updated_at)}</div>
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <Button variant="ghost" size="icon" className="hover:bg-accent text-voxly-ink-5 hover:text-foreground w-7 h-7">
                                                    <MoreVertical className="w-4 h-4" />
                                                </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end" className="bg-popover border-border">
                                                <DropdownMenuItem asChild className="hover:bg-accent focus:bg-accent cursor-pointer">
                                                    <Link href={`/clients/${client.id}`} className="text-voxly-ink-6">
                                                        <Pencil className="w-4 h-4 mr-2" /> Edit
                                                    </Link>
                                                </DropdownMenuItem>
                                                <DropdownMenuItem
                                                    className="text-voxly-heat hover:bg-voxly-heat-soft focus:bg-voxly-heat-soft cursor-pointer"
                                                    onClick={() => { setClientToDelete(client); setDeleteDialogOpen(true); }}
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
                                onClick={() => setPage(p => Math.max(1, p - 1))}
                                disabled={pageClamped <= 1}
                                className="w-7 h-7 border border-border rounded-[7px] flex items-center justify-center text-voxly-ink-6 disabled:opacity-40 disabled:cursor-not-allowed hover:border-voxly-ink-4 transition-colors"
                            >
                                <ChevronLeft className="w-3.5 h-3.5" />
                            </button>
                            <button
                                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                                disabled={pageClamped >= totalPages}
                                className="w-7 h-7 border border-border rounded-[7px] flex items-center justify-center text-voxly-ink-6 disabled:opacity-40 disabled:cursor-not-allowed hover:border-voxly-ink-4 transition-colors"
                            >
                                <ChevronRight className="w-3.5 h-3.5" />
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Right column */}
            <div className="w-full xl:w-80 flex-none flex flex-col gap-3.5">
                <Panel title="Health Distribution" badge={<PreviewBadge />}>
                    <div className="px-3.5 pb-3.5 flex flex-col gap-[9px]">
                        {[
                            { label: 'Excellent (90+)', dot: 'bg-voxly-success', count: enriched.filter(e => e.bucket === 'excellent').length },
                            { label: 'Good (75-89)', dot: 'bg-voxly-success', count: enriched.filter(e => e.bucket === 'good').length },
                            { label: 'At risk (<75)', dot: 'bg-voxly-warning', count: riskCount },
                            { label: 'Inactive', dot: 'bg-voxly-ink-4', count: inactiveCount },
                        ].map(row => (
                            <div key={row.label} className="flex items-center gap-2">
                                <span className={`w-[7px] h-[7px] rounded-full flex-none ${row.dot}`} />
                                <span className="flex-1 text-xs text-voxly-ink-6">{row.label}</span>
                                <span className="text-xs font-semibold text-foreground">{row.count}</span>
                            </div>
                        ))}
                    </div>
                </Panel>

                <Panel title="Top by Revenue" badge={<PreviewBadge />}>
                    <div className="pb-1">
                        {topByRevenue.map((e, i) => (
                            <div key={e.client.id} className="flex items-center gap-2 px-3 py-[7px] border-t border-border">
                                <span className="text-[11px] text-voxly-ink-5 w-3.5">{i + 1}</span>
                                <span className="flex-1 text-xs text-foreground truncate">{e.client.name}</span>
                                <span className="text-xs text-foreground tabular-nums">${e.mrr.toFixed(1)}K</span>
                            </div>
                        ))}
                    </div>
                </Panel>

                <Panel title="Recent Activity" defaultOpen={false}>
                    <div className="pb-1">
                        {recentActivity.map(c => (
                            <div key={c.id} className="flex items-center gap-2 px-3 py-[7px] border-t border-border">
                                <span className={`w-1.5 h-1.5 rounded-full flex-none ${c.is_active ? 'bg-voxly-success' : 'bg-voxly-ink-4'}`} />
                                <span className="text-[11.5px] text-voxly-ink-6 truncate">{c.name} · {timeAgo(c.updated_at)}</span>
                            </div>
                        ))}
                    </div>
                </Panel>
            </div>

            {/* Delete confirmation dialog */}
            <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
                <DialogContent className="bg-card border-border">
                    <DialogHeader>
                        <DialogTitle className="text-foreground">Delete Client</DialogTitle>
                        <DialogDescription className="text-voxly-ink-6">
                            Are you sure you want to delete &quot;{clientToDelete?.name}&quot;?
                            This will also delete all their projects and milestones. This
                            action cannot be undone.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setDeleteDialogOpen(false)}
                            className="border-border text-foreground hover:bg-accent"
                        >
                            Cancel
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={() => clientToDelete && deleteMutation.mutate(clientToDelete.id)}
                            disabled={deleteMutation.isPending}
                        >
                            {deleteMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                            Delete
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
