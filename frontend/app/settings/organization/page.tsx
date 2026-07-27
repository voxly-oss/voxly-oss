'use client';

import { useAuth } from '@/hooks/useAuth';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { channelsAPI, clientsAPI, dashboardAPI, projectsAPI } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { getInitials } from '@/lib/utils';
import { Code2, MessageSquare, Mail, Send, Sparkles } from 'lucide-react';
import SettingsShell from '@/components/SettingsShell';
import { Panel, PanelRow, PanelText } from '@/components/SidePanel';
import { PreviewBanner, PreviewMark } from '@/components/PreviewBadge';
import type { ChannelActivity, Client, Project } from '@/types';

/**
 * An `organizations` table, `memberships`, `roles`, and `invitations` all exist
 * and are dual-writing in production — but no REST surface is exposed for any
 * of them, so this page cannot read real membership or activity. Owner
 * identity, plan, workspace counts, and integration status are real; the member
 * count and audit trail are not, and are marked accordingly.
 */

type Integrations = { whatsapp: boolean; telegram: boolean; github: boolean; ai_provider: string };
type DashboardStats = { integrations: Integrations };

export default function OrganizationSettingsPage() {
    const { user } = useAuth();

    const { data: clients = [] } = useQuery({
        queryKey: ['clients'],
        queryFn: async () => (await clientsAPI.list()).data as Client[],
    });
    const { data: projects = [] } = useQuery({
        queryKey: ['projects'],
        queryFn: async () => (await projectsAPI.list()).data as Project[],
    });
    const { data: stats } = useQuery({
        queryKey: ['dashboard-stats'],
        queryFn: async () => (await dashboardAPI.stats()).data as DashboardStats,
        staleTime: 30_000,
    });
    const { data: channels = [] } = useQuery({
        queryKey: ['channel-activity'],
        queryFn: async () => (await channelsAPI.list()).data as ChannelActivity[],
        staleTime: 30_000,
    });

    const orgName = user?.agency_name || 'Your Workspace';
    const initials = getInitials(orgName);
    const integrations = stats?.integrations;

    const whatsappCount = channels.filter(a => a.channel === 'whatsapp').length;
    const telegramCount = channels.filter(a => a.channel === 'telegram').length;

    /* Connected Services now reports the platform's real integration
       configuration (from /dashboard/stats) plus real per-channel conversation
       counts (from /channels). It previously inferred "GitHub: connected" from
       whether the workspace had any clients at all, which was unrelated. */
    const services = [
        {
            icon: Code2, name: 'GitHub',
            on: !!integrations?.github,
            status: integrations?.github ? 'configured' : 'not configured',
        },
        {
            icon: MessageSquare, name: 'WhatsApp',
            on: !!integrations?.whatsapp,
            status: !integrations?.whatsapp
                ? 'not configured'
                : `${whatsappCount} active ${whatsappCount === 1 ? 'conversation' : 'conversations'}`,
        },
        {
            icon: Send, name: 'Telegram',
            on: !!integrations?.telegram,
            status: !integrations?.telegram
                ? 'not configured'
                : `${telegramCount} active ${telegramCount === 1 ? 'conversation' : 'conversations'}`,
        },
        {
            icon: Sparkles, name: 'AI Provider',
            on: !!integrations && integrations.ai_provider !== 'none',
            status: integrations?.ai_provider && integrations.ai_provider !== 'none'
                ? integrations.ai_provider
                : 'not configured',
        },
        {
            icon: Mail, name: 'Email',
            on: false,
            status: 'outbound only',
        },
    ];

    return (
        <SettingsShell breadcrumb={{ group: 'Workspace', page: 'Organization' }}>
            <div className="flex flex-col xl:flex-row gap-6 items-start">
                <div className="flex-1 min-w-0 w-full flex flex-col gap-[18px]">

                    <div className="flex items-start justify-between gap-4 flex-wrap">
                        <div className="flex gap-3.5 min-w-0">
                            <div className="w-12 h-12 rounded-[13px] bg-voxly-violet flex items-center justify-center font-display font-bold text-base text-white flex-none">{initials}</div>
                            <div className="min-w-0">
                                <div className="flex items-center gap-2.5">
                                    <span className="font-display font-bold text-2xl text-foreground tracking-[-0.01em] truncate">{orgName}</span>
                                    <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold rounded-full pl-1.5 pr-2.5 py-[3px] bg-voxly-success-soft text-voxly-success flex-none">
                                        <span className="w-[5px] h-[5px] rounded-full bg-voxly-success" />Active
                                    </span>
                                </div>
                                <div className="text-[12.5px] text-voxly-ink-6 mt-1">
                                    {user?.subscription_tier ?? 'Free'} plan · created {user?.created_at ? new Date(user.created_at).toLocaleDateString(undefined, { month: 'short', year: 'numeric' }) : '—'}
                                </div>
                            </div>
                        </div>
                        <Link href="/settings/billing">
                            <Button className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-[13px] rounded-lg px-4 py-[9px] h-auto">
                                Manage plan
                            </Button>
                        </Link>
                    </div>

                    <PreviewBanner>
                        <b className="font-semibold">Preview.</b> Workspace identity, plan, counts, and integration status below are real. Team membership has no API yet, so this workspace is single-user and the seat and activity figures are illustrative.
                    </PreviewBanner>

                    <div className="border border-border rounded-xl bg-card px-[18px] py-3.5 flex flex-col gap-3">
                        <div className="flex items-center gap-[22px]">
                            <div className="flex-1 min-w-0"><span className="font-display font-bold text-[15px] text-foreground">{user?.subscription_tier ?? 'Free'}</span><span className="text-[11.5px] text-voxly-ink-5 ml-1.5">plan</span></div>
                            <div className="w-px self-stretch bg-border" />
                            <div className="flex-1 min-w-0"><span className="font-display font-bold text-[15px] text-voxly-success">Active</span><span className="text-[11.5px] text-voxly-ink-5 ml-1.5">status</span></div>
                        </div>
                    </div>

                    <div className="flex items-center gap-4">
                        <span className="font-display font-semibold text-[15px] text-foreground">Workspace Statistics</span>
                    </div>
                    <div className="flex gap-5 flex-wrap px-[18px] py-3.5 border border-border rounded-xl bg-card">
                        <div><span className="font-display font-bold text-[17px] text-foreground">{clients.length}</span><span className="text-[11.5px] text-voxly-ink-5 ml-1.5">clients</span></div>
                        <div className="w-px bg-border" />
                        <div><span className="font-display font-bold text-[17px] text-foreground">{projects.length}</span><span className="text-[11.5px] text-voxly-ink-5 ml-1.5">projects</span></div>
                        <div className="w-px bg-border" />
                        <div><span className="font-display font-bold text-[17px] text-foreground">{channels.length}</span><span className="text-[11.5px] text-voxly-ink-5 ml-1.5">channels</span></div>
                        <div className="w-px bg-border" />
                        <div className="flex items-center">
                            <span className="font-display font-bold text-[17px] text-foreground">1</span>
                            <span className="text-[11.5px] text-voxly-ink-5 ml-1.5 flex items-center">member<PreviewMark /></span>
                        </div>
                    </div>

                    <div className="flex items-center gap-4">
                        <span className="font-display font-semibold text-[15px] text-foreground">Organization Information</span>
                    </div>
                    <div className="border border-border rounded-xl bg-card px-[18px] py-1">
                        <div className="grid grid-cols-1 md:grid-cols-2">
                            {[
                                ['Company', orgName],
                                ['Billing owner', user?.full_name || '—'],
                                ['Primary contact', user?.email || '—'],
                            ].map(([label, value], i) => (
                                <div key={label} className={`flex items-center justify-between py-[11px] ${i < 2 ? 'border-b border-border' : ''} ${i % 2 === 1 ? 'md:pl-6' : ''}`}>
                                    <span className="text-[12.5px] text-voxly-ink-5">{label}</span>
                                    <span className="text-[13px] text-foreground truncate max-w-[60%] text-right">{value}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="flex items-center gap-4">
                        <span className="font-display font-semibold text-[15px] text-foreground">Connected Services</span>
                    </div>
                    <div className="border border-border rounded-[14px] bg-card overflow-hidden">
                        {services.map((svc, i, arr) => (
                            <div key={svc.name} className={`flex items-center gap-3 px-[18px] py-3 ${i < arr.length - 1 ? 'border-b border-border' : ''}`}>
                                <div className="w-7 h-7 rounded-lg bg-secondary flex items-center justify-center text-voxly-ink-6 flex-none">
                                    <svc.icon className="w-3.5 h-3.5" />
                                </div>
                                <span className="text-[13px] text-foreground font-semibold flex-1">{svc.name}</span>
                                <span className={`w-1.5 h-1.5 rounded-full flex-none ${svc.on ? 'bg-voxly-success' : 'bg-voxly-ink-4'}`} />
                                <span className={`text-[12px] w-[170px] text-right truncate ${svc.on ? 'text-voxly-ink-6' : 'text-voxly-ink-5'}`}>{svc.status}</span>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="w-full xl:w-80 flex-none flex flex-col gap-3.5">
                    <Panel title="Security & Compliance">
                        <PanelRow dot="bg-voxly-success" label="Data in transit" value="TLS encrypted" />
                        <PanelRow dot="bg-voxly-success" label="BYOK keys at rest" value="Encrypted" />
                        <PanelRow dot="bg-voxly-success" label="Inbound webhooks" value="Signature-verified" />
                        <PanelText>
                            These describe how the platform is built, not per-workspace policy — there is no workspace-level security configuration yet.
                        </PanelText>
                    </Panel>
                    <Panel title="Team" defaultOpen={false}>
                        <PanelText>
                            This workspace is single-user. Invitations, seats, and roles need a membership API before they can do anything —{' '}
                            <Link href="/settings/team-members" className="text-primary">see the preview</Link>.
                        </PanelText>
                    </Panel>
                    <Panel title="Recent Activity" defaultOpen={false}>
                        <PanelText>
                            No audit-log endpoint exists yet. Live workspace activity is on the{' '}
                            <Link href="/dashboard" className="text-primary">dashboard signal feed</Link>.
                        </PanelText>
                    </Panel>
                </div>
            </div>
        </SettingsShell>
    );
}
