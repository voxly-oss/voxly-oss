'use client';

import { Check } from 'lucide-react';

export function SettingsRow({ label, description, children }: { label: string; description?: string; children: React.ReactNode }) {
    return (
        <div className="flex items-center justify-between gap-4 px-[18px] py-3.5 border-b border-border last:border-b-0">
            <div className="min-w-0">
                <div className="text-[13px] text-foreground font-medium">{label}</div>
                {description && <div className="text-[11.5px] text-voxly-ink-5 mt-0.5">{description}</div>}
            </div>
            <div className="flex-none">{children}</div>
        </div>
    );
}

/** Checkbox-style switch. The 18px square sits in a 24px hit target (WCAG 2.5.8). */
export function Toggle({ checked, onChange, disabled, label }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; label: string }) {
    return (
        <button
            type="button"
            role="switch"
            aria-checked={checked}
            aria-label={label}
            disabled={disabled}
            onClick={() => onChange(!checked)}
            className="w-6 h-6 -m-[3px] flex items-center justify-center rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed"
        >
            <span
                className={`w-[18px] h-[18px] rounded-[5px] flex items-center justify-center transition-colors ${disabled ? 'opacity-40' : ''} ${
                    checked ? 'bg-primary' : 'border-[1.5px] border-voxly-ink-4 bg-background'
                }`}
            >
                {checked && <Check className="w-3 h-3 text-primary-foreground" />}
            </span>
        </button>
    );
}

/**
 * Read-only state for a settings row. Replaces the old ValueButton — a <span>
 * dressed as a dropdown (chevron, hover, pointer) that opened nothing and
 * showed invented values. "Coming soon" says what's true instead.
 */
export function StatusPill({ tone = 'muted', children = 'Coming soon' }: { tone?: 'muted' | 'success'; children?: React.ReactNode }) {
    const success = tone === 'success';
    return (
        <span
            className={`inline-flex items-center gap-1.5 text-[11px] font-semibold rounded-full pl-1.5 pr-2 py-[3px] whitespace-nowrap ${
                success ? 'bg-voxly-success-soft text-voxly-success' : 'bg-voxly-surface-3 text-voxly-ink-6'
            }`}
        >
            <span className={`w-[5px] h-[5px] rounded-full ${success ? 'bg-voxly-success' : 'bg-voxly-ink-5'}`} />
            {children}
        </span>
    );
}

export function StaticValue({ children }: { children: React.ReactNode }) {
    return (
        <span className="text-[13px] text-foreground bg-background border border-voxly-ink-4 rounded-lg px-3 py-2 min-w-[180px] text-right block whitespace-nowrap">
            {children}
        </span>
    );
}
