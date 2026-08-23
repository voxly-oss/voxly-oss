'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
    MessageSquare,
    LayoutDashboard,
    Users,
    FolderGit2,
    Settings,
    LogOut,
    Bell,
    Search,
    Menu,
    X,
    Sparkles,
    TrendingUp,
    Zap,
    Radio,
} from 'lucide-react';
import { cn, getInitials } from '@/lib/utils';
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import VoxlyLogo from '@/components/VoxlyLogo';

// Labels and order follow the v3 IA (Conversations, Channels, AI Agents) — routes unchanged.
const navigation = [
    { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
    { name: 'Clients', href: '/clients', icon: Users },
    { name: 'Projects', href: '/projects', icon: FolderGit2 },
    { name: 'Conversations', href: '/messages', icon: MessageSquare },
    { name: 'Channels', href: '/channels', icon: Radio },
    { name: 'AI Agents', href: '/agents', icon: Sparkles },
    { name: 'Analytics', href: '/analytics', icon: TrendingUp },
    { name: 'Automations', href: '/automations', icon: Zap },
    { name: 'Settings', href: '/settings/general', icon: Settings },
];

interface DashboardLayoutProps {
    children: React.ReactNode;
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
    const pathname = usePathname();
    const { user, logout } = useAuth();
    const [sidebarOpen, setSidebarOpen] = useState(false);

    return (
        <div className="voxly-app-shell min-h-screen bg-background text-foreground">
            {/* Mobile sidebar backdrop */}
            <AnimatePresence>
                {sidebarOpen && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/80 backdrop-blur-sm z-40 lg:hidden"
                        onClick={() => setSidebarOpen(false)}
                    />
                )}
            </AnimatePresence>

            {/* Sidebar — 240px per Design Language spacing spec */}
            <aside
                className={cn(
                    'fixed top-0 left-0 z-50 h-full w-60 border-r border-border bg-card transform transition-transform duration-300 lg:translate-x-0',
                    sidebarOpen ? 'translate-x-0' : '-translate-x-full'
                )}
            >
                <div className="flex flex-col h-full">
                    {/* Logo */}
                    <div className="flex items-center justify-between h-16 px-5 border-b border-border">
                        <Link href="/dashboard">
                            <VoxlyLogo size="md" />
                        </Link>
                        <button
                            onClick={() => setSidebarOpen(false)}
                            className="lg:hidden p-1.5 hover:bg-accent rounded-lg transition-colors"
                        >
                            <X className="w-5 h-5 text-muted-foreground" />
                        </button>
                    </div>

                    {/* Navigation */}
                    <nav className="flex-1 p-2.5 space-y-0.5">
                        {navigation.map((item) => {
                            const isActive = item.href === '/settings/general'
                                ? pathname.startsWith('/settings')
                                : pathname === item.href || pathname.startsWith(item.href + '/');
                            return (
                                <Link
                                    key={item.name}
                                    href={item.href}
                                    onClick={() => setSidebarOpen(false)}
                                    className={cn(
                                        'flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] font-medium transition-colors duration-200 group relative overflow-hidden',
                                        isActive
                                            ? 'text-foreground'
                                            : 'text-muted-foreground hover:text-foreground hover:bg-card'
                                    )}
                                >
                                    {isActive && (
                                        <motion.div
                                            layoutId="sidebar-active"
                                            className="absolute inset-0 bg-secondary rounded-lg"
                                            initial={false}
                                            transition={{ type: "spring", stiffness: 300, damping: 30 }}
                                        />
                                    )}

                                    <item.icon className={cn('w-[17px] h-[17px] relative z-10 transition-colors', isActive ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground')} />
                                    <span className="relative z-10">{item.name}</span>
                                </Link>
                            );
                        })}
                    </nav>

                    {/* User section */}
                    <div className="p-3 border-t border-border flex items-center gap-2.5">
                        <Avatar className="h-7 w-7 flex-none">
                            <AvatarFallback className="bg-voxly-surface-3 text-voxly-ink-6 text-[10px] font-bold font-display">
                                {getInitials(user?.full_name || user?.email || 'U')}
                            </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold text-foreground truncate">
                                {user?.full_name || 'User'}
                            </p>
                            <p className="text-[10px] text-voxly-ink-5 truncate">
                                {user?.agency_name || user?.email}
                            </p>
                        </div>
                        <Settings className="w-3.5 h-3.5 text-voxly-ink-5 flex-none" />
                    </div>
                </div>
            </aside>

            {/* Main content */}
            <div className="lg:pl-60">
                {/* Header — 56px per Design Language spacing spec */}
                <header className="sticky top-0 z-30 h-14 bg-card/95 backdrop-blur-xl border-b border-border">
                    <div className="flex items-center justify-between h-full px-4 lg:px-6 gap-4">
                        {/* Mobile menu button */}
                        <button
                            onClick={() => setSidebarOpen(true)}
                            className="lg:hidden p-2 hover:bg-accent rounded-lg transition-colors"
                        >
                            <Menu className="w-5 h-5 text-muted-foreground" />
                        </button>

                        {/* Search */}
                        <div className="flex-1 max-w-md hidden sm:block">
                            <div className="relative group">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-voxly-ink-5 group-focus-within:text-primary transition-colors" />
                                <input
                                    type="text"
                                    placeholder="Search or ask Voxly anything…"
                                    className="w-full h-9 pl-9 pr-12 text-[13px] bg-background border border-border rounded-lg text-foreground placeholder:text-voxly-ink-5 focus:outline-none focus:border-primary focus:ring-[3px] focus:ring-primary/15 transition-all"
                                />
                                <span className="absolute right-2.5 top-1/2 -translate-y-1/2 font-mono text-[10px] text-voxly-ink-6 bg-secondary px-1.5 py-0.5 rounded pointer-events-none">
                                    ⌘K
                                </span>
                            </div>
                        </div>

                        {/* Right side */}
                        <div className="flex items-center gap-2">
                            <Button variant="ghost" size="icon" className="relative w-9 h-9 rounded-lg bg-card border border-border hover:bg-accent text-voxly-ink-6 hover:text-foreground transition-all">
                                <Bell className="w-4 h-4" />
                                <span className="absolute top-2 right-2.5 w-1.5 h-1.5 bg-primary rounded-full" />
                            </Button>

                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" className="relative h-9 p-0.5 rounded-full bg-card border border-border hover:bg-accent transition-all pl-1 pr-3 gap-2">
                                        <Avatar className="w-7 h-7">
                                            <AvatarFallback className="bg-voxly-surface-3 text-voxly-ink-6 text-[10px] font-bold font-display">
                                                {getInitials(user?.full_name || user?.email || 'U')}
                                            </AvatarFallback>
                                        </Avatar>
                                        <span className="text-xs font-medium text-foreground/80 pr-1 hidden sm:inline-block">
                                            Account
                                        </span>
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-56 bg-popover border-border">
                                    <DropdownMenuLabel>
                                        <div className="py-1">
                                            <p className="font-medium text-foreground">{user?.full_name || 'User'}</p>
                                            <p className="text-xs text-voxly-ink-5 leading-none mt-1">{user?.email}</p>
                                        </div>
                                    </DropdownMenuLabel>
                                    <DropdownMenuSeparator className="bg-border" />
                                    <DropdownMenuItem asChild className="hover:bg-accent focus:bg-accent cursor-pointer text-voxly-ink-6 focus:text-foreground">
                                        <Link href="/settings/general">
                                            <Settings className="w-4 h-4 mr-2" />
                                            Settings
                                        </Link>
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator className="bg-border" />
                                    <DropdownMenuItem
                                        onClick={logout}
                                        className="text-voxly-heat hover:bg-voxly-heat-soft focus:bg-voxly-heat-soft cursor-pointer focus:text-voxly-heat"
                                    >
                                        <LogOut className="w-4 h-4 mr-2" />
                                        Logout
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </div>
                    </div>
                </header>

                {/* Page content */}
                <main className="p-4 lg:p-8">
                    <motion.div
                        key={pathname}
                        initial={{ opacity: 0, y: 12, scale: 0.99 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        transition={{ duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
                    >
                        {children}
                    </motion.div>
                </main>
            </div>
        </div>
    );
}
