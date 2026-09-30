'use client';

import { KeyRound, MessageSquare, Sparkles } from 'lucide-react';
import ComingSoon from '@/components/ComingSoon';

// Was a full operations console of invented agents, success rates, costs,
// reasoning traces and named clients. No agent-configuration backend exists;
// one built-in agent answers every client.
export default function AgentsPage() {
    return (
        <ComingSoon
            icon={Sparkles}
            title="AI Agents"
            subtitle="Configure how Voxly answers each client"
            headline="One agent today — configurable agents are coming"
            description="Right now a single Voxly agent replies to every client on WhatsApp and Telegram, grounded in each project’s live status and synced GitHub data. Separate agents with their own instructions, tone and escalation rules are on the roadmap."
            planned={[
                'Multiple agents with their own instructions and tone',
                'Assign an agent per client or project',
                'Escalation rules and working hours',
                'Execution history and success metrics',
            ]}
            today={[
                { href: '/chat', label: 'Try the agent', description: 'Ask it about any project — it reads the same data it uses with clients.', icon: Sparkles },
                { href: '/messages', label: 'Conversations', description: 'Every reply it has sent, with take-over and escalate controls.', icon: MessageSquare },
                { href: '/settings/ai-defaults', label: 'AI provider keys', description: 'Choose the provider the agent runs on with your own key.', icon: KeyRound },
            ]}
        />
    );
}
