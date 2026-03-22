'use client';

import Image from 'next/image';
import { cn } from '@/lib/utils';
import VoxlyOrb from './VoxlyOrb';
import fullLogo from '@/assets/images/voxly-logo-full.png';

const heightMap = {
    sm: 28,  // Navbar height
    md: 36,  // Sidebar/Auth
    lg: 48,  // Hero
    xl: 64,  // Large Navbar
} as const;

interface VoxlyLogoProps {
    size?: 'sm' | 'md' | 'lg' | 'xl';
    className?: string;
    showText?: boolean;
    animated?: boolean;
}

export default function VoxlyLogo({
    size = 'md',
    className,
    showText = true,
    animated = true
}: VoxlyLogoProps) {
    const height = heightMap[size];

    // If text is hidden, show just the independent Orb (favicon style)
    if (!showText) {
        return <VoxlyOrb size={size} className={className} animated={animated} />;
    }

    // Otherwise show the full logo image
    // Using imported image allows Next.js to handle intrinsic dimensions
    return (
        <div
            className={cn('relative flex items-center', className)}
        >
            <Image
                src={fullLogo}
                alt="Voxly"
                height={height}
                className="w-auto h-auto object-contain"
                style={{ height: height }}
                priority
            />
        </div>
    );
}
