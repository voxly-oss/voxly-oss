'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

const NAV_GROUPS: { label: string; items: { name: string; href: string }[] }[] = [
    {
        label: 'Workspace',
        items: [
            { name: 'Organization', href: '/settings/organization' },
            { name: 'Team Members', href: '/settings/team-members' },
            { name: 'Roles & Permissions', href: '/settings/roles' },
        ],
    },
    {
        label: 'Billing',
        items: [{ name: 'Billing', href: '/settings/billing' }],
    },
    {
        label: 'Developer',
        items: [{ name: 'API Keys', href: '/settings/api-keys' }],
    },
    {
        label: 'Application',
        items: [
            { name: 'General', href: '/settings/general' },
            { name: 'AI Defaults', href: '/settings/ai-defaults' },
            { name: 'Notifications', href: '/settings/notifications' },
        ],
    },
    {
        label: 'Advanced',
        items: [
            { name: 'Security', href: '/settings/security' },
            { name: 'Danger Zone', href: '/settings/danger-zone' },
        ],
    },
];

export default function SettingsShell({
    children,
    breadcrumb,
}: {
    children: React.ReactNode;
    breadcrumb: { group: string; page: string };
}) {
    const pathname = usePathname();

    return (
        <div className="flex flex-col lg:flex-row gap-0 -m-4 lg:-m-8 min-h-[calc(100vh-56px)]">
            {/* Secondary settings nav */}
            <div className="w-full lg:w-[216px] flex-none lg:border-r border-border p-3.5 lg:p-4">
                <div className="font-display font-bold text-[15px] text-foreground px-2 pb-3 hidden lg:block">Settings</div>
                <div className="flex flex-col gap-1 lg:gap-0.5">
                    {NAV_GROUPS.map(group => (
                        <div key={group.label} className="flex flex-col mb-1">
                            <div className="font-mono text-[10px] font-semibold uppercase tracking-wider text-voxly-ink-5 px-2 pb-1">{group.label}</div>
                            {group.items.map(item => {
                                const isActive = pathname === item.href;
                                return (
                                    <Link
                                        key={item.href}
                                        href={item.href}
                                        className={cn(
                                            'block px-2.5 py-[6px] rounded-[7px] text-[13px] mb-px transition-colors',
                                            isActive
                                                ? 'bg-secondary text-foreground font-semibold'
                                                : 'text-voxly-ink-6 hover:bg-secondary/60 hover:text-foreground'
                                        )}
                                    >
                                        {item.name}
                                    </Link>
                                );
                            })}
                        </div>
                    ))}
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0 p-4 lg:p-8 flex flex-col gap-[18px]">
                <div className="flex items-center gap-1.5 text-[12.5px]">
                    <span className="text-voxly-ink-6">Settings</span>
                    <span className="text-voxly-ink-5">/</span>
                    <span className="text-voxly-ink-6">{breadcrumb.group}</span>
                    <span className="text-voxly-ink-5">/</span>
                    <span className="text-foreground font-semibold">{breadcrumb.page}</span>
                </div>
                {children}
            </div>
        </div>
    );
}
