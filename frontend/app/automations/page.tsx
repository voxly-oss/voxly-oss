'use client';

import { Fragment, useState } from 'react';
import {
    Zap, Plus, Search, Sparkles, MoreVertical, Check, X as XIcon, AlertTriangle, Clock,
} from 'lucide-react';
import { Panel } from '@/components/SidePanel';
import { PreviewBanner } from '@/components/PreviewBadge';

// No automation/workflow engine exists on the backend yet — this entire page
// is illustrative UI matching the design, not real running workflows.
type AStatus = 'Active' | 'Scheduled' | 'Waiting' | 'Failed';
interface Automation {
    id: string; name: string; trigger: string; status: AStatus; successRate: string;
    agent: string; lastRun: string; nextRun: string; duration: string;
    conditions: string[]; actions: { n: number; text: string; warn?: boolean }[];
    approval?: string;
}

const STATUS_STYLE: Record<AStatus, string> = {
    Active: 'bg-voxly-success-soft text-voxly-success',
    Scheduled: 'bg-voxly-surface-3 text-voxly-ink-6',
    Waiting: 'bg-voxly-warning-soft text-voxly-warning',
    Failed: 'bg-voxly-heat-soft text-voxly-heat',
};
const STATUS_DOT: Record<AStatus, string> = {
    Active: 'bg-voxly-success', Scheduled: 'bg-voxly-ink-5', Waiting: 'bg-voxly-warning', Failed: 'bg-voxly-heat',
};

const AUTOMATIONS: Automation[] = [
    { id: 'a1', name: 'Weekly Client Digest', trigger: 'Schedule', status: 'Active', successRate: '98%', agent: 'Support', lastRun: '2h ago', nextRun: 'in 6d', duration: '4.2s', conditions: [], actions: [] },
    { id: 'a2', name: 'Deploy Health Check', trigger: 'Webhook', status: 'Active', successRate: '99%', agent: 'Deploy', lastRun: '20m ago', nextRun: 'on push', duration: '1.8s', conditions: [], actions: [] },
    { id: 'a3', name: 'Invoice Reminder', trigger: 'Schedule', status: 'Scheduled', successRate: '100%', agent: 'Support', lastRun: '28d ago', nextRun: 'in 2d', duration: '0.9s', conditions: [], actions: [] },
    { id: 'a4', name: 'Risk Check-in Draft', trigger: 'Event', status: 'Waiting', successRate: '94%', agent: 'Triage', lastRun: '3h ago', nextRun: '—', duration: '2.1s', conditions: [], actions: [] },
    {
        id: 'a5', name: 'Build Retry Handler', trigger: 'Event', status: 'Failed', successRate: '71%', agent: 'Deploy', lastRun: '40m ago', nextRun: 'manual', duration: '3.4s',
        conditions: ['build.status = "failed"', 'project.has_active_client = true'],
        actions: [
            { n: 1, text: 'Notify Deploy Agent with build logs' },
            { n: 2, text: 'Create a GitHub issue tagged build-failure' },
            { n: 3, text: 'Draft a client status update — held for human approval', warn: true },
        ],
        approval: 'Client status update for Studio Bloom is drafted and awaiting your approval before it sends.',
    },
    { id: 'a6', name: 'Contract Renewal Alert', trigger: 'Schedule', status: 'Active', successRate: '100%', agent: 'Triage', lastRun: '8h ago', nextRun: 'in 16h', duration: '1.1s', conditions: [], actions: [] },
    { id: 'a7', name: 'Onboarding Sequence', trigger: 'Event', status: 'Scheduled', successRate: '96%', agent: 'Support', lastRun: '12d ago', nextRun: '—', duration: '6.8s', conditions: [], actions: [] },
];

const TIMELINE = [
    { icon: AlertTriangle, color: 'text-voxly-heat', bar: 'bg-voxly-heat', heatBg: true, title: 'Run failed — bloom-site', sub: 'GitHub API timeout after 3 retries', tag: 'Failed', time: '40m', retry: true },
    { icon: Clock, color: 'text-voxly-warning', bar: 'bg-voxly-warning', title: 'Retry attempt 3 of 3', sub: 'bloom-site · failed, backoff exhausted', tag: 'Retry', time: '42m' },
    { icon: Clock, color: 'text-voxly-warning', bar: 'bg-voxly-warning', title: 'Retry attempt 2 of 3', sub: 'bloom-site · failed, retrying in 2m', tag: 'Retry', time: '55m' },
    { icon: Check, color: 'text-voxly-success', bar: 'bg-voxly-success', title: 'Run succeeded — checkout-api', sub: 'completed in 1.6s', tag: 'Success', time: '6h' },
];

