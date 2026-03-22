'use client';

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useRouter, useSearchParams } from 'next/navigation';
import { authAPI } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Loader2, ArrowRight, Lock, Eye, EyeOff, CheckCircle2 } from 'lucide-react';
import { motion } from 'framer-motion';
import VoxlyLogo from '@/components/VoxlyLogo';

const resetPasswordSchema = z.object({
  password: z.string().min(8, 'Password must be at least 8 characters'),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ['confirmPassword'],
});

type ResetPasswordFormData = z.infer<typeof resetPasswordSchema>;

import { Suspense } from 'react';

function ResetPasswordForm() {
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();

  useEffect(() => {
    const t = searchParams.get('token');
    if (t) {
      setToken(t);
    } else {
      toast({
        variant: 'destructive',
        title: 'Invalid link',
        description: 'No reset token found in the URL.',
      });
    }
  }, [searchParams, toast]);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ResetPasswordFormData>({
    resolver: zodResolver(resetPasswordSchema),
  });

  const onSubmit = async (data: ResetPasswordFormData) => {
    if (!token) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Missing reset token.',
      });
      return;
    }

    setIsLoading(true);
    try {
      await authAPI.confirmPasswordReset({
        token,
        new_password: data.password,
      });
      setIsSuccess(true);
      toast({
        title: 'Password reset successful',
        description: 'You can now log in with your new password.',
      });
      
      // Auto redirect after 3 seconds
      setTimeout(() => {
        router.push('/login');
      }, 3000);
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Reset failed',
        description: error.response?.data?.detail || 'Something went wrong. The link may have expired.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      {!isSuccess ? (
        <>
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-white">Reset password</h1>
            <p className="text-white/40 mt-1.5 text-sm">
              Enter your new password below.
            </p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-white/50 text-xs font-medium">
                New Password
              </Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Min 8 characters"
                  className="bg-white/[0.03] border-white/[0.08] text-white placeholder:text-white/20 focus:border-violet-500/40 focus:ring-1 focus:ring-violet-500/20 h-11 text-sm pl-10"
                  {...register('password')}
                />
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20" />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white/20 hover:text-white/40"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {errors.password && (
                <p className="text-xs text-red-400 mt-1">{errors.password.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="confirmPassword" className="text-white/50 text-xs font-medium">
                Confirm New Password
              </Label>
              <Input
                id="confirmPassword"
                type="password"
                placeholder="••••••••"
                className="bg-white/[0.03] border-white/[0.08] text-white placeholder:text-white/20 focus:border-violet-500/40 focus:ring-1 focus:ring-violet-500/20 h-11 text-sm pl-10"
                {...register('confirmPassword')}
              />
            </div>

            <Button
              type="submit"
              className="w-full h-11 bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-500 hover:to-blue-500 text-white border-0 shadow-lg shadow-violet-500/20 text-sm font-medium"
              disabled={isLoading || !token}
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Updating...
                </>
              ) : (
                <>
                  Update Password
                  <ArrowRight className="w-4 h-4 ml-2" />
                </>
              )}
            </Button>
          </form>
        </>
      ) : (
        <div className="text-center">
          <div className="w-16 h-16 bg-emerald-500/10 border border-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 className="w-8 h-8 text-emerald-400" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">Success!</h1>
          <p className="text-white/40 text-sm mb-8 leading-relaxed">
            Your password has been successfully reset. Redirecting you to the login page...
          </p>
          <Button
            className="w-full h-11 bg-white/[0.03] border-white/10 hover:bg-white/[0.07] text-white"
            onClick={() => router.push('/login')}
          >
            Go to Login
          </Button>
        </div>
      )}
    </>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center p-6 sm:p-8 relative overflow-hidden">
      {/* Ambient bg */}
      <div className="absolute inset-0 bg-gradient-to-br from-blue-950/20 via-[#0a0a0f] to-violet-950/20" />
      <div className="absolute top-1/3 -left-20 w-[400px] h-[400px] rounded-full bg-blue-600/5 blur-[100px]" />
      <div className="absolute bottom-1/3 -right-20 w-[350px] h-[350px] rounded-full bg-violet-600/5 blur-[100px]" />

      <motion.div
        className="w-full max-w-[400px] relative z-10"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <div className="flex items-center justify-center mb-8">
          <VoxlyLogo size="lg" />
        </div>

        <div className="bg-white/[0.02] border border-white/[0.06] p-8 rounded-2xl backdrop-blur-xl">
          <Suspense fallback={
            <div className="flex flex-col items-center justify-center py-8 text-white/50">
              <Loader2 className="w-6 h-6 animate-spin mb-4" />
              <p className="text-sm">Loading...</p>
            </div>
          }>
            <ResetPasswordForm />
          </Suspense>
        </div>

        {/* Footer */}
        <p className="text-center text-white/15 text-xs mt-8">
          © {new Date().getFullYear()} Voxly. All rights reserved.
        </p>
      </motion.div>
    </div>
  );
}
