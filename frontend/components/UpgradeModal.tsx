'use client';

/**
 * Global upgrade prompt.
 *
 * Listens for the `voxly:plan-limit` event (emitted by the axios interceptor
 * when the backend returns HTTP 402 plan_limit_reached) and shows a polished
 * upsell modal. Mounted once in the root layout.
 */
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { Sparkles, X, ArrowUpRight, Check } from 'lucide-react';
import { PLAN_LIMIT_EVENT, type PlanLimitDetail } from '@/lib/api';

const PRO_PERKS = [
    '50 clients & 100 projects',
    '1,000 AI messages / month',
    'Custom branding & analytics',
    'Priority support',
];

export default function UpgradeModal() {
    const [detail, setDetail] = useState<PlanLimitDetail | null>(null);
    const router = useRouter();

    useEffect(() => {
        const handler = (e: Event) => {
            setDetail((e as CustomEvent<PlanLimitDetail>).detail);
        };
        window.addEventListener(PLAN_LIMIT_EVENT, handler);
        return () => window.removeEventListener(PLAN_LIMIT_EVENT, handler);
    }, []);

    const close = () => setDetail(null);
    const goToBilling = () => {
        close();
        router.push('/settings?tab=billing');
    };

    return (
        <AnimatePresence>
            {detail && (
                <motion.div
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    className="fixed inset-0 z-[100] flex items-center justify-center p-4"
                    style={{ fontFamily: "'Inter', system-ui, sans-serif" }}
                    onClick={close}
                >
                    <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
                    <motion.div
                        initial={{ opacity: 0, scale: 0.94, y: 16 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.96, y: 8 }}
                        transition={{ type: 'spring', damping: 24, stiffness: 300 }}
                        onClick={(e) => e.stopPropagation()}
                        className="relative w-full max-w-md bg-[#0d0d16] border border-white/[0.09] rounded-2xl overflow-hidden shadow-2xl"
                    >
                        {/* glow */}
                        <div className="absolute top-0 right-0 w-52 h-52 rounded-full blur-[70px] opacity-20 bg-gradient-to-br from-violet-500 to-blue-500" />

                        <button onClick={close}
                            className="absolute top-4 right-4 z-10 w-8 h-8 rounded-lg flex items-center justify-center text-white/40 hover:text-white hover:bg-white/[0.06] transition-all">
                            <X className="w-4 h-4" />
                        </button>

                        <div className="relative p-6">
                            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-500/25 to-blue-500/25 border border-white/10 flex items-center justify-center mb-4">
                                <Sparkles className="w-6 h-6 text-violet-300" />
                            </div>

                            <h2 className="text-lg font-bold text-white tracking-tight">
                                You&apos;ve hit your {detail.plan} plan limit
                            </h2>
                            <p className="text-sm text-white/45 mt-1.5 leading-relaxed">
                                {detail.message} Upgrade to Pro to keep growing without limits.
                            </p>

                            <div className="mt-5 rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">
                                <div className="flex items-center justify-between mb-3">
                                    <span className="text-sm font-bold text-white">Voxly Pro</span>
                                    <span className="text-sm text-white/60">
                                        <span className="text-white font-bold">$29</span>/mo
                                    </span>
                                </div>
                                <ul className="space-y-2">
                                    {PRO_PERKS.map((perk) => (
                                        <li key={perk} className="flex items-center gap-2 text-xs text-white/60">
                                            <span className="w-4 h-4 rounded-full bg-emerald-500/15 flex items-center justify-center flex-shrink-0">
                                                <Check className="w-2.5 h-2.5 text-emerald-400" />
                                            </span>
                                            {perk}
                                        </li>
                                    ))}
                                </ul>
                            </div>

                            <div className="mt-5 flex items-center gap-3">
                                <button onClick={close}
                                    className="flex-1 py-2.5 rounded-xl border border-white/[0.08] text-sm font-semibold text-white/60 hover:text-white hover:bg-white/[0.04] transition-all">
                                    Maybe later
                                </button>
                                <button onClick={goToBilling}
                                    className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-500 hover:to-blue-500 text-white text-sm font-semibold transition-all shadow-[0_0_20px_-8px_rgba(124,58,237,0.6)]">
                                    Upgrade to Pro <ArrowUpRight className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
