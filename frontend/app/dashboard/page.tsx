'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { aiKeysAPI, chatAPI, channelsAPI, dashboardAPI, projectsAPI } from '@/lib/api';
import { clientsQuery as clientsQueryOptions } from '@/lib/queries';
import {
    Sparkles, AlertTriangle, Check, ArrowRight,
    Users, MessageSquare, Code2, Radio, TrendingUp, TrendingDown,
    RefreshCw,
} from 'lucide-react';
import EmptyState from '@/components/EmptyState';
import { Button } from '@/components/ui/button';
import { Panel, PanelRow, PanelText } from '@/components/SidePanel';
import { QUIET_AFTER_DAYS, isQuietChannel } from '@/lib/channelActivity';
import { describeMonthOverMonth, isThisMonth } from '@/lib/utils';
import type { ChannelActivity, ConversationsListResponse, DashboardStats, Project } from '@/types';

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

/** SVG polyline from the backend's real 7-day message histogram. Only the
 *  message tiles get one — the clients/projects/channels tiles used to draw
 *  this same series, implying trends that were never measured. */
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

type FeedItem = { key: string; kind: 'ai' | 'github' | 'whatsapp' | 'task' | 'other'; title: string; subtitle: string; source: string; ts: string };

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

// ─── Setup checklist ─────────────────────────────────────────────────────────

interface SetupStep { key: string; title: string; detail: string; done: boolean; href: string; cta: string }

/**
 * First-run guidance. A brand-new workspace used to land on "All clear" and a
 * wall of zeros. Every step's state is derived from data already fetched, and
 * the card disappears once all steps are done.
 */
