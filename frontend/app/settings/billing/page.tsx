'use client';

import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { billingAPI } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Loader2, ExternalLink, Check, ArrowRight, AlertTriangle, RefreshCw } from 'lucide-react';
import SettingsShell from '@/components/SettingsShell';
import { Panel, PanelRow, PanelText } from '@/components/SidePanel';
import { motion } from 'framer-motion';

interface PlanData {
    id: string; name: string; slug: string; tier_level: number;
    price_monthly: number; price_yearly: number; currency: string;
    max_clients: number; max_projects: number; max_api_keys: number; max_ai_messages_per_month: number;
    features: Record<string, unknown>;
}
interface SubscriptionData {
    id: string; plan: PlanData; status: string; payment_gateway: string | null;
    current_period_end: string | null; cancel_at_period_end: boolean; created_at: string;
}
interface UsageData {
    api_calls_today: number; api_calls_limit_daily: number;
    ai_messages_this_month: number; ai_messages_limit: number;
    clients_count: number; clients_limit: number;
    projects_count: number; projects_limit: number;
    api_keys_count: number; api_keys_limit: number;
    usage_percentage: number;
}

type Gateway = 'stripe' | 'razorpay';

const formatPrice = (price: number, currency: string, slug: string) => {
    if (price === 0) return slug === 'free' ? 'Free' : 'Custom';
    return `${currency === 'INR' ? '₹' : '$'}${price}`;
};

function detailOf(err: unknown, fallback: string) {
    const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
    return typeof detail === 'string' ? detail : fallback;
}

function UsageTile({ label, used, limit }: { label: string; used: number; limit: number }) {
    const pct = Math.min((used / Math.max(limit, 1)) * 100, 100);
    return (
        <div className="border border-border rounded-[10px] px-3.5 py-3 bg-card">
            <div className="font-mono text-[9px] font-semibold tracking-[0.04em] text-voxly-ink-5 mb-1.5">{label}</div>
            <div className="font-display font-bold text-[20px] text-foreground tabular-nums">
                {used.toLocaleString()} <span className="text-xs text-voxly-ink-5 font-medium">/ {limit.toLocaleString()}</span>
            </div>
            <div className="h-1 rounded-full bg-voxly-surface-3 mt-2 overflow-hidden">
                <motion.div initial={{ width: 0 }} animate={{ width: `${pct}%` }} className={`h-full rounded-full ${pct >= 80 ? 'bg-voxly-warning' : 'bg-primary'}`} />
            </div>
        </div>
    );
}

