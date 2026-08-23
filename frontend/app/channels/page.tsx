'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { channelsAPI, clientsAPI } from '@/lib/api';
import type { ChannelActivity, Client } from '@/types';
import Link from 'next/link';
import {
    Plus, Search, AlertTriangle, MessageSquare, Send, ChevronLeft, ChevronRight,
    RefreshCw, Radio,
} from 'lucide-react';
import { formatPhone } from '@/lib/utils';
import { QUIET_AFTER_DAYS, daysSince, isQuietChannel, timeAgo } from '@/lib/channelActivity';
import { Button } from '@/components/ui/button';
import { Panel, PanelRow, PanelText } from '@/components/SidePanel';

const PAGE_SIZE = 8;

/* The backend constrains chat_history.channel to exactly these two. Email is a
   one-way notification/reset channel with no persisted conversation history,
   so it is never a channel connection and is not listed here. */
const CHANNEL_TYPES = ['whatsapp', 'telegram'] as const;
type ChannelType = typeof CHANNEL_TYPES[number];

const CHANNEL_ICON: Record<string, typeof MessageSquare> = {
    whatsapp: MessageSquare,
    telegram: Send,
};
const CHANNEL_LABEL: Record<string, string> = {
    whatsapp: 'WhatsApp',
    telegram: 'Telegram',
};

const GRID_COLS = 'grid grid-cols-[2fr_1fr_1.2fr_0.9fr_1fr_28px]';

interface ConnectionRow {
    id: string;
    clientId: string;
    clientName: string;
    identifier: string;
    channel: string;
    volumeToday: number;
    lastActivity: string | null;
    isQuiet: boolean;
}

