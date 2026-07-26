import Link from 'next/link';
import { Plus } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
    icon: LucideIcon;
    title: string;
    description: string;
    href: string;
    label: string;
}

/**
 * Shared empty state for list/collection views inside the app shell.
 * Promoted from the dashboard's local implementation (see
 * design-reference/Voxly Design Language.dc.html — quiet, no gradient).
 */
export default function EmptyState({ icon: Icon, title, description, href, label }: EmptyStateProps) {
    return (
        <div className="flex flex-col items-center py-10 text-center">
            <div className="w-14 h-14 rounded-2xl bg-secondary border border-border flex items-center justify-center mb-4">
                <Icon className="w-6 h-6 text-voxly-ink-5" />
            </div>
            <p className="text-sm font-semibold text-foreground mb-1">{title}</p>
            <p className="text-xs text-voxly-ink-5 mb-5 max-w-[220px] leading-relaxed">{description}</p>
            <Link
                href={href}
                className="flex items-center gap-1.5 px-4 py-2 bg-card border border-border rounded-lg text-xs font-semibold text-voxly-ink-6 hover:text-foreground hover:bg-accent transition-colors"
            >
                <Plus className="w-3.5 h-3.5" /> {label}
            </Link>
        </div>
    );
}
