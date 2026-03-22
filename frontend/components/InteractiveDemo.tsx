'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence, useMotionValue, useSpring, useTransform } from 'framer-motion';
import Image from 'next/image';
import {
    MessageSquare, Send, Bot, Smartphone, Monitor,
    ChevronLeft, Phone, Video, MoreVertical,
    Smile, Paperclip, Mic, Search, BarChart3, Users, Settings,
    Bell, CheckCheck, Battery, Wifi, Signal
} from 'lucide-react';

/* ─────────────────── Types ─────────────────── */
interface ChatMessage {
    id: string;
    sender: 'user' | 'ai';
    text: string;
    time: string;
    delivered?: boolean;
    read?: boolean;
}

interface Conversation {
    id: string;
    name: string;
    avatar: string; // Initials or image
    lastMessage: string;
    unreadCount: number;
    platform: 'WhatsApp' | 'Telegram' | 'Messenger';
    messages: ChatMessage[];
}

/* ─────────────────── Mock Data ─────────────────── */
const initialConversations: Conversation[] = [
    {
        id: 'sarah',
        name: 'Sarah Chen',
        avatar: 'SC',
        lastMessage: "What's the auth status?",
        unreadCount: 2,
        platform: 'WhatsApp',
        messages: [
            { id: '1', sender: 'user', text: "Hey, what's the status on the auth module?", time: '9:41 AM', delivered: true, read: true },
            { id: '2', sender: 'ai', text: "Auth module is 95% complete — JWT refresh tokens merged yesterday. OAuth2 Google login is in review (PR #142). Production-ready by Thursday. 🎯", time: '9:42 AM', delivered: true, read: true },
            { id: '3', sender: 'user', text: "Nice! And payment integration?", time: '9:45 AM', delivered: true, read: true },
            { id: '4', sender: 'ai', text: "💳 Stripe checkout is live on staging. Razorpay for India billing is 60% done — webhook handlers testing in progress. Full suite shipping next week.", time: '9:46 AM', delivered: true, read: true }
        ]
    },
    {
        id: 'alex',
        name: 'Alex Kumar',
        avatar: 'AK',
        lastMessage: "Deployment successful?",
        unreadCount: 0,
        platform: 'Telegram',
        messages: [
            { id: 'a1', sender: 'user', text: "Did the staging deployment go through?", time: 'Yesterday', delivered: true, read: true },
            { id: 'a2', sender: 'ai', text: "Yes, v2.0.3 was deployed successfully on staging at 2:00 PM. No errors reported in Sentry.", time: 'Yesterday', delivered: true, read: true }
        ]
    },
    {
        id: 'michelle',
        name: 'Michelle Wang',
        avatar: 'MW',
        lastMessage: "Thanks for the update!",
        unreadCount: 0,
        platform: 'WhatsApp',
        messages: [
            { id: 'm1', sender: 'user', text: "Can you check if the API is down?", time: 'Monday', delivered: true, read: true },
            { id: 'm2', sender: 'ai', text: "All systems operational. API response time is 45ms (normal). Database load is at 12%.", time: 'Monday', delivered: true, read: true }
        ]
    }
];

/* ─────────────────── AI Response Engine ─────────────────── */
const responseMap: { keywords: string[]; response: string }[] = [
    { keywords: ['status', 'update', 'progress', 'kya', 'kahan', 'स्टेटस', 'estado', 'statut'], response: "Auth module is 95% complete — JWT refresh tokens merged. OAuth2 Google login is in PR #142 review. Payment integration: Stripe checkout is live on staging, Razorpay for India billing is 60% done. ETA for full completion: Thursday." },
    { keywords: ['payment', 'stripe', 'razorpay', 'billing', 'पेमेंट', 'pago', 'paiement'], response: "💳 Payment Status:\n• Stripe Checkout: ✅ Live on staging\n• Razorpay India: 🔄 60% — webhook handlers in testing\n• Apple Pay: 📋 Planned for v2.1\nShipping full payment suite next week." },
    { keywords: ['auth', 'login', 'oauth', 'लॉगिन', 'autenticación','connexion'], response: "🔐 Auth Module — 95% Complete:\n• JWT refresh tokens: ✅ Merged\n• Google OAuth2: 🔄 PR #142 in review\n• GitHub OAuth: ✅ Shipped\n• Rate limiting: ✅ Configured\nProduction-ready by Thursday." },
    { keywords: ['bug', 'issue', 'error', 'fix', 'problem', 'समस्या', 'बग', 'erreur', 'problema'], response: "🐛 Open Issues: 3 critical, 7 minor\n\nCritical:\n1. Memory leak in WebSocket handler — fix in PR #156\n2. Race condition in queue processor — assigned to Dev B\n3. CSS overflow on Safari mobile — fix merged today\n\nAll critical fixes ETA: 48 hours." },
    { keywords: ['deploy', 'release', 'launch', 'ship', 'production', 'डिप्लॉय', 'déployer', 'desplegar'], response: "🚀 Deployment Pipeline:\n• Staging: ✅ v2.0.3 deployed 2 hours ago\n• QA testing: 🔄 In progress (87% pass rate)\n• Production: 📅 Scheduled for Friday 6PM IST\n\nAll smoke tests passing. Rollback plan ready." },
    { keywords: ['team', 'who', 'developer', 'टीम', 'equipo', 'équipe'], response: "👥 Team Activity (Last 24h):\n• Dev A: 12 commits, 3 PRs merged\n• Dev B: 8 commits, bug triage\n• Dev C: Code review + documentation\n• DevOps: CI/CD pipeline optimization\n\nTeam velocity: 23% above sprint average." },
    { keywords: ['hello', 'hi', 'hey', 'hola', 'bonjour', 'नमस्ते', 'namaste', 'salam'], response: "Hey there! 👋 I'm Voxly AI — your project assistant. I can help you with:\n\n• 📊 Project status & progress\n• 🐛 Bug reports & issues\n• 🚀 Deployment updates\n• 👥 Team activity\n• 💳 Payment integration status\n\nJust ask me anything!" },
    { keywords: ['timeline', 'deadline', 'when', 'date', 'कब', 'cuándo', 'quand'], response: "📅 Project Timeline:\n• Sprint 12: Ends Friday\n• Auth module completion: Thursday\n• Payment full suite: Next Wednesday\n• Beta launch: March 1st\n• Public launch: March 15th\n\nWe're currently 2 days ahead of schedule! 🎯" },
];

