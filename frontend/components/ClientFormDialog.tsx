'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, Save, UserPlus } from 'lucide-react';
import { clientsAPI, getApiErrorMessage } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { ToastAction } from '@/components/ui/toast';
import FieldError from '@/components/FieldError';
import { Toggle } from '@/components/SettingsRow';
import { useToast } from '@/hooks/use-toast';
import { nullIfBlank, undefinedIfBlank } from '@/lib/utils';
import type { Client } from '@/types';

// Spaces, dashes, dots and parens are fine — the backend parses with
// phonenumbers and stores E.164, so the form only catches obvious typos.
const PHONE_RE = /^\+?[\d\s\-().]+$/;

const clientSchema = z.object({
    name: z
        .string()
        .refine((v) => v.trim().length > 0, 'Name is required')
        .refine((v) => v.trim().length <= 255, 'Keep the name under 255 characters'),
    company: z.string().refine((v) => v.trim().length <= 255, 'Keep the company under 255 characters'),
    phone: z
        .string()
        .refine((v) => v.trim().length > 0, 'Phone is required')
        .refine(
            (v) => !v.trim() || (PHONE_RE.test(v.trim()) && v.replace(/\D/g, '').length >= 7),
            'Enter a phone number with country code, e.g. +91 98765 43210',
        ),
    email: z.string().refine((v) => !v.trim() || z.email().safeParse(v.trim()).success, 'Enter a valid email address'),
    telegram_chat_id: z.string().refine((v) => !v.trim() || /^-?\d+$/.test(v.trim()), 'Telegram chat IDs are numbers only'),
    is_active: z.boolean(),
});

type ClientFormData = z.infer<typeof clientSchema>;
type FieldName = keyof ClientFormData;

const LABEL = 'text-[12.5px] font-medium text-voxly-ink-6';

function toFormValues(client?: Client | null): ClientFormData {
    return {
        name: client?.name ?? '',
        company: client?.company ?? '',
        phone: client?.phone ?? '',
        email: client?.email ?? '',
        telegram_chat_id: client?.telegram_chat_id ?? '',
        is_active: client?.is_active ?? true,
    };
}

/** The API's duplicate-contact errors ("…phone number…", "…Telegram Chat ID…")
 *  belong under the field that caused them, not in a toast. */
function conflictField(message: string): FieldName | null {
    const m = message.toLowerCase();
    if (m.includes('telegram')) return 'telegram_chat_id';
    if (m.includes('phone')) return 'phone';
    if (m.includes('email')) return 'email';
    return null;
}

interface ClientFormDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** Edit this client; omit to create a new one. */
    client?: Client | null;
    onSaved?: (client: Client) => void;
}

/**
 * Create / edit a client — the one client form in the app, used from the
 * clients list (New client, row Edit, /clients?new=1 deep links) and the
 * client detail page. Replaces the full-page /clients/new form and the
 * inline edit form, which had drifted apart.
 */
