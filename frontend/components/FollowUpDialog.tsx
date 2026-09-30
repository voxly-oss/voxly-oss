'use client';

import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Loader2, Send } from 'lucide-react';
import { clientsAPI, notificationsAPI, getApiErrorMessage } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { NativeSelect } from '@/components/ui/native-select';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import FieldError from '@/components/FieldError';
import { useToast } from '@/hooks/use-toast';
import { formatPhone } from '@/lib/utils';
import type { Client } from '@/types';

// Backend caps the body at 1000 chars and rate-limits to 10/min — enforced
// here too rather than discovered on failure.
const FOLLOW_UP_MAX = 1000;
const LABEL = 'text-[12.5px] font-medium text-voxly-ink-6';

interface FollowUpDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** Fixed recipient. Omit to let the user pick a client (Compose). */
    client?: { id: string; name: string; phone?: string | null } | null;
}

/**
 * Send a one-off WhatsApp message to a client — POST /api/v1/notifications/send.
 *
 * Honest about its limits: the endpoint delivers on WhatsApp only and does not
 * write to chat_history, so a sent follow-up won't appear in the conversation
 * log. The copy says so rather than letting the user look for it.
 */
export default function FollowUpDialog({ open, onOpenChange, client }: FollowUpDialogProps) {
    const { toast } = useToast();
    const [message, setMessage] = useState('');
    const [pickedClientId, setPickedClientId] = useState('');
    const [showPickerError, setShowPickerError] = useState(false);
    const needsPicker = !client;

    const { data: clients = [], isLoading: clientsLoading } = useQuery({
        queryKey: ['clients'],
        queryFn: async () => (await clientsAPI.list()).data as Client[],
        enabled: open && needsPicker,
    });

    const picked = needsPicker ? clients.find((c) => c.id === pickedClientId) : null;
    const recipient = client ?? (picked ? { id: picked.id, name: picked.name, phone: picked.phone } : null);

    const reset = () => {
        setMessage('');
        setPickedClientId('');
        setShowPickerError(false);
    };

    const mutation = useMutation({
        mutationFn: ({ clientId, body }: { clientId: string; body: string }) =>
            notificationsAPI.send({ client_id: clientId, message: body }),
        onSuccess: (res) => {
            toast({
                title: 'Follow-up sent',
                description: `Delivered to ${res.data?.client_name ?? recipient?.name ?? 'the client'} on WhatsApp.`,
            });
            reset();
            onOpenChange(false);
        },
        onError: (err) => {
            toast({
                variant: 'destructive',
                title: 'Couldn’t send follow-up',
                description: getApiErrorMessage(err, 'The message could not be delivered.'),
            });
        },
    });

    const trimmed = message.trim();
    const tooLong = message.length > FOLLOW_UP_MAX;
    const canSend = trimmed.length > 0 && !tooLong && !mutation.isPending;

    const submit = () => {
        if (!recipient) {
            setShowPickerError(true);
            return;
        }
        if (!canSend) return;
        mutation.mutate({ clientId: recipient.id, body: trimmed });
    };

    const handleOpenChange = (next: boolean) => {
        if (mutation.isPending) return;
        if (!next) reset();
        onOpenChange(next);
    };

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Send className="w-4 h-4 text-primary" />
                        {needsPicker ? 'New message' : 'Send follow-up'}
                    </DialogTitle>
                    <DialogDescription className="text-voxly-ink-6">
                        {recipient ? (
                            <>
                                Delivered to {recipient.name} on WhatsApp
                                {recipient.phone && <span className="font-mono text-voxly-ink-5"> · {formatPhone(recipient.phone)}</span>}
                            </>
                        ) : (
                            'Send a WhatsApp message to one of your clients.'
                        )}
                    </DialogDescription>
                </DialogHeader>

                {needsPicker && (
                    <div className="space-y-1.5">
                        <Label htmlFor="follow-up-client" className={LABEL}>To</Label>
                        <NativeSelect
                            id="follow-up-client"
                            value={pickedClientId}
                            disabled={clientsLoading || mutation.isPending}
                            onChange={(e) => { setPickedClientId(e.target.value); setShowPickerError(false); }}
                            aria-invalid={showPickerError && !recipient}
                            aria-describedby={showPickerError && !recipient ? 'follow-up-client-error' : undefined}
                        >
                            <option value="">{clientsLoading ? 'Loading clients…' : clients.length === 0 ? 'No clients yet' : 'Select a client'}</option>
                            {clients.map((c) => (
                                <option key={c.id} value={c.id}>{c.company ? `${c.name} — ${c.company}` : c.name}</option>
                            ))}
                        </NativeSelect>
                        {showPickerError && !recipient && <FieldError id="follow-up-client-error" message="Choose who to send this to" />}
                    </div>
                )}

                <div className="space-y-1.5">
                    <Label htmlFor="follow-up-message" className={LABEL}>Message</Label>
                    <Textarea
                        id="follow-up-message"
                        rows={5}
                        autoFocus={!needsPicker}
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        onKeyDown={(e) => {
                            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                                e.preventDefault();
                                submit();
                            }
                        }}
                        placeholder="Quick update on your project…"
                        aria-invalid={tooLong}
                        aria-describedby="follow-up-meta"
                    />
                    <div id="follow-up-meta" className="flex items-center justify-between gap-3 text-[11.5px]">
                        <span className="text-voxly-ink-5">⌘/Ctrl + Enter to send · not added to the conversation log</span>
                        <span className={tooLong ? 'text-destructive font-semibold flex-none' : 'text-voxly-ink-5 tabular-nums flex-none'}>
                            {message.length} / {FOLLOW_UP_MAX}
                        </span>
                    </div>
                    {tooLong && (
                        <FieldError
                            message={`Message is ${message.length - FOLLOW_UP_MAX} character${message.length - FOLLOW_UP_MAX === 1 ? '' : 's'} over the limit.`}
                        />
                    )}
                </div>

                <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={mutation.isPending}>
                        Cancel
                    </Button>
                    <Button type="button" onClick={submit} disabled={!canSend} className="gap-2 font-semibold">
                        {mutation.isPending ? (
                            <><Loader2 className="w-4 h-4 animate-spin" />Sending…</>
                        ) : (
                            <><Send className="w-4 h-4" />Send message</>
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
