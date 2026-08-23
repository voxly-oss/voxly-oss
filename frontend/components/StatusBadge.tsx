import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

type KnownStatus =
    | 'active' | 'in_progress'
    | 'paused' | 'pending'
    | 'completed'
    | 'blocked' | 'cancelled'
    | 'inactive';

const STATUS_MAP: Record<KnownStatus, { label: string; dot: string; classes: string }> = {
    active: { label: 'Active', dot: 'bg-voxly-success', classes: 'bg-voxly-success-soft text-voxly-success border-transparent' },
    in_progress: { label: 'In Progress', dot: 'bg-voxly-success', classes: 'bg-voxly-success-soft text-voxly-success border-transparent' },
    paused: { label: 'Paused', dot: 'bg-voxly-warning', classes: 'bg-voxly-warning-soft text-voxly-warning border-transparent' },
    pending: { label: 'Pending', dot: 'bg-voxly-warning', classes: 'bg-voxly-warning-soft text-voxly-warning border-transparent' },
    completed: { label: 'Completed', dot: 'bg-voxly-violet', classes: 'bg-voxly-violet-soft text-voxly-violet border-transparent' },
    blocked: { label: 'Blocked', dot: 'bg-voxly-heat', classes: 'bg-voxly-heat-soft text-voxly-heat border-transparent' },
    cancelled: { label: 'Cancelled', dot: 'bg-voxly-heat', classes: 'bg-voxly-heat-soft text-voxly-heat border-transparent' },
    inactive: { label: 'Inactive', dot: 'bg-voxly-ink-5', classes: 'bg-secondary text-voxly-ink-6 border-transparent' },
};

interface StatusBadgeProps {
    status: string;
    label?: string;
    className?: string;
}

/**
 * One status-badge system for the v3 app shell, replacing the three
 * competing implementations found in the product design audit
 * (lib/utils.ts getStatusColor, globals.css .status-*, and a local
 * getStatusStyle in projects/page.tsx). Built on top of the existing
 * Badge primitive rather than a new markup shape.
 */
export default function StatusBadge({ status, label, className }: StatusBadgeProps) {
    const entry = STATUS_MAP[status as KnownStatus] ?? STATUS_MAP.inactive;
    return (
        <Badge variant="outline" className={cn('gap-1.5 pl-2 font-semibold', entry.classes, className)}>
            <span className={cn('w-1.5 h-1.5 rounded-full', entry.dot)} />
            {label ?? entry.label}
        </Badge>
    );
}
