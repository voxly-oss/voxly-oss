'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

export interface TabNavItem {
    label: string;
    href: string;
}

interface TabNavProps {
    items: TabNavItem[];
}

/**
 * URL-addressable tab strip (Link-based, not useState) matching the
 * "Tabs" spec in design-reference/Voxly Design Language.dc.html.
 * No Radix Tabs primitive exists in components/ui/ yet — this is a
 * thin, link-driven strip so tabs stay deep-linkable, per the audit's
 * §4 finding that Settings' useState tabs can't be linked to directly.
 */
export default function TabNav({ items }: TabNavProps) {
    const pathname = usePathname();

    return (
        <div role="tablist" className="flex gap-6 border-b border-border">
            {items.map((item) => {
                const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
                return (
                    <Link
                        key={item.href}
                        href={item.href}
                        role="tab"
                        aria-selected={isActive}
                        className={cn(
                            'text-[13px] font-medium pb-[11px] border-b-2 -mb-px transition-colors',
                            isActive
                                ? 'text-foreground border-primary'
                                : 'text-voxly-ink-6 border-transparent hover:text-foreground'
                        )}
                    >
                        {item.label}
                    </Link>
                );
            })}
        </div>
    );
}
