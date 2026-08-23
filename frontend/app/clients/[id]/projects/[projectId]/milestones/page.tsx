'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { clientsAPI, projectsAPI, milestonesAPI, chatAPI, channelsAPI } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import {
    ArrowLeft, Loader2, Plus, Sparkles, MessageSquare,
    FileText, Clock, AlertTriangle, Trash2, Pencil, CheckCircle2,
} from 'lucide-react';
import Link from 'next/link';
import { formatDate } from '@/lib/utils';
import type { Client, Project, Milestone, ChatMessage, ChannelActivity } from '@/types';
import { Panel, PanelRow, PanelText } from '@/components/SidePanel';
import { PreviewBanner, PreviewMark } from '@/components/PreviewBadge';

const milestoneSchema = z.object({
    title: z.string().min(1, 'Title is required'),
    description: z.string().optional(),
    status: z.string().optional(),
    progress: z.number().min(0).max(100).optional().default(0),
    due_date: z.string().optional(),
});
type MilestoneFormData = z.infer<typeof milestoneSchema>;

const MILESTONE_STATUS_STYLE: Record<string, string> = {
    pending: 'bg-voxly-surface-3 text-voxly-ink-6',
    in_progress: 'bg-primary/15 text-primary',
    completed: 'bg-voxly-success-soft text-voxly-success',
    blocked: 'bg-voxly-heat-soft text-voxly-heat',
};

