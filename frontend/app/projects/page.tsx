'use client';

import { useQuery } from '@tanstack/react-query';
import { projectsAPI, clientsAPI } from '@/lib/api';
import { Button } from '@/components/ui/button';
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
    FolderGit2,
    Loader2,
    ExternalLink,
    GitBranch,
    Users,
    ArrowUpRight,
    Calendar,
    Clock,
} from 'lucide-react';
import Link from 'next/link';
import { formatDate } from '@/lib/utils';
import type { Project, Client } from '@/types';
import { motion } from 'framer-motion';

const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
        opacity: 1,
        transition: { staggerChildren: 0.1 }
    }
};

const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0 }
};

export default function ProjectsListPage() {
    const { data: projects = [], isLoading: projectsLoading } = useQuery({
        queryKey: ['projects'],
        queryFn: async () => {
            const response = await projectsAPI.list();
            return response.data as Project[];
        },
    });

    const { data: clients = [] } = useQuery({
        queryKey: ['clients'],
        queryFn: async () => {
            const response = await clientsAPI.list();
            return response.data as Client[];
        },
    });

    const getClientName = (clientId: string) => {
        const client = clients.find((c) => c.id === clientId);
        return client?.name || 'Unknown Client';
    };

    const getStatusStyle = (status: string) => {
        const styles: Record<string, string> = {
            active: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
            paused: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
            completed: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
            cancelled: 'bg-red-500/20 text-red-400 border-red-500/30',
        };
        return styles[status] || styles.active;
    };

    return (
        <motion.div
            className="space-y-6"
            variants={containerVariants}
            initial="hidden"
            animate="visible"
        >
            {/* Page header */}
            <motion.div variants={itemVariants}>
                <h1 className="text-2xl font-bold text-white">All Projects</h1>
                <p className="text-white/50">
                    View and manage all projects across your clients
                </p>
            </motion.div>

            {/* Projects grid */}
            {projectsLoading ? (
                <div className="flex items-center justify-center py-12">
                    <Loader2 className="w-8 h-8 animate-spin text-violet-500" />
                </div>
            ) : projects.length === 0 ? (
                <motion.div variants={itemVariants}>
                    <Card className="glass-card border-white/5">
                        <CardContent className="py-12 text-center">
                            <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center mx-auto mb-4 border border-white/10">
                                <FolderGit2 className="w-8 h-8 text-white/20" />
                            </div>
                            <h3 className="font-medium text-white mb-2">No projects yet</h3>
                            <p className="text-white/40 mb-6 max-w-sm mx-auto">
                                Projects will appear here once you create them for your clients
                            </p>
                            <Link href="/clients">
                                <Button className="bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-500 hover:to-blue-500 text-white border-0">
                                    Go to Clients
                                </Button>
                            </Link>
                        </CardContent>
                    </Card>
                </motion.div>
            ) : (
                <motion.div
                    className="grid md:grid-cols-2 lg:grid-cols-3 gap-4"
                    variants={containerVariants}
                >
                    {projects.map((project) => (
                        <motion.div key={project.id} variants={itemVariants}>
                            <Card className="glass-card border-white/5 card-hover group h-full">
                                <CardHeader className="pb-3 border-b border-white/5 space-y-3">
                                    <div className="flex items-start justify-between">
                                        <div className="flex items-center gap-2">
                                            <div className="p-1.5 rounded-lg bg-blue-500/10 border border-blue-500/20">
                                                <Users className="w-3 h-3 text-blue-400" />
                                            </div>
                                            <p className="text-xs text-white/50">
                                                {getClientName(project.client_id)}
                                            </p>
                                        </div>
                                        <Badge className={`${getStatusStyle(project.status)} border`}>
                                            {project.status}
                                        </Badge>
                                    </div>
                                    <div className="space-y-1">
                                        <CardTitle className="text-lg text-white group-hover:text-violet-400 transition-colors">
                                            {project.name}
                                        </CardTitle>
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
                                    </div>
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

                                    <Link
                                        href={`/clients/${project.client_id}/projects/${project.id}/milestones`}
                                        className="block"
                                    >
                                        <Button variant="outline" size="sm" className="w-full border-white/10 text-white hover:bg-white/5 group-hover:border-violet-500/30 transition-colors">
                                            View Details
                                            <ArrowUpRight className="w-4 h-4 ml-2 opacity-50" />
                                        </Button>
                                    </Link>
                                </CardContent>
                            </Card>
                        </motion.div>
                    ))}
                </motion.div>
            )}
        </motion.div>
    );
}
