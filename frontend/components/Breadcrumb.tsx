import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { Fragment } from 'react';

export interface BreadcrumbItem {
    label: string;
    href?: string;
}

interface BreadcrumbProps {
    items: BreadcrumbItem[];
}

/**
 * Shared breadcrumb trail for the v3 app shell. The audit found no
 * breadcrumb in the primary chrome — only a local, one-off
 * implementation buried in the Milestones page (§8 Navigation Audit).
 */
export default function Breadcrumb({ items }: BreadcrumbProps) {
    return (
        <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-[12.5px] text-voxly-ink-5 mb-4">
            {items.map((item, i) => {
                const isLast = i === items.length - 1;
                return (
                    <Fragment key={`${item.label}-${i}`}>
                        {i > 0 && <ChevronRight className="w-3.5 h-3.5 flex-none" aria-hidden="true" />}
                        {item.href && !isLast ? (
                            <Link href={item.href} className="hover:text-foreground transition-colors">
                                {item.label}
                            </Link>
                        ) : (
                            <span aria-current={isLast ? 'page' : undefined} className={isLast ? 'text-foreground font-medium' : undefined}>
                                {item.label}
                            </span>
                        )}
                    </Fragment>
                );
            })}
        </nav>
    );
}
