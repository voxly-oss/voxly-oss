'use client';

import Link from 'next/link';
import SettingsShell from '@/components/SettingsShell';
import { SettingsRow, StatusPill } from '@/components/SettingsRow';
import { HelpLinks, Panel, PanelRow, PanelText } from '@/components/SidePanel';

// No notification-preferences endpoint exists yet. These rows used to be
// local-only toggles that reset on reload while looking saved — they now say
// what's actually true. Wire real controls here once an endpoint ships.
export default function NotificationsSettingsPage() {
    return (
        <SettingsShell breadcrumb={{ group: 'Application', page: 'Notifications' }}>
            <div className="flex flex-col xl:flex-row gap-6 items-start">
                <div className="flex-1 min-w-0 w-full flex flex-col gap-[18px]">
                    <div>
                        <h1 className="font-display font-bold text-[22px] text-foreground tracking-[-0.01em]">Notifications</h1>
                        <p className="text-[13px] text-voxly-ink-6 mt-[3px]">How and when the workspace hears from Voxly</p>
                    </div>

                    <div className="border border-border rounded-[14px] bg-card overflow-hidden">
                        <SettingsRow label="In-app alerts" description="The bell in the header lists every conversation waiting on a human.">
                            <StatusPill tone="success">On</StatusPill>
                        </SettingsRow>
                        <SettingsRow label="Email digest" description="A daily summary of client conversations.">
                            <StatusPill />
                        </SettingsRow>
                        <SettingsRow label="Slack notifications">
                            <StatusPill />
                        </SettingsRow>
                        <SettingsRow label="Desktop push notifications">
                            <StatusPill />
                        </SettingsRow>
                        <SettingsRow label="Weekly usage summary">
                            <StatusPill />
                        </SettingsRow>
                    </div>
                </div>

                <div className="w-full xl:w-80 flex-none flex flex-col gap-3.5">
                    <Panel title="Notification Channels">
                        <PanelRow dot="bg-voxly-success" label="In-app (header bell)" value="on" />
                        <PanelRow dot="bg-voxly-ink-4" label="Email · Slack · Push" value="coming soon" />
                        <PanelText>
                            Until then, <Link href="/messages?status=awaiting_human" className="text-primary hover:underline">Needs attention</Link> in
                            Conversations is the live queue.
                        </PanelText>
                    </Panel>
                    <Panel title="Need Help?" defaultOpen={false}>
                        <HelpLinks />
                    </Panel>
                </div>
            </div>
        </SettingsShell>
    );
}
