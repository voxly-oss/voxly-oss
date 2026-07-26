import type { LucideIcon } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface StatCardProps {
    label: string;
    value: string | number;
    delta?: string;
    deltaTone?: 'up' | 'down' | 'neutral';
    icon?: LucideIcon;
    className?: string;
}

const DELTA_TONE_CLASSES: Record<NonNullable<StatCardProps['deltaTone']>, string> = {
    up: 'text-voxly-success',
    down: 'text-voxly-heat',
    neutral: 'text-voxly-ink-5',
};

/**
 * KPI / stat tile for the v3 app shell — built on the existing Card
 * primitive (Card/CardContent), matching the "Cards" spec in
 * design-reference/Voxly Design Language.dc.html.
 */
export default function StatCard({ label, value, delta, deltaTone = 'neutral', icon: Icon, className }: StatCardProps) {
    return (
        <Card className={cn('bg-card border-border rounded-2xl', className)}>
            <CardContent className="p-5">
                <div className="flex items-start justify-between mb-2">
                    <span className="text-[11.5px] text-voxly-ink-5">{label}</span>
                    {Icon && <Icon className="w-4 h-4 text-voxly-ink-5" />}
                </div>
                <div className="font-display font-bold text-[28px] leading-none tabular-nums text-foreground">
                    {value}
                </div>
                {delta && (
                    <div className={cn('text-[11.5px] mt-1.5', DELTA_TONE_CLASSES[deltaTone])}>
                        {delta}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
