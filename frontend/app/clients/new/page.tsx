'use client';

import { useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { clientsAPI, getApiErrorMessage } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import FieldError from '@/components/FieldError';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, Loader2, UserPlus } from 'lucide-react';
import Link from 'next/link';
import { undefinedIfBlank } from '@/lib/utils';
import type { Client } from '@/types';

// Spaces, dashes, dots and parens are fine — the backend parses with
// phonenumbers and stores E.164. The old /^\+?[0-9]+$/ rejected a pasted
// "+91 97290 41423" that the server would have accepted.
const PHONE_RE = /^\+?[\d\s\-().]+$/;

const clientSchema = z.object({
    name: z
        .string()
        .refine((v) => v.trim().length > 0, 'Name is required')
        .refine((v) => v.trim().length <= 255, 'Keep the name under 255 characters'),
    phone: z
        .string()
        .refine((v) => v.trim().length > 0, 'Phone is required')
        .refine(
            (v) => !v.trim() || (PHONE_RE.test(v.trim()) && v.replace(/\D/g, '').length >= 7),
            'Enter a phone number with country code, e.g. +91 97290 41423',
        ),
    email: z.string().refine((v) => !v.trim() || z.email().safeParse(v.trim()).success, 'Enter a valid email address'),
    company: z.string().refine((v) => v.trim().length <= 255, 'Keep the company under 255 characters'),
    telegram_chat_id: z.string().refine((v) => !v.trim() || /^-?\d+$/.test(v.trim()), 'Telegram chat IDs are numbers only'),
});

type ClientFormData = z.infer<typeof clientSchema>;

const LABEL = 'text-[12.5px] font-medium text-voxly-ink-6';

