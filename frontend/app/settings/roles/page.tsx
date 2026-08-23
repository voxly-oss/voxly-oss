'use client';

import { Button } from '@/components/ui/button';
import { Plus, Check } from 'lucide-react';
import SettingsShell from '@/components/SettingsShell';
import { Panel, PanelRow, PanelText } from '@/components/SidePanel';
import { PreviewBanner } from '@/components/PreviewBadge';

// No role/permission model exists yet (single-account app) — this entire
// page is reference/illustrative content matching the design's 4 default
// roles, not a real configurable permission system.
const ROLES = [
    { name: 'Owner', members: 1, desc: 'Full control — billing, team, and every workspace setting.', perms: '10 of 10' },
    { name: 'Admin', members: 1, desc: 'Manages clients, projects, and the team. No billing access.', perms: '9 of 10' },
    { name: 'Project Manager', members: 2, desc: 'Runs assigned projects and client conversations day to day.', perms: '7 of 10' },
    { name: 'Member', members: 4, desc: 'Works within assigned projects only. No admin access.', perms: '4 of 10' },
];

type Cell = 'full' | 'edit' | 'view' | 'none';
const MATRIX: { permission: string; owner: Cell; admin: Cell; pm: Cell; member: Cell }[] = [
    { permission: 'Clients', owner: 'full', admin: 'full', pm: 'edit', member: 'view' },
    { permission: 'Projects', owner: 'full', admin: 'full', pm: 'edit', member: 'view' },
    { permission: 'AI Agent config', owner: 'full', admin: 'full', pm: 'view', member: 'none' },
    { permission: 'Conversations', owner: 'full', admin: 'full', pm: 'edit', member: 'view' },
    { permission: 'Channels', owner: 'full', admin: 'full', pm: 'view', member: 'none' },
    { permission: 'Analytics', owner: 'full', admin: 'full', pm: 'view', member: 'view' },
    { permission: 'Automations', owner: 'full', admin: 'edit', pm: 'view', member: 'none' },
    { permission: 'Team members', owner: 'full', admin: 'edit', pm: 'none', member: 'none' },
    { permission: 'Billing & plan', owner: 'full', admin: 'none', pm: 'none', member: 'none' },
    { permission: 'API keys', owner: 'full', admin: 'edit', pm: 'none', member: 'none' },
];

function Cell({ value }: { value: Cell }) {
    if (value === 'full') return <Check className="w-[15px] h-[15px] text-voxly-success" />;
    if (value === 'none') return <span className="text-voxly-ink-4">–</span>;
    return <span className="text-[11.5px] text-voxly-ink-6 capitalize">{value}</span>;
}

export default function RolesSettingsPage() {
    return (
        <SettingsShell breadcrumb={{ group: 'Workspace', page: 'Roles & Permissions' }}>
            <div className="flex flex-col xl:flex-row gap-6 items-start">
                <div className="flex-1 min-w-0 w-full flex flex-col gap-[18px]">
                    <div className="flex items-end justify-between gap-4 flex-wrap">
                        <div>
                            <h1 className="font-display font-bold text-[22px] text-foreground tracking-[-0.01em]">Roles &amp; Permissions</h1>
                            <p className="text-[13px] text-voxly-ink-6 mt-[3px]">{ROLES.length} roles · {ROLES.reduce((a, r) => a + r.members, 0)} members assigned</p>
                        </div>
                        <Button disabled title="Custom roles require a permissions backend" className="bg-primary/60 text-primary-foreground font-semibold text-[13px] rounded-lg px-4 py-[9px] h-auto gap-[7px] cursor-not-allowed">
                            <Plus className="w-[15px] h-[15px]" /> New role
                        </Button>
                    </div>

                    <PreviewBanner>
                        <b className="font-semibold">Preview.</b> This account has no role/permission backend yet (single-user). The roles and matrix below illustrate the intended default policy, not a configured, enforced system.
                    </PreviewBanner>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                        {ROLES.map(role => (
                            <div key={role.name} className="border border-border rounded-xl bg-card p-4 flex flex-col gap-2.5">
                                <div className="flex items-center justify-between">
                                    <span className="font-display font-bold text-[15px] text-foreground">{role.name}</span>
                                    <span className="text-[10px] bg-voxly-surface-3 text-voxly-ink-6 px-1.5 py-0.5 rounded-full whitespace-nowrap">{role.members} {role.members === 1 ? 'member' : 'members'}</span>
                                </div>
                                <p className="text-xs text-voxly-ink-6 leading-relaxed flex-1">{role.desc}</p>
                                <div className="text-[11px] text-voxly-ink-5 pt-2 border-t border-border">{role.perms} permissions</div>
                            </div>
                        ))}
                    </div>

                    <span className="font-display font-semibold text-[15px] text-foreground">Permission Matrix</span>
                    <div className="border border-border rounded-[14px] bg-card overflow-hidden">
                        <div className="overflow-x-auto">
                        <div className="min-w-[560px]">
                            <div className="grid grid-cols-[2.1fr_1fr_1fr_1fr_1fr] px-[18px] py-2.5 font-mono text-[10px] font-semibold tracking-[0.04em] uppercase text-voxly-ink-5 border-b border-border">
                                <div>Permission</div><div>Owner</div><div>Admin</div><div>PM</div><div>Member</div>
                            </div>
                            {MATRIX.map((row, i) => (
                                <div key={row.permission} className={`grid grid-cols-[2.1fr_1fr_1fr_1fr_1fr] px-[18px] py-3 items-center text-[13px] text-foreground ${i < MATRIX.length - 1 ? 'border-b border-border' : ''}`}>
                                    <div>{row.permission}</div>
                                    <div><Cell value={row.owner} /></div>
                                    <div><Cell value={row.admin} /></div>
                                    <div><Cell value={row.pm} /></div>
                                    <div><Cell value={row.member} /></div>
                                </div>
                            ))}
                        </div>
                        </div>
                    </div>
                    <p className="text-[11.5px] text-voxly-ink-5 leading-relaxed">
                        Check = full control. &quot;Edit&quot; = can create and modify but not delete or configure. &quot;View&quot; = read-only. &quot;–&quot; = no access.
                    </p>
                </div>

                <div className="w-full xl:w-80 flex-none flex flex-col gap-3.5">
                    <Panel title="Role Summary">
                        {ROLES.map(r => <PanelRow key={r.name} label={r.name} value={r.members} />)}
                        <PanelText><a href="/settings/team-members">View team members →</a></PanelText>
                    </Panel>
                    <Panel title="Custom Roles" defaultOpen={false} badge={<span className="text-[10.5px] bg-voxly-surface-3 text-voxly-ink-6 px-[7px] py-[1px] rounded-full">0</span>}>
                        <PanelText>No custom roles yet. Create one to grant a narrower or wider set of permissions than the 4 defaults.</PanelText>
                    </Panel>
                </div>
            </div>
        </SettingsShell>
    );
}
