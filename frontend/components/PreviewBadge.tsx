import { Sparkles } from 'lucide-react';

/**
 * Visual marker for illustrative/mock content — numbers or entire sections
 * that aren't backed by a real endpoint yet. Distinct from disabled-state
 * styling (which means "not clickable"); this means "not real data."
 */
export default function PreviewBadge({ label = 'Preview', className = '' }: { label?: string; className?: string }) {
    return (
        <span className={`inline-flex items-center gap-1 text-[9.5px] font-semibold uppercase tracking-wide rounded-full pl-1.5 pr-2 py-[2px] bg-voxly-violet-soft text-voxly-violet whitespace-nowrap flex-none ${className}`}>
            <Sparkles className="w-2.5 h-2.5" />
            {label}
        </span>
    );
}

/** Compact icon-only marker for tight spaces (table column headers, stat
 * tile labels) where a full text pill doesn't fit. Hover for the same
 * disclosure via the title attribute. */
export function PreviewMark({ className = '' }: { className?: string }) {
    return (
        <Sparkles
            className={`inline w-2.5 h-2.5 text-voxly-violet align-[1px] ml-1 flex-none ${className}`}
            aria-label="Preview — not backed by a real endpoint yet"
        >
            <title>Preview — not backed by a real endpoint yet</title>
        </Sparkles>
    );
}

export function PreviewBanner({ children }: { children: React.ReactNode }) {
    return (
        <div className="rounded-xl border border-voxly-violet/30 bg-voxly-violet-soft px-[18px] py-3 flex items-center gap-2.5">
            <Sparkles className="w-4 h-4 text-voxly-violet flex-none" />
            <span className="text-[12.5px] text-foreground/90 leading-relaxed">{children}</span>
        </div>
    );
}
