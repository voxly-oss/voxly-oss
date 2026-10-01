'use client';

import { Building2, KeyRound, Users } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { getInitials } from '@/lib/utils';
import SettingsShell from '@/components/SettingsShell';
import ComingSoon from '@/components/ComingSoon';
import { StatusPill } from '@/components/SettingsRow';

// Was six invented members with example.com addresses, job titles and a fake
// 7/10 seat meter. Workspaces are single-user — the owner row below is the
// only real member, so it's the only one shown.
export default function TeamMembersSettingsPage() {
    const { user } = useAuth();
    const name = user?.full_name || user?.email || 'You';

    return (
        <SettingsShell breadcrumb={{ group: 'Workspace', page: 'Team Members' }}>
            <ComingSoon
                icon={Users}
                title="Team Members"
                subtitle="Who can work in this workspace"
                headline="Inviting your team is coming soon"
                description="Workspaces are single-user today. Invitations, seats and per-member access need a membership API that doesn’t exist yet — until then, the owner is the only member."
                planned={[
                    'Invite teammates by email',
                    'Assign PMs to clients and projects',
                    'Per-seat billing',
                    'See who replied to which client',
                ]}
                today={[
                    { href: '/settings/organization', label: 'Organization', description: 'Workspace name and connected integrations.', icon: Building2 },
                    { href: '/settings/api-keys', label: 'API keys', description: 'Give tools programmatic access without sharing your login.', icon: KeyRound },
                ]}
            >
                <section className="border border-border rounded-[14px] bg-card overflow-hidden">
                    <div className="px-5 py-3 border-b border-border font-mono text-[10px] font-bold uppercase tracking-[0.07em] text-voxly-ink-5">
                        Members · 1
                    </div>
                    <div className="flex items-center gap-3 px-5 py-3.5">
                        <div className="w-8 h-8 rounded-lg bg-voxly-surface-3 flex items-center justify-center flex-none font-display font-bold text-[11px] text-voxly-ink-6">
                            {getInitials(name)}
                        </div>
                        <div className="min-w-0 flex-1">
                            <div className="text-[13px] font-semibold text-foreground truncate">
                                {name} <span className="text-voxly-ink-5 font-normal">(you)</span>
                            </div>
                            {user?.email && <div className="text-[11.5px] text-voxly-ink-5 truncate">{user.email}</div>}
                        </div>
                        <StatusPill tone="success">Owner</StatusPill>
                    </div>
                </section>
            </ComingSoon>
        </SettingsShell>
    );
}
