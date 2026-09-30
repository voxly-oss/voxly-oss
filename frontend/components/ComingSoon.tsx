import Link from 'next/link';
import { ArrowRight, type LucideIcon } from 'lucide-react';

/** Small nav/heading tag for features that are on the roadmap, not built. */
export function SoonTag({ className = '' }: { className?: string }) {
    return (
        <span
            className={`inline-flex items-center text-[9.5px] font-semibold uppercase tracking-[0.05em] rounded-full px-1.5 py-[1px] bg-voxly-surface-3 text-voxly-ink-5 ${className}`}
        >
            Soon
        </span>
    );
}

export interface AvailableToday {
    href: string;
    label: string;
    description: string;
    icon: LucideIcon;
}

interface ComingSoonProps {
    icon: LucideIcon;
    /** Page title (the nav label). */
    title: string;
    subtitle: string;
    headline: string;
    description: string;
    /** What the feature will do — plain text, never mock data. */
    planned: string[];
    /** Real features that cover the need today. */
    today: AvailableToday[];
    /** Real, live content that belongs on this page already. */
    children?: React.ReactNode;
}

/**
 * Honest placeholder for roadmap features. Replaces pages that rendered
 * full-fidelity invented data (named clients, dollar figures, fake logs)
 * behind a small "Preview" badge — a user could act on those numbers. This
 * states what's planned and points at what actually works today.
 */
export default function ComingSoon({ icon: Icon, title, subtitle, headline, description, planned, today, children }: ComingSoonProps) {
    return (
        <div className="flex flex-col gap-[18px] max-w-4xl">
            <div>
                <h1 className="font-display font-bold text-[22px] text-foreground tracking-[-0.01em] flex items-center gap-2.5">
                    {title}
                    <SoonTag className="text-[10px] px-2 py-0.5" />
                </h1>
                <p className="text-[13px] text-voxly-ink-6 mt-[3px]">{subtitle}</p>
            </div>

            <section className="border border-border rounded-[14px] bg-card px-6 py-8 sm:px-8">
                <div className="w-11 h-11 rounded-xl bg-voxly-surface-2 flex items-center justify-center text-voxly-ink-6 mb-4">
                    <Icon className="w-5 h-5" />
                </div>
                <h2 className="font-display font-bold text-[17px] text-foreground tracking-[-0.01em]">{headline}</h2>
                <p className="text-[13px] text-voxly-ink-6 max-w-xl mt-1.5 leading-relaxed">{description}</p>

                <div className="mt-6 font-mono text-[10px] font-bold uppercase tracking-[0.07em] text-voxly-ink-5">What’s planned</div>
                <ul className="mt-2.5 grid sm:grid-cols-2 gap-x-6 gap-y-2">
                    {planned.map((item) => (
                        <li key={item} className="flex items-start gap-2 text-[13px] text-voxly-ink-6">
                            <span className="mt-[7px] w-1.5 h-1.5 rounded-full bg-voxly-ink-4 flex-none" aria-hidden="true" />
                            {item}
                        </li>
                    ))}
                </ul>
            </section>

            {children}

            <section>
                <div className="font-mono text-[10px] font-bold uppercase tracking-[0.07em] text-voxly-ink-5 mb-2.5">Available today</div>
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {today.map(({ href, label, description: desc, icon: LinkIcon }) => (
                        <Link
                            key={href}
                            href={href}
                            className="group border border-border rounded-xl bg-card p-4 hover:border-voxly-ink-4 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                            <div className="flex items-center gap-2">
                                <LinkIcon className="w-4 h-4 text-primary flex-none" />
                                <span className="text-[13px] font-semibold text-foreground">{label}</span>
                                <ArrowRight className="w-3.5 h-3.5 ml-auto text-voxly-ink-5 opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity" />
                            </div>
                            <p className="text-[12px] text-voxly-ink-5 mt-1 leading-relaxed">{desc}</p>
                        </Link>
                    ))}
                </div>
            </section>
        </div>
    );
}
