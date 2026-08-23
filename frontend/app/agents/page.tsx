'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
    Sparkles, ChevronRight, Plus, Code2, MessageSquare, Zap, AlertTriangle,
    Check, Users, FileText,
} from 'lucide-react';
import { Panel, PanelRow, PanelText } from '@/components/SidePanel';
import { PreviewBanner } from '@/components/PreviewBadge';

// This app has a single real AI chat endpoint, not a multi-agent orchestration
// platform. Everything on this page — the agent roster, fleet metrics,
// reasoning traces, and execution timeline — is illustrative UI matching the
// design, not a real running fleet. The "Test" action below links to the
// one real, working chat interface at /chat.
const AGENTS = [
    {
        id: 'support', name: 'Support Agent', model: 'gpt-4o',
        desc: 'Handles client WhatsApp & email replies',
        channels: ['WhatsApp', 'Telegram', 'Email'],
        success: '97.2%', cost: '$142', latency: '1.6s', queued: 0,
        assignedProjects: 11, promptVersion: 'Support v4', deployVersion: 'v12 · Jul 20', testStatus: 'passing · 2h ago',
        errorRate: '2.8%', tokens: '480K',
        trace: [
            { n: 1, text: 'Received WhatsApp message from Studio Bloom: "any update on the launch date?"' },
            { n: 2, tool: 'get_project_status(project="bloom-site")', result: 'blocked, 2 failed builds', meta: 'success · 210ms · cached · 1.8 KB · GitHub' },
            { n: 3, tool: 'get_deploy_logs(project="bloom-site")', result: 'dependency conflict, build #482', meta: 'success · 380ms · miss · 4.2 KB · GitHub' },
            { n: 4, text: 'Drafted a reply citing the blocker and an ETA once the build is fixed' },
            { n: 5, text: 'Held for human review — sentiment-sensitive client, not auto-sent', warn: true },
        ],
        confidence: '92%', risk: 'Low',
    },
    {
        id: 'deploy', name: 'Deploy Agent', model: 'gpt-4o',
        desc: 'Watches CI, ships & verifies deploys',
        channels: ['GitHub', 'Email'],
        success: '99.1%', cost: '$86', latency: '2.4s', queued: 1,
        assignedProjects: 7, promptVersion: 'Deploy v2', deployVersion: 'v8 · Jul 12', testStatus: 'passing · 5h ago',
        errorRate: '0.9%', tokens: '210K',
        trace: [
            { n: 1, text: 'CI webhook received: checkout-api build #491 passed all checks' },
            { n: 2, tool: 'run_deploy(project="checkout-api", env="production")', result: 'deployed successfully', meta: 'success · 1.2s · miss · 0.4 KB · GitHub' },
            { n: 3, text: 'Posted deploy confirmation to #checkout-api and notified Acme Co' },
        ],
        confidence: '98%', risk: 'Low',
    },
    {
        id: 'triage', name: 'Triage Agent', model: 'gpt-4o-mini',
        desc: 'Flags risk, drafts proactive check-ins',
        channels: ['WhatsApp', 'Email', 'GitHub'],
        success: '94.8%', cost: '$58', latency: '1.1s', queued: 0,
        assignedProjects: 4, promptVersion: 'Triage v3', deployVersion: 'v5 · Jun 30', testStatus: 'passing · 1d ago',
        errorRate: '3.4%', tokens: '96K',
        trace: [
            { n: 1, text: 'Nightly scan: Nomad Labs quiet 6 days, no scheduled check-ins' },
            { n: 2, tool: 'get_client_health(client="Nomad Labs")', result: 'health 91, no open blockers', meta: 'success · 160ms · cached · 0.9 KB · Internal' },
            { n: 3, text: 'Drafted a proactive check-in message, queued for owner approval' },
        ],
        confidence: '84%', risk: 'Low',
    },
];

