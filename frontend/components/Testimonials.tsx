'use client';

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Star, Quote, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

const testimonials = [
    {
        name: 'Sarah Johnson',
        role: 'Co-Founder',
        company: 'Acme Studio',
        quote: "Voxly transformed how we communicate with clients. The AI responses are scarily accurate — our clients think a human writes every update.",
        avatar: 'SJ',
        gradient: 'from-blue-500 to-violet-500',
        metric: '3× faster',
        metricLabel: 'client response time',
    },
    {
        name: 'Jonathan Day',
        role: 'CTO',
        company: 'Waverly',
        quote: "Real-time notifications ensure we're always on top of project updates. We went from weekly email recaps to instant clarity.",
        avatar: 'JD',
        gradient: 'from-violet-500 to-purple-500',
        metric: '90% less',
        metricLabel: 'manual update work',
    },
    {
        name: 'Mark Thompson',
        role: 'Engineering Director',
        company: 'Luminous',
        quote: "The GitHub integration helped us identify key trends and keep our clients informed effortlessly. It's like having a dedicated comms team.",
        avatar: 'MT',
        gradient: 'from-emerald-500 to-cyan-500',
        metric: '12K+',
        metricLabel: 'messages sent monthly',
    },
    {
        name: 'Melissa Reid',
        role: 'Founder',
        company: 'Brightpath',
        quote: "Integration with our workflow tools was seamless. Our clients love getting updates on WhatsApp instead of buried in email threads.",
        avatar: 'MR',
        gradient: 'from-amber-500 to-orange-500',
        metric: '2 min',
        metricLabel: 'setup time',
    },
    {
        name: 'Chris Wright',
        role: 'Product Manager',
        company: 'Savannah',
        quote: "Managing client communication is now effortless. The CLI setup took us 2 minutes and we were live across all channels.",
        avatar: 'CW',
        gradient: 'from-cyan-500 to-blue-500',
        metric: '97%',
        metricLabel: 'AI accuracy rate',
    },
    {
        name: 'Teri Williams',
        role: 'VP Engineering',
        company: 'Radiant',
        quote: "Self-hosted, open-source, and actually works. We have full control over our data while our clients get instant, beautiful updates.",
        avatar: 'TW',
        gradient: 'from-rose-500 to-pink-500',
        metric: '99.9%',
        metricLabel: 'uptime',
    },
];

