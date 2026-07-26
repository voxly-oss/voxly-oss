'use client';

import { motion } from 'framer-motion';
import { Bot, FileCode2, ArrowRight, MessageCircle } from 'lucide-react';

/* ═══════════════════════════════════════════════════════ */
/*  Visual 1: AI Engine — Commit diff → AI Brain → Message */
/* ═══════════════════════════════════════════════════════ */
export function AIEngineVisual() {
    return (
        <div className="w-full h-full flex items-center justify-center p-6 sm:p-10 relative overflow-hidden">
            {/* Connecting data lines */}
            <svg className="absolute inset-0 w-full h-full pointer-events-none z-0" preserveAspectRatio="none">
                <motion.line
                    x1="18%" y1="50%" x2="44%" y2="50%"
                    stroke="url(#line-grad-1)" strokeWidth="1.5" strokeDasharray="6 4"
                    initial={{ pathLength: 0, opacity: 0 }}
                    whileInView={{ pathLength: 1, opacity: 0.6 }}
                    transition={{ duration: 1, delay: 0.5 }}
                />
                <motion.line
                    x1="56%" y1="50%" x2="82%" y2="50%"
                    stroke="url(#line-grad-2)" strokeWidth="1.5" strokeDasharray="6 4"
                    initial={{ pathLength: 0, opacity: 0 }}
                    whileInView={{ pathLength: 1, opacity: 0.6 }}
                    transition={{ duration: 1, delay: 1.2 }}
                />
                <defs>
                    <linearGradient id="line-grad-1" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="rgba(255,255,255,0.1)" />
                        <stop offset="100%" stopColor="rgba(139,92,246,0.5)" />
                    </linearGradient>
                    <linearGradient id="line-grad-2" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="rgba(139,92,246,0.5)" />
                        <stop offset="100%" stopColor="rgba(6,182,212,0.5)" />
                    </linearGradient>
                </defs>
            </svg>

            <div className="relative z-10 flex items-center justify-between w-full max-w-lg gap-4">
                {/* Commit Diff Card */}
                <motion.div
                    initial={{ opacity: 0, x: -20 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.6, delay: 0.2 }}
                    className="w-36 sm:w-44 shrink-0 rounded-2xl bg-[#111116] border border-white/10 p-4 shadow-xl"
                >
                    <div className="flex items-center gap-2 mb-3">
                        <FileCode2 className="w-4 h-4 text-emerald-400" />
                        <span className="text-[10px] text-white/50 font-mono">api/v2/users.ts</span>
                    </div>
                    <div className="space-y-1.5 font-mono text-[9px]">
                        <div className="text-red-400/70 bg-red-500/5 px-1.5 py-0.5 rounded">- getUser(id)</div>
                        <div className="text-emerald-400/70 bg-emerald-500/5 px-1.5 py-0.5 rounded">+ getUserById(id)</div>
                        <div className="text-emerald-400/70 bg-emerald-500/5 px-1.5 py-0.5 rounded">+ validateToken()</div>
                    </div>
                </motion.div>

                {/* AI Brain (Center) */}
                <motion.div
                    initial={{ opacity: 0, scale: 0.8 }}
                    whileInView={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.6, delay: 0.8 }}
                    className="relative"
                >
                    <motion.div
                        animate={{ scale: [1, 1.15, 1], opacity: [0.3, 0.6, 0.3] }}
                        transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                        className="absolute inset-0 bg-violet-500/30 rounded-full blur-2xl"
                    />
                    <div className="relative w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-gradient-to-br from-violet-600/40 to-cyan-600/40 border border-violet-500/50 flex items-center justify-center shadow-[0_0_40px_rgba(124,58,237,0.35)]">
                        <div className="absolute inset-1 bg-[#0a0a0c] rounded-full" />
                        <Bot className="w-7 h-7 sm:w-8 sm:h-8 text-violet-400 relative z-10" />
                    </div>
                </motion.div>

                {/* Client Message Card */}
                <motion.div
                    initial={{ opacity: 0, x: 20 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.6, delay: 1.4 }}
                    className="w-36 sm:w-44 shrink-0 rounded-2xl bg-[#111116] border border-cyan-500/20 p-4 shadow-xl shadow-cyan-500/5"
                >
                    <div className="flex items-center gap-2 mb-3">
                        <MessageCircle className="w-4 h-4 text-cyan-400" />
                        <span className="text-[10px] text-white/50">Client Update</span>
                    </div>
                    <p className="text-[10px] text-white/70 leading-relaxed">
                        &quot;We&apos;ve refactored the user API for better security. Token validation is now built-in.&quot;
                    </p>
                </motion.div>
            </div>

            {/* Traveling data particles */}
            <motion.div
                initial={{ left: '15%', opacity: 0 }}
                animate={{ left: '85%', opacity: [0, 1, 1, 0] }}
                transition={{ duration: 3, repeat: Infinity, ease: 'linear', delay: 1 }}
                className="absolute top-1/2 w-2 h-2 rounded-full bg-violet-400 shadow-[0_0_12px_#8b5cf6] -translate-y-1/2 z-20"
            />
        </div>
    );
}