export default function NewClientPage() {
    const router = useRouter();
    const { toast } = useToast();
    const queryClient = useQueryClient();

    const {
        register,
        handleSubmit,
        formState: { errors },
    } = useForm<ClientFormData>({
        resolver: zodResolver(clientSchema),
        defaultValues: { name: '', phone: '', email: '', company: '', telegram_chat_id: '' },
    });

    const createMutation = useMutation({
        mutationFn: (data: ClientFormData) =>
            clientsAPI.create({
                name: data.name.trim(),
                phone: data.phone.trim(),
                email: undefinedIfBlank(data.email),
                company: undefinedIfBlank(data.company),
                telegram_chat_id: undefinedIfBlank(data.telegram_chat_id),
            }),
        onSuccess: (res) => {
            const created = res.data as Client;
            queryClient.invalidateQueries({ queryKey: ['clients'] });
            queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
            toast({ title: 'Client created', description: `${created.name} is ready — add their first project next.` });
            // Straight to the new client, where "Add project" is the next step.
            router.push(`/clients/${created.id}`);
        },
        onError: (err) => {
            toast({
                variant: 'destructive',
                title: 'Couldn’t create client',
                description: getApiErrorMessage(err, 'Please check the details and try again.'),
            });
        },
    });

    const describedBy = (field: keyof ClientFormData, hint?: string) => (errors[field] ? `new-client-${field}-error` : hint);

    return (
        <div className="max-w-2xl mx-auto flex flex-col gap-[18px]">
            <div className="flex items-center gap-1.5 text-[12.5px]">
                <Link href="/clients" className="flex items-center gap-1 text-voxly-ink-6 hover:text-foreground transition-colors">
                    <ArrowLeft className="w-3.5 h-3.5" /> Clients
                </Link>
                <span className="text-voxly-ink-5">/</span>
                <span className="text-foreground font-semibold">New client</span>
            </div>

            <div className="border border-border rounded-[14px] bg-card overflow-hidden">
                <div className="flex items-start gap-3.5 px-5 py-4 border-b border-border">
                    <div className="w-10 h-10 rounded-xl bg-voxly-lime-soft flex items-center justify-center flex-none">
                        <UserPlus className="w-[18px] h-[18px] text-primary" />
                    </div>
                    <div>
                        <h1 className="font-display font-bold text-[20px] text-foreground tracking-[-0.01em]">Add a client</h1>
                        <p className="text-[13px] text-voxly-ink-6 mt-0.5">
                            Voxly answers this client on WhatsApp and Telegram using their projects’ live data.
                        </p>
                    </div>
                </div>

                <form onSubmit={handleSubmit((data) => createMutation.mutate(data))} noValidate>
                    <div className="p-5 grid md:grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                            <Label htmlFor="new-client-name" className={LABEL}>Name *</Label>
                            <Input
                                id="new-client-name"
                                placeholder="Priya Sharma"
                                autoFocus
                                autoComplete="off"
                                aria-invalid={!!errors.name}
                                aria-describedby={describedBy('name')}
                                {...register('name')}
                            />
                            <FieldError id="new-client-name-error" message={errors.name?.message} />
                        </div>

                        <div className="space-y-1.5">
                            <Label htmlFor="new-client-company" className={LABEL}>Company</Label>
                            <Input
                                id="new-client-company"
                                placeholder="Acme Inc."
                                autoComplete="off"
                                aria-invalid={!!errors.company}
                                aria-describedby={describedBy('company')}
                                {...register('company')}
                            />
                            <FieldError id="new-client-company-error" message={errors.company?.message} />
                        </div>

                        <div className="space-y-1.5">
                            <Label htmlFor="new-client-phone" className={LABEL}>Phone (WhatsApp) *</Label>
                            <Input
                                id="new-client-phone"
                                type="tel"
                                inputMode="tel"
                                placeholder="+91 97290 41423"
                                aria-invalid={!!errors.phone}
                                aria-describedby={describedBy('phone', 'new-client-phone-hint')}
                                {...register('phone')}
                            />
                            {errors.phone ? (
                                <FieldError id="new-client-phone-error" message={errors.phone.message} />
                            ) : (
                                <p id="new-client-phone-hint" className="text-[11.5px] text-voxly-ink-5">
                                    Include the country code. This is the number Voxly replies to on WhatsApp.
                                </p>
                            )}
                        </div>

                        <div className="space-y-1.5">
                            <Label htmlFor="new-client-email" className={LABEL}>Email</Label>
                            <Input
                                id="new-client-email"
                                type="email"
                                placeholder="priya@acme.com"
                                autoComplete="off"
                                aria-invalid={!!errors.email}
                                aria-describedby={describedBy('email')}
                                {...register('email')}
                            />
                            <FieldError id="new-client-email-error" message={errors.email?.message} />
                        </div>

                        <div className="space-y-1.5 md:col-span-2">
                            <Label htmlFor="new-client-telegram" className={LABEL}>Telegram chat ID</Label>
                            <Input
                                id="new-client-telegram"
                                placeholder="e.g. 123456789"
                                inputMode="numeric"
                                className="font-mono md:max-w-[calc(50%-0.5rem)]"
                                aria-invalid={!!errors.telegram_chat_id}
                                aria-describedby={describedBy('telegram_chat_id', 'new-client-telegram-hint')}
                                {...register('telegram_chat_id')}
                            />
                            {errors.telegram_chat_id ? (
                                <FieldError id="new-client-telegram_chat_id-error" message={errors.telegram_chat_id.message} />
                            ) : (
                                <p id="new-client-telegram-hint" className="text-[11.5px] text-voxly-ink-5">
                                    Optional. The client gets this by messaging your Voxly bot with /start on Telegram.
                                </p>
                            )}
                        </div>
                    </div>

                    <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 px-5 py-4 border-t border-border bg-voxly-surface-2/40">
                        <Button type="button" variant="outline" onClick={() => router.back()} disabled={createMutation.isPending}>
                            Cancel
                        </Button>
                        <Button type="submit" disabled={createMutation.isPending} className="font-semibold gap-2">
                            {createMutation.isPending ? (
                                <><Loader2 className="w-4 h-4 animate-spin" />Creating…</>
                            ) : (
                                <><UserPlus className="w-4 h-4" />Create client</>
                            )}
                        </Button>
                    </div>
                </form>
            </div>
        </div>
    );
}