export default function ChannelsPage() {
    const [search, setSearch] = useState('');
    const [typeFilter, setTypeFilter] = useState<'all' | ChannelType>('all');
    const [quietOnly, setQuietOnly] = useState(false);
    const [page, setPage] = useState(1);

    // The activity aggregate is the source of truth for which connections
    // exist. Clients are fetched only to resolve a client_id into a display
    // name and the address the messages arrive on.
    const activityQuery = useQuery({
        queryKey: ['channel-activity'],
        queryFn: async () => (await channelsAPI.list()).data as ChannelActivity[],
    });
    const clientsQuery = useQuery({
        queryKey: ['clients'],
        queryFn: async () => (await clientsAPI.list()).data as Client[],
    });

    const clients = useMemo(() => clientsQuery.data ?? [], [clientsQuery.data]);
    const activity = useMemo(() => activityQuery.data ?? [], [activityQuery.data]);

    const clientsById = useMemo(
        () => new Map(clients.map(c => [c.id, c])),
        [clients],
    );

    const connections: ConnectionRow[] = useMemo(() => activity.map(a => {
        const client = clientsById.get(a.client_id);
        const identifier =
            a.channel === 'telegram'
                ? (client?.telegram_chat_id ? `chat ${client.telegram_chat_id}` : '—')
                : (client?.phone ? formatPhone(client.phone) : '—');
        return {
            id: `${a.client_id}-${a.channel}`,
            clientId: a.client_id,
            clientName: client?.name ?? 'Unknown client',
            identifier,
            channel: a.channel,
            volumeToday: a.volume_today,
            lastActivity: a.last_activity,
            isQuiet: isQuietChannel(a),
        };
    }), [activity, clientsById]);

    const filtered = connections.filter(r => {
        const matchesSearch = !search
            || r.clientName.toLowerCase().includes(search.toLowerCase())
            || r.identifier.toLowerCase().includes(search.toLowerCase());
        const matchesType = typeFilter === 'all' || r.channel === typeFilter;
        const matchesQuiet = !quietOnly || r.isQuiet;
        return matchesSearch && matchesType && matchesQuiet;
    });

    const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    const pageClamped = Math.min(page, totalPages);
    const paged = filtered.slice((pageClamped - 1) * PAGE_SIZE, pageClamped * PAGE_SIZE);

    // Every figure below is derived from real aggregate rows.
    const quiet = connections.filter(r => r.isQuiet);
    const activeToday = connections.filter(r => r.volumeToday > 0);
    const totalVolumeToday = connections.reduce((s, r) => s + r.volumeToday, 0);
    const byType = CHANNEL_TYPES.map(t => ({
        channel: t,
        count: connections.filter(r => r.channel === t).length,
        volume: connections.filter(r => r.channel === t).reduce((s, r) => s + r.volumeToday, 0),
    }));
    const activityBuckets = {
        today: activeToday.length,
        week: connections.filter(r => {
            const d = daysSince(r.lastActivity);
            return d != null && d < QUIET_AFTER_DAYS && r.volumeToday === 0;
        }).length,
        quiet: quiet.length,
    };

    // A client can have a phone or Telegram id configured and still have no
    // conversation — the aggregate only reports channels with real messages,
    // so surface the difference rather than inventing a row for it.
    const configuredNotStarted = clients.filter(c => {
        const hasRow = connections.some(r => r.clientId === c.id);
        return !hasRow && (c.phone || c.telegram_chat_id);
    }).length;

    const isPending = activityQuery.isPending || clientsQuery.isPending;
    const isError = activityQuery.isError || clientsQuery.isError;
    const isFiltering = !!search || typeFilter !== 'all' || quietOnly;

    const retry = () => { activityQuery.refetch(); clientsQuery.refetch(); };

    return (
        <div className="flex flex-col xl:flex-row gap-6 items-start">
            <div className="flex-1 min-w-0 w-full flex flex-col gap-[18px]">
                <div className="flex items-end justify-between gap-4 flex-wrap">
                    <div>
                        <h1 className="font-display font-bold text-[22px] text-foreground tracking-[-0.01em]">Channels</h1>
                        <p className="text-[13px] text-voxly-ink-6 mt-[3px]">
                            {connections.length} active connection{connections.length === 1 ? '' : 's'}
                            {' '}across {byType.filter(t => t.count > 0).length} channel type{byType.filter(t => t.count > 0).length === 1 ? '' : 's'}
                        </p>
                    </div>
                    <Link href="/clients/new" className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-[13px] rounded-lg px-4 py-[9px] flex items-center gap-[7px] transition-colors">
                        <Plus className="w-[15px] h-[15px]" /> Connect channel
                    </Link>
                </div>

                <div className="flex items-center gap-[22px] px-[18px] py-3.5 border border-border rounded-xl bg-card flex-wrap">
                    <div><span className="font-display font-bold text-[17px] text-foreground">{connections.length}</span><span className="text-[11.5px] text-voxly-ink-5 ml-1.5">connections</span></div>
                    <div className="w-px h-4 bg-border" />
                    <div><span className="font-display font-bold text-[17px] text-voxly-success">{activeToday.length}</span><span className="text-[11.5px] text-voxly-ink-5 ml-1.5">active today</span></div>
                    <div className="w-px h-4 bg-border" />
                    <div><span className="font-display font-bold text-[17px] text-voxly-warning">{quiet.length}</span><span className="text-[11.5px] text-voxly-ink-5 ml-1.5">quiet {QUIET_AFTER_DAYS}d+</span></div>
                    <div className="w-px h-4 bg-border" />
                    <div><span className="font-display font-bold text-[17px] text-foreground">{totalVolumeToday}</span><span className="text-[11.5px] text-voxly-ink-5 ml-1.5">messages today</span></div>
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
                    {(['all', ...CHANNEL_TYPES] as const).map(f => (
                        <button
                            key={f}
                            onClick={() => { setTypeFilter(f); setPage(1); }}
                            className={`text-[11.5px] rounded-full px-[11px] py-[5px] transition-colors ${
                                typeFilter === f ? 'font-semibold text-primary-foreground bg-primary' : 'text-voxly-ink-6 border border-border hover:border-voxly-ink-4 hover:text-foreground'
                            }`}>
                            {f === 'all' ? 'All' : CHANNEL_LABEL[f]}
                        </button>
                    ))}
                    <div className="flex-1" />
                    <button
                        onClick={() => { setQuietOnly(v => !v); setPage(1); }}
                        title={`Connections with no message in ${QUIET_AFTER_DAYS} or more days`}
                        className={`flex items-center gap-1.5 text-[11.5px] rounded-lg px-[11px] py-[5px] transition-colors ${quietOnly ? 'font-semibold text-primary-foreground bg-primary' : 'text-voxly-ink-6 border border-border hover:border-voxly-ink-4 hover:text-foreground'}`}>
                        <AlertTriangle className="w-[13px] h-[13px]" /> Quiet {QUIET_AFTER_DAYS}d+
                    </button>
                </div>

                <div className="border border-border rounded-[14px] bg-card overflow-hidden">
                    {isError ? (
                        <div className="flex flex-col items-center justify-center py-16 text-center px-4">
                            <AlertTriangle className="w-8 h-8 text-voxly-heat mb-3" />
                            <h3 className="text-sm font-semibold text-foreground mb-1">Couldn&apos;t load channel activity</h3>
                            <p className="text-xs text-voxly-ink-5 max-w-sm mb-4">The channels service did not respond.</p>
                            <Button onClick={retry} className="bg-secondary hover:bg-accent text-foreground border border-voxly-ink-4">
                                <RefreshCw className="w-3.5 h-3.5 mr-2" />Try again
                            </Button>
                        </div>
                    ) : isPending ? (
                        <div className="p-4 space-y-2">
                            {[1, 2, 3, 4].map(k => <div key={k} className="h-12 bg-secondary rounded-lg animate-pulse" />)}
                        </div>
                    ) : filtered.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-16 text-center px-4">
                            <Radio className="w-8 h-8 text-voxly-ink-5 mb-3" />
                            <h3 className="text-sm font-semibold text-foreground mb-1">
                                {isFiltering ? 'No connections match these filters' : 'No channel activity yet'}
                            </h3>
                            <p className="text-xs text-voxly-ink-5 max-w-sm mb-4">
                                {isFiltering
                                    ? 'Try a different search term or clear the filters.'
                                    : 'A connection appears here once a client actually sends or receives a message on WhatsApp or Telegram.'}
                            </p>
                            {isFiltering ? (
                                <Button onClick={() => { setSearch(''); setTypeFilter('all'); setQuietOnly(false); setPage(1); }} className="bg-secondary hover:bg-accent text-foreground border border-voxly-ink-4">
                                    Clear filters
                                </Button>
                            ) : (
                                <Link href="/clients/new">
                                    <Button className="bg-primary hover:bg-primary/90 text-primary-foreground">
                                        <Plus className="w-4 h-4 mr-2" />Add a Client
                                    </Button>
                                </Link>
                            )}
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <div className="min-w-[700px]">
                                <div className={`${GRID_COLS} px-4 py-2.5 font-mono text-[10px] font-semibold tracking-[0.04em] uppercase text-voxly-ink-5 border-b border-border`}>
                                    <div>Connection</div><div>Type</div><div>Status</div><div>Volume</div><div>Last activity</div><div />
                                </div>
                                {paged.map(r => {
                                    const Icon = CHANNEL_ICON[r.channel] ?? MessageSquare;
                                    return (
                                        <Link
                                            key={r.id}
                                            href={`/clients/${r.clientId}`}
                                            className={`${GRID_COLS} px-4 py-3 items-center border-b border-border last:border-b-0 hover:bg-white/[0.02] transition-colors ${r.isQuiet ? 'bg-voxly-warning-soft' : ''}`}
                                        >
                                            <div className="flex items-center gap-2.5 min-w-0">
                                                <div className="w-7 h-7 rounded-lg bg-voxly-surface-3 flex items-center justify-center text-voxly-ink-6 flex-none">
                                                    <Icon className="w-3.5 h-3.5" />
                                                </div>
                                                <div className="min-w-0">
                                                    <div className="text-[13px] font-semibold text-foreground truncate">{r.clientName}</div>
                                                    <div className="font-mono text-[10.5px] text-voxly-ink-5 truncate">{r.identifier}</div>
                                                </div>
                                            </div>
                                            <div><span className="text-[10.5px] text-voxly-ink-6 border border-border rounded-[5px] px-1.5 py-0.5 whitespace-nowrap">{CHANNEL_LABEL[r.channel] ?? r.channel}</span></div>
                                            <div>
                                                <span className={`inline-flex items-center gap-[5px] text-[11px] font-semibold rounded-full pl-1.5 pr-2 py-[3px] whitespace-nowrap ${r.isQuiet ? 'bg-voxly-warning-soft text-voxly-warning' : 'bg-voxly-success-soft text-voxly-success'}`}>
                                                    <span className={`w-[5px] h-[5px] rounded-full flex-none ${r.isQuiet ? 'bg-voxly-warning' : 'bg-voxly-success'}`} />{r.isQuiet ? 'Quiet' : 'Active'}
                                                </span>
                                            </div>
                                            <div>
                                                <div className="text-[13px] text-foreground tabular-nums">{r.volumeToday}</div>
                                                <div className="text-[9.5px] text-voxly-ink-5">today</div>
                                            </div>
                                            <div className={`text-[12px] whitespace-nowrap ${r.isQuiet ? 'text-voxly-warning' : 'text-voxly-ink-5'}`}>{timeAgo(r.lastActivity)}</div>
                                            <ChevronRight className="w-4 h-4 text-voxly-ink-5" />
                                        </Link>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>

                {filtered.length > PAGE_SIZE && (
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
                        const Icon = CHANNEL_ICON[t.channel];
                        return (
                            <PanelRow
                                key={t.channel}
                                label={<span className="flex items-center gap-1.5"><Icon className="w-3 h-3" />{CHANNEL_LABEL[t.channel]}</span>}
                                value={t.count}
                            />
                        );
                    })}
                    <PanelText>
                        Email is a one-way notification channel with no conversation history, so it is not a channel connection.
                    </PanelText>
                </Panel>

                <Panel title="Activity">
                    <PanelRow dot="bg-voxly-success" label="Active today" value={activityBuckets.today} />
                    <PanelRow dot="bg-voxly-ink-5" label={`Within ${QUIET_AFTER_DAYS} days`} value={activityBuckets.week} />
                    <PanelRow dot="bg-voxly-warning" label={`Quiet ${QUIET_AFTER_DAYS}d+`} value={activityBuckets.quiet} />
                </Panel>

                <Panel
                    title="Quiet Connections"
                    badge={<span className="text-[10.5px] bg-voxly-warning-soft text-voxly-warning px-[7px] py-[1px] rounded-full">{quiet.length}</span>}
                >
                    {quiet.length === 0 ? (
                        <PanelText>Every connection has been active in the last {QUIET_AFTER_DAYS} days.</PanelText>
                    ) : (
                        <div className="px-3.5 pb-3.5 flex flex-col gap-2 pt-2">
                            {quiet.slice(0, 4).map(r => (
                                <div key={r.id} className="flex items-start gap-2">
                                    <AlertTriangle className="w-3 h-3 text-voxly-warning flex-none mt-0.5" />
                                    <span className="text-xs text-foreground/90 leading-relaxed">
                                        {r.clientName} · {CHANNEL_LABEL[r.channel] ?? r.channel} — last message {timeAgo(r.lastActivity)}
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}
                </Panel>

                <Panel title="Volume Today" defaultOpen={false}>
                    {byType.map(t => <PanelRow key={t.channel} label={CHANNEL_LABEL[t.channel]} value={t.volume} />)}
                    <PanelRow label="Total" value={totalVolumeToday} />
                </Panel>

                {configuredNotStarted > 0 && (
                    <Panel title="Not Yet Started" defaultOpen={false}>
                        <PanelText>
                            {configuredNotStarted} client{configuredNotStarted === 1 ? ' has' : 's have'} a
                            {' '}WhatsApp number or Telegram chat configured but no messages yet — they appear
                            here once a first message is exchanged.
                        </PanelText>
                    </Panel>
                )}
            </div>
        </div>
    );
}
