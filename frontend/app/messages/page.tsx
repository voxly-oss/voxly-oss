'use client';

import { useState, useEffect, useMemo } from 'react';
import { useQuery, keepPreviousData, useQueryClient } from '@tanstack/react-query';
import { useWebSocket } from '@/hooks/useWebSocket';
import { chatAPI } from '@/lib/api';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import {
    MessageSquare, Search, User as UserIcon, ChevronLeft, ChevronRight,
    Sparkles, Plus, AlertTriangle, Check, X as XIcon,
} from 'lucide-react';
import { Panel, PanelRow, PanelText } from '@/components/SidePanel';
import PreviewBadge, { PreviewBanner, PreviewMark } from '@/components/PreviewBadge';

/* ─── Types (unchanged from previous implementation) ─── */
interface ChatMessage {
    id: string;
    client_id: string;
    client_name?: string;
    sender: 'client' | 'ai';
    message: string;
    ai_response?: string;
    tokens_used?: number;
    model_used?: string;
    created_at: string;
}

const PAGE_SIZE = 20;

function formatTimeAgo(dateString: string) {
    const diffMins = Math.floor((Date.now() - new Date(dateString).getTime()) / 60000);
    if (diffMins < 1) return 'now';
    if (diffMins < 60) return `${diffMins}m`;
    const h = Math.floor(diffMins / 60);
    if (h < 24) return `${h}h`;
    return `${Math.floor(h / 24)}d`;
}

function truncate(str: string, len: number) {
    return str.length > len ? str.slice(0, len) + '…' : str;
}

// Deterministic placeholder confidence/sentiment — no sentiment-analysis or
// confidence-scoring model exists on the backend yet. Stable per message id.
function hashOf(s: string) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
}
const mockConfidence = (id: string) => 65 + (hashOf(id) % 34);
const SENTIMENTS = ['Positive', 'Neutral', 'Negative'] as const;
const mockSentiment = (id: string) => SENTIMENTS[hashOf(`${id}-s`) % 3];

type Status = 'Awaiting human' | 'AI handling' | 'Resolved';
const STATUS_STYLE: Record<Status, string> = {
    'Awaiting human': 'bg-voxly-warning-soft text-voxly-warning',
    'AI handling': 'bg-voxly-violet-soft text-voxly-violet',
    'Resolved': 'bg-voxly-success-soft text-voxly-success',
};
const STATUS_DOT: Record<Status, string> = {
    'Awaiting human': 'bg-voxly-warning',
    'AI handling': 'bg-voxly-violet',
    'Resolved': 'bg-voxly-success',
};

function inferStatus(latest: ChatMessage): Status {
    if (!latest.ai_response) return 'Awaiting human';
    const ageMin = (Date.now() - new Date(latest.created_at).getTime()) / 60000;
    return ageMin < 15 ? 'AI handling' : 'Resolved';
}

function groupLabel(m: ChatMessage) {
    const mins = (Date.now() - new Date(m.created_at).getTime()) / 60000;
    if (mins < 15) return 'JUST NOW';
    if (mins < 24 * 60) return 'EARLIER TODAY';
    if (mins < 48 * 60) return 'YESTERDAY';
    return 'EARLIER';
}

