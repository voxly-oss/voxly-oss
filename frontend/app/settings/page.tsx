'use client';

import { useState, useEffect, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import DashboardLayout from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { apiKeysAPI, billingAPI, authAPI, aiKeysAPI } from '@/lib/api';
import {
    User, Bell, Shield, Key, Loader2, Save, Plus, Copy, Trash2,
    RotateCw, CreditCard, Zap, Check, AlertTriangle, Eye, EyeOff,
    ExternalLink, IndianRupee, Globe, X as XIcon, ArrowRight, Bot,
    CheckCircle2, XCircle, HelpCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import SpotlightCard from '@/components/SpotlightCard';
import AIProviderIcon from '@/components/AIProviderIcon';

// === Schemas ===
const profileSchema = z.object({
    full_name: z.string().min(1, 'Full name is required'),
    email: z.string().email('Invalid email address'),
    agency_name: z.string().min(1, 'Agency name is required'),
});
type ProfileFormData = z.infer<typeof profileSchema>;

const passwordSchema = z.object({
    current_password: z.string().min(1, 'Current password is required'),
    new_password: z.string().min(8, 'Password must be at least 8 characters')
        .regex(/[A-Z]/, 'Must contain an uppercase letter')
        .regex(/[a-z]/, 'Must contain a lowercase letter')
        .regex(/\d/, 'Must contain a digit'),
    confirm_password: z.string().min(8, 'Password must be at least 8 characters'),
}).refine((data) => data.new_password === data.confirm_password, {
    message: "Passwords don't match",
    path: ['confirm_password'],
});
type PasswordFormData = z.infer<typeof passwordSchema>;

// === Types ===
interface APIKeyData {
    id: string;
    key_prefix: string;
    label: string;
    scopes: string[];
    is_active: boolean;
    last_used_at: string | null;
    expires_at: string | null;
    created_at: string;
    revoked_at: string | null;
    key?: string; // only on creation
}

interface UsageData {
    api_calls_today: number;
    api_calls_limit_daily: number;
    ai_messages_this_month: number;
    ai_messages_limit: number;
    clients_count: number;
    clients_limit: number;
    projects_count: number;
    projects_limit: number;
    api_keys_count: number;
    api_keys_limit: number;
    usage_percentage: number;
}

interface PlanData {
    id: string;
    name: string;
    slug: string;
    tier_level: number;
    price_monthly: number;
    price_yearly: number;
    currency: string;
    max_clients: number;
    max_projects: number;
    max_api_keys: number;
    max_ai_messages_per_month: number;
    features: Record<string, any>;
}

interface SubscriptionData {
    id: string;
    plan: PlanData;
    status: string;
    payment_gateway: string | null;
    current_period_end: string | null;
    cancel_at_period_end: boolean;
    created_at: string;
}

// === Animations ===
const containerVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { staggerChildren: 0.1 } }
};
const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0 }
};

