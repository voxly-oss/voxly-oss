'use client';

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence, useInView } from 'framer-motion';
import { Terminal, Bot, MessageSquare, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import SpotlightCard from './SpotlightCard';

const steps = [
    {
        id: 1,
        title: "Install & Connect",
        description: "Run our CLI command to set up your environment in seconds. Connect your GitHub repositories and Twilio WhatsApp Business API key to get started.",
        icon: Terminal,
        metric: "< 2 min setup",
        color: "blue",
        theme: "text-blue-400 bg-blue-500/10 border-blue-500/20"
    },
    {
        id: 2,
        title: "AI Analysis",
        description: "Claude AI automatically scans your codebase, commit history, and pull requests to build a comprehensive context graph of your project.",
        icon: Bot,
        metric: "100% automated",
        color: "violet",
        theme: "text-violet-400 bg-violet-500/10 border-violet-500/20"
    },
    {
        id: 3,
        title: "Client Communications",
        description: "When clients message you on WhatsApp, Voxly generates accurate, context-aware responses instantly based on your real-time project progress.",
        icon: MessageSquare,
        metric: "24/7 availability",
        color: "emerald",
        theme: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20"
    }
];

function StepText({ step, index, currentStep, setCurrentStep }: any) {
    const ref = useRef<HTMLDivElement>(null);
    const isInView = useInView(ref, { margin: "-40% 0px -40% 0px" });

    useEffect(() => {
        if (isInView) {
            setCurrentStep(index);
        }
    }, [isInView, index, setCurrentStep]);

    const isActive = currentStep === index;

    return (
        <div ref={ref} className={cn("py-20 transition-opacity duration-500", isActive ? "opacity-100" : "opacity-30")}>
             <div className={cn("inline-flex items-center gap-2 mb-6 px-3 py-1.5 rounded-lg border", step.theme)}>
                <step.icon className="w-5 h-5" />
                <span className="text-xs font-bold tracking-wider uppercase">Step 0{step.id}</span>
             </div>
             <h3 className="text-3xl sm:text-4xl font-display font-bold mb-6 text-white">{step.title}</h3>
             <p className="text-white/60 leading-relaxed text-lg mb-8 max-w-md">{step.description}</p>
             <div className={cn("inline-flex items-center gap-2 text-sm font-medium", step.theme.split(' ')[0])}>
                 <Zap className="w-4 h-4 fill-current" /> {step.metric}
             </div>
        </div>
    );
}

function StepVisual({ step }: { step: typeof steps[0] }) {
    if (step.id === 1) {
        return (
            <div className="w-full h-full flex flex-col items-start justify-center p-8 sm:p-12 font-mono text-sm">
                <div className="flex gap-3 mb-4 opacity-80"><span className="text-blue-400">➜</span> <span className="text-white/50">~</span> <span className="text-white">npx create-voxly</span></div>
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }} className="text-white/40 mb-2">Installing dependencies...</motion.div>
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1 }} className="text-white/40 mb-4">Verifying GitHub access...</motion.div>
                <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 1.5 }} className="text-emerald-400 font-bold flex gap-2 items-center">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" /> Setup complete
                </motion.div>
            </div>
        );
    }
    if (step.id === 2) {
        return (
            <div className="relative w-full h-full flex items-center justify-center overflow-hidden">
                <motion.div 
                    animate={{ scale: [1, 1.2, 1], opacity: [0.3, 0.6, 0.3] }} 
                    transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                    className="absolute inset-0 bg-violet-500/20 blur-3xl rounded-full" 
                />
                
                <div className="relative z-10 w-24 h-24 rounded-2xl bg-[#0a0a0c] border border-violet-500/30 flex items-center justify-center shadow-[0_0_40px_rgba(139,92,246,0.3)] backdrop-blur-xl">
                    <Bot className="w-10 h-10 text-violet-400" />
                </div>

                {/* Simulated floating code blocks analyzing */}
                <motion.div 
                    initial={{ y: 50, opacity: 0 }} animate={{ y: -50, opacity: [0, 1, 0] }} transition={{ duration: 2, repeat: Infinity, delay: 0.5, ease: "linear" }}
                    className="absolute right-12 w-16 h-4 rounded-full bg-white/10"
                />
                <motion.div 
                    initial={{ y: 50, opacity: 0 }} animate={{ y: -50, opacity: [0, 1, 0] }} transition={{ duration: 2.5, repeat: Infinity, ease: "linear" }}
                    className="absolute left-16 w-24 h-4 rounded-full bg-violet-400/20"
                />
            </div>
        );
    }
    if (step.id === 3) {
        return (
            <div className="w-full h-full flex flex-col items-center justify-center bg-[#000000] p-6 relative">
                 <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-emerald-900/20 to-transparent pointer-events-none" />
                 
                 <div className="flex flex-col gap-4 w-full max-w-sm relative z-10">
                     <motion.div initial={{ opacity: 0, x: -20, scale: 0.95 }} animate={{ opacity: 1, x: 0, scale: 1 }} className="self-end bg-[#075E54] px-4 py-3 rounded-2xl rounded-tr-none text-sm text-white shadow-lg shadow-black/50">
                         Any updates on the new API endpoints?
                     </motion.div>
                     <motion.div initial={{ opacity: 0, x: 20, scale: 0.95 }} animate={{ opacity: 1, x: 0, scale: 1 }} transition={{ delay: 0.8 }} className="self-start bg-[#1f2c34] border border-white/5 px-4 py-3 rounded-2xl rounded-tl-none text-sm text-white/90 shadow-lg shadow-black/50">
                         Yes! I just analyzed the latest commits in `main`. The `/v2/users` endpoint is now fully deployed and tested. You can find the updated Swagger docs at `/api/docs`.
                     </motion.div>
                 </div>
            </div>
        );
    }
    return null;
}

