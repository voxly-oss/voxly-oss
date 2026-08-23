'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { authAPI } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Loader2, Save } from 'lucide-react';
import SettingsShell from '@/components/SettingsShell';
import { SettingsRow, ValueButton, StaticValue } from '@/components/SettingsRow';
import { Panel, PanelRow, PanelLink, PanelText } from '@/components/SidePanel';
import { useState } from 'react';

const profileSchema = z.object({
    full_name: z.string().min(1, 'Full name is required'),
    agency_name: z.string().min(1, 'Workspace name is required'),
});
type ProfileFormData = z.infer<typeof profileSchema>;

export default function GeneralSettingsPage() {
    const { user, refreshUser } = useAuth();
    const { toast } = useToast();
    const [isSaving, setIsSaving] = useState(false);

    const { register, handleSubmit, formState: { errors, isDirty } } = useForm<ProfileFormData>({
        resolver: zodResolver(profileSchema),
        defaultValues: {
            full_name: user?.full_name ?? '',
            agency_name: user?.agency_name ?? '',
        },
    });

    const onSubmit = async (data: ProfileFormData) => {
        setIsSaving(true);
        try {
            await authAPI.updateProfile({ full_name: data.full_name, agency_name: data.agency_name });
            await refreshUser();
            toast({ title: 'Saved', description: 'Your workspace settings have been updated.' });
        } catch (err: any) {
            toast({ title: 'Error', description: err.response?.data?.detail || 'Failed to save changes.', variant: 'destructive' });
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <SettingsShell breadcrumb={{ group: 'Application', page: 'General' }}>
            <div className="flex flex-col xl:flex-row gap-6 items-start">
                <div className="flex-1 min-w-0 w-full flex flex-col gap-[18px]">
                    <div>
                        <h1 className="font-display font-bold text-[22px] text-foreground tracking-[-0.01em]">General</h1>
                        <p className="text-[13px] text-voxly-ink-6 mt-[3px]">Workspace identity and locale defaults</p>
                    </div>

                    <form onSubmit={handleSubmit(onSubmit)}>
                        <div className="border border-border rounded-[14px] bg-card overflow-hidden">
                            <SettingsRow label="Workspace name" description="Shown to clients in AI replies and on invoices.">
                                <input
                                    {...register('agency_name')}
                                    className="text-[13px] text-foreground bg-background border border-voxly-ink-4 rounded-lg px-3 py-2 min-w-[180px] text-right focus:outline-none focus:border-primary transition-colors"
                                />
                                {errors.agency_name && <p className="text-[11px] text-voxly-heat mt-1 text-right">{errors.agency_name.message}</p>}
                            </SettingsRow>
                            <SettingsRow label="Full name">
                                <input
                                    {...register('full_name')}
                                    className="text-[13px] text-foreground bg-background border border-voxly-ink-4 rounded-lg px-3 py-2 min-w-[180px] text-right focus:outline-none focus:border-primary transition-colors"
                                />
                                {errors.full_name && <p className="text-[11px] text-voxly-heat mt-1 text-right">{errors.full_name.message}</p>}
                            </SettingsRow>
                            <SettingsRow label="Email" description="Contact support to change your account email.">
                                <StaticValue>{user?.email}</StaticValue>
                            </SettingsRow>
                            {/* Locale preferences below have no backend field yet — display-only. */}
                            <SettingsRow label="Timezone" description="Used for schedules, digests, and timestamps.">
                                <ValueButton>America/New_York</ValueButton>
                            </SettingsRow>
                            <SettingsRow label="Date format">
                                <ValueButton>MM/DD/YYYY</ValueButton>
                            </SettingsRow>
                            <SettingsRow label="Language">
                                <ValueButton>English (US)</ValueButton>
                            </SettingsRow>
                        </div>
                        {isDirty && (
                            <div className="flex justify-end mt-3">
                                <Button type="submit" disabled={isSaving} className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-[13px] rounded-lg px-4 py-[9px] h-auto gap-2">
                                    {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                    Save changes
                                </Button>
                            </div>
                        )}
                    </form>
                </div>

                <div className="w-full xl:w-80 flex-none flex flex-col gap-3.5">
                    <Panel title="Quick Reference">
                        <PanelRow label="Workspace ID" value={<span className="font-mono font-normal">{user?.id?.slice(0, 8) ?? 'ws_—'}</span>} />
                        <PanelRow label="Created" value={user?.created_at ? new Date(user.created_at).toLocaleDateString(undefined, { month: 'short', year: 'numeric' }) : '—'} />
                    </Panel>
                    <Panel title="Recent Changes">
                        <PanelText>No recent changes.</PanelText>
                    </Panel>
                    <Panel title="Need Help?" defaultOpen={false}>
                        <PanelLink>Settings documentation →</PanelLink>
                        <PanelLink>Contact support →</PanelLink>
                    </Panel>
                </div>
            </div>
        </SettingsShell>
    );
}
