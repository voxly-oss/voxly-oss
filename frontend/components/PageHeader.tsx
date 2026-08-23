import type { ReactNode } from 'react';

interface PageHeaderProps {
    title: string;
    subtitle?: string;
    actions?: ReactNode;
}

/**
 * Shared page title + subtitle + actions row for the v3 app shell.
 * Every list page previously hand-coded its own h1/subtitle pairing
 * (see product design audit, §5 Component Inventory).
 */
export default function PageHeader({ title, subtitle, actions }: PageHeaderProps) {
    return (
        <div className="flex items-start justify-between gap-4 mb-6">
            <div>
                <h1 className="font-display font-bold text-2xl text-foreground tracking-tight">{title}</h1>
                {subtitle && <p className="text-sm text-voxly-ink-5 mt-1">{subtitle}</p>}
            </div>
            {actions && <div className="flex items-center gap-2 flex-none">{actions}</div>}
        </div>
    );
}