export default function ConversationCenterPage() {
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(0);
    const [statusFilter, setStatusFilter] = useState<'All' | Status>('All');
    const [selectedClientId, setSelectedClientId] = useState<string | null>(null);

    const { data: messagesData, isLoading } = useQuery<{ messages: ChatMessage[]; total: number }>({
        queryKey: ['messages', page],
        queryFn: async () => {
            const res = await chatAPI.allMessages({ skip: page * PAGE_SIZE, limit: PAGE_SIZE });
            return res.data as { messages: ChatMessage[]; total: number };
        },
        placeholderData: keepPreviousData,
    });

    // Real-time updates — matches the Phase 3 Milestone 4 event envelope
    // ({event, payload}, not the old {type, message} shape). Only
    // conversation.message_completed carries a full ChatMessage-shaped
    // record; conversation.message_received fires before the AI reply
    // exists and conversation.state_changed carries only a status delta,
    // so neither is appended to the message list here.
    const queryClient = useQueryClient();
    const { lastMessage } = useWebSocket();

    useEffect(() => {
        if (!lastMessage) return;
        if (lastMessage.event === 'conversation.message_completed') {
            const newMsg = lastMessage.payload as ChatMessage;
            queryClient.setQueryData(['messages', 0], (old: { messages: ChatMessage[]; total: number } | undefined) => {
                if (!old) return { messages: [newMsg], total: 1 };
                if (old.messages.some(m => m.id === newMsg.id)) return old;
                return { ...old, total: old.total + 1, messages: [newMsg, ...old.messages].slice(0, PAGE_SIZE) };
            });
            queryClient.invalidateQueries({ queryKey: ['messages'] });
        }
    }, [lastMessage, queryClient]);

    const messages: ChatMessage[] = messagesData?.messages ?? [];
    const total: number = messagesData?.total ?? 0;
    const totalPages = Math.ceil(total / PAGE_SIZE);

    // Group the currently-loaded message batch into one row per client —
    // real data, same fetch/pagination/WebSocket wiring as before, just
    // presented as conversations instead of a flat log.
    const conversations = useMemo(() => {
        const byClient = new Map<string, ChatMessage[]>();
        for (const m of messages) {
            const arr = byClient.get(m.client_id) ?? [];
            arr.push(m);
            byClient.set(m.client_id, arr);
        }
        return Array.from(byClient.entries()).map(([clientId, msgs]) => {
            const sorted = [...msgs].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
            const latest = sorted[0];
            return {
                clientId, clientName: latest.client_name || 'Unknown Client',
                latest, status: inferStatus(latest), thread: sorted,
                confidence: mockConfidence(latest.id), sentiment: mockSentiment(latest.id),
            };
        }).sort((a, b) => new Date(b.latest.created_at).getTime() - new Date(a.latest.created_at).getTime());
    }, [messages]);

    const filtered = useMemo(() => conversations.filter(c => {
        const matchesSearch = !search || c.clientName.toLowerCase().includes(search.toLowerCase()) ||
            c.latest.message?.toLowerCase().includes(search.toLowerCase());
        const matchesStatus = statusFilter === 'All' || c.status === statusFilter;
        return matchesSearch && matchesStatus;
    }), [conversations, search, statusFilter]);

    const selected = filtered.find(c => c.clientId === selectedClientId) ?? filtered[0] ?? null;
    const needsAttention = conversations.filter(c => c.status === 'Awaiting human').slice(0, 2);
    const statusCounts = {
        Resolved: conversations.filter(c => c.status === 'Resolved').length,
        'AI handling': conversations.filter(c => c.status === 'AI handling').length,
        'Awaiting human': conversations.filter(c => c.status === 'Awaiting human').length,
    };

    const grouped = useMemo(() => {
        const groups: { label: string; items: typeof filtered }[] = [];
        for (const c of filtered) {
            const label = groupLabel(c.latest);
            const last = groups[groups.length - 1];
            if (last && last.label === label) last.items.push(c);
            else groups.push({ label, items: [c] });
        }
        return groups;
    }, [filtered]);

    return (
        <div className="flex flex-col xl:flex-row gap-6 items-start">
            <div className="flex-1 min-w-0 w-full flex flex-col gap-[18px]">
                <div className="flex items-end justify-between gap-4 flex-wrap">
                    <div>
                        <h1 className="font-display font-bold text-[22px] text-foreground tracking-[-0.01em] flex items-center gap-2">
                            Conversation Center <Sparkles className="w-4 h-4 text-voxly-violet" />
                        </h1>
                        <p className="text-[13px] text-voxly-ink-6 mt-[3px]">
                            {conversations.length} conversations{total > 0 ? ` · ${total} total messages` : ''} · {statusCounts['Awaiting human']} need attention
                        </p>
                    </div>
                    <button disabled title="Compose requires selecting a client first" className="bg-primary/60 text-primary-foreground font-semibold text-[13px] rounded-lg px-4 py-[9px] flex items-center gap-[7px] cursor-not-allowed">
                        <Plus className="w-[15px] h-[15px]" /> Compose
                    </button>
                </div>

                <PreviewBanner>
                    <b className="font-semibold">Preview.</b> Messages and AI replies below are real. Confidence % and Sentiment are illustrative — no sentiment-analysis model runs yet, though the backend now stores real confidence/sentiment on each message when a provider returns them.
                </PreviewBanner>

                {needsAttention.length > 0 && (
                    <div className="rounded-[14px] border border-voxly-violet/30 bg-voxly-violet-soft px-[18px] py-3.5">
                        <div className="font-mono text-[9.5px] font-bold tracking-[0.07em] text-voxly-violet mb-2.5">NEEDS ATTENTION</div>
                        <div className="flex flex-col gap-2.5">
                            {needsAttention.map(c => (
                                <div key={c.clientId} className="flex items-center gap-2.5">
                                    <AlertTriangle className="w-3.5 h-3.5 text-voxly-warning flex-none" />
                                    <span className="flex-1 text-[12.5px] text-foreground/90 leading-relaxed">{c.clientName} — AI drafted a reply, awaiting your review</span>
                                    <button onClick={() => setSelectedClientId(c.clientId)} className="font-semibold text-[11px] text-voxly-warning border border-voxly-warning/40 hover:bg-voxly-warning-soft rounded-md px-2.5 py-[3px] flex-none transition-colors">
                                        Review
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Status row */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
                    <div className="border border-border rounded-xl bg-card px-4 py-3.5">
                        <div className="font-mono text-[9.5px] font-bold uppercase tracking-wider text-voxly-ink-5 mb-2.5 flex items-center">Conversation Status<PreviewMark /></div>
                        <PanelRow dot={STATUS_DOT.Resolved} label="Resolved" value={statusCounts.Resolved} />
                        <PanelRow dot={STATUS_DOT['AI handling']} label="AI handling" value={statusCounts['AI handling']} />
                        <PanelRow dot={STATUS_DOT['Awaiting human']} label="Awaiting human" value={statusCounts['Awaiting human']} />
                    </div>
                    <div className="border border-border rounded-xl bg-card px-4 py-3.5">
                        <div className="font-mono text-[9.5px] font-bold uppercase tracking-wider text-voxly-ink-5 mb-2.5 flex items-center">SLA<PreviewMark /></div>
                        <PanelRow dot="bg-voxly-success" label="On track" value={Math.max(conversations.length - 2, 0)} />
                        <PanelRow dot="bg-voxly-warning" label="At risk" value={conversations.length > 0 ? 1 : 0} />
                        <PanelRow dot="bg-voxly-heat" label="Breached" value={conversations.length > 1 ? 1 : 0} />
                    </div>
                    <div className="border border-border rounded-xl bg-card px-4 py-3.5">
                        <div className="font-mono text-[9.5px] font-bold uppercase tracking-wider text-voxly-ink-5 mb-2.5 flex items-center">Sentiment<PreviewMark /></div>
                        <PanelRow dot="bg-voxly-success" label="Positive" value={conversations.filter(c => c.sentiment === 'Positive').length} />
                        <PanelRow dot="bg-voxly-ink-5" label="Neutral" value={conversations.filter(c => c.sentiment === 'Neutral').length} />
                        <PanelRow dot="bg-voxly-heat" label="Negative" value={conversations.filter(c => c.sentiment === 'Negative').length} />
                    </div>
                </div>

                {/* Filter bar */}
                <div className="flex items-center gap-2 flex-wrap">
                    <div className="relative flex-1 max-w-[260px] min-w-[160px]">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-voxly-ink-5" />
                        <input
                            placeholder="Search conversations…"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="w-full h-9 pl-8 pr-3 text-[12.5px] bg-card border border-border rounded-lg text-foreground placeholder:text-voxly-ink-5 focus:outline-none focus:border-primary focus:ring-[3px] focus:ring-primary/15 transition-all"
                        />
                    </div>
                    {(['All', 'Awaiting human', 'AI handling', 'Resolved'] as const).map(f => (
                        <button
                            key={f}
                            onClick={() => setStatusFilter(f)}
                            className={`text-[11.5px] rounded-full px-[11px] py-[5px] transition-colors ${
                                statusFilter === f ? 'font-semibold text-primary-foreground bg-primary' : 'text-voxly-ink-6 border border-border hover:border-voxly-ink-4 hover:text-foreground'
                            }`}>
                            {f === 'Awaiting human' ? 'Needs attention' : f}
                        </button>
                    ))}
                </div>

                {/* Conversation list */}
                <div className="border border-border rounded-[14px] bg-card overflow-hidden">
                    {isLoading ? (
                        <div className="p-8 text-center text-voxly-ink-5 text-sm">Loading…</div>
                    ) : filtered.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-16 text-center">
                            <MessageSquare className="w-8 h-8 text-voxly-ink-5 mb-3" />
                            <h3 className="text-sm font-semibold text-foreground mb-1">No conversations yet</h3>
                            <p className="text-xs text-voxly-ink-5 max-w-sm mb-4">Messages from WhatsApp-connected clients will appear here.</p>
                            <Link href="/clients/new"><Button className="bg-primary hover:bg-primary/90 text-primary-foreground"><UserIcon className="w-4 h-4 mr-2" />Add a Client</Button></Link>
                        </div>
                    ) : (
                        grouped.map(group => (
                            <div key={group.label}>
                                <div className="px-4 py-2 bg-voxly-surface-2 font-mono text-[9.5px] font-bold tracking-[0.07em] text-voxly-ink-5">{group.label}</div>
                                {group.items.map(c => {
                                    const isSelected = selected?.clientId === c.clientId;
                                    return (
                                        <button
                                            key={c.clientId}
                                            onClick={() => setSelectedClientId(c.clientId)}
                                            className={`w-full flex items-center gap-3 px-4 py-[11px] border-b border-border last:border-b-0 text-left transition-colors ${
                                                isSelected ? 'bg-voxly-surface-2' : c.status === 'Awaiting human' ? 'hover:bg-white/[0.03]' : 'hover:bg-white/[0.02]'
                                            }`}
                                        >
                                            <span className={`w-[3px] self-stretch rounded-sm flex-none ${isSelected ? 'bg-primary' : 'bg-transparent'}`} />
                                            <span className="w-7 h-7 rounded-lg bg-voxly-surface-3 flex items-center justify-center flex-none text-voxly-ink-6">
                                                <MessageSquare className="w-3.5 h-3.5" />
                                            </span>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-[13px] font-semibold text-foreground truncate">{c.clientName}</span>
                                                    <span className={`inline-flex items-center gap-1 text-[10.5px] font-semibold rounded-full pl-1.5 pr-2 py-[2px] whitespace-nowrap flex-none ${STATUS_STYLE[c.status]}`}>
                                                        <span className={`w-[5px] h-[5px] rounded-full ${STATUS_DOT[c.status]}`} />{c.status}
                                                    </span>
                                                </div>
                                                <div className="text-xs text-voxly-ink-6 truncate mt-0.5">&quot;{truncate(c.latest.message, 60)}&quot;</div>
                                            </div>
                                            <div className="flex-none text-right">
                                                <div className="flex items-center gap-1.5 justify-end text-[10.5px] text-voxly-ink-6">
                                                    <Sparkles className="w-2.5 h-2.5 text-voxly-violet" />
                                                    <span className={`font-semibold ${c.confidence >= 85 ? 'text-voxly-success' : c.confidence >= 70 ? 'text-voxly-warning' : 'text-voxly-heat'}`}>{c.confidence}%</span>
                                                </div>
                                                <div className="text-[10.5px] text-voxly-ink-5 mt-0.5">{c.sentiment}</div>
                                            </div>
                                            <span className="font-mono text-[11px] text-voxly-ink-5 flex-none w-8 text-right">{formatTimeAgo(c.latest.created_at)}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        ))
                    )}
                </div>

                {totalPages > 1 && (
                    <div className="flex items-center justify-between">
                        <span className="text-xs text-voxly-ink-5">Page {page + 1} of {totalPages} · {total} messages total</span>
                        <div className="flex gap-1.5">
                            <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} className="w-7 h-7 border border-border rounded-[7px] flex items-center justify-center text-voxly-ink-6 disabled:opacity-40 disabled:cursor-not-allowed hover:border-voxly-ink-4 transition-colors">
                                <ChevronLeft className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} className="w-7 h-7 border border-border rounded-[7px] flex items-center justify-center text-voxly-ink-6 disabled:opacity-40 disabled:cursor-not-allowed hover:border-voxly-ink-4 transition-colors">
                                <ChevronRight className="w-3.5 h-3.5" />
                            </button>
                        </div>
                    </div>
                )}

                {/* Selected conversation */}
                {selected && (
                    <>
                        <div className="flex items-center gap-2.5 pt-2 border-t border-border">
                            <span className="font-mono text-[9.5px] font-bold uppercase tracking-wider text-voxly-ink-5">Selected conversation</span>
                        </div>
                        <div className="flex items-start justify-between gap-4 flex-wrap">
                            <div className="flex gap-3 min-w-0">
                                <div className="w-10 h-10 rounded-[11px] bg-voxly-surface-3 flex items-center justify-center flex-none">
                                    <MessageSquare className="w-[18px] h-[18px] text-voxly-ink-6" />
                                </div>
                                <div className="min-w-0">
                                    <div className="flex items-center gap-2.5">
                                        <Link href={`/clients/${selected.clientId}`} className="font-display font-bold text-[22px] text-foreground tracking-[-0.01em] truncate hover:text-primary transition-colors">
                                            {selected.clientName}
                                        </Link>
                                        <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold rounded-full pl-1.5 pr-2.5 py-[3px] whitespace-nowrap flex-none ${STATUS_STYLE[selected.status]}`}>
                                            <span className={`w-[5px] h-[5px] rounded-full ${STATUS_DOT[selected.status]}`} />{selected.status}
                                        </span>
                                    </div>
                                    <div className="text-[12.5px] text-voxly-ink-6 mt-1 flex items-center">
                                        WhatsApp · Confidence <span className="font-semibold text-voxly-warning">{selected.confidence}%</span> · Sentiment {selected.sentiment}<PreviewMark />
                                    </div>
                                </div>
                            </div>
                            <div className="flex items-center gap-2 flex-none">
                                <button className="font-semibold text-[13px] text-voxly-ink-6 hover:text-foreground border border-border hover:border-voxly-ink-4 rounded-lg px-3.5 py-2 transition-colors whitespace-nowrap">Take over</button>
                                <button className="font-semibold text-[13px] bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg px-3.5 py-2 transition-colors whitespace-nowrap">Approve</button>
                            </div>
                        </div>

                        {/* Conversation log — real message/ai_response content */}
                        <div className="border border-border rounded-[14px] bg-card overflow-hidden">
                            <div className="px-4 py-2 bg-voxly-surface-2 font-mono text-[9.5px] font-bold tracking-[0.07em] text-voxly-ink-5">CONVERSATION LOG</div>
                            {selected.thread.slice(0, 8).map(m => (
                                <div key={m.id} className="border-b border-border last:border-b-0">
                                    <div className="flex items-start gap-3 px-4 py-3.5">
                                        <span className="w-7 h-7 rounded-lg bg-voxly-surface-2 flex items-center justify-center flex-none text-voxly-ink-6">
                                            <UserIcon className="w-3.5 h-3.5" />
                                        </span>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2">
                                                <span className="text-[12.5px] font-semibold text-foreground">{selected.clientName}</span>
                                                <span className="text-[10px] text-voxly-ink-5 uppercase tracking-wide">Client</span>
                                            </div>
                                            <div className="text-[13px] text-foreground/90 mt-1">&quot;{m.message}&quot;</div>
                                        </div>
                                        <span className="font-mono text-[11px] text-voxly-ink-5 flex-none">{formatTimeAgo(m.created_at)} ago</span>
                                    </div>
                                    {m.ai_response && (
                                        <div className="flex items-start gap-3 px-4 py-3.5 border-t border-border bg-voxly-surface-2/30">
                                            <span className="w-7 h-7 rounded-lg bg-voxly-violet-soft flex items-center justify-center flex-none text-voxly-violet">
                                                <Sparkles className="w-3.5 h-3.5" />
                                            </span>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-[12.5px] font-semibold text-voxly-violet">AI</span>
                                                    {m.model_used && <span className="text-[10px] text-voxly-ink-5 font-mono">{m.model_used}</span>}
                                                </div>
                                                <div className="text-[13px] text-foreground/90 mt-1 p-2.5 border border-dashed border-voxly-ink-4 rounded-lg">{m.ai_response}</div>
                                                {m.tokens_used != null && m.tokens_used > 0 && <div className="text-[10.5px] text-voxly-ink-5 mt-1.5">{m.tokens_used} tokens</div>}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </>
                )}
            </div>

            {/* Right column */}
            {selected && (
                <div className="w-full xl:w-80 flex-none flex flex-col gap-3.5">
                    <Panel title="Conversation Health" badge={<PreviewBadge />}>
                        <PanelRow dot={selected.confidence >= 85 ? 'bg-voxly-success' : 'bg-voxly-warning'} label="Confidence" value={`${selected.confidence}%`} />
                        <PanelRow dot="bg-voxly-ink-5" label="Sentiment" value={selected.sentiment} />
                        <PanelRow dot="bg-voxly-success" label="Messages" value={selected.thread.length} />
                        {selected.confidence < 85 && (
                            <PanelText>Confidence dropped below the auto-send threshold (85%) — held for review rather than sent.</PanelText>
                        )}
                    </Panel>
                    <Panel title="AI Memory Used">
                        <div className="px-3.5 pb-3.5 flex flex-col gap-2">
                            {['Client prefers async updates over calls', `Recent context: "${truncate(selected.latest.message, 50)}"`].map(m => (
                                <div key={m} className="flex items-start gap-2">
                                    <span className="w-[5px] h-[5px] rounded-full bg-voxly-violet flex-none mt-[6px]" />
                                    <span className="text-xs text-foreground/90 leading-relaxed">{m}</span>
                                </div>
                            ))}
                        </div>
                    </Panel>
                    <Panel title="Suggested Actions" defaultOpen={selected.status === 'Awaiting human'}>
                        <div className="px-3.5 pb-3.5 flex flex-col gap-2.5">
                            <div className="flex items-center gap-2.5">
                                <span className="flex-1 text-xs text-voxly-ink-6">Approve and send the drafted reply as-is</span>
                                <button className="w-[22px] h-[22px] rounded-md border border-voxly-ink-4 text-voxly-success flex items-center justify-center hover:bg-voxly-success-soft transition-colors flex-none"><Check className="w-3 h-3" /></button>
                                <button className="w-[22px] h-[22px] rounded-md border border-voxly-ink-4 text-voxly-ink-5 flex items-center justify-center hover:bg-voxly-surface-3 transition-colors flex-none"><XIcon className="w-2.5 h-2.5" /></button>
                            </div>
                        </div>
                    </Panel>
                    <Panel title="Linked Client" defaultOpen={false}>
                        <PanelRow label={selected.clientName} value={<Link href={`/clients/${selected.clientId}`} className="text-primary">View →</Link>} />
                    </Panel>
                </div>
            )}
        </div>
    );
}
