'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { 
    Terminal, Bot, MessageSquare, BarChart3, Shield, 
    Bell, Zap, Globe, GitBranch, ArrowRight, Check
} from 'lucide-react';
import { cn } from '@/lib/utils';
import SpotlightCard from './SpotlightCard';

/* ─── Grid Item Component ─── */
function BentoItem({ 
    title, 
    description, 
    header, 
    className, 
    icon: Icon 
}: { 
    title: string; 
    description: string; 
    header?: React.ReactNode; 
    className?: string; 
    icon?: any;
}) {
    const [isHovered, setIsHovered] = React.useState(false);

    return (
        <SpotlightCard 
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            className={cn("row-span-1 flex flex-col justify-between group/bento transition duration-200 border-white/5 bg-white/[0.02] hover:bg-white/[0.04]", className)} 
            spotlightColor="rgba(139, 92, 246, 0.15)"
        >
            <div className="flex-1 min-h-[10rem] w-full border border-white/10 bg-black/20 rounded-xl overflow-hidden relative">
                {header && React.isValidElement(header) ? React.cloneElement(header as React.ReactElement<any>, { isHovered }) : header}
            </div>
            <div className="pt-6 group-hover/bento:translate-x-1 transition duration-200">
                {Icon && (
                    <div className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center mb-4 border border-white/5 group-hover/bento:bg-violet-500/10 group-hover/bento:text-violet-400 group-hover/bento:border-violet-500/20 transition-colors">
                        <Icon className="w-5 h-5 text-white/70 group-hover/bento:text-violet-400 transition-colors" />
                    </div>
                )}
                <div className="font-bold text-white mb-2 text-lg">
                    {title}
                </div>
                <div className="font-normal text-white/50 text-sm leading-relaxed">
                    {description}
                </div>
            </div>
        </SpotlightCard>
    );
}

/* ─── Header Visuals ─── */
// 1. AI Response Visual
const AISkeleton = ({ isHovered = false }: { isHovered?: boolean }) => (
    <div className="flex flex-col gap-2 p-4 w-full h-full relative">
        <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-gradient-to-br from-violet-500/30 to-cyan-500/20 flex items-center justify-center">
                <Bot className="w-3 h-3 text-violet-400" />
            </div>
            <div className="h-2 w-20 bg-white/10 rounded-full" />
            <div className="ml-auto px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">
                <span className="text-[10px] text-emerald-400 font-medium">Live</span>
            </div>
        </div>
        <div className="space-y-2 mt-2">
            <motion.div 
                initial={{ width: "20%" }}
                animate={{ width: isHovered ? "80%" : "20%" }}
                transition={{ duration: 0.8, ease: "easeOut" }}
                className="h-2 bg-gradient-to-r from-white/10 to-white/5 rounded-full" 
            />
            <motion.div 
                initial={{ width: "20%" }}
                animate={{ width: isHovered ? "60%" : "20%" }}
                transition={{ duration: 0.8, delay: 0.1, ease: "easeOut" }}
                className="h-2 bg-gradient-to-r from-white/10 to-white/5 rounded-full" 
            />
            <motion.div 
                initial={{ width: "20%" }}
                animate={{ width: isHovered ? "90%" : "20%" }}
                transition={{ duration: 0.8, delay: 0.2, ease: "easeOut" }}
                className="h-2 bg-gradient-to-r from-violet-500 via-cyan-500 to-blue-500 rounded-full relative overflow-hidden" 
            >
                {isHovered && (
                    <motion.div 
                        initial={{ x: "-100%" }} animate={{ x: "200%" }} transition={{ duration: 1, delay: 0.5, repeat: Infinity, repeatDelay: 1 }}
                        className="absolute inset-0 w-1/2 bg-gradient-to-r from-transparent via-white/40 to-transparent skew-x-[-20deg]"
                    />
                )}
            </motion.div>
        </div>
        
        {/* Typing indicator */}
        <div className={cn("flex items-center gap-1 mt-3 transition-opacity duration-300", isHovered ? "opacity-100" : "opacity-0")}>
            <span className="w-1.5 h-1.5 rounded-full bg-violet-400/60 animate-pulse" />
            <span className="w-1.5 h-1.5 rounded-full bg-violet-400/40 animate-pulse" style={{ animationDelay: '0.2s' }} />
            <span className="w-1.5 h-1.5 rounded-full bg-violet-400/20 animate-pulse" style={{ animationDelay: '0.4s' }} />
            <span className="text-[10px] text-white/30 ml-1">AI is thinking...</span>
        </div>
        
        <div className={cn("absolute right-4 bottom-4 w-16 h-16 rounded-full blur-xl transition-all duration-700", isHovered ? "bg-gradient-to-br from-violet-500/30 to-cyan-500/20 scale-150" : "bg-gradient-to-br from-violet-500/10 to-cyan-500/5 scale-100")} />
    </div>
);