/* ═══════════════════════════════════════════════════════ */
/*  Visual 2: Multi-Platform — Messages hitting 3 apps    */
/* ═══════════════════════════════════════════════════════ */
export function MultiPlatformVisual() {
    const platforms = [
        { name: 'WhatsApp', color: 'bg-emerald-500', border: 'border-emerald-500/30', text: 'text-emerald-400', msg: 'New update: Auth module deployed ✅', delay: 0.3 },
        { name: 'Telegram', color: 'bg-blue-500', border: 'border-blue-500/30', text: 'text-blue-400', msg: 'API v2 is live. Response time: 45ms.', delay: 0.8 },
        { name: 'Slack', color: 'bg-purple-500', border: 'border-purple-500/30', text: 'text-purple-400', msg: '#dev-updates: Build passed, deployed to staging.', delay: 1.3 },
    ];
    const broadcastLines = [
        { id: 'broadcast-whatsapp', y: 25, stroke: 'rgba(16,185,129,0.3)', delay: platforms[0].delay },
        { id: 'broadcast-telegram', y: 50, stroke: 'rgba(59,130,246,0.3)', delay: platforms[1].delay },
        { id: 'broadcast-slack', y: 75, stroke: 'rgba(168,85,247,0.3)', delay: platforms[2].delay },
    ];

    return (
        <div className="w-full h-full flex items-center justify-center p-6 sm:p-10 relative overflow-hidden">
            {/* Central broadcast icon */}
            <motion.div
                initial={{ opacity: 0, scale: 0 }}
                whileInView={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.5, delay: 0.1 }}
                className="absolute left-6 sm:left-12 top-1/2 -translate-y-1/2 z-20"
            >
                <motion.div
                    animate={{ scale: [1, 1.3, 1], opacity: [0.4, 0.7, 0.4] }}
                    transition={{ duration: 2, repeat: Infinity }}
                    className="absolute inset-0 bg-violet-500/30 rounded-full blur-xl"
                />
                <div className="relative w-12 h-12 rounded-full bg-violet-500/20 border border-violet-500/40 flex items-center justify-center">
                    <Bot className="w-5 h-5 text-violet-400" />
                </div>
            </motion.div>

            {/* Broadcast lines */}
            <svg className="absolute inset-0 w-full h-full pointer-events-none z-10" preserveAspectRatio="none">
                {broadcastLines.map((line) => (
                    <motion.line
                        key={line.id}
                        x1="15%" y1="50%" x2="55%" y2={`${line.y}%`}
                        stroke={line.stroke}
                        strokeWidth="1" strokeDasharray="4 3"
                        initial={{ pathLength: 0, opacity: 0 }}
                        whileInView={{ pathLength: 1, opacity: 1 }}
                        transition={{ duration: 0.8, delay: line.delay }}
                    />
                ))}
            </svg>

            {/* Platform cards */}
            <div className="absolute right-4 sm:right-10 top-0 bottom-0 flex flex-col justify-center gap-4 w-52 sm:w-64 z-20">
                {platforms.map((p, i) => (
                    <motion.div
                        key={p.name}
                        initial={{ opacity: 0, x: 30 }}
                        whileInView={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.5, delay: p.delay + 0.3 }}
                        className={`rounded-2xl bg-[#111116] border ${p.border} p-4 shadow-xl`}
                    >
                        <div className="flex items-center gap-2 mb-2">
                            <div className={`w-3 h-3 rounded-full ${p.color}`} />
                            <span className={`text-xs font-bold ${p.text}`}>{p.name}</span>
                        </div>
                        <p className="text-[11px] text-white/60 leading-relaxed">{p.msg}</p>
                    </motion.div>
                ))}
            </div>
        </div>
    );
}

