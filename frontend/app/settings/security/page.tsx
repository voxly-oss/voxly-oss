'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useToast } from '@/hooks/use-toast';
import { authAPI } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';
import SettingsShell from '@/components/SettingsShell';
import { SettingsRow, Toggle, ValueButton } from '@/components/SettingsRow';
import { Panel, PanelRow, PanelText } from '@/components/SidePanel';

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

// SSO / 2FA-enforcement / webhook-signing / IP-allowlist policy rows have no
// backend endpoint yet (single-account app, no workspace-level security
// policy model) — local-only, not persisted.
export default function SecuritySettingsPage() {
    const { toast } = useToast();
    const [enforce2FA, setEnforce2FA] = useState(true);
    const [requireAll2FA, setRequireAll2FA] = useState(false);
    const [webhookSigning, setWebhookSigning] = useState(true);
    const [ipAllowlist, setIpAllowlist] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    const { register, handleSubmit, formState: { errors }, reset } = useForm<PasswordFormData>({ resolver: zodResolver(passwordSchema) });

    const onSubmit = async (data: PasswordFormData) => {
        setIsSaving(true);
        try {
            await authAPI.changePassword({ current_password: data.current_password, new_password: data.new_password });
            toast({ title: 'Password changed', description: 'Your password has been changed successfully.' });
            reset();
        } catch (err: any) {
            const detail = err.response?.data?.detail;
            toast({ title: 'Error', description: typeof detail === 'string' ? detail : 'Failed to change password.', variant: 'destructive' });
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <SettingsShell breadcrumb={{ group: 'Advanced', page: 'Security' }}>
            <div className="flex flex-col xl:flex-row gap-6 items-start">
                <div className="flex-1 min-w-0 w-full flex flex-col gap-[18px]">
                    <div>
                        <h1 className="font-display font-bold text-[22px] text-foreground tracking-[-0.01em]">Security</h1>
                        <p className="text-[13px] text-voxly-ink-6 mt-[3px]">Access control and data protection for the workspace</p>
                    </div>

                    <div className="border border-border rounded-[14px] bg-card overflow-hidden">
                        <SettingsRow label="Single sign-on (SSO)" description="Not available yet — Google and GitHub OAuth are supported for personal login today.">
                            <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold rounded-full pl-1.5 pr-2 py-[3px] bg-voxly-surface-3 text-voxly-ink-6">
                                <span className="w-[5px] h-[5px] rounded-full bg-voxly-ink-5" />Not available
                            </span>
                        </SettingsRow>
                        <SettingsRow label="Enforce 2FA for Owner & Admin" description="Not available yet — this account has no 2FA/TOTP support.">
                            <Toggle checked={enforce2FA} onChange={setEnforce2FA} disabled />
                        </SettingsRow>
                        <SettingsRow label="Require 2FA for all members">
                            <Toggle checked={requireAll2FA} onChange={setRequireAll2FA} disabled />
                        </SettingsRow>
                        <SettingsRow label="Webhook signing" description="Incoming GitHub and Twilio webhooks are signature-verified.">
                            <Toggle checked={webhookSigning} onChange={setWebhookSigning} disabled />
                        </SettingsRow>
                        <SettingsRow label="API key rotation reminder">
                            <ValueButton>90 days</ValueButton>
                        </SettingsRow>
                        <SettingsRow label="IP allowlist" description="Not available yet — restrict API and dashboard access to approved IP ranges.">
                            <Toggle checked={ipAllowlist} onChange={setIpAllowlist} disabled />
                        </SettingsRow>
                    </div>

                    {/* Real, working password change — kept here since the design has no
                        dedicated spot for personal-account security in the new IA. */}
                    <div>
                        <h2 className="font-display font-semibold text-[15px] text-foreground">Account Password</h2>
                    </div>
                    <form onSubmit={handleSubmit(onSubmit)} className="border border-border rounded-[14px] bg-card p-[18px] flex flex-col gap-4 max-w-md">
                        <div className="space-y-1.5">
                            <Label htmlFor="current_password" className="text-voxly-ink-6 text-xs">Current password</Label>
                            <Input id="current_password" type="password" {...register('current_password')} className="bg-background border-voxly-ink-4" />
                            {errors.current_password && <p className="text-xs text-voxly-heat">{errors.current_password.message}</p>}
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="new_password" className="text-voxly-ink-6 text-xs">New password</Label>
                            <Input id="new_password" type="password" {...register('new_password')} className="bg-background border-voxly-ink-4" />
                            {errors.new_password && <p className="text-xs text-voxly-heat">{errors.new_password.message}</p>}
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="confirm_password" className="text-voxly-ink-6 text-xs">Confirm new password</Label>
                            <Input id="confirm_password" type="password" {...register('confirm_password')} className="bg-background border-voxly-ink-4" />
                            {errors.confirm_password && <p className="text-xs text-voxly-heat">{errors.confirm_password.message}</p>}
                        </div>
                        <Button type="submit" disabled={isSaving} className="bg-secondary hover:bg-accent text-foreground border border-border">
                            {isSaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                            Update password
                        </Button>
                    </form>
                </div>

                <div className="w-full xl:w-80 flex-none flex flex-col gap-3.5">
                    <Panel title="Compliance">
                        <PanelRow dot="bg-voxly-success" label="Data in transit" value="TLS encrypted" />
                        <PanelRow dot="bg-voxly-success" label="BYOK keys at rest" value="Encrypted" />
                    </Panel>
                    <Panel title="Recent Changes">
                        <PanelText>No recent changes.</PanelText>
                    </Panel>
                    <Panel title="Need Help?" defaultOpen={false}>
                        <PanelText>
                            <a href="#">Settings documentation →</a><br /><a href="#">Contact support →</a>
                        </PanelText>
                    </Panel>
                </div>
            </div>
        </SettingsShell>
    );
}
