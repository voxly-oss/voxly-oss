'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { Bot, SendHorizontal, UserRound } from 'lucide-react';
import { cn } from '@/lib/utils';
import { channelLabel } from './inbox-utils';

// Mirrors SendMessageIn.text's max_length on the backend.
export const MESSAGE_MAX = 4096;
const MAX_HEIGHT_PX = 160;

interface ComposerProps {
    clientId: string;
    clientName: string;
    channels: string[];
    defaultChannel: string | null;
    aiPaused: boolean;
    handingBack: boolean;
    onSend: (text: string, channel: string) => void;
    onHandBack: () => void;
}

export default function Composer({
    clientId, clientName, channels, defaultChannel, aiPaused, handingBack, onSend, onHandBack,
}: ComposerProps) {
    const [text, setText] = useState('');
    const [pickedChannel, setPickedChannel] = useState<string | null>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    const channel = pickedChannel && channels.includes(pickedChannel)
        ? pickedChannel
        : defaultChannel && channels.includes(defaultChannel) ? defaultChannel : channels[0] ?? null;
    const trimmed = text.trim();
    const canSend = !!channel && trimmed.length > 0 && text.length <= MESSAGE_MAX;

    const fitHeight = (el: HTMLTextAreaElement) => {
        el.style.height = 'auto';
        el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT_PX)}px`;
    };

    const submit = () => {
        if (!canSend || !channel) return;
        onSend(trimmed, channel);
        setText('');
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
            textareaRef.current.focus();
        }
    };

    if (channels.length === 0) {
        return (
            <div className="border-t border-border px-4 py-3.5 text-[12.5px] text-voxly-ink-6">
                {clientName} has no WhatsApp number or Telegram chat ID, so there&apos;s no channel to reply on.{' '}
                <Link href={`/clients/${clientId}`} className="text-primary font-semibold hover:underline">Add one on their profile</Link>
            </div>
        );
    }

    return (
        <div className="border-t border-border bg-card">
            {/* Who answers next — the real ownership state, not a hint. */}
            <div className={cn(
                'flex items-center gap-2 px-4 py-2 text-[11.5px] border-b border-border',
                aiPaused ? 'bg-voxly-warning-soft text-voxly-warning' : 'text-voxly-ink-6',
            )}>
                {aiPaused ? <UserRound className="w-3.5 h-3.5 flex-none" /> : <Bot className="w-3.5 h-3.5 flex-none text-voxly-violet" />}
                <span className="flex-1 min-w-0">
                    {aiPaused
                        ? 'You’re handling this conversation — the AI won’t reply until you hand it back.'
                        : 'The AI replies automatically. Sending a message takes over the conversation.'}
                </span>
                {aiPaused && (
                    <button
                        type="button"
                        onClick={onHandBack}
                        disabled={handingBack}
                        className="font-semibold text-foreground hover:text-primary disabled:opacity-60 flex-none rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                        {handingBack ? 'Handing back…' : 'Hand back to AI'}
                    </button>
                )}
            </div>

            <form
                className="flex items-end gap-2 px-3 py-2.5"
                onSubmit={(e) => { e.preventDefault(); submit(); }}
            >
                {channels.length > 1 && (
                    <select
                        aria-label="Send on"
                        value={channel ?? ''}
                        onChange={(e) => setPickedChannel(e.target.value)}
                        className="h-10 rounded-[10px] border border-border bg-voxly-surface-2 px-2 text-[12px] text-foreground focus:outline-none focus:border-primary focus:ring-[3px] focus:ring-primary/15"
                    >
                        {channels.map((c) => <option key={c} value={c}>{channelLabel(c)}</option>)}
                    </select>
                )}
                <div className="flex-1 min-w-0">
                    <textarea
                        ref={textareaRef}
                        rows={1}
                        value={text}
                        aria-label={`Message ${clientName}`}
                        placeholder={`Message ${clientName} on ${channelLabel(channel)}`}
                        onChange={(e) => { setText(e.target.value); fitHeight(e.target); }}
                        onKeyDown={(e) => {
                            // Enter sends, Shift+Enter is a new line; never mid IME composition.
                            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                                e.preventDefault();
                                submit();
                            }
                        }}
                        className="block w-full resize-none rounded-[12px] border border-border bg-voxly-surface-2 px-3.5 py-[9px] text-[13.5px] leading-relaxed text-foreground placeholder:text-voxly-ink-5 focus:outline-none focus:border-primary focus:ring-[3px] focus:ring-primary/15 transition-[border-color,box-shadow]"
                    />
                    {text.length > MESSAGE_MAX - 200 && (
                        <div className={cn('text-[10.5px] mt-1 text-right', text.length > MESSAGE_MAX ? 'text-voxly-heat' : 'text-voxly-ink-5')}>
                            {text.length} / {MESSAGE_MAX}
                        </div>
                    )}
                </div>
                <button
                    type="submit"
                    disabled={!canSend}
                    aria-label="Send message"
                    className="h-10 w-10 flex-none rounded-full bg-primary text-primary-foreground flex items-center justify-center transition-[opacity,transform] hover:opacity-90 active:scale-95 disabled:opacity-35 disabled:active:scale-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card"
                >
                    <SendHorizontal className="w-[18px] h-[18px]" />
                </button>
            </form>
        </div>
    );
}
