'use client';

import { useState } from 'react';
import SettingsShell from '@/components/SettingsShell';
import { SettingsRow, Toggle, ValueButton } from '@/components/SettingsRow';
import { Panel, PanelRow, PanelText } from '@/components/SidePanel';

// No notification-preferences endpoint exists yet — these controls are
// local-only (not persisted). Replace with real wiring once one ships.
export default function NotificationsSettingsPage() {
    const [slack, setSlack] = useState(true);
    const [desktopPush, setDesktopPush] = useState(true);
    const [weeklySummary, setWeeklySummary] = useState(true);

    return (
        <SettingsShell breadcrumb={{ group: 'Application', page: 'Notifications' }}>
            <div className="flex flex-col xl:flex-row gap-6 items-start">
                <div className="flex-1 min-w-0 w-full flex flex-col gap-[18px]">
                    <div>
                        <h1 className="font-display font-bold text-[22px] text-foreground tracking-[-0.01em]">Notifications</h1>
                        <p className="text-[13px] text-voxly-ink-6 mt-[3px]">How and when the workspace hears from Voxly</p>
                    </div>

                    <div className="border border-border rounded-[14px] bg-card overflow-hidden">
                        <SettingsRow label="Email digest">
                            <ValueButton>Daily</ValueButton>
                        </SettingsRow>
                        <SettingsRow label="Slack notifications">
                            <Toggle checked={slack} onChange={setSlack} />
                        </SettingsRow>
                        <SettingsRow label="Desktop push notifications">
                            <Toggle checked={desktopPush} onChange={setDesktopPush} />
                        </SettingsRow>
                        <SettingsRow label="Weekly usage summary">
                            <Toggle checked={weeklySummary} onChange={setWeeklySummary} />
                        </SettingsRow>
                    </div>
                </div>

                <div className="w-full xl:w-80 flex-none flex flex-col gap-3.5">
                    <Panel title="Notification Channels">
                        <PanelRow dot="bg-voxly-success" label="Email" value="on" />
                        <PanelRow dot={slack ? 'bg-voxly-success' : 'bg-voxly-ink-4'} label="Slack" value={slack ? 'on' : 'off'} />
                        <PanelRow dot={desktopPush ? 'bg-voxly-success' : 'bg-voxly-ink-4'} label="Desktop push" value={desktopPush ? 'on' : 'off'} />
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
