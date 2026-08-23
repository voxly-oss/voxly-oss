'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { clientsAPI, projectsAPI, dashboardAPI } from '@/lib/api';
import { Download } from 'lucide-react';
import Link from 'next/link';
import { Panel, PanelRow, PanelText } from '@/components/SidePanel';
import PreviewBadge, { PreviewBanner, PreviewMark } from '@/components/PreviewBadge';

type DashboardStats = {
    total_clients: number; active_clients: number; total_projects: number; active_projects: number;
    total_messages: number; messages_this_month: number; ai_accuracy: number;
};

function Sparkline({ points, color, width = 52, height = 22 }: { points: string; color: string; width?: number; height?: number }) {
    return (
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="flex-none">
            <polyline points={points} fill="none" stroke={color} strokeWidth="1.8" />
        </svg>
    );
}

const RANGES = ['7D', '30D', '90D', 'Custom'] as const;

export default function AnalyticsPage() {
    const [range, setRange] = useState<typeof RANGES[number]>('30D');

    const { data: clients = [] } = useQuery({ queryKey: ['clients'], queryFn: async () => (await clientsAPI.list()).data });
    const { data: projects = [] } = useQuery({ queryKey: ['projects'], queryFn: async () => (await projectsAPI.list()).data });
    const { data: stats } = useQuery({
        queryKey: ['dashboard-stats'],
        queryFn: async () => (await dashboardAPI.stats()).data as DashboardStats,
        staleTime: 30_000,
    });

    const activeProjects = projects.filter((p: any) => p.status === 'active').length;

    // Revenue, AI-cost, automation, and conversation-sentiment metrics have no
    // backend endpoint yet (no billing-per-client, no agent-run, no automation-run,
    // or sentiment models exist) — mock, clearly marked, matching the design.
    return (
        <div className="flex flex-col xl:flex-row gap-6 items-start">
            <div className="flex-1 min-w-0 w-full flex flex-col gap-[18px]">
                <div className="flex items-end justify-between gap-4 flex-wrap">
                    <div>
                        <h1 className="font-display font-bold text-[22px] text-foreground tracking-[-0.01em]">Analytics</h1>
                        <p className="text-[13px] text-voxly-ink-6 mt-[3px]">Last {range === 'Custom' ? '30' : range.replace('D', '')} days · updated just now</p>
                    </div>
                    <button className="flex items-center gap-1.5 text-[13px] font-semibold text-voxly-ink-6 border border-border hover:border-voxly-ink-4 hover:text-foreground rounded-lg px-3.5 py-[9px] transition-colors">
                        <Download className="w-3.5 h-3.5" /> Export report
                    </button>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                    {RANGES.map(r => (
                        <button
                            key={r}
                            onClick={() => setRange(r)}
                            className={`text-[11.5px] rounded-full px-[11px] py-[5px] transition-colors ${
                                range === r ? 'font-semibold text-primary-foreground bg-primary' : 'text-voxly-ink-6 border border-border hover:border-voxly-ink-4 hover:text-foreground'
                            }`}>
                            {r}
                        </button>
                    ))}
                    <div className="w-px h-5 bg-border mx-1" />
                    {['Client', 'Project', 'Agent', 'Channel'].map(f => (
                        <span key={f} className="text-[11.5px] text-voxly-ink-6 border border-border hover:border-voxly-ink-4 hover:text-foreground rounded-lg px-[11px] py-[5px] cursor-pointer transition-colors">{f}</span>
                    ))}
                </div>

                <PreviewBanner>
                    <b className="font-semibold">Preview.</b> Active Clients, Active Projects, and AI Conversations below are real. Revenue, uptime, automation, sentiment, and cost figures throughout this page have no backing endpoint yet and are illustrative.
                </PreviewBanner>

                <span className="font-display font-semibold text-[15px] text-foreground">Executive Overview</span>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {[
                        { label: 'REVENUE', value: '$48.2K', note: '↑ 6.2% vs prior 30d', color: 'text-voxly-success', points: '1,18 12,15 22,16 33,8 51,3', stroke: '#2ECC71', mock: true },
                        { label: 'ACTIVE CLIENTS', value: String(stats?.active_clients ?? clients.length), note: '2 at churn risk', color: 'text-voxly-warning', points: '1,10 12,12 22,11 33,16 51,15', stroke: '#FFB547', mock: false },
                        { label: 'ACTIVE PROJECTS', value: String(activeProjects), note: '3 at deadline risk', color: 'text-voxly-warning', points: '1,12 12,11 22,14 33,12 51,15', stroke: '#FFB547', mock: false },
                        { label: 'AI CONVERSATIONS', value: (stats?.total_messages ?? 0).toLocaleString(), note: '↑ 12% vs prior 30d', color: 'text-voxly-success', points: '1,18 12,15 22,13 33,8 51,3', stroke: '#2ECC71', mock: false },
                        { label: 'PLATFORM UPTIME', value: '99.8%', note: 'stable · 30 days', color: 'text-voxly-success', points: '1,5 12,5 22,4 33,5 51,4', stroke: '#2ECC71', mock: true },
                        { label: 'AUTOMATION SUCCESS', value: '96.4%', note: '2 need attention', color: 'text-voxly-warning', points: '1,6 12,10 22,8 33,11 51,9', stroke: '#FFB547', mock: true },
                    ].map(tile => (
                        <div key={tile.label} className="border border-border rounded-[10px] bg-card px-3.5 py-3">
                            <div className="flex justify-between items-start">
                                <div>
                                    <div className="font-mono text-[9px] font-semibold tracking-[0.04em] text-voxly-ink-5 flex items-center">{tile.label}{tile.mock && <PreviewMark />}</div>
                                    <div className="font-display font-bold text-[20px] text-foreground tabular-nums">{tile.value}</div>
                                </div>
                                <Sparkline points={tile.points} color={tile.stroke} />
                            </div>
                            <div className={`text-[10.5px] mt-1 ${tile.color}`}>{tile.note}</div>
                        </div>
                    ))}
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-[1.6fr_1fr] gap-3.5">
                    <div className="border border-border rounded-xl bg-card px-[18px] py-4">
                        <div className="flex items-center justify-between mb-3">
                            <span className="text-[13px] font-semibold text-foreground flex items-center">Revenue trend<PreviewMark /></span>
                            <Link href="/clients" className="text-[11.5px]">View clients →</Link>
                        </div>
                        <div className="font-display font-bold text-[26px] text-foreground tabular-nums">$48.2K</div>
                        <div className="text-[11px] text-voxly-success mb-3">↑ 6.2% vs prior period · on track for $51K</div>
                        <svg width="100%" height="70" viewBox="0 0 400 70" preserveAspectRatio="none">
                            <polyline points="0,58 50,54 100,56 150,42 200,44 250,28 300,30 350,14 400,8" fill="none" stroke="#2ECC71" strokeWidth="2" />
                        </svg>
                    </div>
                    <div className="border border-border rounded-xl bg-card px-[18px] py-4">
                        <div className="flex items-center justify-between mb-3">
                            <span className="text-[13px] font-semibold text-foreground flex items-center">Client health<PreviewMark /></span>
                            <Link href="/clients" className="text-[11.5px]">Drill in →</Link>
                        </div>
                        <div className="flex flex-col gap-[9px]">
                            {[
                                { label: 'Excellent (90+)', dot: 'bg-voxly-success', value: 22 },
                                { label: 'Good (75-89)', dot: 'bg-voxly-success', value: 12 },
                                { label: 'At risk (<75)', dot: 'bg-voxly-warning', value: 2 },
                                { label: 'Inactive', dot: 'bg-voxly-ink-4', value: 1 },
                            ].map(row => (
                                <div key={row.label} className="flex items-center gap-2">
                                    <span className={`w-[7px] h-[7px] rounded-full flex-none ${row.dot}`} />
                                    <span className="flex-1 text-xs text-voxly-ink-6">{row.label}</span>
                                    <span className="text-xs font-semibold text-foreground">{row.value}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-4">
                    <span className="font-display font-semibold text-[15px] text-foreground flex items-center">AI Performance<PreviewMark /></span>
                    <Link href="/chat" className="text-xs">View AI Agent →</Link>
                </div>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    {[
                        { label: 'Success rate', delta: '↑ 0.3%', deltaColor: 'text-voxly-success', value: `${stats?.ai_accuracy ?? 97}%`, points: '0,20 40,22 80,16 120,17 160,10 200,8', stroke: '#2ECC71' },
                        { label: 'Avg latency', delta: '↓ 0.2s', deltaColor: 'text-voxly-success', value: '1.7s', points: '0,10 40,12 80,16 120,18 160,22 200,24', stroke: '#2ECC71' },
                        { label: 'Token usage', delta: '↑ 18%', deltaColor: 'text-voxly-ink-6', value: '1.2M', points: '0,26 40,23 80,20 120,15 160,11 200,6', stroke: '#7A7A82' },
                        { label: 'Cost', delta: '↑ $12', deltaColor: 'text-voxly-warning', value: '$286', points: '0,24 40,22 80,20 120,17 160,13 200,9', stroke: '#FFB547' },
                    ].map(m => (
                        <div key={m.label} className="border border-border rounded-xl bg-card px-4 py-3.5">
                            <div className="flex items-baseline justify-between mb-2">
                                <span className="font-mono text-[9px] font-bold uppercase tracking-wider text-voxly-ink-5">{m.label}</span>
                                <span className={`text-[10.5px] font-semibold ${m.deltaColor}`}>{m.delta}</span>
                            </div>
                            <div className="font-display font-bold text-[22px] text-foreground tabular-nums mb-2">{m.value}</div>
                            <svg width="100%" height="32" viewBox="0 0 200 32" preserveAspectRatio="none">
                                <polyline points={m.points} fill="none" stroke={m.stroke} strokeWidth="1.8" />
                            </svg>
                        </div>
                    ))}
                </div>

                <div className="flex items-center gap-4">
                    <span className="font-display font-semibold text-[15px] text-foreground flex items-center">Automation Metrics<PreviewMark /></span>
                    <Link href="/automations" className="text-xs">View automations →</Link>
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.6fr] gap-3.5">
                    <div className="border border-border rounded-xl bg-card px-[18px] py-4">
                        <div className="font-mono text-[9.5px] font-bold uppercase tracking-wider text-voxly-ink-5 mb-2.5">Run Status (30d)</div>
                        <div className="flex flex-col gap-[7px]">
                            {[
                                { label: 'Succeeded', dot: 'bg-voxly-success', value: 842 },
                                { label: 'Retrying', dot: 'bg-voxly-warning', value: 9 },
                                { label: 'Failed', dot: 'bg-voxly-heat', value: 22 },
                            ].map(row => (
                                <div key={row.label} className="flex items-center gap-2">
                                    <span className={`w-[7px] h-[7px] rounded-full flex-none ${row.dot}`} />
                                    <span className="flex-1 text-[12.5px] text-voxly-ink-6">{row.label}</span>
                                    <span className="font-display font-bold text-[13px] text-foreground">{row.value}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                    <div className="border border-border rounded-xl bg-card px-[18px] py-4">
                        <div className="flex items-center justify-between mb-3">
                            <span className="text-[13px] font-semibold text-foreground">Run volume</span>
                            <span className="text-[11px] text-voxly-ink-5">873 runs · 96.4% success</span>
                        </div>
                        <svg width="100%" height="60" viewBox="0 0 360 60" preserveAspectRatio="none">
                            <polyline points="0,40 45,44 90,30 135,34 180,20 225,26 270,14 315,18 360,10" fill="none" stroke="#FFB547" strokeWidth="2" />
                        </svg>
                    </div>
                </div>

                <div className="flex items-center gap-4">
                    <span className="font-display font-semibold text-[15px] text-foreground flex items-center">Conversation Analytics<PreviewMark /></span>
                    <Link href="/messages" className="text-xs">View conversations →</Link>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
                    <div className="border border-border rounded-xl bg-card px-4 py-3.5">
                        <div className="font-mono text-[9.5px] font-bold uppercase tracking-wider text-voxly-ink-5 mb-2.5">Status (today)</div>
                        <div className="flex flex-col gap-[7px]">
                            {[
                                { label: 'Resolved', dot: 'bg-voxly-success', value: 4 },
                                { label: 'AI handling', dot: 'bg-voxly-violet', value: 2 },
                                { label: 'Awaiting human', dot: 'bg-voxly-warning', value: 1 },
                                { label: 'Escalated', dot: 'bg-voxly-heat', value: 1 },
                            ].map(row => (
                                <div key={row.label} className="flex items-center gap-2">
                                    <span className={`w-[7px] h-[7px] rounded-full flex-none ${row.dot}`} />
                                    <span className="flex-1 text-[12.5px] text-voxly-ink-6">{row.label}</span>
                                    <span className="font-display font-bold text-[13px] text-foreground">{row.value}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                    <div className="border border-border rounded-xl bg-card px-4 py-3.5">
                        <div className="font-mono text-[9.5px] font-bold uppercase tracking-wider text-voxly-ink-5 mb-2.5">Sentiment (30d)</div>
                        <div className="flex flex-col gap-[7px]">
                            {[
                                { label: 'Positive', dot: 'bg-voxly-success', value: '68%' },
                                { label: 'Neutral', dot: 'bg-voxly-ink-5', value: '26%' },
                                { label: 'Negative', dot: 'bg-voxly-heat', value: '6%' },
                            ].map(row => (
                                <div key={row.label} className="flex items-center gap-2">
                                    <span className={`w-[7px] h-[7px] rounded-full flex-none ${row.dot}`} />
                                    <span className="flex-1 text-[12.5px] text-voxly-ink-6">{row.label}</span>
                                    <span className="font-display font-bold text-[13px] text-foreground">{row.value}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                    <div className="border border-border rounded-xl bg-card px-4 py-3.5">
                        <div className="font-mono text-[9.5px] font-bold uppercase tracking-wider text-voxly-ink-5 mb-2.5">Volume trend</div>
                        <div className="font-display font-bold text-[20px] text-foreground mb-2">268 <span className="text-[11px] text-voxly-ink-5 font-normal">this week</span></div>
                        <svg width="100%" height="30" viewBox="0 0 180 30" preserveAspectRatio="none">
                            <polyline points="0,22 30,20 60,24 90,14 120,16 150,8 180,6" fill="none" stroke="#2ECC71" strokeWidth="1.8" />
                        </svg>
                    </div>
                </div>
            </div>

            <div className="w-full xl:w-80 flex-none flex flex-col gap-3.5">
                <Panel title="Top Clients by Revenue" badge={<PreviewBadge />}>
                    {[['Fable Studio', '$6.8K'], ['Acme Co', '$4.2K'], ['Nomad Labs', '$3.1K']].map(([name, val], i) => (
                        <div key={name} className="flex items-center gap-2 px-3 py-[7px] border-t border-border first:border-t-0">
                            <span className="text-[11px] text-voxly-ink-5 w-3.5">{i + 1}</span>
                            <span className="flex-1 text-xs text-foreground truncate">{name}</span>
                            <span className="text-xs text-foreground tabular-nums">{val}</span>
                        </div>
                    ))}
                </Panel>
                <Panel title="Cost by Agent" badge={<PreviewBadge />}>
                    {[['Support Agent', '$142'], ['Deploy Agent', '$86'], ['Triage Agent', '$58']].map(([name, val]) => (
                        <PanelRow key={name} label={name} value={val} />
                    ))}
                </Panel>
                <Panel title="Biggest Health Changes" badge={<PreviewBadge />}>
                    <div className="px-3.5 pb-3.5 flex flex-col gap-2">
                        {[['Fable Studio', '↑ 6', 'text-voxly-success'], ['Studio Bloom', '↓ 9', 'text-voxly-heat'], ['Kessler & Vance', '↓ 5', 'text-voxly-heat']].map(([name, delta, color]) => (
                            <div key={name} className="flex items-center gap-2">
                                <span className="flex-1 text-xs text-foreground/90">{name}</span>
                                <span className={`text-[11.5px] font-semibold ${color}`}>{delta}</span>
                            </div>
                        ))}
                    </div>
                </Panel>
                <Panel title="Export Report" defaultOpen={false}>
                    <PanelText>
                        <a href="#">Download as PDF →</a><br /><a href="#">Download as CSV →</a>
                    </PanelText>
                </Panel>
            </div>
        </div>
    );
}
