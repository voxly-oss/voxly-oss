'use client';

import { useQuery } from '@tanstack/react-query';
import { clientsAPI, projectsAPI, dashboardAPI } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { motion, useMotionValue, useTransform, animate, useInView } from 'framer-motion';
import {
    Users,
    FolderGit2,
    MessageSquare,
    TrendingUp,
    TrendingDown,
    Plus,
    ArrowUpRight,
    Sparkles,
    Rocket,
    Wifi,
    WifiOff,
    Bot,
    Github,
    Clock,
    Minus,
} from 'lucide-react';
import { useRef, useEffect } from 'react';
import SpotlightCard from '@/components/SpotlightCard';

type Client = {
    id: string;
    name: string;
    company?: string;
    created_at: string;
};

type Project = {
    id: string;
    name: string;
    status: string;
    client_id: string;
    expected_end_date: string;
};

type RecentAIMessage = {
    client_name: string;
    provider: string;
    response_length: number;
    timestamp: string;
};

type DashboardStats = {
    total_clients: number;
    active_clients: number;
    total_projects: number;
    active_projects: number;
    completed_projects: number;
    total_messages: number;
    messages_this_month: number;
    messages_last_month: number;
    clients_delta: number;
    projects_delta: number;
    messages_delta_pct: number;
    recent_ai_messages: RecentAIMessage[];
    integrations: {
        whatsapp: boolean;
        telegram: boolean;
        github: boolean;
        ai_provider: string;
    };
    ai_accuracy: number;
    recent_activity: Array<{ type: string; title: string; timestamp: string }>;
};

const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

const timeAgo = (timestamp: string): string => {
    const diff = Date.now() - new Date(timestamp).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
};

/* ─── Animation variants ─── */
const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
        opacity: 1,
        transition: { staggerChildren: 0.08 }
    }
};

const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.25, 0.1, 0.25, 1.0] as const } }
};

const RECENT_CLIENT_SKELETON_KEYS = [
    'recent-client-skeleton-1',
    'recent-client-skeleton-2',
    'recent-client-skeleton-3',
];

const ACTIVE_PROJECT_SKELETON_KEYS = [
    'active-project-skeleton-1',
    'active-project-skeleton-2',
    'active-project-skeleton-3',
];

