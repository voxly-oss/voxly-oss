'use client';

import { motion } from 'framer-motion';

const companies = [
    { name: 'Acme Studio', logo: '✦' },
    { name: 'Waverly', logo: '▲' },
    { name: 'Luminous', logo: '◉' },
    { name: 'Savannah', logo: '◈' },
    { name: 'Brightpath', logo: '❖' },
    { name: 'Radiant', logo: '✶' },
    { name: 'Vertex', logo: '⬡' },
    { name: 'Orbital', logo: '◎' },
];

export default function SocialProof() {
    return (
        <section className="py-24 border-y border-white/[0.05] bg-white/[0.01] backdrop-blur-sm overflow-hidden">
            <div className="max-w-7xl mx-auto px-6 text-center mb-12">
                <p className="text-sm font-medium text-white/40 uppercase tracking-widest">
                    Trusted by forward-thinking teams
                </p>
            </div>
            
            <div className="relative flex overflow-x-hidden">
                {/* Gradient Masks */}
                <div className="absolute top-0 bottom-0 left-0 w-24 z-10 bg-gradient-to-r from-[#050507] to-transparent pointer-events-none" />
                <div className="absolute top-0 bottom-0 right-0 w-24 z-10 bg-gradient-to-l from-[#050507] to-transparent pointer-events-none" />

                {/* Marquee Track */}
                <div className="flex animate-marquee whitespace-nowrap">
                    {[...companies, ...companies, ...companies, ...companies].map((company, i) => (
                        <div key={i} className="mx-8 md:mx-16 flex items-center gap-3 group cursor-default">
                             <span className="text-2xl text-white/20 group-hover:text-violet-400 transition-colors duration-300">
                                {company.logo}
                             </span>
                             <span className="text-lg font-bold tracking-tight text-white/30 group-hover:text-white transition-colors duration-300">
                                {company.name}
                             </span>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
}
