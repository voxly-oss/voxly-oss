'use client';

import { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { superAdminAPI, authAPI } from '@/lib/api';
import {
    Shield, Users, FolderGit2, MessageSquare, Zap, RefreshCw,
    Search, LogIn, ChevronRight, X, TrendingUp, Clock, Bot,
    AlertTriangle, CheckCircle2, XCircle, Eye, Copy, Check,
    Power, ArrowUpRight, Lock
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface SystemStats {
    total_tenants: number;
    active_tenants: number;
    total_clients: number;
    total_projects: number;
    total_messages: number;
    total_tokens_used: number;
}

interface Tenant {
    id: string;
    email: string;
    full_name: string | null;
    agency_name: string | null;
    is_active: boolean;
    subscription_tier: string;
    plan_name: string | null;
    client_count: number;
    project_count: number;
    message_count: number;
    created_at: string;
}

interface TenantDetail extends Tenant {
    total_messages: number;
    tokens_used: number;
    last_active: string | null;
    recent_messages: Array<{
        client_name: string;
        provider: string;
        tokens: number;
        timestamp: string;
    }>;
}

interface ActivityItem {
    tenant_email: string;
    agency_name: string | null;
    client_name: string;
    provider: string;
    tokens: number;
    timestamp: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const timeAgo = (ts: string) => {
    const diff = Date.now() - new Date(ts).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
};

const TIER_STYLES: Record<string, { bg: string; text: string; border: string }> = {
    free:       { bg: 'bg-white/5',          text: 'text-white/50',   border: 'border-white/10' },
    pro:        { bg: 'bg-violet-500/10',     text: 'text-violet-400', border: 'border-violet-500/20' },
    enterprise: { bg: 'bg-amber-500/10',      text: 'text-amber-400',  border: 'border-amber-500/20' },
};

function PlanBadge({ tier }: { tier: string }) {
    const s = TIER_STYLES[tier] ?? TIER_STYLES.free;
    return (
        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${s.bg} ${s.text} ${s.border}`}>
            {tier}
        </span>
    );
}

function StatusDot({ active }: { active: boolean }) {
    return (
        <span className={`flex items-center gap-1.5 text-xs font-medium ${active ? 'text-emerald-400' : 'text-red-400'}`}>
            <span className={`w-2 h-2 rounded-full ${active ? 'bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.6)]' : 'bg-red-500'}`} />
            {active ? 'Active' : 'Disabled'}
        </span>
    );
}

// ─── Auth Gate ────────────────────────────────────────────────────────────────

function AuthGate({ onUnlock }: { onUnlock: (secret: string) => void }) {
    const [secret, setSecret] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    // Check if already logged in
    useEffect(() => {
        const token = localStorage.getItem('access_token');
        if (!token) {
            window.location.href = '/login';
        }
    }, []);

    const handleUnlock = async () => {
        if (!secret.trim()) return;
        setLoading(true);
        setError('');
        try {
            // Validate secret against backend before allowing access
            await superAdminAPI.getStats(secret);
            onUnlock(secret);
        } catch (e: unknown) {
            const err = e as { response?: { status?: number } };
            if (err?.response?.status === 403) {
                setError('Invalid admin secret. Check your credentials.');
            } else {
                setError('Connection error. Is the backend reachable?');
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-[#05050a] flex items-center justify-center p-4">
            {/* Background glow */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-violet-600/5 rounded-full blur-[120px]" />
            </div>

            <motion.div
                initial={{ opacity: 0, y: 20, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
                className="relative w-full max-w-sm"
            >
                <div className="bg-[#0d0d14] border border-white/8 rounded-2xl p-8 shadow-2xl backdrop-blur-xl">
                    {/* Icon */}
                    <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-500/20 to-blue-500/20 border border-violet-500/20 flex items-center justify-center mx-auto mb-6 shadow-[0_0_30px_-10px_rgba(139,92,246,0.4)]">
                        <Shield className="w-7 h-7 text-violet-400" />
                    </div>

                    <h1 className="text-2xl font-bold text-white text-center tracking-tight mb-1">
                        Command Center
                    </h1>
                    <p className="text-white/40 text-sm text-center mb-8">
                        Owner access only. Enter your admin secret to continue.
                    </p>

                    <div className="space-y-3">
                        <div className="relative">
                            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20" />
                            <input
                                type="password"
                                placeholder="X-Admin-Secret"
                                value={secret}
                                onChange={e => setSecret(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && handleUnlock()}
                                className="w-full pl-10 pr-4 py-3 bg-white/[0.03] border border-white/8 rounded-xl text-white placeholder:text-white/20 focus:outline-none focus:border-violet-500/30 focus:bg-white/[0.05] transition-all text-sm"
                                autoFocus
                            />
                        </div>

                        <AnimatePresence>
                            {error && (
                                <motion.p
                                    initial={{ opacity: 0, y: -4 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0 }}
                                    className="text-xs text-red-400 flex items-center gap-1.5"
                                >
                                    <AlertTriangle className="w-3.5 h-3.5" />
                                    {error}
                                </motion.p>
                            )}
                        </AnimatePresence>

                        <button
                            onClick={handleUnlock}
                            disabled={loading || !secret.trim()}
                            className="w-full py-3 bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-500 hover:to-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-all shadow-[0_0_20px_-5px_rgba(124,58,237,0.4)] hover:shadow-[0_0_30px_-5px_rgba(124,58,237,0.6)] flex items-center justify-center gap-2"
                        >
                            {loading ? (
                                <RefreshCw className="w-4 h-4 animate-spin" />
                            ) : (
                                <>
                                    <LogIn className="w-4 h-4" />
                                    Unlock Command Center
                                </>
                            )}
                        </button>
                    </div>

                    <p className="text-center text-xs text-white/20 mt-6">
                        You must be logged in as the super admin account
                    </p>
                </div>
            </motion.div>
        </div>
    );
}

// ─── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({ label, value, icon: Icon, accent }: {
    label: string;
    value: string | number;
    icon: React.ElementType;
    accent: string;
}) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-[#0d0d14] border border-white/8 rounded-xl p-5 hover:border-white/15 transition-all group"
        >
            <div className="flex items-start justify-between mb-3">
                <div className={`w-9 h-9 rounded-lg bg-gradient-to-br ${accent} flex items-center justify-center`}>
                    <Icon className="w-4 h-4 text-white/80" />
                </div>
            </div>
            <p className="text-2xl font-bold text-white tracking-tight">
                {typeof value === 'number' ? value.toLocaleString() : value}
            </p>
            <p className="text-xs text-white/40 mt-1 font-medium uppercase tracking-wider">{label}</p>
        </motion.div>
    );
}

// ─── Tenant Detail Drawer ─────────────────────────────────────────────────────

function TenantDrawer({
    tenant,
    onClose,
    adminSecret,
}: {
    tenant: Tenant;
    onClose: () => void;
    adminSecret: string;
}) {
    const [detail, setDetail] = useState<TenantDetail | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        superAdminAPI.getTenantDetail(tenant.id, adminSecret)
            .then(res => setDetail(res.data))
            .catch(console.error)
            .finally(() => setLoading(false));
    }, [tenant.id, adminSecret]);

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex"
            onClick={onClose}
        >
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

            {/* Drawer */}
            <motion.div
                initial={{ x: '100%' }}
                animate={{ x: 0 }}
                exit={{ x: '100%' }}
                transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                className="absolute right-0 top-0 bottom-0 w-full max-w-lg bg-[#0d0d14] border-l border-white/8 overflow-y-auto"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="sticky top-0 bg-[#0d0d14]/95 backdrop-blur-xl border-b border-white/8 px-6 py-4 flex items-center justify-between z-10">
                    <div>
                        <h2 className="text-lg font-bold text-white">{tenant.agency_name ?? tenant.email}</h2>
                        <p className="text-xs text-white/40">{tenant.email}</p>
                    </div>
                    <button
                        onClick={onClose}
                        className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/50 hover:text-white transition-all"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                <div className="p-6 space-y-6">
                    {/* Badges */}
                    <div className="flex items-center gap-3 flex-wrap">
                        <PlanBadge tier={tenant.subscription_tier} />
                        <StatusDot active={tenant.is_active} />
                        <span className="text-xs text-white/30">
                            Joined {new Date(tenant.created_at).toLocaleDateString()}
                        </span>
                    </div>

                    {/* Stats grid */}
                    <div className="grid grid-cols-3 gap-3">
                        {[
                            { label: 'Clients', value: tenant.client_count, icon: Users },
                            { label: 'Projects', value: tenant.project_count, icon: FolderGit2 },
                            { label: 'Messages', value: tenant.message_count, icon: MessageSquare },
                        ].map(s => (
                            <div key={s.label} className="bg-white/[0.02] border border-white/5 rounded-xl p-4 text-center">
                                <s.icon className="w-4 h-4 text-white/30 mx-auto mb-2" />
                                <p className="text-xl font-bold text-white">{s.value.toLocaleString()}</p>
                                <p className="text-xs text-white/40">{s.label}</p>
                            </div>
                        ))}
                    </div>

                    {/* Extended stats */}
                    {loading ? (
                        <div className="space-y-2">
                            {[1,2,3].map(k => (
                                <div key={k} className="h-12 rounded-xl bg-white/[0.02] animate-pulse" />
                            ))}
                        </div>
                    ) : detail && (
                        <>
                            <div className="grid grid-cols-2 gap-3">
                                <div className="bg-white/[0.02] border border-white/5 rounded-xl p-4">
                                    <p className="text-xs text-white/40 mb-1">Tokens Used</p>
                                    <p className="text-lg font-bold text-white">{detail.tokens_used.toLocaleString()}</p>
                                </div>
                                <div className="bg-white/[0.02] border border-white/5 rounded-xl p-4">
                                    <p className="text-xs text-white/40 mb-1">Last Active</p>
                                    <p className="text-sm font-semibold text-white">
                                        {detail.last_active ? timeAgo(detail.last_active) : 'Never'}
                                    </p>
                                </div>
                            </div>

                            {/* Recent AI messages */}
                            {detail.recent_messages.length > 0 && (
                                <div>
                                    <h3 className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-3">
                                        Recent AI Activity
                                    </h3>
                                    <div className="space-y-2">
                                        {detail.recent_messages.map((msg, i) => (
                                            <div
                                                key={i}
                                                className="flex items-center gap-3 p-3 bg-white/[0.02] border border-white/5 rounded-lg"
                                            >
                                                <div className="w-7 h-7 rounded-lg bg-violet-500/10 border border-violet-500/20 flex items-center justify-center flex-shrink-0">
                                                    <Bot className="w-3 h-3 text-violet-400" />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm text-white font-medium truncate">{msg.client_name}</p>
                                                    <p className="text-xs text-white/40">
                                                        <span className="text-violet-400/70 capitalize">{msg.provider}</span>
                                                        {' · '}{msg.tokens} tokens
                                                    </p>
                                                </div>
                                                <span className="text-xs text-white/30 flex-shrink-0">{timeAgo(msg.timestamp)}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </motion.div>
        </motion.div>
    );
}

// ─── Main Command Center ──────────────────────────────────────────────────────

type ActiveTab = 'overview' | 'tenants' | 'activity';

export default function CommandCenterPage() {
    const [adminSecret, setAdminSecret] = useState<string | null>(null);
    const [stats, setStats] = useState<SystemStats | null>(null);
    const [tenants, setTenants] = useState<Tenant[]>([]);
    const [activity, setActivity] = useState<ActivityItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [search, setSearch] = useState('');
    const [filterTier, setFilterTier] = useState<string>('all');
    const [actionLoading, setActionLoading] = useState<string | null>(null);
    const [toastMsg, setToastMsg] = useState('');
    const [activeTab, setActiveTab] = useState<ActiveTab>('overview');
    const [selectedTenant, setSelectedTenant] = useState<Tenant | null>(null);
    const [copiedId, setCopiedId] = useState<string | null>(null);

    const showToast = (msg: string) => {
        setToastMsg(msg);
        setTimeout(() => setToastMsg(''), 3000);
    };

    const loadData = useCallback(async (secret: string) => {
        setLoading(true);
        setError('');
        try {
            const [statsRes, tenantsRes, activityRes] = await Promise.all([
                superAdminAPI.getStats(secret),
                superAdminAPI.getTenants(secret),
                superAdminAPI.getActivity(secret),
            ]);
            setStats(statsRes.data);
            setTenants(tenantsRes.data);
            setActivity(activityRes.data);
        } catch (e: unknown) {
            const err = e as { response?: { status?: number } };
            if (err?.response?.status === 403) {
                setError('Access denied. Re-enter credentials.');
                setAdminSecret(null);
            } else {
                setError('Failed to load data. Backend may be restarting.');
            }
        } finally {
            setLoading(false);
        }
    }, []);

    const handleUnlock = (secret: string) => {
        setAdminSecret(secret);
        loadData(secret);
    };

    const handleToggleDisable = async (tenant: Tenant) => {
        if (!adminSecret) return;
        if (!confirm(`${tenant.is_active ? 'Disable' : 'Enable'} account for ${tenant.email}?`)) return;
        setActionLoading(tenant.id + '_disable');
        try {
            await superAdminAPI.toggleDisable(tenant.id, adminSecret);
            showToast(`${tenant.email} ${tenant.is_active ? 'disabled ✅' : 'enabled ✅'}`);
            loadData(adminSecret);
        } finally {
            setActionLoading(null);
        }
    };

    const handleOverridePlan = async (tenant: Tenant, newTier: string) => {
        if (!adminSecret) return;
        setActionLoading(tenant.id + '_plan');
        try {
            await superAdminAPI.overridePlan(tenant.id, newTier, adminSecret);
            showToast(`${tenant.email} → ${newTier} ✅`);
            loadData(adminSecret);
        } finally {
            setActionLoading(null);
        }
    };

    const handleImpersonate = async (tenant: Tenant) => {
        if (!adminSecret) return;
        if (!confirm(`⚠️ Impersonate ${tenant.email}? 15-min token will be generated.`)) return;
        setActionLoading(tenant.id + '_impersonate');
        try {
            const res = await superAdminAPI.impersonate(tenant.id, adminSecret);
            const { access_token } = res.data;
            await navigator.clipboard.writeText(access_token);
            setCopiedId(tenant.id);
            showToast('Impersonation token copied! Expires in 15 min.');
            setTimeout(() => setCopiedId(null), 3000);
        } finally {
            setActionLoading(null);
        }
    };

    const filtered = tenants.filter(t => {
        const matchSearch = search === '' ||
            t.email.toLowerCase().includes(search.toLowerCase()) ||
            (t.agency_name ?? '').toLowerCase().includes(search.toLowerCase());
        const matchTier = filterTier === 'all' || t.subscription_tier === filterTier;
        return matchSearch && matchTier;
    });

    if (!adminSecret) return <AuthGate onUnlock={handleUnlock} />;

    const tabs: Array<{ id: ActiveTab; label: string; icon: React.ElementType }> = [
        { id: 'overview', label: 'Overview', icon: TrendingUp },
        { id: 'tenants', label: `Tenants (${tenants.length})`, icon: Users },
        { id: 'activity', label: 'Activity', icon: Zap },
    ];

    return (
        <div className="min-h-screen bg-[#05050a] text-white font-[Inter,system-ui,sans-serif]">
            {/* Background */}
            <div className="fixed inset-0 pointer-events-none">
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[300px] bg-violet-600/5 rounded-full blur-[120px]" />
            </div>

            {/* Toast */}
            <AnimatePresence>
                {toastMsg && (
                    <motion.div
                        initial={{ opacity: 0, y: 20, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 20, scale: 0.95 }}
                        className="fixed bottom-6 right-6 z-50 bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 px-5 py-3 rounded-xl font-medium text-sm backdrop-blur-xl shadow-2xl"
                    >
                        {toastMsg}
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Tenant Detail Drawer */}
            <AnimatePresence>
                {selectedTenant && adminSecret && (
                    <TenantDrawer
                        tenant={selectedTenant}
                        adminSecret={adminSecret}
                        onClose={() => setSelectedTenant(null)}
                    />
                )}
            </AnimatePresence>

            <div className="relative max-w-7xl mx-auto px-6 py-8 space-y-8">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500/20 to-blue-500/20 border border-violet-500/20 flex items-center justify-center">
                            <Shield className="w-5 h-5 text-violet-400" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold text-white tracking-tight">Voxly Command Center</h1>
                            <p className="text-xs text-white/40">Super Admin · Owner view only</p>
                        </div>
                    </div>
                    <button
                        onClick={() => adminSecret && loadData(adminSecret)}
                        disabled={loading}
                        className="flex items-center gap-2 px-4 py-2 bg-white/[0.03] border border-white/8 rounded-xl text-white/60 hover:text-white hover:bg-white/[0.06] transition-all text-sm font-medium"
                    >
                        <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                        Refresh
                    </button>
                </div>

                {/* Error banner */}
                <AnimatePresence>
                    {error && (
                        <motion.div
                            initial={{ opacity: 0, y: -8 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0 }}
                            className="flex items-center gap-3 p-4 bg-red-500/5 border border-red-500/20 rounded-xl text-red-400 text-sm"
                        >
                            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                            {error}
                            <button onClick={() => setError('')} className="ml-auto text-red-400/60 hover:text-red-400">
                                <X className="w-4 h-4" />
                            </button>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Tab Bar */}
                <div className="flex gap-1 p-1.5 bg-[#0d0d14] border border-white/8 rounded-2xl w-fit">
                    {tabs.map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`relative flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-medium transition-all ${
                                activeTab === tab.id ? 'text-white' : 'text-white/40 hover:text-white/70'
                            }`}
                        >
                            {activeTab === tab.id && (
                                <motion.div
                                    layoutId="cmd-tab"
                                    className="absolute inset-0 bg-white/8 border border-white/10 rounded-xl"
                                    transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                                />
                            )}
                            <tab.icon className={`w-4 h-4 relative z-10 ${activeTab === tab.id ? 'text-violet-400' : ''}`} />
                            <span className="relative z-10">{tab.label}</span>
                        </button>
                    ))}
                </div>

                {/* Tab Content */}
                <AnimatePresence mode="wait">

                    {/* ── Overview Tab ── */}
                    {activeTab === 'overview' && (
                        <motion.div
                            key="overview"
                            initial={{ opacity: 0, y: 12 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -8 }}
                            transition={{ duration: 0.2 }}
                            className="space-y-6"
                        >
                            {loading && !stats ? (
                                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                                    {[...Array(6)].map((_, i) => (
                                        <div key={i} className="h-28 bg-white/[0.02] border border-white/5 rounded-xl animate-pulse" />
                                    ))}
                                </div>
                            ) : stats && (
                                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                                    <StatCard label="Total Tenants" value={stats.total_tenants} icon={Users} accent="from-violet-500/20 to-purple-500/20" />
                                    <StatCard label="Active Tenants" value={stats.active_tenants} icon={CheckCircle2} accent="from-emerald-500/20 to-green-500/20" />
                                    <StatCard label="Total Clients" value={stats.total_clients} icon={Users} accent="from-blue-500/20 to-cyan-500/20" />
                                    <StatCard label="Total Projects" value={stats.total_projects} icon={FolderGit2} accent="from-amber-500/20 to-yellow-500/20" />
                                    <StatCard label="AI Messages" value={stats.total_messages} icon={MessageSquare} accent="from-violet-500/20 to-fuchsia-500/20" />
                                    <StatCard label="Tokens Used" value={stats.total_tokens_used.toLocaleString()} icon={Zap} accent="from-red-500/20 to-rose-500/20" />
                                </div>
                            )}

                            {/* Recent global activity preview */}
                            {activity.length > 0 && (
                                <div className="bg-[#0d0d14] border border-white/8 rounded-2xl overflow-hidden">
                                    <div className="px-6 py-4 border-b border-white/8 flex items-center justify-between">
                                        <h2 className="text-base font-bold text-white">Recent Platform Activity</h2>
                                        <button onClick={() => setActiveTab('activity')} className="text-xs text-violet-400 hover:text-violet-300 flex items-center gap-1">
                                            View all <ArrowUpRight className="w-3 h-3" />
                                        </button>
                                    </div>
                                    <div className="divide-y divide-white/5">
                                        {activity.slice(0, 5).map((item, i) => (
                                            <div key={i} className="flex items-center gap-4 px-6 py-3">
                                                <div className="w-8 h-8 rounded-lg bg-violet-500/10 border border-violet-500/20 flex items-center justify-center flex-shrink-0">
                                                    <Bot className="w-3.5 h-3.5 text-violet-400" />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm text-white font-medium">{item.agency_name ?? item.tenant_email}</p>
                                                    <p className="text-xs text-white/40">
                                                        {item.client_name} · <span className="capitalize text-violet-400/70">{item.provider}</span> · {item.tokens} tokens
                                                    </p>
                                                </div>
                                                <span className="text-xs text-white/30 flex-shrink-0">{timeAgo(item.timestamp)}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </motion.div>
                    )}

                    {/* ── Tenants Tab ── */}
                    {activeTab === 'tenants' && (
                        <motion.div
                            key="tenants"
                            initial={{ opacity: 0, y: 12 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -8 }}
                            transition={{ duration: 0.2 }}
                        >
                            <div className="bg-[#0d0d14] border border-white/8 rounded-2xl overflow-hidden">
                                {/* Toolbar */}
                                <div className="px-6 py-4 border-b border-white/8 flex items-center gap-4 flex-wrap">
                                    <div className="relative flex-1 min-w-[200px]">
                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20" />
                                        <input
                                            value={search}
                                            onChange={e => setSearch(e.target.value)}
                                            placeholder="Search by email or agency..."
                                            className="w-full pl-9 pr-4 py-2 bg-white/[0.03] border border-white/8 rounded-xl text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-violet-500/30 transition-all"
                                        />
                                    </div>
                                    <select
                                        value={filterTier}
                                        onChange={e => setFilterTier(e.target.value)}
                                        className="px-3 py-2 bg-white/[0.03] border border-white/8 rounded-xl text-sm text-white/70 focus:outline-none focus:border-violet-500/30 transition-all"
                                    >
                                        <option value="all">All Plans</option>
                                        <option value="free">Free</option>
                                        <option value="pro">Pro</option>
                                        <option value="enterprise">Enterprise</option>
                                    </select>
                                    <span className="text-xs text-white/30">{filtered.length} tenants</span>
                                </div>

                                {/* Table */}
                                {loading ? (
                                    <div className="p-8 text-center text-white/30 text-sm">Loading tenants...</div>
                                ) : (
                                    <div className="overflow-x-auto">
                                        <table className="w-full">
                                            <thead>
                                                <tr className="border-b border-white/5">
                                                    {['Agency', 'Email', 'Plan', 'Clients', 'Projects', 'Messages', 'Status', 'Actions'].map(h => (
                                                        <th key={h} className="px-4 py-3 text-left text-[11px] font-semibold text-white/30 uppercase tracking-wider">
                                                            {h}
                                                        </th>
                                                    ))}
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-white/[0.04]">
                                                {filtered.map(tenant => (
                                                    <tr
                                                        key={tenant.id}
                                                        className="hover:bg-white/[0.02] transition-colors group cursor-pointer"
                                                        onClick={() => setSelectedTenant(tenant)}
                                                    >
                                                        <td className="px-4 py-3.5">
                                                            <p className="font-semibold text-sm text-white">{tenant.agency_name ?? '—'}</p>
                                                            <p className="text-xs text-white/30">
                                                                Joined {new Date(tenant.created_at).toLocaleDateString()}
                                                            </p>
                                                        </td>
                                                        <td className="px-4 py-3.5">
                                                            <span className="text-sm text-white/70">{tenant.email}</span>
                                                        </td>
                                                        <td className="px-4 py-3.5">
                                                            <PlanBadge tier={tenant.subscription_tier} />
                                                        </td>
                                                        <td className="px-4 py-3.5 text-center text-sm text-white/60">{tenant.client_count}</td>
                                                        <td className="px-4 py-3.5 text-center text-sm text-white/60">{tenant.project_count}</td>
                                                        <td className="px-4 py-3.5 text-center text-sm text-white/60">{tenant.message_count}</td>
                                                        <td className="px-4 py-3.5">
                                                            <StatusDot active={tenant.is_active} />
                                                        </td>
                                                        <td className="px-4 py-3.5" onClick={e => e.stopPropagation()}>
                                                            <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                                                {/* Plan selector */}
                                                                <select
                                                                    defaultValue={tenant.subscription_tier}
                                                                    onChange={e => handleOverridePlan(tenant, e.target.value)}
                                                                    disabled={actionLoading === tenant.id + '_plan'}
                                                                    className="px-2 py-1 bg-white/[0.04] border border-white/8 rounded-lg text-xs text-white/70 focus:outline-none cursor-pointer"
                                                                    onClick={e => e.stopPropagation()}
                                                                >
                                                                    <option value="free">Free</option>
                                                                    <option value="pro">Pro</option>
                                                                    <option value="enterprise">Enterprise</option>
                                                                </select>

                                                                {/* Kill switch */}
                                                                <button
                                                                    onClick={() => handleToggleDisable(tenant)}
                                                                    disabled={actionLoading === tenant.id + '_disable'}
                                                                    title={tenant.is_active ? 'Disable account' : 'Enable account'}
                                                                    className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all text-xs ${
                                                                        tenant.is_active
                                                                            ? 'bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20'
                                                                            : 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20'
                                                                    }`}
                                                                >
                                                                    {tenant.is_active
                                                                        ? <XCircle className="w-3.5 h-3.5" />
                                                                        : <CheckCircle2 className="w-3.5 h-3.5" />
                                                                    }
                                                                </button>

                                                                {/* Impersonate */}
                                                                <button
                                                                    onClick={() => handleImpersonate(tenant)}
                                                                    disabled={actionLoading === tenant.id + '_impersonate'}
                                                                    title="Login as this tenant"
                                                                    className="w-7 h-7 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400 hover:bg-blue-500/20 flex items-center justify-center transition-all"
                                                                >
                                                                    {copiedId === tenant.id
                                                                        ? <Check className="w-3.5 h-3.5 text-emerald-400" />
                                                                        : <Eye className="w-3.5 h-3.5" />
                                                                    }
                                                                </button>

                                                                {/* View detail */}
                                                                <button
                                                                    onClick={() => setSelectedTenant(tenant)}
                                                                    title="View details"
                                                                    className="w-7 h-7 rounded-lg bg-white/[0.03] border border-white/8 text-white/50 hover:text-white hover:bg-white/[0.06] flex items-center justify-center transition-all"
                                                                >
                                                                    <ChevronRight className="w-3.5 h-3.5" />
                                                                </button>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>

                                        {filtered.length === 0 && (
                                            <div className="py-16 text-center text-white/30 text-sm">
                                                No tenants match your search.
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    )}

                    {/* ── Activity Tab ── */}
                    {activeTab === 'activity' && (
                        <motion.div
                            key="activity"
                            initial={{ opacity: 0, y: 12 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -8 }}
                            transition={{ duration: 0.2 }}
                        >
                            <div className="bg-[#0d0d14] border border-white/8 rounded-2xl overflow-hidden">
                                <div className="px-6 py-4 border-b border-white/8">
                                    <h2 className="text-base font-bold text-white">Platform Activity</h2>
                                    <p className="text-xs text-white/40 mt-0.5">Last {activity.length} AI interactions across all tenants</p>
                                </div>

                                {loading ? (
                                    <div className="p-8 text-center text-white/30 text-sm">Loading activity...</div>
                                ) : activity.length === 0 ? (
                                    <div className="py-16 text-center">
                                        <Bot className="w-10 h-10 text-white/10 mx-auto mb-3" />
                                        <p className="text-white/30 text-sm">No activity yet</p>
                                    </div>
                                ) : (
                                    <div className="divide-y divide-white/[0.04]">
                                        {activity.map((item, i) => (
                                            <div key={i} className="flex items-center gap-4 px-6 py-3.5 hover:bg-white/[0.02] transition-colors">
                                                <div className="w-9 h-9 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center flex-shrink-0">
                                                    <Bot className="w-4 h-4 text-violet-400" />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <span className="text-sm font-semibold text-white">{item.agency_name ?? item.tenant_email}</span>
                                                        <ChevronRight className="w-3 h-3 text-white/20" />
                                                        <span className="text-sm text-white/60">{item.client_name}</span>
                                                    </div>
                                                    <p className="text-xs text-white/40 mt-0.5">
                                                        via <span className="text-violet-400/70 font-medium capitalize">{item.provider}</span>
                                                        {' · '}{item.tokens} tokens used
                                                    </p>
                                                </div>
                                                <div className="text-right flex-shrink-0">
                                                    <p className="text-xs text-white/30 flex items-center gap-1">
                                                        <Clock className="w-3 h-3" />
                                                        {timeAgo(item.timestamp)}
                                                    </p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    )}

                </AnimatePresence>
            </div>
        </div>
    );
}
