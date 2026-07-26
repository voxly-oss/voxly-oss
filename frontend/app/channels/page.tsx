'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { clientsAPI } from '@/lib/api';
import type { Client } from '@/types';
import Link from 'next/link';
import { Plus, Search, AlertTriangle, MessageSquare, Send, Mail, ChevronLeft, ChevronRight } from 'lucide-react';
import { formatPhone } from '@/lib/utils';
import { Panel, PanelRow } from '@/components/SidePanel';
import { PreviewBanner, PreviewMark } from '@/components/PreviewBadge';

const PAGE_SIZE = 8;
const CHANNEL_TYPES = ['WhatsApp', 'Telegram', 'Email'] as const;
type ChannelType = typeof CHANNEL_TYPES[number];

// Per-connection health/volume/last-activity have no metering endpoint yet —
// deterministic mock per client+channel, matching the design's row shape.
// Real: which channels exist (from the client's actual phone/email/telegram fields).
function hashOf(s: string) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
}
const mockHealth = (id: string) => {
    const h = hashOf(id);
    return (h % 100) < 85 ? 75 + (Math.floor(h / 100) % 26) : 45 + (Math.floor(h / 100) % 30);
};
const mockVolume = (id: string) => hashOf(`${id}-v`) % 45;
const mockMinutesAgo = (id: string) => 1 + (hashOf(`${id}-t`) % (10 * 24 * 60));

const CHANNEL_ICON: Record<ChannelType, typeof MessageSquare> = { WhatsApp: MessageSquare, Telegram: Send, Email: Mail };