/* ═══════════════════════════════════════════════════ */
/*  Wall of Love — Interactive Carousel + Grid        */
/* ═══════════════════════════════════════════════════ */
export default function Testimonials() {
    const [active, setActive] = useState(0);
    const [direction, setDirection] = useState(0);
    const autoRef = useRef<NodeJS.Timeout | null>(null);

    const goTo = (idx: number) => {
        setDirection(idx > active ? 1 : -1);
        setActive(idx);
    };

    const next = () => { setDirection(1); setActive((p) => (p + 1) % testimonials.length); };
    const prev = () => { setDirection(-1); setActive((p) => (p - 1 + testimonials.length) % testimonials.length); };

    // Auto-advance
    useEffect(() => {
        autoRef.current = setInterval(next, 6000);
        return () => { if (autoRef.current) clearInterval(autoRef.current); };
    }, [active]);

    const t = testimonials[active];

    const slideVariants = {
        enter: (dir: number) => ({ x: dir > 0 ? 60 : -60, opacity: 0, filter: 'blur(8px)' }),
        center: { x: 0, opacity: 1, filter: 'blur(0px)' },
        exit: (dir: number) => ({ x: dir > 0 ? -60 : 60, opacity: 0, filter: 'blur(8px)' }),
    };

    return (
        <section className="py-28 sm:py-36 px-6 relative overflow-hidden" id="testimonials">
            {/* Background */}
            <div className="absolute inset-0 bg-[#050507]">
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] bg-violet-500/[0.07] rounded-full blur-[120px]" />
            </div>

            <div className="relative z-10 max-w-6xl mx-auto">
                {/* Header */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    className="text-center mb-16"
                >
                    <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-amber-500/[0.08] border border-amber-500/20 text-amber-400 text-xs font-bold tracking-widest uppercase mb-6">
                        <span className="text-sm">💛</span> Wall of Love
                    </span>
                    <h2 className="text-4xl sm:text-6xl lg:text-7xl font-display font-bold tracking-tight">
                        Loved by{' '}
                        <span className="bg-gradient-to-r from-amber-300 via-orange-400 to-rose-400 bg-clip-text text-transparent">builders.</span>
                    </h2>
                </motion.div>

                {/* Featured card — Large */}
                <div className="relative mb-12 max-w-3xl mx-auto">
                    {/* Navigation arrows */}
                    <button
                        onClick={prev}
                        className="absolute -left-4 sm:-left-14 top-1/2 -translate-y-1/2 z-20 w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 transition-colors backdrop-blur-sm"
                    >
                        <ChevronLeft className="w-5 h-5 text-white/60" />
                    </button>
                    <button
                        onClick={next}
                        className="absolute -right-4 sm:-right-14 top-1/2 -translate-y-1/2 z-20 w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 transition-colors backdrop-blur-sm"
                    >
                        <ChevronRight className="w-5 h-5 text-white/60" />
                    </button>

                    <div className="relative overflow-hidden rounded-3xl border border-white/[0.08] bg-[#0a0a0f]/90 backdrop-blur-xl p-8 sm:p-12 min-h-[280px]">
                        {/* Subtle gradient accent */}
                        <div className={cn("absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r", t.gradient)} />

                        <AnimatePresence mode="wait" custom={direction}>
                            <motion.div
                                key={active}
                                custom={direction}
                                variants={slideVariants}
                                initial="enter"
                                animate="center"
                                exit="exit"
                                transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                            >
                                {/* Quote icon */}
                                <Quote className="w-8 h-8 text-white/[0.06] mb-6" />

                                {/* Quote text */}
                                <p className="text-xl sm:text-2xl text-white/85 leading-relaxed font-medium mb-8 max-w-2xl">
                                    &ldquo;{t.quote}&rdquo;
                                </p>

                                {/* Author + Metric */}
                                <div className="flex items-center justify-between flex-wrap gap-6">
                                    <div className="flex items-center gap-4">
                                        <div className={cn("w-12 h-12 rounded-full flex items-center justify-center text-sm font-bold text-white bg-gradient-to-br shadow-lg", t.gradient)}>
                                            {t.avatar}
                                        </div>
                                        <div>
                                            <p className="text-sm font-bold text-white">{t.name}</p>
                                            <p className="text-xs text-white/40">{t.role} at <span className="text-white/60">{t.company}</span></p>
                                        </div>
                                    </div>

                                    {/* Impact metric */}
                                    <div className="text-right">
                                        <p className={cn("text-2xl font-display font-bold bg-gradient-to-r bg-clip-text text-transparent", t.gradient)}>{t.metric}</p>
                                        <p className="text-[11px] text-white/30 uppercase tracking-wider">{t.metricLabel}</p>
                                    </div>
                                </div>
                            </motion.div>
                        </AnimatePresence>
                    </div>

                    {/* Star rating */}
                    <div className="flex items-center justify-center gap-1 mt-6">
                        {[1, 2, 3, 4, 5].map((s) => (
                            <Star key={s} className="w-4 h-4 fill-amber-500 text-amber-500" />
                        ))}
                        <span className="text-xs text-white/30 ml-2">from 50+ agencies</span>
                    </div>
                </div>

                {/* Dots + mini-avatars */}
                <div className="flex items-center justify-center gap-3">
                    {testimonials.map((tm, i) => (
                        <button
                            key={i}
                            onClick={() => goTo(i)}
                            className={cn(
                                "relative transition-all duration-300 rounded-full",
                                i === active
                                    ? "w-10 h-10 ring-2 ring-violet-500/50"
                                    : "w-8 h-8 opacity-40 hover:opacity-70"
                            )}
                        >
                            <div className={cn("w-full h-full rounded-full flex items-center justify-center text-[10px] font-bold text-white bg-gradient-to-br", tm.gradient)}>
                                {tm.avatar}
                            </div>
                        </button>
                    ))}
                </div>
            </div>
        </section>
    );
}
