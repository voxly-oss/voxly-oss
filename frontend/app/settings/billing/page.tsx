'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { billingAPI } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Loader2, ExternalLink, Check, ArrowRight } from 'lucide-react';
import SettingsShell from '@/components/SettingsShell';
import { Panel, PanelRow, PanelText } from '@/components/SidePanel';
import { motion } from 'framer-motion';

interface PlanData {
    id: string; name: string; slug: string; tier_level: number;
    price_monthly: number; price_yearly: number; currency: string;
    max_clients: number; max_projects: number; max_api_keys: number; max_ai_messages_per_month: number;
    features: Record<string, any>;
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

const formatPrice = (price: number, currency: string, slug: string) => {
    if (price === 0) return slug === 'free' ? 'Free' : 'Custom';
    return `${currency === 'INR' ? '₹' : '$'}${price}`;
};

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
    const [usage, setUsage] = useState<UsageData | null>(null);
    const [plans, setPlans] = useState<PlanData[]>([]);
    const [subscription, setSubscription] = useState<SubscriptionData | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [checkoutPlanId, setCheckoutPlanId] = useState<string | null>(null);
    const [isCheckingOut, setIsCheckingOut] = useState(false);
    const [showGatewayPicker, setShowGatewayPicker] = useState(false);

    const fetchAll = useCallback(async () => {
        setIsLoading(true);
        try {
            const [usageRes, plansRes, subRes] = await Promise.all([
                billingAPI.getUsage().catch(() => null),
                billingAPI.getPlans(),
                billingAPI.getSubscription().catch(() => null),
            ]);
            if (usageRes) setUsage(usageRes.data);
            setPlans(plansRes.data.plans || []);
            if (subRes) setSubscription(subRes.data);
        } catch { /* ignore */ } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => { fetchAll(); }, [fetchAll]);

    const handleUpgradeClick = (planId: string) => {
        setCheckoutPlanId(planId);
        setShowGatewayPicker(true);
    };

    const handleCheckout = async (gateway: 'stripe' | 'razorpay') => {
        if (!checkoutPlanId) return;
        setIsCheckingOut(true);
        try {
            const res = await billingAPI.createCheckout({ plan_id: checkoutPlanId, payment_gateway: gateway, billing_cycle: 'monthly' });
            if (res.data.checkout_url) window.location.href = res.data.checkout_url;
        } catch (err: any) {
            toast({ title: 'Checkout failed', description: err.response?.data?.detail || 'Could not start checkout.', variant: 'destructive' });
        } finally {
            setIsCheckingOut(false);
            setShowGatewayPicker(false);
        }
    };

    const handleManageBilling = async () => {
        try {
            const res = await billingAPI.createPortal();
            if (res.data.portal_url) window.open(res.data.portal_url, '_blank');
        } catch (err: any) {
            toast({ title: 'Error', description: err.response?.data?.detail || 'Could not open billing portal.', variant: 'destructive' });
        }
    };

    const planName = subscription?.plan?.name || user?.subscription_tier || 'Free';
    const price = subscription?.plan ? subscription.plan.price_monthly : 0;

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
                            </p>
                        </div>
                        {subscription?.payment_gateway === 'stripe' && (
                            <Button onClick={handleManageBilling} variant="outline" className="border-voxly-ink-4 bg-secondary hover:bg-accent text-foreground font-semibold text-[13px] h-auto py-[9px]">
                                <ExternalLink className="w-3.5 h-3.5 mr-2" /> Billing portal
                            </Button>
                        )}
                    </div>

                    {isLoading ? (
                        <div className="p-12 text-center"><Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" /></div>
                    ) : (
                        <>
                            {usage && (
                                <>
                                    <span className="font-display font-semibold text-[15px] text-foreground">Usage This Cycle</span>
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                        <UsageTile label="CLIENTS" used={usage.clients_count} limit={usage.clients_limit} />
                                        <UsageTile label="PROJECTS" used={usage.projects_count} limit={usage.projects_limit} />
                                        <UsageTile label="AI MESSAGES" used={usage.ai_messages_this_month} limit={usage.ai_messages_limit} />
                                        <UsageTile label="API KEYS" used={usage.api_keys_count} limit={usage.api_keys_limit} />
                                    </div>
                                </>
                            )}

                            <span className="font-display font-semibold text-[15px] text-foreground">Plans</span>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                {plans.map(plan => {
                                    const isCurrent = subscription?.plan?.id === plan.id || (!subscription && plan.slug === 'free');
                                    const isRecommended = plan.tier_level === 2;
                                    return (
                                        <div key={plan.id} className={`relative border rounded-xl p-[18px] bg-card flex flex-col gap-2.5 ${isCurrent ? 'border-primary' : 'border-border'}`}>
                                            {isRecommended && !isCurrent && (
                                                <span className="absolute -top-2.5 right-4 text-[10px] font-bold bg-primary text-primary-foreground px-2.5 py-0.5 rounded-full">Popular</span>
                                            )}
                                            {isCurrent && (
                                                <span className="absolute -top-2.5 right-4 text-[10px] font-bold bg-primary text-primary-foreground px-2.5 py-0.5 rounded-full">Current plan</span>
                                            )}
                                            <div className="font-display font-bold text-[15px] text-foreground">{plan.name}</div>
                                            <div><span className="font-display font-bold text-2xl text-foreground">{formatPrice(plan.price_monthly, plan.currency, plan.slug)}</span>{plan.price_monthly > 0 && <span className="text-[11.5px] text-voxly-ink-5">/mo</span>}</div>
                                            <ul className="text-xs text-voxly-ink-6 flex-1 space-y-1.5">
                                                <li className="flex items-center gap-1.5"><Check className="w-3 h-3 text-voxly-success flex-none" />{plan.max_clients} clients</li>
                                                <li className="flex items-center gap-1.5"><Check className="w-3 h-3 text-voxly-success flex-none" />{plan.max_projects} projects</li>
                                                <li className="flex items-center gap-1.5"><Check className="w-3 h-3 text-voxly-success flex-none" />{plan.max_api_keys} API keys</li>
                                                <li className="flex items-center gap-1.5"><Check className="w-3 h-3 text-voxly-success flex-none" />{plan.max_ai_messages_per_month.toLocaleString()} AI msgs/mo</li>
                                            </ul>
                                            <Button
                                                disabled={isCurrent}
                                                onClick={() => handleUpgradeClick(plan.id)}
                                                className={isCurrent ? 'bg-secondary text-voxly-ink-5 border border-border cursor-default' : 'bg-secondary hover:bg-accent text-foreground border border-voxly-ink-4'}
                                            >
                                                {isCurrent ? 'Current plan' : 'Upgrade'}
                                            </Button>
                                        </div>
                                    );
                                })}
                                {plans.length === 0 && <div className="text-center py-8 text-voxly-ink-5 col-span-3">No plans available.</div>}
                            </div>
                        </>
                    )}
                </div>

                <div className="w-full xl:w-80 flex-none flex flex-col gap-3.5">
                    {usage && (
                        <Panel title="Plan Usage">
                            <PanelRow label="Clients" value={`${usage.clients_count} / ${usage.clients_limit}`} />
                            <PanelRow label="Projects" value={`${usage.projects_count} / ${usage.projects_limit}`} />
                            <PanelRow label="AI messages" value={`${usage.ai_messages_this_month} / ${usage.ai_messages_limit}`} />
                        </Panel>
                    )}
                    <Panel title="Billing Contact">
                        <PanelRow label="Billing owner" value={user?.full_name || '—'} />
                        <PanelRow label="Invoice email" value={<span className="font-normal text-[11.5px]">{user?.email}</span>} />
                    </Panel>
                    <Panel title="Need Help?" defaultOpen={false}>
                        <PanelText>
                            <a href="#">Billing FAQ →</a><br /><a href="#">Contact support →</a>
                        </PanelText>
                    </Panel>
                </div>
            </div>

            {showGatewayPicker && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={() => setShowGatewayPicker(false)}>
                    <div className="w-full max-w-md bg-card border border-border rounded-2xl p-6" onClick={(e) => e.stopPropagation()}>
                        <h3 className="text-lg font-bold text-foreground mb-1">Select payment method</h3>
                        <p className="text-voxly-ink-5 mb-5 text-sm">Choose how you want to pay.</p>
                        <div className="space-y-2.5">
                            <button onClick={() => handleCheckout('stripe')} disabled={isCheckingOut} className="w-full flex items-center justify-between p-3.5 rounded-xl border border-border bg-secondary hover:bg-accent transition-all group">
                                <div className="flex items-center gap-3">
                                    <div className="w-9 h-9 rounded-lg bg-[#635BFF] flex items-center justify-center text-white font-bold">S</div>
                                    <div className="text-left">
                                        <p className="font-medium text-foreground text-sm">Stripe</p>
                                        <p className="text-xs text-voxly-ink-5">International cards</p>
                                    </div>
                                </div>
                                <ArrowRight className="w-4 h-4 text-voxly-ink-5" />
                            </button>
                            <button onClick={() => handleCheckout('razorpay')} disabled={isCheckingOut} className="w-full flex items-center justify-between p-3.5 rounded-xl border border-border bg-secondary hover:bg-accent transition-all group">
                                <div className="flex items-center gap-3">
                                    <div className="w-9 h-9 rounded-lg bg-[#3395FF] flex items-center justify-center text-white font-bold">R</div>
                                    <div className="text-left">
                                        <p className="font-medium text-foreground text-sm">Razorpay</p>
                                        <p className="text-xs text-voxly-ink-5">UPI, Netbanking, Rupay</p>
                                    </div>
                                </div>
                                <ArrowRight className="w-4 h-4 text-voxly-ink-5" />
                            </button>
                        </div>
                        <Button variant="ghost" onClick={() => setShowGatewayPicker(false)} className="w-full mt-4 text-voxly-ink-5 hover:text-foreground">Cancel</Button>
                    </div>
                </div>
            )}
        </SettingsShell>
    );
}