export default function AutomationsPage() {
    const [statusFilter, setStatusFilter] = useState<'All' | AStatus>('All');
    const [selectedId, setSelectedId] = useState('a5');
    const selected = AUTOMATIONS.find(a => a.id === selectedId) ?? AUTOMATIONS[0];

    const counts = {
        active: AUTOMATIONS.filter(a => a.status === 'Active').length,
        scheduled: AUTOMATIONS.filter(a => a.status === 'Scheduled').length,
        waiting: AUTOMATIONS.filter(a => a.status === 'Waiting').length,
        failed: AUTOMATIONS.filter(a => a.status === 'Failed').length,
    };
    const filtered = statusFilter === 'All' ? AUTOMATIONS : AUTOMATIONS.filter(a => a.status === statusFilter);

    return (
        <div className="flex flex-col xl:flex-row gap-6 items-start">
            <div className="flex-1 min-w-0 w-full flex flex-col gap-[18px]">
                <div className="flex items-end justify-between gap-4 flex-wrap">
                    <div>
                        <h1 className="font-display font-bold text-[22px] text-foreground tracking-[-0.01em]">Automations</h1>
                        <p className="text-[13px] text-voxly-ink-6 mt-[3px]">{AUTOMATIONS.length} workflows · {counts.waiting} needs approval</p>
                    </div>
                    <button disabled title="Workflow builder isn't available yet" className="bg-primary/60 text-primary-foreground font-semibold text-[13px] rounded-lg px-4 py-[9px] flex items-center gap-[7px] cursor-not-allowed">
                        <Plus className="w-[15px] h-[15px]" /> New automation
                    </button>
                </div>

                <PreviewBanner>
                    <b className="font-semibold">Preview.</b> No automation/workflow engine exists yet. Every automation, run, and approval below is illustrative of where this is headed, not a real running workflow.
                </PreviewBanner>

                <div className="flex items-center gap-5 flex-wrap px-[18px] py-3.5 border border-border rounded-xl bg-card">
                    <div><span className="font-display font-bold text-[17px] text-voxly-success">{counts.active}</span><span className="text-[11.5px] text-voxly-ink-5 ml-1.5">active</span></div>
                    <div className="w-px h-4 bg-border" />
                    <div><span className="font-display font-bold text-[17px] text-foreground">{counts.scheduled}</span><span className="text-[11.5px] text-voxly-ink-5 ml-1.5">scheduled</span></div>
                    <div className="w-px h-4 bg-border" />
                    <div><span className="font-display font-bold text-[17px] text-voxly-warning">{counts.waiting}</span><span className="text-[11.5px] text-voxly-ink-5 ml-1.5">waiting</span></div>
                    <div className="w-px h-4 bg-border" />
                    <div><span className="font-display font-bold text-[17px] text-voxly-heat">{counts.failed}</span><span className="text-[11.5px] text-voxly-ink-5 ml-1.5">failed</span></div>
                    <div className="w-px h-4 bg-border" />
                    <div><span className="font-display font-bold text-[17px] text-foreground">94.7%</span><span className="text-[11.5px] text-voxly-ink-5 ml-1.5">success rate</span></div>
                    <div className="w-px h-4 bg-border" />
                    <div><span className="font-display font-bold text-[17px] text-foreground">2.9s</span><span className="text-[11.5px] text-voxly-ink-5 ml-1.5">avg runtime</span></div>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                    <div className="relative flex-1 max-w-[260px] min-w-[160px]">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-voxly-ink-5" />
                        <input placeholder="Search automations…" className="w-full h-9 pl-8 pr-3 text-[12.5px] bg-card border border-border rounded-lg text-foreground placeholder:text-voxly-ink-5 focus:outline-none focus:border-primary focus:ring-[3px] focus:ring-primary/15 transition-all" />
                    </div>
                    {(['All', 'Active', 'Waiting', 'Failed'] as const).map(f => (
                        <button
                            key={f}
                            onClick={() => setStatusFilter(f)}
                            className={`text-[11.5px] rounded-full px-[11px] py-[5px] transition-colors ${
                                statusFilter === f ? 'font-semibold text-primary-foreground bg-primary' : 'text-voxly-ink-6 border border-border hover:border-voxly-ink-4 hover:text-foreground'
                            }`}>
                            {f}
                        </button>
                    ))}
                    <div className="flex-1" />
                    <span className="flex items-center gap-1.5 text-[11.5px] text-voxly-ink-6 border border-border rounded-lg px-[11px] py-[5px] cursor-pointer hover:border-voxly-ink-4 hover:text-foreground transition-colors">
                        <Sparkles className="w-[13px] h-[13px]" /> Agent
                    </span>
                </div>

                <div className="border border-border rounded-[14px] bg-card overflow-hidden">
                    <div className="overflow-x-auto">
                    <div className="min-w-[760px]">
                        <div className="grid grid-cols-[2.75fr_0.95fr_1.2fr_1fr_0.7fr_0.7fr_0.5fr_28px] px-4 py-2.5 font-mono text-[10px] font-semibold tracking-[0.04em] uppercase text-voxly-ink-5 border-b border-border">
                            <div>Automation</div><div>Trigger</div><div>Status</div><div>Owner Agent</div><div>Last Run</div><div>Next Run</div><div>Duration</div><div />
                        </div>
                        {filtered.map(a => (
                            <button
                                key={a.id}
                                onClick={() => setSelectedId(a.id)}
                                className={`w-full grid grid-cols-[2.75fr_0.95fr_1.2fr_1fr_0.7fr_0.7fr_0.5fr_28px] px-4 py-3 items-center border-b border-border last:border-b-0 text-left transition-colors ${
                                    a.id === selectedId ? 'bg-voxly-surface-2' : a.status === 'Failed' ? 'bg-voxly-heat-soft hover:bg-voxly-heat-soft/70' : 'hover:bg-white/[0.02]'
                                }`}
                            >
                                <div className="flex items-center gap-2.5 min-w-0">
                                    <div className="w-[26px] h-[26px] rounded-[7px] bg-voxly-surface-3 flex items-center justify-center text-voxly-ink-6 flex-none">
                                        <Zap className="w-3.5 h-3.5" />
                                    </div>
                                    <span className="text-[13px] font-semibold text-foreground truncate">{a.name}</span>
                                </div>
                                <div className="text-[11.5px] text-voxly-ink-6">{a.trigger}</div>
                                <div className="flex flex-col gap-[3px] items-start">
                                    <span className={`inline-flex items-center gap-[5px] text-[11px] font-semibold rounded-full pl-1.5 pr-2 py-[3px] whitespace-nowrap ${STATUS_STYLE[a.status]}`}>
                                        <span className={`w-[5px] h-[5px] rounded-full flex-none ${STATUS_DOT[a.status]}`} />{a.status}
                                    </span>
                                    <span className="text-[9.5px] text-voxly-ink-5">{a.successRate} success</span>
                                </div>
                                <div className="flex items-center gap-1.5 min-w-0">
                                    <Sparkles className="w-2.5 h-2.5 text-voxly-violet flex-none" />
                                    <span className="text-xs text-foreground/90 truncate">{a.agent}</span>
                                </div>
                                <div className={`text-xs whitespace-nowrap ${a.status === 'Failed' ? 'text-voxly-heat' : 'text-voxly-ink-5'}`}>{a.lastRun}</div>
                                <div className="text-xs text-voxly-ink-5 whitespace-nowrap">{a.nextRun}</div>
                                <div className="text-xs text-foreground whitespace-nowrap">{a.duration}</div>
                                <MoreVertical className="w-4 h-4 text-voxly-ink-5" />
                            </button>
                        ))}
                    </div>
                    </div>
                </div>
                <span className="text-xs text-voxly-ink-5">Showing {filtered.length} of {AUTOMATIONS.length} automations</span>

                {/* Selected automation */}
                <div className="flex items-center gap-2.5 pt-2 border-t border-border">
                    <span className="font-mono text-[9.5px] font-bold uppercase tracking-wider text-voxly-ink-5">Selected automation</span>
                </div>
                <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="flex gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-[11px] bg-voxly-surface-3 flex items-center justify-center flex-none">
                            <Zap className="w-[18px] h-[18px] text-voxly-ink-6" />
                        </div>
                        <div className="min-w-0">
                            <div className="flex items-center gap-2.5">
                                <span className="font-display font-bold text-[22px] text-foreground tracking-[-0.01em] truncate">{selected.name}</span>
                                <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold rounded-full pl-1.5 pr-2.5 py-[3px] whitespace-nowrap flex-none ${STATUS_STYLE[selected.status]}`}>
                                    <span className={`w-[5px] h-[5px] rounded-full ${STATUS_DOT[selected.status]}`} />{selected.status}
                                </span>
                            </div>
                            <div className="text-[12.5px] text-voxly-ink-6 mt-1">Owner: {selected.agent} Agent · success rate {selected.successRate}</div>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 flex-none">
                        <button className="font-semibold text-[13px] text-voxly-ink-6 hover:text-foreground border border-border hover:border-voxly-ink-4 rounded-lg px-3.5 py-2 transition-colors whitespace-nowrap">Pause</button>
                        <button className="font-semibold text-[13px] bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg px-3.5 py-2 transition-colors whitespace-nowrap">Retry now</button>
                    </div>
                </div>

                <div className="flex items-center gap-[22px] px-[18px] py-3.5 border border-border rounded-xl bg-card flex-wrap">
                    <div><span className="font-display font-bold text-[15px] text-foreground">{selected.trigger}</span><span className="text-[11.5px] text-voxly-ink-5 ml-1.5">trigger</span></div>
                    <div className="w-px h-4 bg-border" />
                    <div><span className={`font-display font-bold text-[15px] ${selected.status === 'Failed' ? 'text-voxly-heat' : 'text-foreground'}`}>{selected.lastRun}</span><span className="text-[11.5px] text-voxly-ink-5 ml-1.5">last run</span></div>
                    <div className="w-px h-4 bg-border" />
                    <div><span className="font-display font-bold text-[15px] text-foreground">{selected.nextRun}</span><span className="text-[11.5px] text-voxly-ink-5 ml-1.5">next run</span></div>
                    <div className="w-px h-4 bg-border" />
                    <div><span className={`font-display font-bold text-[15px] ${selected.status === 'Failed' ? 'text-voxly-heat' : 'text-foreground'}`}>{selected.successRate}</span><span className="text-[11.5px] text-voxly-ink-5 ml-1.5">success rate</span></div>
                    <div className="w-px h-4 bg-border" />
                    <div><span className="font-display font-bold text-[15px] text-foreground">{selected.duration}</span><span className="text-[11.5px] text-voxly-ink-5 ml-1.5">avg duration</span></div>
                </div>

                {selected.conditions.length > 0 && (
                    <div className="border border-border rounded-xl bg-card px-[18px] py-4">
                        <div className="font-mono text-[9.5px] font-bold tracking-[0.07em] text-voxly-ink-5 mb-2.5">CONDITIONS</div>
                        <div className="flex items-center gap-2 flex-wrap mb-4">
                            {selected.conditions.map((c, i) => (
                                <Fragment key={c}>
                                    {i > 0 && <span className="text-[10.5px] text-voxly-ink-5">AND</span>}
                                    <span className="font-mono text-[11px] text-voxly-ink-6 bg-voxly-surface-2 border border-border rounded-md px-2.5 py-1">{c}</span>
                                </Fragment>
                            ))}
                        </div>
                        <div className="font-mono text-[9.5px] font-bold tracking-[0.07em] text-voxly-ink-5 mb-2.5">ACTIONS</div>
                        <div className="flex flex-col gap-2">
                            {selected.actions.map(a => (
                                <div key={a.n} className="text-[12.5px] leading-relaxed">
                                    <b className={`font-semibold mr-1 ${a.warn ? 'text-voxly-warning' : 'text-voxly-ink-5'}`}>{a.n}.</b>
                                    <span className={a.warn ? 'text-voxly-warning' : 'text-foreground/90'}>{a.text}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {selected.approval && (
                    <div className="rounded-xl border border-voxly-warning/30 bg-voxly-warning-soft px-[18px] py-3.5">
                        <div className="font-mono text-[9.5px] font-bold tracking-[0.07em] text-voxly-warning mb-2.5">APPROVAL CHECKPOINT</div>
                        <div className="flex items-center gap-2.5">
                            <span className="flex-1 text-[12.5px] text-foreground/90 leading-relaxed">{selected.approval}</span>
                            <button className="w-[26px] h-[26px] rounded-[7px] border border-voxly-ink-4 text-voxly-success flex items-center justify-center hover:bg-voxly-success-soft transition-colors flex-none"><Check className="w-3.5 h-3.5" /></button>
                            <button className="w-[26px] h-[26px] rounded-[7px] border border-voxly-ink-4 text-voxly-ink-5 flex items-center justify-center hover:bg-voxly-surface-3 transition-colors flex-none"><XIcon className="w-3 h-3" /></button>
                        </div>
                    </div>
                )}

                <div className="flex items-center gap-4">
                    <span className="font-display font-semibold text-[15px] text-foreground">Execution Timeline</span>
                    <a href="#" className="text-xs">View full logs →</a>
                </div>
                <div className="border border-border rounded-[14px] bg-card overflow-hidden">
                    <div className="px-4 py-2 bg-voxly-surface-2 font-mono text-[9.5px] font-bold tracking-[0.07em] text-voxly-ink-5">TODAY</div>
                    {TIMELINE.map((item, i) => (
                        <div key={i} className={`flex items-center gap-3 px-4 py-[11px] border-b border-border last:border-b-0 hover:bg-white/[0.02] transition-colors ${item.heatBg ? 'bg-voxly-heat-soft' : ''}`}>
                            <span className={`w-[3px] h-7 rounded-sm flex-none ${item.bar}`} />
                            <span className={`w-7 h-7 rounded-lg bg-voxly-surface-2 flex items-center justify-center flex-none ${item.color}`}>
                                <item.icon className="w-3.5 h-3.5" />
                            </span>
                            <div className="flex-1 min-w-0">
                                <div className="text-[13px] text-foreground font-medium truncate">{item.title}</div>
                                <div className="text-[11.5px] text-voxly-ink-5 truncate">{item.sub}</div>
                            </div>
                            <span className="text-[9.5px] uppercase tracking-wide text-voxly-ink-5 flex-none">{item.tag}</span>
                            {item.retry && <a href="#" className="text-[11.5px] flex-none">Retry</a>}
                            <span className="font-mono text-[11px] text-voxly-ink-5 flex-none w-7 text-right">{item.time}</span>
                        </div>
                    ))}
                </div>
            </div>

            <div className="w-full xl:w-80 flex-none flex flex-col gap-3.5">
                <Panel title="Health">
                    <div className="px-3.5 pb-3.5 flex flex-col gap-[9px]">
                        {[
                            { label: 'Success rate', dot: selected.status === 'Failed' ? 'bg-voxly-heat' : 'bg-voxly-success', value: selected.successRate },
                            { label: 'Avg duration', dot: 'bg-voxly-success', value: selected.duration },
                            { label: 'Last failure', dot: 'bg-voxly-heat', value: selected.status === 'Failed' ? selected.lastRun : '—' },
                        ].map(r => (
                            <div key={r.label} className="flex items-center gap-2">
                                <span className={`w-[7px] h-[7px] rounded-full flex-none ${r.dot}`} />
                                <span className="flex-1 text-xs text-voxly-ink-6">{r.label}</span>
                                <span className="text-xs font-semibold text-foreground">{r.value}</span>
                            </div>
                        ))}
                    </div>
                </Panel>
                <Panel title="Recent Failures" badge={<span className="text-[10.5px] bg-voxly-heat-soft text-voxly-heat px-[7px] py-[1px] rounded-full">3</span>}>
                    <div className="px-3.5 pb-3 flex flex-col gap-2">
                        {['GitHub API timeout — bloom-site, 40m ago', 'Rate limit exceeded — bloom-site, 1d ago', 'Webhook signature mismatch, 3d ago'].map(f => (
                            <div key={f} className="flex items-start gap-2">
                                <AlertTriangle className="w-3 h-3 text-voxly-heat flex-none mt-0.5" />
                                <span className="text-xs text-foreground/90 leading-relaxed">{f}</span>
                            </div>
                        ))}
                    </div>
                </Panel>
                <Panel title="Pending Approvals" badge={<span className="text-[10.5px] bg-voxly-warning-soft text-voxly-warning px-[7px] py-[1px] rounded-full">{counts.waiting}</span>}>
                    <div className="px-3.5 pb-3 flex items-start gap-2">
                        <AlertTriangle className="w-3 h-3 text-voxly-warning flex-none mt-0.5" />
                        <span className="text-xs text-foreground/90 leading-relaxed">Client status update — Studio Bloom, drafted 21m ago</span>
                    </div>
                </Panel>
                <Panel title="Dependencies" defaultOpen={false}>
                    <div className="text-[10px] text-voxly-ink-5 uppercase tracking-wider px-3.5 pt-2.5 pb-1">Linked clients</div>
                    <div className="flex items-center gap-2 px-3.5 py-1.5">
                        <span className="flex-1 text-[11.5px] text-foreground">Studio Bloom</span>
                        <span className="font-display font-bold text-[11.5px] text-voxly-warning">64</span>
                    </div>
                    <div className="text-[10px] text-voxly-ink-5 uppercase tracking-wider px-3.5 pt-2.5 pb-1">Linked projects</div>
                    <div className="flex items-center gap-2 px-3.5 py-1.5 pb-3">
                        <span className="flex-1 font-mono text-[11.5px] text-foreground">bloom-site</span>
                        <span className="inline-flex items-center gap-1 text-[10.5px] font-semibold rounded-full pl-1.5 pr-2 py-[2px] bg-voxly-heat-soft text-voxly-heat">
                            <span className="w-[5px] h-[5px] rounded-full bg-voxly-heat" />Blocked
                        </span>
                    </div>
                </Panel>
            </div>
        </div>
    );
}
