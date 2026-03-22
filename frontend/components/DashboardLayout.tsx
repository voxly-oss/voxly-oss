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
    ChevronRight,
    Sparkles,
} from 'lucide-react';
import { cn, getInitials } from '@/lib/utils';
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import VoxlyLogo from '@/components/VoxlyLogo';
import HeroBackground from '@/components/HeroBackground';

const navigation = [
    { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
    { name: 'Clients', href: '/clients', icon: Users },
    { name: 'Projects', href: '/projects', icon: FolderGit2 },
    { name: 'AI Assistant', href: '/chat', icon: Sparkles },
    { name: 'Messages', href: '/messages', icon: MessageSquare },
    { name: 'Settings', href: '/settings', icon: Settings },
];

interface DashboardLayoutProps {
    children: React.ReactNode;
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
    const pathname = usePathname();
    const { user, logout } = useAuth();
    const [sidebarOpen, setSidebarOpen] = useState(false);

    return (
        <div className="min-h-screen bg-[#050507] text-white">
            {/* Ambient Background - Low Opacity for Content Readability */}
            <div className="fixed inset-0 z-0 pointer-events-none opacity-40">
                <HeroBackground />
            </div>
            
            {/* Overlay to ensure text contrast */}
            <div className="fixed inset-0 z-0 pointer-events-none bg-black/40 backdrop-blur-[1px]" />

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

            {/* Sidebar */}
            <aside
                className={cn(
                    'fixed top-0 left-0 z-50 h-full w-64 border-r border-white/5 bg-[#0a0a0f]/90 backdrop-blur-xl transform transition-transform duration-300 lg:translate-x-0',
                    sidebarOpen ? 'translate-x-0' : '-translate-x-full'
                )}
            >
                <div className="flex flex-col h-full relative">
                     {/* Sidebar ambient glow */}
                     <div className="absolute top-0 left-0 right-0 h-64 bg-violet-600/5 blur-[60px] pointer-events-none" />

                    {/* Logo */}
                    <div className="flex items-center justify-between h-20 px-6 border-b border-white/5 relative z-10">
                        <Link href="/dashboard">
                        <VoxlyLogo size="md" />
                        </Link>
                        <button
                            onClick={() => setSidebarOpen(false)}
                            className="lg:hidden p-1.5 hover:bg-white/5 rounded-lg transition-colors"
                        >
                            <X className="w-5 h-5 text-white/70" />
                        </button>
                    </div>

                    {/* Navigation */}
                    <nav className="flex-1 p-4 space-y-1.5 relative z-10">
                        {navigation.map((item) => {
                            const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
                            return (
                                <Link
                                    key={item.name}
                                    href={item.href}
                                    onClick={() => setSidebarOpen(false)}
                                    className={cn(
                                        'flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-300 group relative overflow-hidden',
                                        isActive
                                            ? 'text-white'
                                            : 'text-white/50 hover:text-white hover:bg-white/5'
                                    )}
                                >
                                    {isActive && (
                                        <motion.div
                                            layoutId="sidebar-active"
                                            className="absolute inset-0 bg-white/[0.08] border border-white/10 rounded-xl"
                                            initial={false}
                                            transition={{ type: "spring", stiffness: 300, damping: 30 }}
                                        />
                                    )}
                                    
                                    <item.icon className={cn('w-5 h-5 relative z-10 transition-colors', isActive ? 'text-violet-400' : 'text-white/40 group-hover:text-white/70')} />
                                    <span className="relative z-10">{item.name}</span>
                                    
                                    {isActive && (
                                        <div className="absolute right-3 w-1.5 h-1.5 rounded-full bg-violet-400 shadow-[0_0_8px_rgba(167,139,250,0.6)]" />
                                    )}
                                </Link>
                            );
                        })}
                    </nav>

                    {/* User section */}
                    <div className="p-4 border-t border-white/5 bg-[#050507]/30">
                        <div className="flex items-center gap-3 px-3 py-3 rounded-xl border border-white/5 bg-white/[0.03] hover:bg-white/[0.06] transition-colors cursor-pointer group">
                            <Avatar className="h-9 w-9 border border-white/10 ring-2 ring-transparent group-hover:ring-violet-500/20 transition-all">
                                <AvatarFallback className="bg-gradient-to-br from-violet-600 to-blue-600 text-white text-sm font-semibold">
                                    {getInitials(user?.full_name || user?.email || 'U')}
                                </AvatarFallback>
                            </Avatar>
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-white truncate group-hover:text-violet-200 transition-colors">
                                    {user?.full_name || 'User'}
                                </p>
                                <p className="text-xs text-white/40 truncate">
                                    {user?.agency_name || user?.email}
                                </p>
                            </div>
                            <Settings className="w-4 h-4 text-white/20 group-hover:text-white/50 transition-colors" />
                        </div>
                    </div>
                </div>
            </aside>

            {/* Main content */}
            <div className="lg:pl-64 relative z-10">
                {/* Header */}
                <header className="sticky top-0 z-30 h-16 bg-[#0a0a0f]/80 backdrop-blur-xl border-b border-white/5">
                    <div className="flex items-center justify-between h-full px-4 lg:px-6">
                        {/* Mobile menu button */}
                        <button
                            onClick={() => setSidebarOpen(true)}
                            className="lg:hidden p-2 hover:bg-white/5 rounded-lg transition-colors"
                        >
                            <Menu className="w-5 h-5 text-white/70" />
                        </button>

                        {/* Search */}
                        <div className="flex-1 max-w-md mx-4 hidden sm:block">
                            <div className="relative group">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30 group-focus-within:text-violet-400 transition-colors" />
                                <input
                                    type="text"
                                    placeholder="Search..."
                                    className="w-full pl-10 pr-4 py-2 text-sm bg-white/[0.03] border border-white/[0.06] rounded-full text-white placeholder:text-white/30 focus:outline-none focus:bg-white/[0.08] focus:border-violet-500/30 transition-all"
                                />
                            </div>
                        </div>

                        {/* Right side */}
                        <div className="flex items-center gap-3">
                            <Button variant="ghost" size="icon" className="relative w-9 h-9 rounded-full bg-white/5 border border-white/5 hover:bg-white/10 text-white/70 hover:text-white hover:border-white/10 transition-all">
                                <Bell className="w-4 h-4" />
                                <span className="absolute top-2 right-2.5 w-1.5 h-1.5 bg-violet-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(139,92,246,0.6)]" />
                            </Button>

                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" className="relative h-9 p-0.5 rounded-full bg-white/5 border border-white/5 hover:bg-white/10 hover:border-white/10 transition-all pl-1 pr-3 gap-2">
                                        <Avatar className="w-7 h-7 border border-white/10">
                                            <AvatarFallback className="bg-gradient-to-br from-violet-600 to-blue-600 text-white text-[10px] font-bold">
                                                {getInitials(user?.full_name || user?.email || 'U')}
                                            </AvatarFallback>
                                        </Avatar>
                                        <span className="text-xs font-medium text-white/80 pr-1 hidden sm:inline-block">
                                            Account
                                        </span>
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-56 bg-[#0a0a0f] border-white/10 backdrop-blur-xl">
                                    <DropdownMenuLabel>
                                        <div className="py-1">
                                            <p className="font-medium text-white">{user?.full_name || 'User'}</p>
                                            <p className="text-xs text-white/50 leading-none mt-1">{user?.email}</p>
                                        </div>
                                    </DropdownMenuLabel>
                                    <DropdownMenuSeparator className="bg-white/10" />
                                    <DropdownMenuItem asChild className="hover:bg-white/5 focus:bg-white/5 cursor-pointer text-white/70 focus:text-white">
                                        <Link href="/settings">
                                            <Settings className="w-4 h-4 mr-2" />
                                            Settings
                                        </Link>
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator className="bg-white/10" />
                                    <DropdownMenuItem
                                        onClick={logout}
                                        className="text-red-400 hover:text-red-300 hover:bg-red-500/10 focus:bg-red-500/10 cursor-pointer focus:text-red-300"
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
                <main className="p-4 lg:p-8 relative z-10">
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
