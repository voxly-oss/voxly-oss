'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { projectsAPI, clientsAPI, channelsAPI } from '@/lib/api';
import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuCheckboxItem,
    DropdownMenuContent,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
    FolderGit2, Loader2, MoreVertical, Plus, Search, Filter,
    AlertTriangle, Clock, ChevronLeft, ChevronRight, Code2, GitCommit,
} from 'lucide-react';
import Link from 'next/link';
import { getInitials } from '@/lib/utils';
import type { Project, Client, ChannelActivity } from '@/types';
import { motion, AnimatePresence } from 'framer-motion';
import EmptyState from '@/components/EmptyState';

const PAGE_SIZE = 7;
const STATUS_FILTERS = ['All', 'Active', 'Paused', 'Completed', 'Cancelled'] as const;

/* Channel labels match what the backend can actually report. chat_history.channel
   is constrained to whatsapp/telegram, plus GitHub as a project-level link. */
const CHANNEL_FILTERS = ['GitHub', 'WhatsApp', 'Telegram'] as const;

const STATUS_STYLE: Record<string, { bg: string; text: string; dot: string; label: string }> = {
    active: { bg: 'bg-voxly-success-soft', text: 'text-voxly-success', dot: 'bg-voxly-success', label: 'Active' },
    paused: { bg: 'bg-voxly-warning-soft', text: 'text-voxly-warning', dot: 'bg-voxly-warning', label: 'Paused' },
    completed: { bg: 'bg-voxly-violet-soft', text: 'text-voxly-violet', dot: 'bg-voxly-violet', label: 'Completed' },
    cancelled: { bg: 'bg-voxly-heat-soft', text: 'text-voxly-heat', dot: 'bg-voxly-heat', label: 'Cancelled' },
};

