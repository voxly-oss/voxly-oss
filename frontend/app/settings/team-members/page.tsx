'use client';

import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { getInitials } from '@/lib/utils';
import { Plus, MoreVertical } from 'lucide-react';
import SettingsShell from '@/components/SettingsShell';
import { Panel, PanelRow, PanelText } from '@/components/SidePanel';
import { PreviewBanner } from '@/components/PreviewBadge';

// No team/membership model exists yet — this account is single-user. The
// "Owner" row below is the real authenticated user; every other row is
// illustrative placeholder data matching the design, clearly not real people.
const MOCK_TEAMMATES = [
    { name: 'Priya Sharma', title: 'Head of Ops', email: 'priya@example.com', role: 'Admin', team: 'Leadership', status: 'Active', projects: 16, agents: 3, seen: '12m ago' },
    { name: 'Dev Anand', title: 'Senior PM', email: 'dev@example.com', role: 'PM', team: 'Delivery', status: 'Active', projects: 9, agents: 2, seen: '1h ago' },
    { name: 'Marcus Webb', title: 'Frontend Eng.', email: 'marcus@example.com', role: 'Member', team: 'Engineering', status: 'Active', projects: 5, agents: 1, seen: '25m ago' },
    { name: 'Sofia Chen', title: 'Full-stack Eng.', email: 'sofia@example.com', role: 'Member', team: 'Engineering', status: 'Active', projects: 6, agents: 1, seen: '5h ago' },
    { name: 'Lena Ferrer', title: 'Client Success Assoc.', email: 'lena@example.com', role: 'Member', team: 'Delivery', status: 'Suspended', projects: 3, agents: 0, seen: '14d ago' },
    { name: 'Maya Lin', title: 'Designer, invited', email: 'maya@example.com', role: 'Member', team: 'Engineering', status: 'Pending', projects: null, agents: null, seen: '2d ago' },
];

const STATUS_STYLE: Record<string, string> = {
    Active: 'bg-voxly-success-soft text-voxly-success',
    Suspended: 'bg-voxly-heat-soft text-voxly-heat',
    Pending: 'bg-voxly-warning-soft text-voxly-warning',
};

const GRID_COLS = 'grid grid-cols-[minmax(140px,2fr)_minmax(150px,2.2fr)_70px_90px_80px_60px_28px]';

