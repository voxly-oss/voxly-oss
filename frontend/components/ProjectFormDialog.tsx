'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { projectsAPI, getApiErrorMessage } from '@/lib/api';
import { clientsQuery } from '@/lib/queries';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { NativeSelect } from '@/components/ui/native-select';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import FieldError from '@/components/FieldError';
import { useToast } from '@/hooks/use-toast';
import { normalizeGithubRepo, nullIfBlank, undefinedIfBlank } from '@/lib/utils';
import type { Project } from '@/types';

const REPO_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const STATUSES = ['active', 'paused', 'completed', 'cancelled'] as const;
const STATUS_LABEL: Record<(typeof STATUSES)[number], string> = {
    active: 'Active',
    paused: 'Paused',
    completed: 'Completed',
    cancelled: 'Cancelled',
};

const projectSchema = z
    .object({
        client_id: z.string().min(1, 'Choose a client'),
        name: z
            .string()
            .refine((v) => v.trim().length > 0, 'Project name is required')
            .refine((v) => v.trim().length <= 255, 'Keep the name under 255 characters'),
        github_repo: z
            .string()
            .refine((v) => !v.trim() || REPO_RE.test(normalizeGithubRepo(v)), 'Use owner/repo, e.g. acme/checkout-api'),
        description: z.string(),
        status: z.enum(STATUSES),
        start_date: z.string(),
        expected_end_date: z.string(),
    })
    .refine((d) => !d.start_date || !d.expected_end_date || d.expected_end_date >= d.start_date, {
        message: 'The end date can’t be before the start date',
        path: ['expected_end_date'],
    });

type ProjectFormData = z.infer<typeof projectSchema>;

const LABEL = 'text-[12.5px] font-medium text-voxly-ink-6';

function toFormValues(clientId: string, project?: Project | null): ProjectFormData {
    return {
        client_id: project?.client_id ?? clientId,
        name: project?.name ?? '',
        github_repo: project?.github_repo ?? '',
        description: project?.description ?? '',
        status: project?.status ?? 'active',
        start_date: project?.start_date ?? '',
        expected_end_date: project?.expected_end_date ?? '',
    };
}

interface ProjectFormDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** Fixed owner (client detail page). Omit to let the user pick a client. */
    clientId?: string;
    clientName?: string;
    /** Edit this project; omit to create a new one. */
    project?: Project | null;
    onSaved?: (project: Project) => void;
}

/**
 * Create / edit a project. The one project form in the app — used from the
 * client detail page (client fixed) and from /projects (client picker).
 */