// 2. GitHub Sync Visual
const GitHubSkeleton = ({ isHovered = false }: { isHovered?: boolean }) => (
    <div className="w-full h-full p-4 relative overflow-hidden">
        <div className="absolute top-2 left-4 right-4 h-32 border-l border-white/10 pl-4 space-y-4">
            {[1, 2, 3].map((i) => (
                <div key={i} className="flex flex-col gap-1 relative">
                    <motion.div 
                        initial={{ backgroundColor: "#1a1a1a" }}
                        animate={{ backgroundColor: isHovered ? "#3b82f6" : "#1a1a1a", scale: isHovered ? 1.2 : 1 }}
                        transition={{ delay: i * 0.15 }}
                        className="absolute -left-[21px] top-1.5 w-2.5 h-2.5 rounded-full border-2 border-[#1a1a1a]" 
                    />
                    <div className="h-2 w-24 bg-white/10 rounded-full" />
                    <div className="h-1.5 w-16 bg-white/5 rounded-full" />
                </div>
            ))}
        </div>
        <GitBranch className={cn("absolute bottom-[-10px] right-[-10px] w-24 h-24 rotate-[-15deg] transition-colors duration-500", isHovered ? "text-blue-500/20" : "text-blue-500/5")} />
    </div>
);

// 3. Analytics Visual
const AnalyticsSkeleton = ({ isHovered = false }: { isHovered?: boolean }) => {
    const heights = [40, 70, 50, 90, 65, 85];
    return (
        <div className="w-full h-full flex items-end justify-between px-4 pb-4 pt-8 gap-2">
            {heights.map((h, i) => (
                <motion.div
                    key={i}
                    initial={{ height: 10 }}
                    animate={{ height: isHovered ? `${h}%` : "10px" }}
                    transition={{ duration: 0.5, delay: isHovered ? i * 0.05 : 0 }}
                    className="w-full rounded-sm"
                    style={{
                        background: isHovered 
                            ? `linear-gradient(to top, rgba(139, 92, 246, ${0.4 + (h / 200)}), rgba(6, 182, 212, ${0.2 + (h / 300)}))`
                            : 'rgba(255,255,255,0.05)',
                    }}
                />
            ))}
        </div>
    );
};

// 4. Notification Visual
const NotificationSkeleton = ({ isHovered = false }: { isHovered?: boolean }) => (
    <div className="w-full h-full flex flex-col justify-center px-4 space-y-3 relative overflow-hidden">
        {[1, 2].map((i) => (
             <motion.div
                key={i}
                initial={{ x: 0, opacity: 0.5 }}
                animate={isHovered ? { x: [0, -5, 0], opacity: 1 } : { x: 0, opacity: 0.5 }}
                transition={{ duration: 0.5, delay: isHovered ? i * 0.1 : 0 }}
                className={cn("flex items-center gap-3 p-3 rounded-lg border backdrop-blur-sm transition-colors", 
                    isHovered ? "bg-white/[0.08] border-white/10" : "bg-white/5 border-white/5"
                )}
            >
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${i === 1 ? 'bg-cyan-500/20 text-cyan-400' : 'bg-amber-500/20 text-amber-400'}`}>
                    {i === 1 ? <Bell className="w-4 h-4" /> : <Zap className="w-4 h-4" />}
                </div>
                <div className="flex-1 space-y-1">
                    <div className="h-1.5 w-20 bg-white/10 rounded-full" />
                    <div className="h-1 w-24 bg-white/5 rounded-full" />
                </div>
            </motion.div>
        ))}
        <div className={cn("absolute top-0 right-0 w-32 h-32 rounded-full pointer-events-none transition-all duration-700", isHovered ? "bg-cyan-500/10 blur-3xl scale-125" : "bg-cyan-500/5 blur-2xl scale-100")} />
    </div>
);


export default function FeaturesGrid() {
    const items = [
        {
            title: "AI Response Engine",
            description: "Claude AI reads your repos, understands context, and crafts personalized client replies automatically.",
            header: <AISkeleton />,
            className: "md:col-span-2",
            icon: Bot,
        },
        {
            title: "Real-time Sync",
            description: "Syncs commits, PRs, and issues instantly.",
            header: <GitHubSkeleton />,
            className: "md:col-span-1",
            icon: GitBranch,
        },
        {
            title: "Usage Analytics",
            description: "Track messages and engagement.",
            header: <AnalyticsSkeleton />,
            className: "md:col-span-1",
            icon: BarChart3,
        },
        {
            title: "Smart Notifications",
            description: "Event-driven alerts for important updates.",
            header: <NotificationSkeleton />,
            className: "md:col-span-2",
            icon: Bell,
        },
    ];

    return (
        <section className="py-24 max-w-7xl mx-auto px-6" id="features">
             <div className="text-center mb-16 relative z-10">
                 <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] bg-indigo-500/20 rounded-[100%] blur-[80px] -z-10 pointer-events-none mix-blend-screen" />
                 
                 <span className="inline-block px-3 py-1 rounded-full bg-violet-500/10 border border-violet-500/20 text-violet-300 text-xs font-semibold tracking-wide uppercase mb-6">Features</span>
                 <h2 className="text-4xl sm:text-6xl font-bold tracking-tighter mb-6 relative">
                    Everything you need to <span className="text-white/30">scale.</span>
                 </h2>
             </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-7xl mx-auto">
                {items.map((item, i) => (
                    <BentoItem
                        key={i}
                        title={item.title}
                        description={item.description}
                        header={item.header}
                        className={item.className}
                        icon={item.icon}
                    />
                ))}
            </div>
        </section>
    );
}
