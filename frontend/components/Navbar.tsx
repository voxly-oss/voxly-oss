'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import VoxlyLogo from './VoxlyLogo';

const navLinks = [
    { label: 'Features', href: '#features' },
    { label: 'How It Works', href: '#how-it-works' },
    { label: 'Pricing', href: '#pricing' },
    { label: 'Docs', href: '/docs' },
];

/* ─────────── Animated Hamburger Icon ─────────── */
function HamburgerIcon({ isOpen }: { isOpen: boolean }) {
    const lineProps = {
        stroke: 'currentColor',
        strokeWidth: 2,
        strokeLinecap: 'round' as const,
        vectorEffect: 'non-scaling-stroke' as const,
    };

    return (
        <svg width="24" height="24" viewBox="0 0 24 24" className="text-white">
            <motion.line
                x1="4" y1="7" x2="20" y2="7"
                {...lineProps}
                animate={isOpen ? { x1: 6, y1: 6, x2: 18, y2: 18 } : { x1: 4, y1: 7, x2: 20, y2: 7 }}
                transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            />
            <motion.line
                x1="4" y1="12" x2="20" y2="12"
                {...lineProps}
                animate={isOpen ? { opacity: 0, x1: 12, x2: 12 } : { opacity: 1, x1: 4, x2: 20 }}
                transition={{ duration: 0.2 }}
            />
            <motion.line
                x1="4" y1="17" x2="20" y2="17"
                {...lineProps}
                animate={isOpen ? { x1: 6, y1: 18, x2: 18, y2: 6 } : { x1: 4, y1: 17, x2: 20, y2: 17 }}
                transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            />
        </svg>
    );
}

