'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { clientsAPI, projectsAPI, getApiErrorMessage } from '@/lib/api';
import { useDeleteClient, useSetClientActive } from '@/hooks/useClientMutations';
import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useToast } from '@/hooks/use-toast';
import {
    ArrowLeft,
    Loader2,
    Phone,
    Mail,
    Building,
    Calendar,
    Plus,
    FolderGit2,
    ExternalLink,
    Pencil,
    Clock,
    ArrowUpRight,
    GitBranch,
    Send,
    MessageSquare,
    MoreVertical,
    Trash2,
    PauseCircle,
    PlayCircle,
} from 'lucide-react';
import Link from 'next/link';
import { formatDate, formatPhone, getInitials } from '@/lib/utils';
import type { Client, Project } from '@/types';
import StatusBadge from '@/components/StatusBadge';
import EmptyState from '@/components/EmptyState';
import ConfirmDialog from '@/components/ConfirmDialog';
import ProjectFormDialog from '@/components/ProjectFormDialog';
import FollowUpDialog from '@/components/FollowUpDialog';
import ClientFormDialog from '@/components/ClientFormDialog';

function DetailTile({ icon: Icon, label, children }: { icon: React.ElementType; label: string; children: React.ReactNode }) {
    return (
        <div className="flex items-center gap-3 p-3.5 rounded-xl bg-background border border-border min-w-0">
            <div className="w-8 h-8 rounded-lg bg-voxly-surface-3 flex items-center justify-center flex-none text-voxly-ink-6">
                <Icon className="w-4 h-4" />
            </div>
            <div className="min-w-0">
                <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.04em] text-voxly-ink-5 mb-0.5">{label}</p>
                <div className="text-[13px] font-medium text-foreground truncate">{children}</div>
            </div>
        </div>
    );
}

function ProjectProgress({ project }: { project: Project }) {
    const stats = project.github_stats;
    // Real synced GitHub progress only. No repo / never synced renders a
    // plain explanation rather than a stand-in 0%.
    if (!stats) {
        return (
            <div className="flex justify-between text-xs">
                <span className="text-voxly-ink-5">Progress</span>
                <span className="text-voxly-ink-5" title={project.github_repo ? 'The repo hasn’t synced yet' : 'Link a GitHub repo to track progress'}>
                    {project.github_repo ? 'Not synced yet' : 'No repo linked'}
                </span>
            </div>
        );
    }
    const pct = Math.min(Math.max(stats.progress_percent, 0), 100);
    return (
        <div className="space-y-1.5">
            <div className="flex justify-between text-xs">
                <span className="text-voxly-ink-5">Progress</span>
                <span className="text-foreground font-semibold tabular-nums">{pct}%</span>
            </div>
            <div
                className="h-1.5 rounded-full bg-voxly-surface-3 overflow-hidden"
                role="progressbar"
                aria-valuenow={pct}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`${project.name} progress`}
            >
                <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
            </div>
        </div>
    );
}