function getAIResponse(input: string): string {
    const lower = input.toLowerCase();
    for (const entry of responseMap) {
        if (entry.keywords.some((kw) => lower.includes(kw))) {
            return entry.response;
        }
    }
    return "📊 Here's a quick summary:\n\n• 14 PRs merged this week\n• 3 features shipped to staging\n• 2 critical bugs resolved\n• Sprint velocity: 92 points\n\nWant details on any specific module? Try asking about auth, payments, bugs, or deployment.";
}

function getCurrentTime(): string {
    const now = new Date();
    return now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
}

/* ─────────────────── 3D Tilt Wrapper ─────────────────── */
function Tilt3D({ children, active = true }: { children: React.ReactNode, active?: boolean }) {
    const x = useMotionValue(0);
    const y = useMotionValue(0);

    const mouseX = useSpring(x, { stiffness: 150, damping: 15 });
    const mouseY = useSpring(y, { stiffness: 150, damping: 15 });

    const rotateX = useTransform(mouseY, [-0.5, 0.5], ["7.5deg", "-7.5deg"]);
    const rotateY = useTransform(mouseX, [-0.5, 0.5], ["-7.5deg", "7.5deg"]); 

    function handleMouseMove(e: React.MouseEvent<HTMLDivElement>) {
        if (!active) return;
        const rect = e.currentTarget.getBoundingClientRect();
        const width = rect.width;
        const height = rect.height;
        const mouseXFromCenter = e.clientX - rect.left - width / 2;
        const mouseYFromCenter = e.clientY - rect.top - height / 2;
        x.set(mouseXFromCenter / width);
        y.set(mouseYFromCenter / height);
    }

    function handleMouseLeave() {
        x.set(0);
        y.set(0);
    }

    return (
        <motion.div 
            style={{ 
                rotateX: active ? rotateX : 0, 
                rotateY: active ? rotateY : 0,
                transformStyle: "preserve-3d",
            }}
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
            className="perspective-[1000px] relative transition-transform duration-200 ease-out"
        >
            {children}
        </motion.div>
    );
}

/* ─────────────────── Notification Component ─────────────────── */
function Notification({ onDismiss }: { onDismiss: () => void }) {
    useEffect(() => {
        const timer = setTimeout(onDismiss, 5000);
        return () => clearTimeout(timer);
    }, [onDismiss]);

    return (
        <motion.div
            initial={{ opacity: 0, y: -50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            className="absolute top-[-80px] left-1/2 -translate-x-1/2 z-50 cursor-pointer w-full max-w-sm px-4"
            onClick={onDismiss}
            style={{ transformStyle: 'preserve-3d', translateZ: 50 }}
        >
            <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl p-4 shadow-2xl flex items-center gap-4 hover:bg-white/15 transition-colors">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center shadow-lg flex-shrink-0 animate-pulse">
                    <MessageSquare className="w-5 h-5 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-center mb-0.5">
                        <h4 className="text-sm font-semibold text-white">New Message</h4>
                        <span className="text-[10px] text-white/50">now</span>
                    </div>
                    <p className="text-xs text-white/80 truncate">Sarah Chen: Hey, status update?</p>
                </div>
            </div>
        </motion.div>
    );
}

/* ─────────────────── Typing Indicator ─────────────────── */
function TypingDots({ variant = 'whatsapp' }: { variant?: 'whatsapp' | 'dashboard' }) {
    return (
        <div className="flex items-center gap-1 px-1">
            {[0, 1, 2].map((i) => (
                <motion.div
                    key={i}
                    className={`w-[5px] h-[5px] rounded-full ${variant === 'whatsapp' ? 'bg-gray-500' : 'bg-violet-400/60'}`}
                    animate={{ opacity: [0.3, 1, 0.3], y: [0, -3, 0] }}
                    transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.15, ease: 'easeInOut' }}
                />
            ))}
        </div>
    );
}

