'use client';

import { useQuery } from '@tanstack/react-query';
import { clientsAPI, projectsAPI, dashboardAPI } from '@/lib/api';
import Link from 'next/link';
import { motion, useMotionValue, useTransform, animate, useInView, AnimatePresence } from 'framer-motion';
import {
    Users, FolderGit2, MessageSquare, TrendingUp, TrendingDown,
    Plus, ArrowUpRight, Bot, Github, Clock, Minus, Zap, Activity,
    CheckCircle2, AlertCircle, MessageCircle, Send, BarChart3,
    Sparkles, Globe, Wifi, WifiOff, ChevronRight, Star,
} from 'lucide-react';
import { useRef, useEffect, useState } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

type Client = { id: string; name: string; company?: string; created_at: string; };
type Project = { id: string; name: string; status: string; client_id: string; expected_end_date: string; };
type RecentAIMessage = { client_name: string; provider: string; response_length: number; timestamp: string; };
type DashboardStats = {
    total_clients: number; active_clients: number; total_projects: number;
    active_projects: number; completed_projects: number; total_messages: number;
    messages_this_month: number; messages_last_month: number;
    clients_delta: number; projects_delta: number; messages_delta_pct: number;
    recent_ai_messages: RecentAIMessage[];
    messages_by_day: Array<{ date: string; count: number }>;
    integrations: { whatsapp: boolean; telegram: boolean; github: boolean; ai_provider: string; };
    ai_accuracy: number;
    recent_activity: Array<{ type: string; title: string; timestamp: string }>;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

const timeAgo = (ts: string) => {
    const d = Date.now() - new Date(ts).getTime();
    const m = Math.floor(d / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
};

const fmt = (n: number) => n.toLocaleString();

const PROVIDER_COLORS: Record<string, { text: string; bg: string; bar: string }> = {
    gemini: { text: 'text-blue-400', bg: 'bg-blue-500/10', bar: 'bg-blue-500' },
    openai: { text: 'text-emerald-400', bg: 'bg-emerald-500/10', bar: 'bg-emerald-500' },
    claude: { text: 'text-violet-400', bg: 'bg-violet-500/10', bar: 'bg-violet-500' },
    unknown: { text: 'text-white/30', bg: 'bg-white/5', bar: 'bg-white/20' },
};

const STATUS_STYLES: Record<string, { dot: string; text: string; bg: string }> = {
    active: { dot: 'bg-emerald-500', text: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20' },
    paused: { dot: 'bg-amber-500', text: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/20' },
    completed: { dot: 'bg-blue-500', text: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/20' },
    cancelled: { dot: 'bg-red-500', text: 'text-red-400', bg: 'bg-red-500/10 border-red-500/20' },
};

// ─── Animated Number ──────────────────────────────────────────────────────────

function AnimatedNumber({ value, suffix = '' }: { value: number; suffix?: string }) {
    const ref = useRef<HTMLSpanElement>(null);
    const inView = useInView(ref, { once: true });
    const mv = useMotionValue(0);
    const display = useTransform(mv, v =>
        v >= 1000 ? `${(v / 1000).toFixed(1).replace(/\.0$/, '')}K${suffix}` : `${Math.round(v).toLocaleString()}${suffix}`
    );
    useEffect(() => { if (inView) animate(mv, value, { duration: 1.4, ease: 'easeOut' }); }, [inView, value, mv]);
    return <motion.span ref={ref}>{display}</motion.span>;
}

// ─── Bar Chart (7-day message trend) ─────────────────────────────────────────

function WeeklyChart({ data }: { data: Array<{ date: string; count: number }> }) {
    const max = Math.max(...data.map(d => d.count), 1);
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return (
        <div className="flex items-end gap-1.5 h-20 w-full">
            {data.map((d, i) => {
                const pct = (d.count / max) * 100;
                const dayName = days[new Date(d.count > 0 ? d.date + 'T12:00:00Z' : d.date).getDay()];
                return (
                    <div key={d.date} className="flex flex-col items-center gap-1 flex-1 group">
                        <div className="relative w-full flex items-end" style={{ height: '64px' }}>
                            <motion.div
                                initial={{ height: 0 }}
                                animate={{ height: `${Math.max(pct, 4)}%` }}
                                transition={{ delay: i * 0.05, duration: 0.5, ease: 'easeOut' }}
                                className="w-full rounded-t-md bg-violet-500/30 group-hover:bg-violet-500/60 transition-colors relative"
                                style={{ position: 'absolute', bottom: 0 }}>
                                {d.count > 0 && (
                                    <div className="absolute -top-6 left-1/2 -translate-x-1/2 text-[9px] text-white/0 group-hover:text-white/70 transition-colors whitespace-nowrap font-medium">
                                        {d.count}
                                    </div>
                                )}
                            </motion.div>
                        </div>
                        <span className="text-[9px] text-white/25 font-medium">{dayName}</span>
                    </div>
                );
            })}
        </div>
    );
}

// ─── Metric Card ─────────────────────────────────────────────────────────────

function MetricCard({ title, value, icon: Icon, gradient, iconColor, delta, deltaType, suffix = '' }: {
    title: string; value: number; icon: React.ElementType;
    gradient: string; iconColor: string; delta: number | null;
    deltaType: 'count' | 'pct'; suffix?: string;
}) {
    return (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            className="relative bg-[#0d0d16] border border-white/[0.07] rounded-2xl p-5 overflow-hidden group hover:border-white/14 transition-all duration-300">
            <div className={`absolute top-0 right-0 w-40 h-40 rounded-full blur-[60px] opacity-15 ${gradient}`} />
            <div className="relative z-10">
                <div className="flex items-center justify-between mb-4">
                    <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${gradient} border border-white/8 flex items-center justify-center`}>
                        <Icon className={`w-5 h-5 ${iconColor}`} />
                    </div>
                    {delta !== null && delta !== 0 && (
                        <span className={`text-[10px] font-bold px-2 py-1 rounded-lg flex items-center gap-1 ${delta > 0 ? 'text-emerald-400 bg-emerald-500/10' : 'text-red-400 bg-red-500/10'}`}>
                            {delta > 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                            {delta > 0 ? '+' : ''}{delta}{deltaType === 'pct' ? '%' : ''}
                        </span>
                    )}
                </div>
                <p className="text-3xl font-bold text-white tracking-tight">
                    <AnimatedNumber value={value} suffix={suffix} />
                </p>
                <p className="text-xs font-semibold text-white/35 uppercase tracking-wider mt-1.5">{title}</p>
            </div>
        </motion.div>
    );
}

// ─── Integration Pill ─────────────────────────────────────────────────────────

function IntegrationBadge({ label, active, icon }: { label: string; active: boolean; icon: string }) {
    return (
        <div className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-semibold transition-all ${active ? 'bg-emerald-500/8 border-emerald-500/20 text-emerald-400' : 'bg-white/[0.02] border-white/[0.05] text-white/25'}`}>
            <span className="text-sm">{icon}</span>
            {label}
            <span className={`w-1.5 h-1.5 rounded-full ${active ? 'bg-emerald-500 animate-pulse' : 'bg-white/20'}`} />
        </div>
    );
}

// ─── Empty State ──────────────────────────────────────────────────────────────

function EmptyState({ icon: Icon, title, description, href, label, gradient }: {
    icon: React.ElementType; title: string; description: string;
    href: string; label: string; gradient: string;
}) {
    return (
        <div className="flex flex-col items-center py-10 text-center">
            <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${gradient} border border-white/8 flex items-center justify-center mb-4`}>
                <Icon className="w-6 h-6 text-white/50" />
            </div>
            <p className="text-sm font-semibold text-white mb-1">{title}</p>
            <p className="text-xs text-white/30 mb-5 max-w-[180px] leading-relaxed">{description}</p>
            <Link href={href}
                className="flex items-center gap-1.5 px-4 py-2 bg-white/[0.04] border border-white/8 rounded-xl text-xs font-semibold text-white/60 hover:text-white hover:bg-white/[0.07] transition-all">
                <Plus className="w-3.5 h-3.5" /> {label}
            </Link>
        </div>
    );
}

// ─── Dashboard Page ───────────────────────────────────────────────────────────

export default function DashboardPage() {
    const [greetingIdx] = useState(() => Math.floor(Math.random() * 3));

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

    // Build provider usage from recent AI messages
    const providerUsage = (stats?.recent_ai_messages ?? []).reduce((acc, m) => {
        const p = m.provider?.split('-')[0]?.toLowerCase() ?? 'unknown';
        acc[p] = (acc[p] ?? 0) + 1;
        return acc;
    }, {} as Record<string, number>);
    const totalMessages = Object.values(providerUsage).reduce((a, b) => a + b, 0);

    const greetings = ['Good work today! 🚀', 'Let\'s build something great 💡', 'Your clients are waiting 👋'];

    // Sort recent clients
    const recentClients = [...clients].sort((a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    ).slice(0, 5);

    return (
        <div className="min-h-screen bg-[#030308] text-white" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
            {/* Background */}
            <div className="fixed inset-0 pointer-events-none overflow-hidden">
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[700px] h-[300px] bg-violet-600/4 rounded-full blur-[100px]" />
                <div className="absolute inset-0 opacity-[0.012]"
                    style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.3) 1px, transparent 1px)', backgroundSize: '40px 40px' }} />
            </div>

            <div className="relative max-w-[1400px] mx-auto px-6 py-8 space-y-7">

                {/* ── Header ── */}
                <div className="flex items-start justify-between">
                    <div>
                        <motion.h1 initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
                            className="text-2xl font-bold text-white tracking-tight">
                            Dashboard
                        </motion.h1>
                        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}
                            className="text-sm text-white/35 mt-1">{greetings[greetingIdx]}</motion.p>
                    </div>
                    <div className="flex items-center gap-3">
                        <Link href="/dashboard/clients/new"
                            className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-500 hover:to-blue-500 text-white text-sm font-semibold rounded-xl transition-all shadow-[0_0_20px_-8px_rgba(124,58,237,0.5)]">
                            <Plus className="w-4 h-4" /> New Client
                        </Link>
                    </div>
                </div>

                {/* ── Metric Cards ── */}
                {isLoading ? (
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                        {[...Array(4)].map((_, i) => (
                            <div key={i} className="h-36 bg-white/[0.02] border border-white/5 rounded-2xl animate-pulse" />
                        ))}
                    </div>
                ) : (
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                        <MetricCard title="Total Clients" value={stats?.total_clients ?? clients.length}
                            icon={Users} gradient="from-violet-500/20 to-purple-500/20" iconColor="text-violet-400"
                            delta={stats?.clients_delta ?? null} deltaType="count" />
                        <MetricCard title="Active Projects" value={stats?.active_projects ?? activeProjects.length}
                            icon={FolderGit2} gradient="from-blue-500/20 to-cyan-500/20" iconColor="text-blue-400"
                            delta={stats?.projects_delta ?? null} deltaType="count" />
                        <MetricCard title="Messages This Month" value={stats?.messages_this_month ?? 0}
                            icon={MessageSquare} gradient="from-emerald-500/20 to-green-500/20" iconColor="text-emerald-400"
                            delta={stats?.messages_delta_pct ?? null} deltaType="pct" />
                        <MetricCard title="AI Success Rate" value={stats?.ai_accuracy ?? 0}
                            icon={Bot} gradient="from-amber-500/20 to-yellow-500/20" iconColor="text-amber-400"
                            delta={null} deltaType="count" suffix="%" />
                    </div>
                )}

                {/* ── Main 2-col grid ── */}
                <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">

                    {/* LEFT: 2/3 width */}
                    <div className="xl:col-span-2 space-y-5">

                        {/* 7-day message trend + integrations */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                            {/* Chart */}
                            <div className="bg-[#0d0d16] border border-white/[0.07] rounded-2xl p-5">
                                <div className="flex items-center justify-between mb-4">
                                    <div>
                                        <h2 className="text-sm font-bold text-white">Message Trend</h2>
                                        <p className="text-xs text-white/35 mt-0.5">Last 7 days</p>
                                    </div>
                                    <div className="flex items-center gap-1.5 text-xs text-white/30">
                                        <BarChart3 className="w-3.5 h-3.5" />
                                        <span>{fmt(stats?.total_messages ?? 0)} total</span>
                                    </div>
                                </div>
                                {stats?.messages_by_day ? (
                                    <WeeklyChart data={stats.messages_by_day} />
                                ) : (
                                    <div className="h-20 bg-white/[0.02] rounded-xl animate-pulse" />
                                )}
                            </div>

                            {/* Channel status */}
                            <div className="bg-[#0d0d16] border border-white/[0.07] rounded-2xl p-5">
                                <div className="mb-4">
                                    <h2 className="text-sm font-bold text-white">Channels & Integrations</h2>
                                    <p className="text-xs text-white/35 mt-0.5">Connected platforms</p>
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    <IntegrationBadge label="WhatsApp" active={stats?.integrations.whatsapp ?? false} icon="💬" />
                                    <IntegrationBadge label="Telegram" active={stats?.integrations.telegram ?? false} icon="✈️" />
                                    <IntegrationBadge label="GitHub" active={stats?.integrations.github ?? false} icon="🐙" />
                                    <IntegrationBadge label={stats?.integrations.ai_provider ?? 'AI'} active={!!stats?.integrations.ai_provider && stats.integrations.ai_provider !== 'none'} icon="🤖" />
                                </div>

                                {/* Quick links */}
                                <div className="mt-4 pt-4 border-t border-white/[0.05] grid grid-cols-2 gap-2">
                                    <Link href="/dashboard/integrations"
                                        className="flex items-center justify-center gap-1.5 py-2 bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.06] rounded-xl text-xs text-white/50 hover:text-white transition-all font-medium">
                                        <Globe className="w-3 h-3" /> Integrations
                                    </Link>
                                    <Link href="/dashboard/settings"
                                        className="flex items-center justify-center gap-1.5 py-2 bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.06] rounded-xl text-xs text-white/50 hover:text-white transition-all font-medium">
                                        <Zap className="w-3 h-3" /> AI Settings
                                    </Link>
                                </div>
                            </div>
                        </div>

                        {/* Active Projects */}
                        <div className="bg-[#0d0d16] border border-white/[0.07] rounded-2xl overflow-hidden">
                            <div className="px-6 py-4 border-b border-white/[0.07] flex items-center justify-between">
                                <div>
                                    <h2 className="text-sm font-bold text-white">Active Projects</h2>
                                    <p className="text-xs text-white/35 mt-0.5">{activeProjects.length} in progress</p>
                                </div>
                                <Link href="/dashboard/projects"
                                    className="text-xs text-violet-400 hover:text-violet-300 flex items-center gap-1 transition-colors">
                                    View all <ArrowUpRight className="w-3 h-3" />
                                </Link>
                            </div>
                            {projectsLoading ? (
                                <div className="space-y-px p-4">
                                    {[1, 2, 3].map(k => <div key={k} className="h-16 bg-white/[0.02] rounded-xl animate-pulse mb-2" />)}
                                </div>
                            ) : activeProjects.length === 0 ? (
                                <EmptyState icon={FolderGit2} title="No active projects" description="Create a project for one of your clients to get started."
                                    href="/dashboard/projects" label="New Project" gradient="from-blue-500/20 to-cyan-500/20" />
                            ) : (
                                <div className="divide-y divide-white/[0.04]">
                                    {activeProjects.slice(0, 5).map((project, i) => {
                                        const client = clients.find(c => c.id === project.client_id);
                                        const s = STATUS_STYLES[project.status] ?? STATUS_STYLES.active;
                                        const daysLeft = project.expected_end_date
                                            ? Math.ceil((new Date(project.expected_end_date).getTime() - Date.now()) / 86400000)
                                            : null;
                                        return (
                                            <motion.div key={project.id} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
                                                transition={{ delay: i * 0.05 }}
                                                className="flex items-center gap-4 px-6 py-4 hover:bg-white/[0.02] transition-colors group">
                                                <div className="w-9 h-9 rounded-xl bg-blue-500/10 border border-blue-500/15 flex items-center justify-center flex-shrink-0">
                                                    <FolderGit2 className="w-4 h-4 text-blue-400" />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm font-semibold text-white truncate group-hover:text-violet-300 transition-colors">
                                                        {project.name}
                                                    </p>
                                                    <p className="text-xs text-white/35 mt-0.5">
                                                        {client?.name ?? 'Unknown client'}
                                                    </p>
                                                </div>
                                                <div className="flex items-center gap-3 flex-shrink-0">
                                                    {daysLeft !== null && (
                                                        <span className={`text-xs font-medium flex items-center gap-1 ${daysLeft < 7 ? 'text-red-400' : daysLeft < 30 ? 'text-amber-400' : 'text-white/30'}`}>
                                                            <Clock className="w-3 h-3" />
                                                            {daysLeft < 0 ? 'Overdue' : `${daysLeft}d`}
                                                        </span>
                                                    )}
                                                    <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full border capitalize ${s.bg} ${s.text}`}>
                                                        <span className={`inline-block w-1.5 h-1.5 rounded-full ${s.dot} mr-1.5`} />
                                                        {project.status}
                                                    </span>
                                                </div>
                                            </motion.div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        {/* Recent Clients */}
                        <div className="bg-[#0d0d16] border border-white/[0.07] rounded-2xl overflow-hidden">
                            <div className="px-6 py-4 border-b border-white/[0.07] flex items-center justify-between">
                                <div>
                                    <h2 className="text-sm font-bold text-white">Recent Clients</h2>
                                    <p className="text-xs text-white/35 mt-0.5">{clients.length} total</p>
                                </div>
                                <Link href="/dashboard/clients"
                                    className="text-xs text-violet-400 hover:text-violet-300 flex items-center gap-1 transition-colors">
                                    View all <ArrowUpRight className="w-3 h-3" />
                                </Link>
                            </div>
                            {clientsLoading ? (
                                <div className="p-4 space-y-2">
                                    {[1, 2, 3].map(k => <div key={k} className="h-14 bg-white/[0.02] rounded-xl animate-pulse" />)}
                                </div>
                            ) : recentClients.length === 0 ? (
                                <EmptyState icon={Users} title="No clients yet" description="Add your first client to start managing their AI conversations."
                                    href="/dashboard/clients/new" label="Add Client" gradient="from-violet-500/20 to-purple-500/20" />
                            ) : (
                                <div className="divide-y divide-white/[0.04]">
                                    {recentClients.map((client, i) => {
                                        const initial = client.name.charAt(0).toUpperCase();
                                        const colors = ['bg-violet-500/20 text-violet-300', 'bg-blue-500/20 text-blue-300', 'bg-emerald-500/20 text-emerald-300', 'bg-amber-500/20 text-amber-300'];
                                        const color = colors[client.name.charCodeAt(0) % colors.length];
                                        return (
                                            <motion.div key={client.id} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
                                                transition={{ delay: i * 0.04 }}
                                                className="flex items-center gap-4 px-6 py-3.5 hover:bg-white/[0.02] transition-colors group">
                                                <div className={`w-9 h-9 rounded-xl border border-white/8 flex items-center justify-center flex-shrink-0 text-sm font-bold ${color}`}>
                                                    {initial}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm font-semibold text-white truncate group-hover:text-violet-300 transition-colors">
                                                        {client.name}
                                                    </p>
                                                    {client.company && <p className="text-xs text-white/35">{client.company}</p>}
                                                </div>
                                                <span className="text-xs text-white/25 flex-shrink-0">{timeAgo(client.created_at)}</span>
                                            </motion.div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* RIGHT: 1/3 width */}
                    <div className="space-y-5">

                        {/* AI provider breakdown */}
                        <div className="bg-[#0d0d16] border border-white/[0.07] rounded-2xl p-5">
                            <div className="flex items-center gap-2 mb-4">
                                <div className="w-8 h-8 rounded-xl bg-fuchsia-500/10 border border-fuchsia-500/15 flex items-center justify-center">
                                    <Bot className="w-3.5 h-3.5 text-fuchsia-400" />
                                </div>
                                <div>
                                    <p className="text-sm font-bold text-white">AI Providers</p>
                                    <p className="text-xs text-white/35">Recent usage</p>
                                </div>
                            </div>
                            {totalMessages === 0 ? (
                                <p className="text-xs text-white/20 text-center py-6">No AI activity yet</p>
                            ) : (
                                <div className="space-y-3">
                                    {Object.entries(providerUsage).sort(([, a], [, b]) => b - a).map(([provider, count]) => {
                                        const c = PROVIDER_COLORS[provider] ?? PROVIDER_COLORS.unknown;
                                        const pct = Math.round((count / totalMessages) * 100);
                                        return (
                                            <div key={provider}>
                                                <div className="flex items-center justify-between mb-1.5">
                                                    <span className={`text-xs font-semibold capitalize ${c.text}`}>{provider}</span>
                                                    <span className="text-xs text-white/35">{pct}% · {count} msgs</span>
                                                </div>
                                                <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                                                    <motion.div initial={{ width: 0 }} animate={{ width: `${pct}%` }}
                                                        transition={{ delay: 0.2, duration: 0.6 }}
                                                        className={`h-full rounded-full ${c.bar}`} />
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                            <div className="mt-4 pt-4 border-t border-white/[0.05]">
                                <div className="flex items-center justify-between text-xs">
                                    <span className="text-white/35">Total AI sessions</span>
                                    <span className="font-bold text-white">{fmt(stats?.total_messages ?? 0)}</span>
                                </div>
                            </div>
                        </div>

                        {/* Recent AI activity */}
                        <div className="bg-[#0d0d16] border border-white/[0.07] rounded-2xl overflow-hidden">
                            <div className="px-5 py-4 border-b border-white/[0.07]">
                                <h2 className="text-sm font-bold text-white">Recent AI Activity</h2>
                                <p className="text-xs text-white/35 mt-0.5">Latest conversations</p>
                            </div>
                            <div className="divide-y divide-white/[0.04]">
                                {statsLoading ? (
                                    [...Array(4)].map((_, i) => (
                                        <div key={i} className="flex items-center gap-3 p-4">
                                            <div className="w-8 h-8 bg-white/[0.03] rounded-xl animate-pulse" />
                                            <div className="flex-1 space-y-1.5">
                                                <div className="h-3 bg-white/[0.03] rounded animate-pulse w-2/3" />
                                                <div className="h-2.5 bg-white/[0.02] rounded animate-pulse w-1/2" />
                                            </div>
                                        </div>
                                    ))
                                ) : (stats?.recent_ai_messages ?? []).length === 0 ? (
                                    <div className="py-10 text-center text-xs text-white/20">No AI messages yet</div>
                                ) : (
                                    (stats?.recent_ai_messages ?? []).map((msg, i) => {
                                        const c = PROVIDER_COLORS[msg.provider?.split('-')[0]?.toLowerCase() ?? 'unknown'] ?? PROVIDER_COLORS.unknown;
                                        return (
                                            <motion.div key={i} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.05 }}
                                                className="flex items-center gap-3 px-5 py-3.5 hover:bg-white/[0.02] transition-colors">
                                                <div className={`w-8 h-8 rounded-lg ${c.bg} border border-white/[0.05] flex items-center justify-center flex-shrink-0`}>
                                                    <Bot className={`w-3.5 h-3.5 ${c.text}`} />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm font-medium text-white truncate">{msg.client_name}</p>
                                                    <p className="text-xs text-white/35 mt-0.5">
                                                        <span className={`capitalize ${c.text}`}>{msg.provider?.split('-')[0]}</span>
                                                        {' · '}{msg.response_length} chars
                                                    </p>
                                                </div>
                                                <span className="text-[11px] text-white/25 flex-shrink-0">{timeAgo(msg.timestamp)}</span>
                                            </motion.div>
                                        );
                                    })
                                )}
                            </div>
                        </div>

                        {/* Monthly summary */}
                        <div className="bg-[#0d0d16] border border-white/[0.07] rounded-2xl p-5">
                            <h2 className="text-sm font-bold text-white mb-4">Monthly Summary</h2>
                            <div className="space-y-3">
                                {[
                                    { label: 'This Month', value: stats?.messages_this_month ?? 0, color: 'bg-violet-500' },
                                    { label: 'Last Month', value: stats?.messages_last_month ?? 0, color: 'bg-white/20' },
                                ].map((row, i) => {
                                    const maxVal = Math.max(stats?.messages_this_month ?? 0, stats?.messages_last_month ?? 0, 1);
                                    return (
                                        <div key={i}>
                                            <div className="flex justify-between mb-1.5 text-xs">
                                                <span className="text-white/40">{row.label}</span>
                                                <span className="font-semibold text-white">{fmt(row.value)}</span>
                                            </div>
                                            <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                                                <motion.div initial={{ width: 0 }} animate={{ width: `${(row.value / maxVal) * 100}%` }}
                                                    transition={{ delay: 0.3 + i * 0.1, duration: 0.6 }}
                                                    className={`h-full rounded-full ${row.color}`} />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                            <div className="mt-4 pt-4 border-t border-white/[0.05]">
                                <div className="flex items-center justify-between">
                                    <span className="text-xs text-white/35">Month-over-month</span>
                                    {(stats?.messages_delta_pct ?? 0) !== 0 ? (
                                        <span className={`text-xs font-bold flex items-center gap-1 ${(stats?.messages_delta_pct ?? 0) > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                            {(stats?.messages_delta_pct ?? 0) > 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                                            {(stats?.messages_delta_pct ?? 0) > 0 ? '+' : ''}{stats?.messages_delta_pct ?? 0}%
                                        </span>
                                    ) : (
                                        <span className="text-xs text-white/25">No change</span>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Quick actions */}
                        <div className="bg-[#0d0d16] border border-white/[0.07] rounded-2xl p-5">
                            <h2 className="text-sm font-bold text-white mb-4">Quick Actions</h2>
                            <div className="space-y-2">
                                {[
                                    { label: 'Add new client', icon: Users, href: '/dashboard/clients/new', color: 'text-violet-400 bg-violet-500/10 border-violet-500/15' },
                                    { label: 'Create project', icon: FolderGit2, href: '/dashboard/projects', color: 'text-blue-400 bg-blue-500/10 border-blue-500/15' },
                                    { label: 'Configure AI keys', icon: Zap, href: '/dashboard/settings', color: 'text-amber-400 bg-amber-500/10 border-amber-500/15' },
                                    { label: 'Manage integrations', icon: Globe, href: '/dashboard/integrations', color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/15' },
                                ].map((action) => (
                                    <Link key={action.label} href={action.href}
                                        className="flex items-center gap-3 p-3 bg-white/[0.02] hover:bg-white/[0.05] border border-white/[0.05] rounded-xl transition-all group">
                                        <div className={`w-8 h-8 rounded-lg border flex items-center justify-center flex-shrink-0 ${action.color}`}>
                                            <action.icon className="w-3.5 h-3.5" />
                                        </div>
                                        <span className="text-sm font-medium text-white/70 group-hover:text-white transition-colors">{action.label}</span>
                                        <ChevronRight className="w-3.5 h-3.5 text-white/20 group-hover:text-white/50 ml-auto transition-colors" />
                                    </Link>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