export default function ProjectFormDialog({
    open,
    onOpenChange,
    clientId,
    clientName,
    project,
    onSaved,
}: ProjectFormDialogProps) {
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const isEdit = !!project;
    const needsClientPicker = !clientId && !isEdit;

    const { data: clients = [], isLoading: clientsLoading } = useQuery({
        ...clientsQuery,
        enabled: open && needsClientPicker,
    });

    const {
        register,
        handleSubmit,
        reset,
        formState: { errors },
    } = useForm<ProjectFormData>({
        resolver: zodResolver(projectSchema),
        defaultValues: toFormValues(clientId ?? '', project),
    });

    // Re-seed every time the dialog opens, so an edit never shows the
    // previous project's values and a cancelled create starts clean.
    useEffect(() => {
        if (open) reset(toFormValues(clientId ?? '', project));
    }, [open, clientId, project, reset]);

    const mutation = useMutation({
        mutationFn: async (data: ProjectFormData) => {
            const repo = normalizeGithubRepo(data.github_repo);
            if (project) {
                return projectsAPI.update(project.id, {
                    name: data.name.trim(),
                    description: nullIfBlank(data.description),
                    github_repo: nullIfBlank(repo),
                    status: data.status,
                    start_date: nullIfBlank(data.start_date),
                    expected_end_date: nullIfBlank(data.expected_end_date),
                });
            }
            return projectsAPI.create({
                client_id: data.client_id,
                name: data.name.trim(),
                description: undefinedIfBlank(data.description),
                github_repo: undefinedIfBlank(repo),
                status: data.status,
                start_date: undefinedIfBlank(data.start_date),
                expected_end_date: undefinedIfBlank(data.expected_end_date),
            });
        },
        onSuccess: (res) => {
            const saved = res.data as Project;
            // Prefix match covers ['projects'] and ['projects', { client_id }].
            queryClient.invalidateQueries({ queryKey: ['projects'] });
            queryClient.invalidateQueries({ queryKey: ['project', saved.id] });
            queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
            toast({ title: isEdit ? 'Project updated' : 'Project created', description: saved.name });
            onOpenChange(false);
            onSaved?.(saved);
        },
        onError: (err) => {
            toast({
                variant: 'destructive',
                title: isEdit ? 'Couldn’t update project' : 'Couldn’t create project',
                description: getApiErrorMessage(err, 'Please try again.'),
            });
        },
    });

    const describedBy = (field: keyof ProjectFormData) => (errors[field] ? `project-${field}-error` : undefined);
    const noClients = needsClientPicker && !clientsLoading && clients.length === 0;

    return (
        <Dialog open={open} onOpenChange={(next) => { if (!mutation.isPending) onOpenChange(next); }}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{isEdit ? 'Edit project' : 'New project'}</DialogTitle>
                    <DialogDescription className="text-voxly-ink-6">
                        {isEdit
                            ? `Update ${project?.name}.`
                            : clientName
                                ? `Create a project for ${clientName}.`
                                : 'Projects belong to a client. Link a GitHub repo to let Voxly report real progress.'}
                    </DialogDescription>
                </DialogHeader>

                {noClients ? (
                    <div className="rounded-lg border border-border bg-background px-4 py-5 text-center">
                        <p className="text-[13px] text-foreground font-medium mb-1">You need a client first</p>
                        <p className="text-xs text-voxly-ink-5 mb-4">Every project belongs to a client.</p>
                        <Button asChild>
                            <Link href="/clients?new=1" onClick={() => onOpenChange(false)}>Add a client</Link>
                        </Button>
                    </div>
                ) : (
                    <form onSubmit={handleSubmit((data) => mutation.mutate(data))} className="space-y-4" noValidate>
                        {needsClientPicker && (
                            <div className="space-y-1.5">
                                <Label htmlFor="project-client_id" className={LABEL}>Client *</Label>
                                <NativeSelect
                                    id="project-client_id"
                                    disabled={clientsLoading}
                                    aria-invalid={!!errors.client_id}
                                    aria-describedby={describedBy('client_id')}
                                    {...register('client_id')}
                                >
                                    <option value="">{clientsLoading ? 'Loading clients…' : 'Select a client'}</option>
                                    {clients.map((c) => (
                                        <option key={c.id} value={c.id}>{c.company ? `${c.name} — ${c.company}` : c.name}</option>
                                    ))}
                                </NativeSelect>
                                <FieldError id="project-client_id-error" message={errors.client_id?.message} />
                            </div>
                        )}

                        <div className="space-y-1.5">
                            <Label htmlFor="project-name" className={LABEL}>Project name *</Label>
                            <Input
                                id="project-name"
                                placeholder="Checkout redesign"
                                autoFocus
                                aria-invalid={!!errors.name}
                                aria-describedby={describedBy('name')}
                                {...register('name')}
                            />
                            <FieldError id="project-name-error" message={errors.name?.message} />
                        </div>

                        <div className="space-y-1.5">
                            <Label htmlFor="project-github_repo" className={LABEL}>GitHub repository</Label>
                            <Input
                                id="project-github_repo"
                                placeholder="owner/repo"
                                autoComplete="off"
                                spellCheck={false}
                                className="font-mono"
                                aria-invalid={!!errors.github_repo}
                                aria-describedby={describedBy('github_repo') ?? 'project-github_repo-hint'}
                                {...register('github_repo')}
                            />
                            {errors.github_repo ? (
                                <FieldError id="project-github_repo-error" message={errors.github_repo.message} />
                            ) : (
                                <p id="project-github_repo-hint" className="text-[11.5px] text-voxly-ink-5">
                                    Optional. Voxly syncs commits, issues and PRs so it can answer “how’s it going?” with real data.
                                </p>
                            )}
                        </div>

                        <div className="space-y-1.5">
                            <Label htmlFor="project-description" className={LABEL}>Description</Label>
                            <Textarea id="project-description" rows={3} placeholder="What’s being built, in a sentence or two." {...register('description')} />
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                                <Label htmlFor="project-start_date" className={LABEL}>Start date</Label>
                                <Input id="project-start_date" type="date" {...register('start_date')} />
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="project-expected_end_date" className={LABEL}>Expected end date</Label>
                                <Input
                                    id="project-expected_end_date"
                                    type="date"
                                    aria-invalid={!!errors.expected_end_date}
                                    aria-describedby={describedBy('expected_end_date')}
                                    {...register('expected_end_date')}
                                />
                                <FieldError id="project-expected_end_date-error" message={errors.expected_end_date?.message} />
                            </div>
                        </div>

                        <div className="space-y-1.5">
                            <Label htmlFor="project-status" className={LABEL}>Status</Label>
                            <NativeSelect id="project-status" {...register('status')}>
                                {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                            </NativeSelect>
                        </div>

                        <DialogFooter className="pt-2">
                            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>
                                Cancel
                            </Button>
                            <Button type="submit" disabled={mutation.isPending} className="font-semibold">
                                {mutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                                {isEdit ? 'Save changes' : 'Create project'}
                            </Button>
                        </DialogFooter>
                    </form>
                )}
            </DialogContent>
        </Dialog>
    );
}
