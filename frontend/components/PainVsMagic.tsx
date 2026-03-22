'use client';

import { motion } from 'framer-motion';
import { ShieldAlert, RefreshCw, XCircle, ArrowRight, CheckCircle2, Bot, Send, GitPullRequest } from 'lucide-react';
import SpotlightCard from './SpotlightCard';

export default function PainVsMagic() {
    return (
        <section className="py-24 px-6 max-w-7xl mx-auto relative z-10">
            <div className="text-center mb-16">
                <h2 className="text-sm font-bold tracking-widest text-white/40 uppercase mb-4">The Platform Shift</h2>
                <h3 className="text-4xl sm:text-5xl font-display font-bold text-white tracking-tight">
                    Stop copy-pasting.<br />
                    <span className="bg-gradient-to-r from-violet-400 to-cyan-400 bg-clip-text text-transparent">Start engineering.</span>
                </h3>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* ── PAIN: The Old Way ── */}
                <SpotlightCard
                    className="flex flex-col h-full bg-[#0a0a0c] border border-white/5 opacity-80 transition-opacity hover:opacity-100 p-8 sm:p-10 rounded-3xl"
                    spotlightColor="rgba(255,255,255,0.03)"
                >
                    <div className="mb-8">
                        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-semibold mb-6">
                            <ShieldAlert className="w-3.5 h-3.5" />
                            The Old Way
                        </div>
                        <h4 className="text-2xl font-display font-bold text-white/80 mb-3">Chaos & Manual Context</h4>
                        <p className="text-white/40 text-sm leading-relaxed">
                            Developers stop coding to explain technical changes to PMs, who then translate it for clients. Information is lost, delayed, and annoying.
                        </p>
                    </div>

                    <div className="flex-1 bg-white/[0.02] border border-white/5 rounded-2xl p-6 relative overflow-hidden flex flex-col justify-center gap-4">
                        {/* Abstract Representation of Pain */}
                        <div className="flex items-center gap-3 opacity-50">
                            <div className="flex-1 h-3 bg-white/10 rounded-full" />
                            <RefreshCw className="w-4 h-4 text-white/30" />
                            <div className="w-12 h-3 bg-red-500/20 rounded-full" />
                        </div>
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded bg-white/5 flex items-center justify-center">
                                <span className="text-xs text-white/30">Jira</span>
                            </div>
                            <ArrowRight className="w-4 h-4 text-white/20" />
                            <div className="flex-1 h-12 border border-dashed border-red-500/30 rounded-xl flex items-center justify-center bg-red-500/5">
                                <span className="text-red-400/50 text-xs font-mono">Manual Data Entry</span>
                            </div>
                        </div>
                        <div className="flex items-center gap-3 opacity-50">
                            <div className="w-16 h-3 bg-white/10 rounded-full" />
                            <XCircle className="w-4 h-4 text-red-400/50" />
                            <div className="flex-1 h-3 bg-white/10 rounded-full" />
                        </div>
                    </div>
                </SpotlightCard>

                {/* ── MAGIC: The Voxly Way ── */}
                <SpotlightCard
                    className="flex flex-col h-full bg-[#050507] border border-violet-500/30 p-8 sm:p-10 rounded-3xl shadow-[0_0_80px_-20px_rgba(124,58,237,0.15)]"
                    spotlightColor="rgba(124,58,237,0.2)"
                >
                    <div className="mb-8">
                        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 text-xs font-semibold mb-6">
                            <Bot className="w-3.5 h-3.5" />
                            The Voxly Way
                        </div>
                        <h4 className="text-2xl font-display font-bold text-white mb-3">Instant AI Synthesis</h4>
                        <p className="text-white/60 text-sm leading-relaxed">
                            Code is pushed. The AI reads the diff, understands the business value, and sends a polished update specifically crafted for the client. Zero friction.
                        </p>
                    </div>

                    <div className="flex-1 bg-black/40 border border-white/10 rounded-2xl p-6 relative overflow-hidden flex flex-col justify-center">
                        {/* Background glowing tracks */}
                        <div className="absolute top-1/2 left-0 w-full h-px bg-gradient-to-r from-violet-500/0 via-violet-500/50 to-cyan-500/0 -translate-y-1/2" />
                        
                        <div className="relative z-10 flex justify-between items-center px-2">
                             <motion.div 
                                initial={{ y: 0 }}
                                animate={{ y: [0, -4, 0] }}
                                transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                                className="w-12 h-12 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center backdrop-blur-md shadow-lg"
                            >
                                <GitPullRequest className="w-5 h-5 text-white/70" />
                             </motion.div>

                             <motion.div
                                animate={{ rotate: 360 }}
                                transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
                                className="w-16 h-16 rounded-full bg-gradient-to-tr from-violet-600/40 to-cyan-600/40 border border-violet-500/50 flex items-center justify-center shadow-[0_0_30px_rgba(124,58,237,0.3)] backdrop-blur-md relative"
                             >
                                 <div className="absolute inset-1 bg-[#050507] rounded-full" />
                                 <Bot className="w-6 h-6 text-cyan-400 relative z-10" />
                             </motion.div>

                             <motion.div 
                                initial={{ y: 0 }}
                                animate={{ y: [0, -4, 0] }}
                                transition={{ duration: 4, delay: 1, repeat: Infinity, ease: "easeInOut" }}
                                className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center backdrop-blur-md shadow-[0_0_20px_rgba(16,185,129,0.15)]"
                            >
                                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                             </motion.div>
                        </div>

                        {/* Animated traveling dot */}
                        <motion.div
                            initial={{ left: "10%", opacity: 0 }}
                            animate={{ left: "90%", opacity: [0, 1, 1, 0] }}
                            transition={{ duration: 2.5, repeat: Infinity, ease: "linear" }}
                            className="absolute top-1/2 w-2 h-2 rounded-full bg-cyan-400 shadow-[0_0_10px_#22d3ee] -translate-y-1/2 -ml-1"
                        />
                    </div>
                </SpotlightCard>
            </div>
        </section>
    );
}
