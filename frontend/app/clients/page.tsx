'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { clientsAPI } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import {
    Plus,
    Search,
    MoreVertical,
    Pencil,
    Trash2,
    Users,
    Loader2,
} from 'lucide-react';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import Link from 'next/link';
import { formatDate, formatPhone } from '@/lib/utils';
import type { Client } from '@/types';
import { motion, AnimatePresence } from 'framer-motion';

export default function ClientsListPage() {
    const [searchQuery, setSearchQuery] = useState('');
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [clientToDelete, setClientToDelete] = useState<Client | null>(null);
    const { toast } = useToast();
    const queryClient = useQueryClient();

    const { data: clients = [], isLoading } = useQuery({
        queryKey: ['clients'],
        queryFn: async () => {
            const response = await clientsAPI.list();
            return response.data as Client[];
        },
    });

    const deleteMutation = useMutation({
        mutationFn: (id: string) => clientsAPI.delete(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['clients'] });
            toast({
                title: 'Client deleted',
                description: 'The client has been removed.',
            });
            setDeleteDialogOpen(false);
            setClientToDelete(null);
        },
        onError: () => {
            toast({
                variant: 'destructive',
                title: 'Error',
                description: 'Failed to delete client.',
            });
        },
    });

    const filteredClients = clients.filter(
        (client) =>
            client.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            client.company?.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <div className="space-y-6">
            {/* Page header */}
            <motion.div
                className="flex items-center justify-between"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
            >
                <div>
                    <h1 className="text-2xl font-bold text-white">Clients</h1>
                    <p className="text-white/50">Manage your clients and their projects</p>
                </div>
                <Link href="/clients/new">
                    <Button className="bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-500 hover:to-blue-500 text-white border-0 shadow-lg shadow-violet-500/20 btn-glow">
                        <Plus className="w-4 h-4 mr-2" />
                        Add Client
                    </Button>
                </Link>
            </motion.div>

            {/* Stats Summary (Optional) */}
            <motion.div
                className="grid grid-cols-1 md:grid-cols-3 gap-4"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.1 }}
            >
                <div className="glass-card p-4 flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-violet-500/10 flex items-center justify-center border border-violet-500/20">
                        <Users className="w-6 h-6 text-violet-400" />
                    </div>
                    <div>
                        <p className="text-sm text-white/50">Total Clients</p>
                        <p className="text-xl font-bold text-white">{clients.length}</p>
                    </div>
                </div>
                <div className="glass-card p-4 flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20">
                        <Users className="w-6 h-6 text-emerald-400" />
                    </div>
                    <div>
                        <p className="text-sm text-white/50">Active Clients</p>
                        <p className="text-xl font-bold text-white">
                            {clients.filter(c => c.is_active).length}
                        </p>
                    </div>
                </div>
            </motion.div>

            {/* Search */}
            <motion.div
                className="relative max-w-md"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.2 }}
            >
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                <Input
                    placeholder="Search clients..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10 bg-white/5 border-white/10 text-white placeholder:text-white/30 focus:border-violet-500/50 h-11 rounded-xl"
                />
            </motion.div>

            {/* Table */}
            <motion.div
                className="glass-card border-white/5 overflow-hidden"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.5, delay: 0.3 }}
            >
                {(() => {
                    if (isLoading) {
                        return (
                            <div className="p-12 text-center">
                                <Loader2 className="w-8 h-8 animate-spin mx-auto text-violet-500" />
                            </div>
                        );
                    }

                    if (filteredClients.length === 0) {
                        return (
                            <div className="p-12 text-center">
                                <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center mx-auto mb-4 border border-white/10">
                                    <Users className="w-8 h-8 text-white/20" />
                                </div>
                                <h3 className="text-lg font-medium text-white mb-2">
                                    {searchQuery ? 'No clients found' : 'No clients yet'}
                                </h3>
                                <p className="text-white/40 mb-6 max-w-sm mx-auto">
                                    {searchQuery
                                        ? 'Try adjusting your search terms to find what you\'re looking for.'
                                        : 'Get started by adding your first client to manage their projects.'}
                                </p>
                                {!searchQuery && (
                                    <Link href="/clients/new">
                                        <Button className="bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-500 hover:to-blue-500 text-white border-0">
                                            <Plus className="w-4 h-4 mr-2" />
                                            Add Client
                                        </Button>
                                    </Link>
                                )}
                            </div>
                        );
                    }

                    return (
                        <Table>
                            <TableHeader>
                                <TableRow className="border-white/5 hover:bg-white/5">
                                    <TableHead className="text-white/50">Name</TableHead>
                                    <TableHead className="text-white/50">Phone</TableHead>
                                    <TableHead className="text-white/50">Email</TableHead>
                                    <TableHead className="text-white/50">Company</TableHead>
                                    <TableHead className="text-white/50">Status</TableHead>
                                    <TableHead className="text-white/50">Added</TableHead>
                                    <TableHead className="w-[50px]"></TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                <AnimatePresence>
                                    {filteredClients.map((client, index) => (
                                        <motion.tr
                                            key={client.id}
                                            initial={{ opacity: 0, y: 10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            exit={{ opacity: 0, x: -10 }}
                                            transition={{ duration: 0.3, delay: index * 0.05 }}
                                            className="border-white/5 hover:bg-white/5 transition-colors group"
                                        >
                                            <TableCell>
                                                <Link
                                                    href={`/clients/${client.id}`}
                                                    className="font-medium text-white group-hover:text-violet-400 transition-colors"
                                                >
                                                    {client.name}
                                                </Link>
                                            </TableCell>
                                            <TableCell className="text-white/60">
                                                {formatPhone(client.phone)}
                                            </TableCell>
                                            <TableCell className="text-white/60">
                                                {client.email || '—'}
                                            </TableCell>
                                            <TableCell className="text-white/60">
                                                {client.company || '—'}
                                            </TableCell>
                                            <TableCell>
                                                <Badge
                                                    className={client.is_active
                                                        ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/30'
                                                        : 'bg-white/10 text-white/50 border-white/10 hover:bg-white/20'
                                                    }
                                                >
                                                    {client.is_active ? 'Active' : 'Inactive'}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="text-white/40 text-sm">
                                                {formatDate(client.created_at)}
                                            </TableCell>
                                            <TableCell>
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger asChild>
                                                        <Button variant="ghost" size="icon" className="hover:bg-white/10 text-white/50 hover:text-white">
                                                            <MoreVertical className="w-4 h-4" />
                                                        </Button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent align="end" className="glass border-white/10">
                                                        <DropdownMenuItem asChild className="hover:bg-white/5 focus:bg-white/5 cursor-pointer">
                                                            <Link href={`/clients/${client.id}`} className="text-white/70">
                                                                <Pencil className="w-4 h-4 mr-2" />
                                                                Edit
                                                            </Link>
                                                        </DropdownMenuItem>
                                                        <DropdownMenuItem
                                                            className="text-red-400 hover:bg-red-500/10 focus:bg-red-500/10 cursor-pointer"
                                                            onClick={() => {
                                                                setClientToDelete(client);
                                                                setDeleteDialogOpen(true);
                                                            }}
                                                        >
                                                            <Trash2 className="w-4 h-4 mr-2" />
                                                            Delete
                                                        </DropdownMenuItem>
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                            </TableCell>
                                        </motion.tr>
                                    ))}
                                </AnimatePresence>
                            </TableBody>
                        </Table>
                    );
                })()}
            </motion.div>

            {/* Delete confirmation dialog */}
            <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
                <DialogContent className="glass-card border-white/10">
                    <DialogHeader>
                        <DialogTitle className="text-white">Delete Client</DialogTitle>
                        <DialogDescription className="text-white/60">
                            Are you sure you want to delete &quot;{clientToDelete?.name}&quot;?
                            This will also delete all their projects and milestones. This
                            action cannot be undone.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setDeleteDialogOpen(false)}
                            className="border-white/10 text-white hover:bg-white/10"
                        >
                            Cancel
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={() =>
                                clientToDelete && deleteMutation.mutate(clientToDelete.id)
                            }
                            disabled={deleteMutation.isPending}
                            className="bg-red-500 hover:bg-red-600"
                        >
                            {deleteMutation.isPending ? (
                                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                            ) : null}
                            Delete
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
