'use client';

import { AlertCircle, Check, Clock3, Loader2, RotateCw, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ThreadMessage } from '@/types';
import { channelLabel, formatClock } from './inbox-utils';

/* Ticks reflect what the backend actually knows. There is no delivered/read
   receipt yet (that needs provider status webhooks; Telegram has none for
   bots), so "sent" is a single check, never a fabricated double tick. */
function StatusTick({ status }: { status: ThreadMessage['status'] }) {
    if (status === 'queued') {
        return <Clock3 className="w-3 h-3" aria-label="Sending" />;
    }
    if (status === 'failed') {
        return <AlertCircle className="w-3.5 h-3.5 text-voxly-heat" aria-label="Not delivered" />;
    }
    if (status === 'sent') {
        return <Check className="w-3.5 h-3.5" aria-label="Sent" />;
    }
    return null;
}

interface MessageBubbleProps {
    message: ThreadMessage;
    /** Shown at the start of a run of messages from the same author; null continues the run. */
    authorLabel: string | null;
    /** The conversation hopped channels here (e.g. WhatsApp → Telegram). */
    showChannel: boolean;
    retrying: boolean;
    onRetry: (message: ThreadMessage) => void;
}

export default function MessageBubble({ message: m, authorLabel, showChannel, retrying, onRetry }: MessageBubbleProps) {
    const outbound = m.direction === 'outbound';
    const ai = m.author_type === 'ai';

    return (
        <div
            data-testid="message"
            data-author={m.author_type}
            data-status={m.status}
            className={cn(
                'flex flex-col max-w-[min(80%,560px)]',
                outbound ? 'items-end self-end' : 'items-start self-start',
                authorLabel ? 'mt-3' : 'mt-0.5',
            )}
        >
            {authorLabel && (
                <span
                    className={cn(
                        'text-[11px] font-semibold mb-1 px-1 flex items-center gap-1',
                        ai ? 'text-voxly-violet' : outbound ? 'text-primary' : 'text-voxly-ink-6',
                    )}
                    title={ai && m.model_used ? m.model_used : undefined}
                >
                    {ai && <Sparkles className="w-3 h-3" />}
                    {authorLabel}
                    {showChannel && <span className="font-normal text-voxly-ink-5">· via {channelLabel(m.channel)}</span>}
                </span>
            )}
            <div
                className={cn(
                    'rounded-[14px] px-3 py-[7px] text-[13.5px] leading-relaxed text-foreground whitespace-pre-wrap [overflow-wrap:anywhere] border',
                    outbound
                        ? ai ? 'bg-voxly-violet-soft border-voxly-violet/20' : 'bg-primary/[0.13] border-primary/25'
                        : 'bg-voxly-surface-3/60 border-border',
                    authorLabel && (outbound ? 'rounded-tr-[4px]' : 'rounded-tl-[4px]'),
                    m.status === 'failed' && 'border-voxly-heat/50',
                )}
            >
                {m.body}
                {/* Time + tick float into the last line, the way chat apps do. */}
                <span className="float-right ml-3 mt-[7px] -mb-[3px] inline-flex items-center gap-1 text-[10.5px] leading-none text-voxly-ink-5 select-none">
                    {formatClock(m.created_at)}
                    {outbound && <StatusTick status={m.status} />}
                </span>
            </div>
            {m.status === 'failed' && (
                <div className="flex items-center gap-2 mt-1 px-1 text-[11.5px] text-voxly-heat" role="alert">
                    <span className="min-w-0">Not delivered{m.error ? ` — ${m.error}` : ''}</span>
                    <button
                        type="button"
                        onClick={() => onRetry(m)}
                        disabled={retrying}
                        className="inline-flex items-center gap-1 font-semibold text-foreground hover:text-primary disabled:opacity-60 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring flex-none"
                    >
                        {retrying ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCw className="w-3 h-3" />}
                        {retrying ? 'Retrying…' : 'Retry'}
                    </button>
                </div>
            )}
        </div>
    );
}