const timeAgo = (mins: number) => {
    if (mins < 60) return `${mins}m ago`;
    const h = Math.floor(mins / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
};

const GRID_COLS = 'grid grid-cols-[2fr_1fr_1.3fr_0.9fr_0.7fr_0.9fr_28px]';

export default function ChannelsPage() {
    const { data: clients = [], isLoading } = useQuery({ queryKey: ['clients'], queryFn: async () => (await clientsAPI.list()).data as Client[] });
    const [search, setSearch] = useState('');
    const [typeFilter, setTypeFilter] = useState<'All' | ChannelType>('All');
    const [attentionOnly, setAttentionOnly] = useState(false);
    const [page, setPage] = useState(1);

    const connections = useMemo(() => {
        const rows: { id: string; clientName: string; identifier: string; type: ChannelType; health: number; volume: number; minutesAgo: number }[] = [];
        for (const c of clients) {
            if (c.phone) rows.push({ id: `${c.id}-wa`, clientName: c.name, identifier: formatPhone(c.phone), type: 'WhatsApp', health: mockHealth(`${c.id}-wa`), volume: mockVolume(`${c.id}-wa`), minutesAgo: mockMinutesAgo(`${c.id}-wa`) });
            if (c.telegram_chat_id) rows.push({ id: `${c.id}-tg`, clientName: c.name, identifier: `chat ${c.telegram_chat_id}`, type: 'Telegram', health: mockHealth(`${c.id}-tg`), volume: mockVolume(`${c.id}-tg`), minutesAgo: mockMinutesAgo(`${c.id}-tg`) });
            if (c.email) rows.push({ id: `${c.id}-em`, clientName: c.name, identifier: c.email, type: 'Email', health: mockHealth(`${c.id}-em`), volume: mockVolume(`${c.id}-em`), minutesAgo: mockMinutesAgo(`${c.id}-em`) });
        }
        return rows;
    }, [clients]);

    const filtered = connections.filter(r => {
        const matchesSearch = !search || r.clientName.toLowerCase().includes(search.toLowerCase());
        const matchesType = typeFilter === 'All' || r.type === typeFilter;
        const matchesAttention = !attentionOnly || r.health < 75;
        return matchesSearch && matchesType && matchesAttention;
    });

    const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    const pageClamped = Math.min(page, totalPages);
    const paged = filtered.slice((pageClamped - 1) * PAGE_SIZE, pageClamped * PAGE_SIZE);

    const healthy = connections.filter(r => r.health >= 75).length;
    const needsAttention = connections.filter(r => r.health < 75);
    const totalVolume = connections.reduce((s, r) => s + r.volume, 0);
    const byType = CHANNEL_TYPES.map(t => ({ type: t, count: connections.filter(r => r.type === t).length, volume: connections.filter(r => r.type === t).reduce((s, r) => s + r.volume, 0) }));
    const healthBuckets = {
        excellent: connections.filter(r => r.health >= 90).length,
        good: connections.filter(r => r.health >= 75 && r.health < 90).length,
        risk: connections.filter(r => r.health < 75).length,
    };

    return (
        <div className="flex flex-col xl:flex-row gap-6 items-start">
            <div className="flex-1 min-w-0 w-full flex flex-col gap-[18px]">
                <div className="flex items-end justify-between gap-4 flex-wrap">
                    <div>
                        <h1 className="font-display font-bold text-[22px] text-foreground tracking-[-0.01em]">Channels</h1>
                        <p className="text-[13px] text-voxly-ink-6 mt-[3px]">{connections.length} connected across {byType.filter(t => t.count > 0).length} types</p>
                    </div>
                    <Link href="/clients/new" className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-[13px] rounded-lg px-4 py-[9px] flex items-center gap-[7px] transition-colors">
                        <Plus className="w-[15px] h-[15px]" /> Connect channel
                    </Link>
                </div>

                <PreviewBanner>
                    <b className="font-semibold">Preview.</b> Which channels a client has (WhatsApp/Telegram/Email) is real. Volume, health, and last-activity below have no metering endpoint yet and are illustrative — a real per-channel volume/last-activity endpoint already exists in the backend (WhatsApp + Telegram only, no health score) and isn&apos;t wired up here yet.
                </PreviewBanner>

                <div className="flex items-center gap-[22px] px-[18px] py-3.5 border border-border rounded-xl bg-card flex-wrap">
                    <div><span className="font-display font-bold text-[17px] text-foreground">{connections.length}</span><span className="text-[11.5px] text-voxly-ink-5 ml-1.5">connections</span></div>
                    <div className="w-px h-4 bg-border" />
                    <div><span className="font-display font-bold text-[17px] text-voxly-success">{healthy}</span><span className="text-[11.5px] text-voxly-ink-5 ml-1.5">healthy</span></div>
                    <div className="w-px h-4 bg-border" />
                    <div><span className="font-display font-bold text-[17px] text-voxly-heat">{needsAttention.length}</span><span className="text-[11.5px] text-voxly-ink-5 ml-1.5">need attention</span></div>
                    <div className="w-px h-4 bg-border" />
                    <div><span className="font-display font-bold text-[17px] text-foreground">{totalVolume}</span><span className="text-[11.5px] text-voxly-ink-5 ml-1.5">messages today</span></div>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                    <div className="relative flex-1 max-w-[260px] min-w-[160px]">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-voxly-ink-5" />
                        <input
                            placeholder="Search channels…"
                            value={search}
                            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                            className="w-full h-9 pl-8 pr-3 text-[12.5px] bg-card border border-border rounded-lg text-foreground placeholder:text-voxly-ink-5 focus:outline-none focus:border-primary focus:ring-[3px] focus:ring-primary/15 transition-all"
                        />
                    </div>
                    {(['All', ...CHANNEL_TYPES] as const).map(f => (
                        <button
                            key={f}
                            onClick={() => { setTypeFilter(f); setPage(1); }}
                            className={`text-[11.5px] rounded-full px-[11px] py-[5px] transition-colors ${
                                typeFilter === f ? 'font-semibold text-primary-foreground bg-primary' : 'text-voxly-ink-6 border border-border hover:border-voxly-ink-4 hover:text-foreground'
                            }`}>
                            {f}
                        </button>
                    ))}
                    <div className="flex-1" />
                    <button
                        onClick={() => { setAttentionOnly(v => !v); setPage(1); }}
                        className={`flex items-center gap-1.5 text-[11.5px] rounded-lg px-[11px] py-[5px] transition-colors ${attentionOnly ? 'font-semibold text-primary-foreground bg-primary' : 'text-voxly-ink-6 border border-border hover:border-voxly-ink-4 hover:text-foreground'}`}>
                        <AlertTriangle className="w-[13px] h-[13px]" /> Needs attention
                    </button>
                </div>

                <div className="border border-border rounded-[14px] bg-card overflow-hidden">
                    {isLoading ? (
                        <div className="p-12 text-center text-voxly-ink-5 text-sm">Loading…</div>
                    ) : filtered.length === 0 ? (
                        <div className="p-12 text-center text-voxly-ink-5 text-sm">No channel connections found.</div>
                    ) : (
                        <div className="overflow-x-auto">
                        <div className="min-w-[760px]">
                            <div className={`${GRID_COLS} px-4 py-2.5 font-mono text-[10px] font-semibold tracking-[0.04em] uppercase text-voxly-ink-5 border-b border-border`}>
                                <div>Connection</div><div>Type</div><div>Status<PreviewMark /></div><div>Volume<PreviewMark /></div><div>Health<PreviewMark /></div><div>Last activity<PreviewMark /></div><div />
                            </div>
                            {paged.map(r => {
                                const Icon = CHANNEL_ICON[r.type];
                                const bucket = r.health >= 90 ? 'excellent' : r.health >= 75 ? 'good' : 'risk';
                                return (
                                    <div key={r.id} className={`${GRID_COLS} px-4 py-3 items-center border-b border-border last:border-b-0 hover:bg-white/[0.02] transition-colors ${bucket === 'risk' ? 'bg-voxly-warning-soft' : ''}`}>
                                        <div className="flex items-center gap-2.5 min-w-0">
                                            <div className="w-7 h-7 rounded-lg bg-voxly-surface-3 flex items-center justify-center text-voxly-ink-6 flex-none">
                                                <Icon className="w-3.5 h-3.5" />
                                            </div>
                                            <div className="min-w-0">
                                                <div className="text-[13px] font-semibold text-foreground truncate">{r.clientName}</div>
                                                <div className="font-mono text-[10.5px] text-voxly-ink-5 truncate">{r.identifier}</div>
                                            </div>
                                        </div>
                                        <div><span className="text-[10.5px] text-voxly-ink-6 border border-border rounded-[5px] px-1.5 py-0.5 whitespace-nowrap">{r.type}</span></div>
                                        <div className="flex flex-col gap-[3px] items-start">
                                            <span className={`inline-flex items-center gap-[5px] text-[11px] font-semibold rounded-full pl-1.5 pr-2 py-[3px] whitespace-nowrap ${bucket === 'risk' ? 'bg-voxly-warning-soft text-voxly-warning' : 'bg-voxly-success-soft text-voxly-success'}`}>
                                                <span className={`w-[5px] h-[5px] rounded-full flex-none ${bucket === 'risk' ? 'bg-voxly-warning' : 'bg-voxly-success'}`} />{bucket === 'risk' ? 'Degraded' : 'Active'}
                                            </span>
                                        </div>
                                        <div>
                                            <div className="text-[13px] text-foreground tabular-nums">{r.volume}</div>
                                            <div className="text-[9.5px] text-voxly-ink-5">today</div>
                                        </div>
                                        <div><span className={`font-display font-bold text-[12.5px] ${bucket === 'risk' ? 'text-voxly-warning' : 'text-voxly-success'}`}>{r.health}</span></div>
                                        <div className={`text-[12px] whitespace-nowrap ${bucket === 'risk' ? 'text-voxly-warning' : 'text-voxly-ink-5'}`}>{timeAgo(r.minutesAgo)}</div>
                                        <ChevronRight className="w-4 h-4 text-voxly-ink-5" />
                                    </div>
                                );
                            })}
                        </div>
                        </div>
                    )}
                </div>

                {filtered.length > 0 && (
                    <div className="flex items-center justify-between">
                        <span className="text-xs text-voxly-ink-5">Showing {paged.length} of {filtered.length} connections</span>
                        <div className="flex gap-1.5">
                            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={pageClamped <= 1} className="w-7 h-7 border border-border rounded-[7px] flex items-center justify-center text-voxly-ink-6 disabled:opacity-40 disabled:cursor-not-allowed hover:border-voxly-ink-4 transition-colors">
                                <ChevronLeft className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={pageClamped >= totalPages} className="w-7 h-7 border border-border rounded-[7px] flex items-center justify-center text-voxly-ink-6 disabled:opacity-40 disabled:cursor-not-allowed hover:border-voxly-ink-4 transition-colors">
                                <ChevronRight className="w-3.5 h-3.5" />
                            </button>
                        </div>
                    </div>
                )}
            </div>

            <div className="w-full xl:w-80 flex-none flex flex-col gap-3.5">
                <Panel title="By Type">
                    {byType.map(t => {
                        const Icon = CHANNEL_ICON[t.type];
                        return <PanelRow key={t.type} label={<span className="flex items-center gap-1.5"><Icon className="w-3 h-3" />{t.type}</span>} value={t.count} />;
                    })}
                </Panel>
                <Panel title="Needs Attention" badge={<span className="text-[10.5px] bg-voxly-heat-soft text-voxly-heat px-[7px] py-[1px] rounded-full">{needsAttention.length}</span>}>
                    <div className="px-3.5 pb-3.5 flex flex-col gap-2">
                        {needsAttention.length === 0 ? (
                            <span className="text-xs text-voxly-ink-5">All channels healthy.</span>
                        ) : needsAttention.slice(0, 4).map(r => (
                            <div key={r.id} className="flex items-start gap-2">
                                <AlertTriangle className="w-3 h-3 text-voxly-warning flex-none mt-0.5" />
                                <span className="text-xs text-foreground/90 leading-relaxed">{r.clientName} {r.type} — degraded, health {r.health}</span>
                            </div>
                        ))}
                    </div>
                </Panel>
                <Panel title="Health Distribution">
                    <PanelRow dot="bg-voxly-success" label="Excellent (90+)" value={healthBuckets.excellent} />
                    <PanelRow dot="bg-voxly-success" label="Good (75-89)" value={healthBuckets.good} />
                    <PanelRow dot="bg-voxly-warning" label="At risk (<75)" value={healthBuckets.risk} />
                </Panel>
                <Panel title="Volume Today" defaultOpen={false}>
                    {byType.map(t => <PanelRow key={t.type} label={t.type} value={t.volume} />)}
                </Panel>
            </div>
        </div>
    );
}