/* ─────────── Mobile Menu Overlay ─────────── */
function MobileMenu({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                    className="fixed top-[5.5rem] left-6 right-6 z-40 rounded-2xl border border-white/10 bg-black/80 backdrop-blur-2xl shadow-2xl shadow-violet-500/10 overflow-hidden max-h-[calc(100vh-8rem)] overflow-y-auto"
                >
                    {/* Subtle top gradient */}
                    <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-violet-500/30 to-transparent" />

                    <div className="p-6 space-y-2">
                        {navLinks.map((link, i) => (
                            <motion.div
                                key={link.label}
                                initial={{ opacity: 0, x: -16 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: 0.05 + i * 0.06, duration: 0.3 }}
                            >
                                <Link
                                    href={link.href}
                                    onClick={onClose}
                                    className="block py-3 px-4 text-base font-medium text-white/70 hover:text-white hover:bg-white/5 rounded-xl transition-all"
                                >
                                    {link.label}
                                </Link>
                            </motion.div>
                        ))}

                        {/* Divider */}
                        <div className="h-[1px] bg-white/10 my-3" />

                        {/* Auth buttons */}
                        <motion.div
                            initial={{ opacity: 0, x: -16 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: 0.3, duration: 0.3 }}
                            className="space-y-3 pt-1"
                        >
                            <Link
                                href="/login"
                                onClick={onClose}
                                className="block text-center py-3 px-4 text-base font-medium text-white/70 hover:text-white hover:bg-white/5 rounded-xl transition-all"
                            >
                                Log in
                            </Link>
                            <Link
                                href="/register"
                                onClick={onClose}
                                className="block text-center py-3 px-4 text-base font-semibold text-black bg-white rounded-xl hover:bg-gray-100 transition-all shadow-[0_0_30px_-5px_rgba(255,255,255,0.2)]"
                            >
                                Get Started
                            </Link>
                        </motion.div>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}

/* ─────────── Main Navbar ─────────── */
export default function Navbar() {
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const [scrolled, setScrolled] = useState(false);
    const [activeLink, setActiveLink] = useState<string | null>(null);

    // Track scroll for subtle background change
    useEffect(() => {
        const handleScroll = () => setScrolled(window.scrollY > 20);
        window.addEventListener('scroll', handleScroll, { passive: true });
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    // Lock body scroll on mobile menu open
    useEffect(() => {
        document.body.style.overflow = mobileMenuOpen ? 'hidden' : '';
        return () => { document.body.style.overflow = ''; };
    }, [mobileMenuOpen]);

    return (
        <>
            <nav className="fixed top-0 left-0 right-0 z-50 flex justify-center pt-5 px-4 sm:px-6">
                <motion.div
                    initial={{ opacity: 0, y: -24 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
                    className={`
                        w-full max-w-screen-xl flex items-center justify-between
                        px-5 sm:px-6 py-3
                        rounded-full relative overflow-hidden
                        border transition-all duration-500
                        ${scrolled
                            ? 'border-white/10 bg-black/60 backdrop-blur-2xl shadow-2xl shadow-violet-500/5'
                            : 'border-white/5 bg-black/30 backdrop-blur-xl shadow-xl shadow-violet-500/0'
                        }
                    `}
                >
                    {/* ── Gradient border highlights ── */}
                    <div className="absolute bottom-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-violet-500/20 to-transparent" />
                    <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-white/5 to-transparent" />

                    {/* ── Logo with hover animation ── */}
                    <Link href="/" className="relative z-10 group">
                        <motion.div
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.97 }}
                            transition={{ type: 'spring', stiffness: 400, damping: 17 }}
                            className="relative"
                        >
                            <VoxlyLogo size="sm" />
                            {/* Hover glow behind logo */}
                            <div className="absolute -inset-3 rounded-full bg-violet-500/0 group-hover:bg-violet-500/10 blur-xl transition-all duration-500 pointer-events-none" />
                        </motion.div>
                    </Link>

                    {/* ── Center Nav Links (Desktop) ── */}
                    <div className="hidden md:flex items-center gap-1 absolute left-1/2 -translate-x-1/2">
                        {navLinks.map((link) => (
                            <Link
                                key={link.label}
                                href={link.href}
                                onMouseEnter={() => setActiveLink(link.label)}
                                onMouseLeave={() => setActiveLink(null)}
                                className="relative px-4 py-2 text-sm font-medium text-white/50 hover:text-white transition-colors z-10"
                            >
                                {/* Hover pill background */}
                                <AnimatePresence>
                                    {activeLink === link.label && (
                                        <motion.div
                                            layoutId="nav-hover-pill"
                                            initial={{ opacity: 0 }}
                                            animate={{ opacity: 1 }}
                                            exit={{ opacity: 0 }}
                                            transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                                            className="absolute inset-0 rounded-full bg-white/[0.06] border border-white/[0.08]"
                                        />
                                    )}
                                </AnimatePresence>
                                <span className="relative z-10">{link.label}</span>
                            </Link>
                        ))}
                    </div>

                    {/* ── Right Actions (Desktop) ── */}
                    <div className="hidden md:flex items-center gap-3 relative z-10">
                        <Link
                            href="/login"
                            className="px-4 py-2 text-sm font-medium text-white/60 hover:text-white transition-colors"
                        >
                            Log in
                        </Link>
                        <Link
                            href="/register"
                            className="group relative px-5 py-2.5 text-sm font-semibold text-black rounded-full overflow-hidden transition-all"
                        >
                            {/* Button background with animated shimmer */}
                            <div className="absolute inset-0 bg-white rounded-full" />
                            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-violet-200/40 to-transparent rounded-full translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700" />
                            <span className="relative z-10">Get Started</span>
                        </Link>
                    </div>

                    {/* ── Hamburger Button (Mobile) ── */}
                    <button
                        onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                        className="md:hidden relative z-10 p-2 -mr-2 rounded-xl hover:bg-white/5 transition-colors"
                        aria-label="Toggle menu"
                    >
                        <HamburgerIcon isOpen={mobileMenuOpen} />
                    </button>
                </motion.div>
            </nav>

            {/* ── Mobile Menu Overlay ── */}
            <MobileMenu isOpen={mobileMenuOpen} onClose={() => setMobileMenuOpen(false)} />

            {/* ── Click-away backdrop ── */}
            <AnimatePresence>
                {mobileMenuOpen && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        onClick={() => setMobileMenuOpen(false)}
                        className="fixed inset-0 z-30 bg-black/40 backdrop-blur-sm md:hidden"
                    />
                )}
            </AnimatePresence>
        </>
    );
}
