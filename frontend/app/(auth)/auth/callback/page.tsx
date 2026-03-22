'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { authAPI } from '@/lib/api';
import { Loader2, CheckCircle, XCircle } from 'lucide-react';

function CallbackHandler() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
    const [message, setMessage] = useState('Authenticating...');

    useEffect(() => {
        const code = searchParams.get('code');
        const provider = searchParams.get('provider');
        const state = searchParams.get('state');

        if (!code || !provider) {
            setStatus('error');
            setMessage('Invalid callback — missing code or provider.');
            return;
        }
        if (provider === 'github' && !state) {
            setStatus('error');
            setMessage('Invalid callback — missing OAuth state.');
            return;
        }

        async function handleCallback() {
            try {
                let data: { access_token: string };
                if (provider === 'github') {
                    const resp = await authAPI.githubCallback(code!, state!);
                    data = resp.data;
                } else {
                    throw new Error(`Unknown provider: ${provider}`);
                }

                localStorage.setItem('access_token', data.access_token);
                setStatus('success');
                setMessage('Signed in! Redirecting...');
                setTimeout(() => router.push('/dashboard'), 800);
            } catch (err) {
                const error = err as { response?: { data?: { detail?: string } } };
                setStatus('error');
                setMessage(
                    error.response?.data?.detail ||
                    'Authentication failed. Please try again.'
                );
            }
        }

        handleCallback();
    }, [searchParams, router]);

    return (
        <div className="text-center space-y-4">
            {status === 'loading' && (
                <Loader2 className="w-10 h-10 mx-auto text-violet-400 animate-spin" />
            )}
            {status === 'success' && (
                <CheckCircle className="w-10 h-10 mx-auto text-emerald-400" />
            )}
            {status === 'error' && (
                <XCircle className="w-10 h-10 mx-auto text-red-400" />
            )}
            <p className="text-white/70 text-sm">{message}</p>
            {status === 'error' && (
                <button
                    onClick={() => router.push('/login')}
                    className="text-violet-400 hover:text-violet-300 text-sm underline underline-offset-4"
                >
                    Back to login
                </button>
            )}
        </div>
    );
}

export default function AuthCallbackPage() {
    return (
        <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
            <Suspense
                fallback={
                    <div className="text-center">
                        <Loader2 className="w-10 h-10 mx-auto text-violet-400 animate-spin" />
                        <p className="text-white/70 text-sm mt-4">Loading...</p>
                    </div>
                }
            >
                <CallbackHandler />
            </Suspense>
        </div>
    );
}