/* ─────────────────── iOS WhatsApp View (iPhone 16 Pro Max Style) ─────────────────── */
function WhatsAppView({ messages, isTyping, inputValue, onInputChange, onSend, scrollRef, contactName }: {
    messages: ChatMessage[];
    isTyping: boolean;
    inputValue: string;
    onInputChange: (v: string) => void;
    onSend: () => void;
    scrollRef: React.RefObject<HTMLDivElement | null>;
    contactName: string;
}) {
    return (
        <div className="w-full max-w-[400px] mx-auto filter drop-shadow-[0_30px_60px_rgba(0,0,0,0.8)]">
            {/* iPhone 16 Pro Max Frame */}
            <div className="relative rounded-[3.5rem] p-[12px] bg-[#1a1a1a] shadow-inner shadow-gray-800 ring-1 ring-gray-700/50" style={{ transformStyle: 'preserve-3d' }}>
                {/* Titanium Frame Border */}
                <div className="absolute inset-0 rounded-[3.5rem] border-[6px] border-[#2a2a2a] pointer-events-none z-50 shadow-[inset_0_0_20px_rgba(0,0,0,0.5)]" />
                
                {/* Screen Content */}
                <div className="relative rounded-[2.8rem] bg-black overflow-hidden h-[600px] sm:h-[800px] flex flex-col">
                    
                    {/* Dynamic Island Area */}
                    <div className="absolute top-0 left-0 right-0 h-14 z-50 flex justify-center pt-2 pointer-events-none">
                        <div className="w-[120px] h-[35px] bg-black rounded-full flex items-center justify-between px-3">
                            {/* Dynamic Island Content (Simulated) */}
                            <div className="w-2 h-2 rounded-full bg-[#1a1a1a]/50" />
                        </div>
                    </div>

                    {/* Status Bar */}
                    <div className="flex items-center justify-between px-8 pt-4 pb-2 bg-[#075E54] relative z-20">
                        <span className="text-white text-[13px] font-semibold pl-2">9:41</span>
                        <div className="flex items-center gap-1.5 pr-2">
                             <Signal className="w-4 h-4 text-white" />
                             <Wifi className="w-4 h-4 text-white" />
                             <Battery className="w-5 h-5 text-white" />
                        </div>
                    </div>

                    {/* WhatsApp Header */}
                    <div className="flex items-center gap-3 px-4 py-3 bg-[#075E54] relative z-10 border-b border-white/5">
                        <ChevronLeft className="w-6 h-6 text-white cursor-pointer" />
                        <div className="w-10 h-10 rounded-full bg-[#1a1a1a] flex items-center justify-center overflow-hidden flex-shrink-0 border-2 border-white/20">
                             <Image src="/orb-icon.png" alt="Voxly" width={40} height={40} className="object-cover" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-white text-[16px] font-semibold leading-tight truncate">Voxly AI</p>
                            <p className="text-[12px] text-emerald-100/80">{isTyping ? 'typing...' : 'online'}</p>
                        </div>
                        <div className="flex items-center gap-5 pr-1">
                            <Video className="w-6 h-6 text-white/90" />
                            <Phone className="w-5 h-5 text-white/90" />
                        </div>
                    </div>

                    {/* Chat Area */}
                    <div
                        ref={scrollRef}
                        className="flex-1 overflow-y-auto px-4 py-4 space-y-3 scroll-smooth relative z-0 custom-scrollbar"
                        style={{
                            backgroundColor: '#0B141A',
                            backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'60\' height=\'60\' viewBox=\'0 0 60 60\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'none\' fill-rule=\'evenodd\'%3E%3Cg fill=\'%23ffffff\' fill-opacity=\'0.02\'%3E%3Cpath d=\'M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z\'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")'
                        }}
                    >
                        {/* Date chip */}
                        <div className="flex justify-center mb-4 sticky top-0 z-10">
                            <span className="px-3 py-1 rounded-lg bg-[#1D2A33]/90 backdrop-blur-sm text-[11px] text-gray-400 font-medium shadow-sm">Today</span>
                        </div>

                        <AnimatePresence mode="popLayout">
                            {messages.map((msg) => (
                                <motion.div
                                    key={msg.id}
                                    initial={{ opacity: 0, y: 12, scale: 0.95 }}
                                    animate={{ opacity: 1, y: 0, scale: 1 }}
                                    transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                                    className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
                                >
                                    <div className={`max-w-[80%] px-3.5 py-2.5 rounded-xl relative shadow-sm ${
                                        msg.sender === 'user'
                                            ? 'bg-[#005C4B] rounded-tr-none'
                                            : 'bg-[#1D2A33] rounded-tl-none'
                                    }`}>
                                        {msg.sender === 'ai' && (
                                            <p className="text-[11px] text-violet-400 font-semibold mb-0.5">Voxly AI</p>
                                        )}
                                        <p className="text-[15px] text-white/95 leading-relaxed whitespace-pre-line">{msg.text}</p>
                                        <div className="flex items-center justify-end gap-1 mt-1">
                                            <span className="text-[10px] text-white/40">{msg.time}</span>
                                            {msg.sender === 'user' && (
                                                <CheckCheck className={`w-3.5 h-3.5 ${msg.read ? 'text-blue-400' : 'text-white/30'}`} />
                                            )}
                                        </div>
                                    </div>
                                </motion.div>
                            ))}

                            {isTyping && (
                                <motion.div
                                    key="typing"
                                    initial={{ opacity: 0, y: 8 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0 }}
                                    className="flex justify-start"
                                >
                                    <div className="bg-[#1D2A33] rounded-xl rounded-tl-none px-4 py-3 shadow-sm">
                                        <TypingDots variant="whatsapp" />
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>

                    {/* Input Bar */}
                    <div className="flex items-end gap-2 px-3 py-3 bg-[#0B141A] relative z-10 pb-8">
                        <div className="flex-1 flex items-center bg-[#1D2A33] rounded-2xl px-3 py-2 min-h-[44px]">
                            <Smile className="w-6 h-6 text-gray-400 flex-shrink-0 mr-2 cursor-pointer" />
                            <textarea
                                value={inputValue}
                                onChange={(e) => onInputChange(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault();
                                        onSend();
                                    }
                                }}
                                placeholder="Message"
                                className="flex-1 bg-transparent text-[15px] text-white placeholder-gray-500 outline-none min-w-0 resize-none h-[24px] max-h-[100px] overflow-hidden py-0.5"
                                rows={1}
                            />
                            <Paperclip className="w-5 h-5 text-gray-400 flex-shrink-0 mx-2 rotate-45 cursor-pointer" />
                            {!inputValue && <Search className="w-5 h-5 text-gray-400 flex-shrink-0 cursor-pointer" />}
                        </div>
                        <button
                            onClick={onSend}
                            className={`w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 transition-all ${
                                inputValue.trim()
                                    ? 'bg-[#00A884] hover:bg-[#00A884]/80'
                                    : 'bg-[#00A884]'
                            }`}
                        >
                            {inputValue.trim() ? (
                                <Send className="w-5 h-5 text-white ml-0.5" />
                            ) : (
                                <Mic className="w-5 h-5 text-white" />
                            )}
                        </button>
                    </div>

                    {/* Home Indicator */}
                    <div className="absolute bottom-2 left-1/2 -translate-x-1/2 w-36 h-1.5 rounded-full bg-white/30 z-30" />
                </div>
            </div>
        </div>
    );
}

/* ─────────────────── Interactive Web Dashboard View ─────────────────── */
function DashboardView({ conversations, activeConvId, onSelectConv, isTyping, inputValue, onInputChange, onSend, scrollRef }: {
    conversations: Conversation[];
    activeConvId: string;
    onSelectConv: (id: string) => void;
    isTyping: boolean;
    inputValue: string;
    onInputChange: (v: string) => void;
    onSend: () => void;
    scrollRef: React.RefObject<HTMLDivElement | null>;
}) {
    const [activeTab, setActiveTab] = useState<'messages' | 'analytics' | 'team' | 'settings'>('messages');
    const activeConv = conversations.find(c => c.id === activeConvId) || conversations[0];
    const messages = activeConv.messages;

    // Content Switcher
    const renderContent = () => {
        switch (activeTab) {
            case 'messages':
                return (
                    <>
                        {/* Conversations List */}
                        <div className="w-72 border-r border-white/5 bg-white/[0.01] flex flex-col hidden md:flex">
                        <div className="px-5 py-5 border-b border-white/5">
                            <h3 className="text-sm font-semibold text-white/80">Conversations</h3>
                            <p className="text-[11px] text-white/30 mt-0.5">{conversations.length} active chats</p>
                        </div>
                        <div className="flex-1 overflow-y-auto custom-scrollbar">
                            {conversations.map((conv) => (
                                <div 
                                    key={conv.id} 
                                    onClick={() => onSelectConv(conv.id)}
                                    className={`flex items-center gap-3 px-5 py-4 cursor-pointer transition-all border-l-2 ${
                                        activeConvId === conv.id 
                                            ? 'bg-violet-500/10 border-violet-500' 
                                            : 'hover:bg-white/[0.03] border-transparent'
                                    }`}
                                >
                                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-violet-500/20 to-blue-500/20 flex items-center justify-center flex-shrink-0 relative">
                                        <span className="text-[12px] font-bold text-white/90">{conv.avatar}</span>
                                        {/* Status Dot */}
                                        <div className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-[#121212]" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center justify-between mb-0.5">
                                            <p className={`text-[13px] font-medium truncate ${activeConvId === conv.id ? 'text-white' : 'text-white/70'}`}>{conv.name}</p>
                                            {conv.unreadCount > 0 && (
                                                <span className="w-5 h-5 rounded-full bg-violet-500 text-[10px] font-bold text-white flex items-center justify-center flex-shrink-0">{conv.unreadCount}</span>
                                            )}
                                        </div>
                                        <p className="text-[11px] text-white/30 truncate">{conv.lastMessage}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Main Chat Area */}
                    <div className="flex-1 flex flex-col bg-[#0A0A12] min-w-0">
                        {/* Chat Header */}
                        <div className="flex items-center justify-between px-6 py-4 border-b border-white/5 bg-white/[0.01]">
                            <div className="flex items-center gap-3">
                                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-violet-500/20 to-blue-500/20 flex items-center justify-center">
                                    <span className="text-[12px] font-bold text-white/90">{activeConv.avatar}</span>
                                </div>
                                <div>
                                    <p className="text-[14px] font-semibold text-white">{activeConv.name}</p>
                                    <div className="flex items-center gap-1.5">
                                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                                        <span className="text-[11px] text-emerald-400/70">via {activeConv.platform} • online</span>
                                    </div>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="px-3 py-1.5 rounded-full bg-violet-500/10 border border-violet-500/15 text-[11px] text-violet-300 font-medium flex items-center gap-1.5">
                                    <Bot className="w-3.5 h-3.5" /> AI Agent Active
                                </span>
                            </div>
                        </div>

                        {/* Messages */}
                        <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-4 space-y-4 scroll-smooth custom-scrollbar">
                            <AnimatePresence mode="popLayout">
                                {messages.map((msg) => (
                                    <motion.div
                                        key={msg.id}
                                        initial={{ opacity: 0, y: 12, scale: 0.97 }}
                                        animate={{ opacity: 1, y: 0, scale: 1 }}
                                        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                                        className={`flex ${msg.sender === 'ai' ? 'justify-end' : 'justify-start'}`}
                                    >
                                        {msg.sender === 'user' && (
                                            <div className="flex items-start gap-3 max-w-[80%]">
                                                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-orange-400/30 to-amber-500/30 flex items-center justify-center flex-shrink-0 mt-0.5">
                                                    <span className="text-[10px] font-bold text-orange-300">{activeConv.avatar}</span>
                                                </div>
                                                <div>
                                                    <div className="bg-white/[0.05] rounded-2xl rounded-tl-sm px-5 py-3">
                                                        <p className="text-[14px] text-white/90 leading-relaxed whitespace-pre-line">{msg.text}</p>
                                                    </div>
                                                    <p className="text-[11px] text-white/20 mt-1 ml-1">{activeConv.platform} · {msg.time}</p>
                                                </div>
                                            </div>
                                        )}
                                        {msg.sender === 'ai' && (
                                            <div className="max-w-[80%]">
                                                <div className="bg-gradient-to-br from-violet-500/[0.08] to-blue-500/[0.05] border border-violet-500/10 rounded-2xl rounded-tr-sm px-5 py-3">
                                                    <div className="flex items-center gap-2 mb-2">
                                                        <div className="w-4 h-4 rounded-full overflow-hidden">
                                                            <Image src="/orb-icon.png" alt="AI" width={16} height={16} className="object-cover" />
                                                        </div>
                                                        <span className="text-[11px] text-violet-400/80 font-medium">Voxly AI</span>
                                                    </div>
                                                    <p className="text-[14px] text-white/90 leading-relaxed whitespace-pre-line">{msg.text}</p>
                                                </div>
                                                <p className="text-[11px] text-white/20 mt-1 text-right mr-1">Delivered ✓✓ · {msg.time}</p>
                                            </div>
                                        )}
                                    </motion.div>
                                ))}

                                {isTyping && (
                                    <motion.div
                                        key="typing-dash"
                                        initial={{ opacity: 0, y: 8 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0 }}
                                        className="flex justify-end"
                                    >
                                        <div className="bg-gradient-to-br from-violet-500/[0.06] to-blue-500/[0.03] border border-violet-500/10 rounded-2xl rounded-tr-sm px-5 py-4">
                                            <div className="flex items-center gap-2 mb-1">
                                                <div className="w-4 h-4 rounded-full overflow-hidden">
                                                    <Image src="/orb-icon.png" alt="AI" width={16} height={16} className="object-cover" />
                                                </div>
                                                <span className="text-[11px] text-violet-400/50 font-medium">Voxly AI is thinking...</span>
                                            </div>
                                            <TypingDots variant="dashboard" />
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>

                        {/* Input */}
                        <div className="px-6 py-5 border-t border-white/5 bg-white/[0.01]">
                            <div className="flex items-center gap-3">
                                <div className="flex-1 flex items-center bg-white/[0.03] border border-white/[0.08] rounded-xl px-4 py-3 focus-within:border-violet-500/30 transition-colors">
                                    <input
                                        type="text"
                                        value={inputValue}
                                        onChange={(e) => onInputChange(e.target.value)}
                                        onKeyDown={(e) => e.key === 'Enter' && onSend()}
                                        placeholder={`Message ${activeConv.name}...`}
                                        className="flex-1 bg-transparent text-[14px] text-white placeholder-white/20 outline-none"
                                    />
                                </div>
                                <button
                                    onClick={onSend}
                                    disabled={!inputValue.trim()}
                                    className="w-12 h-12 rounded-xl bg-violet-500 hover:bg-violet-400 disabled:bg-white/5 disabled:text-white/20 text-white flex items-center justify-center transition-all"
                                >
                                    <Send className="w-5 h-5" />
                                </button>
                            </div>
                        </div>
                    </div>
                </>
                );
            case 'analytics':
                return (
                    <div className="flex-1 p-8 bg-[#0A0A12]">
                        <h3 className="text-xl font-bold text-white mb-6">Analytics Overview</h3>
                        <div className="grid grid-cols-2 gap-4 mb-8">
                            <div className="p-6 rounded-2xl bg-white/[0.03] border border-white/5">
                                <p className="text-sm text-white/40 mb-2">Total Messages</p>
                                <p className="text-3xl font-bold text-white">12,847</p>
                                <span className="text-xs text-emerald-400 font-medium">+24% this week</span>
                            </div>
                            <div className="p-6 rounded-2xl bg-white/[0.03] border border-white/5">
                                <p className="text-sm text-white/40 mb-2">Sent via Voxly AI</p>
                                <p className="text-3xl font-bold text-white">8,492</p>
                                <span className="text-xs text-emerald-400 font-medium">98% Accuracy</span>
                            </div>
                        </div>
                        <div className="h-64 rounded-2xl bg-white/[0.03] border border-white/5 p-6 flex items-end justify-between gap-2">
                             {[30, 45, 35, 60, 50, 75, 65, 80, 70, 90, 85, 95].map((h, i) => (
                                <motion.div 
                                    key={i}
                                    initial={{ height: 0 }}
                                    animate={{ height: `${h}%` }}
                                    transition={{ duration: 0.5, delay: i * 0.05 }}
                                    className="flex-1 bg-violet-500/20 hover:bg-violet-500/40 rounded-t-sm transition-colors relative group"
                                >
                                    <div className="absolute opacity-0 group-hover:opacity-100 bottom-full mb-2 left-1/2 -translate-x-1/2 text-[10px] text-white bg-black px-2 py-1 rounded">
                                        {h} msgs
                                    </div>
                                </motion.div>
                             ))}
                        </div>
                    </div>
                );
             case 'team':
                return (
                    <div className="flex-1 p-8 bg-[#0A0A12]">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-xl font-bold text-white">Team Members</h3>
                            <button className="px-4 py-2 rounded-lg bg-white/10 text-sm text-white hover:bg-white/20 transition-colors">Add Member</button>
                        </div>
                        <div className="space-y-3">
                            {['Sarah Chen', 'Alex Kumar', 'Mike Ross', 'Rachel Green'].map((name, i) => (
                                <div key={i} className="flex items-center justify-between p-4 rounded-xl bg-white/[0.02] border border-white/5 hover:bg-white/[0.04]">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-gray-700 to-gray-600 flex items-center justify-center text-sm font-bold text-white">
                                            {name.split(' ').map(n=>n[0]).join('')}
                                        </div>
                                        <div>
                                            <p className="text-sm font-medium text-white">{name}</p>
                                            <p className="text-xs text-white/40">{i === 0 ? 'Admin' : 'Editor'}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <div className="w-2 h-2 rounded-full bg-emerald-500" />
                                        <span className="text-xs text-white/30">Active</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                );
             case 'settings':
                return (
                     <div className="flex-1 p-8 bg-[#0A0A12]">
                        <h3 className="text-xl font-bold text-white mb-6">Settings</h3>
                        <div className="space-y-6">
                            {[
                                { label: 'AI Auto-Reply', active: true },
                                { label: 'Email Notifications', active: false },
                                { label: 'Weekly Reports', active: true }
                            ].map((setting, i) => (
                                <div key={i} className="flex items-center justify-between p-4 rounded-xl bg-white/[0.02] border border-white/5">
                                    <span className="text-sm text-white/80">{setting.label}</span>
                                    <div className={`w-11 h-6 rounded-full relative transition-colors ${setting.active ? 'bg-violet-500' : 'bg-white/10'}`}>
                                        <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${setting.active ? 'left-6' : 'left-1'}`} />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                );
        }
    };

    return (
        <div className="w-full max-w-[1000px] mx-auto filter drop-shadow-[0_25px_50px_rgba(0,0,0,0.5)]">
            <div className="rounded-2xl border border-white/10 bg-[#0A0A12] overflow-hidden shadow-2xl shadow-black/60 transform transition-transform h-[500px] sm:h-[650px] flex flex-col" style={{ transformStyle: 'preserve-3d' }}>
                 {/* 3D Sheen */}
                 <div className="absolute inset-0 bg-gradient-to-tr from-white/5 via-transparent to-transparent pointer-events-none z-50 rounded-2xl" />

                {/* Browser Chrome */}
                <div className="flex items-center gap-2 px-4 py-3 border-b border-white/5 bg-white/[0.02]">
                    <div className="flex gap-1.5">
                        <div className="w-3 h-3 rounded-full bg-[#FF5F56] opacity-80" />
                        <div className="w-3 h-3 rounded-full bg-[#FFBD2E] opacity-80" />
                        <div className="w-3 h-3 rounded-full bg-[#27C93F] opacity-80" />
                    </div>
                    <div className="flex-1 mx-4">
                        <div className="h-7 bg-white/[0.04] rounded-lg mx-auto max-w-md border border-white/[0.06] flex items-center px-3 gap-2">
                            <Search className="w-3 h-3 text-white/20" />
                            <span className="text-[11px] text-white/25 font-mono">app.voxly.dev/dashboard</span>
                        </div>
                    </div>
                </div>

                <div className="flex flex-1 overflow-hidden">
                    {/* Interactive Sidebar */}
                    <div className="w-20 border-r border-white/5 bg-white/[0.01] flex flex-col items-center py-6 gap-6 z-10">
                        <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-violet-500/20 mb-2">
                            <Image src="/orb-icon.png" alt="Voxly" width={28} height={28} className="object-cover" />
                        </div>
                        <div className="w-8 h-[1px] bg-white/5" />
                        
                        <div className="flex flex-col gap-4 w-full px-3">
                            {[
                                { id: 'messages', icon: MessageSquare },
                                { id: 'analytics', icon: BarChart3 },
                                { id: 'team', icon: Users },
                            ].map((item) => (
                                <div 
                                    key={item.id}
                                    onClick={() => setActiveTab(item.id as any)}
                                    className={`relative group w-12 h-12 rounded-2xl flex items-center justify-center cursor-pointer transition-all duration-300 ${
                                        activeTab === item.id 
                                            ? 'bg-violet-500/20 text-violet-400' 
                                            : 'text-white/30 hover:text-white hover:bg-white/5'
                                    }`}
                                >
                                    {/* Active Glow */}
                                    {activeTab === item.id && (
                                        <motion.div 
                                            layoutId="sidebar-active"
                                            className="absolute inset-0 rounded-2xl bg-violet-500/20 shadow-[0_0_15px_rgba(139,92,246,0.2)]"
                                            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                                        />
                                    )}
                                    {/* Vertical Indicator */}
                                    {activeTab === item.id && (
                                        <motion.div 
                                            layoutId="sidebar-indicator"
                                            className="absolute right-[-14px] top-2 bottom-2 w-1 rounded-l-full bg-violet-500"
                                        />
                                    )}
                                    <item.icon className="w-6 h-6 relative z-10" />
                                </div>
                            ))}
                        </div>

                        <div className="mt-auto pb-2 w-full px-3">
                             <div 
                                onClick={() => setActiveTab('settings')}
                                className={`relative w-12 h-12 rounded-2xl flex items-center justify-center cursor-pointer transition-all mx-auto ${
                                    activeTab === 'settings' ? 'text-violet-400 bg-violet-500/20' : 'text-white/30 hover:text-white'
                                }`}
                            >
                                {activeTab === 'settings' && (
                                    <motion.div 
                                        layoutId="sidebar-active"
                                        className="absolute inset-0 rounded-2xl bg-violet-500/20 shadow-[0_0_15px_rgba(139,92,246,0.2)]"
                                        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                                    />
                                )}
                                {activeTab === 'settings' && (
                                    <motion.div 
                                        layoutId="sidebar-indicator"
                                        className="absolute right-[-14px] top-2 bottom-2 w-1 rounded-l-full bg-violet-500"
                                    />
                                )}
                                <Settings className="w-6 h-6 relative z-10" />
                            </div>
                        </div>
                    </div>

                    {renderContent()}
                </div>
            </div>
        </div>
    );
}

export default function InteractiveDemo() {
    const [activeView, setActiveView] = useState<'whatsapp' | 'dashboard'>('whatsapp');
    const [conversations, setConversations] = useState<Conversation[]>(initialConversations);
    const [activeConvId, setActiveConvId] = useState<string>('sarah');
    const [isTyping, setIsTyping] = useState(false);
    const [inputValue, setInputValue] = useState('');
    const [demoComplete, setDemoComplete] = useState(false);
    const [showNotification, setShowNotification] = useState(false);
    const [demoStarted, setDemoStarted] = useState(false);
    
    // Use an internal ref for intersection to avoid re-triggering
    const sectionRef = useRef<HTMLDivElement>(null);
    const inViewRef = useRef(false);
    
    // Scroll handling
    const whatsappScrollRef = useRef<HTMLDivElement>(null);
    const dashboardScrollRef = useRef<HTMLDivElement>(null);

    const scrollToBottom = useCallback(() => {
        requestAnimationFrame(() => {
            whatsappScrollRef.current?.scrollTo({ top: whatsappScrollRef.current.scrollHeight, behavior: 'smooth' });
            dashboardScrollRef.current?.scrollTo({ top: dashboardScrollRef.current.scrollHeight, behavior: 'smooth' });
        });
    }, []);

    // Observer for "Landing" simulation
    useEffect(() => {
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting && !inViewRef.current) {
                    inViewRef.current = true; // Only trigger once
                    // Delay notification a bit
                    setTimeout(() => setShowNotification(true), 1200);
                }
            });
        }, { threshold: 0.4 });
        
        if (sectionRef.current) observer.observe(sectionRef.current);
        return () => observer.disconnect();
    }, []);

    // Start Demo Logic (Only once or on notification click)
    const startDemo = useCallback(() => {
        if (demoStarted) return;
        setDemoStarted(true);
        setShowNotification(false);
        // Only trigger auto-play if the active conversation is Sarah (demo conv)
        if (activeConvId !== 'sarah') return;

        setIsTyping(true);
        setTimeout(() => {
             setIsTyping(false);
             scrollToBottom();
        }, 1500);

    }, [demoStarted, activeConvId, scrollToBottom]);


    // Handle user message
    const handleSend = useCallback(() => {
        const text = inputValue.trim();
        if (!text) return;
        if (!demoStarted) setDemoStarted(true);

        const userMsg: ChatMessage = {
            id: `user-${Date.now()}`,
            sender: 'user',
            text,
            time: getCurrentTime(),
            delivered: true,
            read: false,
        };

        // Update the active conversation
        setConversations(prev => prev.map(conv => {
            if (conv.id === activeConvId) {
                return {
                    ...conv,
                    messages: [...conv.messages, userMsg],
                    lastMessage: text,
                    unreadCount: 0
                };
            }
            return conv;
        }));

        setInputValue('');
        scrollToBottom();

        // AI Reply
        setTimeout(() => { setIsTyping(true); scrollToBottom(); }, 600);
        setTimeout(() => {
            setIsTyping(false);
            const aiMsg: ChatMessage = {
                id: `ai-${Date.now()}`,
                sender: 'ai',
                text: getAIResponse(text),
                time: getCurrentTime(),
                delivered: true,
                read: true,
            };
            
            setConversations(prev => prev.map(conv => {
                if (conv.id === activeConvId) {
                    return {
                        ...conv,
                        messages: [...conv.messages, aiMsg],
                        lastMessage: aiMsg.text,
                    };
                }
                return conv;
            }));
            scrollToBottom();
        }, 2000 + Math.random() * 1000);
    }, [inputValue, scrollToBottom, demoStarted, activeConvId]);

    const activeConv = conversations.find(c => c.id === activeConvId) || conversations[0];

    return (
        <section ref={sectionRef} className="py-16 sm:py-24 px-4 sm:px-6 max-w-7xl mx-auto perspective-[2000px] relative">
            {/* Notification Toast */}
            <AnimatePresence>
                {showNotification && (
                    <Notification onDismiss={startDemo} />
                )}
            </AnimatePresence>

            {/* Section Header */}
            <motion.div
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-80px' }}
                transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
                className="text-center mb-12 sm:mb-16"
            >
                <span className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs font-semibold tracking-wide uppercase mb-6">
                    <MessageSquare className="w-3 h-3" /> Live Demo
                </span>
                <h2 className="text-3xl sm:text-5xl lg:text-6xl font-bold tracking-tighter mb-4">
                    See it in <span className="text-white/30">action.</span>
                </h2>
                <p className="text-white/40 text-base sm:text-lg max-w-xl mx-auto leading-relaxed">
                    Explore active conversations. <span className="text-white/80">Click dashboard contacts</span> to switch contexts.
                </p>

                {/* Active Context Hint */}
                <div className="mt-8 flex justify-center">
                    <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10 backdrop-blur-md">
                        <span className="text-[11px] text-white/40 font-medium uppercase tracking-wider">Active Chat</span>
                        <div className="w-px h-3 bg-white/10" />
                        <span className="text-[13px] text-white font-semibold flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                            {activeConv.name}
                        </span>
                    </div>
                </div>
            </motion.div>

            {/* View Toggle */}
            <motion.div
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: 0.2 }}
                className="flex items-center justify-center gap-2 mb-10 relative z-20"
            >
                <div className="inline-flex rounded-full bg-white/[0.04] border border-white/[0.08] p-1">
                    {[
                        { id: 'whatsapp' as const, icon: Smartphone, label: 'WhatsApp' },
                        { id: 'dashboard' as const, icon: Monitor, label: 'Dashboard' },
                    ].map((view) => (
                        <button
                            key={view.id}
                            onClick={() => setActiveView(view.id)}
                            className={`relative flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-medium transition-colors ${
                                activeView === view.id ? 'text-white' : 'text-white/40 hover:text-white/60'
                            }`}
                        >
                            {activeView === view.id && (
                                <motion.div
                                    layoutId="demo-toggle"
                                    className="absolute inset-0 rounded-full bg-white/10 border border-white/10"
                                    transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                                />
                            )}
                            <view.icon className="w-4 h-4 relative z-10" />
                            <span className="relative z-10">{view.label}</span>
                        </button>
                    ))}
                </div>
            </motion.div>

            {/* Demo Views - Wrapped in 3D Tilt */}
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.7, delay: 0.3 }}
            >
                <Tilt3D>
                    <AnimatePresence mode="wait">
                        {activeView === 'whatsapp' ? (
                            <motion.div
                                key="whatsapp"
                                initial={{ opacity: 0, rotateY: -10 }}
                                animate={{ opacity: 1, rotateY: 0 }}
                                exit={{ opacity: 0, rotateY: 10 }}
                                transition={{ duration: 0.4 }}
                            >
                                <WhatsAppView
                                    messages={activeConv.messages}
                                    isTyping={isTyping}
                                    inputValue={inputValue}
                                    onInputChange={setInputValue}
                                    onSend={handleSend}
                                    scrollRef={whatsappScrollRef}
                                    contactName={activeConv.name}
                                />
                            </motion.div>
                        ) : (
                            <motion.div
                                key="dashboard"
                                initial={{ opacity: 0, rotateY: 10 }}
                                animate={{ opacity: 1, rotateY: 0 }}
                                exit={{ opacity: 0, rotateY: -10 }}
                                transition={{ duration: 0.4 }}
                            >
                                <DashboardView
                                    conversations={conversations}
                                    activeConvId={activeConvId}
                                    onSelectConv={setActiveConvId}
                                    isTyping={isTyping}
                                    inputValue={inputValue}
                                    onInputChange={setInputValue}
                                    onSend={handleSend}
                                    scrollRef={dashboardScrollRef}
                                />
                            </motion.div>
                        )}
                    </AnimatePresence>
                </Tilt3D>
            </motion.div>
        </section>
    );
}
