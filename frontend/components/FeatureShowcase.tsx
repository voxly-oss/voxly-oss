'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface FeatureShowcaseProps {
    label: string;
    headline: string;
    highlightedWord?: string;
    subtitle: string;
    visual: React.ReactNode;
    reversed?: boolean;
    id?: string;
}

export default function FeatureShowcase({ label, headline, highlightedWord, subtitle, visual, reversed = false, id }: FeatureShowcaseProps) {
    return (
        <section className="py-24 sm:py-32 px-6 max-w-7xl mx-auto relative" id={id}>
            {/* Section glow */}
            <div className="absolute inset-0 pointer-events-none">
                <div className={cn(
                    "absolute w-[500px] h-[500px] rounded-full blur-[120px] opacity-20",
                    reversed ? "top-0 right-0 bg-cyan-600" : "top-0 left-0 bg-violet-600"
                )} />
            </div>

            <div className={cn(
                "grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 items-center relative z-10",
                reversed && "lg:grid-flow-dense"
            )}>
                {/* Text Column — always compact */}
                <motion.div
                    initial={{ opacity: 0, x: reversed ? 30 : -30 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true, margin: '-80px' }}
                    transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
                    className={cn("flex flex-col items-start", reversed && "lg:col-start-2")}
                >
                    <span className="inline-block px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-white/50 text-xs font-bold tracking-widest uppercase mb-6">
                        {label}
                    </span>
                    <h2 className="text-4xl sm:text-5xl lg:text-6xl font-display font-bold tracking-tight mb-6 text-white leading-[1.1]">
                        {headline}{' '}
                        {highlightedWord && (
                            <span className="bg-gradient-to-r from-violet-400 via-cyan-400 to-violet-400 bg-[length:200%_auto] bg-clip-text text-transparent animate-gradient">
                                {highlightedWord}
                            </span>
                        )}
                    </h2>
                    <p className="text-white/40 text-lg leading-relaxed max-w-md">
                        {subtitle}
                    </p>
                </motion.div>

                {/* Visual Column — 80% of the attention */}
                <motion.div
                    initial={{ opacity: 0, y: 40, scale: 0.95 }}
                    whileInView={{ opacity: 1, y: 0, scale: 1 }}
                    viewport={{ once: true, margin: '-60px' }}
                    transition={{ duration: 0.8, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
                    className={cn(
                        "relative w-full aspect-[4/3] rounded-3xl border border-white/10 bg-[#0a0a0c] overflow-hidden shadow-2xl shadow-black/60",
                        reversed && "lg:col-start-1 lg:row-start-1"
                    )}
                >
                    <div className="absolute inset-0 bg-gradient-to-br from-white/[0.03] to-transparent pointer-events-none z-0" />
                    <div className="relative z-10 w-full h-full">
                        {visual}
                    </div>
                </motion.div>
            </div>
        </section>
    );
}
