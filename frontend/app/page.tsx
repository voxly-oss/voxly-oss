'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { motion, useInView, useMotionValue, useTransform, animate, useScroll } from 'framer-motion';
import {
    ArrowRight, Github, Terminal, Copy, CheckCheck,
    BookOpen, Globe,
} from 'lucide-react';
import VoxlyLogo from '@/components/VoxlyLogo';
import Navbar from '@/components/Navbar';
import HeroBackground from '@/components/HeroBackground';
import HeroVisualPipeline from '@/components/HeroVisualPipeline';
import FeatureShowcase from '@/components/FeatureShowcase';
import { AIEngineVisual, MultiPlatformVisual, GitHubSyncVisual } from '@/components/FeatureVisuals';
import InteractiveDemo from '@/components/InteractiveDemo';
import FeaturesGrid from '@/components/FeaturesGrid';
import HowItWorks from '@/components/HowItWorks';
import SocialProof from '@/components/SocialProof';
import Pricing from '@/components/Pricing';
import Testimonials from '@/components/Testimonials';

/* ─── Shared animation ─── */
function FadeUp({ children, delay = 0, className = '' }: { children: React.ReactNode; delay?: number; className?: string }) {
    return (
        <motion.div initial={{ opacity: 0, y: 28 }} whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-60px' }} transition={{ duration: 0.7, delay, ease: [0.22, 1, 0.36, 1] as const }} className={className}>
            {children}
        </motion.div>
    );
}

/* ─── Animated counter ─── */
function Counter({ target, suffix = '' }: { target: number; suffix?: string }) {
    const ref = useRef<HTMLSpanElement>(null);
    const isInView = useInView(ref, { once: true, margin: '-50px' });
    const mv = useMotionValue(0);
    const display = useTransform(mv, (v) => Math.round(v).toLocaleString());
    useEffect(() => { if (isInView) animate(mv, target, { duration: 2, ease: [0.22, 1, 0.36, 1] as const } as any); }, [isInView, target, mv]);
    return <span ref={ref}><motion.span>{display}</motion.span>{suffix}</span>;
}

/* ─── CLI Copy Block ─── */
function CliBlock() {
    const [copied, setCopied] = useState(false);
    const cmd = 'npx create-voxly@latest my-agency';
    const copy = async () => { try { await navigator.clipboard.writeText(cmd); } catch { const ta = document.createElement('textarea'); ta.value = cmd; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta); } setCopied(true); setTimeout(() => setCopied(false), 2000); };
    return (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6, duration: 0.5, ease: [0.22, 1, 0.36, 1] as const }}
            className="inline-flex items-center gap-3 px-5 py-3 rounded-xl bg-white/[0.04] border border-white/[0.08] backdrop-blur-sm cursor-pointer group hover:border-violet-500/30 transition-colors"
            onClick={copy}>
            <Terminal className="w-4 h-4 text-violet-400" />
            <code className="text-sm text-white/70 font-mono">{cmd}</code>
            {copied ? <CheckCheck className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4 text-white/30 group-hover:text-white/60 transition-colors" />}
        </motion.div>
    );
}

/* ─── Gradient Divider ─── */
function GradientDivider() {
    return <div className="w-full h-px bg-gradient-to-r from-transparent via-violet-500/20 to-transparent" />;
}