/* ═══════════════════════════════════════════════════════ */
/*  Visual 3: GitHub Sync — PR Timeline                   */
/* ═══════════════════════════════════════════════════════ */
export function GitHubSyncVisual() {
    const events = [
        { label: 'PR Opened', badge: '#142', color: 'bg-blue-500', status: 'Open', time: '2m ago', delay: 0.2 },
        { label: 'Review Approved', badge: '✓', color: 'bg-emerald-500', status: 'Approved', time: '1m ago', delay: 0.7 },
        { label: 'Merged to main', badge: '⟿', color: 'bg-violet-500', status: 'Merged', time: 'Just now', delay: 1.2 },
    ];

    return (
        <div className="w-full h-full flex items-center justify-center p-6 sm:p-10 relative overflow-hidden">
            <div className="w-full max-w-md space-y-0 relative">
                {/* Vertical timeline line */}
                <div className="absolute left-5 top-4 bottom-4 w-px bg-white/10 overflow-hidden">
                    <motion.div
                        initial={{ scaleY: 0 }}
                        whileInView={{ scaleY: 1 }}
                        transition={{ duration: 1.5, ease: 'easeOut' }}
                        className="absolute inset-0 bg-gradient-to-b from-blue-500 via-emerald-500 to-violet-500 origin-top"
                    />
                </div>

                {events.map((ev, i) => (
                    <motion.div
                        key={ev.label}
                        initial={{ opacity: 0, x: 20 }}
                        whileInView={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.5, delay: ev.delay }}
                        className="flex items-start gap-4 py-4"
                    >
                        {/* Timeline Node */}
                        <div className="relative z-10 mt-1">
                            <div className={`w-3 h-3 rounded-full ${ev.color} ring-4 ring-[#0a0a0c] shadow-[0_0_10px_currentColor]`} />
                        </div>

                        {/* Event Card */}
                        <div className="flex-1 rounded-xl bg-[#111116] border border-white/10 p-4 shadow-lg">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-sm font-bold text-white">{ev.label}</span>
                                <span className="text-[10px] text-white/30">{ev.time}</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className={`text-[10px] px-2 py-0.5 rounded-full ${ev.color}/20 border ${ev.color.replace('bg-', 'border-')}/30 text-white/70`}>
                                    {ev.status}
                                </span>
                                <span className="text-[10px] font-mono text-white/40">{ev.badge}</span>
                            </div>
                        </div>
                    </motion.div>
                ))}

                {/* Voxly sync indicator at the bottom */}
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, delay: 1.8 }}
                    className="ml-9 mt-2 flex items-center gap-2 px-3 py-2 rounded-lg bg-violet-500/10 border border-violet-500/20 w-fit"
                >
                    <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-violet-400/60" />
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-violet-400" />
                    </span>
                    <span className="text-[11px] text-violet-300 font-medium">Voxly synced — client notified</span>
                </motion.div>
            </div>
        </div>
    );
}