export default function BillingSettingsPage() {
    const { user } = useAuth();
    const { toast } = useToast();
    const [checkoutPlanId, setCheckoutPlanId] = useState<string | null>(null);

    /* Plans is the only query whose failure blocks the page — without it there
       is nothing to render. Subscription and usage are additive: a free user
       legitimately has no subscription, and usage depends on Redis, which is
       allowed to be unavailable. Each is handled on its own terms rather than
       swallowed by a single catch-all. */

    const plansQuery = useQuery({
        queryKey: ['billing-plans'],
        queryFn: async () => ((await billingAPI.getPlans()).data.plans ?? []) as PlanData[],
    });

    const subscriptionQuery = useQuery({
        queryKey: ['billing-subscription'],
        queryFn: async () => ((await billingAPI.getSubscription()).data ?? null) as SubscriptionData | null,
    });

    const usageQuery = useQuery({
        queryKey: ['billing-usage'],
        queryFn: async () => (await billingAPI.getUsage()).data as UsageData,
    });

    const plans = plansQuery.data ?? [];
    const subscription = subscriptionQuery.data ?? null;
    const usage = usageQuery.data;

    const checkoutMutation = useMutation({
        mutationFn: ({ planId, gateway }: { planId: string; gateway: Gateway }) =>
            billingAPI.createCheckout({ plan_id: planId, payment_gateway: gateway, billing_cycle: 'monthly' }),
        onSuccess: (res) => {
            const url = res.data?.checkout_url;
            if (!url) {
                toast({ variant: 'destructive', title: 'Checkout failed', description: 'The gateway did not return a checkout URL.' });
                return;
            }
            // Full navigation — the gateway owns the next step.
            window.location.href = url;
        },
        onError: (err: unknown) => {
            const status = (err as { response?: { status?: number } })?.response?.status;
            toast({
                variant: 'destructive',
                title: status === 429 ? 'Too many attempts' : 'Checkout failed',
                description: status === 429
                    ? 'Wait a moment before starting checkout again.'
                    : detailOf(err, 'Could not start checkout.'),
            });
            setCheckoutPlanId(null);
        },
    });

    const portalMutation = useMutation({
        mutationFn: () => billingAPI.createPortal(),
        onSuccess: (res) => {
            const url = res.data?.portal_url;
            if (url) window.open(url, '_blank', 'noopener,noreferrer');
            else toast({ variant: 'destructive', title: 'Error', description: 'No portal URL was returned.' });
        },
        onError: (err: unknown) => {
            toast({ variant: 'destructive', title: 'Error', description: detailOf(err, 'Could not open the billing portal.') });
        },
    });

    const planName = subscription?.plan?.name || user?.subscription_tier || 'Free';
    const price = subscription?.plan ? subscription.plan.price_monthly : 0;
    const isCheckingOut = checkoutMutation.isPending;

    return (
        <SettingsShell breadcrumb={{ group: 'Billing', page: 'Billing' }}>
            <div className="flex flex-col xl:flex-row gap-6 items-start">
                <div className="flex-1 min-w-0 w-full flex flex-col gap-[18px]">
                    <div className="flex items-end justify-between gap-4 flex-wrap">
                        <div>
                            <h1 className="font-display font-bold text-[22px] text-foreground tracking-[-0.01em]">Billing</h1>
                            <p className="text-[13px] text-voxly-ink-6 mt-[3px]">
                                {planName} plan{price > 0 ? ` · $${price}/mo` : ''}
                                {subscription?.current_period_end && ` · renews ${new Date(subscription.current_period_end).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`}
                                {subscription?.cancel_at_period_end && ' · cancels at period end'}
                            </p>
                        </div>
                        {subscription?.payment_gateway === 'stripe' && (
                            <Button
                                onClick={() => portalMutation.mutate()}
                                disabled={portalMutation.isPending}
                                variant="outline"
                                className="border-voxly-ink-4 bg-secondary hover:bg-accent text-foreground font-semibold text-[13px] h-auto py-[9px]"
                            >
                                {portalMutation.isPending
                                    ? <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />
                                    : <ExternalLink className="w-3.5 h-3.5 mr-2" />}
                                Billing portal
                            </Button>
                        )}
                    </div>

                    {/* Usage — degrades on its own rather than taking the page down.
                        The counters are backed by Redis, which may be unreachable. */}
                    {usageQuery.isPending ? (
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                            {[1, 2, 3, 4].map(k => <div key={k} className="h-[86px] bg-secondary rounded-[10px] animate-pulse" />)}
                        </div>
                    ) : usageQuery.isError ? (
                        <div className="border border-border rounded-[10px] bg-card px-[18px] py-3.5 flex items-center gap-3">
                            <AlertTriangle className="w-4 h-4 text-voxly-warning flex-none" />
                            <span className="flex-1 text-[12.5px] text-voxly-ink-6">Usage counters are unavailable right now.</span>
                            <Button size="sm" variant="ghost" onClick={() => usageQuery.refetch()} className="text-voxly-ink-6 hover:text-foreground">
                                <RefreshCw className="w-3.5 h-3.5 mr-1.5" />Retry
                            </Button>
                        </div>
                    ) : usage ? (
                        <>
                            <span className="font-display font-semibold text-[15px] text-foreground">Usage This Cycle</span>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                <UsageTile label="CLIENTS" used={usage.clients_count} limit={usage.clients_limit} />
                                <UsageTile label="PROJECTS" used={usage.projects_count} limit={usage.projects_limit} />
                                <UsageTile label="AI MESSAGES" used={usage.ai_messages_this_month} limit={usage.ai_messages_limit} />
                                <UsageTile label="API KEYS" used={usage.api_keys_count} limit={usage.api_keys_limit} />
                            </div>
                        </>
                    ) : null}

                    <span className="font-display font-semibold text-[15px] text-foreground">Plans</span>

                    {plansQuery.isPending ? (
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                            {[1, 2, 3].map(k => <div key={k} className="h-56 bg-secondary rounded-xl animate-pulse" />)}
                        </div>
                    ) : plansQuery.isError ? (
                        <div className="border border-border rounded-xl bg-card py-14 flex flex-col items-center text-center px-4">
                            <AlertTriangle className="w-8 h-8 text-voxly-heat mb-3" />
                            <h3 className="text-sm font-semibold text-foreground mb-1">Couldn&apos;t load plans</h3>
                            <p className="text-xs text-voxly-ink-5 max-w-sm mb-4">{detailOf(plansQuery.error, 'The billing service did not respond.')}</p>
                            <Button onClick={() => plansQuery.refetch()} className="bg-secondary hover:bg-accent text-foreground border border-voxly-ink-4">
                                <RefreshCw className="w-3.5 h-3.5 mr-2" />Try again
                            </Button>
                        </div>
                    ) : plans.length === 0 ? (
                        <div className="border border-border rounded-xl bg-card py-14 text-center text-voxly-ink-5 text-sm px-4">
                            No plans are configured on this instance yet.
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                            {plans.map(plan => {
                                const isCurrent = subscription?.plan?.id === plan.id || (!subscription && plan.slug === 'free');
                                const isRecommended = plan.tier_level === 2;
                                const isFree = plan.slug === 'free';
                                const isThisCheckingOut = isCheckingOut && checkoutPlanId === plan.id;
                                return (
                                    <div key={plan.id} className={`relative border rounded-xl p-[18px] bg-card flex flex-col gap-2.5 ${isCurrent ? 'border-primary' : 'border-border'}`}>
                                        {isRecommended && !isCurrent && (
                                            <span className="absolute -top-2.5 right-4 text-[10px] font-bold bg-primary text-primary-foreground px-2.5 py-0.5 rounded-full">Popular</span>
                                        )}
                                        {isCurrent && (
                                            <span className="absolute -top-2.5 right-4 text-[10px] font-bold bg-primary text-primary-foreground px-2.5 py-0.5 rounded-full">Current plan</span>
                                        )}
                                        <div className="font-display font-bold text-[15px] text-foreground">{plan.name}</div>
                                        <div>
                                            <span className="font-display font-bold text-2xl text-foreground">{formatPrice(plan.price_monthly, plan.currency, plan.slug)}</span>
                                            {plan.price_monthly > 0 && <span className="text-[11.5px] text-voxly-ink-5">/mo</span>}
                                        </div>
                                        <ul className="text-xs text-voxly-ink-6 flex-1 space-y-1.5">
                                            <li className="flex items-center gap-1.5"><Check className="w-3 h-3 text-voxly-success flex-none" />{plan.max_clients} clients</li>
                                            <li className="flex items-center gap-1.5"><Check className="w-3 h-3 text-voxly-success flex-none" />{plan.max_projects} projects</li>
                                            <li className="flex items-center gap-1.5"><Check className="w-3 h-3 text-voxly-success flex-none" />{plan.max_api_keys} API keys</li>
                                            <li className="flex items-center gap-1.5"><Check className="w-3 h-3 text-voxly-success flex-none" />{plan.max_ai_messages_per_month.toLocaleString()} AI msgs/mo</li>
                                        </ul>
                                        <Button
                                            disabled={isCurrent || isFree || isCheckingOut}
                                            onClick={() => setCheckoutPlanId(plan.id)}
                                            title={isFree && !isCurrent ? 'The free plan does not require checkout' : undefined}
                                            className={isCurrent
                                                ? 'bg-secondary text-voxly-ink-5 border border-border cursor-default'
                                                : 'bg-secondary hover:bg-accent text-foreground border border-voxly-ink-4 disabled:opacity-40'}
                                        >
                                            {isThisCheckingOut && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                                            {isCurrent ? 'Current plan' : isFree ? 'Free plan' : 'Upgrade'}
                                        </Button>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                <div className="w-full xl:w-80 flex-none flex flex-col gap-3.5">
                    {usage && (
                        <Panel title="Plan Usage">
                            <PanelRow label="Clients" value={`${usage.clients_count} / ${usage.clients_limit}`} />
                            <PanelRow label="Projects" value={`${usage.projects_count} / ${usage.projects_limit}`} />
                            <PanelRow label="AI messages" value={`${usage.ai_messages_this_month} / ${usage.ai_messages_limit}`} />
                            <PanelRow label="API keys" value={`${usage.api_keys_count} / ${usage.api_keys_limit}`} />
                        </Panel>
                    )}
                    <Panel title="Billing Contact">
                        <PanelRow label="Billing owner" value={user?.full_name || '—'} />
                        <PanelRow label="Invoice email" value={<span className="font-normal text-[11.5px]">{user?.email}</span>} />
                    </Panel>
                    {subscription && (
                        <Panel title="Subscription" defaultOpen={false}>
                            <PanelRow label="Status" value={<span className="capitalize">{subscription.status}</span>} />
                            <PanelRow label="Gateway" value={<span className="capitalize">{subscription.payment_gateway ?? '—'}</span>} />
                            <PanelRow label="Started" value={new Date(subscription.created_at).toLocaleDateString()} />
                        </Panel>
                    )}
                    <Panel title="Need Help?" defaultOpen={false}>
                        <PanelText>Contact support for invoices, refunds, or plan changes.</PanelText>
                    </Panel>
                </div>
            </div>

            {/* Gateway picker */}
            {checkoutPlanId && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
                    onClick={() => { if (!isCheckingOut) setCheckoutPlanId(null); }}
                >
                    <div className="w-full max-w-md bg-card border border-border rounded-2xl p-6" onClick={(e) => e.stopPropagation()}>
                        <h3 className="text-lg font-bold text-foreground mb-1">Select payment method</h3>
                        <p className="text-voxly-ink-5 mb-5 text-sm">Choose how you want to pay.</p>
                        <div className="space-y-2.5">
                            {([
                                { id: 'stripe' as Gateway, initial: 'S', color: 'bg-[#635BFF]', name: 'Stripe', blurb: 'International cards' },
                                { id: 'razorpay' as Gateway, initial: 'R', color: 'bg-[#3395FF]', name: 'Razorpay', blurb: 'UPI, Netbanking, Rupay' },
                            ]).map(g => (
                                <button
                                    key={g.id}
                                    onClick={() => checkoutMutation.mutate({ planId: checkoutPlanId, gateway: g.id })}
                                    disabled={isCheckingOut}
                                    className="w-full flex items-center justify-between p-3.5 rounded-xl border border-border bg-secondary hover:bg-accent transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className={`w-9 h-9 rounded-lg ${g.color} flex items-center justify-center text-white font-bold`}>{g.initial}</div>
                                        <div className="text-left">
                                            <p className="font-medium text-foreground text-sm">{g.name}</p>
                                            <p className="text-xs text-voxly-ink-5">{g.blurb}</p>
                                        </div>
                                    </div>
                                    {isCheckingOut && checkoutMutation.variables?.gateway === g.id
                                        ? <Loader2 className="w-4 h-4 text-voxly-ink-5 animate-spin" />
                                        : <ArrowRight className="w-4 h-4 text-voxly-ink-5" />}
                                </button>
                            ))}
                        </div>
                        <Button
                            variant="ghost"
                            onClick={() => setCheckoutPlanId(null)}
                            disabled={isCheckingOut}
                            className="w-full mt-4 text-voxly-ink-5 hover:text-foreground"
                        >
                            Cancel
                        </Button>
                    </div>
                </div>
            )}
        </SettingsShell>
    );
}
