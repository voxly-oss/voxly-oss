'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { clientsAPI } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, Loader2, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { motion } from 'framer-motion';

const clientSchema = z.object({
    name: z.string().min(1, 'Name is required'),
    phone: z
        .string()
        .min(10, 'Phone must be at least 10 digits')
        .regex(/^\+?[0-9]+$/, 'Invalid phone number format'),
    email: z.string().email('Invalid email').optional().or(z.literal('')),
    company: z.string().optional(),
});

type ClientFormData = z.infer<typeof clientSchema>;

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
    });

    const createMutation = useMutation({
        mutationFn: (data: ClientFormData) =>
            clientsAPI.create({
                name: data.name,
                phone: data.phone,
                email: data.email || undefined,
                company: data.company || undefined,
            }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['clients'] });
            toast({
                title: 'Client created',
                description: 'The client has been added successfully.',
            });
            router.push('/clients');
        },
        onError: (error: any) => {
            toast({
                variant: 'destructive',
                title: 'Error',
                description:
                    error.response?.data?.detail || 'Failed to create client.',
            });
        },
    });

    const onSubmit = (data: ClientFormData) => {
        createMutation.mutate(data);
    };

    return (
        <motion.div
            className="max-w-2xl mx-auto"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
        >
            {/* Back button */}
            <Link
                href="/clients"
                className="inline-flex items-center text-sm text-white/50 hover:text-white mb-6 transition-colors"
            >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to clients
            </Link>

            <Card className="glass-card border-white/5 gradient-border">
                <CardHeader className="border-b border-white/5 pb-6">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="p-2 rounded-lg bg-violet-500/10 border border-violet-500/20">
                            <Sparkles className="w-5 h-5 text-violet-400" />
                        </div>
                        <CardTitle className="text-white">Add New Client</CardTitle>
                    </div>
                    <CardDescription className="text-white/60">
                        Add a client to start managing their projects and enable WhatsApp
                        communication.
                    </CardDescription>
                </CardHeader>
                <form onSubmit={handleSubmit(onSubmit)}>
                    <CardContent className="space-y-6 pt-6">
                        <div className="space-y-2">
                            <Label htmlFor="name" className="text-white/70">
                                Name <span className="text-red-400">*</span>
                            </Label>
                            <Input
                                id="name"
                                placeholder="John Doe"
                                className="bg-white/5 border-white/10 text-white placeholder:text-white/30 focus:border-violet-500/50 h-11"
                                {...register('name')}
                            />
                            {errors.name && (
                                <p className="text-sm text-red-400">{errors.name.message}</p>
                            )}
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="phone" className="text-white/70">
                                Phone <span className="text-red-400">*</span>
                            </Label>
                            <Input
                                id="phone"
                                placeholder="+919876543210"
                                className="bg-white/5 border-white/10 text-white placeholder:text-white/30 focus:border-violet-500/50 h-11"
                                {...register('phone')}
                            />
                            <p className="text-xs text-white/40">
                                Include country code (e.g., +91 for India)
                            </p>
                            {errors.phone && (
                                <p className="text-sm text-red-400">{errors.phone.message}</p>
                            )}
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="email" className="text-white/70">Email</Label>
                            <Input
                                id="email"
                                type="email"
                                placeholder="john@company.com"
                                className="bg-white/5 border-white/10 text-white placeholder:text-white/30 focus:border-violet-500/50 h-11"
                                {...register('email')}
                            />
                            {errors.email && (
                                <p className="text-sm text-red-400">{errors.email.message}</p>
                            )}
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="company" className="text-white/70">Company</Label>
                            <Input
                                id="company"
                                placeholder="Acme Inc."
                                className="bg-white/5 border-white/10 text-white placeholder:text-white/30 focus:border-violet-500/50 h-11"
                                {...register('company')}
                            />
                        </div>
                    </CardContent>
                    <div className="p-6 pt-0 flex gap-4">
                        <Button
                            type="submit"
                            disabled={createMutation.isPending}
                            className="flex-1 bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-500 hover:to-blue-500 text-white border-0 h-11"
                        >
                            {createMutation.isPending ? (
                                <>
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                    Creating...
                                </>
                            ) : (
                                'Create Client'
                            )}
                        </Button>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => router.back()}
                            className="border-white/10 text-white hover:bg-white/10 h-11 px-8"
                        >
                            Cancel
                        </Button>
                    </div>
                </form>
            </Card>
        </motion.div>
    );
}