const timeAgo = (ts: string) => {
    const m = Math.floor((Date.now() - new Date(ts).getTime()) / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h`;
    return `${Math.floor(h / 24)}d`;
};

function groupLabel(iso: string) {
    const mins = (Date.now() - new Date(iso).getTime()) / 60000;
    if (mins < 15) return 'JUST NOW';
    if (mins < 24 * 60) return 'EARLIER TODAY';
    if (mins < 48 * 60) return 'YESTERDAY';
    return 'EARLIER';
}

export default function MilestonesPage() {
    const params = useParams();
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const clientId = params.id as string;
    const projectId = params.projectId as string;

    const [milestoneDialogOpen, setMilestoneDialogOpen] = useState(false);
    const [editingMilestone, setEditingMilestone] = useState<Milestone | null>(null);

    const { data: client } = useQuery({
        queryKey: ['client', clientId],
        queryFn: async () => (await clientsAPI.get(clientId)).data as Client,
    });

    const { data: project, isLoading: projectLoading } = useQuery({
        queryKey: ['project', projectId],
        queryFn: async () => (await projectsAPI.get(projectId)).data as Project,
    });

    const { data: milestones = [], isLoading: milestonesLoading } = useQuery({
        queryKey: ['milestones', { project_id: projectId }],
        queryFn: async () => (await milestonesAPI.list({ project_id: projectId })).data as Milestone[],
    });

    // Real activity feed: this client's message thread. Scoped by client, not
    // by project — that matches how conversations work everywhere else in the
    // app (a client has one thread, not one per project).
    const { data: thread = [] } = useQuery({
        queryKey: ['conversation-thread', clientId],
        queryFn: async () => (await chatAPI.clientHistory(clientId, 20)).data.messages as ChatMessage[],
        enabled: !!clientId,
    });

    // Real per-channel activity for this client, so "connected" means real
    // exchanged messages rather than a phone/email field being present.
    const { data: channelActivity = [] } = useQuery({
        queryKey: ['channel-activity'],
        queryFn: async () => (await channelsAPI.list()).data as ChannelActivity[],
        staleTime: 30_000,
    });
    const clientChannels = channelActivity.filter(a => a.client_id === clientId);

    const milestoneForm = useForm<MilestoneFormData>({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        resolver: zodResolver(milestoneSchema) as any,
        defaultValues: { status: 'pending', progress: 0 },
    });

    const createMilestoneMutation = useMutation({
        mutationFn: (data: MilestoneFormData) => milestonesAPI.create({ ...data, project_id: projectId }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['milestones', { project_id: projectId }] });
            toast({ title: 'Milestone created' });
            setMilestoneDialogOpen(false);
            milestoneForm.reset({ status: 'pending', progress: 0 });
        },
        onError: () => toast({ variant: 'destructive', title: 'Failed to create milestone' }),
    });

    const updateMilestoneMutation = useMutation({
        mutationFn: ({ id, data }: { id: string; data: MilestoneFormData }) => milestonesAPI.update(id, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['milestones', { project_id: projectId }] });
            toast({ title: 'Milestone updated' });
            setEditingMilestone(null);
            setMilestoneDialogOpen(false);
            milestoneForm.reset({ status: 'pending', progress: 0 });
        },
        onError: () => toast({ variant: 'destructive', title: 'Failed to update milestone' }),
    });

    const deleteMilestoneMutation = useMutation({
        mutationFn: (id: string) => milestonesAPI.delete(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['milestones', { project_id: projectId }] });
            toast({ title: 'Milestone deleted' });
        },
        onError: () => toast({ variant: 'destructive', title: 'Failed to delete milestone' }),
    });

    const overallProgress = milestones.length > 0
        ? Math.round(milestones.reduce((acc, m) => acc + m.progress, 0) / milestones.length)
        : 0;

    const openEditDialog = (milestone: Milestone) => {
        setEditingMilestone(milestone);
        milestoneForm.reset({
            title: milestone.title,
            description: milestone.description || '',
            status: milestone.status,
            progress: milestone.progress,
            due_date: milestone.due_date || '',
        });
        setMilestoneDialogOpen(true);
    };

    const closeDialog = () => {
        setMilestoneDialogOpen(false);
        setEditingMilestone(null);
        milestoneForm.reset({ status: 'pending', progress: 0 });
    };

    const handleSubmit = (data: MilestoneFormData) => {
        if (editingMilestone) updateMilestoneMutation.mutate({ id: editingMilestone.id, data });
        else createMilestoneMutation.mutate(data);
    };

    if (projectLoading) {
        return (
            <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
        );
    }

    if (!project) {
        return (
            <div className="text-center py-12">
                <h2 className="text-xl font-semibold text-foreground">Project not found</h2>
                <Link href={`/clients/${clientId}`}><Button variant="link">Back to client</Button></Link>
            </div>
        );
    }

    const stats = project.github_stats ?? null;
    const upcomingMilestones = [...milestones]
        .filter(m => m.due_date && m.status !== 'completed')
        .sort((a, b) => new Date(a.due_date!).getTime() - new Date(b.due_date!).getTime())
        .slice(0, 2);

    // Real activity, grouped the same way the design's feed was — just from
    // actual messages instead of invented GitHub/deploy/automation events.
    const activityItems = [...thread]
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 6);
    const activityGroups: { label: string; items: ChatMessage[] }[] = [];
    for (const m of activityItems) {
        const label = groupLabel(m.created_at);
        const last = activityGroups[activityGroups.length - 1];
        if (last && last.label === label) last.items.push(m);
        else activityGroups.push({ label, items: [m] });
    }

    return (
        <div className="flex flex-col xl:flex-row gap-6 items-start">
            <div className="flex-1 min-w-0 w-full flex flex-col gap-[18px]">
                <div className="flex items-center gap-1.5 text-[12.5px]">
                    <Link href="/projects" className="flex items-center gap-1 text-voxly-ink-6 hover:text-foreground transition-colors">
                        <ArrowLeft className="w-3.5 h-3.5" /> Projects
                    </Link>
                    <span className="text-voxly-ink-5">/</span>
                    <span className="text-foreground font-semibold">{project.name}</span>
                </div>

                <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="flex gap-3.5 min-w-0">
                        <div className="w-11 h-11 rounded-xl bg-voxly-surface-3 flex items-center justify-center text-voxly-ink-6 flex-none">
                            <FileText className="w-5 h-5" />
                        </div>
                        <div className="min-w-0">
                            <div className="flex items-center gap-2.5 flex-wrap">
                                <span className="font-display font-bold text-2xl text-foreground tracking-[-0.01em] truncate">{project.name}</span>
                                <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold rounded-full pl-1.5 pr-2.5 py-[3px] bg-voxly-success-soft text-voxly-success flex-none">
                                    <span className="w-[5px] h-[5px] rounded-full bg-voxly-success" />{project.status}
                                </span>
                                {stats && (
                                    <span className="inline-flex items-center gap-1 text-[11px] text-voxly-ink-5 flex-none">GITHUB<b className="font-display font-bold text-[13px] text-voxly-success">{stats.progress_percent}%</b></span>
                                )}
                            </div>
                            {project.github_repo && <div className="font-mono text-xs text-voxly-ink-5 mt-1">{project.github_repo}</div>}
                            {client && (
                                <div className="flex items-center gap-1.5 mt-2">
                                    <div className="w-[18px] h-[18px] rounded-[5px] bg-voxly-surface-3 flex items-center justify-center font-display font-bold text-[8px] text-voxly-ink-6">{client.name.charAt(0)}</div>
                                    <Link href={`/clients/${client.id}`} className="text-[12.5px] text-voxly-ink-6 hover:text-primary transition-colors">{client.name}</Link>
                                </div>
                            )}
                        </div>
                    </div>
                    <div className="flex items-center gap-2 flex-none">
                        <Link href="/messages" className="font-semibold text-[13px] bg-secondary hover:bg-accent text-foreground border border-voxly-ink-4 rounded-lg px-3.5 py-2 transition-colors whitespace-nowrap">
                            Message
                        </Link>
                        {project.github_repo && (
                            <a href={`https://github.com/${project.github_repo}`} target="_blank" rel="noopener noreferrer" className="font-semibold text-[13px] text-voxly-ink-6 hover:text-foreground border border-border hover:border-voxly-ink-4 rounded-lg px-3.5 py-2 transition-colors whitespace-nowrap">
                                GitHub
                            </a>
                        )}
                    </div>
                </div>

                <Link
                    href={`/chat?context=project:${project.id}`}
                    className="rounded-xl border border-voxly-violet/30 bg-voxly-violet-soft px-4 py-3 flex items-center gap-2.5 hover:bg-voxly-violet-soft/70 transition-colors"
                >
                    <Sparkles className="w-4 h-4 text-voxly-violet flex-none" />
                    <span className="text-xs text-foreground/90">Ask Voxly about this project — opens with this project&apos;s context loaded</span>
                </Link>

                {/* Real synced GitHub stats — from the same github_cache row
                    Projects already reads. Absent (not zeroed) when there's no
                    repo linked or it hasn't synced yet. */}
                {stats ? (
                    <div className="flex items-center gap-[22px] px-[18px] py-3.5 border border-border rounded-xl bg-card flex-wrap">
                        <div><span className="font-display font-bold text-[17px] text-foreground">{stats.pull_requests}</span><span className="text-[11.5px] text-voxly-ink-5 ml-1.5">open PRs</span></div>
                        <div className="w-px h-4 bg-border" />
                        <div><span className="font-display font-bold text-[17px] text-foreground">{stats.open_issues}</span><span className="text-[11.5px] text-voxly-ink-5 ml-1.5">open issues</span></div>
                        <div className="w-px h-4 bg-border" />
                        <div><span className="font-display font-bold text-[17px] text-foreground">{stats.commits_last_7_days}</span><span className="text-[11.5px] text-voxly-ink-5 ml-1.5">commits (7d)</span></div>
                        <div className="w-px h-4 bg-border" />
                        <div><span className="font-display font-bold text-[17px] text-foreground">{overallProgress}%</span><span className="text-[11.5px] text-voxly-ink-5 ml-1.5">milestone progress</span></div>
                    </div>
                ) : (
                    <div className="flex items-center gap-[22px] px-[18px] py-3.5 border border-border rounded-xl bg-card flex-wrap">
                        <div><span className="font-display font-bold text-[17px] text-foreground">{overallProgress}%</span><span className="text-[11.5px] text-voxly-ink-5 ml-1.5">milestone progress</span></div>
                        {!project.github_repo && (
                            <span className="text-[11.5px] text-voxly-ink-5">No repository linked yet</span>
                        )}
                        {project.github_repo && (
                            <span className="text-[11.5px] text-voxly-ink-5">Repository linked, not synced yet</span>
                        )}
                    </div>
                )}

                <div className="flex items-center gap-4">
                    <span className="font-display font-semibold text-[15px] text-foreground">Activity</span>
                </div>
                <div className="border border-border rounded-[14px] bg-card overflow-hidden">
                    {activityGroups.length === 0 ? (
                        <div className="px-4 py-8 text-center text-xs text-voxly-ink-5">No messages with this client yet.</div>
                    ) : activityGroups.map(group => (
                        <div key={group.label}>
                            <div className="px-4 py-2 bg-voxly-surface-2 font-mono text-[9.5px] font-bold tracking-[0.07em] text-voxly-ink-5">{group.label}</div>
                            {group.items.map(m => (
                                <div key={m.id} className="flex items-center gap-3 px-4 py-[11px] border-b border-border last:border-b-0 hover:bg-white/[0.02] transition-colors">
                                    <span className={`w-[3px] h-7 rounded-sm flex-none ${m.ai_response ? 'bg-voxly-violet' : 'bg-primary'}`} />
                                    <span className={`w-7 h-7 rounded-lg bg-voxly-surface-2 flex items-center justify-center flex-none ${m.ai_response ? 'text-voxly-violet' : 'text-voxly-ink-6'}`}>
                                        {m.ai_response ? <Sparkles className="w-3.5 h-3.5" /> : <MessageSquare className="w-3.5 h-3.5" />}
                                    </span>
                                    <div className="flex-1 min-w-0">
                                        <div className="text-[13px] text-foreground font-medium truncate">
                                            {m.ai_response ? 'Voxly replied' : `${client?.name ?? 'Client'} messaged`}
                                        </div>
                                        <div className="text-[11.5px] text-voxly-ink-5 truncate">&quot;{m.ai_response || m.message}&quot;</div>
                                    </div>
                                    <span className="text-[9.5px] uppercase tracking-wide text-voxly-ink-5 flex-none">{m.channel}</span>
                                    <span className="font-mono text-[11px] text-voxly-ink-5 flex-none w-7 text-right">{timeAgo(m.created_at)}</span>
                                </div>
                            ))}
                        </div>
                    ))}
                </div>

                {/* Milestones — real, fully functional CRUD */}
                <div className="flex items-center justify-between">
                    <span className="font-display font-semibold text-[15px] text-foreground">Milestones</span>
                    <Button onClick={() => setMilestoneDialogOpen(true)} className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-[13px] rounded-lg px-3.5 py-2 h-auto gap-1.5">
                        <Plus className="w-3.5 h-3.5" /> Add Milestone
                    </Button>
                </div>
                <div className="border border-border rounded-[14px] bg-card overflow-hidden">
                    {milestonesLoading ? (
                        <div className="p-8 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-primary" /></div>
                    ) : milestones.length === 0 ? (
                        <div className="py-12 text-center">
                            <CheckCircle2 className="w-10 h-10 mx-auto text-voxly-ink-5 mb-3" />
                            <h3 className="font-semibold text-foreground mb-1">No milestones yet</h3>
                            <p className="text-voxly-ink-5 text-sm mb-4">Add milestones to track project progress</p>
                            <Button onClick={() => setMilestoneDialogOpen(true)} className="bg-primary hover:bg-primary/90 text-primary-foreground"><Plus className="w-4 h-4 mr-2" />Add Milestone</Button>
                        </div>
                    ) : (
                        milestones.map(milestone => (
                            <div key={milestone.id} className="p-4 border-b border-border last:border-b-0">
                                <div className="flex items-start justify-between gap-4">
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2.5 mb-1.5 flex-wrap">
                                            <h3 className="font-semibold text-foreground text-sm">{milestone.title}</h3>
                                            <span className={`text-[10.5px] font-semibold rounded-full px-2 py-0.5 ${MILESTONE_STATUS_STYLE[milestone.status] ?? MILESTONE_STATUS_STYLE.pending}`}>
                                                {milestone.status.replace('_', ' ')}
                                            </span>
                                        </div>
                                        {milestone.description && <p className="text-xs text-voxly-ink-6 mb-2.5">{milestone.description}</p>}
                                        <div className="flex items-center justify-between text-xs mb-1.5">
                                            <span className="text-voxly-ink-5">Progress</span>
                                            <span className="font-medium text-foreground">{milestone.progress}%</span>
                                        </div>
                                        <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                                            <div className="h-full rounded-full bg-primary" style={{ width: `${milestone.progress}%` }} />
                                        </div>
                                        {milestone.due_date && <p className="text-[11px] text-voxly-ink-5 mt-2">Due: {formatDate(milestone.due_date)}</p>}
                                    </div>
                                    <div className="flex gap-1 flex-none">
                                        <Button variant="ghost" size="icon" className="w-8 h-8 text-voxly-ink-5 hover:text-foreground" onClick={() => openEditDialog(milestone)}>
                                            <Pencil className="w-3.5 h-3.5" />
                                        </Button>
                                        <Button variant="ghost" size="icon" className="w-8 h-8 text-voxly-ink-5 hover:text-voxly-heat" onClick={() => deleteMilestoneMutation.mutate(milestone.id)}>
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>


                <div className="flex items-center gap-4">
                    <span className="font-display font-semibold text-[15px] text-foreground">Documents</span>
                </div>
                <PreviewBanner>
                    <b className="font-semibold">Preview.</b> No document storage exists yet — upload and the files below are illustrative of where this is headed.
                </PreviewBanner>
                <div className="flex gap-3 flex-wrap">
                    {[
                        { name: 'Statement of Work.pdf', meta: '240 KB' },
                        { name: 'API Specification.md', meta: '18 KB' },
                        { name: 'Brand Guidelines.pdf', meta: '4.1 MB' },
                    ].map(doc => (
                        <div key={doc.name} className="flex items-center gap-2.5 border border-border rounded-[11px] bg-card px-3.5 py-2.5 w-[220px] opacity-70">
                            <div className="w-8 h-8 rounded-lg bg-voxly-surface-3 flex items-center justify-center text-voxly-ink-6 flex-none">
                                <FileText className="w-[15px] h-[15px]" />
                            </div>
                            <div className="min-w-0">
                                <div className="text-xs font-semibold text-foreground truncate">{doc.name}</div>
                                <div className="text-[10.5px] text-voxly-ink-5">{doc.meta}</div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            <div className="w-full xl:w-80 flex-none flex flex-col gap-3.5">
                {/* Real synced GitHub signal, replacing an invented 0-100
                    "health" score blending fabricated response time, deploy
                    rate, and sentiment — none of which exist on the backend. */}
                <Panel title="Project Signals">
                    {stats ? (
                        <>
                            <PanelRow dot="bg-voxly-success" label="Commits (7d)" value={stats.commits_last_7_days} />
                            <PanelRow dot="bg-voxly-success" label="Open issues" value={stats.open_issues} />
                            <PanelRow dot="bg-voxly-success" label="Open PRs" value={stats.pull_requests} />
                            <PanelRow dot="bg-voxly-warning" label="Milestone progress" value={`${overallProgress}%`} />
                            {stats.last_commit_date && (
                                <PanelText>Last commit {formatDate(stats.last_commit_date)}{stats.last_commit_message ? ` — "${stats.last_commit_message}"` : ''}.</PanelText>
                            )}
                        </>
                    ) : (
                        <>
                            <PanelRow dot="bg-voxly-ink-4" label="GitHub sync" value={project.github_repo ? 'not synced yet' : 'no repo linked'} />
                            <PanelRow dot="bg-voxly-warning" label="Milestone progress" value={`${overallProgress}%`} />
                        </>
                    )}
                </Panel>
                <Panel title="Risks" badge={<span className="text-[10.5px] bg-voxly-warning-soft text-voxly-warning px-[7px] py-[1px] rounded-full">{upcomingMilestones.length > 0 ? 1 : 0}</span>}>
                    {upcomingMilestones.length > 0 ? (
                        <div className="px-3.5 pb-3.5 flex items-start gap-2">
                            <AlertTriangle className="w-3.5 h-3.5 text-voxly-warning flex-none mt-0.5" />
                            <span className="text-xs text-foreground/90 leading-relaxed">&quot;{upcomingMilestones[0].title}&quot; is due {formatDate(upcomingMilestones[0].due_date!)} — check progress.</span>
                        </div>
                    ) : (
                        <PanelText>No active risks flagged.</PanelText>
                    )}
                </Panel>
                <Panel title="AI Memory & Context" defaultOpen={false}>
                    <PanelText>
                        <span className="inline-flex items-center">No memory/context store exists yet<PreviewMark /></span> — the AI Agent uses live tool calls (project status, GitHub) rather than stored memory of past conversations.
                    </PanelText>
                </Panel>
                <Panel title="Team & Channels" defaultOpen={false}>
                    <PanelRow dot={project.github_repo ? 'bg-voxly-success' : 'bg-voxly-ink-4'} label="GitHub" value={project.github_repo ? (stats ? 'synced' : 'linked, not synced') : 'not linked'} />
                    <PanelRow
                        dot={clientChannels.some(c => c.channel === 'whatsapp') ? 'bg-voxly-success' : 'bg-voxly-ink-4'}
                        label="WhatsApp"
                        value={clientChannels.some(c => c.channel === 'whatsapp') ? 'active' : client?.phone ? 'no messages yet' : 'not configured'}
                    />
                    <PanelRow
                        dot={clientChannels.some(c => c.channel === 'telegram') ? 'bg-voxly-success' : 'bg-voxly-ink-4'}
                        label="Telegram"
                        value={clientChannels.some(c => c.channel === 'telegram') ? 'active' : client?.telegram_chat_id ? 'no messages yet' : 'not configured'}
                    />
                </Panel>
                <Panel title="Upcoming Milestones">
                    {upcomingMilestones.length === 0 ? (
                        <PanelText>Nothing due soon.</PanelText>
                    ) : upcomingMilestones.map(m => (
                        <div key={m.id} className="flex items-center gap-2 px-3.5 py-[7px] border-t border-border first:border-t-0">
                            <Clock className="w-[11px] h-[11px] text-voxly-ink-5 flex-none" />
                            <span className="flex-1 text-[11.5px] text-foreground/90 truncate">{m.title}</span>
                            <span className="text-[11px] text-voxly-ink-5">{formatDate(m.due_date!)}</span>
                        </div>
                    ))}
                </Panel>
            </div>

            {/* Add/Edit milestone dialog — unchanged real logic */}
            <Dialog open={milestoneDialogOpen} onOpenChange={closeDialog}>
                <DialogContent className="bg-card border-border">
                    <DialogHeader>
                        <DialogTitle className="text-foreground">{editingMilestone ? 'Edit Milestone' : 'Add New Milestone'}</DialogTitle>
                        <DialogDescription className="text-voxly-ink-6">
                            {editingMilestone ? 'Update milestone details' : 'Create a milestone to track progress'}
                        </DialogDescription>
                    </DialogHeader>
                    <form onSubmit={milestoneForm.handleSubmit(handleSubmit)} className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="milestone-title">Title *</Label>
                            <Input id="milestone-title" placeholder="e.g., Backend API Complete" className="bg-background border-voxly-ink-4" {...milestoneForm.register('title')} />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="milestone-description">Description</Label>
                            <Input id="milestone-description" placeholder="Brief description..." className="bg-background border-voxly-ink-4" {...milestoneForm.register('description')} />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="milestone-status">Status</Label>
                                <select id="milestone-status" className="w-full h-10 px-3 rounded-md border border-voxly-ink-4 bg-background text-foreground" {...milestoneForm.register('status')}>
                                    <option value="pending">Pending</option>
                                    <option value="in_progress">In Progress</option>
                                    <option value="completed">Completed</option>
                                    <option value="blocked">Blocked</option>
                                </select>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="milestone-progress">Progress (%)</Label>
                                <Input id="milestone-progress" type="number" min="0" max="100" className="bg-background border-voxly-ink-4" {...milestoneForm.register('progress')} />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="milestone-due">Due Date</Label>
                            <Input id="milestone-due" type="date" className="bg-background border-voxly-ink-4" {...milestoneForm.register('due_date')} />
                        </div>
                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={closeDialog} className="border-border text-foreground hover:bg-accent">Cancel</Button>
                            <Button type="submit" disabled={createMilestoneMutation.isPending || updateMilestoneMutation.isPending} className="bg-primary hover:bg-primary/90 text-primary-foreground">
                                {(createMilestoneMutation.isPending || updateMilestoneMutation.isPending) && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                                {editingMilestone ? 'Update' : 'Create'} Milestone
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </div>
    );
}