interface ExecutionItem {
    icon: typeof Check; color: string; bar: string; title: string; sub: string; tag: string; time: string;
    dot?: boolean; mono?: boolean; heatBg?: boolean; retry?: boolean;
}
const EXECUTIONS: { group: string; items: ExecutionItem[] }[] = [
    { group: 'JUST NOW', items: [
        { icon: Check, color: 'text-voxly-success', bar: 'bg-voxly-success', title: 'Replied to Acme Co', sub: 'Confirmed the refund flow fix is live', tag: 'Execution', dot: true, time: '2m' },
        { icon: Code2, color: 'text-voxly-ink-6', bar: 'bg-voxly-success', title: 'get_invoice_status(client="Acme Co")', sub: '340ms · cached · 3.1 KB · Stripe', tag: 'Tool call', time: '6m', mono: true },
        { icon: MessageSquare, color: 'text-voxly-ink-6', bar: 'bg-primary', title: 'Nomad Labs', sub: '"when will this ship?" · awaiting reply', tag: 'Conversation', dot: true, time: '12m' },
    ]},
    { group: 'EARLIER TODAY', items: [
        { icon: AlertTriangle, color: 'text-voxly-heat', bar: 'bg-voxly-heat', title: 'Failed to parse attachment', sub: 'Bright Path Legal · retry available', tag: 'Failed', time: '40m', heatBg: true, retry: true },
        { icon: Zap, color: 'text-voxly-violet', bar: 'bg-voxly-violet', title: 'Daily digest generated', sub: 'Sent to 11 clients · 0 failures', tag: 'Automation', time: '1h' },
        { icon: Users, color: 'text-voxly-ink-6', bar: 'bg-voxly-ink-4', title: 'Ravin Kumar took over a conversation', sub: 'Kessler & Vance · flagged as sensitive', tag: 'Takeover', time: '3h' },
    ]},
];

