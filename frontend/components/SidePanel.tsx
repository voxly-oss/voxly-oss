'use client';

import { ChevronRight } from 'lucide-react';

export function Panel({ title, badge, defaultOpen = true, children }: { title: string; badge?: React.ReactNode; defaultOpen?: boolean; children: React.ReactNode }) {
    return (
        <details open={defaultOpen} className="group rounded-xl border border-border bg-card overflow-hidden flex-none">
            <summary className="flex items-center gap-2 px-3.5 py-[11px] list-none cursor-pointer select-none [&::-webkit-details-marker]:hidden">
                <ChevronRight className="w-3.5 h-3.5 text-voxly-ink-5 transition-transform group-open:rotate-90" />
                <span className="flex-1 font-mono text-[11px] font-bold uppercase tracking-wider text-voxly-ink-5">{title}</span>
                {badge}
            </summary>
            {children}
        </details>
    );
}

export function PanelRow({ dot, label, value }: { dot?: string; label: React.ReactNode; value: React.ReactNode }) {
    return (
        <div className="flex items-center gap-2 px-3.5 py-[7px] border-t border-border first:border-t-0">
            {dot && <span className={`w-1.5 h-1.5 rounded-full flex-none ${dot}`} />}
            <span className="flex-1 text-xs text-voxly-ink-6">{label}</span>
            <span className="text-xs text-foreground font-semibold">{value}</span>
        </div>
    );
}

export function PanelText({ children }: { children: React.ReactNode }) {
    return <div className="px-3.5 pb-3.5 text-[11.5px] text-voxly-ink-6 leading-relaxed">{children}</div>;
}

export function PanelLink({ href = '#', children }: { href?: string; children: React.ReactNode }) {
    return (
        <div className="px-3.5 py-2 border-t border-border">
            <a href={href} className="text-[11.5px]">{children}</a>
        </div>
    );
}