export default function TeamMembersSettingsPage() {
    const { user } = useAuth();
    const activeCount = MOCK_TEAMMATES.filter(m => m.status === 'Active').length + 1;
    const pendingCount = MOCK_TEAMMATES.filter(m => m.status === 'Pending').length;
    const suspendedCount = MOCK_TEAMMATES.filter(m => m.status === 'Suspended').length;

    return (
        <SettingsShell breadcrumb={{ group: 'Workspace', page: 'Team Members' }}>
            <div className="flex flex-col xl:flex-row gap-6 items-start">
                <div className="flex-1 min-w-0 w-full flex flex-col gap-[18px]">
                    <div className="flex items-end justify-between gap-4 flex-wrap">
                        <div>
                            <h1 className="font-display font-bold text-[22px] text-foreground tracking-[-0.01em]">Team Members</h1>
                            <p className="text-[13px] text-voxly-ink-6 mt-[3px]">{MOCK_TEAMMATES.length + 1} members · {pendingCount} pending invitations</p>
                        </div>
                        <Button disabled title="Invites require a team backend" className="bg-primary/60 text-primary-foreground font-semibold text-[13px] rounded-lg px-4 py-[9px] h-auto gap-[7px] cursor-not-allowed">
                            <Plus className="w-[15px] h-[15px]" /> Invite member
                        </Button>
                    </div>

                    <PreviewBanner>
                        <b className="font-semibold">Preview.</b> This account has no team/membership backend yet. Only you (Owner, above) are real — every other row is illustrative of what team management will look like.
                    </PreviewBanner>

                    <div className="flex items-center gap-[22px] px-[18px] py-3.5 border border-border rounded-xl bg-card flex-wrap">
                        <div><span className="font-display font-bold text-[17px] text-foreground">{MOCK_TEAMMATES.length + 1}</span><span className="text-[11.5px] text-voxly-ink-5 ml-1.5">members</span></div>
                        <div className="w-px h-4 bg-border" />
                        <div><span className="font-display font-bold text-[17px] text-voxly-success">{activeCount}</span><span className="text-[11.5px] text-voxly-ink-5 ml-1.5">active</span></div>
                        <div className="w-px h-4 bg-border" />
                        <div><span className="font-display font-bold text-[17px] text-voxly-warning">{pendingCount}</span><span className="text-[11.5px] text-voxly-ink-5 ml-1.5">pending</span></div>
                        <div className="w-px h-4 bg-border" />
                        <div><span className="font-display font-bold text-[17px] text-voxly-heat">{suspendedCount}</span><span className="text-[11.5px] text-voxly-ink-5 ml-1.5">suspended</span></div>
                    </div>

                    <div className="border border-border rounded-[14px] bg-card overflow-hidden">
                        <div className="overflow-x-auto">
                        <div className="min-w-[720px]">
                            <div className={`${GRID_COLS} px-4 py-2.5 font-mono text-[10px] font-semibold tracking-[0.04em] uppercase text-voxly-ink-5 border-b border-border`}>
                                <div>Member</div><div>Email</div><div>Role</div><div>Team</div><div>Status</div><div>Seen</div><div />
                            </div>

                            {/* Real row — the authenticated user */}
                            <div className={`${GRID_COLS} px-4 py-3 items-center border-b border-border hover:bg-white/[0.02] transition-colors`}>
                                <div className="flex items-center gap-2 min-w-0">
                                    <div className="w-6 h-6 rounded-full bg-voxly-surface-3 flex items-center justify-center font-display font-bold text-[9.5px] text-voxly-ink-6 flex-none">{getInitials(user?.full_name || user?.email || 'U')}</div>
                                    <div className="min-w-0">
                                        <div className="text-[13px] font-semibold text-foreground truncate">{user?.full_name || 'You'}</div>
                                        <div className="text-[10.5px] text-voxly-ink-5 truncate">Founder</div>
                                    </div>
                                </div>
                                <div className="text-[11.5px] text-voxly-ink-6 truncate">{user?.email}</div>
                                <div className="text-[12px] text-foreground font-semibold">Owner</div>
                                <div className="text-[12px] text-voxly-ink-6">Leadership</div>
                                <div>
                                    <span className={`inline-flex items-center gap-1 text-[10.5px] font-semibold rounded-full pl-1.5 pr-2 py-[3px] whitespace-nowrap ${STATUS_STYLE.Active}`}>
                                        <span className="w-[5px] h-[5px] rounded-full bg-voxly-success" />Active
                                    </span>
                                </div>
                                <div className="text-[11px] text-voxly-ink-5">now</div>
                                <MoreVertical className="w-[15px] h-[15px] text-voxly-ink-5 flex-none" />
                            </div>

                            {MOCK_TEAMMATES.map(m => (
                                <div key={m.email} className={`${GRID_COLS} px-4 py-3 items-center border-b border-border last:border-b-0 hover:bg-white/[0.02] transition-colors ${m.status === 'Suspended' ? 'bg-voxly-heat-soft' : ''}`}>
                                    <div className="flex items-center gap-2 min-w-0">
                                        <div className="w-6 h-6 rounded-full bg-voxly-surface-3 flex items-center justify-center font-display font-bold text-[9.5px] text-voxly-ink-6 flex-none">{getInitials(m.name)}</div>
                                        <div className="min-w-0">
                                            <div className="text-[13px] font-semibold text-foreground truncate">{m.name}</div>
                                            <div className="text-[10.5px] text-voxly-ink-5 truncate">{m.title}</div>
                                        </div>
                                    </div>
                                    <div className="text-[11.5px] text-voxly-ink-6 truncate">{m.email}</div>
                                    <div className="text-[12px] text-foreground/90">{m.role}</div>
                                    <div className="text-[12px] text-voxly-ink-6 truncate">{m.team}</div>
                                    <div>
                                        <span className={`inline-flex items-center gap-1 text-[10.5px] font-semibold rounded-full pl-1.5 pr-2 py-[3px] whitespace-nowrap ${STATUS_STYLE[m.status]}`}>
                                            <span className={`w-[5px] h-[5px] rounded-full ${m.status === 'Active' ? 'bg-voxly-success' : m.status === 'Suspended' ? 'bg-voxly-heat' : 'bg-voxly-warning'}`} />{m.status}
                                        </span>
                                    </div>
                                    <div className={`text-[11px] ${m.status === 'Suspended' ? 'text-voxly-heat' : 'text-voxly-ink-5'}`}>{m.status === 'Pending' ? '—' : m.seen}</div>
                                    <MoreVertical className="w-[15px] h-[15px] text-voxly-ink-5 flex-none" />
                                </div>
                            ))}
                        </div>
                        </div>
                    </div>
                </div>

                <div className="w-full xl:w-80 flex-none flex flex-col gap-3.5">
                    <Panel title="Seat Usage">
                        <PanelRow label="Seats used" value={`${MOCK_TEAMMATES.length + 1} / 10`} />
                        <PanelRow label="Available" value={10 - MOCK_TEAMMATES.length - 1} />
                        <PanelRow label="Pending invites" value={pendingCount} />
                    </Panel>
                    <Panel title="Permission Summary">
                        <PanelRow label="Owner" value={1} />
                        <PanelRow label="Admin" value={1} />
                        <PanelRow label="Project Manager" value={1} />
                        <PanelRow label="Member" value={4} />
                        <PanelText><a href="/settings/roles">View roles & permissions →</a></PanelText>
                    </Panel>
                </div>
            </div>
        </SettingsShell>
    );
}
