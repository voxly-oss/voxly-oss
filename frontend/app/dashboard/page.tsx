'use client';

import { useQuery } from '@tanstack/react-query';
import { clientsAPI, projectsAPI, dashboardAPI } from '@/lib/api';
import {
    Sparkles, AlertTriangle, Check, X as XIcon, ChevronDown, ChevronRight,
    Users, MessageSquare, Zap, Code2,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import EmptyState from '@/components/EmptyState';
import PreviewBadge, { PreviewMark } from '@/components/PreviewBadge';

// ─── Types ────────────────────────────────────────────────────────────────────

type Client = { id: string; name: string; company?: string; created_at: string };
type Project = { id: string; name: string; status: string; client_id: string };
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
    const d = Date.now() - new Date(ts).getTime();
    const m = Math.floor(d / 60000);
    if (m < 1) return 'now';
    if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h`;
    return `${Math.floor(h / 24)}d`;
};

const fmt = (n: number) => n.toLocaleString();

// Bucket a real feed item into the same "Just Now / Earlier Today / Yesterday /
// Earlier" groups the design's Signal Feed uses.
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

type FeedItem = { key: string; kind: 'ai' | 'github' | 'whatsapp' | 'task' | 'automation' | 'team' | 'other'; title: string; subtitle: string; source: string; ts: string; unread?: boolean };

const FEED_STYLE: Record<FeedItem['kind'], { bar: string; iconBg: string; icon: React.ReactNode }> = {
    ai: { bar: 'bg-voxly-violet', iconBg: 'text-voxly-violet', icon: <Sparkles className="w-3.5 h-3.5" /> },
    github: { bar: 'bg-voxly-ink-4', iconBg: 'text-voxly-ink-6', icon: <Code2 className="w-3.5 h-3.5" /> },
    whatsapp: { bar: 'bg-voxly-success', iconBg: 'text-voxly-ink-6', icon: <MessageSquare className="w-3.5 h-3.5" /> },
    task: { bar: 'bg-primary', iconBg: 'text-primary', icon: <Check className="w-3.5 h-3.5" /> },
    automation: { bar: 'bg-voxly-violet', iconBg: 'text-voxly-violet', icon: <Zap className="w-3.5 h-3.5" /> },
    team: { bar: 'bg-voxly-ink-4', iconBg: 'text-voxly-ink-6', icon: <Users className="w-3.5 h-3.5" /> },
    other: { bar: 'bg-voxly-heat', iconBg: 'text-voxly-heat', icon: <AlertTriangle className="w-3.5 h-3.5" /> },
};

function classifyActivity(type: string): FeedItem['kind'] {
    const t = type.toLowerCase();
    if (t.includes('github') || t.includes('deploy') || t.includes('pr') || t.includes('build')) return 'github';
    if (t.includes('whatsapp') || t.includes('message') || t.includes('chat')) return 'whatsapp';
    if (t.includes('task')) return 'task';
    if (t.includes('automation')) return 'automation';
    if (t.includes('team') || t.includes('member')) return 'team';
    return 'other';
}

// ─── Morning Briefing — no "AI insights" endpoint exists yet, so this section
// mirrors the design's own placeholder content exactly (per instruction: mock
// data / loading placeholders where the backend has nothing to serve). Wire to
// a real insights endpoint when one exists. ────────────────────────────────
const BRIEFING_PRIORITIES = [
    { n: '01', text: "A client milestone slipped — review before it affects delivery this week.", cta: 'View project' },
    { n: '02', text: 'Some clients have been quiet 48h+ — replies are drafted, waiting on your review.', cta: 'Review replies' },
];
const BRIEFING_BLOCKER = { text: 'A build failed twice overnight — likely a dependency conflict blocking deploy.', cta: 'View logs' };
const BRIEFING_SUGGESTIONS = [
    'Send a proactive check-in to a client that has gone quiet.',
    "Approve this week's automation digest before the send window.",
];
const FOCUS_TASKS = [
    { label: 'Send Q3 invoice to your top client', done: true, ai: false },
    { label: 'Reply to a client — launch date question', done: false, ai: true },
    { label: 'Review latest build failure', done: false, ai: false },
    { label: 'Check in with clients quiet 48h+', done: false, ai: false },
];

// ─── Collapsible right-column panel — matches the design's <details> pattern ──

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

// ─── Dashboard Page ───────────────────────────────────────────────────────────

export default function DashboardPage() {
    const [feedFilter, setFeedFilter] = useState<'All' | 'AI' | 'GitHub' | 'Channels' | 'Tasks'>('All');
    const [focus, setFocus] = useState(FOCUS_TASKS);
    const [suggestions, setSuggestions] = useState(BRIEFING_SUGGESTIONS);

    const { data: clients = [], isLoading: clientsLoading } = useQuery({
        queryKey: ['clients'],
        queryFn: async () => (await clientsAPI.list()).data as Client[],
    });

    const { data: projects = [], isLoading: projectsLoading } = useQuery({
        queryKey: ['projects'],
        queryFn: async () => (await projectsAPI.list()).data as Project[],
    });

    const { data: stats, isLoading: statsLoading } = useQuery({
        queryKey: ['dashboard-stats'],
        queryFn: async () => (await dashboardAPI.stats()).data as DashboardStats,
        staleTime: 30_000,
    });

    const isLoading = clientsLoading || projectsLoading || statsLoading;
    const activeProjects = projects.filter(p => p.status === 'active');

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
        if (feedFilter === 'AI') return item.kind === 'ai' || item.kind === 'automation';
        if (feedFilter === 'GitHub') return item.kind === 'github';
        if (feedFilter === 'Channels') return item.kind === 'whatsapp';
        if (feedFilter === 'Tasks') return item.kind === 'task';
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

    return (
        <div className="flex flex-col xl:flex-row gap-6 items-start">

            {/* ── CENTER ── */}
            <div className="flex-1 min-w-0 w-full flex flex-col gap-4">

                {/* Morning Briefing */}
                <div className="rounded-[14px] border border-voxly-violet/30 bg-voxly-violet-soft px-[18px] py-4">
                    <div className="flex items-center gap-[9px] mb-3.5">
                        <span className="relative w-[22px] h-[22px] flex-none">
                            <span className="absolute inset-0 rounded-full bg-voxly-violet" />
                            <span className="absolute -inset-[3px] rounded-full border-[1.5px] border-voxly-violet animate-pulse" />
                        </span>
                        <span className="font-display font-semibold text-[13px] text-foreground">Morning Briefing</span>
                        <PreviewBadge label="Preview content" />
                        <span className="text-[11.5px] text-voxly-ink-5">
                            {new Date().toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
                        </span>
                        <span className="flex-1" />
                        <ChevronDown className="w-[15px] h-[15px] text-voxly-ink-5" />
                    </div>

                    <div className="font-mono text-[9.5px] font-bold tracking-[0.07em] text-voxly-violet mb-2">PRIORITIES</div>
                    <div className="flex flex-col gap-2 mb-3.5">
                        {BRIEFING_PRIORITIES.map(p => (
                            <div key={p.n} className="flex items-center gap-2.5">
                                <span className="font-mono text-[10px] font-bold text-voxly-violet flex-none w-3.5">{p.n}</span>
                                <span className="flex-1 text-[12.5px] leading-relaxed text-foreground/90">{p.text}</span>
                                <button className="flex-none text-[11px] font-semibold text-voxly-violet border border-voxly-violet/40 hover:bg-voxly-violet-soft rounded-md px-2.5 py-[3px] transition-colors">
                                    {p.cta}
                                </button>
                            </div>
                        ))}
                    </div>

                    <div className="font-mono text-[9.5px] font-bold tracking-[0.07em] text-voxly-heat mb-2">BLOCKERS</div>
                    <div className="flex items-center gap-2.5 bg-voxly-heat-soft border border-voxly-heat/30 rounded-[9px] px-3 py-2 mb-3.5">
                        <AlertTriangle className="w-3.5 h-3.5 text-voxly-heat flex-none" />
                        <span className="flex-1 text-[12.5px] leading-relaxed text-foreground/90">{BRIEFING_BLOCKER.text}</span>
                        <button className="flex-none text-[11px] font-semibold text-voxly-heat border border-voxly-heat/40 hover:bg-voxly-heat-soft rounded-md px-2.5 py-[3px] transition-colors">
                            {BRIEFING_BLOCKER.cta}
                        </button>
                    </div>

                    <div className="font-mono text-[9.5px] font-bold tracking-[0.07em] text-voxly-ink-5 mb-2">SUGGESTED ACTIONS</div>
                    <div className="flex flex-col gap-[7px]">
                        {suggestions.map((s, i) => (
                            <div key={i} className="flex items-center gap-2.5">
                                <span className="flex-1 text-[12.5px] leading-relaxed text-voxly-ink-6">{s}</span>
                                <button
                                    onClick={() => setSuggestions(prev => prev.filter((_, idx) => idx !== i))}
                                    className="w-6 h-6 rounded-md border border-voxly-ink-4/60 text-voxly-success flex items-center justify-center hover:bg-voxly-success-soft transition-colors flex-none">
                                    <Check className="w-[13px] h-[13px]" />
                                </button>
                                <button
                                    onClick={() => setSuggestions(prev => prev.filter((_, idx) => idx !== i))}
                                    className="w-6 h-6 rounded-md border border-voxly-ink-4/60 text-voxly-ink-5 flex items-center justify-center hover:bg-voxly-surface-3 transition-colors flex-none">
                                    <XIcon className="w-3 h-3" />
                                </button>
                            </div>
                        ))}
                        {suggestions.length === 0 && (
                            <span className="text-[12px] text-voxly-ink-5">All caught up.</span>
                        )}
                    </div>
                </div>

                {/* Today's Focus */}
                <div className="rounded-[14px] border border-border bg-card px-[18px] py-3.5">
                    <div className="flex items-center mb-2.5">
                        <span className="flex-1 font-display font-semibold text-[13px] text-foreground">Today&apos;s Focus</span>
                        <span className="text-[11px] text-voxly-ink-5">{focus.length} tasks · AI-curated</span>
                    </div>
                    <div className="flex flex-col gap-[9px]">
                        {focus.map((task, i) => (
                            <label key={i} className="flex items-center gap-2.5 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={task.done}
                                    onChange={() => setFocus(prev => prev.map((t, idx) => idx === i ? { ...t, done: !t.done } : t))}
                                    className="w-[15px] h-[15px] accent-primary flex-none"
                                />
                                <span className={`flex-1 text-[12.5px] ${task.done ? 'text-voxly-ink-5 line-through' : 'text-foreground/90'}`}>{task.label}</span>
                                {task.ai && !task.done && (
                                    <span className="text-[10px] text-voxly-violet bg-voxly-violet-soft px-[7px] py-[2px] rounded-full flex-none">AI-drafted</span>
                                )}
                            </label>
                        ))}
                    </div>
                </div>

                {/* Signal Feed header */}
                <div className="flex items-center gap-4">
                    <span className="font-display font-semibold text-[15px] text-foreground">Signal Feed</span>
                    <div className="flex-1" />
                    <div className="flex gap-1.5">
                        {(['All', 'AI', 'GitHub', 'Channels', 'Tasks'] as const).map(f => (
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
                    {isLoading ? (
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
                        {[
                            // Revenue has no billing/MRR endpoint yet — mock, pending Billing phase.
                            { label: 'REVENUE', value: '$48.2K', note: '→ $51K by month-end', color: 'text-voxly-success', points: '1,13 8,10 15,11 22,5 33,2', stroke: 'stroke-voxly-success', mock: true },
                            { label: 'CLIENTS', value: fmt(stats?.total_clients ?? clients.length), note: `${stats?.active_clients ?? clients.length} active`, color: 'text-voxly-success', points: '1,6 8,8 15,7 22,11 33,10', stroke: 'stroke-voxly-warning', mock: false },
                            { label: 'PROJECTS', value: fmt(stats?.total_projects ?? projects.length), note: `${activeProjects.length} active`, color: 'text-voxly-success', points: '1,7 8,7 15,9 22,8 33,10', stroke: 'stroke-voxly-warning', mock: false },
                            { label: 'AI CONVOS', value: fmt(stats?.total_messages ?? 0), note: `${fmt(stats?.messages_this_month ?? 0)} this month`, color: 'text-voxly-success', points: '1,13 8,11 15,9 22,6 33,2', stroke: 'stroke-voxly-success', mock: false },
                            // Platform uptime and automation success have no monitoring endpoint yet — mock.
                            { label: 'PLATFORM', value: '98.2%', note: 'stable · 14 days', color: 'text-voxly-success', points: '1,4 8,4 15,3 22,4 33,3', stroke: 'stroke-voxly-success', mock: true },
                            { label: 'AUTOMATION', value: '96.4%', note: '2 need attention', color: 'text-voxly-warning', points: '1,4 8,8 15,6 22,9 33,8', stroke: 'stroke-voxly-warning', mock: true },
                        ].map(tile => (
                            <div key={tile.label} className="border border-border rounded-[10px] px-[10px] py-[9px]">
                                <div className="flex justify-between items-start">
                                    <div>
                                        <div className="font-mono text-[8px] font-semibold tracking-[0.04em] text-voxly-ink-5 flex items-center">{tile.label}{tile.mock && <PreviewMark />}</div>
                                        <div className="font-display font-bold text-[17px] text-foreground tabular-nums">{tile.value}</div>
                                    </div>
                                    <svg width="34" height="16" viewBox="0 0 34 16" className="flex-none mt-0.5">
                                        <polyline points={tile.points} fill="none" className={tile.stroke} strokeWidth="1.6" />
                                    </svg>
                                </div>
                                <div className={`text-[9px] mt-0.5 ${tile.color}`}>{tile.note}</div>
                            </div>
                        ))}
                    </div>
                </Panel>

                <Panel title="AI Infrastructure">
                    <div className="pb-1">
                        <PanelRow dot={stats?.integrations.github ? 'bg-voxly-success' : 'bg-voxly-ink-4'} label="GitHub" value={stats?.integrations.github ? 'connected' : 'not connected'} />
                        <PanelRow dot={stats?.integrations.whatsapp ? 'bg-voxly-success' : 'bg-voxly-ink-4'} label="WhatsApp" value={stats?.integrations.whatsapp ? 'connected' : 'not connected'} />
                        <PanelRow dot={stats?.integrations.ai_provider && stats.integrations.ai_provider !== 'none' ? 'bg-voxly-success' : 'bg-voxly-ink-4'} label="AI Provider" value={<span className="font-mono">{stats?.integrations.ai_provider ?? 'none'}</span>} />
                        {/* Token spend, latency and queue depth have no metering endpoint yet — mock. */}
                        <PanelRow dot="bg-voxly-ink-5" label={<span className="flex items-center">Token spend<PreviewMark /></span>} value="842K · $12.40" />
                        <PanelRow dot="bg-voxly-success" label={<span className="flex items-center">Latency<PreviewMark /></span>} value="1.8s avg" />
                        <PanelRow dot="bg-voxly-success" label={<span className="flex items-center">Queue<PreviewMark /></span>} value="0 backlog" />
                    </div>
                </Panel>

                <Panel title="Projects" defaultOpen={false} badge={<span className="text-[10.5px] bg-voxly-surface-3 text-voxly-ink-6 px-[7px] py-[1px] rounded-full">{projects.length}</span>}>
                    <div className="pb-1">
                        {projectsLoading ? (
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

                {/* No notifications endpoint exists yet — surfaced from the same real
                    feed data as Signal Feed, in the design's Notifications panel shape. */}
                <Panel title="Notifications" defaultOpen={false} badge={<span className="text-[10.5px] bg-voxly-heat-soft text-voxly-heat px-[7px] py-[1px] rounded-full">{feedItems.length}</span>}>
                    <div className="pb-1">
                        {feedItems.length === 0 ? (
                            <div className="px-3 py-3 text-[11.5px] text-voxly-ink-5">Nothing recent</div>
                        ) : (
                            feedItems.slice(0, 5).map(item => (
                                <div key={item.key} className="flex items-center gap-2 px-3 py-[7px] border-t border-border">
                                    <span className={`w-1.5 h-1.5 rounded-full flex-none ${FEED_STYLE[item.kind].bar}`} />
                                    <span className="text-[11.5px] text-foreground/90 truncate">{item.title}</span>
                                </div>
                            ))
                        )}
                    </div>
                </Panel>
            </div>
        </div>
    );
}
