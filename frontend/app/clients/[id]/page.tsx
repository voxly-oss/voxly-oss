'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { clientsAPI, projectsAPI } from '@/lib/api';
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
} from 'lucide-react';
import Link from 'next/link';
import { formatDate, formatPhone } from '@/lib/utils';
import type { Client, Project } from '@/types';
import { motion, AnimatePresence } from 'framer-motion';

const editClientSchema = z.object({
    name: z.string().min(1, 'Name is required'),
    phone: z.string().min(10, 'Phone must be at least 10 digits'),
    email: z.string().email('Invalid email').optional().or(z.literal('')),
    company: z.string().optional(),
    telegram_chat_id: z.string().optional(),
});

const projectSchema = z.object({
    name: z.string().min(1, 'Name is required'),
    description: z.string().optional(),
    github_repo: z.string().optional(),
    start_date: z.string().optional(),
    expected_end_date: z.string().optional(),
});

type EditClientFormData = z.infer<typeof editClientSchema>;
type ProjectFormData = z.infer<typeof projectSchema>;

export default function ClientDetailPage() {
    const params = useParams();
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const clientId = params.id as string;

    const [editMode, setEditMode] = useState(false);
    const [projectDialogOpen, setProjectDialogOpen] = useState(false);

    const { data: client, isLoading: clientLoading } = useQuery({
        queryKey: ['client', clientId],
        queryFn: async () => {
            const response = await clientsAPI.get(clientId);
            return response.data as Client;
        },
    });

    const { data: projects = [], isLoading: projectsLoading } = useQuery({
        queryKey: ['projects', { client_id: clientId }],
        queryFn: async () => {
            const response = await projectsAPI.list({ client_id: clientId });
            return response.data as Project[];
        },
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

    const projectForm = useForm<ProjectFormData>({
        resolver: zodResolver(projectSchema),
    });

    const updateClientMutation = useMutation({
        mutationFn: (data: EditClientFormData) => clientsAPI.update(clientId, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['client', clientId] });
            toast({ title: 'Client updated' });
            setEditMode(false);
        },
        onError: () => {
            toast({ variant: 'destructive', title: 'Failed to update client' });
        },
    });

    const createProjectMutation = useMutation({
        mutationFn: (data: ProjectFormData) =>
            projectsAPI.create({ ...data, client_id: clientId }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['projects', { client_id: clientId }] });
            toast({ title: 'Project created' });
            setProjectDialogOpen(false);
            projectForm.reset();
        },
        onError: () => {
            toast({ variant: 'destructive', title: 'Failed to create project' });
        },
    });

    const getStatusStyle = (status: string) => {
        const styles: Record<string, string> = {
            active: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
            paused: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
            completed: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
            cancelled: 'bg-red-500/20 text-red-400 border-red-500/30',
        };
        return styles[status] || styles.active;
    };

    if (clientLoading) {
        return (
            <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-violet-500" />
            </div>
        );
    }

    if (!client) {
        return (
            <div className="text-center py-12">
                <h2 className="text-xl font-semibold text-white">Client not found</h2>
                <Link href="/clients">
                    <Button variant="link" className="text-violet-400">Back to clients</Button>
                </Link>
            </div>
        );
    }

    const projectsContent = (() => {
        if (projectsLoading) {
            return (
                <div className="flex items-center justify-center py-12">
                    <Loader2 className="w-8 h-8 animate-spin text-violet-500" />
                </div>
            );
        }

        if (projects.length === 0) {
            return (
                <Card className="glass-card border-white/5">
                    <CardContent className="py-12 text-center">
                        <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center mx-auto mb-4 border border-white/10">
                            <FolderGit2 className="w-8 h-8 text-white/20" />
                        </div>
                        <h3 className="font-medium text-white mb-2">No projects yet</h3>
                        <p className="text-white/40 mb-6 max-w-sm mx-auto">
                            Create a project to start tracking milestones
                        </p>
                        <Button
                            onClick={() => setProjectDialogOpen(true)}
                            className="bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-500 hover:to-blue-500 text-white border-0"
                        >
                            <Plus className="w-4 h-4 mr-2" />
                            Add Project
                        </Button>
                    </CardContent>
                </Card>
            );
        }

        return (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                {projects.map((project) => (
                    <Card key={project.id} className="glass-card border-white/5 card-hover group h-full">
                        <CardHeader className="pb-3 border-b border-white/5 space-y-3">
                            <div className="flex items-start justify-between">
                                <CardTitle className="text-lg text-white group-hover:text-violet-400 transition-colors">
                                    {project.name}
                                </CardTitle>
                                <Badge className={getStatusStyle(project.status)}>
                                    {project.status}
                                </Badge>
                            </div>
                            {project.github_repo && (
                                <a
                                    href={`https://github.com/${project.github_repo}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 transition-colors"
                                >
                                    <GitBranch className="w-3 h-3" />
                                    {project.github_repo}
                                    <ExternalLink className="w-2.5 h-2.5 opacity-50" />
                                </a>
                            )}
                        </CardHeader>
                        <CardContent className="pt-4 space-y-4">
                            {project.description && (
                                <p className="text-sm text-white/60 line-clamp-2 h-10">
                                    {project.description}
                                </p>
                            )}
                            <div className="space-y-2">
                                <div className="flex justify-between text-xs">
                                    <span className="text-white/40">Progress</span>
                                    <span className="text-white font-medium">0%</span>
                                </div>
                                <Progress value={0} className="h-1.5 bg-white/5" indicatorClassName="bg-gradient-to-r from-violet-500 to-blue-500" />
                            </div>
                            <div className="grid grid-cols-2 gap-2 text-xs">
                                <div className="p-2 rounded-lg bg-white/5 border border-white/5">
                                    <p className="text-white/30 mb-1 flex items-center gap-1">
                                        <Calendar className="w-3 h-3" /> Start
                                    </p>
                                    <p className="text-white/70">{formatDate(project.start_date)}</p>
                                </div>
                                <div className="p-2 rounded-lg bg-white/5 border border-white/5">
                                    <p className="text-white/30 mb-1 flex items-center gap-1">
                                        <Clock className="w-3 h-3" /> Due
                                    </p>
                                    <p className="text-white/70">{formatDate(project.expected_end_date)}</p>
                                </div>
                            </div>
                            <Link href={`/clients/${clientId}/projects/${project.id}/milestones`}>
                                <Button variant="outline" size="sm" className="w-full border-white/10 text-white hover:bg-white/5 group-hover:border-violet-500/30 transition-colors">
                                    View Details
                                    <ArrowUpRight className="w-4 h-4 ml-2 opacity-50" />
                                </Button>
                            </Link>
                        </CardContent>
                    </Card>
                ))}
            </div>
        );
    })();

    return (
        <motion.div
            className="space-y-6"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5 }}
        >
            {/* Back button */}
            <Link
                href="/clients"
                className="inline-flex items-center text-sm text-white/50 hover:text-white transition-colors"
            >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to clients
            </Link>

            {/* Client info card */}
            <Card className="glass-card border-white/5 gradient-border">
                <CardHeader className="flex flex-row items-start justify-between border-b border-white/5 pb-6">
                    <div>
                        <CardTitle className="text-2xl text-white">{client.name}</CardTitle>
                        <CardDescription className="text-white/40">
                            Added on {formatDate(client.created_at)}
                        </CardDescription>
                    </div>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setEditMode(!editMode)}
                        className="border-white/10 text-white hover:bg-white/5"
                    >
                        {editMode ? (
                            <>
                                <X className="w-4 h-4 mr-2" />
                                Cancel
                            </>
                        ) : (
                            <>
                                <Pencil className="w-4 h-4 mr-2" />
                                Edit Matches
                            </>
                        )}
                    </Button>
                </CardHeader>
                <CardContent className="pt-6">
                    <AnimatePresence mode="wait">
                        {editMode ? (
                            <motion.form
                                key="edit-form"
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -10 }}
                                onSubmit={editForm.handleSubmit((data) =>
                                    updateClientMutation.mutate(data)
                                )}
                                className="space-y-6"
                            >
                                <div className="grid md:grid-cols-2 gap-6">
                                    <div className="space-y-2">
                                        <Label htmlFor="name" className="text-white/70">Name</Label>
                                        <Input
                                            id="name"
                                            {...editForm.register('name')}
                                            className="bg-white/5 border-white/10 text-white placeholder:text-white/30 focus:border-violet-500/50 h-11"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="phone" className="text-white/70">Phone</Label>
                                        <Input
                                            id="phone"
                                            {...editForm.register('phone')}
                                            className="bg-white/5 border-white/10 text-white placeholder:text-white/30 focus:border-violet-500/50 h-11"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="email" className="text-white/70">Email</Label>
                                        <Input
                                            id="email"
                                            {...editForm.register('email')}
                                            className="bg-white/5 border-white/10 text-white placeholder:text-white/30 focus:border-violet-500/50 h-11"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="company" className="text-white/70">Company</Label>
                                        <Input
                                            id="company"
                                            {...editForm.register('company')}
                                            className="bg-white/5 border-white/10 text-white placeholder:text-white/30 focus:border-violet-500/50 h-11"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="telegram_chat_id" className="text-white/70 flex items-center gap-2">
                                            <Send className="w-3.5 h-3.5 text-blue-400" />
                                            Telegram Chat ID
                                        </Label>
                                        <Input
                                            id="telegram_chat_id"
                                            placeholder="e.g. 123456789"
                                            {...editForm.register('telegram_chat_id')}
                                            className="bg-white/5 border-white/10 text-white placeholder:text-white/30 focus:border-violet-500/50 h-11"
                                        />
                                        <p className="text-xs text-white/40">
                                            Client gets this by messaging your Voxly Bot with /start on Telegram
                                        </p>
                                    </div>
                                </div>
                                <div className="flex justify-end gap-3">
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        onClick={() => setEditMode(false)}
                                        className="text-white/60 hover:text-white hover:bg-white/10"
                                    >
                                        Cancel
                                    </Button>
                                    <Button
                                        type="submit"
                                        disabled={updateClientMutation.isPending}
                                        className="bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-500 hover:to-blue-500 text-white border-0"
                                    >
                                        {updateClientMutation.isPending ? (
                                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                        ) : (
                                            <Save className="w-4 h-4 mr-2" />
                                        )}
                                        Save Changes
                                    </Button>
                                </div>
                            </motion.form>
                        ) : (
                            <motion.div
                                key="view-details"
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -10 }}
                                className="grid md:grid-cols-2 lg:grid-cols-5 gap-6"
                            >
                                <div className="flex items-center gap-3 p-4 rounded-xl bg-white/5 border border-white/5">
                                    <div className="p-2.5 bg-blue-500/10 rounded-lg border border-blue-500/20">
                                        <Phone className="w-4 h-4 text-blue-400" />
                                    </div>
                                    <div>
                                        <p className="text-xs text-white/40 mb-0.5">Phone</p>
                                        <p className="font-medium text-white">{formatPhone(client.phone)}</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3 p-4 rounded-xl bg-white/5 border border-white/5">
                                    <div className="p-2.5 bg-emerald-500/10 rounded-lg border border-emerald-500/20">
                                        <Mail className="w-4 h-4 text-emerald-400" />
                                    </div>
                                    <div>
                                        <p className="text-xs text-white/40 mb-0.5">Email</p>
                                        <p className="font-medium text-white">{client.email || '—'}</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3 p-4 rounded-xl bg-white/5 border border-white/5">
                                    <div className="p-2.5 bg-violet-500/10 rounded-lg border border-violet-500/20">
                                        <Building className="w-4 h-4 text-violet-400" />
                                    </div>
                                    <div>
                                        <p className="text-xs text-white/40 mb-0.5">Company</p>
                                        <p className="font-medium text-white">{client.company || '—'}</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3 p-4 rounded-xl bg-white/5 border border-white/5">
                                    <div className="p-2.5 bg-amber-500/10 rounded-lg border border-amber-500/20">
                                        <Calendar className="w-4 h-4 text-amber-400" />
                                    </div>
                                    <div>
                                        <p className="text-xs text-white/40 mb-0.5">Status</p>
                                        <Badge
                                            className={client.is_active
                                                ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/20'
                                                : 'bg-white/10 text-white/50 border-white/10'
                                            }
                                        >
                                            {client.is_active ? 'Active' : 'Inactive'}
                                        </Badge>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3 p-4 rounded-xl bg-white/5 border border-white/5">
                                    <div className="p-2.5 bg-blue-500/10 rounded-lg border border-blue-500/20">
                                        <Send className="w-4 h-4 text-blue-400" />
                                    </div>
                                    <div>
                                        <p className="text-xs text-white/40 mb-0.5">Telegram</p>
                                        <p className="font-medium text-white">
                                            {client.telegram_chat_id ? (
                                                <span className="font-mono text-sm">{client.telegram_chat_id}</span>
                                            ) : (
                                                <span className="text-white/30">Not linked</span>
                                            )}
                                        </p>
                                    </div>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </CardContent>
            </Card>

            {/* Projects section */}
            <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold text-white">Projects</h2>
                <Button
                    onClick={() => setProjectDialogOpen(true)}
                    className="bg-white/10 hover:bg-white/20 text-white border-0"
                >
                    <Plus className="w-4 h-4 mr-2" />
                    Add Project
                </Button>
            </div>

            {projectsContent}

            {/* Add project dialog */}
            <Dialog open={projectDialogOpen} onOpenChange={setProjectDialogOpen}>
                <DialogContent className="glass-card border-white/10">
                    <DialogHeader>
                        <DialogTitle className="text-white">Add New Project</DialogTitle>
                        <DialogDescription className="text-white/60">
                            Create a project for {client.name}
                        </DialogDescription>
                    </DialogHeader>
                    <form
                        onSubmit={projectForm.handleSubmit((data) =>
                            createProjectMutation.mutate(data)
                        )}
                        className="space-y-4"
                    >
                        <div className="space-y-2">
                            <Label htmlFor="project-name" className="text-white/70">Project Name *</Label>
                            <Input
                                id="project-name"
                                placeholder="My Awesome App"
                                className="bg-white/5 border-white/10 text-white placeholder:text-white/30 focus:border-violet-500/50"
                                {...projectForm.register('name')}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="github-repo" className="text-white/70">GitHub Repository</Label>
                            <Input
                                id="github-repo"
                                placeholder="owner/repo"
                                className="bg-white/5 border-white/10 text-white placeholder:text-white/30 focus:border-violet-500/50"
                                {...projectForm.register('github_repo')}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="description" className="text-white/70">Description</Label>
                            <Input
                                id="description"
                                placeholder="Brief description..."
                                className="bg-white/5 border-white/10 text-white placeholder:text-white/30 focus:border-violet-500/50"
                                {...projectForm.register('description')}
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="start-date" className="text-white/70">Start Date</Label>
                                <Input
                                    id="start-date"
                                    type="date"
                                    className="bg-white/5 border-white/10 text-white placeholder:text-white/30 focus:border-violet-500/50"
                                    {...projectForm.register('start_date')}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="end-date" className="text-white/70">Expected End Date</Label>
                                <Input
                                    id="end-date"
                                    type="date"
                                    className="bg-white/5 border-white/10 text-white placeholder:text-white/30 focus:border-violet-500/50"
                                    {...projectForm.register('expected_end_date')}
                                />
                            </div>
                        </div>
                        <DialogFooter className="gap-2">
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => setProjectDialogOpen(false)}
                                className="border-white/10 text-white hover:bg-white/10"
                            >
                                Cancel
                            </Button>
                            <Button
                                type="submit"
                                disabled={createProjectMutation.isPending}
                                className="bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-500 hover:to-blue-500 text-white border-0"
                            >
                                {createProjectMutation.isPending && (
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                )}
                                Create Project
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </motion.div>
    );
}