// === Reusable Components ===
function SectionIcon({ icon: Icon, gradient }: { icon: React.ElementType; gradient: string }) {
    return (
        <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center shadow-lg shadow-black/20`}>
            <Icon className="h-5 w-5" style={{ color: 'inherit' }} />
        </div>
    );
}

function UsageBar({ label, used, limit }: { label: string; used: number; limit: number }) {
    const pct = Math.min((used / Math.max(limit, 1)) * 100, 100);
    const warn = pct >= 80;
    return (
        <div className="space-y-2">
            <div className="flex justify-between text-sm">
                <span className="text-white/60 font-medium">{label}</span>
                <span className={warn ? 'text-amber-400 font-bold' : 'text-white/80'}>
                    {used} <span className="text-white/30">/</span> {limit}
                </span>
            </div>
            <div className="h-2.5 rounded-full bg-white/5 overflow-hidden border border-white/5">
                <div
                    className={`h-full rounded-full transition-all duration-1000 ease-out ${
                        warn ? 'bg-gradient-to-r from-amber-500 to-red-500' : 'bg-gradient-to-r from-violet-500 to-blue-500'
                    }`}
                    style={{ width: `${pct}%` }}
                />
            </div>
        </div>
    );
}

export default function SettingsPage() {
    const { user, refreshUser } = useAuth();
    const { toast } = useToast();
    const [activeTab, setActiveTab] = useState<'profile' | 'api-keys' | 'ai-keys' | 'billing'>('profile');

    // Profile state
    const [isProfileLoading, setIsProfileLoading] = useState(false);
    const [isPasswordLoading, setIsPasswordLoading] = useState(false);

    // API Keys state
    const [apiKeys, setApiKeys] = useState<APIKeyData[]>([]);
    const [isKeysLoading, setIsKeysLoading] = useState(false);
    const [newKeyLabel, setNewKeyLabel] = useState('');
    const [isCreatingKey, setIsCreatingKey] = useState(false);
    const [newlyCreatedKey, setNewlyCreatedKey] = useState<string | null>(null);
    const [showNewKey, setShowNewKey] = useState(false);
    const [maxKeys, setMaxKeys] = useState(1);

    // Billing state
    const [usage, setUsage] = useState<UsageData | null>(null);
    const [isUsageLoading, setIsUsageLoading] = useState(false);
    const [plans, setPlans] = useState<PlanData[]>([]);
    const [isPlansLoading, setIsPlansLoading] = useState(false);
    const [subscription, setSubscription] = useState<SubscriptionData | null>(null);
    const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly');
    const [checkoutPlanId, setCheckoutPlanId] = useState<string | null>(null);
    const [isCheckingOut, setIsCheckingOut] = useState(false);
    const [showGatewayPicker, setShowGatewayPicker] = useState(false);

    // AI Keys (BYOK) state
    interface AIKeyProvider { id: string; name: string; prefix: string; placeholder: string; docs_url: string; has_key: boolean; }
    interface AIKeyData { id: string; provider: string; provider_name: string; label: string | null; key_masked: string; is_active: boolean; is_valid: boolean | null; last_validated_at: string | null; last_used_at: string | null; created_at: string; }
    const [aiProviders, setAiProviders] = useState<AIKeyProvider[]>([]);
    const [aiKeys, setAiKeys] = useState<AIKeyData[]>([]);
    const [isAiKeysLoading, setIsAiKeysLoading] = useState(false);
    const [addingProvider, setAddingProvider] = useState<string | null>(null);
    const [newAiKeyValue, setNewAiKeyValue] = useState('');
    const [isAddingAiKey, setIsAddingAiKey] = useState(false);
    const [validatingKeyId, setValidatingKeyId] = useState<string | null>(null);

    // Forms
    const {
        register: registerProfile,
        handleSubmit: handleProfileSubmit,
        formState: { errors: profileErrors },
    } = useForm<ProfileFormData>({
        resolver: zodResolver(profileSchema),
        defaultValues: {
            full_name: user?.full_name ?? '',
            email: user?.email ?? '',
            agency_name: user?.agency_name ?? '',
        },
    });

    const {
        register: registerPassword,
        handleSubmit: handlePasswordSubmit,
        formState: { errors: passwordErrors },
        reset: resetPassword,
    } = useForm<PasswordFormData>({ resolver: zodResolver(passwordSchema) });

    // === Data Fetching ===
    const fetchApiKeys = useCallback(async () => {
        setIsKeysLoading(true);
        try {
            const res = await apiKeysAPI.list();
            setApiKeys(res.data.keys || []);
            setMaxKeys(res.data.max_allowed || 1);
        } catch { /* ignore */ } finally {
            setIsKeysLoading(false);
        }
    }, []);

    const fetchUsage = useCallback(async () => {
        setIsUsageLoading(true);
        try {
            const res = await billingAPI.getUsage();
            setUsage(res.data);
        } catch { /* ignore */ } finally {
            setIsUsageLoading(false);
        }
    }, []);

    const fetchPlans = useCallback(async () => {
        setIsPlansLoading(true);
        try {
            const res = await billingAPI.getPlans();
            setPlans(res.data.plans || []);
        } catch { /* ignore */ } finally {
            setIsPlansLoading(false);
        }
    }, []);

    const fetchSubscription = useCallback(async () => {
        try {
            const res = await billingAPI.getSubscription();
            setSubscription(res.data);
        } catch { /* ignore */ }
    }, []);

    useEffect(() => {
        if (activeTab === 'api-keys') fetchApiKeys();
        if (activeTab === 'billing') {
            fetchUsage();
            fetchPlans();
            fetchSubscription();
        }
    }, [activeTab, fetchApiKeys, fetchUsage, fetchPlans, fetchSubscription]);

    // === Billing Handlers ===
    const handleUpgradeClick = (planId: string) => {
        setCheckoutPlanId(planId);
        setShowGatewayPicker(true);
    };

    const handleCheckout = async (gateway: 'stripe' | 'razorpay') => {
        if (!checkoutPlanId) return;
        setIsCheckingOut(true);
        try {
            const res = await billingAPI.createCheckout({
                plan_id: checkoutPlanId,
                payment_gateway: gateway,
                billing_cycle: billingCycle,
            });
            const { checkout_url } = res.data;
            if (checkout_url) {
                window.location.href = checkout_url;
            }
        } catch (err: any) {
            toast({
                title: 'Checkout failed',
                description: err.response?.data?.detail || 'Could not start checkout. Please try again.',
                variant: 'destructive',
            });
        } finally {
            setIsCheckingOut(false);
            setShowGatewayPicker(false);
        }
    };

    const handleManageBilling = async () => {
        try {
            const res = await billingAPI.createPortal();
            if (res.data.portal_url) {
                window.open(res.data.portal_url, '_blank');
            }
        } catch (err: any) {
            toast({
                title: 'Error',
                description: err.response?.data?.detail || 'Could not open billing portal.',
                variant: 'destructive',
            });
        }
    };

    const formatPrice = (price: number, currency: string) => {
        if (price === 0) return 'Free';
        const symbol = currency === 'INR' ? '₹' : '$';
        return `${symbol}${price}`;
    };

    const getPlanFeatures = (plan: PlanData): string[] => [
        `${plan.max_clients} clients`,
        `${plan.max_projects} projects`,
        `${plan.max_api_keys} API keys`,
        `${plan.max_ai_messages_per_month.toLocaleString()} AI msgs/mo`,
        ...(plan.features?.custom_branding ? ['Custom branding'] : []),
        ...(plan.features?.sla ? ['SLA guarantee'] : []),
        ...(plan.features?.priority_support ? ['Priority support'] : []),
    ];

    // === Handlers ===
    const onProfileSubmit = async (data: ProfileFormData) => {
        setIsProfileLoading(true);
        try {
            await authAPI.updateProfile({
                full_name: data.full_name,
                agency_name: data.agency_name,
            });
            await refreshUser();
            toast({ title: 'Profile updated', description: 'Your profile has been updated successfully.' });
        } catch (err: any) {
            toast({
                title: 'Error',
                description: err.response?.data?.detail || 'Failed to update profile.',
                variant: 'destructive',
            });
        } finally {
            setIsProfileLoading(false);
        }
    };

    const onPasswordSubmit = async (data: PasswordFormData) => {
        setIsPasswordLoading(true);
        try {
            await authAPI.changePassword({
                current_password: data.current_password,
                new_password: data.new_password,
            });
            toast({ title: 'Password changed', description: 'Your password has been changed successfully.' });
            resetPassword();
        } catch (err: any) {
            const detail = err.response?.data?.detail;
            toast({
                title: 'Error',
                description: typeof detail === 'string' ? detail : 'Failed to change password.',
                variant: 'destructive',
            });
        } finally {
            setIsPasswordLoading(false);
        }
    };

    const handleCreateKey = async () => {
        if (!newKeyLabel.trim()) return;
        setIsCreatingKey(true);
        try {
            const res = await apiKeysAPI.create({ label: newKeyLabel.trim() });
            setNewlyCreatedKey(res.data.key);
            setShowNewKey(true);
            setNewKeyLabel('');
            fetchApiKeys();
            toast({ title: 'API key created', description: 'Save this key — it won\'t be shown again!' });
        } catch (err: any) {
            toast({
                title: 'Error',
                description: err.response?.data?.detail || 'Failed to create API key.',
                variant: 'destructive',
            });
        } finally {
            setIsCreatingKey(false);
        }
    };

    const handleRevokeKey = async (id: string, prefix: string) => {
        if (!confirm(`Revoke key ${prefix}...? This action cannot be undone.`)) return;
        try {
            await apiKeysAPI.revoke(id);
            fetchApiKeys();
            toast({ title: 'Key revoked', description: `API key ${prefix}... has been revoked.` });
        } catch {
            toast({ title: 'Error', description: 'Failed to revoke key.', variant: 'destructive' });
        }
    };

    const handleCopyKey = async (key: string) => {
        try {
            if (navigator?.clipboard?.writeText) {
                await navigator.clipboard.writeText(key);
            } else {
                const ta = document.createElement('textarea');
                ta.value = key;
                ta.style.position = 'fixed';
                ta.style.opacity = '0';
                document.body.appendChild(ta);
                ta.select();
                document.execCommand('copy');
                document.body.removeChild(ta);
            }
            toast({ title: 'Copied!', description: 'API key copied to clipboard.' });
        } catch {
            toast({ title: 'Error', description: 'Failed to copy. Please select and copy manually.', variant: 'destructive' });
        }
    };

    // === BYOK Handlers ===
    const fetchAiKeys = useCallback(async () => {
        setIsAiKeysLoading(true);
        try {
            const [providersRes, keysRes] = await Promise.all([
                aiKeysAPI.providers(),
                aiKeysAPI.list(),
            ]);
            setAiProviders(providersRes.data);
            setAiKeys(keysRes.data);
        } catch { /* silent */ } finally {
            setIsAiKeysLoading(false);
        }
    }, []);

    useEffect(() => { if (activeTab === 'ai-keys') fetchAiKeys(); }, [activeTab, fetchAiKeys]);

    const handleAddAiKey = async (provider: string) => {
        if (!newAiKeyValue.trim()) return;
        setIsAddingAiKey(true);
        try {
            await aiKeysAPI.add({ provider, api_key: newAiKeyValue.trim() });
            setNewAiKeyValue('');
            setAddingProvider(null);
            fetchAiKeys();
            toast({ title: 'AI key added', description: `Your ${provider} key has been saved securely.` });
        } catch (err: any) {
            toast({ title: 'Error', description: err.response?.data?.detail || 'Failed to add key.', variant: 'destructive' });
        } finally {
            setIsAddingAiKey(false);
        }
    };

    const handleDeleteAiKey = async (id: string, providerName: string) => {
        if (!confirm(`Remove your ${providerName} key?`)) return;
        try {
            await aiKeysAPI.delete(id);
            fetchAiKeys();
            toast({ title: 'Key removed', description: `${providerName} key has been removed.` });
        } catch {
            toast({ title: 'Error', description: 'Failed to remove key.', variant: 'destructive' });
        }
    };

    const handleValidateAiKey = async (id: string) => {
        setValidatingKeyId(id);
        try {
            const res = await aiKeysAPI.validate(id);
            fetchAiKeys();
            toast({ title: res.data.is_valid ? '✅ Valid' : '❌ Invalid', description: res.data.message });
        } catch {
            toast({ title: 'Error', description: 'Validation failed.', variant: 'destructive' });
        } finally {
            setValidatingKeyId(null);
        }
    };

    // === Tab Navigation ===
    const tabs = [
        { id: 'profile' as const, label: 'Profile', icon: User },
        { id: 'api-keys' as const, label: 'API Keys', icon: Key },
        { id: 'ai-keys' as const, label: 'AI Keys', icon: Bot },
        { id: 'billing' as const, label: 'Billing & Usage', icon: CreditCard },
    ];

    const inputClass = "bg-white/[0.03] border-white/5 text-white placeholder:text-white/20 focus:bg-white/[0.05] focus:border-violet-500/30 h-10 transition-all";
    const gradientBtn = "bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-500 hover:to-blue-500 text-white border-0 shadow-[0_0_20px_-5px_rgba(124,58,237,0.3)] hover:shadow-[0_0_25px_-5px_rgba(124,58,237,0.5)] transition-all duration-300";

    return (
        <DashboardLayout>
            <motion.div className="space-y-8 max-w-6xl mx-auto" variants={containerVariants} initial="hidden" animate="visible">
                {/* Header */}
                <motion.div variants={itemVariants} className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                        <h1 className="text-3xl font-bold text-white tracking-tight flex items-center gap-3">
                            Settings
                            <div className="h-1.5 w-1.5 rounded-full bg-violet-500 animate-pulse" />
                        </h1>
                        <p className="text-white/50 mt-1">Manage your account, API integration, and billing preferences.</p>
                    </div>
                    
                    {/* Floating Tab Navigation */}
                    <div className="flex gap-1 p-1.5 rounded-2xl bg-[#0a0a0f]/80 border border-white/5 backdrop-blur-xl w-fit relative">
                        {tabs.map(tab => {
                             const isActive = activeTab === tab.id;
                             return (
                                <button
                                    key={tab.id}
                                    onClick={() => setActiveTab(tab.id)}
                                    className={`relative flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all duration-300 z-10 ${
                                        isActive ? 'text-white' : 'text-white/50 hover:text-white'
                                    }`}
                                >
                                    {isActive && (
                                        <motion.div
                                            layoutId="settings-tab"
                                            className="absolute inset-0 bg-white/10 border border-white/10 rounded-xl shadow-lg shadow-violet-500/5 backdrop-blur-sm"
                                            initial={false}
                                            transition={{ type: "spring", stiffness: 300, damping: 30 }}
                                        />
                                    )}
                                    <tab.icon className={`w-4 h-4 relative z-10 ${isActive ? 'text-violet-400' : ''}`} />
                                    <span className="relative z-10">{tab.label}</span>
                                </button>
                             )
                        })}
                    </div>
                </motion.div>

                {/* Tab Content */}
                <div className="relative min-h-[500px]">
                <AnimatePresence mode="wait">
                    {activeTab === 'profile' && (
                        <motion.div key="profile" className="grid gap-6" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} transition={{ duration: 0.2 }}>
                            
                            {/* Profile Settings */}
                            <SpotlightCard className="bg-[#0a0a0f]/50 border-white/5">
                                <div className="border-b border-white/5 pb-5 mb-6">
                                    <div className="flex items-center gap-4">
                                        <SectionIcon icon={User} gradient="from-violet-500/20 to-purple-500/20 border border-violet-500/20 text-violet-400" />
                                        <div>
                                            <h2 className="text-lg font-bold text-white tracking-tight">Profile Details</h2>
                                            <p className="text-sm text-white/40">Update your personal information and agency branding.</p>
                                        </div>
                                    </div>
                                </div>
                                <form onSubmit={handleProfileSubmit(onProfileSubmit)} className="space-y-6">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div className="space-y-2">
                                            <Label htmlFor="full_name" className="text-white/70">Full Name</Label>
                                            <Input id="full_name" {...registerProfile('full_name')} placeholder="John Doe" className={inputClass} />
                                            {profileErrors.full_name && <p className="text-xs text-red-400 mt-1">{profileErrors.full_name.message}</p>}
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="email" className="text-white/70">Email Address</Label>
                                            <Input id="email" type="email" {...registerProfile('email')} placeholder="john@example.com" className={inputClass} />
                                            {profileErrors.email && <p className="text-xs text-red-400 mt-1">{profileErrors.email.message}</p>}
                                        </div>
                                        <div className="space-y-2 md:col-span-2">
                                            <Label htmlFor="agency_name" className="text-white/70">Agency Name</Label>
                                            <Input id="agency_name" {...registerProfile('agency_name')} placeholder="My Agency" className={inputClass} />
                                            {profileErrors.agency_name && <p className="text-xs text-red-400 mt-1">{profileErrors.agency_name.message}</p>}
                                        </div>
                                    </div>
                                    <div className="flex justify-end pt-2">
                                        <Button type="submit" disabled={isProfileLoading} className={gradientBtn}>
                                            {isProfileLoading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving...</> : <><Save className="w-4 h-4 mr-2" />Save Changes</>}
                                        </Button>
                                    </div>
                                </form>
                            </SpotlightCard>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {/* Password */}
                                <SpotlightCard className="bg-[#0a0a0f]/50 border-white/5 h-full">
                                    <div className="border-b border-white/5 pb-5 mb-6">
                                        <div className="flex items-center gap-4">
                                            <SectionIcon icon={Shield} gradient="from-amber-500/20 to-orange-500/20 border border-amber-500/20 text-amber-400" />
                                            <div>
                                                <h2 className="text-lg font-bold text-white tracking-tight">Security</h2>
                                                <p className="text-sm text-white/40">Ensure your account is secure.</p>
                                            </div>
                                        </div>
                                    </div>
                                    <form onSubmit={handlePasswordSubmit(onPasswordSubmit)} className="space-y-4">
                                        <div className="space-y-2">
                                            <Label htmlFor="current_password" className="text-white/70">Current Password</Label>
                                            <Input id="current_password" type="password" {...registerPassword('current_password')} placeholder="••••••••" className={inputClass} />
                                            {passwordErrors.current_password && <p className="text-xs text-red-400">{passwordErrors.current_password.message}</p>}
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="new_password" className="text-white/70">New Password</Label>
                                            <Input id="new_password" type="password" {...registerPassword('new_password')} placeholder="••••••••" className={inputClass} />
                                            {passwordErrors.new_password && <p className="text-xs text-red-400">{passwordErrors.new_password.message}</p>}
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="confirm_password" className="text-white/70">Confirm New Password</Label>
                                            <Input id="confirm_password" type="password" {...registerPassword('confirm_password')} placeholder="••••••••" className={inputClass} />
                                            {passwordErrors.confirm_password && <p className="text-xs text-red-400">{passwordErrors.confirm_password.message}</p>}
                                        </div>
                                        <div className="pt-2">
                                            <Button type="submit" disabled={isPasswordLoading} className="w-full bg-white/5 hover:bg-white/10 border border-white/10 text-white">
                                                {isPasswordLoading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Updating...</> : 'Update Password'}
                                            </Button>
                                        </div>
                                    </form>
                                </SpotlightCard>

                                {/* Notifications */}
                                <SpotlightCard className="bg-[#0a0a0f]/50 border-white/5 h-full">
                                    <div className="border-b border-white/5 pb-5 mb-6">
                                        <div className="flex items-center gap-4">
                                            <SectionIcon icon={Bell} gradient="from-blue-500/20 to-cyan-500/20 border border-blue-500/20 text-blue-400" />
                                            <div>
                                                <h2 className="text-lg font-bold text-white tracking-tight">Notifications</h2>
                                                <p className="text-sm text-white/40">Decide what you want to hear about.</p>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="space-y-3">
                                        {[
                                            { title: 'Email Notifications', desc: 'Receive updates via email' },
                                            { title: 'Project Updates', desc: 'Get notified about project changes' },
                                            { title: 'Client Messages', desc: 'Notifications for new client messages' },
                                            { title: 'WhatsApp Outbound', desc: 'Auto-send WhatsApp updates to clients' },
                                        ].map((item) => (
                                            <div key={item.title} className="flex items-center justify-between p-3.5 rounded-xl bg-white/[0.02] border border-white/5 hover:bg-white/[0.04] transition-colors">
                                                <div>
                                                    <p className="font-medium text-white text-sm">{item.title}</p>
                                                    <p className="text-xs text-white/40">{item.desc}</p>
                                                </div>
                                                <label className="relative inline-flex items-center cursor-pointer">
                                                    <input type="checkbox" defaultChecked className="sr-only peer" />
                                                    <div className="w-9 h-5 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white/80 after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-gradient-to-r peer-checked:from-violet-600 peer-checked:to-blue-600"></div>
                                                </label>
                                            </div>
                                        ))}
                                    </div>
                                </SpotlightCard>
                            </div>
                        </motion.div>
                    )}

                    {activeTab === 'api-keys' && (
                        <motion.div key="api-keys" className="grid gap-6" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} transition={{ duration: 0.2 }}>
                            {/* Create New Key */}
                            <SpotlightCard className="bg-[#0a0a0f]/50 border-white/5">
                                <div className="border-b border-white/5 pb-5 mb-6">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-4">
                                            <SectionIcon icon={Key} gradient="from-emerald-500/20 to-green-500/20 border border-emerald-500/20 text-emerald-400" />
                                            <div>
                                                <h2 className="text-lg font-bold text-white tracking-tight">Generate API Key</h2>
                                                <p className="text-sm text-white/40">Create secret keys for external integration.</p>
                                            </div>
                                        </div>
                                        <span className="text-xs font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1 rounded-full">
                                            {apiKeys.filter(k => k.is_active && !k.revoked_at).length} / {maxKeys} Active Keys
                                        </span>
                                    </div>
                                </div>
                                <div className="flex gap-4">
                                    <Input
                                        value={newKeyLabel}
                                        onChange={(e) => setNewKeyLabel(e.target.value)}
                                        placeholder='Key Label (e.g. "Production Server", "CI/CD")'
                                        className={`flex-1 ${inputClass}`}
                                        onKeyDown={(e) => e.key === 'Enter' && handleCreateKey()}
                                    />
                                    <Button onClick={handleCreateKey} disabled={isCreatingKey || !newKeyLabel.trim()} className={gradientBtn}>
                                        {isCreatingKey ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Plus className="w-4 h-4 mr-2" />Generate Key</>}
                                    </Button>
                                </div>

                                {/* Newly Created Key Banner */}
                                <AnimatePresence>
                                    {newlyCreatedKey && (
                                        <motion.div
                                            initial={{ opacity: 0, height: 0, marginTop: 0 }}
                                            animate={{ opacity: 1, height: 'auto', marginTop: 16 }}
                                            exit={{ opacity: 0, height: 0, marginTop: 0 }}
                                            className="overflow-hidden"
                                        >
                                            <div className="p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/20 backdrop-blur-md relative overflow-hidden">
                                                <div className="absolute top-0 right-0 p-4 opacity-10">
                                                    <Key className="w-24 h-24 text-emerald-500 transform rotate-45" />
                                                </div>
                                                <div className="flex items-start gap-4 relative z-10">
                                                    <div className="p-2 rounded-lg bg-emerald-500/20 text-emerald-400">
                                                        <Check className="w-5 h-5" />
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <h4 className="text-base font-bold text-emerald-400 mb-1">API Key Created Successfully</h4>
                                                        <p className="text-sm text-emerald-400/70 mb-3">
                                                            Please copy this key immediately. For security reasons, <strong>it will not be shown again.</strong>
                                                        </p>
                                                        <div className="flex items-center gap-2">
                                                            <div className="flex-1 bg-black/40 border border-emerald-500/20 rounded-lg flex items-center px-3 py-2">
                                                                <code className="flex-1 text-sm text-emerald-300 font-mono tracking-wide truncate">
                                                                    {showNewKey ? newlyCreatedKey : '•'.repeat(newlyCreatedKey.length)}
                                                                </code>
                                                                <Button size="icon" variant="ghost" onClick={() => setShowNewKey(!showNewKey)} className="h-6 w-6 text-emerald-500/50 hover:text-emerald-400 hover:bg-emerald-500/10">
                                                                    {showNewKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                                                                </Button>
                                                            </div>
                                                            <Button onClick={() => handleCopyKey(newlyCreatedKey)} className="bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 border border-emerald-500/30">
                                                                <Copy className="w-4 h-4 mr-2" /> Copy
                                                            </Button>
                                                        </div>
                                                    </div>
                                                    <Button size="icon" variant="ghost" onClick={() => { setNewlyCreatedKey(null); setShowNewKey(false); }} className="text-white/30 hover:text-white">
                                                        <XIcon className="w-4 h-4" />
                                                    </Button>
                                                </div>
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </SpotlightCard>

                            {/* Key List */}
                            <SpotlightCard className="bg-[#0a0a0f]/50 border-white/5">
                                <div className="border-b border-white/5 pb-5 mb-6">
                                    <h2 className="text-lg font-bold text-white tracking-tight">Active Keys</h2>
                                </div>
                                {isKeysLoading ? (
                                    <div className="flex items-center justify-center py-12">
                                        <Loader2 className="w-8 h-8 animate-spin text-violet-400" />
                                    </div>
                                ) : apiKeys.length === 0 ? (
                                    <div className="text-center py-12">
                                        <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mx-auto mb-4">
                                            <Key className="w-8 h-8 text-white/20" />
                                        </div>
                                        <p className="text-white font-medium">No API keys found</p>
                                        <p className="text-sm text-white/40 mt-1 max-w-xs mx-auto">Generate a new key above to start making programmatic requests to our API.</p>
                                    </div>
                                ) : (
                                    <div className="grid gap-3">
                                        {apiKeys.map((key) => (
                                            <motion.div 
                                                layout
                                                key={key.id} 
                                                className={`flex items-center justify-between p-4 rounded-xl border transition-all group ${
                                                    key.revoked_at 
                                                        ? 'bg-red-500/[0.02] border-red-500/10 opacity-60' 
                                                        : 'bg-white/[0.02] border-white/5 hover:bg-white/[0.04] hover:border-white/10'
                                                }`}
                                            >
                                                <div className="flex items-center gap-4 min-w-0">
                                                    <div className={`w-3 h-3 rounded-full flex-shrink-0 ${
                                                        key.revoked_at ? 'bg-red-500/50' : 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.4)]'
                                                    }`} />
                                                    <div className="min-w-0">
                                                        <div className="flex items-center gap-3">
                                                            <span className={`font-semibold text-sm ${key.revoked_at ? 'text-white/50' : 'text-white'}`}>{key.label}</span>
                                                            {key.revoked_at && (
                                                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-500/10 text-red-400 border border-red-500/20 font-medium uppercase tracking-wider">Revoked</span>
                                                            )}
                                                        </div>
                                                        <div className="flex items-center gap-4 mt-1.5">
                                                            <code className="text-xs text-white/40 font-mono bg-white/5 px-1.5 py-0.5 rounded">{key.key_prefix}••••••••</code>
                                                            <span className="text-xs text-white/30 truncate">
                                                                Created {new Date(key.created_at).toLocaleDateString()}
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>
                                                {!key.revoked_at && (
                                                    <div className="flex items-center gap-2 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                                                        <Button size="sm" variant="ghost" onClick={() => handleCopyKey(key.key_prefix)} className="h-8 w-8 p-0 hover:bg-white/10 text-white/60 hover:text-white">
                                                            <Copy className="w-3.5 h-3.5" />
                                                        </Button>
                                                        <Button size="sm" variant="ghost" onClick={() => handleRevokeKey(key.id, key.key_prefix)} className="h-8 w-8 p-0 hover:bg-red-500/20 text-white/60 hover:text-red-400">
                                                            <Trash2 className="w-3.5 h-3.5" />
                                                        </Button>
                                                    </div>
                                                )}
                                            </motion.div>
                                        ))}
                                    </div>
                                )}
                            </SpotlightCard>
                        </motion.div>
                    )}

                    {activeTab === 'billing' && (
                        <motion.div key="billing" className="grid gap-6" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} transition={{ duration: 0.2 }}>
                            
                            {/* Usage Stats (Only shown if plan exists) */}
                            {usage && (
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                                     <SpotlightCard className="bg-[#0a0a0f]/50 border-white/5 p-5">
                                        <div className="flex items-center justify-between mb-4">
                                            <p className="text-sm font-medium text-white/60">API Calls (Daily)</p>
                                            <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400"><Zap className="w-4 h-4"/></div>
                                        </div>
                                        <p className="text-2xl font-bold text-white mb-2">{usage.api_calls_today}</p>
                                        <UsageBar label="Limit" used={usage.api_calls_today} limit={usage.api_calls_limit_daily} />
                                     </SpotlightCard>
                                     <SpotlightCard className="bg-[#0a0a0f]/50 border-white/5 p-5">
                                        <div className="flex items-center justify-between mb-4">
                                            <p className="text-sm font-medium text-white/60">AI Messages (Mo.)</p>
                                            <div className="p-2 rounded-lg bg-violet-500/10 text-violet-400"><RotateCw className="w-4 h-4"/></div>
                                        </div>
                                        <p className="text-2xl font-bold text-white mb-2">{usage.ai_messages_this_month}</p>
                                        <UsageBar label="Limit" used={usage.ai_messages_this_month} limit={usage.ai_messages_limit} />
                                     </SpotlightCard>
                                     <SpotlightCard className="bg-[#0a0a0f]/50 border-white/5 p-5">
                                        <div className="flex items-center justify-between mb-4">
                                            <p className="text-sm font-medium text-white/60">Active Clients</p>
                                            <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400"><User className="w-4 h-4"/></div>
                                        </div>
                                        <p className="text-2xl font-bold text-white mb-2">{usage.clients_count}</p>
                                        <UsageBar label="Limit" used={usage.clients_count} limit={usage.clients_limit} />
                                     </SpotlightCard>
                                     <SpotlightCard className="bg-[#0a0a0f]/50 border-white/5 p-5">
                                        <div className="flex items-center justify-between mb-4">
                                            <p className="text-sm font-medium text-white/60">Max API Keys</p>
                                            <div className="p-2 rounded-lg bg-amber-500/10 text-amber-400"><Key className="w-4 h-4"/></div>
                                        </div>
                                        <p className="text-2xl font-bold text-white mb-2">{usage.api_keys_count}</p>
                                        <UsageBar label="Limit" used={usage.api_keys_count} limit={usage.api_keys_limit} />
                                     </SpotlightCard>
                                </div>
                            )}

                            {/* Current Plan + Subscription Status */}
                            <SpotlightCard className="bg-[#0a0a0f]/50 border-white/5 overflow-hidden">
                                <div className="absolute inset-0 bg-gradient-to-br from-violet-600/5 to-blue-600/5 pointer-events-none" />
                                <div className="border-b border-white/5 pb-5 mb-6 relative">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-4">
                                            <SectionIcon icon={CreditCard} gradient="from-violet-500/20 to-blue-500/20 border border-violet-500/20 text-violet-400" />
                                            <div>
                                                <h2 className="text-lg font-bold text-white tracking-tight">Subscription Plan</h2>
                                                <p className="text-sm text-white/40">Manage your billing cycle and upgrades.</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className="px-3 py-1.5 rounded-lg text-xs font-bold bg-white/10 text-white uppercase tracking-wider border border-white/10">
                                                {subscription?.plan?.name || user?.subscription_tier || 'Free'}
                                            </span>
                                            {subscription?.status === 'active' && (
                                                <span className="px-2.5 py-1.5 rounded-lg text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 uppercase tracking-wider">
                                                    Active
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                                
                                <div className="relative z-10">
                                    {/* Active subscription details */}
                                    {subscription && (
                                        <div className="mb-8 p-4 rounded-xl bg-white/[0.03] border border-white/5 flex flex-col sm:flex-row items-center justify-between gap-4">
                                            <div>
                                                <p className="text-sm text-white/80">
                                                    You are currently on the <span className="font-bold text-white">{subscription.plan.name}</span> plan.
                                                    {subscription.current_period_end && (
                                                        <span className="block text-white/40 mt-1">Renews on {new Date(subscription.current_period_end).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</span>
                                                    )}
                                                </p>
                                            </div>
                                            {subscription.payment_gateway === 'stripe' && (
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={handleManageBilling}
                                                    className="border-white/10 bg-white/5 hover:bg-white/10 text-white"
                                                >
                                                    <ExternalLink className="w-3.5 h-3.5 mr-2" />
                                                    Billing Portal
                                                </Button>
                                            )}
                                        </div>
                                    )}

                                    {/* Billing Cycle Toggle */}
                                    <div className="flex justify-center mb-8">
                                        <div className="p-1 rounded-xl bg-black/40 border border-white/5 inline-flex relative">
                                            <div
                                                className={`absolute inset-y-1 w-[calc(50%-4px)] bg-white/10 border border-white/10 rounded-lg shadow-sm transition-all duration-300 ${
                                                    billingCycle === 'monthly' ? 'left-1' : 'left-[calc(50%+2px)]'
                                                }`}
                                            />
                                            <button
                                                onClick={() => setBillingCycle('monthly')}
                                                className={`relative z-10 px-6 py-2 text-sm font-medium transition-colors ${billingCycle === 'monthly' ? 'text-white' : 'text-white/40 hover:text-white/70'}`}
                                            >
                                                Monthly
                                            </button>
                                            <button
                                                onClick={() => setBillingCycle('yearly')}
                                                className={`relative z-10 px-6 py-2 text-sm font-medium transition-colors ${billingCycle === 'yearly' ? 'text-white' : 'text-white/40 hover:text-white/70'} flex items-center gap-2`}
                                            >
                                                Yearly
                                                <span className="text-[9px] font-bold bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded border border-emerald-500/20 uppercase">Save 20%</span>
                                            </button>
                                        </div>
                                    </div>

                                    {/* Plan Cards */}
                                    {isPlansLoading ? (
                                        <div className="flex items-center justify-center py-12">
                                            <Loader2 className="w-8 h-8 animate-spin text-violet-400" />
                                        </div>
                                    ) : plans.length > 0 ? (
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                            {plans.map((plan) => {
                                                const isCurrent = subscription?.plan?.id === plan.id || (!subscription && plan.slug === 'free');
                                                const isRecommended = plan.tier_level === 2;
                                                const price = billingCycle === 'monthly' ? plan.price_monthly : plan.price_yearly;
                                                
                                                return (
                                                    <div key={plan.id} className={`relative p-6 rounded-2xl border transition-all duration-300 group flex flex-col ${
                                                        isCurrent 
                                                            ? 'bg-gradient-to-br from-violet-600/10 to-blue-600/10 border-violet-500/30' 
                                                            : 'bg-white/[0.02] border-white/5 hover:border-white/10 hover:bg-white/[0.04]'
                                                    }`}>
                                                        {isRecommended && (
                                                            <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full text-[10px] font-bold bg-gradient-to-r from-violet-600 to-blue-600 text-white border border-white/10 shadow-lg shadow-violet-500/20 uppercase tracking-widest">
                                                                Most Popular
                                                            </div>
                                                        )}
                                                        
                                                        <div className="mb-4">
                                                            <h3 className="text-lg font-bold text-white mb-1">{plan.name}</h3>
                                                            <div className="flex items-baseline gap-1">
                                                                <span className="text-3xl font-bold text-white tracking-tight">{formatPrice(price, plan.currency)}</span>
                                                                {price > 0 && <span className="text-sm text-white/40 font-medium">/{billingCycle === 'monthly' ? 'mo' : 'yr'}</span>}
                                                            </div>
                                                        </div>

                                                        <ul className="space-y-3 mb-8 flex-1">
                                                            {getPlanFeatures(plan).map((feature, i) => (
                                                                <li key={i} className="flex items-start gap-3 text-sm text-white/60">
                                                                    <div className="mt-0.5 p-0.5 rounded-full bg-emerald-500/20 text-emerald-400 flex-shrink-0">
                                                                        <Check className="w-2.5 h-2.5" />
                                                                    </div>
                                                                    <span className="leading-tight">{feature}</span>
                                                                </li>
                                                            ))}
                                                        </ul>

                                                        <Button
                                                            onClick={isCurrent ? undefined : () => handleUpgradeClick(plan.id)}
                                                            disabled={isCurrent}
                                                            className={`w-full ${
                                                                isCurrent
                                                                    ? 'bg-white/5 text-white/40 cursor-default border border-white/5'
                                                                    : 'bg-white/10 hover:bg-white/20 text-white border border-white/10 hover:border-white/20'
                                                            }`}
                                                        >
                                                            {isCurrent ? 'Current Plan' : 'Upgrade'}
                                                        </Button>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    ) : (
                                        <div className="text-center py-12 text-white/40">No plans available.</div>
                                    )}
                                </div>
                            </SpotlightCard>
                        </motion.div>
                    )}

                    {/* AI Keys (BYOK) Tab */}
                    {activeTab === 'ai-keys' && (
                        <motion.div key="ai-keys" className="grid gap-6" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} transition={{ duration: 0.2 }}>
                            <SpotlightCard className="p-6 bg-background/50 border-white/5" spotlightColor="rgba(139, 92, 246, 0.08)">
                                <div className="flex items-center gap-3 mb-2">
                                    <SectionIcon icon={Bot} gradient="from-violet-500/30 to-purple-600/30" />
                                    <div>
                                        <h2 className="text-xl font-bold text-white">AI Keys (BYOK)</h2>
                                        <p className="text-white/40 text-sm">Bring your own API keys — Claude, OpenAI, Gemini, DeepSeek, Groq & more</p>
                                    </div>
                                </div>
                            </SpotlightCard>

                            {isAiKeysLoading ? (
                                <div className="flex items-center justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-violet-400" /></div>
                            ) : (
                                <div className="grid gap-4">
                                    {aiProviders.map(provider => {
                                        const existingKey = aiKeys.find(k => k.provider === provider.id && k.is_active);
                                        const isAdding = addingProvider === provider.id;
                                        const providerColors: Record<string, string> = {
                                            claude: 'from-orange-500/20 to-amber-600/20 border-orange-500/20',
                                            openai: 'from-emerald-500/20 to-green-600/20 border-emerald-500/20',
                                            gemini: 'from-blue-500/20 to-cyan-600/20 border-blue-500/20',
                                            deepseek: 'from-sky-500/20 to-indigo-600/20 border-sky-500/20',
                                            groq: 'from-rose-500/20 to-pink-600/20 border-rose-500/20',
                                            perplexity: 'from-teal-500/20 to-cyan-600/20 border-teal-500/20',
                                            mistral: 'from-amber-500/20 to-yellow-600/20 border-amber-500/20',
                                            xai: 'from-slate-500/20 to-zinc-600/20 border-slate-500/20',
                                        };
                                        const iconColors: Record<string, string> = {
                                            claude: 'text-orange-400',
                                            openai: 'text-emerald-400',
                                            gemini: 'text-blue-400',
                                            deepseek: 'text-sky-400',
                                            groq: 'text-rose-400',
                                            perplexity: 'text-teal-400',
                                            mistral: 'text-amber-400',
                                            xai: 'text-slate-300',
                                        };

                                        return (
                                            <SpotlightCard key={provider.id} className={`p-5 bg-background/50 border-white/5`} spotlightColor="rgba(255,255,255,0.03)">
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center gap-3">
                                                        <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${providerColors[provider.id] || 'from-gray-500/20 to-gray-600/20'} border flex items-center justify-center`}>
                                                            <AIProviderIcon provider={provider.id} size={20} className={iconColors[provider.id] || 'text-white/70'} />
                                                        </div>
                                                        <div>
                                                            <h3 className="text-white font-semibold text-sm">{provider.name}</h3>
                                                            {existingKey ? (
                                                                <div className="flex items-center gap-2 mt-0.5">
                                                                    <code className="text-xs text-white/40 font-mono">{existingKey.key_masked}</code>
                                                                    {existingKey.is_valid === true && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />}
                                                                    {existingKey.is_valid === false && <XCircle className="w-3.5 h-3.5 text-red-400" />}
                                                                    {existingKey.is_valid === null && <HelpCircle className="w-3.5 h-3.5 text-white/30" />}
                                                                </div>
                                                            ) : (
                                                                <p className="text-xs text-white/30 mt-0.5">No key configured</p>
                                                            )}
                                                        </div>
                                                    </div>

                                                    <div className="flex items-center gap-2">
                                                        {existingKey ? (
                                                            <>
                                                                <Button
                                                                    size="sm"
                                                                    variant="ghost"
                                                                    className="text-white/40 hover:text-white h-8 px-3"
                                                                    onClick={() => handleValidateAiKey(existingKey.id)}
                                                                    disabled={validatingKeyId === existingKey.id}
                                                                >
                                                                    {validatingKeyId === existingKey.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
                                                                    <span className="ml-1 text-xs">Test</span>
                                                                </Button>
                                                                <Button
                                                                    size="sm"
                                                                    variant="ghost"
                                                                    className="text-white/40 hover:text-red-400 h-8 px-3"
                                                                    onClick={() => handleDeleteAiKey(existingKey.id, provider.name)}
                                                                >
                                                                    <Trash2 className="w-3.5 h-3.5" />
                                                                </Button>
                                                                <Button
                                                                    size="sm"
                                                                    variant="ghost"
                                                                    className="text-white/40 hover:text-violet-400 h-8 px-3"
                                                                    onClick={() => { setAddingProvider(provider.id); setNewAiKeyValue(''); }}
                                                                >
                                                                    <RotateCw className="w-3.5 h-3.5" />
                                                                    <span className="ml-1 text-xs">Replace</span>
                                                                </Button>
                                                            </>
                                                        ) : (
                                                            <Button
                                                                size="sm"
                                                                className="bg-white/5 hover:bg-white/10 text-white/70 border border-white/10 h-8"
                                                                onClick={() => { setAddingProvider(provider.id); setNewAiKeyValue(''); }}
                                                            >
                                                                <Plus className="w-3.5 h-3.5 mr-1" /> Add Key
                                                            </Button>
                                                        )}
                                                    </div>
                                                </div>

                                                {/* Inline Key Input */}
                                                <AnimatePresence>
                                                    {isAdding && (
                                                        <motion.div
                                                            initial={{ height: 0, opacity: 0 }}
                                                            animate={{ height: 'auto', opacity: 1 }}
                                                            exit={{ height: 0, opacity: 0 }}
                                                            className="overflow-hidden"
                                                        >
                                                            <div className="mt-4 pt-4 border-t border-white/5 flex gap-2">
                                                                <Input
                                                                    type="password"
                                                                    placeholder={provider.placeholder}
                                                                    value={newAiKeyValue}
                                                                    onChange={e => setNewAiKeyValue(e.target.value)}
                                                                    className={`${inputClass} flex-1 font-mono text-sm`}
                                                                />
                                                                <Button
                                                                    onClick={() => handleAddAiKey(provider.id)}
                                                                    disabled={isAddingAiKey || !newAiKeyValue.trim()}
                                                                    className={gradientBtn + ' h-10 px-4'}
                                                                >
                                                                    {isAddingAiKey ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                                                </Button>
                                                                <Button
                                                                    variant="ghost"
                                                                    onClick={() => setAddingProvider(null)}
                                                                    className="h-10 px-3 text-white/40 hover:text-white"
                                                                >
                                                                    <XIcon className="w-4 h-4" />
                                                                </Button>
                                                            </div>
                                                            <a href={provider.docs_url} target="_blank" rel="noreferrer" className="text-xs text-violet-400/70 hover:text-violet-400 mt-2 inline-flex items-center gap-1">
                                                                Get your API key <ExternalLink className="w-3 h-3" />
                                                            </a>
                                                        </motion.div>
                                                    )}
                                                </AnimatePresence>
                                            </SpotlightCard>
                                        );
                                    })}
                                </div>
                            )}

                            {/* Info Note */}
                            <div className="p-4 rounded-xl bg-violet-500/5 border border-violet-500/10">
                                <p className="text-sm text-white/50">
                                    <span className="text-violet-400 font-medium">💡 How BYOK works:</span> Your keys are encrypted at rest. When you send a message, Voxly uses your key instead of the platform key. You pay your own API provider directly — no markup.
                                </p>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
                </div>
            </motion.div>

            {/* Payment Gateway Picker Dialog */}
            {showGatewayPicker && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
                    <motion.div 
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="w-full max-w-md bg-[#0a0a0f] border border-white/10 rounded-2xl p-6 shadow-2xl relative"
                    >
                        <h3 className="text-xl font-bold text-white mb-2">Select Payment Method</h3>
                        <p className="text-white/50 mb-6 text-sm">Choose how you want to pay. Secure encryption provided.</p>
                        
                        <div className="space-y-3">
                            <button
                                onClick={() => handleCheckout('stripe')}
                                disabled={isCheckingOut}
                                className="w-full flex items-center justify-between p-4 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 transition-all group"
                            >
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-lg bg-[#635BFF] flex items-center justify-center text-white font-bold text-lg">S</div>
                                    <div className="text-left">
                                        <p className="font-medium text-white group-hover:text-[#635BFF] transition-colors">Stripe</p>
                                        <p className="text-xs text-white/40">International Cards (Visa, Mastercard)</p>
                                    </div>
                                </div>
                                <ArrowRight className="w-4 h-4 text-white/20 group-hover:text-white" />
                            </button>

                            <button
                                onClick={() => handleCheckout('razorpay')}
                                disabled={isCheckingOut}
                                className="w-full flex items-center justify-between p-4 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 transition-all group"
                            >
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-lg bg-[#3395FF] flex items-center justify-center text-white font-bold text-lg">R</div>
                                    <div className="text-left">
                                        <p className="font-medium text-white group-hover:text-[#3395FF] transition-colors">Razorpay</p>
                                        <p className="text-xs text-white/40">UPI, Netbanking, Rupay</p>
                                    </div>
                                </div>
                                <ArrowRight className="w-4 h-4 text-white/20 group-hover:text-white" />
                            </button>
                        </div>
                        
                        <Button 
                            variant="ghost" 
                            onClick={() => setShowGatewayPicker(false)}
                            className="w-full mt-4 text-white/40 hover:text-white"
                        >
                            Cancel
                        </Button>
                    </motion.div>
                </div>
            )}
        </DashboardLayout>
    );
}
