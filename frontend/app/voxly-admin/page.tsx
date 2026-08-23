'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { superAdminAPI, authAPI, checkAdminSession } from '@/lib/api';
import {
    Shield, Users, FolderGit2, MessageSquare, Zap, RefreshCw,
    Search, LogIn, ChevronRight, X, TrendingUp, Clock, Bot,
    AlertTriangle, CheckCircle2, XCircle, Eye, Copy, Check,
    Power, ArrowUpRight, Lock, Activity, Terminal, Globe,
    Cpu, Database, Wifi, BarChart3, ChevronDown, Filter,
    MessageCircle, Send, Star, Ban, MoreVertical, Hash,
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

const fmt = (n: number) => n.toLocaleString();

const TIER_STYLES: Record<string, { bg: string; text: string; border: string; dot: string }> = {
    free: { bg: 'bg-white/5', text: 'text-white/50', border: 'border-white/10', dot: 'bg-white/30' },
    pro: { bg: 'bg-violet-500/10', text: 'text-violet-400', border: 'border-violet-500/20', dot: 'bg-violet-400' },
    enterprise: { bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/20', dot: 'bg-amber-400' },
};

const PROVIDER_COLORS: Record<string, string> = {
    gemini: 'text-blue-400',
    openai: 'text-emerald-400',
    claude: 'text-violet-400',
    unknown: 'text-white/30',
    error: 'text-red-400',
};

function PlanBadge({ tier }: { tier: string }) {
    const s = TIER_STYLES[tier] ?? TIER_STYLES.free;
    return (
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border ${s.bg} ${s.text} ${s.border}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
            {tier}
        </span>
    );
}

function StatusDot({ active }: { active: boolean }) {
    return (
        <span className={`flex items-center gap-1.5 text-xs font-medium ${active ? 'text-emerald-400' : 'text-red-400'}`}>
            <span className={`w-2 h-2 rounded-full ${active ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.7)] animate-pulse' : 'bg-red-500'}`} />
            {active ? 'Active' : 'Disabled'}
        </span>
    );
}

// Mini sparkline using SVG
function Sparkline({ data, color = '#8b5cf6' }: { data: number[]; color?: string }) {
    if (!data.length) return null;
    const max = Math.max(...data, 1);
    const w = 80; const h = 28;
    const pts = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - (v / max) * h}`).join(' ');
    return (
        <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="opacity-70">
            <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}

// Mini bar chart
function MiniBar({ value, max, color }: { value: number; max: number; color: string }) {
    const pct = max > 0 ? (value / max) * 100 : 0;
    return (
        <div className="flex items-center gap-2">
            <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
                <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
            </div>
            <span className="text-xs text-white/40 w-8 text-right">{value}</span>
        </div>
    );
}

// ─── Auth Gate ────────────────────────────────────────────────────────────────

function AuthGate({ onUnlock }: { onUnlock: (secret: string) => void }) {
    const [secret, setSecret] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [checking, setChecking] = useState(true);   // checking JWT on mount
    const [sessionExpired, setSessionExpired] = useState(false);

    // On mount: verify the stored JWT is still valid BEFORE showing the secret input.
    // CRITICAL: use checkAdminSession (adminApi, no 401 interceptor) NOT authAPI.me()
    // authAPI.me() uses the shared `api` instance whose 401 interceptor does
    // window.location.href = '/login', racing with our setSessionExpired(true).
    useEffect(() => {
        const token = localStorage.getItem('access_token');
        if (!token) {
            window.location.href = '/login?redirect=/voxly-admin';
            return;
        }
        checkAdminSession()
            .then(() => setChecking(false))          // valid → show secret input
            .catch(() => setSessionExpired(true));    // expired/invalid → show expired UI
    }, []);

    const handleUnlock = async () => {
        if (!secret.trim()) return;
        setLoading(true); setError(''); setSessionExpired(false);
        try {
            await superAdminAPI.getStats(secret);
            onUnlock(secret);
        } catch (e: unknown) {
            const err = e as { response?: { status?: number } };
            if (err?.response?.status === 401) setSessionExpired(true);
            else if (err?.response?.status === 403) setError('Invalid admin secret. Check your credentials.');
            else setError('Connection error. Is the backend reachable?');
        } finally { setLoading(false); }
    };

    // Session expired — show re-login screen
    if (sessionExpired) return (
        <div className="min-h-screen bg-[#030308] flex items-center justify-center p-4">
            <div className="bg-[#0d0d16] border border-amber-500/20 rounded-2xl p-8 max-w-sm w-full text-center shadow-2xl">
                <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mx-auto mb-5">
                    <AlertTriangle className="w-6 h-6 text-amber-400" />
                </div>
                <h2 className="text-xl font-bold text-white mb-2">Session Expired</h2>
                <p className="text-white/40 text-sm mb-6">
                    Your login session has expired. Please sign in again as the super admin account, then you&apos;ll be brought back here automatically.
                </p>
                <button onClick={() => { localStorage.removeItem('access_token'); window.location.href = '/login?redirect=/voxly-admin'; }}
                    className="w-full py-3 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white font-semibold rounded-xl transition-all flex items-center justify-center gap-2">
                    <LogIn className="w-4 h-4" /> Sign in again → Return here
                </button>
            </div>
        </div>
    );

    // Still verifying JWT
    if (checking) return (
        <div className="min-h-screen bg-[#030308] flex items-center justify-center">
            <div className="flex flex-col items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-violet-500/10 border border-violet-500/15 flex items-center justify-center">
                    <RefreshCw className="w-4 h-4 text-violet-400 animate-spin" />
                </div>
                <p className="text-xs text-white/30">Verifying session...</p>
            </div>
        </div>
    );

    return (
        <div className="min-h-screen bg-[#030308] flex items-center justify-center p-4 relative overflow-hidden">
            {/* Animated background */}
            <div className="absolute inset-0 pointer-events-none">
                <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-violet-600/6 rounded-full blur-[100px] animate-pulse" />
                <div className="absolute bottom-1/4 right-1/4 w-64 h-64 bg-blue-600/6 rounded-full blur-[80px] animate-pulse" style={{ animationDelay: '1s' }} />
                {/* Grid overlay */}
                <div className="absolute inset-0 opacity-[0.015]"
                    style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)', backgroundSize: '40px 40px' }} />
            </div>

            <motion.div initial={{ opacity: 0, y: 20, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }} className="relative w-full max-w-sm">
                <div className="bg-[#0d0d16]/90 border border-white/8 rounded-2xl p-8 shadow-2xl backdrop-blur-xl">
                    {/* Shield icon with glow */}
                    <div className="relative mx-auto w-16 h-16 mb-6">
                        <div className="absolute inset-0 rounded-2xl bg-violet-500/20 blur-lg" />
                        <div className="relative w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-600/30 to-blue-600/30 border border-violet-500/30 flex items-center justify-center">
                            <Shield className="w-7 h-7 text-violet-300" />
                        </div>
                    </div>

                    <h1 className="text-2xl font-bold text-white text-center tracking-tight mb-1">Command Center</h1>
                    <p className="text-white/35 text-sm text-center mb-8">Owner access only — dual authentication required</p>

                    <div className="space-y-3">
                        <div className="relative">
                            <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20" />
                            <input type="password" placeholder="X-Admin-Secret"
                                value={secret} onChange={e => setSecret(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && handleUnlock()}
                                className="w-full pl-10 pr-4 py-3 bg-white/[0.04] border border-white/8 rounded-xl text-white placeholder:text-white/20 focus:outline-none focus:border-violet-500/40 focus:bg-white/[0.06] transition-all text-sm"
                                autoFocus />
                        </div>

                        <AnimatePresence>
                            {error && (
                                <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                                    className="text-xs text-red-400 flex items-center gap-1.5">
                                    <AlertTriangle className="w-3.5 h-3.5" /> {error}
                                </motion.p>
                            )}
                        </AnimatePresence>

                        <button onClick={handleUnlock} disabled={loading || !secret.trim()}
                            className="w-full py-3 bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-500 hover:to-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-all shadow-[0_0_25px_-8px_rgba(124,58,237,0.5)] hover:shadow-[0_0_35px_-8px_rgba(124,58,237,0.7)] flex items-center justify-center gap-2">
                            {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <><LogIn className="w-4 h-4" /> Unlock Command Center</>}
                        </button>
                    </div>

                    <div className="mt-6 pt-6 border-t border-white/5 flex items-center justify-center gap-2 text-xs text-white/20">
                        <Shield className="w-3 h-3" />
                        <span>Must be logged in as super admin account</span>
                    </div>
                </div>
            </motion.div>
        </div>
    );
}

// ─── Metric Card ─────────────────────────────────────────────────────────────

function MetricCard({ label, value, sub, icon: Icon, gradient, trend, sparkData }: {
    label: string; value: string | number; sub?: string;
    icon: React.ElementType; gradient: string; trend?: { dir: 'up' | 'down' | 'flat'; val: string };
    sparkData?: number[];
}) {
    return (
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
            className="relative bg-[#0d0d16] border border-white/[0.07] rounded-2xl p-5 overflow-hidden group hover:border-white/14 transition-all duration-300">
            {/* Gradient glow */}
            <div className={`absolute top-0 right-0 w-32 h-32 rounded-full blur-[50px] opacity-20 ${gradient}`} />
            <div className="relative z-10">
                <div className="flex items-start justify-between mb-4">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${gradient} bg-opacity-20 border border-white/8`}>
                        <Icon className="w-5 h-5 text-white/80" />
                    </div>
                    {sparkData && <Sparkline data={sparkData} />}
                </div>
                <p className="text-3xl font-bold text-white tracking-tight tabular-nums">
                    {typeof value === 'number' ? fmt(value) : value}
                </p>
                <div className="flex items-center justify-between mt-1.5">
                    <p className="text-xs font-semibold text-white/40 uppercase tracking-wider">{label}</p>
                    {trend && (
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md ${trend.dir === 'up' ? 'text-emerald-400 bg-emerald-500/10' : trend.dir === 'down' ? 'text-red-400 bg-red-500/10' : 'text-white/30 bg-white/5'}`}>
                            {trend.dir === 'up' ? '↑' : trend.dir === 'down' ? '↓' : '—'} {trend.val}
                        </span>
                    )}
                </div>
                {sub && <p className="text-xs text-white/30 mt-1">{sub}</p>}
            </div>
        </motion.div>
    );
}

// ─── Tenant Detail Drawer ─────────────────────────────────────────────────────

function TenantDrawer({ tenant, onClose, adminSecret }: { tenant: Tenant; onClose: () => void; adminSecret: string; }) {
    const [detail, setDetail] = useState<TenantDetail | null>(null);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState<string | null>(null);

    useEffect(() => {
        superAdminAPI.getTenantDetail(tenant.id, adminSecret)
            .then(res => setDetail(res.data)).catch(console.error).finally(() => setLoading(false));
    }, [tenant.id, adminSecret]);

    const maxTokens = detail?.recent_messages.reduce((max, m) => Math.max(max, m.tokens), 1) ?? 1;

    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex" onClick={onClose}>
            <div className="absolute inset-0 bg-black/70 backdrop-blur-md" />
            <motion.div initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
                transition={{ type: 'spring', stiffness: 280, damping: 28 }}
                className="absolute right-0 top-0 bottom-0 w-full max-w-xl bg-[#0a0a12] border-l border-white/8 overflow-y-auto shadow-2xl"
                onClick={e => e.stopPropagation()}>

                {/* Header */}
                <div className="sticky top-0 bg-[#0a0a12]/95 backdrop-blur-xl border-b border-white/8 px-6 py-5 z-10">
                    <div className="flex items-start justify-between">
                        <div>
                            <h2 className="text-lg font-bold text-white">{tenant.agency_name ?? tenant.email}</h2>
                            <p className="text-xs text-white/40 mt-0.5">{tenant.email} · ID: {tenant.id.slice(0, 8)}...</p>
                        </div>
                        <button onClick={onClose} className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/50 hover:text-white transition-all mt-1">
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                    <div className="flex items-center gap-3 mt-4">
                        <PlanBadge tier={tenant.subscription_tier} />
                        <StatusDot active={tenant.is_active} />
                        <span className="text-xs text-white/30">Joined {new Date(tenant.created_at).toLocaleDateString()}</span>
                    </div>
                </div>

                <div className="p-6 space-y-6">
                    {/* Stats grid */}
                    <div className="grid grid-cols-3 gap-3">
                        {[
                            { label: 'Clients', value: tenant.client_count, icon: Users, color: 'text-blue-400' },
                            { label: 'Projects', value: tenant.project_count, icon: FolderGit2, color: 'text-violet-400' },
                            { label: 'Messages', value: tenant.message_count, icon: MessageSquare, color: 'text-emerald-400' },
                        ].map(s => (
                            <div key={s.label} className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4 text-center">
                                <s.icon className={`w-4 h-4 ${s.color} mx-auto mb-2`} />
                                <p className="text-2xl font-bold text-white">{fmt(s.value)}</p>
                                <p className="text-[11px] text-white/40 mt-0.5">{s.label}</p>
                            </div>
                        ))}
                    </div>

                    {/* Extended stats */}
                    {loading ? (
                        <div className="space-y-2">{[1, 2, 3].map(k => <div key={k} className="h-14 rounded-xl bg-white/[0.02] animate-pulse" />)}</div>
                    ) : detail && (
                        <>
                            <div className="grid grid-cols-2 gap-3">
                                <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4">
                                    <p className="text-xs text-white/40 mb-1 flex items-center gap-1.5"><Zap className="w-3 h-3" />Tokens Used</p>
                                    <p className="text-xl font-bold text-white">{fmt(detail.tokens_used)}</p>
                                </div>
                                <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4">
                                    <p className="text-xs text-white/40 mb-1 flex items-center gap-1.5"><Clock className="w-3 h-3" />Last Active</p>
                                    <p className="text-sm font-bold text-white">{detail.last_active ? timeAgo(detail.last_active) : 'Never'}</p>
                                </div>
                            </div>

                            {detail.recent_messages.length > 0 && (
                                <div>
                                    <h3 className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-3 flex items-center gap-2">
                                        <Activity className="w-3 h-3" /> Recent AI Sessions
                                    </h3>
                                    <div className="space-y-2">
                                        {detail.recent_messages.map((msg, i) => (
                                            <div key={i} className="flex items-center gap-3 p-3 bg-white/[0.02] border border-white/[0.05] rounded-xl">
                                                <div className="w-8 h-8 rounded-lg bg-violet-500/10 border border-violet-500/15 flex items-center justify-center flex-shrink-0">
                                                    <Bot className="w-3.5 h-3.5 text-violet-400" />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center justify-between mb-1">
                                                        <p className="text-sm text-white font-medium truncate">{msg.client_name}</p>
                                                        <span className="text-[10px] text-white/30 flex-shrink-0 ml-2">{timeAgo(msg.timestamp)}</span>
                                                    </div>
                                                    <MiniBar value={msg.tokens} max={maxTokens} color="bg-violet-500" />
                                                    <p className="text-[10px] text-white/30 mt-1">
                                                        <span className={`capitalize ${PROVIDER_COLORS[msg.provider] ?? 'text-white/40'}`}>{msg.provider}</span>
                                                        {' · '}{msg.tokens} tokens
                                                    </p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </>
                    )}

                    {/* Danger zone */}
                    <div className="border border-white/[0.06] rounded-xl overflow-hidden">
                        <div className="px-4 py-3 border-b border-white/[0.06] bg-white/[0.02]">
                            <p className="text-xs font-semibold text-white/40 uppercase tracking-wider">Quick Actions</p>
                        </div>
                        <div className="p-4 space-y-2">
                            <button onClick={() => {
                                setActionLoading('disable');
                                superAdminAPI.toggleDisable(tenant.id, adminSecret)
                                    .then(() => onClose())
                                    .finally(() => setActionLoading(null));
                            }}
                                disabled={actionLoading === 'disable'}
                                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${tenant.is_active
                                    ? 'bg-red-500/8 hover:bg-red-500/15 border border-red-500/15 text-red-400'
                                    : 'bg-emerald-500/8 hover:bg-emerald-500/15 border border-emerald-500/15 text-emerald-400'
                                }`}>
                                <Power className="w-4 h-4" />
                                {tenant.is_active ? 'Disable Account' : 'Enable Account'}
                            </button>
                        </div>
                    </div>
                </div>
            </motion.div>
        </motion.div>
    );
}

