'use client';

import { useState, useRef, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Bot, User, Send, Sparkles, ChevronDown } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

interface Message {
    id: string;
    role: 'user' | 'ai';
    content: string;
}

interface Project {
    id: string;
    name: string;
}

function MarkdownCode({ inline, children, ...props }: any) {
    return inline
        ? <code className="bg-black/30 px-1 py-0.5 rounded text-violet-200 font-mono text-xs" {...props}>{children}</code>
        : <div className="bg-black/30 p-2 rounded-md my-2 overflow-x-auto"><code className="text-xs font-mono text-gray-300" {...props}>{children}</code></div>;
}

function MarkdownParagraph({ children }: any) {
    return <p className="mb-2 last:mb-0">{children}</p>;
}

function MarkdownUnorderedList({ children }: any) {
    return <ul className="list-disc pl-4 mb-2 space-y-1">{children}</ul>;
}

function MarkdownOrderedList({ children }: any) {
    return <ol className="list-decimal pl-4 mb-2 space-y-1">{children}</ol>;
}

export default function ChatPage() {
    const { token } = useAuth();
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    
    // Context State
    const [projects, setProjects] = useState<Project[]>([]);
    const [context, setContext] = useState<string>('general');
    
    const scrollRef = useRef<HTMLDivElement>(null);

    // Fetch Projects on Mount
    useEffect(() => {
        if (!token) return;
        
        const fetchProjects = async () => {
            try {
                const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/projects`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (res.ok) {
                    const data = await res.json();
                    if (Array.isArray(data)) {
                        setProjects(data);
                    }
                }
            } catch (e) {
                console.error("Failed to fetch projects", e);
            }
        };
        
        fetchProjects();
    }, [token]);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages]);

    const sendMessage = async () => {
        if (!input.trim() || loading) return;

        const userMsg = input;
        setInput('');
        setMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'user', content: userMsg }]);
        setLoading(true);

        try {
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/ai/chat`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ 
                    message: userMsg, 
                    context: context  // Send selected context (e.g., "general" or "project:ID")
                })
            });
            
            if (!res.ok) throw new Error('Failed to fetch');
            
            const data = await res.json();
            setMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'ai', content: data.response }]);
        } catch (error) {
            setMessages(prev => [...prev, {
                id: crypto.randomUUID(),
                role: 'ai',
                content: "Error: I couldn't reach the server. Please check if the Backend is running.",
            }]);
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="h-[calc(100vh-100px)] flex flex-col max-w-4xl mx-auto">
            {/* Header with Selector */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
                <div className="flex items-center gap-2">
                    <Sparkles className="w-6 h-6 text-violet-400" />
                    <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-violet-400 to-blue-400">
                        Chat with Voxly
                    </h1>
                </div>
                
                {/* Project Context Selector */}
                <div className="relative w-full sm:w-64">
                    <select
                        value={context}
                        onChange={(e) => setContext(e.target.value)}
                        className="w-full appearance-none bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-violet-500/50 cursor-pointer"
                    >
                        <option value="general" className="bg-[#0a0a0f] text-white">General Context</option>
                        {projects.length > 0 && <option disabled className="bg-[#0a0a0f] text-white/30">── Projects ──</option>}
                        {projects.map(p => (
                            <option key={p.id} value={`project:${p.id}`} className="bg-[#0a0a0f] text-white">
                                📂 {p.name}
                            </option>
                        ))}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/50 pointer-events-none" />
                </div>
            </div>

            <Card className="flex-1 glass-card border-white/10 flex flex-col overflow-hidden bg-[#0a0a0f]/50">
                <CardContent ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-6">
                    {messages.length === 0 && (
                        <div className="h-full flex flex-col items-center justify-center text-center text-white/40">
                            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-500/10 to-blue-500/10 border border-white/5 flex items-center justify-center mb-4">
                                <Bot className="w-8 h-8 text-violet-400/80" />
                            </div>
                            <h3 className="text-lg font-medium text-white mb-2">I am Voxly, your AI Project Manager.</h3>
                            <p className="text-sm max-w-sm mb-4">Select a project above to give me context, or just ask general questions.</p>
                            
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-lg mt-4">
                                <button onClick={() => setInput("What is the status of the current project?")} className="p-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 text-xs text-left transition-colors">
                                    &quot;When is the next milestone?&quot;
                                </button>
                                <button onClick={() => setInput("Summarize recent GitHub activity.")} className="p-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 text-xs text-left transition-colors">
                                    &quot;Summarize recent GitHub activity&quot;
                                </button>
                            </div>
                        </div>
                    )}
                    
                    {messages.map((msg) => (
                        <div key={msg.id} className={`flex gap-3 ${msg.role === 'ai' ? 'justify-start' : 'justify-end'}`}>
                            {msg.role === 'ai' && (
                                <div className="w-8 h-8 rounded-full bg-violet-500/20 flex items-center justify-center border border-violet-500/30 shrink-0">
                                    <Bot className="w-4 h-4 text-violet-300" />
                                </div>
                            )}
                            
                            <div className={`max-w-[85%] p-3.5 rounded-2xl text-sm leading-relaxed shadow-sm ${
                                msg.role === 'ai' 
                                    ? 'bg-white/5 border border-white/10 text-gray-200 rounded-tl-none' 
                                    : 'bg-violet-600 text-white rounded-tr-none'
                            }`}>
                                <ReactMarkdown 
                                    components={{
                                        code: MarkdownCode,
                                        p: MarkdownParagraph,
                                        ul: MarkdownUnorderedList,
                                        ol: MarkdownOrderedList,
                                    }}
                                >
                                    {msg.content}
                                </ReactMarkdown>
                            </div>
                            
                            {msg.role === 'user' && (
                                <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center border border-white/10 shrink-0">
                                    <User className="w-4 h-4 text-white" />
                                </div>
                            )}
                        </div>
                    ))}
                    {loading && (
                        <div className="flex gap-3">
                             <div className="w-8 h-8 rounded-full bg-violet-500/20 flex items-center justify-center border border-violet-500/30 shrink-0">
                                <Bot className="w-4 h-4 text-violet-300" />
                            </div>
                            <div className="flex items-center gap-1 h-8">
                                <span className="w-1.5 h-1.5 bg-white/40 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                                <span className="w-1.5 h-1.5 bg-white/40 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                                <span className="w-1.5 h-1.5 bg-white/40 rounded-full animate-bounce"></span>
                            </div>
                        </div>
                    )}
                </CardContent>
                
                <div className="p-4 border-t border-white/10 bg-black/40 backdrop-blur-md">
                    <form onSubmit={(e) => { e.preventDefault(); sendMessage(); }} className="flex gap-2 relative">
                        <Input 
                            value={input}
                            onChange={e => setInput(e.target.value)}
                            placeholder={`Ask Voxly about ${context === 'general' ? 'anything' : 'this project'}...`}
                            className="bg-white/5 border-white/10 text-white focus:border-violet-500/50 pr-12 h-11"
                            disabled={loading}
                        />
                        <Button 
                            type="submit" 
                            disabled={loading || !input.trim()} 
                            className="absolute right-1 top-1 bottom-1 h-auto bg-violet-600 hover:bg-violet-500 w-9 p-0 rounded-lg transition-all"
                        >
                            <Send className="w-4 h-4" />
                        </Button>
                    </form>
                </div>
            </Card>
        </div>
    );
}
