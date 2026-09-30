'use client';

import { KeyRound, Shield, ShieldCheck, Users } from 'lucide-react';
import SettingsShell from '@/components/SettingsShell';
import ComingSoon from '@/components/ComingSoon';

// Was a 4-role × 10-permission matrix presented as configured policy; nothing
// in it was enforced. With one owner per workspace there is nothing to
// restrict yet — roles arrive with team members.
export default function RolesSettingsPage() {
    return (
        <SettingsShell breadcrumb={{ group: 'Workspace', page: 'Roles & Permissions' }}>
            <ComingSoon
                icon={Shield}
                title="Roles & Permissions"
                subtitle="Control what each member can see and change"
                headline="Roles arrive with team members"
                description="Every workspace has a single owner today, with full access to clients, projects, billing and keys. Roles and permissions will ship alongside team invitations."
                planned={[
                    'Owner, Admin, PM and Member roles',
                    'Per-permission control — billing, keys, clients',
                    'Custom roles',
                    'Audit log of permission changes',
                ]}
                today={[
                    { href: '/settings/team-members', label: 'Team members', description: 'You’re the owner of this workspace.', icon: Users },
                    { href: '/settings/security', label: 'Security', description: 'Password, webhook signing and what’s protected today.', icon: ShieldCheck },
                    { href: '/settings/api-keys', label: 'API keys', description: 'Programmatic access that you can revoke at any time.', icon: KeyRound },
                ]}
            />
        </SettingsShell>
    );
}
