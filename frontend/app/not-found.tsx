'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowLeft, Home, Search, Compass } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function NotFound() {
    return (
        <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center relative overflow-hidden px-4">
            {/* Ambient background effects */}
            <div className="absolute inset-0 pointer-events-none">
                {/* Radial gradients */}
                <div className="absolute top-1/4 left-1/4 w-[600px] h-[600px] rounded-full bg-violet-600/8 blur-[120px]" />
                <div className="absolute bottom-1/4 right-1/4 w-[500px] h-[500px] rounded-full bg-blue-600/6 blur-[100px]" />
                {/* Grid pattern */}
                <div
                    className="absolute inset-0 opacity-[0.03]"
                    style={{
                        backgroundImage: `linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)`,
                        backgroundSize: '60px 60px',
                    }}
                />
            </div>

            <div className="relative z-10 text-center max-w-lg mx-auto">
                {/* Animated 404 number */}
                <motion.div
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                    className="relative mb-6"
                >
                    <span className="text-[160px] sm:text-[200px] font-black leading-none tracking-tighter bg-gradient-to-b from-white/15 to-white/3 bg-clip-text text-transparent select-none">
                        404
                    </span>
                    {/* Glowing accent line */}
                    <motion.div
                        className="absolute left-1/2 -translate-x-1/2 bottom-4 h-1 rounded-full bg-gradient-to-r from-violet-500 to-blue-500"
                        initial={{ width: 0 }}
                        animate={{ width: '40%' }}
                        transition={{ delay: 0.4, duration: 0.8, ease: 'easeOut' }}
                    />
                </motion.div>

                {/* Icon */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2, duration: 0.5 }}
                    className="mb-6"
                >
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-500/10 to-blue-500/10 border border-violet-500/20">
                        <Compass className="w-8 h-8 text-violet-400" />
                    </div>
                </motion.div>

                {/* Text */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3, duration: 0.5 }}
                >
                    <h1 className="text-2xl sm:text-3xl font-bold text-white mb-3">
                        Page not found
                    </h1>
                    <p className="text-white/40 text-sm sm:text-base max-w-sm mx-auto leading-relaxed">
                        The page you&apos;re looking for doesn&apos;t exist or has been moved.
                        Let&apos;s get you back on track.
                    </p>
                </motion.div>

                {/* Action buttons */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.5, duration: 0.5 }}
                    className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3"
                >
                    <Button
                        asChild
                        className="bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-500 hover:to-blue-500 text-white border-0 px-6 h-11 gap-2 shadow-lg shadow-violet-500/20"
                    >
                        <Link href="/dashboard">
                            <Home className="w-4 h-4" />
                            Go to Dashboard
                        </Link>
                    </Button>
                    <Button
                        asChild
                        variant="outline"
                        className="border-white/10 text-white/60 hover:text-white hover:bg-white/5 px-6 h-11 gap-2"
                    >
                        <Link href="/">
                            <ArrowLeft className="w-4 h-4" />
                            Back to Home
                        </Link>
                    </Button>
                </motion.div>

                {/* Quick links */}
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.7, duration: 0.5 }}
                    className="mt-10 pt-6 border-t border-white/5"
                >
                    <p className="text-xs text-white/20 mb-3">Quick links</p>
                    <div className="flex flex-wrap items-center justify-center gap-4">
                        {[
                            { label: 'Clients', href: '/clients' },
                            { label: 'Projects', href: '/projects' },
                            { label: 'Messages', href: '/messages' },
                            { label: 'Settings', href: '/settings' },
                        ].map((link) => (
                            <Link
                                key={link.href}
                                href={link.href}
                                className="text-sm text-white/30 hover:text-violet-400 transition-colors"
                            >
                                {link.label}
                            </Link>
                        ))}
                    </div>
                </motion.div>
            </div>
        </div>
    );
}
