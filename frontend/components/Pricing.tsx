'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { Check, Sparkles, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import SpotlightCard from './SpotlightCard';

const plans = [
    {
        name: 'Free',
        price: '0',
        description: 'For indie hackers and open-source contributors.',
        features: [
            '1 Project',
            '100 AI messages/mo',
            'Bring Your Own Key (BYOK)',
            'Community support',
            'Self-hosted deployment',
            'Basic analytics',
        ],
        cta: 'Get Started Free',
        href: '/register',
        popular: false,
        comingSoon: false,
    },
    {
        name: 'Growth',
        price: '29',
        description: 'For growing agencies managing multiple clients.',
        features: [
            '10 Projects',
            '1,000 AI messages included',
            'Claude + OpenAI + Gemini',
            'WhatsApp integration',
            'Priority email support',
            'GitHub & Linear sync',
            'Advanced analytics',
            'Custom branding',
        ],
        cta: 'Join Waitlist',
        href: '#',
        popular: true,
        comingSoon: true,
    },
    {
        name: 'Enterprise',
        price: '99',
        description: 'For large teams needing scale, security & SLA.',
        features: [
            'Unlimited projects',
            'Unlimited AI messages',
            'All AI providers (BYOK)',
            'Dedicated success manager',
            'SSO & Audit logs',
            'On-premise deployment',
            'SLA guarantee (99.9%)',
            'White-label option',
        ],
        cta: 'Join Waitlist',
        href: '#',
        popular: false,
        comingSoon: true,
    },
];

export default function Pricing() {
    return (
        <section id="pricing" className="py-32 px-6 max-w-7xl mx-auto relative">
             <div className="text-center mb-20">
                 <span className="inline-block px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs font-semibold tracking-wide uppercase mb-6">Pricing</span>
                 <h2 className="text-4xl sm:text-6xl font-bold tracking-tighter mb-6">
                    Simple, transparent <span className="text-white/30">pricing.</span>
                 </h2>
                 <p className="text-white/40 text-lg max-w-xl mx-auto">Free forever for open-source. Paid plans coming soon for teams that need more.</p>
             </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative z-10">
                {plans.map((plan, i) => (
                    <motion.div 
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.6, delay: i * 0.1 }}
                        key={plan.name} 
                        className={cn("relative group", plan.popular && "z-10")}
                    >
                        {plan.popular && (
                             <div className="absolute -inset-[1px] rounded-[2rem] bg-gradient-to-b from-violet-500 via-cyan-500 to-violet-500 blur-sm opacity-50 group-hover:opacity-100 transition duration-500" />
                        )}
                        
                        <SpotlightCard 
                            className={cn(
                                "h-full flex flex-col p-8 rounded-[2rem] bg-[#0a0a0f] border-white/10 relative overflow-hidden",
                                plan.popular ? "bg-[#0c0c12] border-transparent" : "hover:border-white/20"
                            )}
                            spotlightColor={plan.popular ? "rgba(139, 92, 246, 0.15)" : "rgba(255, 255, 255, 0.05)"}
                        >
                            {/* Badges */}
                            <div className="absolute top-0 right-0 flex items-center gap-0">
                                {plan.comingSoon && (
                                    <div className="px-3 py-1.5 bg-amber-500/10 text-amber-400 text-[10px] font-bold tracking-widest uppercase rounded-bl-2xl flex items-center gap-1.5 border-b border-l border-amber-500/20">
                                        <Clock className="w-3 h-3" />
                                        Coming Soon
                                    </div>
                                )}
                                {plan.popular && (
                                    <div className="px-3 py-1.5 bg-gradient-to-bl from-violet-600 to-indigo-600 text-white text-[10px] font-bold tracking-widest uppercase rounded-bl-2xl flex items-center gap-1.5">
                                        <Sparkles className="w-3 h-3" />
                                        Popular
                                    </div>
                                )}
                            </div>

                            <div className="mb-8">
                                <h3 className={cn("text-xl font-bold mb-2", plan.popular ? "text-white" : "text-white/80")}>{plan.name}</h3>
                                <p className="text-sm text-white/40 h-10">{plan.description}</p>
                            </div>

                            <div className="flex items-baseline gap-1 mb-8">
                                <span className="text-sm text-white/50 font-medium">$</span>
                                <span className="text-4xl font-bold tracking-tighter text-white">{plan.price}</span>
                                <span className="text-sm text-white/30 font-medium">/mo</span>
                            </div>

                            <div className="flex-1 space-y-4 mb-8">
                                {plan.features.map((feature) => (
                                    <div key={feature} className="flex items-start gap-3">
                                        <div className={cn(
                                            "w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5",
                                            plan.popular ? "bg-violet-500/20 text-violet-300" : "bg-white/10 text-white/30"
                                        )}>
                                            <Check className="w-3 h-3" />
                                        </div>
                                        <span className="text-white/70 text-sm leading-tight">{feature}</span>
                                    </div>
                                ))}
                            </div>

                            <Link 
                                href={plan.href}
                                className={cn(
                                    "w-full block text-center py-4 rounded-xl text-sm font-bold transition-all duration-300",
                                    plan.comingSoon
                                        ? "bg-white/5 text-white/50 border border-white/10 cursor-default"
                                        : plan.popular 
                                            ? "bg-white text-black hover:bg-white/90 shadow-lg shadow-white/5 hover:scale-[1.02]" 
                                            : "bg-white/5 text-white border border-white/10 hover:bg-white/10 hover:scale-[1.02]"
                                )}
                            >
                                {plan.cta}
                            </Link>
                        </SpotlightCard>
                    </motion.div>
                ))}
            </div>

            {/* BYOK Note */}
            <div className="text-center mt-12">
                <p className="text-white/30 text-sm">
                    💡 All plans support <span className="text-white/50 font-medium">Bring Your Own Key (BYOK)</span> — use your own Claude, OpenAI, or Gemini API key.
                </p>
            </div>
        </section>
    );
}