/* ─── Animated counter ─── */
function AnimatedNumber({ value, duration = 1.5 }: { value: number; duration?: number }) {
    const ref = useRef<HTMLSpanElement>(null);
    const isInView = useInView(ref, { once: true });
    const motionVal = useMotionValue(0);
    const display = useTransform(motionVal, (v) => {
        if (v >= 1000) return (v / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
        return Math.round(v).toLocaleString();
    });

    useEffect(() => {
        if (isInView) {
            animate(motionVal, value, { duration, ease: 'easeOut' });
        }
    }, [isInView, value, duration, motionVal]);

    return <motion.span ref={ref}>{display}</motion.span>;
}

/* ─── Delta badge ─── */
function DeltaBadge({ delta, suffix = '' }: { delta: number; suffix?: string }) {
    if (delta === 0) {
        return (
            <span className="flex items-center gap-1 text-xs font-medium text-white/30">
                <Minus className="w-3 h-3" />
                No change
            </span>
        );
    }
    const isUp = delta > 0;
    return (
        <span className={`flex items-center gap-1 text-xs font-medium ${isUp ? 'text-emerald-400' : 'text-red-400'}`}>
            {isUp ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
            {isUp ? '+' : ''}{delta}{suffix} vs last month
        </span>
    );
}

/* ─── Skeleton pulse row ─── */
function SkeletonRow() {
    return (
        <div className="flex items-center gap-3 p-3">
            <div className="w-10 h-10 rounded-xl skeleton" />
            <div className="flex-1 space-y-2">
                <div className="h-4 w-32 skeleton rounded-lg" />
                <div className="h-3 w-24 skeleton rounded-lg" />
            </div>
            <div className="h-4 w-16 skeleton rounded-lg" />
        </div>
    );
}

/* ─── Empty state ─── */
function EmptyState({
    icon: Icon,
    title,
    description,
    actionLabel,
    actionHref,
    gradient,
}: {
    icon: React.ElementType;
    title: string;
    description: string;
    actionLabel: string;
    actionHref: string;
    gradient: string;
}) {
    return (
        <motion.div
            className="text-center py-10"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.3 }}
        >
            <div className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${gradient} flex items-center justify-center mx-auto mb-4 border border-white/10 shadow-[0_0_20px_-5px_rgba(124,58,237,0.3)]`}>
                <Icon className="w-7 h-7 text-white/60" />
            </div>
            <p className="text-white font-medium mb-1">{title}</p>
            <p className="text-sm text-white/40 mb-5 max-w-[200px] mx-auto leading-relaxed">{description}</p>
            <Link href={actionHref}>
                <Button size="sm" className="bg-white/10 hover:bg-white/20 text-white border border-white/10 backdrop-blur-sm transition-all">
                    <Plus className="w-3.5 h-3.5 mr-1.5" />
                    {actionLabel}
                </Button>
            </Link>
        </motion.div>
    );
}

/* ─── Integration pill ─── */
function IntegrationPill({ label, active, icon: Icon }: { label: string; active: boolean; icon: React.ElementType }) {
    return (
        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${
            active
                ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                : 'bg-white/[0.02] border-white/5 text-white/30'
        }`}>
            <Icon className="w-3.5 h-3.5" />
            {label}
            {active
                ? <Wifi className="w-3 h-3" />
                : <WifiOff className="w-3 h-3" />
            }
        </div>
    );
}

