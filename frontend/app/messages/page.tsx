'use client';

import { useState, useEffect } from 'react';
import { useQuery, keepPreviousData, useQueryClient } from '@tanstack/react-query';
import { useWebSocket } from '@/hooks/useWebSocket';
import { chatAPI } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import {
    MessageSquare,
    Search,
    Bot,
    User as UserIcon,
    ChevronLeft,
    ChevronRight,
    Clock,
    Inbox,
    Sparkles,
    ArrowUpRight,
    Filter,
} from 'lucide-react';

/* ─── Types ─── */
interface ChatMessage {
    id: string;
    client_id: string;
    client_name?: string;
    sender: 'client' | 'ai';
    message: string;
    ai_response?: string;
    tokens_used?: number;
    model_used?: string;
    created_at: string;
}

/* ─── Animation Variants ─── */
const containerVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { staggerChildren: 0.05 } },
};
const itemVariants = {
    hidden: { opacity: 0, y: 12 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.3 } },
};

/* ─── Helpers ─── */
function formatTimestamp(dateString: string) {
    const d = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays}d ago`;

    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function truncate(str: string, len: number) {
    return str.length > len ? str.slice(0, len) + '…' : str;
}

/* ─── Empty State ─── */
function EmptyMessages() {
    return (
        <motion.div
            className="flex flex-col items-center justify-center py-20 text-center"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
        >
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-violet-500/20 to-blue-500/20 border border-violet-500/20 flex items-center justify-center mb-6">
                <Inbox className="w-10 h-10 text-violet-400" />
            </div>
            <h3 className="text-xl font-semibold text-white mb-2">
                No messages yet
            </h3>
            <p className="text-white/40 max-w-md mb-6">
                Messages from your WhatsApp-connected clients will appear here.
                Set up a client with a phone number to get started.
            </p>
            <Link href="/clients/new">
                <Button className="bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-500 hover:to-blue-500 text-white border-0 shadow-lg shadow-violet-500/20">
                    <UserIcon className="w-4 h-4 mr-2" />
                    Add a Client
                </Button>
            </Link>
        </motion.div>
    );
}

/* ─── Skeleton Loader ─── */
function MessageSkeleton() {
    return (
        <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
                <div key={i} className="glass-card p-4 border border-white/5 animate-pulse">
                    <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-xl bg-white/10 shrink-0" />
                        <div className="flex-1 space-y-2">
                            <div className="flex items-center gap-2">
                                <div className="h-4 w-24 bg-white/10 rounded" />
                                <div className="h-3 w-16 bg-white/5 rounded" />
                            </div>
                            <div className="h-4 w-3/4 bg-white/10 rounded" />
                            <div className="h-4 w-1/2 bg-white/5 rounded" />
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
}

/* ═══════════════════ MESSAGES PAGE ═══════════════════ */
const PAGE_SIZE = 20;

export default function MessagesPage() {
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(0);
    const [filterSender, setFilterSender] = useState<'all' | 'client' | 'ai'>('all');

    const { data: messagesData, isLoading } = useQuery<{ messages: ChatMessage[]; total: number }>({
        queryKey: ['messages', page],
        queryFn: async () => {
            const res = await chatAPI.allMessages({ skip: page * PAGE_SIZE, limit: PAGE_SIZE });
            return res.data as { messages: ChatMessage[]; total: number };
        },
        placeholderData: keepPreviousData,
    });

    // Real-time updates
    const queryClient = useQueryClient();
    const { lastMessage } = useWebSocket();

    useEffect(() => {
        if (!lastMessage) return;

        if (lastMessage.type === 'new_message') {
            const newMsg = lastMessage.message;
            // Optimistically update the cache
            queryClient.setQueryData(['messages', 0], (old: { messages: ChatMessage[]; total: number } | undefined) => {
                if (!old) return { messages: [newMsg], total: 1 };
                
                // Avoid duplicates
                if (old.messages.some(m => m.id === newMsg.id)) return old;

                return {
                    ...old,
                    total: old.total + 1,
                    messages: [newMsg, ...old.messages].slice(0, PAGE_SIZE), // Keep page size verified
                };
            });
            // Also invalidate to ensure consistency eventually
            queryClient.invalidateQueries({ queryKey: ['messages'] });
        }
    }, [lastMessage, queryClient]);

    const messages: ChatMessage[] = messagesData?.messages ?? [];
    const total: number = messagesData?.total ?? 0;
    const totalPages = Math.ceil(total / PAGE_SIZE);

    // Client-side search + filter
    const filteredMessages = messages.filter((msg: ChatMessage) => {
        const matchesSearch =
            !search ||
            msg.message?.toLowerCase().includes(search.toLowerCase()) ||
            msg.ai_response?.toLowerCase().includes(search.toLowerCase()) ||
            msg.client_name?.toLowerCase().includes(search.toLowerCase());

        const matchesFilter =
            filterSender === 'all' || msg.sender === filterSender;

        return matchesSearch && matchesFilter;
    });

    return (
        <motion.div
            className="space-y-6"
            variants={containerVariants}
            initial="hidden"
            animate="visible"
        >
            {/* Page Header */}
            <motion.div
                className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
                variants={itemVariants}
            >
                <div>
                    <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                        Messages
                        <Sparkles className="w-5 h-5 text-violet-400" />
                    </h1>
                    <p className="text-white/50">
                        AI conversations across all your clients
                        {total > 0 && (
                            <span className="text-white/30"> · {total} total</span>
                        )}
                    </p>
                </div>
            </motion.div>

            {/* Search + Filters */}
            <motion.div
                className="glass-card p-4 border border-white/5 flex flex-col sm:flex-row gap-3"
                variants={itemVariants}
            >
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                    <Input
                        placeholder="Search messages, clients..."
                        className="pl-10 bg-white/5 border-white/10 text-white placeholder:text-white/30 focus:border-violet-500/50 h-10"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>
                <div className="flex gap-2">
                    {[
                        { key: 'all' as const, label: 'All' },
                        { key: 'client' as const, label: 'Client', icon: UserIcon },
                        { key: 'ai' as const, label: 'AI', icon: Bot },
                    ].map((f) => (
                        <Button
                            key={f.key}
                            variant={filterSender === f.key ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => setFilterSender(f.key)}
                            className={
                                filterSender === f.key
                                    ? 'bg-gradient-to-r from-violet-600 to-blue-600 text-white border-0'
                                    : 'border-white/10 text-white/60 hover:text-white hover:bg-white/5'
                            }
                        >
                            {f.icon && <f.icon className="w-3.5 h-3.5 mr-1" />}
                            {f.label}
                        </Button>
                    ))}
                </div>
            </motion.div>

            {/* Messages List */}
            <motion.div variants={itemVariants}>
                {isLoading ? (
                    <MessageSkeleton />
                ) : messages.length === 0 ? (
                    <EmptyMessages />
                ) : filteredMessages.length === 0 ? (
                    <div className="text-center py-16">
                        <Filter className="w-10 h-10 text-white/20 mx-auto mb-3" />
                        <p className="text-white/40">
                            No messages match your search or filter.
                        </p>
                    </div>
                ) : (
                    <AnimatePresence mode="popLayout">
                        <div className="space-y-3">
                            {filteredMessages.map((msg, index) => (
                                <motion.div
                                    key={msg.id}
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -10 }}
                                    transition={{ delay: index * 0.03, duration: 0.25 }}
                                >
                                    <Card className="glass-card border-white/5 hover:border-white/10 transition-all group">
                                        <CardContent className="p-4">
                                            <div className="flex items-start gap-3">
                                                {/* Avatar */}
                                                <div
                                                    className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${
                                                        msg.sender === 'ai'
                                                            ? 'bg-gradient-to-br from-violet-500/20 to-blue-500/20 border-violet-500/20'
                                                            : 'bg-gradient-to-br from-emerald-500/20 to-green-500/20 border-emerald-500/20'
                                                    }`}
                                                >
                                                    {msg.sender === 'ai' ? (
                                                        <Bot className="w-5 h-5 text-violet-400" />
                                                    ) : (
                                                        <UserIcon className="w-5 h-5 text-emerald-400" />
                                                    )}
                                                </div>

                                                {/* Content */}
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                                                        <Link
                                                            href={`/clients/${msg.client_id}`}
                                                            className="text-sm font-medium text-white hover:text-violet-400 transition-colors"
                                                        >
                                                            {msg.client_name || 'Unknown Client'}
                                                        </Link>
                                                        <Badge
                                                            className={`text-[10px] px-1.5 py-0 border ${
                                                                msg.sender === 'ai'
                                                                    ? 'bg-violet-500/10 text-violet-400 border-violet-500/20'
                                                                    : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                                            }`}
                                                        >
                                                            {msg.sender === 'ai' ? 'AI' : 'Client'}
                                                        </Badge>
                                                        {msg.model_used && msg.model_used !== 'no_project' && (
                                                            <span className="text-[10px] text-white/20">
                                                                {msg.model_used}
                                                            </span>
                                                        )}
                                                        <span className="text-xs text-white/30 ml-auto flex items-center gap-1 shrink-0">
                                                            <Clock className="w-3 h-3" />
                                                            {formatTimestamp(msg.created_at)}
                                                        </span>
                                                    </div>

                                                    {/* Client message */}
                                                    <p className="text-sm text-white/70 mb-1">
                                                        {truncate(msg.message, 200)}
                                                    </p>

                                                    {/* AI response preview */}
                                                    {msg.ai_response && (
                                                        <div className="mt-2 pl-3 border-l-2 border-violet-500/30">
                                                            <p className="text-sm text-white/50">
                                                                {truncate(msg.ai_response, 200)}
                                                            </p>
                                                        </div>
                                                    )}

                                                    {/* Metadata */}
                                                    {msg.tokens_used != null && msg.tokens_used > 0 && (
                                                        <div className="mt-2 flex items-center gap-3 text-xs text-white/20">
                                                            <span>{msg.tokens_used} tokens</span>
                                                        </div>
                                                    )}
                                                </div>

                                                {/* View client link */}
                                                <Link
                                                    href={`/clients/${msg.client_id}`}
                                                    className="opacity-0 group-hover:opacity-100 transition-opacity"
                                                >
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        className="text-white/30 hover:text-white hover:bg-white/5"
                                                    >
                                                        <ArrowUpRight className="w-4 h-4" />
                                                    </Button>
                                                </Link>
                                            </div>
                                        </CardContent>
                                    </Card>
                                </motion.div>
                            ))}
                        </div>
                    </AnimatePresence>
                )}
            </motion.div>

            {/* Pagination */}
            {totalPages > 1 && (
                <motion.div
                    className="flex items-center justify-between"
                    variants={itemVariants}
                >
                    <p className="text-sm text-white/40">
                        Page {page + 1} of {totalPages}
                    </p>
                    <div className="flex gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            disabled={page === 0}
                            onClick={() => setPage((p) => Math.max(0, p - 1))}
                            className="border-white/10 text-white/60 hover:text-white hover:bg-white/5 disabled:opacity-30"
                        >
                            <ChevronLeft className="w-4 h-4 mr-1" />
                            Previous
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            disabled={page >= totalPages - 1}
                            onClick={() => setPage((p) => p + 1)}
                            className="border-white/10 text-white/60 hover:text-white hover:bg-white/5 disabled:opacity-30"
                        >
                            Next
                            <ChevronRight className="w-4 h-4 ml-1" />
                        </Button>
                    </div>
                </motion.div>
            )}
        </motion.div>
    );
}
