'use client';

import { Check, ChevronDown } from 'lucide-react';

export function SettingsRow({ label, description, children }: { label: string; description?: string; children: React.ReactNode }) {
    return (
        <div className="flex items-center justify-between gap-4 px-[18px] py-3.5 border-b border-border last:border-b-0">
            <div>
                <div className="text-[13px] text-foreground font-medium">{label}</div>
                {description && <div className="text-[11.5px] text-voxly-ink-5 mt-0.5">{description}</div>}
            </div>
            <div className="flex-none">{children}</div>
        </div>
    );
}

export function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
    return (
        <button
            type="button"
            disabled={disabled}
            onClick={() => onChange(!checked)}
            className={`w-[18px] h-[18px] rounded-[5px] flex items-center justify-center flex-none transition-colors ${
                disabled ? 'cursor-not-allowed opacity-40' : ''
            } ${
                checked ? 'bg-primary' : 'border-[1.5px] border-voxly-ink-4 bg-background'
            }`}
        >
            {checked && <Check className="w-3 h-3 text-primary-foreground" />}
        </button>
    );
}

export function ValueButton({ children }: { children: React.ReactNode }) {
    return (
        <span className="inline-flex items-center gap-1.5 text-[12.5px] text-voxly-ink-6 border border-border hover:border-voxly-ink-4 hover:text-foreground rounded-lg px-[11px] py-[7px] cursor-pointer whitespace-nowrap transition-colors">
            {children}
            <ChevronDown className="w-3 h-3" />
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