export default function ClientDetailPage() {
    const params = useParams();
    const router = useRouter();
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const clientId = params.id as string;

    const [editOpen, setEditOpen] = useState(false);
    const [deactivateOpen, setDeactivateOpen] = useState(false);
    const [deleteOpen, setDeleteOpen] = useState(false);
    const [projectDialogOpen, setProjectDialogOpen] = useState(false);
    const [editingProject, setEditingProject] = useState<Project | null>(null);
    const [projectToDelete, setProjectToDelete] = useState<Project | null>(null);
    const [followUpOpen, setFollowUpOpen] = useState(false);

    const { data: client, isLoading: clientLoading } = useQuery({
        queryKey: ['client', clientId],
        queryFn: async () => (await clientsAPI.get(clientId)).data as Client,
    });

    const { data: projects = [], isLoading: projectsLoading } = useQuery({
        queryKey: ['projects', { client_id: clientId }],
        queryFn: async () => (await projectsAPI.list({ client_id: clientId })).data as Project[],
    });

    const setActive = useSetClientActive();
    const deleteClient = useDeleteClient({ onDeleted: () => router.push('/clients') });

    const deleteProjectMutation = useMutation({
        mutationFn: (id: string) => projectsAPI.delete(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['projects'] });
            queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
            toast({ title: 'Project deleted', description: projectToDelete?.name });
            setProjectToDelete(null);
        },
        onError: (err) => {
            toast({ variant: 'destructive', title: 'Couldn’t delete project', description: getApiErrorMessage(err, 'Please try again.') });
        },
    });

    const openCreateProject = () => {
        setEditingProject(null);
        setProjectDialogOpen(true);
    };
    const openEditProject = (project: Project) => {
        setEditingProject(project);
        setProjectDialogOpen(true);
    };

    if (clientLoading) {
        return (
            <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
        );
    }

    if (!client) {
        return (
            <div className="border border-border rounded-[14px] bg-card">
                <EmptyState icon={FolderGit2} title="Client not found" description="It may have been deleted, or the link is wrong." href="/clients" label="Back to clients" />
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-[18px]">
            {/* Breadcrumb */}
            <div className="flex items-center gap-1.5 text-[12.5px] min-w-0">
                <Link href="/clients" className="flex items-center gap-1 text-voxly-ink-6 hover:text-foreground transition-colors flex-none">
                    <ArrowLeft className="w-3.5 h-3.5" /> Clients
                </Link>
                <span className="text-voxly-ink-5">/</span>
                <span className="text-foreground font-semibold truncate">{client.name}</span>
            </div>

            {/* Client header */}
            <div className="border border-border rounded-[14px] bg-card overflow-hidden">
                <div className="flex flex-wrap items-start justify-between gap-4 px-5 py-4 border-b border-border">
                    <div className="flex items-center gap-3.5 min-w-0">
                        <div className="w-11 h-11 rounded-xl bg-voxly-surface-3 flex items-center justify-center flex-none font-display font-bold text-sm text-voxly-ink-6">
                            {getInitials(client.name)}
                        </div>
                        <div className="min-w-0">
                            <div className="flex items-center gap-2.5 flex-wrap">
                                <h1 className="font-display font-bold text-[22px] text-foreground tracking-[-0.01em] truncate">{client.name}</h1>
                                <StatusBadge status={client.is_active ? 'active' : 'inactive'} />
                            </div>
                            <p className="text-[12.5px] text-voxly-ink-5 mt-0.5">
                                Added {formatDate(client.created_at)}
                                {!client.is_active && ' · Voxly isn’t replying to this client'}
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setFollowUpOpen(true)}
                            disabled={!client.phone}
                            title={client.phone ? 'Send a WhatsApp message to this client' : 'This client has no phone number on file'}
                            className="gap-2"
                        >
                            <Send className="w-3.5 h-3.5" />
                            Send follow-up
                        </Button>
                        <Button variant="outline" size="sm" asChild className="gap-2">
                            <Link href={`/messages?client=${client.id}`}>
                                <MessageSquare className="w-3.5 h-3.5" />
                                Conversation
                            </Link>
                        </Button>
                        <Button size="sm" onClick={() => setEditOpen(true)} className="gap-2 font-semibold">
                            <Pencil className="w-3.5 h-3.5" />
                            Edit client
                        </Button>
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="outline" size="sm" className="w-9 px-0" aria-label={`More actions for ${client.name}`}>
                                    <MoreVertical className="w-4 h-4" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                                {client.is_active ? (
                                    <DropdownMenuItem onSelect={() => setDeactivateOpen(true)}>
                                        <PauseCircle className="w-4 h-4 mr-2" /> Mark inactive
                                    </DropdownMenuItem>
                                ) : (
                                    <DropdownMenuItem onSelect={() => setActive.mutate({ client, active: true })}>
                                        <PlayCircle className="w-4 h-4 mr-2" /> Reactivate
                                    </DropdownMenuItem>
                                )}
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                    className="text-voxly-heat focus:bg-voxly-heat-soft focus:text-voxly-heat"
                                    onSelect={() => setDeleteOpen(true)}
                                >
                                    <Trash2 className="w-4 h-4 mr-2" /> Delete client
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                </div>

                <div className="p-5 grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    <DetailTile icon={Phone} label="Phone">{formatPhone(client.phone)}</DetailTile>
                    <DetailTile icon={Mail} label="Email">
                        {client.email ? (
                            <a href={`mailto:${client.email}`} className="hover:text-primary transition-colors">{client.email}</a>
                        ) : (
                            <span className="text-voxly-ink-5">—</span>
                        )}
                    </DetailTile>
                    <DetailTile icon={Building} label="Company">
                        {client.company || <span className="text-voxly-ink-5">—</span>}
                    </DetailTile>
                    <DetailTile icon={Send} label="Telegram">
                        {client.telegram_chat_id ? (
                            <span className="font-mono text-[12.5px]">{client.telegram_chat_id}</span>
                        ) : (
                            <span className="text-voxly-ink-5">Not linked</span>
                        )}
                    </DetailTile>
                </div>
            </div>

            {/* Projects */}
            <div className="flex items-center justify-between">
                <h2 className="font-display font-semibold text-[15px] text-foreground">
                    Projects
                    {projects.length > 0 && <span className="ml-2 text-voxly-ink-5 font-normal text-[13px]">{projects.length}</span>}
                </h2>
                <Button onClick={openCreateProject} className="font-semibold text-[13px] rounded-lg px-3.5 py-2 h-auto gap-1.5">
                    <Plus className="w-3.5 h-3.5" /> Add project
                </Button>
            </div>

            {projectsLoading ? (
                <div className="flex items-center justify-center py-12">
                    <Loader2 className="w-6 h-6 animate-spin text-primary" />
                </div>
            ) : projects.length === 0 ? (
                <div className="border border-border rounded-[14px] bg-card py-12 text-center">
                    <div className="w-11 h-11 rounded-xl bg-voxly-surface-2 flex items-center justify-center mx-auto mb-4 text-voxly-ink-6">
                        <FolderGit2 className="w-5 h-5" />
                    </div>
                    <h3 className="text-[14.5px] font-semibold text-foreground mb-1.5">No projects yet</h3>
                    <p className="text-[13px] text-voxly-ink-6 max-w-[300px] mx-auto mb-5">
                        Add a project to track milestones — link its GitHub repo and Voxly can answer status questions with real data.
                    </p>
                    <Button onClick={openCreateProject} className="font-semibold gap-1.5">
                        <Plus className="w-4 h-4" /> Add project
                    </Button>
                </div>
            ) : (
                <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {projects.map((project) => (
                        <div key={project.id} className="group border border-border rounded-[14px] bg-card flex flex-col hover:border-voxly-ink-4 transition-colors">
                            <div className="px-4 pt-4 pb-3 border-b border-border space-y-2">
                                <div className="flex items-start justify-between gap-2">
                                    <Link
                                        href={`/clients/${clientId}/projects/${project.id}/milestones`}
                                        className="font-display font-semibold text-[15px] text-foreground hover:text-primary transition-colors min-w-0 truncate"
                                    >
                                        {project.name}
                                    </Link>
                                    <div className="flex items-center gap-1 flex-none">
                                        <StatusBadge status={project.status} />
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <Button variant="ghost" size="icon" className="w-7 h-7 text-voxly-ink-5 hover:text-foreground" aria-label={`Actions for ${project.name}`}>
                                                    <MoreVertical className="w-4 h-4" />
                                                </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end">
                                                <DropdownMenuItem onSelect={() => openEditProject(project)}>
                                                    <Pencil className="w-4 h-4 mr-2" /> Edit project
                                                </DropdownMenuItem>
                                                <DropdownMenuSeparator />
                                                <DropdownMenuItem
                                                    className="text-voxly-heat focus:bg-voxly-heat-soft focus:text-voxly-heat"
                                                    onSelect={() => setProjectToDelete(project)}
                                                >
                                                    <Trash2 className="w-4 h-4 mr-2" /> Delete project
                                                </DropdownMenuItem>
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </div>
                                </div>
                                {project.github_repo && (
                                    <a
                                        href={`https://github.com/${project.github_repo}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-1 font-mono text-[11px] text-voxly-ink-5 hover:text-foreground transition-colors max-w-full"
                                    >
                                        <GitBranch className="w-3 h-3 flex-none" />
                                        <span className="truncate">{project.github_repo}</span>
                                        <ExternalLink className="w-2.5 h-2.5 flex-none opacity-60" />
                                    </a>
                                )}
                            </div>
                            <div className="p-4 space-y-4 flex-1 flex flex-col">
                                {project.description && (
                                    <p className="text-[12.5px] text-voxly-ink-6 line-clamp-2">{project.description}</p>
                                )}
                                <ProjectProgress project={project} />
                                <div className="grid grid-cols-2 gap-2 text-xs">
                                    <div className="p-2 rounded-lg bg-background border border-border">
                                        <p className="text-voxly-ink-5 mb-0.5 flex items-center gap-1"><Calendar className="w-3 h-3" /> Start</p>
                                        <p className="text-foreground">{formatDate(project.start_date)}</p>
                                    </div>
                                    <div className="p-2 rounded-lg bg-background border border-border">
                                        <p className="text-voxly-ink-5 mb-0.5 flex items-center gap-1"><Clock className="w-3 h-3" /> Due</p>
                                        <p className="text-foreground">{formatDate(project.expected_end_date)}</p>
                                    </div>
                                </div>
                                <Button variant="outline" size="sm" asChild className="w-full mt-auto gap-1.5">
                                    <Link href={`/clients/${clientId}/projects/${project.id}/milestones`}>
                                        View milestones
                                        <ArrowUpRight className="w-3.5 h-3.5 opacity-60" />
                                    </Link>
                                </Button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            <ClientFormDialog open={editOpen} onOpenChange={setEditOpen} client={client} />

            <ProjectFormDialog
                open={projectDialogOpen}
                onOpenChange={(open) => {
                    setProjectDialogOpen(open);
                    if (!open) setEditingProject(null);
                }}
                clientId={clientId}
                clientName={client.name}
                project={editingProject}
            />

            <ConfirmDialog
                open={!!projectToDelete}
                onOpenChange={(open) => { if (!open) setProjectToDelete(null); }}
                title="Delete project?"
                description={
                    <>
                        &ldquo;{projectToDelete?.name}&rdquo; and all of its milestones will be deleted. This can&rsquo;t be undone.
                    </>
                }
                confirmLabel="Delete project"
                pending={deleteProjectMutation.isPending}
                onConfirm={() => projectToDelete && deleteProjectMutation.mutate(projectToDelete.id)}
            />

            <ConfirmDialog
                open={deactivateOpen}
                onOpenChange={setDeactivateOpen}
                title={`Mark ${client.name} inactive?`}
                description="Voxly will stop replying to their WhatsApp and Telegram messages until you reactivate them. Projects and conversation history are kept."
                confirmLabel="Mark inactive"
                destructive={false}
                pending={setActive.isPending}
                onConfirm={() => setActive.mutate({ client, active: false }, { onSuccess: () => setDeactivateOpen(false) })}
            />

            <ConfirmDialog
                open={deleteOpen}
                onOpenChange={setDeleteOpen}
                title="Delete client?"
                description={
                    <>
                        &ldquo;{client.name}&rdquo; will be deleted
                        {projects.length > 0 ? <>, along with {projects.length} {projects.length === 1 ? 'project' : 'projects'} and their milestones</> : null}.
                        This can&rsquo;t be undone.
                    </>
                }
                confirmLabel="Delete client"
                pending={deleteClient.isPending}
                onConfirm={() => deleteClient.mutate(client)}
            />

            <FollowUpDialog
                open={followUpOpen}
                onOpenChange={setFollowUpOpen}
                client={{ id: client.id, name: client.name, phone: client.phone }}
            />
        </div>
    );
}