function SetupChecklist({ steps }: { steps: SetupStep[] }) {
    const done = steps.filter((s) => s.done).length;
    if (done === steps.length) return null;
    const next = steps.find((s) => !s.done);
    return (
        <section aria-labelledby="setup-title" className="rounded-[14px] border border-primary/30 bg-voxly-lime-soft px-[18px] py-4" data-testid="setup-checklist">
            <div className="flex items-center justify-between gap-3 mb-1">
                <h2 id="setup-title" className="font-display font-semibold text-[14px] text-foreground">Get Voxly answering your clients</h2>
                <span className="font-mono text-[11px] font-semibold text-primary tabular-nums">{done} of {steps.length} done</span>
            </div>
            <div className="h-1 rounded-full bg-voxly-surface-3 overflow-hidden mb-3.5" role="progressbar" aria-valuenow={done} aria-valuemin={0} aria-valuemax={steps.length} aria-label="Setup progress">
                <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${(done / steps.length) * 100}%` }} />
            </div>
            <ol className="flex flex-col gap-1.5">
                {steps.map((s, i) => (
                    <li key={s.key} className={`flex items-center gap-3 rounded-lg px-2.5 py-2 ${s.key === next?.key ? 'bg-background/60' : ''}`}>
                        <span
                            className={`w-5 h-5 rounded-full flex items-center justify-center flex-none text-[10px] font-bold ${
                                s.done ? 'bg-primary text-primary-foreground' : 'border border-voxly-ink-4 text-voxly-ink-6'
                            }`}
                            aria-hidden="true"
                        >
                            {s.done ? <Check className="w-3 h-3" /> : i + 1}
                        </span>
                        <div className="flex-1 min-w-0">
                            <div className={`text-[13px] font-medium ${s.done ? 'text-voxly-ink-5 line-through' : 'text-foreground'}`}>
                                {s.title}
                                <span className="sr-only">{s.done ? ' (done)' : ' (to do)'}</span>
                            </div>
                            {!s.done && <div className="text-[11.5px] text-voxly-ink-5">{s.detail}</div>}
                        </div>
                        {!s.done && (
                            <Link
                                href={s.href}
                                className={`flex-none inline-flex items-center gap-1 text-[11.5px] font-semibold rounded-md px-2.5 py-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                                    s.key === next?.key
                                        ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                                        : 'text-voxly-ink-6 border border-border hover:border-voxly-ink-4 hover:text-foreground'
                                }`}
                            >
                                {s.cta} <ArrowRight className="w-3 h-3" />
                            </Link>
                        )}
                    </li>
                ))}
            </ol>
        </section>
    );
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

export default function DashboardPage() {
    const [feedFilter, setFeedFilter] = useState<'All' | 'AI' | 'GitHub' | 'Channels'>('All');

    const clientsQuery = useQuery({ ...clientsQueryOptions });
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
    // Only for the setup checklist: a workspace's own BYOK key also makes AI
    // replies work when the platform has no provider configured.
    const aiKeysQuery = useQuery({
        queryKey: ['ai-keys'],
        queryFn: async () => (await aiKeysAPI.list()).data as { is_active: boolean }[],
        staleTime: 60_000,
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

    const dailyCounts = useMemo(() => (stats?.messages_by_day ?? []).map((d) => d.count), [stats]);
    const messagesSpark = sparkline(dailyCounts);

    // Deliberately not memoised: "quiet" is relative to the current time, so
    // caching it against `channels` alone would freeze the answer.
    const quietChannels = channels.filter(isQuietChannel);

    const aiReady =
        (!!stats && stats.integrations.ai_provider !== 'none') || (aiKeysQuery.data ?? []).some((k) => k.is_active);
    const setupSteps: SetupStep[] = [
        { key: 'client', title: 'Add your first client', detail: 'Their WhatsApp number is how Voxly reaches them.', done: clients.length > 0, href: '/clients?new=1', cta: 'Add client' },
        { key: 'project', title: 'Create a project', detail: 'Projects are what Voxly reports progress on.', done: projects.length > 0, href: '/projects?new=1', cta: 'New project' },
        { key: 'repo', title: 'Link a GitHub repo', detail: 'Lets Voxly answer “how’s it going?” with real commits and issues.', done: projects.some((p) => !!p.github_repo), href: '/projects', cta: 'Open projects' },
        { key: 'ai', title: 'Make sure AI replies are ready', detail: 'Add your own provider key — no platform AI provider is configured.', done: aiReady, href: '/settings/ai-defaults', cta: 'Add key' },
        { key: 'message', title: 'Receive your first client message', detail: 'Ask a client to message your WhatsApp or Telegram number.', done: channels.length > 0, href: '/channels', cta: 'See channels' },
    ];
    const setupLoaded = !isPending && !channelsQuery.isPending && !aiKeysQuery.isPending;

    /* ── Briefing — every item below is derived from a real endpoint. When
       there is genuinely nothing to report, it says so rather than inventing
       a priority. ── */
    const priorities = (() => {
        const out: { key: string; text: string; cta: string; href: string }[] = [];
        if (awaiting.length > 0) {
            out.push({
                key: 'awaiting',
                text: `${awaiting.length} conversation${awaiting.length === 1 ? '' : 's'} handed back to you — ${awaiting.slice(0, 2).map((c) => c.client_name).join(', ')}${awaiting.length > 2 ? ` and ${awaiting.length - 2} more` : ''}.`,
                cta: 'Review',
                href: awaiting.length === 1 ? `/messages?client=${awaiting[0].client_id}` : '/messages?status=awaiting_human',
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
        const clientsWithoutProject = clients.filter((c) => !projects.some((p) => p.client_id === c.id));
        if (clientsWithoutProject.length > 0) {
            out.push({
                key: 'no-project',
                text: `${clientsWithoutProject.length} client${clientsWithoutProject.length === 1 ? ' has' : 's have'} no project yet.`,
                cta: clientsWithoutProject.length === 1 ? 'Add project' : 'View clients',
                href: clientsWithoutProject.length === 1 ? `/clients/${clientsWithoutProject[0].id}` : '/clients',
            });
        }
        return out;
    })();

    const feedItems: FeedItem[] = useMemo(() => {
        // No per-item "unread" dot: nothing tracks what the user has read, so
        // the old always-on dot was a signal that meant nothing.
        const fromAI: FeedItem[] = (stats?.recent_ai_messages ?? []).map((m, i) => ({
            key: `ai-${i}`, kind: 'ai',
            title: `Voxly replied to ${m.client_name}`,
            subtitle: `${m.response_length} chars`,
            source: (m.provider?.split('-')[0] ?? 'AI').toUpperCase(),
            ts: m.timestamp,
        }));
        const fromActivity: FeedItem[] = (stats?.recent_activity ?? []).map((a, i) => ({
            key: `act-${i}`, kind: classifyActivity(a.type),
            title: a.title, subtitle: '', source: a.type, ts: a.timestamp,
        }));
        return [...fromAI, ...fromActivity].sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());
    }, [stats]);

    const filteredFeed = feedItems.filter((item) => {
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

    /* ── Executive snapshot — six real measures. Deltas come from raw counts:
       clients_delta/projects_delta are differences of monthly signups (not
       counts) and messages_delta_pct is a sentinel 100.0 when last month was
       empty, so none of them are rendered directly. ── */
    const month = stats ? describeMonthOverMonth(stats.messages_this_month, stats.messages_last_month) : null;
    const newClients = clients.filter((c) => isThisMonth(c.created_at)).length;
    const newProjects = projects.filter((p) => isThisMonth(p.created_at)).length;
    const tiles: { label: string; value: string; note: string; tone?: 'muted' | 'good' | 'warn'; spark?: string; href?: string; title?: string }[] = [
        {
            label: 'CLIENTS', value: fmt(stats?.total_clients ?? clients.length), href: '/clients',
            note: `${stats?.active_clients ?? clients.length} active · ${newClients} new this month`,
        },
        {
            label: 'PROJECTS', value: fmt(stats?.total_projects ?? projects.length), href: '/projects',
            note: `${stats?.active_projects ?? 0} active · ${newProjects} new this month`,
        },
        {
            label: 'MESSAGES', value: fmt(stats?.messages_this_month ?? 0), href: '/analytics',
            note: month ? `this month · ${month.text}` : 'this month', tone: month?.tone, spark: messagesSpark,
        },
        {
            label: 'LAST 7 DAYS', value: fmt(dailyCounts.reduce((a, b) => a + b, 0)),
            note: `messages · ${fmt(stats?.total_messages ?? 0)} all-time`, spark: messagesSpark,
        },
        {
            label: 'WITH PROJECT DATA', value: stats && stats.total_messages > 0 ? `${stats.ai_accuracy}%` : '—',
            note: 'of messages answered', title: 'Messages where Voxly found the client’s project to answer from.',
        },
        {
            label: 'CHANNELS', value: fmt(channels.length), href: '/channels',
            note: `client connections · ${channels.filter((a) => a.volume_today > 0).length} active today`,
        },
    ];

    if (isError) {
        return (
            <div className="flex flex-col items-center justify-center py-24 text-center">
                <AlertTriangle className="w-8 h-8 text-voxly-heat mb-3" />
                <h2 className="text-sm font-semibold text-foreground mb-1">Couldn&apos;t load your dashboard</h2>
                <p className="text-xs text-voxly-ink-5 max-w-sm mb-4">One or more services did not respond.</p>
                <Button onClick={retry} variant="outline" className="gap-2">
                    <RefreshCw className="w-3.5 h-3.5" />Try again
                </Button>
            </div>
        );
    }

    const integrationRows = stats
        ? [
            { label: 'GitHub', on: stats.integrations.github },
            { label: 'WhatsApp', on: stats.integrations.whatsapp },
            { label: 'Telegram', on: stats.integrations.telegram },
            { label: 'AI provider', on: stats.integrations.ai_provider !== 'none', value: stats.integrations.ai_provider },
        ]
        : [];
    const anyIntegrationOff = integrationRows.some((r) => !r.on);

    return (
        <div className="flex flex-col xl:flex-row gap-6 items-start">

            {/* ── CENTER ── */}
            <div className="flex-1 min-w-0 w-full flex flex-col gap-4">

                {setupLoaded && <SetupChecklist steps={setupSteps} />}

                {/* Briefing */}
                <div className="rounded-[14px] border border-voxly-violet/30 bg-voxly-violet-soft px-[18px] py-4">
                    <div className="flex items-center gap-[9px] mb-3.5">
                        <span className="relative w-[22px] h-[22px] flex-none" aria-hidden="true">
                            <span className="absolute inset-0 rounded-full bg-voxly-violet" />
                            <span className="absolute -inset-[3px] rounded-full border-[1.5px] border-voxly-violet motion-safe:animate-pulse" />
                        </span>
                        <h1 className="font-display font-semibold text-[13px] text-foreground">Today&apos;s Briefing</h1>
                        <span className="text-[11.5px] text-voxly-ink-5">
                            {new Date().toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
                        </span>
                    </div>

                    <div className="font-mono text-[9.5px] font-bold tracking-[0.07em] text-voxly-violet mb-2">PRIORITIES</div>
                    {isPending ? (
                        <div className="space-y-2">
                            {[1, 2].map((k) => <div key={k} className="h-6 bg-white/5 rounded animate-pulse" />)}
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
                                    <Link href={p.href} className="flex-none text-[11px] font-semibold text-voxly-violet border border-voxly-violet/40 hover:bg-voxly-violet-soft rounded-md px-2.5 py-[3px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                                        {p.cta}
                                    </Link>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Signal Feed header */}
                <div className="flex items-center gap-4">
                    <h2 className="font-display font-semibold text-[15px] text-foreground">Signal Feed</h2>
                    <div className="flex-1" />
                    <div className="flex gap-1.5" role="group" aria-label="Filter feed">
                        {(['All', 'AI', 'GitHub', 'Channels'] as const).map((f) => (
                            <button
                                key={f}
                                onClick={() => setFeedFilter(f)}
                                aria-pressed={feedFilter === f}
                                className={`text-[11.5px] rounded-full px-[11px] py-[5px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
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
                            {[1, 2, 3, 4].map((k) => <div key={k} className="h-11 bg-secondary rounded-lg animate-pulse" />)}
                        </div>
                    ) : feedGroups.length === 0 ? (
                        feedFilter === 'All' ? (
                            <EmptyState icon={Sparkles} title="No activity yet" description="AI replies, new clients and projects, and client messages will show up here as they happen." href="/clients" label="View clients" />
                        ) : (
                            <div className="px-4 py-10 text-center text-[12.5px] text-voxly-ink-5">
                                Nothing in {feedFilter} yet.{' '}
                                <button onClick={() => setFeedFilter('All')} className="text-primary hover:underline">Show all</button>
                            </div>
                        )
                    ) : (
                        feedGroups.map((group) => (
                            <div key={group.label}>
                                <div className="px-4 py-2 bg-voxly-surface-2 font-mono text-[9.5px] font-bold tracking-[0.07em] text-voxly-ink-5">{group.label}</div>
                                {group.items.map((item) => {
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
                    <div className="px-3 pb-3 grid grid-cols-2 gap-2" data-testid="snapshot-tiles">
                        {tiles.map((tile) => {
                            const body = (
                                <>
                                    <div className="flex justify-between items-start">
                                        <div className="min-w-0">
                                            <div className="font-mono text-[8px] font-semibold tracking-[0.04em] text-voxly-ink-5">{tile.label}</div>
                                            <div className="font-display font-bold text-[17px] text-foreground tabular-nums">{tile.value}</div>
                                        </div>
                                        {tile.spark && (
                                            <svg width="34" height="16" viewBox="0 0 34 16" className="flex-none mt-0.5" aria-hidden="true" data-testid="sparkline">
                                                <polyline points={tile.spark} fill="none" className="stroke-voxly-violet" strokeWidth="1.6" />
                                            </svg>
                                        )}
                                    </div>
                                    <div
                                        className={`text-[9px] mt-0.5 flex items-center gap-1 ${
                                            tile.tone === 'good' ? 'text-voxly-success' : tile.tone === 'warn' ? 'text-voxly-warning' : 'text-voxly-ink-6'
                                        }`}
                                    >
                                        {tile.tone === 'good' && <TrendingUp className="w-2.5 h-2.5 flex-none" />}
                                        {tile.tone === 'warn' && <TrendingDown className="w-2.5 h-2.5 flex-none" />}
                                        <span className="truncate">{tile.note}</span>
                                    </div>
                                </>
                            );
                            const cls = 'block border border-border rounded-[10px] px-[10px] py-[9px] min-w-0';
                            return tile.href ? (
                                <Link key={tile.label} href={tile.href} title={tile.title} className={`${cls} hover:border-voxly-ink-4 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring`}>
                                    {body}
                                </Link>
                            ) : (
                                <div key={tile.label} title={tile.title} className={cls}>{body}</div>
                            );
                        })}
                    </div>
                </Panel>

                <Panel title="AI Infrastructure">
                    {stats ? (
                        <>
                            {integrationRows.map((r) => (
                                <PanelRow
                                    key={r.label}
                                    dot={r.on ? 'bg-voxly-success' : 'bg-voxly-ink-4'}
                                    label={r.label}
                                    value={r.value && r.on ? <span className="font-mono font-normal">{r.value}</span> : r.on ? 'connected' : 'not connected'}
                                />
                            ))}
                            <PanelRow dot="bg-voxly-ink-5" label="Messages this month" value={fmt(stats.messages_this_month)} />
                            <PanelRow dot="bg-voxly-ink-5" label="Messages last month" value={fmt(stats.messages_last_month)} />
                            {/* Diagnosing "not connected" without a way forward was a dead end. */}
                            {anyIntegrationOff && (
                                <PanelText>
                                    These are platform connections.{' '}
                                    <Link href="/settings/organization" className="text-primary hover:underline">See what each one needs →</Link>
                                </PanelText>
                            )}
                        </>
                    ) : (
                        <PanelText>Loading…</PanelText>
                    )}
                </Panel>

                <Panel
                    title="Needs Attention"
                    defaultOpen={awaiting.length > 0}
                    badge={awaiting.length > 0
                        ? <span className="text-[10.5px] bg-voxly-warning-soft text-voxly-warning px-[7px] py-[1px] rounded-full">{awaiting.length}</span>
                        : undefined}
                >
                    {awaiting.length === 0 ? (
                        <PanelText>No conversation is waiting on a human.</PanelText>
                    ) : (
                        <div className="pb-1">
                            {awaiting.slice(0, 5).map((c) => (
                                <Link
                                    key={c.client_id}
                                    href={`/messages?client=${c.client_id}`}
                                    className="flex items-center gap-2 px-3.5 py-[7px] border-t border-border first:border-t-0 hover:bg-white/[0.02] transition-colors"
                                >
                                    <span className="w-1.5 h-1.5 rounded-full bg-voxly-warning flex-none" />
                                    <span className="flex-1 text-[11.5px] text-foreground/90 truncate">{c.client_name}</span>
                                    <span className="text-[11px] text-voxly-ink-5">{timeAgo(c.last_message_at)}</span>
                                </Link>
                            ))}
                        </div>
                    )}
                </Panel>

                <Panel title="Channels" defaultOpen={false} badge={<span className="text-[10.5px] bg-voxly-surface-3 text-voxly-ink-6 px-[7px] py-[1px] rounded-full">{channels.length}</span>}>
                    {channels.length === 0 ? (
                        <PanelText>No channel activity yet.</PanelText>
                    ) : (
                        <>
                            <PanelRow dot="bg-voxly-success" label={<span className="flex items-center gap-1.5"><Radio className="w-3 h-3" />Active today</span>} value={channels.filter((a) => a.volume_today > 0).length} />
                            <PanelRow dot="bg-voxly-warning" label={`Quiet ${QUIET_AFTER_DAYS}d+`} value={quietChannels.length} />
                            <PanelRow dot="bg-voxly-ink-5" label="Messages today" value={channels.reduce((n, a) => n + a.volume_today, 0)} />
                        </>
                    )}
                </Panel>

                <Panel title="Projects" defaultOpen={false} badge={<span className="text-[10.5px] bg-voxly-surface-3 text-voxly-ink-6 px-[7px] py-[1px] rounded-full">{projects.length}</span>}>
                    {projectsQuery.isPending ? (
                        <div className="px-3 py-2"><div className="h-8 bg-secondary rounded-lg animate-pulse" /></div>
                    ) : projects.length === 0 ? (
                        <PanelText>No projects yet.</PanelText>
                    ) : (
                        <div className="pb-1">
                            {projects.slice(0, 5).map((p) => (
                                <Link
                                    key={p.id}
                                    href={`/clients/${p.client_id}/projects/${p.id}/milestones`}
                                    className="flex items-center gap-2 px-3.5 py-[7px] border-t border-border first:border-t-0 hover:bg-white/[0.02] transition-colors"
                                >
                                    <span className="flex-1 text-[11.5px] text-foreground truncate">{p.name}</span>
                                    <span className={`w-1.5 h-1.5 rounded-full flex-none ${p.status === 'active' ? 'bg-voxly-success' : p.status === 'paused' ? 'bg-voxly-warning' : 'bg-voxly-ink-4'}`} />
                                </Link>
                            ))}
                        </div>
                    )}
                </Panel>

                <Panel title="Clients" defaultOpen={false} badge={<span className="text-[10.5px] bg-voxly-surface-3 text-voxly-ink-6 px-[7px] py-[1px] rounded-full">{clients.length}</span>}>
                    {clients.length === 0 ? (
                        <PanelText>No clients yet.</PanelText>
                    ) : (
                        <div className="pb-1">
                            {clients.slice(0, 5).map((c) => (
                                <Link
                                    key={c.id}
                                    href={`/clients/${c.id}`}
                                    className="flex items-center gap-2 px-3.5 py-[7px] border-t border-border first:border-t-0 hover:bg-white/[0.02] transition-colors"
                                >
                                    <Users className="w-3 h-3 text-voxly-ink-5 flex-none" />
                                    <span className="flex-1 text-[11.5px] text-foreground truncate">{c.name}</span>
                                </Link>
                            ))}
                        </div>
                    )}
                </Panel>
            </div>
        </div>
    );
}
