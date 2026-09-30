'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useToast } from '@/hooks/use-toast';
import { authAPI, getApiErrorMessage } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';
import SettingsShell from '@/components/SettingsShell';
import { SettingsRow, StatusPill } from '@/components/SettingsRow';
import { HelpLinks, Panel, PanelRow, PanelText } from '@/components/SidePanel';
import FieldError from '@/components/FieldError';

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

// SSO / 2FA / IP-allowlist / rotation-reminder policies have no backend model
// yet (single-account app). They used to render as disabled toggles — one of
// them *checked*, reading as "2FA enforced" — so they now state their real
// status. Webhook signing is genuinely on (GitHub + Twilio HMAC verification).
export default function SecuritySettingsPage() {
    const { toast } = useToast();
    const [isSaving, setIsSaving] = useState(false);

    const { register, handleSubmit, formState: { errors }, reset } = useForm<PasswordFormData>({ resolver: zodResolver(passwordSchema) });

    const onSubmit = async (data: PasswordFormData) => {
        setIsSaving(true);
        try {
            await authAPI.changePassword({ current_password: data.current_password, new_password: data.new_password });
            toast({ title: 'Password changed', description: 'Your password has been changed successfully.' });
            reset();
        } catch (err) {
            toast({ title: 'Couldn’t change password', description: getApiErrorMessage(err, 'Please try again.'), variant: 'destructive' });
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
                        <SettingsRow label="Webhook signing" description="Incoming GitHub and Twilio webhooks are signature-verified.">
                            <StatusPill tone="success">Enabled</StatusPill>
                        </SettingsRow>
                        <SettingsRow label="Single sign-on (SSO)" description="Google and GitHub OAuth are supported for personal login today.">
                            <StatusPill />
                        </SettingsRow>
                        <SettingsRow label="Two-factor authentication (2FA)" description="TOTP 2FA and team-wide enforcement.">
                            <StatusPill />
                        </SettingsRow>
                        <SettingsRow label="API key rotation reminder">
                            <StatusPill />
                        </SettingsRow>
                        <SettingsRow label="IP allowlist" description="Restrict API and dashboard access to approved IP ranges.">
                            <StatusPill />
                        </SettingsRow>
                    </div>

                    {/* Real, working password change — kept here since the design has no
                        dedicated spot for personal-account security in the new IA. */}
                    <div>
                        <h2 className="font-display font-semibold text-[15px] text-foreground">Account Password</h2>
                    </div>
                    <form onSubmit={handleSubmit(onSubmit)} className="border border-border rounded-[14px] bg-card p-[18px] flex flex-col gap-4 max-w-md" noValidate>
                        <div className="space-y-1.5">
                            <Label htmlFor="current_password" className="text-voxly-ink-6 text-xs">Current password</Label>
                            <Input id="current_password" type="password" autoComplete="current-password" aria-invalid={!!errors.current_password} aria-describedby={errors.current_password ? 'current_password-error' : undefined} {...register('current_password')} />
                            <FieldError id="current_password-error" message={errors.current_password?.message} />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="new_password" className="text-voxly-ink-6 text-xs">New password</Label>
                            <Input id="new_password" type="password" autoComplete="new-password" aria-invalid={!!errors.new_password} aria-describedby={errors.new_password ? 'new_password-error' : 'new_password-hint'} {...register('new_password')} />
                            {errors.new_password ? (
                                <FieldError id="new_password-error" message={errors.new_password.message} />
                            ) : (
                                <p id="new_password-hint" className="text-[11.5px] text-voxly-ink-5">At least 8 characters, with an uppercase letter, a lowercase letter and a digit.</p>
                            )}
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="confirm_password" className="text-voxly-ink-6 text-xs">Confirm new password</Label>
                            <Input id="confirm_password" type="password" autoComplete="new-password" aria-invalid={!!errors.confirm_password} aria-describedby={errors.confirm_password ? 'confirm_password-error' : undefined} {...register('confirm_password')} />
                            <FieldError id="confirm_password-error" message={errors.confirm_password?.message} />
                        </div>
                        <Button type="submit" variant="outline" disabled={isSaving} className="font-semibold">
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
                        <HelpLinks />
                    </Panel>
                </div>
            </div>
        </SettingsShell>
    );
}