export default function HowItWorks() {
    const [currentStep, setCurrentStep] = useState(0);

    return (
        <section className="py-32 px-6 max-w-7xl mx-auto relative" id="how-it-works">
            <div className="text-center mb-16 relative z-10 max-w-3xl mx-auto">
                <span className="inline-block px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-300 text-xs font-semibold tracking-wide uppercase mb-6">Workflow</span>
                <h2 className="text-4xl sm:text-6xl font-display font-bold tracking-tight">
                    Three steps to <span className="bg-gradient-to-r from-blue-400 via-violet-400 to-emerald-400 bg-clip-text text-transparent">automation.</span>
                </h2>
            </div>
            
            <div className="flex flex-col md:flex-row items-start gap-12 relative">
                {/* ── LEFT: Scrolling Text ── */}
                <div className="w-full md:w-1/2">
                    <div className="md:py-[20vh]">
                        {steps.map((step, index) => (
                            <StepText 
                                key={step.id} 
                                step={step} 
                                index={index} 
                                currentStep={currentStep} 
                                setCurrentStep={setCurrentStep} 
                            />
                        ))}
                    </div>
                </div>

                {/* ── RIGHT: Sticky Visuals (Desktop) ── */}
                <div className="hidden md:flex w-1/2 sticky top-[20vh] h-[60vh] items-center">
                    <SpotlightCard className="w-full h-full bg-[#0a0a0c] border-white/10 p-0 overflow-hidden shadow-2xl relative">
                         <div className="absolute inset-0 bg-gradient-to-br from-white/[0.04] to-transparent pointer-events-none z-0" />
                         
                         <AnimatePresence mode="wait">
                             <motion.div
                                key={currentStep}
                                initial={{ opacity: 0, y: 20, filter: 'blur(10px)' }}
                                animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                                exit={{ opacity: 0, y: -20, filter: 'blur(10px)' }}
                                transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                                className="w-full h-full relative z-10"
                             >
                                 <StepVisual step={steps[currentStep]} />
                             </motion.div>
                         </AnimatePresence>
                    </SpotlightCard>
                </div>

                {/* ── RIGHT: Visuals (Mobile Fallback) ── */}
                <div className="md:hidden w-full space-y-8">
                     {steps.map((step) => (
                         <SpotlightCard key={step.id} className="w-full aspect-square bg-[#0a0a0c] border-white/10 p-0 overflow-hidden shadow-2xl">
                              <StepVisual step={step} />
                         </SpotlightCard>
                     ))}
                </div>
            </div>
        </section>
    );
}
