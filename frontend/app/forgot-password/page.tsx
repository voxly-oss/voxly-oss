'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import Link from 'next/link';
import { authAPI } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Loader2, ArrowRight, Mail, ArrowLeft } from 'lucide-react';
import { motion } from 'framer-motion';
import VoxlyLogo from '@/components/VoxlyLogo';

const forgotPasswordSchema = z.object({
  email: z.string().email('Please enter a valid email'),
});

type ForgotPasswordFormData = z.infer<typeof forgotPasswordSchema>;

export default function ForgotPasswordPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const { toast } = useToast();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ForgotPasswordFormData>({
    resolver: zodResolver(forgotPasswordSchema),
  });

  const onSubmit = async (data: ForgotPasswordFormData) => {
    setIsLoading(true);
    try {
      await authAPI.requestPasswordReset(data.email);
      setIsSubmitted(true);
      toast({
        title: 'Reset link sent',
        description: 'Check your email for instructions.',
      });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.response?.data?.detail || 'Failed to request password reset.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center p-6 sm:p-8 relative overflow-hidden">
      {/* Ambient bg */}
      <div className="absolute inset-0 bg-gradient-to-br from-violet-950/20 via-[#0a0a0f] to-blue-950/20" />
      <div className="absolute top-1/4 -left-20 w-[400px] h-[400px] rounded-full bg-violet-600/5 blur-[100px]" />
      <div className="absolute bottom-1/4 -right-20 w-[350px] h-[350px] rounded-full bg-blue-600/5 blur-[100px]" />

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
          {!isSubmitted ? (
            <>
              <div className="mb-6">
                <h1 className="text-2xl font-bold text-white">Forgot password?</h1>
                <p className="text-white/40 mt-1.5 text-sm">
                  Enter your email and we&apos;ll send you a link to reset your password.
                </p>
              </div>

              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="email" className="text-white/50 text-xs font-medium">
                    Work Email
                  </Label>
                  <div className="relative">
                    <Input
                      id="email"
                      type="email"
                      placeholder="you@agency.com"
                      className="bg-white/[0.03] border-white/[0.08] text-white placeholder:text-white/20 focus:border-violet-500/40 focus:ring-1 focus:ring-violet-500/20 h-11 text-sm pl-10"
                      {...register('email')}
                    />
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20" />
                  </div>
                  {errors.email && (
                    <p className="text-xs text-red-400 mt-1">{errors.email.message}</p>
                  )}
                </div>

                <Button
                  type="submit"
                  className="w-full h-11 bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-500 hover:to-blue-500 text-white border-0 shadow-lg shadow-violet-500/20 text-sm font-medium"
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Sending link...
                    </>
                  ) : (
                    <>
                      Send Reset Link
                      <ArrowRight className="w-4 h-4 ml-2" />
                    </>
                  )}
                </Button>
              </form>
            </>
          ) : (
            <div className="text-center">
              <div className="w-16 h-16 bg-emerald-500/10 border border-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
                <Mail className="w-8 h-8 text-emerald-400" />
              </div>
              <h1 className="text-2xl font-bold text-white mb-2">Check your email</h1>
              <p className="text-white/40 text-sm mb-8 leading-relaxed">
                We&apos;ve sent a password reset link to your email address. Please check your inbox (and spam folder).
              </p>
              <Button
                variant="outline"
                className="w-full h-11 bg-white/[0.03] border-white/10 hover:bg-white/[0.07] text-white"
                onClick={() => setIsSubmitted(false)}
              >
                Try another email
              </Button>
            </div>
          )}

          <div className="mt-8 pt-6 border-t border-white/[0.06] text-center">
            <Link
              href="/login"
              className="text-white/30 hover:text-white text-sm transition-colors inline-flex items-center gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to login
            </Link>
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-white/15 text-xs mt-8">
          © 2026 Voxly. All rights reserved.
        </p>
      </motion.div>
    </div>
  );
}
