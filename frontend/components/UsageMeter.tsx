'use client';

/**
 * Plan usage panel — shows the tenant's consumption against their plan limits.
 * Backed by GET /api/v1/billing/usage. Surfaces an upgrade CTA when any
 * resource crosses 80% so the limit enforcement never feels like a dead end.
 */
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Gauge, ArrowUpRight } from 'lucide-react';
import { billingAPI } from '@/lib/api';

type Usage = {
    clients_count: number; clients_limit: number;
    projects_count: number; projects_limit: number;
    ai_messages_this_month: number; ai_messages_limit: number;
    api_calls_today: number; api_calls_limit_daily: number;
    usage_percentage: number;
};

function pct(count: number, limit: number): number {
    if (!limit || limit <= 0) return 0;
    return Math.min(Math.round((count / limit) * 100), 100);
}

function barColor(p: number): string {
    if (p >= 90) return 'bg-red-500';
    if (p >= 75) return 'bg-amber-500';
    return 'bg-violet-500';
}

function Row({ label, count, limit }: { label: string; count: number; limit: number }) {
    const p = pct(count, limit);
    return (
        <div>
            <div className="flex items-center justify-between mb-1.5 text-xs">
                <span className="text-white/45">{label}</span>
                <span className="font-semibold text-white/80">
                    {count.toLocaleString()}
                    <span className="text-white/30"> / {limit.toLocaleString()}</span>
                </span>
            </div>
            <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                <motion.div
                    initial={{ width: 0 }} animate={{ width: `${Math.max(p, 2)}%` }}
                    transition={{ duration: 0.6, ease: 'easeOut' }}
                    className={`h-full rounded-full ${barColor(p)}`}
                />
            </div>
        </div>
    );
}

export default function UsageMeter() {
    const { data, isLoading, isError } = useQuery({
        queryKey: ['usage'],
        queryFn: async () => (await billingAPI.getUsage()).data as Usage,
        staleTime: 60_000,
    });

    if (isError) return null; // fail quietly — never block the dashboard

    const nearLimit =
        !!data &&
        (pct(data.clients_count, data.clients_limit) >= 80 ||
            pct(data.projects_count, data.projects_limit) >= 80 ||
            pct(data.ai_messages_this_month, data.ai_messages_limit) >= 80);

    return (
        <div className="bg-[#0d0d16] border border-white/[0.07] rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 rounded-xl bg-violet-500/10 border border-violet-500/15 flex items-center justify-center">
                    <Gauge className="w-3.5 h-3.5 text-violet-400" />
                </div>
                <div>
                    <p className="text-sm font-bold text-white">Plan Usage</p>
                    <p className="text-xs text-white/35">This billing period</p>
                </div>
            </div>

            {isLoading || !data ? (
                <div className="space-y-4">
                    {[0, 1, 2].map((k) => <div key={k} className="h-8 bg-white/[0.02] rounded-lg animate-pulse" />)}
                </div>
            ) : (
                <div className="space-y-3.5">
                    <Row label="Clients" count={data.clients_count} limit={data.clients_limit} />
                    <Row label="Projects" count={data.projects_count} limit={data.projects_limit} />
                    <Row label="AI messages" count={data.ai_messages_this_month} limit={data.ai_messages_limit} />
                </div>
            )}

            {nearLimit && (
                <Link href="/settings?tab=billing"
                    className="mt-4 flex items-center justify-center gap-1.5 py-2 bg-gradient-to-r from-violet-600/90 to-blue-600/90 hover:from-violet-500 hover:to-blue-500 rounded-xl text-xs font-semibold text-white transition-all">
                    Upgrade for more <ArrowUpRight className="w-3.5 h-3.5" />
                </Link>
            )}
        </div>
    );
}
