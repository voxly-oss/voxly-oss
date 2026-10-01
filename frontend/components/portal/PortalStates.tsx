import { Link2Off, Loader2, MessageCircle, RefreshCw } from 'lucide-react';

/* The screens around a client's chat. No agency chrome, no login — this is
   what the agency's client sees. */

function Screen({ children }: { children: React.ReactNode }) {
    return (
        <main className="min-h-dvh flex items-center justify-center px-6 py-10">
            <div className="max-w-sm w-full text-center">{children}</div>
        </main>
    );
}

export function Opening() {
    return (
        <Screen>
            <Loader2 className="w-6 h-6 animate-spin text-primary mx-auto mb-4" />
            <h1 className="text-[16px] font-semibold text-foreground mb-1">Opening your chat…</h1>
            <p className="text-[12.5px] text-voxly-ink-5">The first time can take up to a minute.</p>
        </Screen>
    );
}

export function LinkEnded({ agencyName }: { agencyName?: string | null }) {
    return (
        <Screen>
            <span className="w-14 h-14 rounded-2xl bg-voxly-surface-2 border border-border flex items-center justify-center mx-auto mb-4">
                <Link2Off className="w-6 h-6 text-voxly-ink-6" />
            </span>
            <h1 className="text-[16px] font-semibold text-foreground mb-1" data-testid="portal-ended">This chat link isn&apos;t active anymore</h1>
            <p className="text-[13px] text-voxly-ink-5">
                {agencyName ? `Ask ${agencyName} to send you a new link.` : 'Ask your agency to send you a new link.'}
            </p>
        </Screen>
    );
}

export function NoSession() {
    return (
        <Screen>
            <span className="w-14 h-14 rounded-2xl bg-voxly-surface-2 border border-border flex items-center justify-center mx-auto mb-4">
                <MessageCircle className="w-6 h-6 text-voxly-ink-6" />
            </span>
            <h1 className="text-[16px] font-semibold text-foreground mb-1">Open your chat link</h1>
            <p className="text-[13px] text-voxly-ink-5">
                To open your chat, tap the link your agency sent you. On this device it then stays signed in for 30 days.
            </p>
        </Screen>
    );
}

export function CouldNotOpen({ message, onRetry }: { message: string; onRetry: () => void }) {
    return (
        <Screen>
            <h1 className="text-[16px] font-semibold text-foreground mb-1">Couldn&apos;t open your chat</h1>
            <p className="text-[13px] text-voxly-ink-5 mb-4">{message}</p>
            <button
                type="button"
                onClick={onRetry}
                className="inline-flex items-center gap-1.5 rounded-full bg-primary text-primary-foreground px-4 py-2 text-[13px] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
                <RefreshCw className="w-3.5 h-3.5" /> Try again
            </button>
        </Screen>
    );
}
