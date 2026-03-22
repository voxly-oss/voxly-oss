'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { clientsAPI, projectsAPI, milestonesAPI } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
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
    ArrowLeft,
    Loader2,
    Plus,
    GitBranch,
    GitCommit,
    AlertCircle,
    CheckCircle2,
    Clock,
    Trash2,
    Pencil,
    ExternalLink,
} from 'lucide-react';
import Link from 'next/link';
import { formatDate, getStatusColor } from '@/lib/utils';
import type { Client, Project, Milestone } from '@/types';

const milestoneSchema = z.object({
    title: z.string().min(1, 'Title is required'),
    description: z.string().optional(),
    status: z.string().optional(),
    progress: z.number().min(0).max(100).optional().default(0),
    due_date: z.string().optional(),
});

type MilestoneFormData = z.infer<typeof milestoneSchema>;

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
        queryFn: async () => {
            const response = await clientsAPI.get(clientId);
            return response.data as Client;
        },
    });

    const { data: project, isLoading: projectLoading } = useQuery({
        queryKey: ['project', projectId],
        queryFn: async () => {
            const response = await projectsAPI.get(projectId);
            return response.data as Project;
        },
    });

    const { data: milestones = [], isLoading: milestonesLoading } = useQuery({
        queryKey: ['milestones', { project_id: projectId }],
        queryFn: async () => {
            const response = await milestonesAPI.list({ project_id: projectId });
            return response.data as Milestone[];
        },
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const milestoneForm = useForm<MilestoneFormData>({
        resolver: zodResolver(milestoneSchema) as any,
        defaultValues: {
            status: 'pending',
            progress: 0,
        },
    });

    const createMilestoneMutation = useMutation({
        mutationFn: (data: MilestoneFormData) =>
            milestonesAPI.create({ ...data, project_id: projectId }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['milestones', { project_id: projectId }] });
            toast({ title: 'Milestone created' });
            setMilestoneDialogOpen(false);
            milestoneForm.reset({ status: 'pending', progress: 0 });
        },
        onError: () => {
            toast({ variant: 'destructive', title: 'Failed to create milestone' });
        },
    });

    const updateMilestoneMutation = useMutation({
        mutationFn: ({ id, data }: { id: string; data: MilestoneFormData }) =>
            milestonesAPI.update(id, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['milestones', { project_id: projectId }] });
            toast({ title: 'Milestone updated' });
            setEditingMilestone(null);
            setMilestoneDialogOpen(false);
            milestoneForm.reset({ status: 'pending', progress: 0 });
        },
        onError: () => {
            toast({ variant: 'destructive', title: 'Failed to update milestone' });
        },
    });

    const deleteMilestoneMutation = useMutation({
        mutationFn: (id: string) => milestonesAPI.delete(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['milestones', { project_id: projectId }] });
            toast({ title: 'Milestone deleted' });
        },
        onError: () => {
            toast({ variant: 'destructive', title: 'Failed to delete milestone' });
        },
    });

    const overallProgress =
        milestones.length > 0
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
        if (editingMilestone) {
            updateMilestoneMutation.mutate({ id: editingMilestone.id, data });
        } else {
            createMilestoneMutation.mutate(data);
        }
    };

    if (projectLoading) {
        return (
            <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
            </div>
        );
    }

    if (!project) {
        return (
            <div className="text-center py-12">
                <h2 className="text-xl font-semibold text-gray-900">Project not found</h2>
                <Link href={`/clients/${clientId}`}>
                    <Button variant="link">Back to client</Button>
                </Link>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Breadcrumb */}
            <div className="flex items-center gap-2 text-sm text-gray-600">
                <Link href="/clients" className="hover:text-gray-900">
                    Clients
                </Link>
                <span>/</span>
                <Link href={`/clients/${clientId}`} className="hover:text-gray-900">
                    {client?.name || 'Client'}
                </Link>
                <span>/</span>
                <span className="text-gray-900">{project.name}</span>
            </div>

            {/* Project header */}
            <Card>
                <CardHeader>
                    <div className="flex items-start justify-between">
                        <div>
                            <CardTitle className="text-2xl flex items-center gap-3">
                                {project.name}
                                <Badge className={getStatusColor(project.status)}>
                                    {project.status}
                                </Badge>
                            </CardTitle>
                            {project.github_repo && (
                                <a
                                    href={`https://github.com/${project.github_repo}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-blue-600 hover:underline flex items-center gap-1 mt-1"
                                >
                                    <GitBranch className="w-4 h-4" />
                                    {project.github_repo}
                                    <ExternalLink className="w-3 h-3" />
                                </a>
                            )}
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="grid md:grid-cols-4 gap-6">
                        {/* GitHub stats placeholder */}
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-gray-100 rounded-lg">
                                <GitCommit className="w-5 h-5 text-gray-600" />
                            </div>
                            <div>
                                <p className="text-sm text-gray-500">Commits (7d)</p>
                                <p className="text-xl font-semibold">—</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-yellow-100 rounded-lg">
                                <AlertCircle className="w-5 h-5 text-yellow-600" />
                            </div>
                            <div>
                                <p className="text-sm text-gray-500">Open Issues</p>
                                <p className="text-xl font-semibold">—</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-green-100 rounded-lg">
                                <CheckCircle2 className="w-5 h-5 text-green-600" />
                            </div>
                            <div>
                                <p className="text-sm text-gray-500">Overall Progress</p>
                                <p className="text-xl font-semibold">{overallProgress}%</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-blue-100 rounded-lg">
                                <Clock className="w-5 h-5 text-blue-600" />
                            </div>
                            <div>
                                <p className="text-sm text-gray-500">Due Date</p>
                                <p className="text-xl font-semibold">
                                    {formatDate(project.expected_end_date)}
                                </p>
                            </div>
                        </div>
                    </div>
                    <div className="mt-6">
                        <div className="flex justify-between text-sm mb-2">
                            <span className="text-gray-600">Overall Progress</span>
                            <span className="font-medium">{overallProgress}%</span>
                        </div>
                        <Progress value={overallProgress} className="h-2" />
                    </div>
                </CardContent>
            </Card>

            {/* Milestones section */}
            <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold text-gray-900">Milestones</h2>
                <Button onClick={() => setMilestoneDialogOpen(true)}>
                    <Plus className="w-4 h-4 mr-2" />
                    Add Milestone
                </Button>
            </div>

            {milestonesLoading ? (
                <div className="space-y-4">
                    {[...Array(3)].map((_, i) => (
                        <div key={i} className="h-24 bg-gray-100 rounded-lg animate-pulse" />
                    ))}
                </div>
            ) : milestones.length === 0 ? (
                <Card>
                    <CardContent className="py-12 text-center">
                        <CheckCircle2 className="w-12 h-12 mx-auto text-gray-300 mb-4" />
                        <h3 className="font-medium text-gray-900 mb-2">No milestones yet</h3>
                        <p className="text-gray-600 mb-4">
                            Add milestones to track project progress
                        </p>
                        <Button onClick={() => setMilestoneDialogOpen(true)}>
                            <Plus className="w-4 h-4 mr-2" />
                            Add Milestone
                        </Button>
                    </CardContent>
                </Card>
            ) : (
                <div className="space-y-4">
                    {milestones.map((milestone) => (
                        <Card key={milestone.id}>
                            <CardContent className="p-4">
                                <div className="flex items-start justify-between gap-4">
                                    <div className="flex-1">
                                        <div className="flex items-center gap-3 mb-2">
                                            <h3 className="font-semibold text-gray-900">
                                                {milestone.title}
                                            </h3>
                                            <Badge className={getStatusColor(milestone.status)}>
                                                {milestone.status.replace('_', ' ')}
                                            </Badge>
                                        </div>
                                        {milestone.description && (
                                            <p className="text-sm text-gray-600 mb-3">
                                                {milestone.description}
                                            </p>
                                        )}
                                        <div className="space-y-2">
                                            <div className="flex justify-between text-sm">
                                                <span className="text-gray-600">Progress</span>
                                                <span className="font-medium">{milestone.progress}%</span>
                                            </div>
                                            <Progress value={milestone.progress} className="h-2" />
                                        </div>
                                        {milestone.due_date && (
                                            <p className="text-xs text-gray-500 mt-2">
                                                Due: {formatDate(milestone.due_date)}
                                            </p>
                                        )}
                                    </div>
                                    <div className="flex gap-2">
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => openEditDialog(milestone)}
                                        >
                                            <Pencil className="w-4 h-4" />
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="text-red-600"
                                            onClick={() => deleteMilestoneMutation.mutate(milestone.id)}
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </Button>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}

            {/* Add/Edit milestone dialog */}
            <Dialog open={milestoneDialogOpen} onOpenChange={closeDialog}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>
                            {editingMilestone ? 'Edit Milestone' : 'Add New Milestone'}
                        </DialogTitle>
                        <DialogDescription>
                            {editingMilestone
                                ? 'Update milestone details'
                                : 'Create a milestone to track progress'}
                        </DialogDescription>
                    </DialogHeader>
                    <form onSubmit={milestoneForm.handleSubmit(handleSubmit)} className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="milestone-title">Title *</Label>
                            <Input
                                id="milestone-title"
                                placeholder="e.g., Backend API Complete"
                                {...milestoneForm.register('title')}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="milestone-description">Description</Label>
                            <Input
                                id="milestone-description"
                                placeholder="Brief description..."
                                {...milestoneForm.register('description')}
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="milestone-status">Status</Label>
                                <select
                                    id="milestone-status"
                                    className="w-full h-10 px-3 rounded-md border border-input bg-background"
                                    {...milestoneForm.register('status')}
                                >
                                    <option value="pending">Pending</option>
                                    <option value="in_progress">In Progress</option>
                                    <option value="completed">Completed</option>
                                    <option value="blocked">Blocked</option>
                                </select>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="milestone-progress">Progress (%)</Label>
                                <Input
                                    id="milestone-progress"
                                    type="number"
                                    min="0"
                                    max="100"
                                    {...milestoneForm.register('progress')}
                                />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="milestone-due">Due Date</Label>
                            <Input
                                id="milestone-due"
                                type="date"
                                {...milestoneForm.register('due_date')}
                            />
                        </div>
                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={closeDialog}>
                                Cancel
                            </Button>
                            <Button
                                type="submit"
                                disabled={
                                    createMilestoneMutation.isPending ||
                                    updateMilestoneMutation.isPending
                                }
                            >
                                {(createMilestoneMutation.isPending ||
                                    updateMilestoneMutation.isPending) && (
                                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                    )}
                                {editingMilestone ? 'Update' : 'Create'} Milestone
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </div>
    );
}
