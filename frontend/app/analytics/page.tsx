'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { useQueries, useQuery } from '@tanstack/react-query';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { channelsAPI, chatAPI, dashboardAPI, projectsAPI, getApiErrorMessage } from '@/lib/api';
import { clientsQuery } from '@/lib/queries';
import { Button } from '@/components/ui/button';
import { Panel, PanelRow, PanelText } from '@/components/SidePanel';
import type { ChannelActivity, ConversationsListResponse, DashboardStats, Project } from '@/types';

/* Every number on this page comes from an API response. The previous page
   was ~70% invented — revenue, uptime, automation runs, sentiment, AI cost
   and latency, named clients — with hand-drawn sparklines even on the real
   tiles. Metrics the backend doesn't track are listed as "not tracked yet"
   instead of being estimated. */

const STATUS_ROWS = [
    { key: 'awaiting_human', label: 'Awaiting a human', dot: 'bg-voxly-warning' },
    { key: 'ai_handling', label: 'AI handling', dot: 'bg-voxly-violet' },
    { key: 'escalated', label: 'Escalated', dot: 'bg-voxly-heat' },
    { key: 'resolved', label: 'Resolved', dot: 'bg-voxly-success' },
] as const;

const timeAgo = (ts: string) => {
    const m = Math.floor((Date.now() - new Date(ts).getTime()) / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
};

// messages_by_day dates are UTC calendar days — label them in UTC too, or a
// viewer west of UTC sees every bar shifted by a day.
const weekday = (isoDate: string) =>
    new Date(`${isoDate}T00:00:00Z`).toLocaleDateString(undefined, { weekday: 'short', timeZone: 'UTC' });

function Sparkline({ values }: { values: number[] }) {
    if (values.length < 2) return null;
    const w = 56;
    const h = 22;
    const max = Math.max(...values, 1);
    const points = values.map((v, i) => `${(i / (values.length - 1)) * w},${h - 2 - (v / max) * (h - 4)}`).join(' ');
    return (
        <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="flex-none" aria-hidden="true">
            <polyline points={points} fill="none" stroke="hsl(var(--primary))" strokeWidth="1.8" strokeLinejoin="round" />
        </svg>
    );
}

function Tile({
    label,
    value,
    note,
    noteTone = 'muted',
    title,
    href,
    children,
}: {
    label: string;
    value: string;
    note?: React.ReactNode;
    noteTone?: 'muted' | 'good' | 'warn';
    title?: string;
    href?: string;
    children?: React.ReactNode;
}) {
    const toneClass = noteTone === 'good' ? 'text-voxly-success' : noteTone === 'warn' ? 'text-voxly-warning' : 'text-voxly-ink-5';
    const body = (
        <>
            <div className="flex justify-between items-start gap-2">
                <div className="min-w-0">
                    <div className="font-mono text-[9px] font-semibold tracking-[0.04em] uppercase text-voxly-ink-5">{label}</div>
                    <div className="font-display font-bold text-[20px] text-foreground tabular-nums">{value}</div>
                </div>
                {children}
            </div>
            {note && <div className={`text-[10.5px] mt-1 ${toneClass}`}>{note}</div>}
        </>
    );
    const cls = 'block border border-border rounded-[10px] bg-card px-3.5 py-3';
    return href ? (
        <Link href={href} title={title} className={`${cls} hover:border-voxly-ink-4 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring`}>
            {body}
        </Link>
    ) : (
        <div title={title} className={cls}>{body}</div>
    );
}

function Row({ dot, label, value }: { dot: string; label: React.ReactNode; value: React.ReactNode }) {
    return (
        <div className="flex items-center gap-2">
            <span className={`w-[7px] h-[7px] rounded-full flex-none ${dot}`} />
            <span className="flex-1 text-[12.5px] text-voxly-ink-6">{label}</span>
            <span className="font-display font-bold text-[13px] text-foreground tabular-nums">{value}</span>
        </div>
    );
}

function Card({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
    return (
        <section className="border border-border rounded-xl bg-card px-[18px] py-4">
            <div className="flex items-center justify-between gap-3 mb-3">
                <h2 className="font-mono text-[9.5px] font-bold uppercase tracking-wider text-voxly-ink-5">{title}</h2>
                {action}
            </div>
            {children}
        </section>
    );
}

export default function AnalyticsPage() {
    const statsQuery = useQuery({
        queryKey: ['dashboard-stats'],
        queryFn: async () => (await dashboardAPI.stats()).data as DashboardStats,
        staleTime: 30_000,
    });
    const { data: clients = [] } = useQuery(clientsQuery);
    const { data: projects = [] } = useQuery({
        queryKey: ['projects'],
        queryFn: async () => (await projectsAPI.list()).data as Project[],
    });
    const { data: channelActivity = [] } = useQuery({
        queryKey: ['channel-activity'],
        queryFn: async () => (await channelsAPI.list()).data as ChannelActivity[],
        staleTime: 30_000,
    });

    // Real per-status conversation totals: the list endpoint filters by status
    // server-side and returns `total`, so limit=1 is enough. Keyed under
    // ['conversations'] so realtime invalidations elsewhere refresh them.
    const statusTotals = useQueries({
        queries: (['all', ...STATUS_ROWS.map((s) => s.key)] as const).map((status) => ({
            queryKey: ['conversations', 'status-total', status],
            queryFn: async () =>
                (await chatAPI.conversations({ status: status === 'all' ? undefined : status, limit: 1 })).data as ConversationsListResponse,
            staleTime: 30_000,
        })),
    });
    const totalConversations = statusTotals[0].data?.total;
    const totalFor = (i: number) => statusTotals[i + 1].data?.total;
    const statusesLoaded = statusTotals.every((q) => q.data);
    const withStatus = STATUS_ROWS.reduce((n, _s, i) => n + (totalFor(i) ?? 0), 0);

    const stats = statsQuery.data;
    const now = new Date();

    const newClientsThisMonth = clients.filter((c) => {
        const d = new Date(c.created_at);
        return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    }).length;

    const projectsSummary = useMemo(() => {
        const byStatus = { active: 0, paused: 0, completed: 0, cancelled: 0 } as Record<Project['status'], number>;
        let overdue = 0;
        const today = new Date();
        for (const p of projects) {
            byStatus[p.status] = (byStatus[p.status] ?? 0) + 1;
            if (p.status === 'active' && p.expected_end_date && new Date(p.expected_end_date) < today) overdue++;
        }
        const withRepo = projects.filter((p) => p.github_repo);
        const synced = withRepo.filter((p) => p.github_stats?.synced_at);
        return {
            byStatus,
            overdue,
            reposLinked: withRepo.length,
            reposSynced: synced.length,
            commits7d: synced.reduce((n, p) => n + (p.github_stats?.commits_last_7_days ?? 0), 0),
            openIssues: synced.reduce((n, p) => n + (p.github_stats?.open_issues ?? 0), 0),
            openPRs: synced.reduce((n, p) => n + (p.github_stats?.pull_requests ?? 0), 0),
        };
    }, [projects]);

    const channelSummary = useMemo(() => {
        const per = { whatsapp: { clients: 0, today: 0 }, telegram: { clients: 0, today: 0 } } as Record<string, { clients: number; today: number }>;
        const todayByClient = new Map<string, number>();
        for (const a of channelActivity) {
            const bucket = per[a.channel] ?? (per[a.channel] = { clients: 0, today: 0 });
            bucket.clients += 1;
            bucket.today += a.volume_today;
            todayByClient.set(a.client_id, (todayByClient.get(a.client_id) ?? 0) + a.volume_today);
        }
        const names = new Map(clients.map((c) => [c.id, c.name]));
        const mostActive = Array.from(todayByClient.entries())
            .filter(([, n]) => n > 0)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([id, n]) => ({ id, name: names.get(id) ?? 'Unknown client', count: n }));
        return { per, mostActive };
    }, [channelActivity, clients]);

    const byDay = stats?.messages_by_day ?? [];
    const weekTotal = byDay.reduce((n, d) => n + d.count, 0);
    const dayMax = Math.max(...byDay.map((d) => d.count), 1);

    // messages_delta_pct is 100.0 when last month had zero messages — a
    // sentinel, not a growth figure — so derive the note from the raw counts.
    let monthNote: React.ReactNode = undefined;
    let monthTone: 'muted' | 'good' | 'warn' = 'muted';
    if (stats) {
        if (stats.messages_last_month === 0) {
            monthNote = stats.messages_this_month === 0 ? 'No messages yet' : 'None last month';
        } else {
            const pct = Math.round(((stats.messages_this_month - stats.messages_last_month) / stats.messages_last_month) * 100);
            monthNote = `${pct >= 0 ? '↑' : '↓'} ${Math.abs(pct)}% vs last month`;
            monthTone = pct >= 0 ? 'good' : 'warn';
        }
    }

    const dash = '—';
    const awaitingTotal = totalFor(0);

    return (
        <div className="flex flex-col xl:flex-row gap-6 items-start">
            <div className="flex-1 min-w-0 w-full flex flex-col gap-[18px]">
                <div>
                    <h1 className="font-display font-bold text-[22px] text-foreground tracking-[-0.01em]">Analytics</h1>
                    <p className="text-[13px] text-voxly-ink-6 mt-[3px]">Live figures from your workspace · all-time unless a period is shown</p>
                </div>

                {statsQuery.isError && (
                    <div role="alert" className="flex items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3">
                        <AlertTriangle className="w-4 h-4 text-destructive flex-none" />
                        <span className="flex-1 text-[12.5px] text-foreground/90">
                            {getApiErrorMessage(statsQuery.error, 'Workspace stats couldn’t be loaded.')}
                        </span>
                        <Button size="sm" variant="outline" onClick={() => statsQuery.refetch()} className="h-7 gap-1.5 text-[12px]">
                            <RefreshCw className="w-3 h-3" /> Retry
                        </Button>
                    </div>
                )}

                <div className="grid grid-cols-2 md:grid-cols-3 gap-3" data-testid="analytics-tiles">
                    <Tile
                        label="Active clients"
                        value={stats ? String(stats.active_clients) : dash}
                        note={stats ? `of ${stats.total_clients} · ${newClientsThisMonth} new this month` : undefined}
                        href="/clients"
                    />
                    <Tile
                        label="Active projects"
                        value={stats ? String(stats.active_projects) : dash}
                        note={stats ? `${stats.completed_projects} completed${projectsSummary.overdue ? ` · ${projectsSummary.overdue} overdue` : ''}` : undefined}
                        noteTone={projectsSummary.overdue ? 'warn' : 'muted'}
                        href="/projects"
                    />
                    <Tile label="Messages this month" value={stats ? stats.messages_this_month.toLocaleString() : dash} note={monthNote} noteTone={monthTone} />
                    <Tile label="Messages · last 7 days" value={stats ? weekTotal.toLocaleString() : dash} note={stats ? `${stats.total_messages.toLocaleString()} all-time` : undefined}>
                        <Sparkline values={byDay.map((d) => d.count)} />
                    </Tile>
                    <Tile
                        label="Answered with project data"
                        value={stats && stats.total_messages > 0 ? `${stats.ai_accuracy}%` : dash}
                        note={stats && stats.total_messages > 0 ? 'share of all messages' : 'no messages yet'}
                        title="Messages where Voxly found the client’s project to answer from. The rest were answered without project context."
                    />
                    <Tile
                        label="Waiting on a human"
                        value={awaitingTotal === undefined ? dash : String(awaitingTotal)}
                        note={awaitingTotal ? 'conversations need a reply' : awaitingTotal === 0 ? 'all caught up' : undefined}
                        noteTone={awaitingTotal ? 'warn' : 'good'}
                        href="/messages?status=awaiting_human"
                    />
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-[1.6fr_1fr] gap-3.5">
                    <Card title="Messages · last 7 days (UTC)" action={<Link href="/messages" className="text-[11.5px] text-primary hover:underline">Conversations →</Link>}>
                        {stats ? (
                            <div
                                className="flex items-end gap-2 h-[120px]"
                                role="img"
                                aria-label={`Messages per day: ${byDay.map((d) => `${weekday(d.date)} ${d.count}`).join(', ')}`}
                            >
                                {byDay.map((d) => (
                                    <div key={d.date} className="flex-1 flex flex-col items-center justify-end gap-1 h-full min-w-0">
                                        <span className="text-[10.5px] text-voxly-ink-6 tabular-nums">{d.count}</span>
                                        <div
                                            className={`w-full max-w-[36px] rounded-t-[4px] ${d.count > 0 ? 'bg-primary' : 'bg-voxly-surface-3'}`}
                                            style={{ height: `${Math.max((d.count / dayMax) * 80, 3)}px` }}
                                        />
                                        <span className="font-mono text-[9.5px] text-voxly-ink-5">{weekday(d.date)}</span>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="h-[120px] rounded-lg bg-secondary animate-pulse" />
                        )}
                    </Card>

                    <Card title="Conversation outcomes" action={<Link href="/messages" className="text-[11.5px] text-primary hover:underline">Open →</Link>}>
                        {statusesLoaded ? (
                            <div className="flex flex-col gap-[9px]">
                                {STATUS_ROWS.map((s, i) => (
                                    <Row key={s.key} dot={s.dot} label={s.label} value={totalFor(i) ?? 0} />
                                ))}
                                {totalConversations !== undefined && totalConversations > withStatus && (
                                    <Row dot="bg-voxly-ink-4" label="No status yet" value={totalConversations - withStatus} />
                                )}
                                <div className="pt-2 mt-1 border-t border-border text-[11.5px] text-voxly-ink-5">
                                    {totalConversations ?? 0} conversation{totalConversations === 1 ? '' : 's'} in total
                                </div>
                            </div>
                        ) : statusTotals.some((q) => q.isError) ? (
                            <p className="text-[12.5px] text-voxly-ink-5">Conversation totals couldn’t be loaded.</p>
                        ) : (
                            <div className="space-y-2">{[1, 2, 3, 4].map((k) => <div key={k} className="h-4 rounded bg-secondary animate-pulse" />)}</div>
                        )}
                    </Card>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
                    <Card title="Projects">
                        <div className="flex flex-col gap-[9px]">
                            <Row dot="bg-voxly-success" label="Active" value={projectsSummary.byStatus.active} />
                            <Row dot="bg-voxly-warning" label="Paused" value={projectsSummary.byStatus.paused} />
                            <Row dot="bg-voxly-violet" label="Completed" value={projectsSummary.byStatus.completed} />
                            <Row dot="bg-voxly-heat" label="Cancelled" value={projectsSummary.byStatus.cancelled} />
                            {projectsSummary.overdue > 0 && (
                                <div className="pt-2 mt-1 border-t border-border text-[11.5px] text-voxly-warning">
                                    {projectsSummary.overdue} active project{projectsSummary.overdue === 1 ? ' is' : 's are'} past the expected end date
                                </div>
                            )}
                        </div>
                    </Card>
                    <Card title="GitHub · synced repos">
                        {projectsSummary.reposLinked === 0 ? (
                            <p className="text-[12.5px] text-voxly-ink-5">
                                No repos linked yet. <Link href="/projects" className="text-primary hover:underline">Link one to a project</Link>.
                            </p>
                        ) : (
                            <div className="flex flex-col gap-[9px]">
                                <Row dot="bg-voxly-ink-4" label="Repos synced" value={`${projectsSummary.reposSynced} / ${projectsSummary.reposLinked}`} />
                                <Row dot="bg-voxly-success" label="Commits (7d)" value={projectsSummary.commits7d} />
                                <Row dot="bg-voxly-warning" label="Open issues" value={projectsSummary.openIssues} />
                                <Row dot="bg-voxly-violet" label="Open PRs" value={projectsSummary.openPRs} />
                            </div>
                        )}
                    </Card>
                    <Card title="Channels" action={<Link href="/channels" className="text-[11.5px] text-primary hover:underline">Details →</Link>}>
                        <div className="flex flex-col gap-[9px]">
                            <Row
                                dot={channelSummary.per.whatsapp.clients ? 'bg-voxly-success' : 'bg-voxly-ink-4'}
                                label="WhatsApp clients"
                                value={channelSummary.per.whatsapp.clients}
                            />
                            <Row
                                dot={channelSummary.per.telegram.clients ? 'bg-voxly-success' : 'bg-voxly-ink-4'}
                                label="Telegram clients"
                                value={channelSummary.per.telegram.clients}
                            />
                            <Row
                                dot="bg-voxly-ink-4"
                                label="Messages today"
                                value={channelSummary.per.whatsapp.today + channelSummary.per.telegram.today}
                            />
                        </div>
                    </Card>
                </div>
            </div>

            <div className="w-full xl:w-80 flex-none flex flex-col gap-3.5">
                <Panel title="Most Active Today">
                    {channelSummary.mostActive.length === 0 ? (
                        <PanelText>No client messages today.</PanelText>
                    ) : (
                        <div className="pb-1">
                            {channelSummary.mostActive.map((c, i) => (
                                <Link
                                    key={c.id}
                                    href={`/messages?client=${c.id}`}
                                    className="flex items-center gap-2 px-3.5 py-[7px] border-t border-border first:border-t-0 hover:bg-white/[0.02] transition-colors"
                                >
                                    <span className="text-[11px] text-voxly-ink-5 w-3.5">{i + 1}</span>
                                    <span className="flex-1 text-xs text-foreground truncate">{c.name}</span>
                                    <span className="text-xs text-foreground tabular-nums">{c.count} msg{c.count === 1 ? '' : 's'}</span>
                                </Link>
                            ))}
                        </div>
                    )}
                </Panel>

                <Panel title="Recent AI Replies">
                    {!stats || stats.recent_ai_messages.length === 0 ? (
                        <PanelText>{stats ? 'No AI replies yet.' : 'Loading…'}</PanelText>
                    ) : (
                        <div className="pb-1">
                            {stats.recent_ai_messages.slice(0, 5).map((m, i) => (
                                <div key={`${m.timestamp}-${i}`} className="flex items-center gap-2 px-3.5 py-[7px] border-t border-border first:border-t-0">
                                    <span className="flex-1 text-xs text-foreground truncate">{m.client_name}</span>
                                    <span className="text-[10.5px] text-voxly-ink-5 font-mono flex-none">{m.provider}</span>
                                    <span className="text-[11px] text-voxly-ink-5 flex-none">{timeAgo(m.timestamp)}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </Panel>

                <Panel title="Integrations">
                    {stats ? (
                        <>
                            <PanelRow dot={stats.integrations.whatsapp ? 'bg-voxly-success' : 'bg-voxly-ink-4'} label="WhatsApp" value={stats.integrations.whatsapp ? 'connected' : 'not connected'} />
                            <PanelRow dot={stats.integrations.telegram ? 'bg-voxly-success' : 'bg-voxly-ink-4'} label="Telegram" value={stats.integrations.telegram ? 'connected' : 'not connected'} />
                            <PanelRow dot={stats.integrations.github ? 'bg-voxly-success' : 'bg-voxly-ink-4'} label="GitHub" value={stats.integrations.github ? 'connected' : 'not connected'} />
                            <PanelRow
                                dot={stats.integrations.ai_provider && stats.integrations.ai_provider !== 'none' ? 'bg-voxly-success' : 'bg-voxly-ink-4'}
                                label="AI provider"
                                value={stats.integrations.ai_provider && stats.integrations.ai_provider !== 'none' ? stats.integrations.ai_provider : 'not set'}
                            />
                        </>
                    ) : (
                        <PanelText>Loading…</PanelText>
                    )}
                </Panel>

                <Panel title="Not Tracked Yet" defaultOpen={false}>
                    <PanelText>
                        Revenue, AI cost, response latency and conversation sentiment aren’t recorded by the backend yet, so they aren’t estimated here.
                    </PanelText>
                </Panel>

                <Panel title="Export" defaultOpen={false}>
                    <PanelText>
                        Report export is coming soon. Your raw data can be exported today from{' '}
                        <Link href="/settings/danger-zone" className="text-primary hover:underline">Settings → Export data</Link>.
                    </PanelText>
                </Panel>
            </div>
        </div>
    );
}
