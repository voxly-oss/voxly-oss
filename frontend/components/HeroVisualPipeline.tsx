'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { Github, Bot, Webhook, Send, MessageCircle, ArrowRight } from 'lucide-react';
import { useEffect, useState } from 'react';

export default function HeroVisualPipeline() {
    const [activeNode, setActiveNode] = useState(0);

    // simple cycle animation
    useEffect(() => {
        const interval = setInterval(() => {
            setActiveNode((prev) => (prev + 1) % 3);
        }, 3000);
        return () => clearInterval(interval);
    }, []);

    const nodes = [
        {
            title: "GitHub Webhook",
            icon: Github,
            color: "text-white",
            bg: "bg-white/10",
            border: "border-white/20",
            description: "New Commit / PR",
            glow: "from-white/20 to-transparent",
        },
        {
            title: "Voxly AI",
            icon: Bot,
            color: "text-violet-400",
            bg: "bg-violet-500/10",
            border: "border-violet-500/30",
            description: "Contextual Analysis",
            glow: "from-violet-500/30 to-transparent",
        },
        {
            title: "Instant Delivery",
            icon: Send,
            color: "text-cyan-400",
            bg: "bg-cyan-500/10",
            border: "border-cyan-500/30",
            description: "WhatsApp, Telegram, Slack",
            glow: "from-cyan-500/30 to-transparent",
        },
    ];

    return (
        <div className="relative w-full aspect-square max-w-md mx-auto xl:max-w-lg flex items-center justify-center">
            {/* Background glowing orb */}
            <motion.div
                animate={{
                    scale: [1, 1.2, 1],
                    opacity: [0.3, 0.5, 0.3],
                }}
                transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
                className="absolute inset-0 bg-gradient-to-tr from-violet-600/20 to-cyan-600/20 rounded-full blur-3xl pointer-events-none"
            />

            <div className="relative z-10 w-full flex flex-col gap-6 p-8 rounded-3xl border border-white/10 bg-black/40 backdrop-blur-xl shadow-2xl">
                {/* Connecting Lines (Background) */}
                <div className="absolute top-1/2 left-10 w-1 h-[60%] -translate-y-1/2 bg-white/5 rounded-full overflow-hidden">
                    <motion.div
                        initial={{ top: "-100%" }}
                        animate={{ top: "200%" }}
                        transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
                        className="absolute left-0 w-full h-1/2 bg-gradient-to-b from-transparent via-cyan-400/50 to-transparent"
                    />
                </div>

                {nodes.map((node, i) => {
                    let statusIndicator = null;
                    if (activeNode === i) {
                        statusIndicator = (
                            <span className="flex h-2 w-2 relative">
                                <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${node.bg.replace('/10', '/60')}`}></span>
                                <span className={`relative inline-flex rounded-full h-2 w-2 ${node.bg.replace('/10', '')}`}></span>
                            </span>
                        );
                    } else if (activeNode > i) {
                        statusIndicator = (
                            <div className="w-4 h-4 rounded-full bg-emerald-500/20 flex items-center justify-center border border-emerald-500/30">
                                <ArrowRight className="w-2.5 h-2.5 text-emerald-400" />
                            </div>
                        );
                    }

                    return (
                        <motion.div
                            key={node.title}
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: i * 0.2 + 0.5 }}
                            className={`relative flex items-center gap-4 p-4 rounded-2xl border transition-all duration-500 ${
                                activeNode === i ? `bg-white/5 ${node.border} scale-105 shadow-[0_0_30px_rgba(255,255,255,0.05)]` : 'border-white/5 bg-transparent opacity-60 grayscale-[50%]'
                            }`}
                        >
                            {/* Active Glow */}
                            {activeNode === i && (
                                <div className={`absolute inset-0 bg-gradient-to-r ${node.glow} opacity-50 rounded-2xl pointer-events-none`} />
                            )}

                            {/* Icon Node */}
                            <div className={`relative z-10 flex items-center justify-center w-12 h-12 rounded-xl ${node.bg} border ${node.border}`}>
                                <node.icon className={`w-5 h-5 ${node.color}`} />
                            </div>

                            <div className="relative z-10 flex-1">
                                <h3 className="text-white font-semibold font-display tracking-tight text-lg leading-tight">{node.title}</h3>
                                <p className="text-white/40 text-sm">{node.description}</p>
                            </div>
                            
                            {/* Status Check / Processing Indicator */}
                            <div className="relative z-10 pr-2">{statusIndicator}</div>
                        </motion.div>
                    );
                })}

                {/* Simulated notification popup when the flow completes */}
                <AnimatePresence>
                    {activeNode === 2 && (
                        <motion.div
                            initial={{ opacity: 0, scale: 0.9, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.9, y: -20 }}
                            className="absolute -right-12 sm:-right-20 bottom-10 p-3 rounded-2xl bg-[#111116] border border-white/10 shadow-xl flex items-start gap-3 w-64 backdrop-blur-md"
                        >
                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-400 to-cyan-500 flex items-center justify-center shrink-0">
                                <MessageCircle className="w-4 h-4 text-white" />
                            </div>
                            <div className="flex-1">
                                <p className="text-white text-xs font-semibold mb-1">New update for Client X</p>
                                <p className="text-white/50 text-[10px] leading-relaxed">"The Voxly team just pushed a new feature to production. Click here to view the PR."</p>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
}
