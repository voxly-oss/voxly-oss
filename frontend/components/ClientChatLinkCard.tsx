'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Copy, Link2, Loader2, MessageCircle, RefreshCw, Unlink } from 'lucide-react';
import { chatLinkAPI, getApiErrorMessage } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import ConfirmDialog from '@/components/ConfirmDialog';
import { formatListTime } from '@/components/inbox/inbox-utils';
import type { ChatLink, Client } from '@/types';

const NO_LINK: ChatLink = { active: false, url: null, created_at: null, last_opened_at: null, last_opened_device: null };

/** The client's personal Voxly chat link: their own chat with the agency, no
 *  WhatsApp or Telegram needed. Regenerate to cut off a forwarded link. */
export default function ClientChatLinkCard({ client }: { client: Client }) {
    const queryClient = useQueryClient();
    const { toast } = useToast();
    const { user } = useAuth();
    const key = ['chat-link', client.id];
    const [confirm, setConfirm] = useState<'regenerate' | 'revoke' | null>(null);
    const [copied, setCopied] = useState(false);

    const linkQuery = useQuery({ queryKey: key, queryFn: async () => (await chatLinkAPI.get(client.id)).data });
    const link = linkQuery.data;

    // The inbox offers "Voxly chat" as a channel only while a link is active.
    const refreshConversation = () => queryClient.invalidateQueries({ queryKey: ['conversation', client.id] });

    const create = useMutation({
        mutationFn: async () => (await chatLinkAPI.create(client.id)).data,
        onSuccess: (created) => {
            const regenerated = !!link?.active;
            queryClient.setQueryData(key, created);
            refreshConversation();
            toast({
                title: regenerated ? 'New chat link created' : 'Chat link ready',
                description: regenerated ? 'The old link stopped working.' : `Send it to ${client.name} — it opens their private chat with you.`,
            });
        },
        onError: (err) => toast({ variant: 'destructive', title: 'Couldn’t create the link', description: getApiErrorMessage(err, 'Please try again.') }),
        onSettled: () => setConfirm(null),
    });

    const revoke = useMutation({
        mutationFn: () => chatLinkAPI.revoke(client.id),
        onSuccess: () => {
            queryClient.setQueryData(key, NO_LINK);
            refreshConversation();
            toast({ title: 'Chat link turned off', description: `${client.name} can no longer open the chat with it.` });
        },
        onError: (err) => toast({ variant: 'destructive', title: 'Couldn’t turn off the link', description: getApiErrorMessage(err, 'Please try again.') }),
        onSettled: () => setConfirm(null),
    });

    const copy = async (url: string) => {
        try {
            await navigator.clipboard.writeText(url);
            setCopied(true);
            setTimeout(() => setCopied(false), 1800);
        } catch {
            toast({ title: 'Couldn’t copy automatically', description: 'Select the link and copy it.' });
        }
    };

    const agency = user?.agency_name || user?.full_name || 'us';
    const digits = client.phone?.replace(/\D/g, '') ?? '';
    const whatsappHref = link?.url && digits
        ? `https://wa.me/${digits}?text=${encodeURIComponent(`Hi ${client.name}, here's your private chat with ${agency}: ${link.url}`)}`
        : null;

    return (
        <div className="border border-border rounded-[14px] bg-card p-5" data-testid="chat-link-card">
            <div className="flex items-start gap-3 mb-4">
                <span className="w-9 h-9 rounded-lg bg-primary/15 text-primary flex items-center justify-center flex-none">
                    <MessageCircle className="w-[18px] h-[18px]" />
                </span>
                <div className="min-w-0">
                    <h2 className="font-display font-semibold text-[15px] text-foreground">Voxly chat link</h2>
                    <p className="text-[12.5px] text-voxly-ink-6 mt-0.5">
                        {client.name}&apos;s own private chat with you — no WhatsApp or Telegram needed. Messages land in your inbox; the AI answers unless you&apos;ve taken over.
                    </p>
                </div>
            </div>

            {linkQuery.isPending ? (
                <div className="h-10 bg-secondary rounded-lg animate-pulse" />
            ) : linkQuery.isError ? (
                <p className="text-[12.5px] text-voxly-heat">{getApiErrorMessage(linkQuery.error, 'The chat link could not be loaded.')}</p>
            ) : link?.active && link.url ? (
                <>
                    <div className="flex flex-col sm:flex-row gap-2">
                        <input
                            readOnly
                            value={link.url}
                            aria-label="Chat link"
                            onFocus={(e) => e.currentTarget.select()}
                            className="flex-1 min-w-0 h-9 px-3 rounded-lg border border-border bg-voxly-surface-2 font-mono text-[12px] text-foreground focus:outline-none focus:border-primary"
                        />
                        <div className="flex gap-2">
                            <Button size="sm" onClick={() => copy(link.url as string)} className="h-9 gap-1.5 font-semibold flex-1 sm:flex-none">
                                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                                {copied ? 'Copied' : 'Copy'}
                            </Button>
                            {whatsappHref && (
                                <Button size="sm" variant="outline" asChild className="h-9 gap-1.5 flex-1 sm:flex-none">
                                    <a href={whatsappHref} target="_blank" rel="noopener noreferrer">Send on WhatsApp</a>
                                </Button>
                            )}
                        </div>
                    </div>
                    <div className="flex items-center justify-between gap-3 flex-wrap mt-3">
                        <p className="text-[12px] text-voxly-ink-5" data-testid="chat-link-opened">
                            {link.last_opened_at
                                ? `Last opened ${formatListTime(link.last_opened_at)}${link.last_opened_device ? ` · ${link.last_opened_device}` : ''}`
                                : 'Not opened yet'}
                        </p>
                        <div className="flex gap-1.5">
                            <Button size="sm" variant="ghost" onClick={() => setConfirm('regenerate')} className="h-8 gap-1.5 text-[12px] text-voxly-ink-6 hover:text-foreground">
                                <RefreshCw className="w-3.5 h-3.5" /> Regenerate
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => setConfirm('revoke')} className="h-8 gap-1.5 text-[12px] text-voxly-heat hover:text-voxly-heat hover:bg-voxly-heat-soft">
                                <Unlink className="w-3.5 h-3.5" /> Turn off
                            </Button>
                        </div>
                    </div>
                </>
            ) : (
                <Button onClick={() => create.mutate()} disabled={create.isPending} className="gap-1.5 font-semibold">
                    {create.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
                    Create chat link
                </Button>
            )}

            <ConfirmDialog
                open={confirm === 'regenerate'}
                onOpenChange={(open) => { if (!open) setConfirm(null); }}
                title="Regenerate the chat link?"
                description={`The current link stops working right away, and anyone using it is signed out. Send ${client.name} the new one.`}
                confirmLabel="Regenerate"
                pending={create.isPending}
                onConfirm={() => create.mutate()}
            />
            <ConfirmDialog
                open={confirm === 'revoke'}
                onOpenChange={(open) => { if (!open) setConfirm(null); }}
                title="Turn off the chat link?"
                description={`${client.name} won't be able to open the chat with it. Their messages so far stay in your inbox.`}
                confirmLabel="Turn off"
                destructive
                pending={revoke.isPending}
                onConfirm={() => revoke.mutate()}
            />
        </div>
    );
}
