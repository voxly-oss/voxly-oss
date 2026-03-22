'use client';

import { motion } from 'framer-motion';

export default function HeroBackground() {
    return (
        <div className="fixed inset-0 w-full h-full pointer-events-none z-0 overflow-hidden bg-[#050507]">
            {/* ─── 1. Deep Space Base ─── */}
            <div className="absolute inset-0 bg-gradient-to-b from-[#08080c] via-[#050507] to-[#030305]" />

            {/* ─── 2. Aurora Gradient (Breathing) ─── */}
            <div className="absolute inset-0 overflow-hidden">
                <motion.div
                    animate={{
                        scale: [1, 1.1, 1],
                        opacity: [0.4, 0.6, 0.4],
                        rotate: [0, 3, -2, 0],
                    }}
                    transition={{ duration: 12, repeat: Infinity, ease: 'easeInOut' }}
                    className="absolute top-[-20%] left-[-10%] w-[80%] h-[70%] rounded-full"
                    style={{
                        background: 'radial-gradient(ellipse at center, rgba(124, 58, 237, 0.15) 0%, transparent 70%)',
                        filter: 'blur(80px)',
                    }}
                />
                <motion.div
                    animate={{
                        scale: [1, 1.15, 1],
                        opacity: [0.3, 0.5, 0.3],
                        rotate: [0, -2, 3, 0],
                    }}
                    transition={{ duration: 15, repeat: Infinity, ease: 'easeInOut', delay: 2 }}
                    className="absolute top-[-10%] right-[-15%] w-[70%] h-[60%] rounded-full"
                    style={{
                        background: 'radial-gradient(ellipse at center, rgba(6, 182, 212, 0.12) 0%, transparent 70%)',
                        filter: 'blur(80px)',
                    }}
                />
                <motion.div
                    animate={{
                        scale: [1, 1.08, 1],
                        opacity: [0.2, 0.35, 0.2],
                    }}
                    transition={{ duration: 18, repeat: Infinity, ease: 'easeInOut', delay: 4 }}
                    className="absolute bottom-[-20%] left-[20%] w-[60%] h-[50%] rounded-full"
                    style={{
                        background: 'radial-gradient(ellipse at center, rgba(236, 72, 153, 0.08) 0%, transparent 70%)',
                        filter: 'blur(100px)',
                    }}
                />
            </div>

            {/* ─── 3. Perspective Grid ─── */}
            <div
                className="absolute inset-0 opacity-[0.07]"
                style={{
                    backgroundImage: `
                        linear-gradient(rgba(255,255,255,0.3) 1px, transparent 1px),
                        linear-gradient(90deg, rgba(255,255,255,0.3) 1px, transparent 1px)
                    `,
                    backgroundSize: '60px 60px',
                    maskImage: 'radial-gradient(ellipse at 50% 0%, black 0%, transparent 70%)',
                    WebkitMaskImage: 'radial-gradient(ellipse at 50% 0%, black 0%, transparent 70%)',
                    transform: 'perspective(500px) rotateX(60deg)',
                    transformOrigin: 'top center',
                }}
            />

            {/* ─── 4. Floating particles ─── */}
            <div className="absolute inset-0">
                {[...Array(6)].map((_, i) => (
                    <motion.div
                        key={i}
                        className="absolute w-1 h-1 rounded-full bg-white/20"
                        style={{
                            left: `${15 + i * 15}%`,
                            top: `${20 + (i % 3) * 25}%`,
                        }}
                        animate={{
                            y: [0, -30, 0],
                            opacity: [0.2, 0.5, 0.2],
                        }}
                        transition={{
                            duration: 4 + i * 0.8,
                            repeat: Infinity,
                            ease: 'easeInOut',
                            delay: i * 0.6,
                        }}
                    />
                ))}
            </div>

            {/* ─── 5. Noise Texture ─── */}
            <div
                className="absolute inset-0 opacity-[0.025] mix-blend-overlay"
                style={{
                    backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 256 256\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'noise\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.8\' numOctaves=\'3\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23noise)\'/%3E%3C/svg%3E")',
                }}
            />
        </div>
    );
}