export default function AgentsPage() {
    const [selectedId, setSelectedId] = useState('support');
    const agent = AGENTS.find(a => a.id === selectedId)!;
    const totalCost = AGENTS.reduce((sum, a) => sum + parseFloat(a.cost.replace('$', '')), 0);
    const avgSuccess = (AGENTS.reduce((sum, a) => sum + parseFloat(a.success), 0) / AGENTS.length).toFixed(1);

    return (
        <div className="flex flex-col xl:flex-row gap-6 items-start">
            <div className="flex-1 min-w-0 w-full flex flex-col gap-[18px]">
                <div className="flex items-end justify-between gap-4 flex-wrap">
                    <div>
                        <h1 className="font-display font-bold text-[22px] text-foreground tracking-[-0.01em]">AI Agents</h1>
                        <p className="text-[13px] text-voxly-ink-6 mt-[3px]">{AGENTS.length} agents · ${totalCost.toFixed(0)}/mo · {avgSuccess}% fleet success rate</p>
                    </div>
                    <button disabled title="Multi-agent configuration isn't available yet" className="bg-primary/60 text-primary-foreground font-semibold text-[13px] rounded-lg px-4 py-[9px] flex items-center gap-[7px] cursor-not-allowed">
                        <Plus className="w-[15px] h-[15px]" /> New agent
                    </button>
                </div>

                <PreviewBanner>
                    <b className="font-semibold">Preview.</b> Voxly runs a single AI chat agent today, not a multi-agent fleet. Everything below — the roster, metrics, reasoning traces, and executions — is illustrative of where this is headed, not live data.
                </PreviewBanner>

                {/* Fleet Operations */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
                    <div className="border border-border rounded-xl bg-card px-4 py-3.5">
                        <div className="font-mono text-[9.5px] font-bold uppercase tracking-wider text-voxly-ink-5 mb-2.5">Fleet Health</div>
                        <div className="flex flex-col gap-[7px]">
                            <PanelRow dot="bg-voxly-success" label="Healthy" value={3} />
                            <PanelRow dot="bg-voxly-violet" label="Busy" value={0} />
                            <PanelRow dot="bg-voxly-heat" label="Failed" value={0} />
                        </div>
                        <div className="flex items-center gap-2 mt-2.5 pt-2.5 border-t border-border">
                            <span className="flex-1 text-[12.5px] text-voxly-ink-6">Avg response</span>
                            <span className="font-display font-bold text-[13px] text-foreground">1.7s</span>
                        </div>
                    </div>
                    <div className="border border-border rounded-xl bg-card px-4 py-3.5">
                        <div className="font-mono text-[9.5px] font-bold uppercase tracking-wider text-voxly-ink-5 mb-2.5">Cost Trend</div>
                        <div className="flex flex-col gap-[7px]">
                            <PanelRow label="Today" value="$12.40" />
                            <PanelRow label="Yesterday" value="$11.80" />
                            <PanelRow label="This week" value="$68.20" />
                        </div>
                        <div className="flex items-center gap-2 mt-2.5 pt-2.5 border-t border-border">
                            <span className="flex-1 text-[12.5px] text-voxly-ink-6">Forecast (mo)</span>
                            <span className="font-display font-bold text-[13px] text-voxly-violet">${totalCost.toFixed(0)}</span>
                        </div>
                    </div>
                    <div className="border border-border rounded-xl bg-card px-4 py-3.5">
                        <div className="font-mono text-[9.5px] font-bold uppercase tracking-wider text-voxly-ink-5 mb-2.5">Queue Depth</div>
                        <div className="flex gap-[3px] mb-3">
                            {[1, 1, 1, 0, 0, 0, 0, 0].map((on, i) => (
                                <div key={i} className={`flex-1 h-2 rounded-sm ${on ? 'bg-primary' : 'bg-voxly-surface-3'}`} />
                            ))}
                        </div>
                        <div className="flex flex-col gap-[7px]">
                            <PanelRow label="Current" value={AGENTS.reduce((s, a) => s + a.queued, 0)} />
                            <PanelRow label="Peak (today)" value={3} />
                            <PanelRow label="Average" value="0.6" />
                        </div>
                    </div>
                </div>

                {/* Agent Roster */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
                    {AGENTS.map(a => {
                        const isSelected = a.id === selectedId;
                        return (
                            <button
                                key={a.id}
                                onClick={() => setSelectedId(a.id)}
                                className={`text-left min-w-0 rounded-xl p-4 transition-colors ${
                                    isSelected
                                        ? 'border-l-[3px] border-t border-r border-b border-primary bg-voxly-surface-2'
                                        : 'border border-border bg-card hover:bg-voxly-surface-2'
                                }`}
                            >
                                <div className="h-[14px] mb-0.5">
                                    {isSelected && <span className="text-[9.5px] font-bold uppercase tracking-wider text-primary">Selected</span>}
                                </div>
                                <div className="flex items-center gap-[9px] mb-1.5">
                                    <div className="w-[26px] h-[26px] rounded-lg bg-voxly-violet-soft flex items-center justify-center flex-none">
                                        <Sparkles className="w-3.5 h-3.5 text-voxly-violet" />
                                    </div>
                                    <span className="font-display font-bold text-sm text-foreground flex-1 truncate">{a.name}</span>
                                    <span className="w-[7px] h-[7px] rounded-full bg-voxly-success flex-none" />
                                </div>
                                <div className="font-mono text-[9.5px] text-voxly-ink-5 mb-1">{a.model}</div>
                                <div className="text-[11.5px] text-voxly-ink-6 leading-tight mb-2 min-h-[31px]">{a.desc}</div>
                                <div className="flex gap-[5px] flex-wrap mb-3">
                                    {a.channels.map(ch => (
                                        <span key={ch} className="text-[9px] text-voxly-ink-6 border border-border rounded-[5px] px-1.5 py-0.5">{ch}</span>
                                    ))}
                                </div>
                                <div className="grid grid-cols-2 gap-2.5 pt-3 border-t border-border">
                                    <div><div className="font-display font-bold text-sm text-voxly-success tabular-nums">{a.success}</div><div className="text-[9.5px] text-voxly-ink-5">success</div></div>
                                    <div><div className="font-display font-bold text-sm text-foreground tabular-nums">{a.cost}</div><div className="text-[9.5px] text-voxly-ink-5">cost / mo</div></div>
                                    <div><div className="font-display font-bold text-sm text-foreground tabular-nums">{a.latency}</div><div className="text-[9.5px] text-voxly-ink-5">latency</div></div>
                                    <div><div className={`font-display font-bold text-sm tabular-nums ${a.queued > 0 ? 'text-voxly-warning' : 'text-foreground'}`}>{a.queued}</div><div className="text-[9.5px] text-voxly-ink-5">queued</div></div>
                                </div>
                            </button>
                        );
                    })}
                </div>

                {/* Agent Workspace */}
                <div className="flex items-center gap-2.5 pt-2 border-t border-border">
                    <span className="font-mono text-[9.5px] font-bold uppercase tracking-wider text-voxly-ink-5">Agent workspace</span>
                </div>
                <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="flex gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-[11px] bg-voxly-violet-soft flex items-center justify-center flex-none">
                            <Sparkles className="w-[19px] h-[19px] text-voxly-violet" />
                        </div>
                        <div className="min-w-0">
                            <div className="flex items-center gap-2.5">
                                <span className="font-display font-bold text-[22px] text-foreground tracking-[-0.01em] truncate">{agent.name}</span>
                                <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold rounded-full pl-1.5 pr-2.5 py-[3px] bg-voxly-success-soft text-voxly-success flex-none">
                                    <span className="w-[5px] h-[5px] rounded-full bg-voxly-success" />Running
                                </span>
                            </div>
                            <div className="text-[12.5px] text-voxly-ink-6 mt-1">{agent.desc} · assigned to {agent.assignedProjects} projects</div>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 flex-none">
                        <Link href="/chat" className="font-semibold text-[13px] text-voxly-ink-6 hover:text-foreground border border-border hover:border-voxly-ink-4 rounded-lg px-3.5 py-2 transition-colors whitespace-nowrap">
                            Test
                        </Link>
                        <button className="font-semibold text-[13px] bg-secondary hover:bg-accent text-foreground border border-voxly-ink-4 rounded-lg px-3.5 py-2 transition-colors whitespace-nowrap">
                            Pause
                        </button>
                    </div>
                </div>

                <div className="flex items-center gap-[22px] px-[18px] py-3.5 border border-border rounded-xl bg-card flex-wrap">
                    <div><span className="font-mono font-bold text-[15px] text-foreground">{agent.model}</span><span className="text-[11.5px] text-voxly-ink-5 ml-1.5">model</span></div>
                    <div className="w-px h-4 bg-border" />
                    <div><span className="font-mono font-bold text-[15px] text-foreground">{agent.deployVersion.split(' · ')[0]}</span><span className="text-[11.5px] text-voxly-ink-5 ml-1.5">· {agent.deployVersion.split(' · ')[1]}</span></div>
                    <div className="w-px h-4 bg-border" />
                    <div><span className="font-mono font-bold text-[15px] text-foreground">{agent.promptVersion}</span><span className="text-[11.5px] text-voxly-ink-5 ml-1.5">prompt</span></div>
                    <div className="w-px h-4 bg-border" />
                    <div><span className="font-display font-bold text-[15px] text-voxly-success">Production</span><span className="text-[11.5px] text-voxly-ink-5 ml-1.5">deployment</span></div>
                    <div className="w-px h-4 bg-border" />
                    <div><span className="font-display font-bold text-[15px] text-voxly-success">{agent.testStatus.split(' · ')[0]}</span><span className="text-[11.5px] text-voxly-ink-5 ml-1.5">tested {agent.testStatus.split(' · ')[1]}</span></div>
                </div>

                {/* Reasoning trace */}
                <details open className="border border-border rounded-xl bg-card overflow-hidden">
                    <summary className="flex items-center gap-2 px-4 py-3 list-none cursor-pointer select-none [&::-webkit-details-marker]:hidden">
                        <ChevronRight className="w-3.5 h-3.5 text-voxly-ink-5" />
                        <Sparkles className="w-3.5 h-3.5 text-voxly-violet" />
                        <span className="text-[13px] font-semibold text-foreground flex-1">Reasoning — last execution</span>
                        <span className="font-mono text-[11px] text-voxly-ink-5">2m ago</span>
                    </summary>
                    <div className="px-4 pb-4 pl-[41px] flex flex-col gap-2.5">
                        {agent.trace.map(step => (
                            <div key={step.n} className="flex items-start gap-2">
                                <b className="text-voxly-ink-5 text-[12.5px] font-semibold flex-none">{step.n}.</b>
                                {step.tool ? (
                                    <div className="flex-1 min-w-0">
                                        <span className="inline-flex items-center gap-1.5 font-mono text-[11px] text-voxly-ink-6 bg-voxly-surface-2 border border-border rounded-md px-2.5 py-1">
                                            <Code2 className="w-3 h-3" />{step.tool} → {step.result}
                                        </span>
                                        <div className="flex gap-2.5 mt-1 pl-0.5 text-[10px] text-voxly-ink-5">{step.meta}</div>
                                    </div>
                                ) : (
                                    <span className={`text-[12.5px] leading-relaxed ${step.warn ? 'text-voxly-warning' : 'text-foreground/90'}`}>{step.text}</span>
                                )}
                            </div>
                        ))}
                        <div className="flex items-center gap-[22px] mt-0.5 pt-3 border-t border-border">
                            <div><span className="text-[11px] text-voxly-ink-5">Confidence</span><span className="font-display font-bold text-[13px] text-voxly-success ml-[7px]">{agent.confidence}</span></div>
                            <div><span className="text-[11px] text-voxly-ink-5">Risk</span><span className="font-display font-bold text-[13px] text-voxly-success ml-[7px]">{agent.risk}</span></div>
                        </div>
                    </div>
                </details>

                {/* Executions */}
                <div className="flex items-center gap-4 flex-wrap">
                    <span className="font-display font-semibold text-[15px] text-foreground">Executions</span>
                    <a href="#" className="text-xs">View full logs →</a>
                    <div className="flex-1" />
                    <div className="flex gap-1.5 flex-wrap">
                        {['All', 'Conversations', 'Tool calls', 'Failed', 'Automations'].map((f, i) => (
                            <span key={f} className={`text-[11.5px] rounded-full px-[11px] py-[5px] ${i === 0 ? 'font-semibold text-primary-foreground bg-primary' : 'text-voxly-ink-6 border border-border cursor-pointer hover:border-voxly-ink-4 hover:text-foreground transition-colors'}`}>{f}</span>
                        ))}
                    </div>
                </div>
                <div className="border border-border rounded-[14px] bg-card overflow-hidden">
                    {EXECUTIONS.map(group => (
                        <div key={group.group}>
                            <div className="px-4 py-2 bg-voxly-surface-2 font-mono text-[9.5px] font-bold tracking-[0.07em] text-voxly-ink-5">{group.group}</div>
                            {group.items.map((item, i) => (
                                <div key={i} className={`flex items-center gap-3 px-4 py-[11px] border-b border-border last:border-b-0 hover:bg-white/[0.02] transition-colors ${item.heatBg ? 'bg-voxly-heat-soft' : ''}`}>
                                    <span className={`w-[3px] h-7 rounded-sm flex-none ${item.bar}`} />
                                    <span className={`w-7 h-7 rounded-lg bg-voxly-surface-2 flex items-center justify-center flex-none ${item.color}`}>
                                        <item.icon className="w-3.5 h-3.5" />
                                    </span>
                                    <div className="flex-1 min-w-0">
                                        <div className={`text-[13px] text-foreground truncate ${item.mono ? 'font-mono' : 'font-medium'}`}>{item.title}</div>
                                        <div className="text-[11.5px] text-voxly-ink-5 truncate">{item.sub}</div>
                                    </div>
                                    <span className="text-[9.5px] uppercase tracking-wide text-voxly-ink-5 flex-none">{item.tag}</span>
                                    {item.retry && <a href="#" className="text-[11.5px] flex-none">Retry</a>}
                                    {item.dot && <span className="w-1.5 h-1.5 rounded-full bg-primary flex-none" />}
                                    <span className="font-mono text-[11px] text-voxly-ink-5 flex-none w-7 text-right">{item.time}</span>
                                </div>
                            ))}
                        </div>
                    ))}
                </div>
            </div>

            {/* Right column */}
            <div className="w-full xl:w-80 flex-none flex flex-col gap-3.5">
                <Panel title="Health & Performance">
                    <PanelRow dot="bg-voxly-success" label="Success rate" value={agent.success} />
                    <PanelRow dot="bg-voxly-success" label="Avg latency" value={agent.latency} />
                    <PanelRow dot="bg-voxly-warning" label="Error rate" value={agent.errorRate} />
                    <PanelRow dot="bg-voxly-ink-5" label="Tokens this month" value={agent.tokens} />
                </Panel>

                <Panel title="Memory & Knowledge">
                    <div className="px-3.5 pb-2.5 flex flex-col gap-2">
                        {['Client prefers async updates over calls', 'Primary contact: Maya Chen (PM)'].map(m => (
                            <div key={m} className="flex items-start gap-2">
                                <span className="w-[5px] h-[5px] rounded-full bg-voxly-violet flex-none mt-[6px]" />
                                <span className="text-xs text-foreground/90 leading-relaxed">{m}</span>
                            </div>
                        ))}
                    </div>
                    <div className="pt-1 border-t border-border">
                        <div className="text-[10px] text-voxly-ink-5 uppercase tracking-wider px-3.5 pt-2 pb-0.5">Knowledge sources</div>
                        <PanelRow label={<span className="flex items-center gap-1.5"><FileText className="w-3 h-3" />Project docs</span>} value="24 files" />
                        <PanelRow label={<span className="flex items-center gap-1.5"><MessageSquare className="w-3 h-3" />Conversation history</span>} value="90 days" />
                        <PanelRow label={<span className="flex items-center gap-1.5"><Users className="w-3 h-3" />Client preferences</span>} value="synced" />
                    </div>
                </Panel>

                <Panel title="Connected Channels">
                    {agent.channels.map((ch, i) => (
                        <PanelRow key={ch} dot={i === agent.channels.length - 1 ? 'bg-voxly-ink-5' : 'bg-voxly-success'} label={ch} value={i === agent.channels.length - 1 ? 'read-only' : 'connected'} />
                    ))}
                </Panel>

                <Panel title="Human Takeover" badge={<span className="text-[10.5px] bg-voxly-heat-soft text-voxly-heat px-[7px] py-[1px] rounded-full">2</span>}>
                    <div className="px-3.5 pb-3 flex flex-col gap-2.5">
                        {[
                            { name: 'Kessler & Vance', waiting: '12m', color: 'text-voxly-heat' },
                            { name: 'Studio Bloom', waiting: '4m', color: 'text-voxly-ink-6' },
                        ].map(t => (
                            <div key={t.name}>
                                <div className="flex items-center gap-2"><AlertTriangle className="w-3 h-3 text-voxly-heat flex-none" /><span className="flex-1 text-xs text-foreground/90">{t.name}</span></div>
                                <div className="flex items-center gap-3.5 mt-1 pl-5 text-[10.5px] text-voxly-ink-5">
                                    <span>Waiting <b className={`font-bold ${t.color}`}>{t.waiting}</b></span><span>SLA 15m</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </Panel>

                <Panel title="Testing & Deployment" defaultOpen={false}>
                    <PanelRow dot="bg-voxly-success" label="Deployment" value="Production" />
                    <PanelRow dot="bg-voxly-ink-5" label="Version" value={<span className="font-mono font-normal">{agent.deployVersion}</span>} />
                    <PanelRow dot="bg-voxly-success" label="Last test run" value={agent.testStatus} />
                    <PanelText><a href="#">Run test suite →</a></PanelText>
                </Panel>
            </div>
        </div>
    );
}
