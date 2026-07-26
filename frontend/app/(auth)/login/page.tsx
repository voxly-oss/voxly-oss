'use client';

import { useState, useEffect, useCallback } from 'react';
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
    Shield,
    Zap,
    BarChart3,
    Globe,
    Eye,
    EyeOff,
} from 'lucide-react';
import { motion } from 'framer-motion';
import VoxlyLogo from '@/components/VoxlyLogo';

const loginSchema = z.object({
    email: z.string().email('Please enter a valid email'),
    password: z.string().min(1, 'Password is required'),
});

type LoginFormData = z.infer<typeof loginSchema>;

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

/* ── Feature highlights for left panel ── */
const features = [
    {
        icon: Zap,
        title: 'AI-Powered Updates',
        desc: 'Auto-generate client updates from GitHub activity',
    },
    {
        icon: Globe,
        title: 'WhatsApp Integration',
        desc: 'Clients ask questions, AI replies instantly',
    },
    {
        icon: BarChart3,
        title: 'Real-time Dashboard',
        desc: 'Track projects, clients, and usage in one place',
    },
    {
        icon: Shield,
        title: 'Enterprise Security',
        desc: 'JWT auth, API keys, and role-based access',
    },
];

export default function LoginPage() {
    const [isLoading, setIsLoading] = useState(false);
    const [isGoogleLoading, setIsGoogleLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [activeFeature, setActiveFeature] = useState(0);
    const { login, loginWithGoogle } = useAuth();
    const { toast } = useToast();

    const {
        register,
        handleSubmit,
        formState: { errors },
    } = useForm<LoginFormData>({
        resolver: zodResolver(loginSchema),
    });

    // Rotate feature highlight
    useEffect(() => {
        const interval = setInterval(() => {
            setActiveFeature((prev) => (prev + 1) % features.length);
        }, 3500);
        return () => clearInterval(interval);
    }, []);

    const onSubmit = async (data: LoginFormData) => {
        setIsLoading(true);
        try {
            await login(data.email, data.password);
            toast({
                title: 'Welcome back!',
                description: 'Successfully logged in.',
            });
        } catch (err) {
            const error = err as { response?: { data?: { detail?: string } } };
            toast({
                variant: 'destructive',
                title: 'Login failed',
                description:
                    error.response?.data?.detail || 'Invalid email or password.',
            });
        } finally {
            setIsLoading(false);
        }
    };

    const handleGoogleLogin = useCallback(async () => {
        // Use Google Identity Services popup
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
                            title: 'Google Sign-in failed',
                            description: response.error_description || 'Please try again.',
                        });
                        setIsGoogleLoading(false);
                        return;
                    }
                    try {
                        // Get ID token from access token
                        const userInfoResponse = await fetch(
                            `https://www.googleapis.com/oauth2/v3/userinfo`,
                            { headers: { Authorization: `Bearer ${response.access_token}` } }
                        );
                        const userInfo = await userInfoResponse.json();

                        // Use the access_token to get an id_token via tokeninfo
                        await fetch(
                            `https://oauth2.googleapis.com/tokeninfo?access_token=${response.access_token}`
                        );

                        // Send the access token to our backend for verification
                        await loginWithGoogle(response.access_token);
                        toast({
                            title: 'Welcome!',
                            description: `Signed in as ${userInfo.email}`,
                        });
                    } catch (err) {
                        const error = err as { response?: { data?: { detail?: string } } };
                        toast({
                            variant: 'destructive',
                            title: 'Login failed',
                            description:
                                error.response?.data?.detail || 'Google sign-in failed.',
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
            {/* Google Identity Services SDK */}
            <script src="https://accounts.google.com/gsi/client" async defer />

            <div className="min-h-screen bg-[#0a0a0f] flex">
                {/* ── Left Panel: Brand Showcase (desktop only) ── */}
                <div className="hidden lg:flex lg:w-[45%] xl:w-[40%] relative overflow-hidden flex-col justify-between p-10 xl:p-14">
                    {/* Ambient bg */}
                    <div className="absolute inset-0">
                        <div className="absolute inset-0 bg-gradient-to-br from-violet-950/80 via-[#0a0a0f] to-blue-950/60" />
                        <div className="absolute top-1/4 -left-20 w-[400px] h-[400px] rounded-full bg-violet-600/15 blur-[100px]" />
                        <div className="absolute bottom-1/4 -right-20 w-[350px] h-[350px] rounded-full bg-blue-600/10 blur-[100px]" />
                        {/* Grid pattern */}
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
                        <VoxlyLogo size="xl" />
                    </div>

                    {/* Feature showcase */}
                    <div className="relative z-10 space-y-8">
                        <div>
                            <h2 className="text-3xl xl:text-4xl font-bold text-white leading-tight">
                                AI-powered client
                                <br />
                                communication for
                                <br />
                                <span className="bg-gradient-to-r from-violet-400 to-blue-400 bg-clip-text text-transparent">
                                    dev agencies
                                </span>
                            </h2>
                            <p className="text-white/40 mt-3 text-sm max-w-sm leading-relaxed">
                                Automate WhatsApp updates, track project progress, and keep clients informed — all powered by AI.
                            </p>
                        </div>

                        {/* Animated features */}
                        <div className="space-y-3">
                            {features.map((feature, idx) => {
                                const Icon = feature.icon;
                                const isActive = idx === activeFeature;
                                return (
                                    <motion.div
                                        key={feature.title}
                                        className={`flex items-start gap-3.5 p-3.5 rounded-xl transition-all duration-300 ${
                                            isActive
                                                ? 'bg-white/[0.06] border border-white/10'
                                                : 'bg-transparent border border-transparent'
                                        }`}
                                        animate={{
                                            opacity: isActive ? 1 : 0.5,
                                        }}
                                        transition={{ duration: 0.4 }}
                                    >
                                        <div
                                            className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 transition-all duration-300 ${
                                                isActive
                                                    ? 'bg-gradient-to-br from-violet-500/20 to-blue-500/20 border border-violet-500/30'
                                                    : 'bg-white/5'
                                            }`}
                                        >
                                            <Icon
                                                className={`w-4.5 h-4.5 ${
                                                    isActive ? 'text-violet-400' : 'text-white/30'
                                                }`}
                                            />
                                        </div>
                                        <div>
                                            <p
                                                className={`text-sm font-medium ${
                                                    isActive ? 'text-white' : 'text-white/40'
                                                }`}
                                            >
                                                {feature.title}
                                            </p>
                                            <p className="text-xs text-white/30 mt-0.5">
                                                {feature.desc}
                                            </p>
                                        </div>
                                    </motion.div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Social proof */}
                    <div className="relative z-10">
                        <div className="flex items-center gap-2 text-white/20 text-xs">
                            <Shield className="w-3.5 h-3.5" />
                            <span>TLS encrypted · Bring your own AI keys</span>
                        </div>
                    </div>
                </div>

                {/* ── Right Panel: Login Form ── */}
                <div className="flex-1 flex items-center justify-center p-6 sm:p-8 relative">
                    {/* Subtle bg for right panel */}
                    <div className="absolute inset-0 bg-gradient-to-b from-white/[0.02] to-transparent pointer-events-none" />

                    <motion.div
                        className="w-full max-w-[400px] relative z-10"
                        initial={{ opacity: 0, y: 16 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5 }}
                    >
                        {/* Mobile logo */}
                        <div className="flex items-center justify-center mb-8 lg:hidden">
                            <VoxlyLogo size="lg" />
                        </div>

                        {/* Header */}
                        <div className="mb-8">
                            <h1 className="text-2xl font-bold text-white">Welcome back</h1>
                            <p className="text-white/40 mt-1.5 text-sm">
                                Sign in to your account to continue
                            </p>
                        </div>

                        {/* Google sign-in */}
                        <Button
                            type="button"
                            variant="outline"
                            className="w-full h-11 bg-white/[0.03] border-white/10 hover:bg-white/[0.07] hover:border-white/20 text-white gap-3 transition-all duration-200"
                            onClick={handleGoogleLogin}
                            disabled={isGoogleLoading}
                        >
                            {isGoogleLoading ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                                <GoogleIcon />
                            )}
                            Continue with Google
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
                        <div className="relative my-6">
                            <div className="absolute inset-0 flex items-center">
                                <div className="w-full border-t border-white/[0.06]" />
                            </div>
                            <div className="relative flex justify-center text-xs">
                                <span className="bg-[#0a0a0f] px-3 text-white/25">
                                    or continue with email
                                </span>
                            </div>
                        </div>

                        {/* Email/Password form */}
                        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                            <div className="space-y-1.5">
                                <Label htmlFor="email" className="text-white/50 text-xs font-medium">
                                    Email
                                </Label>
                                <Input
                                    id="email"
                                    type="email"
                                    placeholder="you@agency.com"
                                    className="bg-white/[0.03] border-white/[0.08] text-white placeholder:text-white/20 focus:border-violet-500/40 focus:ring-1 focus:ring-violet-500/20 h-11 text-sm"
                                    {...register('email')}
                                />
                                {errors.email && (
                                    <p className="text-xs text-red-400 mt-1">{errors.email.message}</p>
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
                                        placeholder="••••••••"
                                        className="bg-white/[0.03] border-white/[0.08] text-white placeholder:text-white/20 focus:border-violet-500/40 focus:ring-1 focus:ring-violet-500/20 h-11 text-sm pr-10"
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
                                    <p className="text-xs text-red-400 mt-1">
                                        {errors.password.message}
                                    </p>
                                )}
                            </div>

                            <div className="flex items-center justify-between">
                                <label className="flex items-center gap-2 text-xs text-white/30 cursor-pointer group">
                                    <input
                                        type="checkbox"
                                        className="rounded-[4px] bg-white/5 border-white/10 text-violet-600 focus:ring-violet-500/20 w-3.5 h-3.5"
                                    />
                                    <span className="group-hover:text-white/50 transition-colors">
                                        Remember me
                                    </span>
                                </label>
                                <Link
                                    href="/forgot-password"
                                    className="text-xs text-violet-400/70 hover:text-violet-400 transition-colors"
                                >
                                    Forgot password?
                                </Link>
                            </div>

                            <Button
                                type="submit"
                                className="w-full h-11 bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-500 hover:to-blue-500 text-white border-0 shadow-lg shadow-violet-500/20 text-sm font-medium"
                                disabled={isLoading}
                            >
                                {isLoading ? (
                                    <>
                                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                        Signing in...
                                    </>
                                ) : (
                                    <>
                                        Sign In
                                        <ArrowRight className="w-4 h-4 ml-2" />
                                    </>
                                )}
                            </Button>
                        </form>

                        {/* Register link */}
                        <p className="text-sm text-white/30 text-center mt-6">
                            Don&apos;t have an account?{' '}
                            <Link
                                href="/register"
                                className="text-violet-400 hover:text-violet-300 font-medium transition-colors"
                            >
                                Sign up free
                            </Link>
                        </p>

                        {/* Footer */}
                        <p className="text-center text-white/15 text-xs mt-8">
                            © 2026 Voxly. All rights reserved.
                        </p>
                    </motion.div>
                </div>
            </div>
        </>
    );
}