/* ═══════════════════ DASHBOARD PAGE ═══════════════════ */
export default function DashboardPage() {
    const { data: clients = [], isLoading: clientsLoading } = useQuery({
        queryKey: ['clients'],
        queryFn: async () => {
            const response = await clientsAPI.list();
            return response.data as Client[];
        },
    });

    const { data: projects = [], isLoading: projectsLoading } = useQuery({
        queryKey: ['projects'],
        queryFn: async () => {
            const response = await projectsAPI.list();
            return response.data as Project[];
        },
    });

    const { data: dashStats, isLoading: statsLoading } = useQuery({
        queryKey: ['dashboard-stats'],
        queryFn: async () => {
            const response = await dashboardAPI.stats();
            return response.data as DashboardStats;
        },
        staleTime: 30_000,
    });

    const activeProjects = projects.filter((p) => p.status === 'active');
    const isLoading = clientsLoading || projectsLoading || statsLoading;

    const stats = [
        {
            title: 'Total Clients',
            value: dashStats?.total_clients ?? clients.length,
            icon: Users,
            gradient: 'from-violet-500/20 to-purple-500/20',
            iconColor: 'text-violet-400',
            borderColor: 'border-violet-500/20',
            delta: dashStats?.clients_delta ?? null,
            deltaType: 'count' as const,
        },
        {
            title: 'Active Projects',
            value: dashStats?.active_projects ?? activeProjects.length,
            icon: FolderGit2,
            gradient: 'from-blue-500/20 to-cyan-500/20',
            iconColor: 'text-blue-400',
            borderColor: 'border-blue-500/20',
            delta: dashStats?.projects_delta ?? null,
            deltaType: 'count' as const,
        },
        {
            title: 'Messages This Month',
            value: dashStats?.messages_this_month ?? 0,
            icon: MessageSquare,
            gradient: 'from-emerald-500/20 to-green-500/20',
            iconColor: 'text-emerald-400',
            borderColor: 'border-emerald-500/20',
            delta: dashStats?.messages_delta_pct ?? null,
            deltaType: 'pct' as const,
        },
        {
            title: 'AI Accuracy',
            value: dashStats?.ai_accuracy ?? 0,
            icon: Bot,
            gradient: 'from-amber-500/20 to-yellow-500/20',
            iconColor: 'text-amber-400',
            borderColor: 'border-amber-500/20',
            delta: null,
            deltaType: 'count' as const,
            isPct: true,
        },
    ];

    const getStatusBadge = (status: string) => {
        const styles: Record<string, string> = {
            active: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 shadow-[0_0_10px_-4px_rgba(16,185,129,0.3)]',
            paused: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
            completed: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
            cancelled: 'bg-red-500/10 text-red-400 border-red-500/20',
        };
        return styles[status] || styles.active;
    };

    const providerLabel = dashStats?.integrations.ai_provider ?? 'none';
    const providerActive = providerLabel !== 'none';

    return (
        <motion.div
            className="space-y-8"
            variants={containerVariants}
            initial="hidden"
            animate="visible"
        >
            {/* Page header */}
            <motion.div
                className="flex items-center justify-between"
                variants={itemVariants}
            >
                <div>
                    <h1 className="text-3xl font-bold text-white flex items-center gap-3 tracking-tight">
                        Dashboard{' '}
                        <span className="relative flex h-3 w-3">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-violet-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-3 w-3 bg-violet-500"></span>
                        </span>
                    </h1>
                    <p className="text-white/50 mt-1">
                        Welcome back! Here&apos;s an overview of your agency.
                    </p>
                </div>
                <Link href="/clients/new">
                    <Button className="bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-500 hover:to-blue-500 text-white border-0 shadow-[0_0_20px_-5px_rgba(124,58,237,0.5)] btn-glow">
                        <Plus className="w-4 h-4 mr-2" />
                        Add Client
                    </Button>
                </Link>
            </motion.div>

            {/* Stats grid */}
            <motion.div
                className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4"
                variants={itemVariants}
            >
                {stats.map((stat) => {
                    let statValueContent = <AnimatedNumber value={stat.value} />;
                    if (isLoading) {
                        statValueContent = <span className="inline-block w-16 h-8 skeleton rounded" />;
                    } else if (stat.isPct) {
                        statValueContent = (
                            <>
                                <AnimatedNumber value={stat.value} />
                                <span className="text-lg font-normal text-white/40 ml-0.5">%</span>
                            </>
                        );
                    }

                    return (
                        <SpotlightCard
                            key={stat.title}
                            className={`h-full transition-all duration-300 hover:scale-[1.02] bg-[#0a0a0f]/50 border-white/5`}
                            spotlightColor="rgba(139, 92, 246, 0.15)"
                        >
                            <div className="flex items-start justify-between">
                                <div>
                                    <p className="text-sm font-medium text-white/50 mb-1">{stat.title}</p>
                                    <p className="text-3xl font-bold text-white tracking-tight">
                                        {statValueContent}
                                    </p>
                                </div>
                                <div className={`p-3 rounded-xl bg-gradient-to-br ${stat.gradient} border ${stat.borderColor} shadow-[inset_0_0_15px_rgba(255,255,255,0.05)]`}>
                                    <stat.icon className={`w-5 h-5 ${stat.iconColor}`} />
                                </div>
                            </div>
                            <div className="mt-4">
                                {isLoading ? (
                                    <div className="h-4 w-24 skeleton rounded" />
                                ) : stat.delta !== null ? (
                                    <DeltaBadge delta={stat.delta} suffix={stat.deltaType === 'pct' ? '%' : ''} />
                                ) : stat.isPct ? (
                                    <span className="text-xs text-white/30">Based on {dashStats?.total_messages ?? 0} total messages</span>
                                ) : null}
                            </div>
                        </SpotlightCard>
                    );
                })}
            </motion.div>

            {/* Integration Status + Quick Actions */}
            <motion.div
                className="p-4 rounded-xl border border-white/5 bg-white/[0.02] flex flex-wrap gap-3 items-center backdrop-blur-md"
                variants={itemVariants}
            >
                <div className="flex items-center gap-2 mr-2">
                    <Sparkles className="w-3.5 h-3.5 text-violet-400" />
                    <span className="text-sm font-medium text-white/50">Integrations:</span>
                </div>
                {statsLoading ? (
                    <>
                        <div className="h-7 w-28 skeleton rounded-lg" />
                        <div className="h-7 w-24 skeleton rounded-lg" />
                        <div className="h-7 w-32 skeleton rounded-lg" />
                    </>
                ) : (
                    <>
                        <IntegrationPill
                            label="WhatsApp"
                            active={dashStats?.integrations.whatsapp ?? false}
                            icon={MessageSquare}
                        />
                        <IntegrationPill
                            label="Telegram"
                            active={dashStats?.integrations.telegram ?? false}
                            icon={MessageSquare}
                        />
                        <IntegrationPill
                            label="GitHub"
                            active={dashStats?.integrations.github ?? false}
                            icon={Github}
                        />
                        <IntegrationPill
                            label={`AI: ${providerActive ? providerLabel.charAt(0).toUpperCase() + providerLabel.slice(1) : 'None'}`}
                            active={providerActive}
                            icon={Bot}
                        />
                    </>
                )}
                <div className="ml-auto flex gap-2">
                    {[
                        { label: 'New Client', href: '/clients/new', icon: Users },
                        { label: 'Settings', href: '/settings', icon: Sparkles },
                    ].map((action) => (
                        <Link key={action.label} href={action.href}>
                            <Button variant="outline" size="sm" className="bg-white/5 border-white/5 text-white/70 hover:text-white hover:bg-white/10 hover:border-white/10 transition-all rounded-lg h-8 text-xs font-medium">
                                <action.icon className="w-3.5 h-3.5 mr-1.5" />
                                {action.label}
                            </Button>
                        </Link>
                    ))}
                </div>
            </motion.div>

            {/* Recent clients & projects */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Recent Clients */}
                <motion.div variants={itemVariants}>
                    <SpotlightCard className="h-full bg-[#0a0a0f]/50 border-white/5 p-0 overflow-hidden flex flex-col">
                        <div className="px-6 py-5 border-b border-white/5 flex items-center justify-between bg-white/[0.01]">
                            <div>
                                <h3 className="text-lg font-bold text-white tracking-tight">Recent Clients</h3>
                                <p className="text-xs text-white/40 mt-0.5">Last 5 clients added</p>
                            </div>
                            <Link href="/clients">
                                <Button variant="ghost" size="sm" className="text-white/40 hover:text-white hover:bg-white/5 h-8 text-xs">
                                    View all
                                    <ArrowUpRight className="w-3.5 h-3.5 ml-1" />
                                </Button>
                            </Link>
                        </div>
                        <div className="p-4 flex-1">
                            {(() => {
                                if (clientsLoading) {
                                    return (
                                        <div className="space-y-1">
                                            {RECENT_CLIENT_SKELETON_KEYS.map((skeletonKey) => (
                                                <SkeletonRow key={skeletonKey} />
                                            ))}
                                        </div>
                                    );
                                }

                                if (clients.length === 0) {
                                    return (
                                        <EmptyState
                                            icon={Users}
                                            title="No clients yet"
                                            description="Add your first client to start managing projects"
                                            actionLabel="Add Client"
                                            actionHref="/clients/new"
                                            gradient="from-violet-500/20 to-purple-500/20"
                                        />
                                    );
                                }

                                return (
                                    <div className="space-y-1">
                                        {clients.slice(0, 5).map((client, i) => (
                                            <motion.div
                                                key={client.id}
                                                initial={{ opacity: 0, x: -10 }}
                                                animate={{ opacity: 1, x: 0 }}
                                                transition={{ delay: i * 0.05, duration: 0.3 }}
                                            >
                                                <Link
                                                    href={`/clients/${client.id}`}
                                                    className="flex items-center justify-between p-3 rounded-lg hover:bg-white/5 transition-all group border border-transparent hover:border-white/5"
                                                >
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-violet-500/10 to-blue-500/10 border border-white/5 flex items-center justify-center group-hover:border-violet-500/30 transition-all font-semibold text-white/70 group-hover:text-violet-400 group-hover:shadow-[0_0_15px_-5px_rgba(139,92,246,0.3)]">
                                                            {client.name.charAt(0).toUpperCase()}
                                                        </div>
                                                        <div>
                                                            <p className="font-medium text-sm text-white group-hover:text-violet-200 transition-colors">
                                                                {client.name}
                                                            </p>
                                                            <p className="text-xs text-white/40">
                                                                {client.company || 'No company'}
                                                            </p>
                                                        </div>
                                                    </div>
                                                    <span className="text-xs text-white/30 group-hover:text-white/50 transition-colors bg-white/5 px-2 py-1 rounded-md">
                                                        {formatDate(client.created_at)}
                                                    </span>
                                                </Link>
                                            </motion.div>
                                        ))}
                                    </div>
                                );
                            })()}
                        </div>
                    </SpotlightCard>
                </motion.div>

                {/* Active Projects */}
                <motion.div variants={itemVariants}>
                    <SpotlightCard className="h-full bg-[#0a0a0f]/50 border-white/5 p-0 overflow-hidden flex flex-col">
                        <div className="px-6 py-5 border-b border-white/5 flex items-center justify-between bg-white/[0.01]">
                             <div>
                                <h3 className="text-lg font-bold text-white tracking-tight">Active Projects</h3>
                                <p className="text-xs text-white/40 mt-0.5">Projects currently in progress</p>
                            </div>
                            <Link href="/projects">
                                <Button variant="ghost" size="sm" className="text-white/40 hover:text-white hover:bg-white/5 h-8 text-xs">
                                    View all
                                    <ArrowUpRight className="w-3.5 h-3.5 ml-1" />
                                </Button>
                            </Link>
                        </div>
                        <div className="p-4 flex-1">
                            {(() => {
                                if (projectsLoading) {
                                    return (
                                        <div className="space-y-1">
                                            {ACTIVE_PROJECT_SKELETON_KEYS.map((skeletonKey) => (
                                                <SkeletonRow key={skeletonKey} />
                                            ))}
                                        </div>
                                    );
                                }

                                if (activeProjects.length === 0) {
                                    return (
                                        <EmptyState
                                            icon={Rocket}
                                            title="No active projects"
                                            description="Create a project under any client to see it here"
                                            actionLabel="View Clients"
                                            actionHref="/clients"
                                            gradient="from-blue-500/20 to-cyan-500/20"
                                        />
                                    );
                                }

                                return (
                                    <div className="space-y-1">
                                        {activeProjects.slice(0, 5).map((project, i) => (
                                            <motion.div
                                                key={project.id}
                                                initial={{ opacity: 0, x: -10 }}
                                                animate={{ opacity: 1, x: 0 }}
                                                transition={{ delay: i * 0.05, duration: 0.3 }}
                                            >
                                                <Link
                                                    href={`/clients/${project.client_id}/projects/${project.id}`}
                                                    className="flex items-center justify-between p-3 rounded-lg hover:bg-white/5 transition-all group border border-transparent hover:border-white/5"
                                                >
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500/10 to-cyan-500/10 border border-white/5 flex items-center justify-center group-hover:border-blue-500/30 transition-all text-white/70 group-hover:text-blue-400 group-hover:shadow-[0_0_15px_-5px_rgba(59,130,246,0.3)]">
                                                            <FolderGit2 className="w-4 h-4" />
                                                        </div>
                                                        <div>
                                                            <p className="font-medium text-sm text-white group-hover:text-blue-200 transition-colors">
                                                                {project.name}
                                                            </p>
                                                            <p className="text-xs text-white/40">
                                                                Due {formatDate(project.expected_end_date)}
                                                            </p>
                                                        </div>
                                                    </div>
                                                    <Badge className={`${getStatusBadge(project.status)} border rounded-md px-2 py-0.5 text-[10px] uppercase font-semibold tracking-wider`}>
                                                        {project.status}
                                                    </Badge>
                                                </Link>
                                            </motion.div>
                                        ))}
                                    </div>
                                );
                            })()}
                        </div>
                    </SpotlightCard>
                </motion.div>
            </div>

            {/* AI Activity Feed */}
            <motion.div variants={itemVariants}>
                <SpotlightCard className="bg-[#0a0a0f]/50 border-white/5 p-0 overflow-hidden">
                    <div className="px-6 py-5 border-b border-white/5 flex items-center justify-between bg-white/[0.01]">
                        <div>
                            <h3 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
                                <Bot className="w-4 h-4 text-violet-400" />
                                Recent AI Activity
                            </h3>
                            <p className="text-xs text-white/40 mt-0.5">Last 5 AI interactions across your clients</p>
                        </div>
                        <Link href="/messages">
                            <Button variant="ghost" size="sm" className="text-white/40 hover:text-white hover:bg-white/5 h-8 text-xs">
                                All messages
                                <ArrowUpRight className="w-3.5 h-3.5 ml-1" />
                            </Button>
                        </Link>
                    </div>
                    <div className="p-4">
                        {statsLoading ? (
                            <div className="space-y-2">
                                {[1, 2, 3].map((k) => (
                                    <div key={k} className="flex items-center gap-3 p-3">
                                        <div className="w-8 h-8 rounded-lg skeleton" />
                                        <div className="flex-1 space-y-1.5">
                                            <div className="h-3.5 w-32 skeleton rounded" />
                                            <div className="h-3 w-48 skeleton rounded" />
                                        </div>
                                        <div className="h-3 w-12 skeleton rounded" />
                                    </div>
                                ))}
                            </div>
                        ) : !dashStats?.recent_ai_messages?.length ? (
                            <div className="text-center py-8">
                                <div className="w-12 h-12 rounded-2xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center mx-auto mb-3">
                                    <Bot className="w-5 h-5 text-violet-400/60" />
                                </div>
                                <p className="text-white/40 text-sm">No AI interactions yet</p>
                                <p className="text-white/20 text-xs mt-1">Messages will appear here as clients interact via WhatsApp</p>
                            </div>
                        ) : (
                            <div className="space-y-1">
                                {dashStats.recent_ai_messages.map((msg, i) => (
                                    <motion.div
                                        key={i}
                                        initial={{ opacity: 0, x: -10 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ delay: i * 0.05 }}
                                        className="flex items-center gap-3 p-3 rounded-lg hover:bg-white/[0.03] transition-all"
                                    >
                                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500/20 to-blue-500/20 border border-white/5 flex items-center justify-center flex-shrink-0">
                                            <Bot className="w-3.5 h-3.5 text-violet-400" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-medium text-white">
                                                {msg.client_name}
                                            </p>
                                            <p className="text-xs text-white/40">
                                                via <span className="text-violet-400/70 font-medium capitalize">{msg.provider}</span>
                                                {' · '}{msg.response_length} chars
                                            </p>
                                        </div>
                                        <div className="flex items-center gap-1 text-xs text-white/30 flex-shrink-0">
                                            <Clock className="w-3 h-3" />
                                            {timeAgo(msg.timestamp)}
                                        </div>
                                    </motion.div>
                                ))}
                            </div>
                        )}
                    </div>
                </SpotlightCard>
            </motion.div>
        </motion.div>
    );
}
