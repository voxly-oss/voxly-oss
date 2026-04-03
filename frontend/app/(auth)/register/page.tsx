'use client';

import { useState, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import { authAPI } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import {
    Loader2,
    ArrowRight,
    Sparkles,
    Users,
    Bot,
    GitBranch,
    Eye,
    EyeOff,
} from 'lucide-react';
import { motion } from 'framer-motion';
import VoxlyLogo from '@/components/VoxlyLogo';

const registerSchema = z
    .object({
        email: z.string().email('Please enter a valid email'),
        password: z.string().min(8, 'Password must be at least 8 characters'),
        confirmPassword: z.string(),
        full_name: z.string().optional(),
        agency_name: z.string().optional(),
    })
    .refine((data) => data.password === data.confirmPassword, {
        message: "Passwords don't match",
        path: ['confirmPassword'],
    });

type RegisterFormData = z.infer<typeof registerSchema>;

/* ── Google SVG icon ── */
function GoogleIcon({ className }: { className?: string }) {
    return (
        <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                fill="#4285F4"
            />
            <path
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                fill="#34A853"
            />
            <path
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A10.96 10.96 0 0 0 1 12c0 1.77.42 3.45 1.18 4.93l3.66-2.84z"
                fill="#FBBC05"
            />
            <path
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                fill="#EA4335"
            />
        </svg>
    );
}

/* ── Stats for left panel ── */
const stats = [
    { value: '10K+', label: 'Agencies' },
    { value: '99.9%', label: 'Uptime' },
    { value: '50M+', label: 'Messages Sent' },
];

const benefits = [
    { icon: Users, text: 'Unlimited client portals' },
    { icon: Bot, text: 'AI-powered WhatsApp replies' },
    { icon: GitBranch, text: 'GitHub & project tracking' },
];

export default function RegisterPage() {
    const [isLoading, setIsLoading] = useState(false);
    const [isGoogleLoading, setIsGoogleLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const { register: registerUser, loginWithGoogle } = useAuth();
    const { toast } = useToast();

    const {
        register,
        handleSubmit,
        formState: { errors },
    } = useForm<RegisterFormData>({
        resolver: zodResolver(registerSchema),
    });

    const onSubmit = async (data: RegisterFormData) => {
        setIsLoading(true);
        try {
            await registerUser({
                email: data.email,
                password: data.password,
                full_name: data.full_name,
                agency_name: data.agency_name,
            });
            toast({
                title: 'Account created!',
                description: 'Welcome to Voxly.',
            });
        } catch (err) {
            const error = err as { response?: { data?: { detail?: string } } };
            toast({
                variant: 'destructive',
                title: 'Registration failed',
                description:
                    error.response?.data?.detail ||
                    'Something went wrong. Please try again.',
            });
        } finally {
            setIsLoading(false);
        }
    };

    const handleGoogleSignup = useCallback(async () => {
        const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
        if (!clientId) {
            toast({
                variant: 'destructive',
                title: 'Google Sign-in not configured',
                description: 'Please set NEXT_PUBLIC_GOOGLE_CLIENT_ID in your environment.',
            });
            return;
        }
        setIsGoogleLoading(true);
        try {
            // @ts-expect-error - google.accounts loaded via script tag
            const google = window.google;
            if (!google?.accounts?.oauth2) {
                toast({
                    variant: 'destructive',
                    title: 'Google SDK not loaded',
                    description: 'Please refresh the page and try again.',
                });
                setIsGoogleLoading(false);
                return;
            }

            const tokenClient = google.accounts.oauth2.initTokenClient({
                client_id: clientId,
                scope: 'openid email profile',
                callback: async (response: { error?: string; error_description?: string; access_token: string }) => {
                    if (response.error) {
                        toast({
                            variant: 'destructive',
                            title: 'Google Sign-up failed',
                            description: response.error_description || 'Please try again.',
                        });
                        setIsGoogleLoading(false);
                        return;
                    }
                    try {
                        await loginWithGoogle(response.access_token);
                        toast({
                            title: 'Welcome to Voxly!',
                            description: 'Your account has been created.',
                        });
                    } catch (err) {
                        const error = err as { response?: { data?: { detail?: string } } };
                        toast({
                            variant: 'destructive',
                            title: 'Sign-up failed',
                            description:
                                error.response?.data?.detail || 'Google sign-up failed.',
                        });
                    } finally {
                        setIsGoogleLoading(false);
                    }
                },
            });
            tokenClient.requestAccessToken();
        } catch {
            setIsGoogleLoading(false);
            toast({
                variant: 'destructive',
                title: 'Google Sign-in error',
                description: 'An unexpected error occurred.',
            });
        }
    }, [loginWithGoogle, toast]);

    return (
        <>
            <script src="https://accounts.google.com/gsi/client" async defer />

            <div className="min-h-screen bg-[#0a0a0f] flex">
                {/* ── Left Panel: Brand Showcase (desktop only) ── */}
                <div className="hidden lg:flex lg:w-[45%] xl:w-[40%] relative overflow-hidden flex-col justify-between p-10 xl:p-14">
                    {/* Ambient bg */}
                    <div className="absolute inset-0">
                        <div className="absolute inset-0 bg-gradient-to-br from-blue-950/80 via-[#0a0a0f] to-violet-950/60" />
                        <div className="absolute top-1/3 -left-20 w-[400px] h-[400px] rounded-full bg-blue-600/15 blur-[100px]" />
                        <div className="absolute bottom-1/3 -right-20 w-[350px] h-[350px] rounded-full bg-violet-600/10 blur-[100px]" />
                        <div
                            className="absolute inset-0 opacity-[0.04]"
                            style={{
                                backgroundImage:
                                    'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)',
                                backgroundSize: '40px 40px',
                            }}
                        />
                    </div>

                    {/* Logo */}
                    <div className="relative z-10">
                        <VoxlyLogo size="md" />
                    </div>

                    {/* CTA & benefits */}
                    <div className="relative z-10 space-y-8">
                        <div>
                            <div className="inline-flex items-center gap-1.5 bg-violet-500/10 text-violet-300 px-3 py-1 rounded-full text-xs font-medium mb-4 border border-violet-500/20">
                                <Sparkles className="w-3 h-3" />
                                No credit card required
                            </div>
                            <h2 className="text-3xl xl:text-4xl font-bold text-white leading-tight">
                                Start scaling your
                                <br />
                                agency in{' '}
                                <span className="bg-gradient-to-r from-violet-400 to-blue-400 bg-clip-text text-transparent">
                                    minutes
                                </span>
                            </h2>
                            <p className="text-white/40 mt-3 text-sm max-w-sm leading-relaxed">
                                Join thousands of dev agencies automating client communication with AI.
                            </p>
                        </div>

                        {/* Benefits */}
                        <div className="space-y-3">
                            {benefits.map((item) => {
                                const Icon = item.icon;
                                return (
                                    <div
                                        key={item.text}
                                        className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]"
                                    >
                                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500/15 to-emerald-500/5 border border-emerald-500/20 flex items-center justify-center flex-shrink-0">
                                            <Icon className="w-4 h-4 text-emerald-400" />
                                        </div>
                                        <span className="text-sm text-white/60">{item.text}</span>
                                    </div>
                                );
                            })}
                        </div>

                        {/* Stats */}
                        <div className="flex gap-8 pt-2">
                            {stats.map((stat) => (
                                <div key={stat.label}>
                                    <p className="text-xl font-bold text-white">{stat.value}</p>
                                    <p className="text-xs text-white/30">{stat.label}</p>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="relative z-10" />
                </div>

                {/* ── Right Panel: Register Form ── */}
                <div className="flex-1 flex items-center justify-center p-6 sm:p-8 relative">
                    <div className="absolute inset-0 bg-gradient-to-b from-white/[0.02] to-transparent pointer-events-none" />

                    <motion.div
                        className="w-full max-w-[420px] relative z-10"
                        initial={{ opacity: 0, y: 16 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5 }}
                    >
                        {/* Mobile logo */}
                        <div className="flex items-center justify-center mb-6 lg:hidden">
                            <VoxlyLogo size="lg" />
                        </div>

                        {/* Header */}
                        <div className="mb-6">
                            <h1 className="text-2xl font-bold text-white">Create an account</h1>
                            <p className="text-white/40 mt-1.5 text-sm">
                                Start your free trial — no credit card needed
                            </p>
                        </div>

                        {/* Google sign-up */}
                        <Button
                            type="button"
                            variant="outline"
                            className="w-full h-11 bg-white/[0.03] border-white/10 hover:bg-white/[0.07] hover:border-white/20 text-white gap-3 transition-all duration-200"
                            onClick={handleGoogleSignup}
                            disabled={isGoogleLoading}
                        >
                            {isGoogleLoading ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                                <GoogleIcon />
                            )}
                            Sign up with Google
                        </Button>

                        <div className="grid grid-cols-1 gap-3 mt-3">
                            {/* GitHub */}
                            <Button
                                type="button"
                                variant="outline"
                                className="h-10 bg-white/[0.03] border-white/10 hover:bg-white/[0.07] hover:border-white/20 text-white gap-2 text-sm transition-all duration-200"
                                onClick={() => window.location.href = authAPI.githubRedirect()}
                            >
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
                                </svg>
                                Continue with GitHub
                            </Button>
                        </div>

                        {/* Divider */}
                        <div className="relative my-5">
                            <div className="absolute inset-0 flex items-center">
                                <div className="w-full border-t border-white/[0.06]" />
                            </div>
                            <div className="relative flex justify-center text-xs">
                                <span className="bg-[#0a0a0f] px-3 text-white/25">
                                    or continue with email
                                </span>
                            </div>
                        </div>

                        {/* Registration form */}
                        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3.5">
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1.5">
                                    <Label htmlFor="full_name" className="text-white/50 text-xs font-medium">
                                        Full Name
                                    </Label>
                                    <Input
                                        id="full_name"
                                        placeholder="John Doe"
                                        className="bg-white/[0.03] border-white/[0.08] text-white placeholder:text-white/20 focus:border-violet-500/40 focus:ring-1 focus:ring-violet-500/20 h-10 text-sm"
                                        {...register('full_name')}
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <Label htmlFor="agency_name" className="text-white/50 text-xs font-medium">
                                        Agency Name
                                    </Label>
                                    <Input
                                        id="agency_name"
                                        placeholder="Acme Agency"
                                        className="bg-white/[0.03] border-white/[0.08] text-white placeholder:text-white/20 focus:border-violet-500/40 focus:ring-1 focus:ring-violet-500/20 h-10 text-sm"
                                        {...register('agency_name')}
                                    />
                                </div>
                            </div>

                            <div className="space-y-1.5">
                                <Label htmlFor="email" className="text-white/50 text-xs font-medium">
                                    Work Email
                                </Label>
                                <Input
                                    id="email"
                                    type="email"
                                    placeholder="you@agency.com"
                                    className="bg-white/[0.03] border-white/[0.08] text-white placeholder:text-white/20 focus:border-violet-500/40 focus:ring-1 focus:ring-violet-500/20 h-10 text-sm"
                                    {...register('email')}
                                />
                                {errors.email && (
                                    <p className="text-xs text-red-400">{errors.email.message}</p>
                                )}
                            </div>

                            <div className="space-y-1.5">
                                <Label htmlFor="password" className="text-white/50 text-xs font-medium">
                                    Password
                                </Label>
                                <div className="relative">
                                    <Input
                                        id="password"
                                        type={showPassword ? 'text' : 'password'}
                                        placeholder="Min 8 characters"
                                        className="bg-white/[0.03] border-white/[0.08] text-white placeholder:text-white/20 focus:border-violet-500/40 focus:ring-1 focus:ring-violet-500/20 h-10 text-sm pr-10"
                                        {...register('password')}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword(!showPassword)}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-white/20 hover:text-white/40 transition-colors"
                                    >
                                        {showPassword ? (
                                            <EyeOff className="w-4 h-4" />
                                        ) : (
                                            <Eye className="w-4 h-4" />
                                        )}
                                    </button>
                                </div>
                                {errors.password && (
                                    <p className="text-xs text-red-400">{errors.password.message}</p>
                                )}
                            </div>

                            <div className="space-y-1.5">
                                <Label htmlFor="confirmPassword" className="text-white/50 text-xs font-medium">
                                    Confirm Password
                                </Label>
                                <Input
                                    id="confirmPassword"
                                    type="password"
                                    placeholder="••••••••"
                                    className="bg-white/[0.03] border-white/[0.08] text-white placeholder:text-white/20 focus:border-violet-500/40 focus:ring-1 focus:ring-violet-500/20 h-10 text-sm"
                                    {...register('confirmPassword')}
                                />
                                {errors.confirmPassword && (
                                    <p className="text-xs text-red-400">
                                        {errors.confirmPassword.message}
                                    </p>
                                )}
                            </div>

                            <p className="text-[11px] text-white/25 leading-relaxed pt-0.5">
                                By signing up, you agree to our{' '}
                                <button
                                    type="button"
                                    className="text-violet-400/60 hover:text-violet-400 transition-colors"
                                >
                                    Terms of Service
                                </button>{" and "}
                                <button
                                    type="button"
                                    className="text-violet-400/60 hover:text-violet-400 transition-colors"
                                >
                                    Privacy Policy
                                </button>
                                .
                            </p>

                            <Button
                                type="submit"
                                className="w-full h-11 bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-500 hover:to-blue-500 text-white border-0 shadow-lg shadow-violet-500/20 text-sm font-medium"
                                disabled={isLoading}
                            >
                                {isLoading ? (
                                    <>
                                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                        Creating account...
                                    </>
                                ) : (
                                    <>
                                        Create Account
                                        <ArrowRight className="w-4 h-4 ml-2" />
                                    </>
                                )}
                            </Button>
                        </form>

                        {/* Login link */}
                        <p className="text-sm text-white/30 text-center mt-5">
                            Already have an account?{' '}
                            <Link
                                href="/login"
                                className="text-violet-400 hover:text-violet-300 font-medium transition-colors"
                            >
                                Sign in
                            </Link>
                        </p>

                        {/* Footer */}
                        <p className="text-center text-white/15 text-xs mt-6">
                            © 2026 Voxly. All rights reserved.
                        </p>
                    </motion.div>
                </div>
            </div>
        </>
    );
}