// ─── Tabs ─────────────────────────────────────────────────────────────────────

type ActiveTab = 'overview' | 'tenants' | 'activity' | 'system';

// ─── Main Command Center ──────────────────────────────────────────────────────

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
    const [toastType, setToastType] = useState<'success' | 'error'>('success');
    const [activeTab, setActiveTab] = useState<ActiveTab>('overview');
    const [selectedTenant, setSelectedTenant] = useState<Tenant | null>(null);
    const [copiedId, setCopiedId] = useState<string | null>(null);
    const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
        setToastMsg(msg); setToastType(type);
        setTimeout(() => setToastMsg(''), 3000);
    };

    const loadData = useCallback(async (secret: string) => {
        setLoading(true); setError('');
        try {
            const [statsRes, tenantsRes, activityRes] = await Promise.all([
                superAdminAPI.getStats(secret),
                superAdminAPI.getTenants(secret),
                superAdminAPI.getActivity(secret),
            ]);
            setStats(statsRes.data); setTenants(tenantsRes.data); setActivity(activityRes.data);
            setLastRefresh(new Date());
        } catch (e: unknown) {
            const err = e as { response?: { status?: number } };
            if (err?.response?.status === 401) {
                setError('Your session has expired. Redirecting to login...');
                setTimeout(() => { localStorage.removeItem('access_token'); window.location.href = '/login?redirect=/voxly-admin'; }, 1500);
            } else if (err?.response?.status === 403) {
                setError('Access denied. Re-enter credentials.'); setAdminSecret(null);
            } else {
                setError('Failed to load data. Backend may be restarting.');
            }
        } finally { setLoading(false); }
    }, []);

    const handleUnlock = (secret: string) => { setAdminSecret(secret); loadData(secret); };

    // Auto-refresh every 30s
    useEffect(() => {
        if (!adminSecret) return;
        intervalRef.current = setInterval(() => loadData(adminSecret), 30000);
        return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
    }, [adminSecret, loadData]);

    const handleToggleDisable = async (tenant: Tenant) => {
        if (!adminSecret) return;
        if (!confirm(`${tenant.is_active ? 'Disable' : 'Enable'} account for ${tenant.email}?`)) return;
        setActionLoading(tenant.id + '_disable');
        try {
            await superAdminAPI.toggleDisable(tenant.id, adminSecret);
            showToast(`${tenant.email} ${tenant.is_active ? 'disabled' : 'enabled'} ✅`);
            loadData(adminSecret);
        } catch { showToast('Action failed', 'error'); }
        finally { setActionLoading(null); }
    };

    const handleOverridePlan = async (tenant: Tenant, newTier: string) => {
        if (!adminSecret) return;
        setActionLoading(tenant.id + '_plan');
        try {
            await superAdminAPI.overridePlan(tenant.id, newTier, adminSecret);
            showToast(`${tenant.email} → ${newTier} ✅`);
            loadData(adminSecret);
        } catch { showToast('Plan update failed', 'error'); }
        finally { setActionLoading(null); }
    };

    const handleImpersonate = async (tenant: Tenant) => {
        if (!adminSecret) return;
        if (!confirm(`⚠️ Impersonate ${tenant.email}? This will be logged.`)) return;
        setActionLoading(tenant.id + '_impersonate');
        try {
            const res = await superAdminAPI.impersonate(tenant.id, adminSecret);
            await navigator.clipboard.writeText(res.data.access_token);
            setCopiedId(tenant.id);
            showToast('15-min token copied to clipboard');
            setTimeout(() => setCopiedId(null), 3000);
        } catch { showToast('Impersonation failed', 'error'); }
        finally { setActionLoading(null); }
    };

    const filtered = tenants.filter(t => {
        const matchSearch = search === '' || t.email.toLowerCase().includes(search.toLowerCase()) || (t.agency_name ?? '').toLowerCase().includes(search.toLowerCase());
        const matchTier = filterTier === 'all' || t.subscription_tier === filterTier;
        return matchSearch && matchTier;
    });

    // Provider breakdown from activity
    const providerCounts = activity.reduce((acc, a) => {
        const p = a.provider?.toLowerCase().split('-')[0] ?? 'unknown';
        acc[p] = (acc[p] ?? 0) + 1;
        return acc;
    }, {} as Record<string, number>);

    if (!adminSecret) return <AuthGate onUnlock={handleUnlock} />;

    const tabs: Array<{ id: ActiveTab; label: string; icon: React.ElementType; count?: number }> = [
        { id: 'overview', label: 'Overview', icon: BarChart3 },
        { id: 'tenants', label: 'Tenants', icon: Users, count: tenants.length },
        { id: 'activity', label: 'Activity', icon: Activity, count: activity.length },
        { id: 'system', label: 'System', icon: Cpu },
    ];

    return (
        <div className="min-h-screen bg-[#030308] text-white" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
            {/* Background */}
            <div className="fixed inset-0 pointer-events-none overflow-hidden">
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[900px] h-[400px] bg-violet-600/4 rounded-full blur-[130px]" />
                <div className="absolute bottom-0 right-0 w-[500px] h-[300px] bg-blue-600/3 rounded-full blur-[100px]" />
                <div className="absolute inset-0 opacity-[0.012]"
                    style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.4) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.4) 1px, transparent 1px)', backgroundSize: '40px 40px' }} />
            </div>

            {/* Toast */}
            <AnimatePresence>
                {toastMsg && (
                    <motion.div initial={{ opacity: 0, y: 20, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 20 }}
                        className={`fixed bottom-6 right-6 z-50 px-5 py-3 rounded-xl font-medium text-sm backdrop-blur-xl shadow-2xl border flex items-center gap-2 ${toastType === 'success' ? 'bg-emerald-500/15 border-emerald-500/25 text-emerald-400' : 'bg-red-500/15 border-red-500/25 text-red-400'}`}>
                        {toastType === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
                        {toastMsg}
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Tenant Drawer */}
            <AnimatePresence>
                {selectedTenant && adminSecret && (
                    <TenantDrawer tenant={selectedTenant} adminSecret={adminSecret} onClose={() => setSelectedTenant(null)} />
                )}
            </AnimatePresence>

            <div className="relative max-w-[1400px] mx-auto px-6 py-8 space-y-7">

                {/* Header */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <div className="relative">
                            <div className="absolute inset-0 rounded-xl bg-violet-500/20 blur-lg" />
                            <div className="relative w-11 h-11 rounded-xl bg-gradient-to-br from-violet-600/30 to-blue-600/30 border border-violet-500/25 flex items-center justify-center">
                                <Shield className="w-5 h-5 text-violet-300" />
                            </div>
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold text-white tracking-tight">Voxly Command Center</h1>
                            <div className="flex items-center gap-2 mt-0.5">
                                <span className="text-xs text-white/35">Super Admin · Owner view</span>
                                {lastRefresh && (
                                    <span className="text-[10px] text-white/20 border border-white/8 rounded px-1.5 py-0.5">
                                        Updated {timeAgo(lastRefresh.toISOString())}
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        {/* Live indicator */}
                        <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-500/8 border border-emerald-500/15 rounded-lg">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                            <span className="text-xs text-emerald-400 font-medium">Live</span>
                        </div>
                        <button onClick={() => adminSecret && loadData(adminSecret)} disabled={loading}
                            className="flex items-center gap-2 px-4 py-2 bg-white/[0.04] border border-white/8 rounded-xl text-white/60 hover:text-white hover:bg-white/[0.07] transition-all text-sm font-medium">
                            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
                        </button>
                    </div>
                </div>

                {/* Error banner */}
                <AnimatePresence>
                    {error && (
                        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                            className="flex items-center gap-3 p-4 bg-red-500/5 border border-red-500/15 rounded-xl text-red-400 text-sm">
                            <AlertTriangle className="w-4 h-4 flex-shrink-0" /> {error}
                            <button onClick={() => setError('')} className="ml-auto"><X className="w-4 h-4" /></button>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Tab Bar */}
                <div className="flex items-center gap-1 p-1.5 bg-[#0d0d16] border border-white/[0.07] rounded-2xl w-fit">
                    {tabs.map(tab => (
                        <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                            className={`relative flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all ${activeTab === tab.id ? 'text-white' : 'text-white/40 hover:text-white/70'}`}>
                            {activeTab === tab.id && (
                                <motion.div layoutId="cmd-tab"
                                    className="absolute inset-0 bg-white/[0.07] border border-white/10 rounded-xl"
                                    transition={{ type: 'spring', stiffness: 300, damping: 30 }} />
                            )}
                            <tab.icon className={`w-4 h-4 relative z-10 ${activeTab === tab.id ? 'text-violet-400' : ''}`} />
                            <span className="relative z-10">{tab.label}</span>
                            {tab.count !== undefined && (
                                <span className={`relative z-10 text-[10px] font-bold px-1.5 py-0.5 rounded-md ${activeTab === tab.id ? 'bg-violet-500/20 text-violet-300' : 'bg-white/5 text-white/30'}`}>
                                    {tab.count}
                                </span>
                            )}
                        </button>
                    ))}
                </div>

                {/* Tab Content */}
                <AnimatePresence mode="wait">

                    {/* ── OVERVIEW ── */}
                    {activeTab === 'overview' && (
                        <motion.div key="overview" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }} className="space-y-6">
                            {/* Metric grid */}
                            {loading && !stats ? (
                                <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
                                    {[...Array(6)].map((_, i) => <div key={i} className="h-36 bg-white/[0.02] border border-white/5 rounded-2xl animate-pulse" />)}
                                </div>
                            ) : stats && (
                                <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
                                    <MetricCard label="Total Tenants" value={stats.total_tenants} icon={Users}
                                        gradient="bg-violet-500/20" sub={`${stats.active_tenants} active`}
                                        sparkData={[2, 3, 4, 4, 5, stats.active_tenants, stats.total_tenants]} />
                                    <MetricCard label="Active Now" value={stats.active_tenants} icon={Activity}
                                        gradient="bg-emerald-500/20"
                                        trend={{ dir: 'up', val: `${Math.round((stats.active_tenants / Math.max(stats.total_tenants, 1)) * 100)}%` }} />
                                    <MetricCard label="Total Clients" value={stats.total_clients} icon={Globe}
                                        gradient="bg-blue-500/20" />
                                    <MetricCard label="Projects" value={stats.total_projects} icon={FolderGit2}
                                        gradient="bg-cyan-500/20" />
                                    <MetricCard label="AI Messages" value={stats.total_messages} icon={MessageSquare}
                                        gradient="bg-fuchsia-500/20"
                                        sparkData={[1, 3, 2, 4, 3, 5, stats.total_messages % 10].map(v => Math.min(v, 10))} />
                                    <MetricCard label="Tokens Used" value={`${(stats.total_tokens_used / 1000).toFixed(1)}K`} icon={Zap}
                                        gradient="bg-amber-500/20" />
                                </div>
                            )}

                            {/* Bottom row: Activity + Provider breakdown */}
                            <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
                                {/* Recent activity - takes 2/3 */}
                                <div className="xl:col-span-2 bg-[#0d0d16] border border-white/[0.07] rounded-2xl overflow-hidden">
                                    <div className="px-6 py-4 border-b border-white/[0.07] flex items-center justify-between">
                                        <div>
                                            <h2 className="text-sm font-bold text-white">Platform Activity</h2>
                                            <p className="text-xs text-white/35 mt-0.5">Latest AI interactions across all tenants</p>
                                        </div>
                                        <button onClick={() => setActiveTab('activity')} className="text-xs text-violet-400 hover:text-violet-300 flex items-center gap-1">
                                            View all <ArrowUpRight className="w-3 h-3" />
                                        </button>
                                    </div>
                                    <div className="divide-y divide-white/[0.04]">
                                        {activity.slice(0, 8).map((item, i) => (
                                            <motion.div key={i} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
                                                transition={{ delay: i * 0.04 }}
                                                className="flex items-center gap-4 px-6 py-3.5 hover:bg-white/[0.02] transition-colors">
                                                <div className="w-8 h-8 rounded-lg bg-violet-500/10 border border-violet-500/15 flex items-center justify-center flex-shrink-0">
                                                    <Bot className="w-3.5 h-3.5 text-violet-400" />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm text-white font-medium truncate">{item.agency_name ?? item.tenant_email}</p>
                                                    <p className="text-xs text-white/40 mt-0.5">
                                                        {item.client_name} ·{' '}
                                                        <span className={`capitalize ${PROVIDER_COLORS[item.provider?.toLowerCase().split('-')[0]] ?? 'text-white/40'}`}>
                                                            {item.provider?.split('-')[0]}
                                                        </span>
                                                        {' · '}{item.tokens} tokens
                                                    </p>
                                                </div>
                                                <span className="text-xs text-white/25 flex-shrink-0">{timeAgo(item.timestamp)}</span>
                                            </motion.div>
                                        ))}
                                        {activity.length === 0 && !loading && (
                                            <div className="py-12 text-center text-white/20 text-sm">No activity yet</div>
                                        )}
                                    </div>
                                </div>

                                {/* Provider breakdown - takes 1/3 */}
                                <div className="space-y-4">
                                    {/* AI provider usage */}
                                    <div className="bg-[#0d0d16] border border-white/[0.07] rounded-2xl overflow-hidden">
                                        <div className="px-5 py-4 border-b border-white/[0.07]">
                                            <h3 className="text-sm font-bold text-white">AI Provider Usage</h3>
                                            <p className="text-xs text-white/35 mt-0.5">Last {activity.length} requests</p>
                                        </div>
                                        <div className="p-5 space-y-3">
                                            {Object.entries(providerCounts).sort(([, a], [, b]) => b - a).map(([provider, count]) => (
                                                <div key={provider}>
                                                    <div className="flex items-center justify-between mb-1.5">
                                                        <span className={`text-xs font-semibold capitalize ${PROVIDER_COLORS[provider] ?? 'text-white/40'}`}>
                                                            {provider}
                                                        </span>
                                                        <span className="text-xs text-white/40">{count}</span>
                                                    </div>
                                                    <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                                                        <motion.div initial={{ width: 0 }} animate={{ width: `${(count / activity.length) * 100}%` }}
                                                            transition={{ delay: 0.2, duration: 0.6, ease: 'easeOut' }}
                                                            className={`h-full rounded-full ${provider === 'gemini' ? 'bg-blue-500' : provider === 'openai' ? 'bg-emerald-500' : provider === 'claude' ? 'bg-violet-500' : 'bg-white/20'}`} />
                                                    </div>
                                                </div>
                                            ))}
                                            {Object.keys(providerCounts).length === 0 && (
                                                <p className="text-xs text-white/20 py-4 text-center">No data yet</p>
                                            )}
                                        </div>
                                    </div>

                                    {/* Tenant plan distribution */}
                                    <div className="bg-[#0d0d16] border border-white/[0.07] rounded-2xl overflow-hidden">
                                        <div className="px-5 py-4 border-b border-white/[0.07]">
                                            <h3 className="text-sm font-bold text-white">Plan Distribution</h3>
                                        </div>
                                        <div className="p-5 space-y-3">
                                            {(['enterprise', 'pro', 'free'] as const).map(tier => {
                                                const count = tenants.filter(t => t.subscription_tier === tier).length;
                                                const s = TIER_STYLES[tier];
                                                return (
                                                    <div key={tier} className="flex items-center justify-between">
                                                        <PlanBadge tier={tier} />
                                                        <span className="text-sm font-bold text-white">{count}</span>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    )}

                    {/* ── TENANTS ── */}
                    {activeTab === 'tenants' && (
                        <motion.div key="tenants" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }}>
                            <div className="bg-[#0d0d16] border border-white/[0.07] rounded-2xl overflow-hidden">
                                {/* Toolbar */}
                                <div className="px-6 py-4 border-b border-white/[0.07] flex items-center gap-4 flex-wrap">
                                    <div className="relative flex-1 min-w-[200px]">
                                        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20" />
                                        <input value={search} onChange={e => setSearch(e.target.value)}
                                            placeholder="Search by email or agency..."
                                            className="w-full pl-10 pr-4 py-2.5 bg-white/[0.03] border border-white/8 rounded-xl text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-violet-500/30 transition-all" />
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Filter className="w-4 h-4 text-white/30" />
                                        <select value={filterTier} onChange={e => setFilterTier(e.target.value)}
                                            className="px-3 py-2.5 bg-white/[0.03] border border-white/8 rounded-xl text-sm text-white/70 focus:outline-none transition-all">
                                            <option value="all">All Plans</option>
                                            <option value="free">Free</option>
                                            <option value="pro">Pro</option>
                                            <option value="enterprise">Enterprise</option>
                                        </select>
                                    </div>
                                    <span className="text-xs text-white/30 font-medium">{filtered.length} tenants</span>
                                </div>

                                {/* Table */}
                                {loading ? (
                                    <div className="space-y-px">
                                        {[...Array(5)].map((_, i) => <div key={i} className="h-16 bg-white/[0.01] animate-pulse mx-6 my-2 rounded-xl" />)}
                                    </div>
                                ) : (
                                    <div className="overflow-x-auto">
                                        <table className="w-full">
                                            <thead>
                                                <tr className="border-b border-white/[0.05]">
                                                    {['Agency / Email', 'Plan', 'Clients', 'Projects', 'Messages', 'Status', 'Actions'].map(h => (
                                                        <th key={h} className="px-5 py-3.5 text-left text-[10px] font-bold text-white/25 uppercase tracking-wider">{h}</th>
                                                    ))}
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-white/[0.03]">
                                                {filtered.map(tenant => (
                                                    <tr key={tenant.id} onClick={() => setSelectedTenant(tenant)}
                                                        className="hover:bg-white/[0.02] transition-colors group cursor-pointer">
                                                        <td className="px-5 py-4">
                                                            <p className="font-semibold text-sm text-white group-hover:text-violet-300 transition-colors">
                                                                {tenant.agency_name ?? tenant.email}
                                                            </p>
                                                            <p className="text-xs text-white/30 mt-0.5 flex items-center gap-1">
                                                                <Hash className="w-2.5 h-2.5" />{tenant.id.slice(0, 8)}
                                                            </p>
                                                        </td>
                                                        <td className="px-5 py-4"><PlanBadge tier={tenant.subscription_tier} /></td>
                                                        <td className="px-5 py-4 text-sm text-white/70 font-mono">{tenant.client_count}</td>
                                                        <td className="px-5 py-4 text-sm text-white/70 font-mono">{tenant.project_count}</td>
                                                        <td className="px-5 py-4 text-sm text-white/70 font-mono">{fmt(tenant.message_count)}</td>
                                                        <td className="px-5 py-4"><StatusDot active={tenant.is_active} /></td>
                                                        <td className="px-5 py-4" onClick={e => e.stopPropagation()}>
                                                            <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                                                {/* Plan override */}
                                                                <select defaultValue={tenant.subscription_tier}
                                                                    onChange={e => handleOverridePlan(tenant, e.target.value)}
                                                                    disabled={actionLoading === tenant.id + '_plan'}
                                                                    onClick={e => e.stopPropagation()}
                                                                    className="px-2 py-1.5 bg-white/[0.04] border border-white/8 rounded-lg text-xs text-white/60 focus:outline-none cursor-pointer">
                                                                    <option value="free">Free</option>
                                                                    <option value="pro">Pro</option>
                                                                    <option value="enterprise">Enterprise</option>
                                                                </select>
                                                                {/* Kill switch */}
                                                                <button onClick={() => handleToggleDisable(tenant)}
                                                                    disabled={actionLoading === tenant.id + '_disable'}
                                                                    title={tenant.is_active ? 'Disable' : 'Enable'}
                                                                    className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all ${tenant.is_active ? 'bg-red-500/8 border border-red-500/15 text-red-400 hover:bg-red-500/15' : 'bg-emerald-500/8 border border-emerald-500/15 text-emerald-400 hover:bg-emerald-500/15'}`}>
                                                                    {tenant.is_active ? <XCircle className="w-3.5 h-3.5" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                                                                </button>
                                                                {/* Impersonate */}
                                                                <button onClick={() => handleImpersonate(tenant)}
                                                                    disabled={actionLoading === tenant.id + '_impersonate'}
                                                                    title="Impersonate (15min token)"
                                                                    className="w-7 h-7 rounded-lg bg-blue-500/8 border border-blue-500/15 text-blue-400 hover:bg-blue-500/15 flex items-center justify-center transition-all">
                                                                    {copiedId === tenant.id ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Eye className="w-3.5 h-3.5" />}
                                                                </button>
                                                                {/* Detail */}
                                                                <button onClick={() => setSelectedTenant(tenant)}
                                                                    className="w-7 h-7 rounded-lg bg-white/[0.03] border border-white/8 text-white/40 hover:text-white hover:bg-white/[0.07] flex items-center justify-center transition-all">
                                                                    <ChevronRight className="w-3.5 h-3.5" />
                                                                </button>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                        {filtered.length === 0 && (
                                            <div className="py-16 text-center text-white/20 text-sm">No tenants match your search.</div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    )}

                    {/* ── ACTIVITY ── */}
                    {activeTab === 'activity' && (
                        <motion.div key="activity" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }}>
                            <div className="bg-[#0d0d16] border border-white/[0.07] rounded-2xl overflow-hidden">
                                <div className="px-6 py-4 border-b border-white/[0.07]">
                                    <h2 className="text-sm font-bold text-white">All Platform Activity</h2>
                                    <p className="text-xs text-white/35 mt-0.5">Last {activity.length} AI interactions · metadata only (privacy-first)</p>
                                </div>
                                <div className="overflow-x-auto">
                                    <table className="w-full">
                                        <thead>
                                            <tr className="border-b border-white/[0.05]">
                                                {['Tenant', 'Client', 'Provider', 'Tokens', 'Time'].map(h => (
                                                    <th key={h} className="px-5 py-3.5 text-left text-[10px] font-bold text-white/25 uppercase tracking-wider">{h}</th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-white/[0.03]">
                                            {activity.map((item, i) => (
                                                <tr key={i} className="hover:bg-white/[0.015] transition-colors">
                                                    <td className="px-5 py-3.5">
                                                        <p className="text-sm text-white font-medium">{item.agency_name ?? item.tenant_email}</p>
                                                        <p className="text-xs text-white/30">{item.tenant_email}</p>
                                                    </td>
                                                    <td className="px-5 py-3.5 text-sm text-white/70">{item.client_name}</td>
                                                    <td className="px-5 py-3.5">
                                                        <span className={`text-xs font-semibold capitalize ${PROVIDER_COLORS[item.provider?.toLowerCase().split('-')[0]] ?? 'text-white/40'}`}>
                                                            {item.provider?.split('-')[0] ?? 'unknown'}
                                                        </span>
                                                    </td>
                                                    <td className="px-5 py-3.5 text-sm text-white/70 font-mono">{item.tokens}</td>
                                                    <td className="px-5 py-3.5 text-xs text-white/30">{timeAgo(item.timestamp)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                    {activity.length === 0 && !loading && (
                                        <div className="py-16 text-center text-white/20 text-sm">No activity yet</div>
                                    )}
                                </div>
                            </div>
                        </motion.div>
                    )}

                    {/* ── SYSTEM ── */}
                    {activeTab === 'system' && (
                        <motion.div key="system" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }}
                            className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-5">
                            {/* Backend */}
                            <div className="bg-[#0d0d16] border border-white/[0.07] rounded-2xl p-5">
                                <div className="flex items-center gap-3 mb-4">
                                    <div className="w-9 h-9 rounded-xl bg-blue-500/10 border border-blue-500/15 flex items-center justify-center">
                                        <Globe className="w-4 h-4 text-blue-400" />
                                    </div>
                                    <div>
                                        <p className="text-sm font-bold text-white">Backend</p>
                                        <p className="text-xs text-white/35">Google Cloud Run</p>
                                    </div>
                                    <span className="ml-auto flex items-center gap-1.5 text-xs font-medium text-emerald-400">
                                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" /> Online
                                    </span>
                                </div>
                                <div className="space-y-2.5 text-xs">
                                    {[
                                        { label: 'Region', value: 'us-central1' },
                                        { label: 'Service', value: 'voxly-backend' },
                                        { label: 'Scaling', value: 'Auto (0–12 instances)' },
                                        { label: 'Free tier', value: '2M req/month' },
                                    ].map(({ label, value }) => (
                                        <div key={label} className="flex items-center justify-between py-2 border-b border-white/[0.04] last:border-0">
                                            <span className="text-white/40">{label}</span>
                                            <span className="text-white/70 font-medium">{value}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Database */}
                            <div className="bg-[#0d0d16] border border-white/[0.07] rounded-2xl p-5">
                                <div className="flex items-center gap-3 mb-4">
                                    <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/15 flex items-center justify-center">
                                        <Database className="w-4 h-4 text-emerald-400" />
                                    </div>
                                    <div>
                                        <p className="text-sm font-bold text-white">Database</p>
                                        <p className="text-xs text-white/35">Supabase PostgreSQL</p>
                                    </div>
                                    <span className="ml-auto flex items-center gap-1.5 text-xs font-medium text-emerald-400">
                                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" /> Online
                                    </span>
                                </div>
                                <div className="space-y-2.5 text-xs">
                                    {[
                                        { label: 'Provider', value: 'Supabase (Mumbai)' },
                                        { label: 'Connection', value: 'Transaction Pooler' },
                                        { label: 'Tables', value: 'users, clients, projects, chat_history, ...' },
                                        { label: 'Migrations', value: 'At head (Alembic)' },
                                    ].map(({ label, value }) => (
                                        <div key={label} className="flex items-center justify-between py-2 border-b border-white/[0.04] last:border-0">
                                            <span className="text-white/40">{label}</span>
                                            <span className="text-white/70 font-medium truncate max-w-[180px] text-right">{value}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Frontend */}
                            <div className="bg-[#0d0d16] border border-white/[0.07] rounded-2xl p-5">
                                <div className="flex items-center gap-3 mb-4">
                                    <div className="w-9 h-9 rounded-xl bg-violet-500/10 border border-violet-500/15 flex items-center justify-center">
                                        <Terminal className="w-4 h-4 text-violet-400" />
                                    </div>
                                    <div>
                                        <p className="text-sm font-bold text-white">Frontend</p>
                                        <p className="text-xs text-white/35">Vercel · Next.js 14</p>
                                    </div>
                                    <span className="ml-auto flex items-center gap-1.5 text-xs font-medium text-emerald-400">
                                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" /> Online
                                    </span>
                                </div>
                                <div className="space-y-2.5 text-xs">
                                    {[
                                        { label: 'URL', value: 'voxly-oss.vercel.app' },
                                        { label: 'Framework', value: 'Next.js 14 (App Router)' },
                                        { label: 'Deploy', value: 'Auto from GitHub develop' },
                                        { label: 'CDN', value: 'Vercel Edge Network' },
                                    ].map(({ label, value }) => (
                                        <div key={label} className="flex items-center justify-between py-2 border-b border-white/[0.04] last:border-0">
                                            <span className="text-white/40">{label}</span>
                                            <span className="text-white/70 font-medium">{value}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* AI Provider Status */}
                            <div className="bg-[#0d0d16] border border-white/[0.07] rounded-2xl p-5">
                                <div className="flex items-center gap-3 mb-4">
                                    <div className="w-9 h-9 rounded-xl bg-fuchsia-500/10 border border-fuchsia-500/15 flex items-center justify-center">
                                        <Bot className="w-4 h-4 text-fuchsia-400" />
                                    </div>
                                    <div>
                                        <p className="text-sm font-bold text-white">AI Providers</p>
                                        <p className="text-xs text-white/35">Auto-fallback chain</p>
                                    </div>
                                </div>
                                <div className="space-y-3">
                                    {[
                                        { name: 'Gemini', desc: 'Primary (free tier)', color: 'text-blue-400', dotColor: 'bg-blue-500', status: 'Active' },
                                        { name: 'OpenAI', desc: 'Fallback #1 (gpt-4o)', color: 'text-emerald-400', dotColor: 'bg-emerald-500', status: 'Fallback' },
                                        { name: 'Claude', desc: 'Fallback #2 (billing issue)', color: 'text-white/30', dotColor: 'bg-red-500', status: 'Unavailable' },
                                    ].map(p => (
                                        <div key={p.name} className="flex items-center gap-3 p-3 bg-white/[0.02] border border-white/[0.05] rounded-xl">
                                            <span className={`w-2 h-2 rounded-full ${p.dotColor}`} />
                                            <div className="flex-1">
                                                <p className={`text-sm font-semibold ${p.color}`}>{p.name}</p>
                                                <p className="text-xs text-white/30">{p.desc}</p>
                                            </div>
                                            <span className={`text-[10px] font-bold px-2 py-1 rounded-lg ${p.status === 'Active' ? 'bg-blue-500/10 text-blue-400' : p.status === 'Fallback' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
                                                {p.status}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Messaging Channels */}
                            <div className="bg-[#0d0d16] border border-white/[0.07] rounded-2xl p-5">
                                <div className="flex items-center gap-3 mb-4">
                                    <div className="w-9 h-9 rounded-xl bg-cyan-500/10 border border-cyan-500/15 flex items-center justify-center">
                                        <MessageCircle className="w-4 h-4 text-cyan-400" />
                                    </div>
                                    <div>
                                        <p className="text-sm font-bold text-white">Channels</p>
                                        <p className="text-xs text-white/35">Messaging integrations</p>
                                    </div>
                                </div>
                                <div className="space-y-3">
                                    {[
                                        { name: 'WhatsApp', desc: 'Twilio Sandbox → Business', color: 'text-emerald-400', status: 'Active', icon: '💬' },
                                        { name: 'Telegram', desc: '@VoxlyBot · Webhook active', color: 'text-blue-400', status: 'Active', icon: '✈️' },
                                        { name: 'Slack', desc: 'Coming Q3 2026', color: 'text-white/20', status: 'Soon', icon: '🔧' },
                                    ].map(c => (
                                        <div key={c.name} className="flex items-center gap-3 p-3 bg-white/[0.02] border border-white/[0.05] rounded-xl">
                                            <span className="text-base">{c.icon}</span>
                                            <div className="flex-1">
                                                <p className={`text-sm font-semibold ${c.color}`}>{c.name}</p>
                                                <p className="text-xs text-white/30">{c.desc}</p>
                                            </div>
                                            <span className={`text-[10px] font-bold px-2 py-1 rounded-lg ${c.status === 'Active' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-white/5 text-white/30'}`}>
                                                {c.status}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Quick commands */}
                            <div className="bg-[#0d0d16] border border-white/[0.07] rounded-2xl p-5">
                                <div className="flex items-center gap-3 mb-4">
                                    <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/15 flex items-center justify-center">
                                        <Terminal className="w-4 h-4 text-amber-400" />
                                    </div>
                                    <div>
                                        <p className="text-sm font-bold text-white">Quick Reference</p>
                                        <p className="text-xs text-white/35">Deployment commands</p>
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    {[
                                        { label: 'Redeploy backend', cmd: 'gcloud run deploy voxly-backend ...' },
                                        { label: 'View live logs', cmd: 'gcloud logging tail ...' },
                                        { label: 'Check status', cmd: 'gcloud run services describe ...' },
                                    ].map(c => (
                                        <div key={c.label} className="p-3 bg-white/[0.02] border border-white/[0.05] rounded-xl">
                                            <p className="text-[10px] text-white/35 font-semibold uppercase tracking-wider mb-1">{c.label}</p>
                                            <p className="text-xs text-white/50 font-mono truncate">{c.cmd}</p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </motion.div>
                    )}

                </AnimatePresence>
            </div>
        </div>
    );
}
