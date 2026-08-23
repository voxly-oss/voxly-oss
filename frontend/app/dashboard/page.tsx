'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { chatAPI, channelsAPI, clientsAPI, dashboardAPI, projectsAPI } from '@/lib/api';
import {
    Sparkles, AlertTriangle, Check, ChevronRight,
    Users, MessageSquare, Code2, Radio, TrendingUp, TrendingDown,
    RefreshCw,
} from 'lucide-react';
import EmptyState from '@/components/EmptyState';
import { Button } from '@/components/ui/button';
import { QUIET_AFTER_DAYS, isQuietChannel } from '@/lib/channelActivity';
import type { ChannelActivity, Client, ConversationsListResponse, Project } from '@/types';

// ─── Types ────────────────────────────────────────────────────────────────────

type RecentAIMessage = { client_name: string; provider: string; response_length: number; timestamp: string };
type DashboardStats = {
    total_clients: number; active_clients: number; total_projects: number;
    active_projects: number; completed_projects: number; total_messages: number;
    messages_this_month: number; messages_last_month: number;
    clients_delta: number; projects_delta: number; messages_delta_pct: number;
    recent_ai_messages: RecentAIMessage[];
    messages_by_day: Array<{ date: string; count: number }>;
    integrations: { whatsapp: boolean; telegram: boolean; github: boolean; ai_provider: string };
    ai_accuracy: number;
    recent_activity: Array<{ type: string; title: string; timestamp: string }>;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

const timeAgo = (ts: string) => {
    const m = Math.floor((Date.now() - new Date(ts).getTime()) / 60000);
    if (m < 1) return 'now';
    if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h`;
    return `${Math.floor(h / 24)}d`;
};

const fmt = (n: number) => n.toLocaleString();

/** Turn a real daily series into an SVG polyline. Every sparkline on this page
 *  is drawn from `messages_by_day` — the backend's actual 7-day histogram —
 *  rather than the hand-authored point strings that used to be here. */
function sparkline(counts: number[], width = 34, height = 16): string {
    if (counts.length === 0) return '';
    const max = Math.max(...counts, 1);
    const step = counts.length > 1 ? width / (counts.length - 1) : width;
    return counts
        .map((c, i) => `${(i * step).toFixed(1)},${(height - (c / max) * (height - 2) - 1).toFixed(1)}`)
        .join(' ');
}

const bucketOf = (ts: string) => {
    const d = new Date(ts);
    const now = new Date();
    if (now.getTime() - d.getTime() < 15 * 60 * 1000) return 'JUST NOW';
    if (d.toDateString() === now.toDateString()) return 'EARLIER TODAY';
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) return 'YESTERDAY';
    return 'EARLIER';
};

type FeedItem = { key: string; kind: 'ai' | 'github' | 'whatsapp' | 'task' | 'other'; title: string; subtitle: string; source: string; ts: string; unread?: boolean };

const FEED_STYLE: Record<FeedItem['kind'], { bar: string; iconBg: string; icon: React.ReactNode }> = {
    ai: { bar: 'bg-voxly-violet', iconBg: 'text-voxly-violet', icon: <Sparkles className="w-3.5 h-3.5" /> },
    github: { bar: 'bg-voxly-ink-4', iconBg: 'text-voxly-ink-6', icon: <Code2 className="w-3.5 h-3.5" /> },
    whatsapp: { bar: 'bg-voxly-success', iconBg: 'text-voxly-ink-6', icon: <MessageSquare className="w-3.5 h-3.5" /> },
    task: { bar: 'bg-primary', iconBg: 'text-primary', icon: <Check className="w-3.5 h-3.5" /> },
    other: { bar: 'bg-voxly-heat', iconBg: 'text-voxly-heat', icon: <AlertTriangle className="w-3.5 h-3.5" /> },
};

function classifyActivity(type: string): FeedItem['kind'] {
    const t = type.toLowerCase();
    if (t.includes('github') || t.includes('deploy') || t.includes('pr') || t.includes('build')) return 'github';
    if (t.includes('whatsapp') || t.includes('message') || t.includes('chat')) return 'whatsapp';
    if (t.includes('task')) return 'task';
    return 'other';
}

// ─── Collapsible right-column panel ──────────────────────────────────────────

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

function PanelRow({ dot, label, value }: { dot?: string; label: React.ReactNode; value: React.ReactNode }) {
    return (
        <div className="flex items-center gap-2 px-3 py-[7px] border-t border-border">
            {dot && <span className={`w-1.5 h-1.5 rounded-full flex-none ${dot}`} />}
            <span className="flex-1 text-[11.5px] text-voxly-ink-6">{label}</span>
            <span className="text-[11px] text-foreground">{value}</span>
        </div>
    );
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

export default function DashboardPage() {
    const [feedFilter, setFeedFilter] = useState<'All' | 'AI' | 'GitHub' | 'Channels'>('All');

    const clientsQuery = useQuery({
        queryKey: ['clients'],
        queryFn: async () => (await clientsAPI.list()).data as Client[],
    });
    const projectsQuery = useQuery({
        queryKey: ['projects'],
        queryFn: async () => (await projectsAPI.list()).data as Project[],
    });
    const statsQuery = useQuery({
        queryKey: ['dashboard-stats'],
        queryFn: async () => (await dashboardAPI.stats()).data as DashboardStats,
        staleTime: 30_000,
    });
    // Real inputs for the briefing: conversations the AI has handed back to a
    // human, and channels that have gone silent. Both are real endpoints.
    const awaitingQuery = useQuery({
        queryKey: ['conversations', 'awaiting_human', 'briefing'],
        queryFn: async () => (await chatAPI.conversations({ status: 'awaiting_human', limit: 100 })).data as ConversationsListResponse,
        staleTime: 30_000,
    });
    const channelsQuery = useQuery({
        queryKey: ['channel-activity'],
        queryFn: async () => (await channelsAPI.list()).data as ChannelActivity[],
        staleTime: 30_000,
    });

    // Stable identities so the memos below don't recompute on every render.
    const clients = useMemo(() => clientsQuery.data ?? [], [clientsQuery.data]);
    const projects = useMemo(() => projectsQuery.data ?? [], [projectsQuery.data]);
    const awaiting = useMemo(() => awaitingQuery.data?.conversations ?? [], [awaitingQuery.data]);
    const channels = useMemo(() => channelsQuery.data ?? [], [channelsQuery.data]);
    const stats = statsQuery.data;

    const isPending = clientsQuery.isPending || projectsQuery.isPending || statsQuery.isPending;
    const isError = clientsQuery.isError || projectsQuery.isError || statsQuery.isError;
    const retry = () => { clientsQuery.refetch(); projectsQuery.refetch(); statsQuery.refetch(); };

    const activeProjects = projects.filter(p => p.status === 'active');
    const dailyCounts = useMemo(
        () => (stats?.messages_by_day ?? []).map(d => d.count),
        [stats],
    );
    const messagesSpark = sparkline(dailyCounts);

    // Deliberately not memoised: "quiet" is relative to the current time, so
    // caching it against `channels` alone would freeze the answer.
    const quietChannels = channels.filter(isQuietChannel);

    /* ── Briefing — every item below is derived from a real endpoint. When
       there is genuinely nothing to report, it says so rather than inventing
       a priority. ── */
    const priorities = (() => {
        const out: { key: string; text: string; cta: string; href: string }[] = [];
        if (awaiting.length > 0) {
            out.push({
                key: 'awaiting',
                text: `${awaiting.length} conversation${awaiting.length === 1 ? '' : 's'} handed back to you — ${awaiting.slice(0, 2).map(c => c.client_name).join(', ')}${awaiting.length > 2 ? ` and ${awaiting.length - 2} more` : ''}.`,
                cta: 'Review',
                href: '/messages',
            });
        }
        if (quietChannels.length > 0) {
            out.push({
                key: 'quiet',
                text: `${quietChannels.length} channel${quietChannels.length === 1 ? ' has' : 's have'} gone quiet for ${QUIET_AFTER_DAYS}+ days.`,
                cta: 'View channels',
                href: '/channels',
            });
        }
        const clientsWithoutProject = clients.filter(c => !projects.some(p => p.client_id === c.id));
        if (clientsWithoutProject.length > 0) {
            out.push({
                key: 'no-project',
                text: `${clientsWithoutProject.length} client${clientsWithoutProject.length === 1 ? ' has' : 's have'} no project yet.`,
                cta: 'View clients',
                href: '/clients',
            });
        }
        return out;
    })();

    const feedItems: FeedItem[] = useMemo(() => {
        const fromAI: FeedItem[] = (stats?.recent_ai_messages ?? []).map((m, i) => ({
            key: `ai-${i}`, kind: 'ai',
            title: `Voxly replied to ${m.client_name}`,
            subtitle: `${m.response_length} chars`,
            source: (m.provider?.split('-')[0] ?? 'AI').toUpperCase(),
            ts: m.timestamp, unread: true,
        }));
        const fromActivity: FeedItem[] = (stats?.recent_activity ?? []).map((a, i) => ({
            key: `act-${i}`, kind: classifyActivity(a.type),
            title: a.title, subtitle: '', source: a.type, ts: a.timestamp,
        }));
        return [...fromAI, ...fromActivity].sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());
    }, [stats]);

    const filteredFeed = feedItems.filter(item => {
        if (feedFilter === 'All') return true;
        if (feedFilter === 'AI') return item.kind === 'ai';
        if (feedFilter === 'GitHub') return item.kind === 'github';
        if (feedFilter === 'Channels') return item.kind === 'whatsapp';
        return true;
    });

    const feedGroups = useMemo(() => {
        const groups: { label: string; items: FeedItem[] }[] = [];
        for (const item of filteredFeed) {
            const label = bucketOf(item.ts);
            const last = groups[groups.length - 1];
            if (last && last.label === label) last.items.push(item);
            else groups.push({ label, items: [item] });
        }
        return groups;
    }, [filteredFeed]);

    /* ── Executive snapshot — six real measures. Revenue, uptime, and
       automation-success tiles are gone: no billing, monitoring, or automation
       endpoint exists, and a hardcoded figure is worse than an absent one. ── */
    const tiles = [
        {
            label: 'CLIENTS', value: fmt(stats?.total_clients ?? clients.length),
            note: `${stats?.active_clients ?? clients.length} active`,
            delta: stats?.clients_delta, spark: messagesSpark,
        },
        {
            label: 'PROJECTS', value: fmt(stats?.total_projects ?? projects.length),
            note: `${stats?.active_projects ?? activeProjects.length} active`,
            delta: stats?.projects_delta, spark: messagesSpark,
        },
        {
            label: 'AI CONVOS', value: fmt(stats?.total_messages ?? 0),
            note: `${fmt(stats?.messages_this_month ?? 0)} this month`,
            deltaPct: stats?.messages_delta_pct, spark: messagesSpark,
        },
        {
            label: 'LAST 7 DAYS', value: fmt(dailyCounts.reduce((a, b) => a + b, 0)),
            note: 'messages received', spark: messagesSpark,
        },
        {
            label: 'AI ACCURACY', value: `${stats?.ai_accuracy ?? 0}%`,
            note: 'replies with project context', spark: messagesSpark,
        },
        {
            label: 'CHANNELS', value: fmt(channels.length),
            note: `${channels.filter(a => a.volume_today > 0).length} active today`, spark: messagesSpark,
        },
    ];

    if (isError) {
        return (
            <div className="flex flex-col items-center justify-center py-24 text-center">
                <AlertTriangle className="w-8 h-8 text-voxly-heat mb-3" />
                <h2 className="text-sm font-semibold text-foreground mb-1">Couldn&apos;t load your dashboard</h2>
                <p className="text-xs text-voxly-ink-5 max-w-sm mb-4">One or more services did not respond.</p>
                <Button onClick={retry} className="bg-secondary hover:bg-accent text-foreground border border-voxly-ink-4">
                    <RefreshCw className="w-3.5 h-3.5 mr-2" />Try again
                </Button>
            </div>
        );
    }

    return (
        <div className="flex flex-col xl:flex-row gap-6 items-start">

            {/* ── CENTER ── */}
            <div className="flex-1 min-w-0 w-full flex flex-col gap-4">

                {/* Briefing */}
                <div className="rounded-[14px] border border-voxly-violet/30 bg-voxly-violet-soft px-[18px] py-4">
                    <div className="flex items-center gap-[9px] mb-3.5">
                        <span className="relative w-[22px] h-[22px] flex-none">
                            <span className="absolute inset-0 rounded-full bg-voxly-violet" />
                            <span className="absolute -inset-[3px] rounded-full border-[1.5px] border-voxly-violet animate-pulse" />
                        </span>
                        <span className="font-display font-semibold text-[13px] text-foreground">Today&apos;s Briefing</span>
                        <span className="text-[11.5px] text-voxly-ink-5">
                            {new Date().toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
                        </span>
                    </div>

                    <div className="font-mono text-[9.5px] font-bold tracking-[0.07em] text-voxly-violet mb-2">PRIORITIES</div>
                    {isPending ? (
                        <div className="space-y-2">
                            {[1, 2].map(k => <div key={k} className="h-6 bg-white/5 rounded animate-pulse" />)}
                        </div>
                    ) : priorities.length === 0 ? (
                        <div className="flex items-center gap-2 text-[12.5px] text-foreground/90">
                            <Check className="w-3.5 h-3.5 text-voxly-success flex-none" />
                            All clear — nothing is waiting on you right now.
                        </div>
                    ) : (
                        <div className="flex flex-col gap-2">
                            {priorities.map((p, i) => (
                                <div key={p.key} className="flex items-center gap-2.5">
                                    <span className="font-mono text-[10px] font-bold text-voxly-violet flex-none w-3.5">{String(i + 1).padStart(2, '0')}</span>
                                    <span className="flex-1 text-[12.5px] leading-relaxed text-foreground/90">{p.text}</span>
                                    <Link href={p.href} className="flex-none text-[11px] font-semibold text-voxly-violet border border-voxly-violet/40 hover:bg-voxly-violet-soft rounded-md px-2.5 py-[3px] transition-colors">
                                        {p.cta}
                                    </Link>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Signal Feed header */}
                <div className="flex items-center gap-4">
                    <span className="font-display font-semibold text-[15px] text-foreground">Signal Feed</span>
                    <div className="flex-1" />
                    <div className="flex gap-1.5">
                        {(['All', 'AI', 'GitHub', 'Channels'] as const).map(f => (
                            <button
                                key={f}
                                onClick={() => setFeedFilter(f)}
                                className={`text-[11.5px] rounded-full px-[11px] py-[5px] transition-colors ${
                                    feedFilter === f
                                        ? 'font-semibold text-primary-foreground bg-primary'
                                        : 'text-voxly-ink-6 border border-border hover:border-voxly-ink-4 hover:text-foreground'
                                }`}>
                                {f}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Signal Feed list */}
                <div className="rounded-[14px] border border-border bg-card overflow-hidden">
                    {isPending ? (
                        <div className="p-4 space-y-2">
                            {[1, 2, 3, 4].map(k => <div key={k} className="h-11 bg-secondary rounded-lg animate-pulse" />)}
                        </div>
                    ) : feedGroups.length === 0 ? (
                        <EmptyState icon={Sparkles} title="No activity yet" description="AI replies, GitHub events, and messages will show up here as they happen." href="/clients" label="View clients" />
                    ) : (
                        feedGroups.map(group => (
                            <div key={group.label}>
                                <div className="px-4 py-2 bg-voxly-surface-2 font-mono text-[9.5px] font-bold tracking-[0.07em] text-voxly-ink-5">{group.label}</div>
                                {group.items.map(item => {
                                    const style = FEED_STYLE[item.kind];
                                    return (
                                        <div key={item.key} className="flex items-center gap-3 px-4 py-[11px] border-b border-border last:border-b-0 hover:bg-white/[0.02] transition-colors">
                                            <span className={`w-[3px] h-7 rounded-sm flex-none ${style.bar}`} />
                                            <span className={`w-7 h-7 rounded-lg bg-voxly-surface-2 flex items-center justify-center flex-none ${style.iconBg}`}>
                                                {style.icon}
                                            </span>
                                            <div className="flex-1 min-w-0">
                                                <div className="text-[13px] text-foreground font-medium truncate">{item.title}</div>
                                                {item.subtitle && <div className="text-[11.5px] text-voxly-ink-5 truncate">{item.subtitle}</div>}
                                            </div>
                                            <span className="text-[9.5px] uppercase tracking-wide text-voxly-ink-5 flex-none">{item.source}</span>
                                            {item.unread && <span className="w-1.5 h-1.5 rounded-full bg-primary flex-none" />}
                                            <span className="font-mono text-[11px] text-voxly-ink-5 flex-none w-7 text-right">{timeAgo(item.ts)}</span>
                                        </div>
                                    );
                                })}
                            </div>
                        ))
                    )}
                </div>
            </div>

            {/* ── RIGHT ── */}
            <div className="w-full xl:w-80 flex-none flex flex-col gap-3.5">

                <Panel title="Executive Snapshot">
                    <div className="px-3 pb-3 grid grid-cols-2 gap-2">
                        {tiles.map(tile => {
                            const delta = tile.delta;
                            const deltaPct = tile.deltaPct;
                            const trendUp = (delta ?? deltaPct ?? 0) > 0;
                            const trendDown = (delta ?? deltaPct ?? 0) < 0;
                            return (
                                <div key={tile.label} className="border border-border rounded-[10px] px-[10px] py-[9px]">
                                    <div className="flex justify-between items-start">
                                        <div className="min-w-0">
                                            <div className="font-mono text-[8px] font-semibold tracking-[0.04em] text-voxly-ink-5">{tile.label}</div>
                                            <div className="font-display font-bold text-[17px] text-foreground tabular-nums">{tile.value}</div>
                                        </div>
                                        {tile.spark && (
                                            <svg width="34" height="16" viewBox="0 0 34 16" className="flex-none mt-0.5">
                                                <polyline points={tile.spark} fill="none" className="stroke-voxly-violet" strokeWidth="1.6" />
                                            </svg>
                                        )}
                                    </div>
                                    <div className="text-[9px] mt-0.5 text-voxly-ink-6 flex items-center gap-1">
                                        {trendUp && <TrendingUp className="w-2.5 h-2.5 text-voxly-success flex-none" />}
                                        {trendDown && <TrendingDown className="w-2.5 h-2.5 text-voxly-heat flex-none" />}
                                        <span className="truncate">
                                            {delta != null && delta !== 0 && `${delta > 0 ? '+' : ''}${delta} vs last month · `}
                                            {deltaPct != null && deltaPct !== 0 && `${deltaPct > 0 ? '+' : ''}${deltaPct}% · `}
                                            {tile.note}
                                        </span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </Panel>

                <Panel title="AI Infrastructure">
                    <div className="pb-1">
                        <PanelRow dot={stats?.integrations.github ? 'bg-voxly-success' : 'bg-voxly-ink-4'} label="GitHub" value={stats?.integrations.github ? 'connected' : 'not connected'} />
                        <PanelRow dot={stats?.integrations.whatsapp ? 'bg-voxly-success' : 'bg-voxly-ink-4'} label="WhatsApp" value={stats?.integrations.whatsapp ? 'connected' : 'not connected'} />
                        <PanelRow dot={stats?.integrations.telegram ? 'bg-voxly-success' : 'bg-voxly-ink-4'} label="Telegram" value={stats?.integrations.telegram ? 'connected' : 'not connected'} />
                        <PanelRow dot={stats?.integrations.ai_provider && stats.integrations.ai_provider !== 'none' ? 'bg-voxly-success' : 'bg-voxly-ink-4'} label="AI Provider" value={<span className="font-mono">{stats?.integrations.ai_provider ?? 'none'}</span>} />
                        <PanelRow dot="bg-voxly-ink-5" label="Messages this month" value={fmt(stats?.messages_this_month ?? 0)} />
                        <PanelRow dot="bg-voxly-ink-5" label="Messages last month" value={fmt(stats?.messages_last_month ?? 0)} />
                    </div>
                </Panel>

                <Panel
                    title="Needs Attention"
                    defaultOpen={awaiting.length > 0}
                    badge={awaiting.length > 0
                        ? <span className="text-[10.5px] bg-voxly-warning-soft text-voxly-warning px-[7px] py-[1px] rounded-full">{awaiting.length}</span>
                        : undefined}
                >
                    <div className="pb-1">
                        {awaiting.length === 0 ? (
                            <div className="px-3 py-3 text-[11.5px] text-voxly-ink-5">No conversation is waiting on a human.</div>
                        ) : (
                            awaiting.slice(0, 5).map(c => (
                                <div key={c.client_id} className="flex items-center gap-2 px-3 py-[7px] border-t border-border">
                                    <span className="w-1.5 h-1.5 rounded-full bg-voxly-warning flex-none" />
                                    <Link href="/messages" className="flex-1 text-[11.5px] text-foreground/90 truncate hover:text-primary transition-colors">
                                        {c.client_name}
                                    </Link>
                                    <span className="text-[11px] text-voxly-ink-5">{timeAgo(c.last_message_at)}</span>
                                </div>
                            ))
                        )}
                    </div>
                </Panel>

                <Panel title="Channels" defaultOpen={false} badge={<span className="text-[10.5px] bg-voxly-surface-3 text-voxly-ink-6 px-[7px] py-[1px] rounded-full">{channels.length}</span>}>
                    <div className="pb-1">
                        {channels.length === 0 ? (
                            <div className="px-3 py-3 text-[11.5px] text-voxly-ink-5">No channel activity yet</div>
                        ) : (
                            <>
                                <PanelRow dot="bg-voxly-success" label={<span className="flex items-center gap-1.5"><Radio className="w-3 h-3" />Active today</span>} value={channels.filter(a => a.volume_today > 0).length} />
                                <PanelRow dot="bg-voxly-warning" label={`Quiet ${QUIET_AFTER_DAYS}d+`} value={quietChannels.length} />
                                <PanelRow dot="bg-voxly-ink-5" label="Messages today" value={channels.reduce((n, a) => n + a.volume_today, 0)} />
                            </>
                        )}
                    </div>
                </Panel>

                <Panel title="Projects" defaultOpen={false} badge={<span className="text-[10.5px] bg-voxly-surface-3 text-voxly-ink-6 px-[7px] py-[1px] rounded-full">{projects.length}</span>}>
                    <div className="pb-1">
                        {projectsQuery.isPending ? (
                            <div className="px-3 py-2"><div className="h-8 bg-secondary rounded-lg animate-pulse" /></div>
                        ) : projects.length === 0 ? (
                            <div className="px-3 py-3 text-[11.5px] text-voxly-ink-5">No projects yet</div>
                        ) : (
                            projects.slice(0, 5).map(p => (
                                <div key={p.id} className="flex items-center gap-2 px-3 py-[7px] border-t border-border">
                                    <span className="flex-1 font-mono text-[11.5px] text-foreground truncate">{p.name}</span>
                                    <span className={`w-1.5 h-1.5 rounded-full flex-none ${p.status === 'active' ? 'bg-voxly-success' : p.status === 'paused' ? 'bg-voxly-warning' : 'bg-voxly-ink-4'}`} />
                                </div>
                            ))
                        )}
                    </div>
                </Panel>

                <Panel title="Clients" defaultOpen={false} badge={<span className="text-[10.5px] bg-voxly-surface-3 text-voxly-ink-6 px-[7px] py-[1px] rounded-full">{clients.length}</span>}>
                    <div className="pb-1">
                        {clients.length === 0 ? (
                            <div className="px-3 py-3 text-[11.5px] text-voxly-ink-5">No clients yet</div>
                        ) : (
                            clients.slice(0, 5).map(c => (
                                <div key={c.id} className="flex items-center gap-2 px-3 py-[7px] border-t border-border">
                                    <Users className="w-3 h-3 text-voxly-ink-5 flex-none" />
                                    <Link href={`/clients/${c.id}`} className="flex-1 text-[11.5px] text-foreground truncate hover:text-primary transition-colors">{c.name}</Link>
                                </div>
                            ))
                        )}
                    </div>
                </Panel>
            </div>
        </div>
    );
}
