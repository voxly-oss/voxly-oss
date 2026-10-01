'use client';

import { FolderGit2, GitCommit, MessageSquare, Radio, Sparkles, Wrench, Zap } from 'lucide-react';
import ComingSoon from '@/components/ComingSoon';
import { StatusPill } from '@/components/SettingsRow';

/* Was seven invented workflows, fake run history and an approval checkpoint
   whose approve/reject buttons did nothing. No workflow engine exists — but
   three automations are genuinely built in (backend/app/api/v1/github.py and
   the inbound message pipeline), so they're listed as what runs today. */
const BUILT_IN = [
    {
        icon: GitCommit,
        title: 'Client update on every push',
        detail: 'When a linked repo receives a push, that project’s client gets a WhatsApp message with the commit count and latest commit.',
        needs: 'Needs the repo’s GitHub webhook and a client phone number.',
    },
    {
        icon: Wrench,
        title: 'Build-failure analysis',
        detail: 'When a GitHub Actions run fails, Voxly reads the log tail and WhatsApps you why it failed and a suggested fix.',
        needs: 'Needs the repo’s GitHub webhook and a phone number on your account.',
    },
    {
        icon: Sparkles,
        title: 'AI replies to clients',
        detail: 'Inbound WhatsApp and Telegram messages get an AI reply grounded in the client’s project data. You can take over any conversation.',
        needs: 'Needs a connected WhatsApp or Telegram channel.',
    },
];

export default function AutomationsPage() {
    return (
        <ComingSoon
            icon={Zap}
            title="Automations"
            subtitle="Workflows that run without you"
            headline="Custom workflows are coming"
            description="A builder for your own triggers, approval steps and actions is on the roadmap. A few automations are already built in and run on their own."
            planned={[
                'Visual workflow builder — triggers to actions',
                'Approval checkpoints before messages go out',
                'Scheduled client digests',
                'Run history, retries and failure alerts',
            ]}
            today={[
                { href: '/projects', label: 'Link GitHub repos', description: 'Push updates and build-failure analysis run per linked repo.', icon: FolderGit2 },
                { href: '/messages', label: 'Conversations', description: 'Watch AI replies as they happen and take over when needed.', icon: MessageSquare },
                { href: '/channels', label: 'Channels', description: 'See which clients are active on WhatsApp and Telegram.', icon: Radio },
            ]}
        >
            <section className="border border-border rounded-[14px] bg-card overflow-hidden">
                <div className="flex items-center justify-between px-5 py-3 border-b border-border">
                    <span className="font-mono text-[10px] font-bold uppercase tracking-[0.07em] text-voxly-ink-5">Running today · built in</span>
                    <StatusPill tone="success">Active</StatusPill>
                </div>
                {BUILT_IN.map(({ icon: Icon, title, detail, needs }) => (
                    <div key={title} className="flex items-start gap-3.5 px-5 py-4 border-b border-border last:border-b-0">
                        <div className="w-8 h-8 rounded-lg bg-voxly-surface-3 flex items-center justify-center flex-none text-voxly-ink-6">
                            <Icon className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                            <div className="text-[13px] font-semibold text-foreground">{title}</div>
                            <p className="text-[12.5px] text-voxly-ink-6 mt-0.5 leading-relaxed">{detail}</p>
                            <p className="text-[11.5px] text-voxly-ink-5 mt-1">{needs}</p>
                        </div>
                    </div>
                ))}
            </section>
        </ComingSoon>
    );
}