/* ═══════════════════ HOMEPAGE ═══════════════════ */
export default function HomePage() {
    const heroRef = useRef<HTMLDivElement>(null);
    const { scrollYProgress } = useScroll({ target: heroRef, offset: ['start start', 'end start'] });
    const heroTextY = useTransform(scrollYProgress, [0, 1], [0, -80]);
    const heroPipelineY = useTransform(scrollYProgress, [0, 1], [0, 60]);

    return (
        <div className="min-h-screen bg-[#050507] text-white overflow-clip">

            <HeroBackground />

            <div className="relative z-10">

                <Navbar />
                
                {/* ═══ 1. HERO ═══ */}
                <section ref={heroRef} className="pt-36 sm:pt-40 pb-20 px-6 max-w-7xl mx-auto relative z-10">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 lg:gap-12 items-center">
                        {/* LEFT COLUMN: Copy */}
                        <motion.div style={{ y: heroTextY }} className="text-left flex flex-col items-start">
                            {/* ── Floating Badge ── */}
                            <motion.div
                                initial={{ opacity: 0, y: 16, filter: 'blur(8px)' }}
                                animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                                transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
                                className="inline-flex items-center gap-2.5 px-5 py-2 rounded-full text-xs font-medium border border-violet-500/25 bg-violet-500/[0.08] text-violet-300 mb-8 backdrop-blur-xl"
                            >
                                <span className="relative flex h-2 w-2">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-violet-400/60" />
                                    <span className="relative inline-flex rounded-full h-2 w-2 bg-violet-400" />
                                </span>
                                <span className="bg-gradient-to-r from-white to-white/60 bg-clip-text text-transparent">Open Source & Free Forever</span>
                            </motion.div>

                            {/* ── Headline ── */}
                            <h1 className="text-5xl sm:text-7xl lg:text-[5.5rem] font-bold tracking-[-0.04em] leading-[1.05] mb-6 text-white font-display">
                                {['Automate', 'client'].map((word, i) => (
                                    <motion.span
                                        key={word}
                                        initial={{ opacity: 0, y: 32, filter: 'blur(6px)' }}
                                        animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                                        transition={{ duration: 0.7, delay: 0.2 + i * 0.08, ease: [0.22, 1, 0.36, 1] }}
                                        className="inline-block mr-[0.3em]"
                                    >
                                        {word}
                                    </motion.span>
                                ))}
                                <br className="hidden sm:block" />
                                {['communication', 'in'].map((word, i) => (
                                    <motion.span
                                        key={word}
                                        initial={{ opacity: 0, y: 32, filter: 'blur(6px)' }}
                                        animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                                        transition={{ duration: 0.7, delay: 0.36 + i * 0.08, ease: [0.22, 1, 0.36, 1] }}
                                        className="inline-block mr-[0.3em]"
                                    >
                                        {word}
                                    </motion.span>
                                ))}{' '}
                                <motion.span
                                    initial={{ opacity: 0, y: 32, filter: 'blur(6px)' }}
                                    animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                                    transition={{ duration: 0.8, delay: 0.5, ease: [0.22, 1, 0.36, 1] }}
                                    className="inline-block italic bg-gradient-to-r from-violet-400 via-cyan-400 to-violet-400 bg-[length:200%_auto] bg-clip-text text-transparent animate-gradient"
                                >
                                    one command.
                                </motion.span>
                            </h1>

                            {/* ── Subtitle ── */}
                            <motion.p
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.7, delay: 0.6, ease: [0.22, 1, 0.36, 1] }}
                                className="text-lg sm:text-xl text-white/45 max-w-xl mb-10 leading-relaxed font-light"
                            >
                                Connect GitHub repos, let AI craft intelligent updates, and deliver them to WhatsApp, Telegram & Slack.
                            </motion.p>

                            {/* ── CTA Buttons ── */}
                            <motion.div
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.7, delay: 0.7, ease: [0.22, 1, 0.36, 1] }}
                                className="flex flex-col sm:flex-row items-center justify-start gap-4 mb-10 w-full"
                            >
                                <Link href="/register" className="group relative inline-flex items-center gap-2 px-8 py-4 text-sm font-semibold rounded-full overflow-hidden transition-all hover:-translate-y-0.5 active:translate-y-0 w-full sm:w-auto justify-center">
                                    <div className="absolute -inset-1 bg-gradient-to-r from-violet-500 via-white to-cyan-400 rounded-full blur-lg opacity-30 group-hover:opacity-50 transition-opacity duration-500" />
                                    <div className="absolute inset-0 bg-white rounded-full" />
                                    <span className="relative z-10 text-black">Get Started Free</span>
                                    <ArrowRight className="relative z-10 w-4 h-4 text-black transition-transform group-hover:translate-x-1" />
                                </Link>
                                <a href="https://github.com/ravin972/voxly" target="_blank" rel="noreferrer"
                                    className="group inline-flex w-full sm:w-auto justify-center items-center gap-2 px-8 py-4 border border-white/10 bg-white/[0.04] backdrop-blur-xl text-white/80 text-sm font-medium rounded-full hover:bg-white/[0.08] transition-all hover:border-white/20 hover:-translate-y-0.5 active:translate-y-0">
                                    <Github className="w-4 h-4 group-hover:text-white transition-colors" /> Star on GitHub
                                </a>
                            </motion.div>

                            {/* ── CLI Block + Ticker ── */}
                            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6">
                                <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.85, ease: [0.22, 1, 0.36, 1] }}>
                                    <CliBlock />
                                </motion.div>
                                <motion.div
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    transition={{ duration: 0.8, delay: 1.0 }}
                                    className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-500/[0.06] border border-emerald-500/15 text-emerald-400/80 text-xs font-medium shrink-0"
                                >
                                    <span className="relative flex h-1.5 w-1.5">
                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400/60" />
                                        <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-400" />
                                    </span>
                                    <span>3 agencies deployed today</span>
                                </motion.div>
                            </div>
                        </motion.div>

                        {/* RIGHT COLUMN: Visual Pipeline */}
                        <motion.div
                            style={{ y: heroPipelineY }}
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ duration: 1, delay: 0.4 }}
                            className="flex justify-center lg:justify-end mt-12 lg:mt-0"
                        >
                            <HeroVisualPipeline />
                        </motion.div>
                    </div>
                </section>

                {/* ═══ 2. LOGOS MARQUEE ═══ */}
                <SocialProof />

                <GradientDivider />

                {/* ═══ 3. FEATURE: AI ENGINE ═══ */}
                <FeatureShowcase
                    label="AI Engine"
                    headline="From commit diff to client update."
                    highlightedWord="Automatically."
                    subtitle="Voxly reads every push, understands the business impact, and crafts a polished message — zero human effort."
                    visual={<AIEngineVisual />}
                />

                <GradientDivider />

                {/* ═══ 4. FEATURE: MULTI-PLATFORM ═══ */}
                <FeatureShowcase
                    label="Multi-Platform"
                    headline="One push. Every"
                    highlightedWord="platform."
                    subtitle="WhatsApp, Telegram, Slack — your clients get updates where they already are. No new apps to install."
                    visual={<MultiPlatformVisual />}
                    reversed
                />

                <GradientDivider />

                {/* ═══ 5. FEATURE: GITHUB SYNC ═══ */}
                <FeatureShowcase
                    label="GitHub Integration"
                    headline="Your repo is the"
                    highlightedWord="single source of truth."
                    subtitle="PRs, issues, deployments — Voxly watches everything and keeps your clients in the loop in real-time."
                    visual={<GitHubSyncVisual />}
                />

                <GradientDivider />

                {/* ═══ 6. INTERACTIVE DEMO ═══ */}
                <InteractiveDemo />

                {/* ═══ 7. STATS STRIP ═══ */}
                <section className="py-16 border-y border-white/[0.05] bg-white/[0.01] backdrop-blur-sm">
                    <div className="max-w-6xl mx-auto px-6 grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
                        {[{ n: 500, s: '+', l: 'Projects Managed' }, { n: 12000, s: '+', l: 'Messages Sent' }, { n: 97, s: '%', l: 'AI Accuracy' }, { n: 50, s: '+', l: 'Agencies Trust Us' }].map((s) => (
                            <div key={s.l} className="group">
                                <p className="text-3xl sm:text-4xl font-bold text-white mb-1 group-hover:scale-110 transition-transform duration-300 bg-gradient-to-b from-white to-white/50 bg-clip-text text-transparent font-display"><Counter target={s.n} suffix={s.s} /></p>
                                <p className="text-xs text-white/40 font-medium uppercase tracking-wider">{s.l}</p>
                            </div>
                        ))}
                    </div>
                </section>

                <GradientDivider />

                {/* ═══ 8. HOW IT WORKS ═══ */}
                <HowItWorks />

                <GradientDivider />

                {/* ═══ 9. TESTIMONIALS ═══ */}
                <Testimonials />

                {/* ═══ 10. PRICING ═══ */}
                <Pricing />

                {/* ═══ 11. FINAL CTA ═══ */}
                <section className="relative py-32 px-6 overflow-hidden">
                    {/* Full-width gradient background */}
                    <div className="absolute inset-0 bg-gradient-to-b from-violet-600/10 via-[#050507] to-[#050507]" />
                    <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-violet-600/20 rounded-full blur-[120px] pointer-events-none" />

                    <FadeUp>
                        <div className="relative z-10 text-center max-w-3xl mx-auto">
                            <h2 className="text-5xl sm:text-6xl lg:text-7xl font-display font-bold mb-6 tracking-tight">
                                Ready to ship{' '}
                                <span className="bg-gradient-to-r from-violet-400 to-cyan-400 bg-clip-text text-transparent">faster?</span>
                            </h2>
                            <p className="text-white/40 mb-12 max-w-lg mx-auto text-lg">Get started in under 2 minutes with our CLI installer. Free forever for open-source.</p>
                            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                                <Link href="/register" className="group relative w-full sm:w-auto inline-flex items-center justify-center gap-2 px-10 py-5 text-sm font-bold rounded-full overflow-hidden transition-all hover:-translate-y-0.5">
                                    <div className="absolute -inset-1 bg-gradient-to-r from-violet-500 via-white to-cyan-400 rounded-full blur-lg opacity-40 group-hover:opacity-60 transition-opacity duration-500" />
                                    <div className="absolute inset-0 bg-white rounded-full" />
                                    <span className="relative z-10 text-black">Start Free Trial</span>
                                    <ArrowRight className="relative z-10 w-4 h-4 text-black transition-transform group-hover:translate-x-1" />
                                </Link>
                                <Link href="/docs" className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-10 py-5 border border-white/10 bg-white/5 backdrop-blur-lg text-white text-sm font-medium rounded-full hover:bg-white/10 transition-colors">
                                    <BookOpen className="w-4 h-4" /> Read the Docs
                                </Link>
                            </div>
                        </div>
                    </FadeUp>
                </section>

                {/* ═══ 12. FOOTER ═══ */}
                <footer className="relative pt-20 pb-8 px-6 bg-[#030304] overflow-hidden">
                    {/* Gradient top line */}
                    <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-violet-500/30 to-transparent" />

                    {/* Footer links */}
                    <div className="max-w-7xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-12 mb-16 relative z-10">
                        <div className="col-span-2 md:col-span-1">
                            <div className="mb-6"><VoxlyLogo size="sm" /></div>
                            <p className="text-sm text-white/30 leading-relaxed max-w-xs">
                                AI-powered client communication for modern agencies. Open-source & self-hostable.
                            </p>
                        </div>
                        {[
                            { title: 'Product', links: [{ name: 'Features', href: '#features' }, { name: 'Pricing', href: '#pricing' }, { name: 'Docs', href: '/docs' }, { name: 'Changelog', href: '#' }] },
                            { title: 'Company', links: [{ name: 'About', href: '#' }, { name: 'Blog', href: '#' }, { name: 'Careers', href: '#' }, { name: 'Contact', href: '#' }] },
                            { title: 'Legal', links: [{ name: 'Privacy', href: '#' }, { name: 'Terms', href: '#' }, { name: 'License', href: '#' }] },
                        ].map((g) => (
                            <div key={g.title}>
                                <p className="text-xs uppercase tracking-[0.15em] text-white/30 font-bold mb-6">{g.title}</p>
                                <ul className="space-y-4">
                                    {g.links.map((l) => (
                                        <li key={l.name}><Link href={l.href} className="text-sm text-white/40 hover:text-white transition-colors">{l.name}</Link></li>
                                    ))}
                                </ul>
                            </div>
                        ))}
                    </div>

                    {/* Sub-footer */}
                    <div className="max-w-7xl mx-auto pt-8 border-t border-white/[0.06] flex flex-col sm:flex-row justify-between items-center gap-6 mb-8 relative z-10">
                        <p className="text-xs text-white/20">© {new Date().getFullYear()} Voxly. Open-source under MIT License.</p>
                        <p className="text-xs text-white/30">Built with <span className="text-rose-400">❤️</span> and <span className="gradient-text">AI</span></p>
                        <div className="flex items-center gap-6">
                            <a href="https://github.com/ravin972/voxly" target="_blank" rel="noreferrer" className="text-white/20 hover:text-white transition-colors"><Github className="w-5 h-5" /></a>
                            <a href="#" className="text-white/20 hover:text-white transition-colors"><Globe className="w-5 h-5" /></a>
                        </div>
                    </div>

                    {/* ── GIANT "VOXLY" TEXT ── */}
                    <div className="relative mt-8 overflow-hidden" style={{ height: '180px' }}>
                        <h2
                            className="text-[12rem] sm:text-[16rem] md:text-[20rem] lg:text-[26rem] font-display font-black tracking-tighter leading-none text-center select-none pointer-events-none whitespace-nowrap"
                            style={{
                                background: 'linear-gradient(180deg, rgba(139,92,246,0.25) 0%, rgba(6,182,212,0.15) 50%, transparent 100%)',
                                WebkitBackgroundClip: 'text',
                                WebkitTextFillColor: 'transparent',
                                backgroundClip: 'text',
                                textShadow: 'none',
                                filter: 'drop-shadow(0 30px 60px rgba(124,58,237,0.3))',
                                transform: 'translateY(20%)',
                            }}
                        >
                            VOXLY
                        </h2>
                        {/* Bottom fade to hide the text's lower portion */}
                        <div className="absolute bottom-0 left-0 right-0 h-1/2 bg-gradient-to-t from-[#030304] to-transparent pointer-events-none" />
                    </div>
                </footer>
            </div>
        </div>
    );
}
