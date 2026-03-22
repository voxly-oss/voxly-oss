'use client';

import Image from 'next/image';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

const sizeMap = {
    sm: 28,
    md: 36,
    lg: 48,
    xl: 64,
} as const;

interface VoxlyOrbProps {
    size?: 'sm' | 'md' | 'lg' | 'xl';
    className?: string;
    animated?: boolean;
}

export default function VoxlyOrb({ size = 'md', className, animated = true }: VoxlyOrbProps) {
    const s = sizeMap[size];

    return (
        <div
            className={cn('relative flex items-center justify-center flex-shrink-0', className)}
        >
            {/* Ambient Glow */}
            <motion.div
                className="absolute inset-0 rounded-full bg-violet-500/40 blur-lg"
                style={{ width: s, height: s }}
                animate={animated ? { opacity: [0.4, 0.6, 0.4], scale: [1, 1.1, 1] } : undefined}
                transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
            />

            {/* Static Image Orb */}
            <motion.div 
                className="relative z-10 rounded-full overflow-hidden"
                style={{ width: s, height: s }}
                whileHover={{ scale: 1.05 }}
                transition={{ duration: 0.2 }}
            >
                <Image
                    src="/orb-icon.png"
                    alt="Voxly Orb"
                    width={s}
                    height={s}
                    priority
                    className="object-cover"
                />
            </motion.div>
        </div>
    );
}