const timeAgo = (ts: string) => {
    const m = Math.floor((Date.now() - new Date(ts).getTime()) / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
};

const shortDate = (ds: string | null) => ds ? new Date(ds).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '—';

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

const GRID_COLS = 'grid grid-cols-[2fr_1.2fr_1.2fr_1.2fr_1.1fr_0.85fr_28px]';

export default function ProjectsListPage() {
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState<typeof STATUS_FILTERS[number]>('All');
    const [channelFilter, setChannelFilter] = useState<Set<string>>(new Set());
    const [page, setPage] = useState(1);

    const { data: projects = [], isLoading: projectsLoading } = useQuery({
        queryKey: ['projects'],
        queryFn: async () => (await projectsAPI.list()).data as Project[],
    });

    const { data: clients = [] } = useQuery({
        queryKey: ['clients'],
        queryFn: async () => (await clientsAPI.list()).data as Client[],
    });

    // Real per-client conversation channels, so "WhatsApp" on a row means
    // messages have actually been exchanged — not that a phone number is on file.
    const { data: channelActivity = [] } = useQuery({
        queryKey: ['channel-activity'],
        queryFn: async () => (await channelsAPI.list()).data as ChannelActivity[],
        staleTime: 30_000,
    });

    const clientById = useMemo(() => new Map(clients.map(c => [c.id, c])), [clients]);
    const getClientName = (clientId: string) => clientById.get(clientId)?.name || 'Unknown Client';

    const channelsByClient = useMemo(() => {
        const map = new Map<string, Set<string>>();
        for (const a of channelActivity) {
            const set = map.get(a.client_id) ?? new Set<string>();
            set.add(a.channel === 'whatsapp' ? 'WhatsApp' : a.channel === 'telegram' ? 'Telegram' : a.channel);
            map.set(a.client_id, set);
        }
        return map;
    }, [channelActivity]);

    const enriched = useMemo(() => projects.map(p => {
        const live = channelsByClient.get(p.client_id);
        const channels = [
            ...(p.github_repo ? ['GitHub'] : []),
            ...(live ? Array.from(live) : []),
        ];
        return { project: p, stats: p.github_stats ?? null, channels };
    }), [projects, channelsByClient]);

    const totalCount = projects.length;
    const activeCount = projects.filter(p => p.status === 'active').length;
    const cancelledCount = projects.filter(p => p.status === 'cancelled').length;
    const now = new Date();
    const completedThisMonth = projects.filter(p => {
        if (p.status !== 'completed') return false;
        const u = new Date(p.updated_at);
        return u.getFullYear() === now.getFullYear() && u.getMonth() === now.getMonth();
    }).length;

    const filtered = enriched.filter(({ project, channels }) => {
        const matchesSearch = project.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            getClientName(project.client_id).toLowerCase().includes(searchQuery.toLowerCase());
        const matchesStatus = statusFilter === 'All' || project.status === statusFilter.toLowerCase();
        const matchesChannel = channelFilter.size === 0 || channels.some(ch => channelFilter.has(ch));
        return matchesSearch && matchesStatus && matchesChannel;
    });

    const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    const pageClamped = Math.min(page, totalPages);
    const paged = filtered.slice((pageClamped - 1) * PAGE_SIZE, pageClamped * PAGE_SIZE);
    const resetToFirstPage = () => setPage(1);

    /* Real GitHub sync state, from the github_cache rows already carried on
       every ProjectResponse. This replaces an invented per-project "health"
       score — there is no health-scoring endpoint, but there is real sync data
       the page was throwing away. */
    const withRepo = enriched.filter(e => !!e.project.github_repo);
    const synced = withRepo.filter(e => e.stats?.synced_at);
    const commitsLast7 = synced.reduce((n, e) => n + (e.stats?.commits_last_7_days ?? 0), 0);
    const openIssues = synced.reduce((n, e) => n + (e.stats?.open_issues ?? 0), 0);
    const openPRs = synced.reduce((n, e) => n + (e.stats?.pull_requests ?? 0), 0);

    const upcoming = [...projects]
        .filter(p => p.expected_end_date && p.status !== 'completed' && p.status !== 'cancelled')
        .sort((a, b) => new Date(a.expected_end_date!).getTime() - new Date(b.expected_end_date!).getTime())
        .slice(0, 3);

    const recentActivity = [...projects].sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()).slice(0, 4);

    return (
        <div className="flex flex-col xl:flex-row gap-6 items-start">
            <div className="flex-1 min-w-0 w-full flex flex-col gap-[18px]">

                <div className="flex items-end justify-between">
                    <div>
                        <h1 className="font-display font-bold text-[22px] text-foreground tracking-[-0.01em]">Projects</h1>
                        <p className="text-[13px] text-voxly-ink-6 mt-[3px]">
                            {totalCount} across {clients.length} {clients.length === 1 ? 'client' : 'clients'}
                        </p>
                    </div>
                    <Link href="/clients">
                        <Button className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-[13px] rounded-lg px-4 py-[9px] h-auto gap-[7px]">
                            <Plus className="w-[15px] h-[15px]" /> New project
                        </Button>
                    </Link>
                </div>

                {!projectsLoading && totalCount > 0 && (
                    <motion.div
                        className="grid grid-cols-2 gap-3 sm:flex sm:items-center sm:gap-[22px] px-[18px] py-3.5 border border-border rounded-xl bg-card"
                        initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
                    >
                        <div className="whitespace-nowrap">
                            <span className="font-display font-bold text-[17px] text-foreground tabular-nums">{totalCount}</span>
                            <span className="text-[11.5px] text-voxly-ink-5 ml-1.5">total</span>
                        </div>
                        <div className="hidden sm:block w-px h-4 bg-border" />
                        <div className="whitespace-nowrap">
                            <span className="font-display font-bold text-[17px] text-voxly-success tabular-nums">{activeCount}</span>
                            <span className="text-[11.5px] text-voxly-ink-5 ml-1.5">active</span>
                        </div>
                        <div className="hidden sm:block w-px h-4 bg-border" />
                        <div className="whitespace-nowrap">
                            <span className="font-display font-bold text-[17px] text-voxly-heat tabular-nums">{cancelledCount}</span>
                            <span className="text-[11.5px] text-voxly-ink-5 ml-1.5">cancelled</span>
                        </div>
                        <div className="hidden sm:block w-px h-4 bg-border" />
                        <div className="whitespace-nowrap">
                            <span className="font-display font-bold text-[17px] text-foreground tabular-nums">{completedThisMonth}</span>
                            <span className="text-[11.5px] text-voxly-ink-5 ml-1.5">completed this month</span>
                        </div>
                    </motion.div>
                )}

                {/* Filter row */}
                <div className="flex flex-wrap items-center gap-2">
                    <div className="relative flex-1 max-w-[280px] min-w-[160px]">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-voxly-ink-5" />
                        <input
                            placeholder="Search projects…"
                            value={searchQuery}
                            onChange={(e) => { setSearchQuery(e.target.value); resetToFirstPage(); }}
                            className="w-full h-9 pl-8 pr-3 text-[12.5px] bg-card border border-border rounded-lg text-foreground placeholder:text-voxly-ink-5 focus:outline-none focus:border-primary focus:ring-[3px] focus:ring-primary/15 transition-all"
                        />
                    </div>
                    {STATUS_FILTERS.map(f => (
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
                            {CHANNEL_FILTERS.map(ch => (
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
                    {projectsLoading ? (
                        <div className="p-12 text-center">
                            <Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" />
                        </div>
                    ) : filtered.length === 0 && (searchQuery || statusFilter !== 'All' || channelFilter.size > 0) ? (
                        <div className="p-12 text-center">
                            <div className="w-14 h-14 rounded-2xl bg-secondary border border-border flex items-center justify-center mx-auto mb-4">
                                <FolderGit2 className="w-6 h-6 text-voxly-ink-5" />
                            </div>
                            <h3 className="text-sm font-semibold text-foreground mb-1">No projects found</h3>
                            <p className="text-xs text-voxly-ink-5 max-w-sm mx-auto">Try adjusting your search or filters.</p>
                        </div>
                    ) : filtered.length === 0 ? (
                        <EmptyState icon={FolderGit2} title="No projects yet" description="Projects will appear here once you create them for your clients." href="/clients" label="Go to Clients" />
                    ) : (
                        <div className="overflow-x-auto">
                        <div className="min-w-[820px]">
                            <div className={`${GRID_COLS} px-4 py-2.5 font-mono text-[10px] font-semibold tracking-[0.04em] uppercase text-voxly-ink-5 border-b border-border`}>
                                <div>Project</div><div>Client</div><div>Status</div><div>Progress</div><div>Channels</div><div>Due</div><div />
                            </div>
                            <AnimatePresence>
                                {paged.map(({ project, stats, channels }, index) => {
                                    const style = STATUS_STYLE[project.status] ?? STATUS_STYLE.active;
                                    const overdue = project.status === 'active' && project.expected_end_date && new Date(project.expected_end_date) < now;
                                    return (
                                        <motion.div
                                            key={project.id}
                                            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: -8 }}
                                            transition={{ duration: 0.25, delay: index * 0.03 }}
                                            className={`${GRID_COLS} px-4 py-3 items-center border-b border-border last:border-b-0 hover:bg-white/[0.02] transition-colors group ${project.status === 'cancelled' ? 'bg-voxly-heat-soft' : ''}`}
                                        >
                                            <Link href={`/clients/${project.client_id}/projects/${project.id}/milestones`} className="flex items-center gap-2.5 min-w-0">
                                                <div className="w-7 h-7 rounded-lg bg-voxly-surface-3 flex items-center justify-center flex-none text-voxly-ink-6">
                                                    <FolderGit2 className="w-3.5 h-3.5" />
                                                </div>
                                                <div className="min-w-0">
                                                    <div className="text-[13px] font-semibold text-foreground group-hover:text-primary transition-colors truncate">{project.name}</div>
                                                    {project.github_repo && <div className="font-mono text-[10.5px] text-voxly-ink-5 truncate">{project.github_repo}</div>}
                                                </div>
                                            </Link>
                                            <div className="flex items-center gap-2 min-w-0">
                                                <div className="w-5 h-5 rounded-md bg-voxly-surface-3 flex items-center justify-center flex-none text-[9px] font-bold font-display text-voxly-ink-6">
                                                    {getInitials(getClientName(project.client_id))}
                                                </div>
                                                <span className="text-[12.5px] text-foreground/90 truncate">{getClientName(project.client_id)}</span>
                                            </div>
                                            <div>
                                                <span className={`inline-flex items-center gap-[5px] text-[11px] font-semibold rounded-full pl-1.5 pr-2 py-[3px] whitespace-nowrap ${style.bg} ${style.text}`}>
                                                    <span className={`w-[5px] h-[5px] rounded-full flex-none ${style.dot}`} />
                                                    {style.label}
                                                </span>
                                            </div>
                                            {/* Real synced GitHub progress. "—" when the project has no
                                                repo or has never synced, rather than a stand-in number. */}
                                            <div className="min-w-0">
                                                {stats ? (
                                                    <div className="flex items-center gap-2">
                                                        <div className="flex-1 h-1 rounded-full bg-voxly-surface-3 overflow-hidden min-w-[36px]">
                                                            <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(stats.progress_percent, 100)}%` }} />
                                                        </div>
                                                        <span className="text-[11px] text-voxly-ink-6 tabular-nums flex-none">{stats.progress_percent}%</span>
                                                    </div>
                                                ) : (
                                                    <span className="text-[10.5px] text-voxly-ink-5" title={project.github_repo ? 'Repo not synced yet' : 'No repository linked'}>—</span>
                                                )}
                                            </div>
                                            <div className="flex gap-[5px] flex-wrap">
                                                {channels.length === 0 ? (
                                                    <span className="text-[10.5px] text-voxly-ink-5">—</span>
                                                ) : channels.map(ch => (
                                                    <span key={ch} className="text-[10.5px] text-voxly-ink-6 border border-border rounded-[5px] px-1.5 py-0.5 whitespace-nowrap">{ch}</span>
                                                ))}
                                            </div>
                                            {overdue ? (
                                                <div className="flex items-center gap-1 text-[12px] text-voxly-heat whitespace-nowrap">
                                                    <AlertTriangle className="w-[11px] h-[11px] flex-none" /> {shortDate(project.expected_end_date)}
                                                </div>
                                            ) : (
                                                <div className="text-[12px] text-voxly-ink-5 whitespace-nowrap">{shortDate(project.expected_end_date)}</div>
                                            )}
                                            <MoreVertical className="w-4 h-4 text-voxly-ink-5 group-hover:text-foreground cursor-pointer transition-colors" />
                                        </motion.div>
                                    );
                                })}
                            </AnimatePresence>
                        </div>
                        </div>
                    )}
                </motion.div>

                {filtered.length > 0 && (
                    <div className="flex items-center justify-between">
                        <span className="text-xs text-voxly-ink-5">
                            Showing {paged.length} of {filtered.length} {filtered.length === 1 ? 'project' : 'projects'}
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
                <Panel title="Delivery Status">
                    <div className="px-3.5 pb-3.5 flex flex-col gap-[9px]">
                        {[
                            { label: 'Active', dot: 'bg-voxly-success', count: activeCount },
                            { label: 'Paused', dot: 'bg-voxly-warning', count: projects.filter(p => p.status === 'paused').length },
                            { label: 'Completed', dot: 'bg-voxly-violet', count: projects.filter(p => p.status === 'completed').length },
                            { label: 'Cancelled', dot: 'bg-voxly-heat', count: cancelledCount },
                        ].map(row => (
                            <div key={row.label} className="flex items-center gap-2">
                                <span className={`w-[7px] h-[7px] rounded-full flex-none ${row.dot}`} />
                                <span className="flex-1 text-xs text-voxly-ink-6">{row.label}</span>
                                <span className="text-xs font-semibold text-foreground">{row.count}</span>
                            </div>
                        ))}
                    </div>
                </Panel>

                {/* Real github_cache aggregates — the data behind the Progress column. */}
                <Panel title="GitHub Sync">
                    <div className="pb-1">
                        <div className="flex items-center gap-2 px-3 py-[7px] border-t border-border">
                            <Code2 className="w-3 h-3 text-voxly-ink-5 flex-none" />
                            <span className="flex-1 text-xs text-voxly-ink-6">Repos linked</span>
                            <span className="text-xs font-semibold text-foreground">{withRepo.length}</span>
                        </div>
                        <div className="flex items-center gap-2 px-3 py-[7px] border-t border-border">
                            <span className="w-3 flex-none" />
                            <span className="flex-1 text-xs text-voxly-ink-6">Synced</span>
                            <span className="text-xs font-semibold text-foreground">{synced.length}</span>
                        </div>
                        <div className="flex items-center gap-2 px-3 py-[7px] border-t border-border">
                            <GitCommit className="w-3 h-3 text-voxly-ink-5 flex-none" />
                            <span className="flex-1 text-xs text-voxly-ink-6">Commits (7d)</span>
                            <span className="text-xs font-semibold text-foreground">{commitsLast7}</span>
                        </div>
                        <div className="flex items-center gap-2 px-3 py-[7px] border-t border-border">
                            <span className="w-3 flex-none" />
                            <span className="flex-1 text-xs text-voxly-ink-6">Open issues</span>
                            <span className="text-xs font-semibold text-foreground">{openIssues}</span>
                        </div>
                        <div className="flex items-center gap-2 px-3 py-[7px] border-t border-border">
                            <span className="w-3 flex-none" />
                            <span className="flex-1 text-xs text-voxly-ink-6">Open PRs</span>
                            <span className="text-xs font-semibold text-foreground">{openPRs}</span>
                        </div>
                        {withRepo.length > synced.length && (
                            <div className="px-3.5 py-2.5 border-t border-border text-[11px] text-voxly-ink-5 leading-relaxed">
                                {withRepo.length - synced.length} linked {withRepo.length - synced.length === 1 ? 'repo has' : 'repos have'} never synced.
                            </div>
                        )}
                    </div>
                </Panel>

                <Panel title="Upcoming Deadlines" defaultOpen={false}>
                    <div className="pb-1">
                        {upcoming.length === 0 ? (
                            <div className="px-3 py-3 text-[11.5px] text-voxly-ink-5">Nothing on the horizon</div>
                        ) : upcoming.map(p => {
                            const isOverdue = new Date(p.expected_end_date!) < now;
                            return (
                                <div key={p.id} className="flex items-center gap-2 px-3 py-[7px] border-t border-border">
                                    {isOverdue ? <AlertTriangle className="w-[11px] h-[11px] text-voxly-heat flex-none" /> : <Clock className="w-[11px] h-[11px] text-voxly-ink-5 flex-none" />}
                                    <span className="flex-1 text-[11.5px] text-foreground/90 truncate">{p.name}</span>
                                    <span className={`text-[11px] ${isOverdue ? 'text-voxly-heat' : 'text-voxly-ink-5'}`}>{shortDate(p.expected_end_date)}</span>
                                </div>
                            );
                        })}
                    </div>
                </Panel>

                <Panel title="Recent Activity" defaultOpen={false}>
                    <div className="pb-1">
                        {recentActivity.length === 0 ? (
                            <div className="px-3 py-3 text-[11.5px] text-voxly-ink-5">No projects yet</div>
                        ) : recentActivity.map(p => (
                            <div key={p.id} className="flex items-center gap-2 px-3 py-[7px] border-t border-border">
                                <span className={`w-1.5 h-1.5 rounded-full flex-none ${(STATUS_STYLE[p.status] ?? STATUS_STYLE.active).dot}`} />
                                <span className="text-[11.5px] text-voxly-ink-6 truncate">{p.name} updated {timeAgo(p.updated_at)}</span>
                            </div>
                        ))}
                    </div>
                </Panel>
            </div>
        </div>
    );
}