export default function ClientFormDialog({ open, onOpenChange, client, onSaved }: ClientFormDialogProps) {
    const router = useRouter();
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const isEdit = !!client;

    const {
        register,
        handleSubmit,
        reset,
        setError,
        setValue,
        control,
        formState: { errors },
    } = useForm<ClientFormData>({
        resolver: zodResolver(clientSchema),
        defaultValues: toFormValues(client),
    });
    // useWatch, not watch(): watch() opts the component out of the React Compiler.
    const isActive = useWatch({ control, name: 'is_active' });

    // Re-seed on every open so an edit never shows a previous client's values
    // and a cancelled create starts clean.
    useEffect(() => {
        if (open) reset(toFormValues(client));
    }, [open, client, reset]);

    const mutation = useMutation({
        // Resolve to the saved Client, not the raw axios response: newer axios
        // types carry the request body in AxiosResponse, so the create and
        // update responses stopped being one type and broke `next build`.
        mutationFn: async (data: ClientFormData): Promise<Client> => {
            const res = client
                // null clears a field (update endpoint uses exclude_unset).
                ? await clientsAPI.update(client.id, {
                    name: data.name.trim(),
                    phone: data.phone.trim(),
                    email: nullIfBlank(data.email),
                    company: nullIfBlank(data.company),
                    telegram_chat_id: nullIfBlank(data.telegram_chat_id),
                    is_active: data.is_active,
                })
                : await clientsAPI.create({
                    name: data.name.trim(),
                    phone: data.phone.trim(),
                    email: undefinedIfBlank(data.email),
                    company: undefinedIfBlank(data.company),
                    telegram_chat_id: undefinedIfBlank(data.telegram_chat_id),
                });
            return res.data as Client;
        },
        onSuccess: (saved) => {
            queryClient.setQueryData(['client', saved.id], saved);
            queryClient.invalidateQueries({ queryKey: ['clients'] });
            queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
            toast(
                isEdit
                    ? { title: 'Client updated', description: saved.name }
                    : {
                        title: 'Client created',
                        description: `${saved.name} is ready — add their first project next.`,
                        action: (
                            <ToastAction altText={`Open ${saved.name}`} onClick={() => router.push(`/clients/${saved.id}`)}>
                                Open
                            </ToastAction>
                        ),
                    },
            );
            onOpenChange(false);
            onSaved?.(saved);
        },
        onError: (err) => {
            const message = getApiErrorMessage(err, 'Please check the details and try again.');
            const status = (err as { response?: { status?: number } })?.response?.status;
            const field = status && status < 500 ? conflictField(message) : null;
            if (field) {
                setError(field, { type: 'server', message: message.replace(/^\w+:\s*/, '') });
                return;
            }
            toast({ variant: 'destructive', title: isEdit ? 'Couldn’t update client' : 'Couldn’t create client', description: message });
        },
    });

    const describedBy = (field: FieldName, hint?: string) => (errors[field] ? `client-form-${field}-error` : hint);

    return (
        <Dialog open={open} onOpenChange={(next) => { if (!mutation.isPending) onOpenChange(next); }}>
            <DialogContent className="sm:max-w-xl">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        {isEdit ? <Save className="w-4 h-4 text-primary" /> : <UserPlus className="w-4 h-4 text-primary" />}
                        {isEdit ? 'Edit client' : 'New client'}
                    </DialogTitle>
                    <DialogDescription className="text-voxly-ink-6">
                        {isEdit
                            ? `Update ${client?.name}’s contact details.`
                            : 'Voxly answers this client on WhatsApp and Telegram using their projects’ live data.'}
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit((data) => mutation.mutate(data))} className="space-y-4" noValidate>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                            <Label htmlFor="client-form-name" className={LABEL}>Name *</Label>
                            <Input
                                id="client-form-name"
                                placeholder="Priya Sharma"
                                autoFocus
                                autoComplete="off"
                                aria-invalid={!!errors.name}
                                aria-describedby={describedBy('name')}
                                {...register('name')}
                            />
                            <FieldError id="client-form-name-error" message={errors.name?.message} />
                        </div>

                        <div className="space-y-1.5">
                            <Label htmlFor="client-form-company" className={LABEL}>Company</Label>
                            <Input
                                id="client-form-company"
                                placeholder="Acme Inc."
                                autoComplete="off"
                                aria-invalid={!!errors.company}
                                aria-describedby={describedBy('company')}
                                {...register('company')}
                            />
                            <FieldError id="client-form-company-error" message={errors.company?.message} />
                        </div>

                        <div className="space-y-1.5">
                            <Label htmlFor="client-form-phone" className={LABEL}>Phone (WhatsApp) *</Label>
                            <Input
                                id="client-form-phone"
                                type="tel"
                                inputMode="tel"
                                placeholder="+91 98765 43210"
                                aria-invalid={!!errors.phone}
                                aria-describedby={describedBy('phone', 'client-form-phone-hint')}
                                {...register('phone')}
                            />
                            {errors.phone ? (
                                <FieldError id="client-form-phone-error" message={errors.phone.message} />
                            ) : (
                                <p id="client-form-phone-hint" className="text-[11.5px] text-voxly-ink-5">Include the country code.</p>
                            )}
                        </div>

                        <div className="space-y-1.5">
                            <Label htmlFor="client-form-email" className={LABEL}>Email</Label>
                            <Input
                                id="client-form-email"
                                type="email"
                                placeholder="priya@acme.com"
                                autoComplete="off"
                                aria-invalid={!!errors.email}
                                aria-describedby={describedBy('email')}
                                {...register('email')}
                            />
                            <FieldError id="client-form-email-error" message={errors.email?.message} />
                        </div>

                        <div className="space-y-1.5 sm:col-span-2">
                            <Label htmlFor="client-form-telegram" className={LABEL}>Telegram chat ID</Label>
                            <Input
                                id="client-form-telegram"
                                placeholder="e.g. 123456789"
                                inputMode="numeric"
                                className="font-mono sm:max-w-[calc(50%-0.5rem)]"
                                aria-invalid={!!errors.telegram_chat_id}
                                aria-describedby={describedBy('telegram_chat_id', 'client-form-telegram-hint')}
                                {...register('telegram_chat_id')}
                            />
                            {errors.telegram_chat_id ? (
                                <FieldError id="client-form-telegram_chat_id-error" message={errors.telegram_chat_id.message} />
                            ) : (
                                <p id="client-form-telegram-hint" className="text-[11.5px] text-voxly-ink-5">
                                    Optional. The client gets this by messaging your Voxly bot with /start on Telegram.
                                </p>
                            )}
                        </div>
                    </div>

                    {isEdit && (
                        <div className="flex items-start justify-between gap-4 rounded-lg border border-border bg-background px-3.5 py-3">
                            <div>
                                <div className="text-[13px] font-medium text-foreground">Active</div>
                                <div className="text-[11.5px] text-voxly-ink-5 mt-0.5">
                                    {isActive
                                        ? 'Voxly replies to this client’s WhatsApp and Telegram messages.'
                                        : 'Voxly ignores this client’s messages until reactivated. Projects and history are kept.'}
                                </div>
                            </div>
                            <Toggle
                                label="Active"
                                checked={isActive}
                                onChange={(v) => setValue('is_active', v, { shouldDirty: true })}
                            />
                        </div>
                    )}

                    <DialogFooter className="pt-2">
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>
                            Cancel
                        </Button>
                        <Button type="submit" disabled={mutation.isPending} className="font-semibold gap-2">
                            {mutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                            {isEdit ? 'Save changes' : 'Create client'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
