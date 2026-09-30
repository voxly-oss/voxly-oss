'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { clientsAPI, projectsAPI, getApiErrorMessage } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
    Save,
    X,
    Clock,
    ArrowUpRight,
    GitBranch,
    Send,
    MessageSquare,
    MoreVertical,
    Trash2,
} from 'lucide-react';
import Link from 'next/link';
import { formatDate, formatPhone, getInitials, nullIfBlank } from '@/lib/utils';
import type { Client, Project } from '@/types';
import StatusBadge from '@/components/StatusBadge';
import EmptyState from '@/components/EmptyState';
import FieldError from '@/components/FieldError';
import ConfirmDialog from '@/components/ConfirmDialog';
import ProjectFormDialog from '@/components/ProjectFormDialog';
import FollowUpDialog from '@/components/FollowUpDialog';

// Mirrors the backend's phonenumbers.is_possible_number check closely enough
// to catch typos early, without rejecting the spaces/dashes people paste —
// the server normalizes to E.164 either way.
const PHONE_RE = /^\+?[\d\s\-().]+$/;

const editClientSchema = z.object({
    name: z
        .string()
        .refine((v) => v.trim().length > 0, 'Name is required')
        .refine((v) => v.trim().length <= 255, 'Keep the name under 255 characters'),
    phone: z
        .string()
        .refine(
            (v) => PHONE_RE.test(v.trim()) && v.replace(/\D/g, '').length >= 7,
            'Enter a phone number with country code, e.g. +91 97290 41423',
        ),
    email: z.string().refine((v) => !v.trim() || z.email().safeParse(v.trim()).success, 'Enter a valid email address'),
    company: z.string().refine((v) => v.trim().length <= 255, 'Keep the company under 255 characters'),
    telegram_chat_id: z.string().refine((v) => !v.trim() || /^-?\d+$/.test(v.trim()), 'Telegram chat IDs are numbers only'),
});

type EditClientFormData = z.infer<typeof editClientSchema>;

const LABEL = 'text-[12.5px] font-medium text-voxly-ink-6';

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
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const clientId = params.id as string;

    const [editMode, setEditMode] = useState(false);
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

    const editForm = useForm<EditClientFormData>({
        resolver: zodResolver(editClientSchema),
        values: client
            ? {
                name: client.name,
                phone: client.phone,
                email: client.email || '',
                company: client.company || '',
                telegram_chat_id: client.telegram_chat_id || '',
            }
            : undefined,
    });
    const editErrors = editForm.formState.errors;

    const updateClientMutation = useMutation({
        // Blank optional fields go as null so clearing one actually clears it
        // ("" was rejected by the API's EmailStr → every client without an
        // email failed to save).
        mutationFn: (data: EditClientFormData) =>
            clientsAPI.update(clientId, {
                name: data.name.trim(),
                phone: data.phone.trim(),
                email: nullIfBlank(data.email),
                company: nullIfBlank(data.company),
                telegram_chat_id: nullIfBlank(data.telegram_chat_id),
            }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['client', clientId] });
            queryClient.invalidateQueries({ queryKey: ['clients'] });
            toast({ title: 'Client updated' });
            setEditMode(false);
        },
        onError: (err) => {
            toast({ variant: 'destructive', title: 'Couldn’t update client', description: getApiErrorMessage(err, 'Please try again.') });
        },
    });

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
    const cancelEdit = () => {
        editForm.reset();
        setEditMode(false);
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

    const describedBy = (field: keyof EditClientFormData) => (editErrors[field] ? `client-${field}-error` : undefined);

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
                            <p className="text-[12.5px] text-voxly-ink-5 mt-0.5">Added {formatDate(client.created_at)}</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setFollowUpOpen(true)}
                            disabled={!client.phone || editMode}
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
                        {!editMode && (
                            <Button size="sm" onClick={() => setEditMode(true)} className="gap-2 font-semibold">
                                <Pencil className="w-3.5 h-3.5" />
                                Edit client
                            </Button>
                        )}
                    </div>
                </div>

                <div className="p-5">
                    {editMode ? (
                        <form
                            onSubmit={editForm.handleSubmit((data) => updateClientMutation.mutate(data))}
                            className="space-y-5"
                            noValidate
                        >
                            <div className="grid md:grid-cols-2 gap-4">
                                <div className="space-y-1.5">
                                    <Label htmlFor="client-name" className={LABEL}>Name *</Label>
                                    <Input id="client-name" autoFocus aria-invalid={!!editErrors.name} aria-describedby={describedBy('name')} {...editForm.register('name')} />
                                    <FieldError id="client-name-error" message={editErrors.name?.message} />
                                </div>
                                <div className="space-y-1.5">
                                    <Label htmlFor="client-phone" className={LABEL}>Phone *</Label>
                                    <Input id="client-phone" type="tel" inputMode="tel" placeholder="+91 97290 41423" aria-invalid={!!editErrors.phone} aria-describedby={describedBy('phone')} {...editForm.register('phone')} />
                                    <FieldError id="client-phone-error" message={editErrors.phone?.message} />
                                </div>
                                <div className="space-y-1.5">
                                    <Label htmlFor="client-email" className={LABEL}>Email</Label>
                                    <Input id="client-email" type="email" placeholder="name@company.com" aria-invalid={!!editErrors.email} aria-describedby={describedBy('email')} {...editForm.register('email')} />
                                    <FieldError id="client-email-error" message={editErrors.email?.message} />
                                </div>
                                <div className="space-y-1.5">
                                    <Label htmlFor="client-company" className={LABEL}>Company</Label>
                                    <Input id="client-company" aria-invalid={!!editErrors.company} aria-describedby={describedBy('company')} {...editForm.register('company')} />
                                    <FieldError id="client-company-error" message={editErrors.company?.message} />
                                </div>
                                <div className="space-y-1.5">
                                    <Label htmlFor="client-telegram_chat_id" className={LABEL}>Telegram chat ID</Label>
                                    <Input
                                        id="client-telegram_chat_id"
                                        placeholder="e.g. 123456789"
                                        inputMode="numeric"
                                        className="font-mono"
                                        aria-invalid={!!editErrors.telegram_chat_id}
                                        aria-describedby={describedBy('telegram_chat_id') ?? 'client-telegram-hint'}
                                        {...editForm.register('telegram_chat_id')}
                                    />
                                    {editErrors.telegram_chat_id ? (
                                        <FieldError id="client-telegram_chat_id-error" message={editErrors.telegram_chat_id.message} />
                                    ) : (
                                        <p id="client-telegram-hint" className="text-[11.5px] text-voxly-ink-5">
                                            The client gets this by messaging your Voxly bot with /start on Telegram.
                                        </p>
                                    )}
                                </div>
                            </div>
                            <div className="flex justify-end gap-2">
                                <Button type="button" variant="outline" onClick={cancelEdit} disabled={updateClientMutation.isPending} className="gap-2">
                                    <X className="w-4 h-4" />
                                    Cancel
                                </Button>
                                <Button type="submit" disabled={updateClientMutation.isPending} className="gap-2 font-semibold">
                                    {updateClientMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                    Save changes
                                </Button>
                            </div>
                        </form>
                    ) : (
                        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
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
                    )}
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

            <FollowUpDialog
                open={followUpOpen}
                onOpenChange={setFollowUpOpen}
                client={{ id: client.id, name: client.name, phone: client.phone }}
            />
        </div>
    );
}
