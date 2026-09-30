'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import ReactMarkdown, { type Components } from 'react-markdown';
import { Loader2, RefreshCw, Send, Sparkles, User, AlertTriangle, Wrench } from 'lucide-react';
import { aiAPI, projectsAPI, getApiErrorMessage } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import type { Project } from '@/types';

type Message =
    | { id: string; role: 'user'; content: string }
    | { id: string; role: 'ai'; content: string; tools: string[] }
    | { id: string; role: 'error'; content: string; retryOf: string };

const SUGGESTIONS = [
    'What is the status of this project?',
    'Summarize recent GitHub activity.',
    'Which milestones are due soon?',
    'Draft a short progress update I can send the client.',
];

// react-markdown 10 has no `inline` prop: `code` is always inline-styled and
// `pre` owns the block treatment. (The old component checked `inline`, which
// is always undefined now, so every `snippet` rendered as a block <div>
// inside a <p>.)
const MARKDOWN: Components = {
    p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
    ul: ({ children }) => <ul className="list-disc pl-5 mb-2 space-y-1">{children}</ul>,
    ol: ({ children }) => <ol className="list-decimal pl-5 mb-2 space-y-1">{children}</ol>,
    a: ({ children, href }) => (
        <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2">{children}</a>
    ),
    code: ({ children }) => (
        <code className="font-mono text-[12px] bg-voxly-surface-3 text-foreground rounded px-1 py-0.5">{children}</code>
    ),
    pre: ({ children }) => (
        <pre className="my-2 overflow-x-auto rounded-lg border border-border bg-background p-3 text-[12px] [&>code]:bg-transparent [&>code]:p-0">{children}</pre>
    ),
};

export default function ChatPage() {
    return (
        <Suspense fallback={<div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>}>
            <AssistantChat />
        </Suspense>
    );
}

function AssistantChat() {
    // ?context=project:<id> — sent by the project page's "Ask Voxly about this
    // project" banner. It was ignored before, so the chat always opened in
    // general context despite the banner's promise.
    const searchParams = useSearchParams();
    const [context, setContext] = useState(() => {
        const c = searchParams.get('context');
        return c && /^project:[0-9a-f-]{36}$/i.test(c) ? c : 'general';
    });
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);

    const { data: projects = [], isLoading: projectsLoading } = useQuery({
        queryKey: ['projects'],
        queryFn: async () => (await projectsAPI.list()).data as Project[],
    });

    const contextProject = context.startsWith('project:')
        ? projects.find((p) => p.id === context.slice('project:'.length))
        : undefined;

    useEffect(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    }, [messages, loading]);

    const ask = async (text: string) => {
        const body = text.trim();
        if (!body || loading) return;
        const userMsg: Message = { id: crypto.randomUUID(), role: 'user', content: body };
        // A retry replaces the failed attempt rather than stacking duplicates.
        setMessages((prev) => [...prev.filter((m) => !(m.role === 'error' && m.retryOf === body)), userMsg]);
        setLoading(true);
        try {
            const res = await aiAPI.chat({ message: body, context });
            setMessages((prev) => [
                ...prev,
                { id: crypto.randomUUID(), role: 'ai', content: res.data.response, tools: res.data.tools_used ?? [] },
            ]);
        } catch (err) {
            // Shown as a system row with Retry — not in the assistant's voice.
            setMessages((prev) => [
                ...prev.filter((m) => m.id !== userMsg.id),
                userMsg,
                { id: crypto.randomUUID(), role: 'error', content: getApiErrorMessage(err, 'Voxly couldn’t answer just now.'), retryOf: body },
            ]);
        } finally {
            setLoading(false);
            inputRef.current?.focus();
        }
    };

    const submit = () => {
        const text = input;
        setInput('');
        void ask(text);
    };

    return (
        <div className="h-[calc(100dvh-56px-2rem)] lg:h-[calc(100dvh-56px-4rem)] flex flex-col max-w-4xl mx-auto gap-4">
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
                <div>
                    <h1 className="font-display font-bold text-[22px] text-foreground tracking-[-0.01em] flex items-center gap-2">
                        AI Assistant <Sparkles className="w-4 h-4 text-voxly-violet" />
                    </h1>
                    <p className="text-[13px] text-voxly-ink-6 mt-[3px]">
                        Ask about your projects — Voxly reads live status and GitHub data to answer.
                    </p>
                </div>
                <div className="w-full sm:w-64 space-y-1">
                    <Label htmlFor="chat-context" className="text-[11px] font-mono font-semibold uppercase tracking-[0.04em] text-voxly-ink-5">
                        Context
                    </Label>
                    <NativeSelect
                        id="chat-context"
                        value={context}
                        onChange={(e) => setContext(e.target.value)}
                        disabled={loading}
                    >
                        <option value="general">All projects (general)</option>
                        {context.startsWith('project:') && !contextProject && (
                            <option value={context}>{projectsLoading ? 'Loading project…' : 'Selected project'}</option>
                        )}
                        {projects.map((p) => (
                            <option key={p.id} value={`project:${p.id}`}>{p.name}</option>
                        ))}
                    </NativeSelect>
                </div>
            </div>

            <div className="flex-1 min-h-0 border border-border rounded-[14px] bg-card flex flex-col overflow-hidden">
                <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-5" aria-live="polite">
                    {messages.length === 0 && (
                        <div className="h-full flex flex-col items-center justify-center text-center px-4">
                            <div className="w-11 h-11 rounded-xl bg-voxly-violet-soft flex items-center justify-center mb-4 text-voxly-violet">
                                <Sparkles className="w-5 h-5" />
                            </div>
                            <h2 className="text-[14.5px] font-semibold text-foreground mb-1.5">
                                {contextProject ? `Ask about ${contextProject.name}` : 'What do you want to know?'}
                            </h2>
                            <p className="text-[13px] text-voxly-ink-6 max-w-sm mb-5">
                                {contextProject
                                    ? 'This project’s status and synced GitHub stats are loaded as context.'
                                    : 'Pick a project above for focused answers, or ask across all of them.'}
                            </p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-lg">
                                {SUGGESTIONS.map((s) => (
                                    <button
                                        key={s}
                                        type="button"
                                        onClick={() => void ask(s)}
                                        className="p-3 rounded-lg bg-background hover:bg-voxly-surface-2 border border-border hover:border-voxly-ink-4 text-[12.5px] text-voxly-ink-6 hover:text-foreground text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                    >
                                        {s}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {messages.map((msg) => {
                        if (msg.role === 'user') {
                            return (
                                <div key={msg.id} className="flex gap-3 justify-end">
                                    <div className="max-w-[85%] px-3.5 py-2.5 rounded-2xl rounded-tr-sm bg-primary text-primary-foreground text-[13.5px] leading-relaxed whitespace-pre-wrap break-words">
                                        {msg.content}
                                    </div>
                                    <div className="w-7 h-7 rounded-full bg-voxly-surface-3 flex items-center justify-center shrink-0 text-voxly-ink-6">
                                        <User className="w-3.5 h-3.5" />
                                    </div>
                                </div>
                            );
                        }
                        if (msg.role === 'error') {
                            return (
                                <div key={msg.id} role="alert" className="flex items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/10 px-3.5 py-2.5">
                                    <AlertTriangle className="w-4 h-4 text-destructive flex-none" />
                                    <span className="flex-1 text-[12.5px] text-foreground/90">{msg.content}</span>
                                    <Button size="sm" variant="outline" onClick={() => void ask(msg.retryOf)} disabled={loading} className="h-7 gap-1.5 text-[12px]">
                                        <RefreshCw className="w-3 h-3" /> Retry
                                    </Button>
                                </div>
                            );
                        }
                        return (
                            <div key={msg.id} className="flex gap-3">
                                <div className="w-7 h-7 rounded-full bg-voxly-violet-soft flex items-center justify-center shrink-0 text-voxly-violet ring-2 ring-voxly-violet/40">
                                    <Sparkles className="w-3.5 h-3.5" />
                                </div>
                                <div className="min-w-0 max-w-[85%]">
                                    <div className="text-[12.5px] font-semibold text-voxly-violet mb-1">Voxly</div>
                                    {msg.tools.length > 0 && (
                                        <div className="inline-flex items-center gap-1.5 font-mono text-[11px] text-voxly-ink-6 bg-voxly-surface-2 border border-border rounded-md px-2 py-1 mb-2">
                                            <Wrench className="w-3 h-3" /> used {msg.tools.join(', ')}
                                        </div>
                                    )}
                                    <div className="text-[13.5px] leading-relaxed text-foreground break-words">
                                        <ReactMarkdown components={MARKDOWN}>{msg.content}</ReactMarkdown>
                                    </div>
                                </div>
                            </div>
                        );
                    })}

                    {loading && (
                        <div className="flex gap-3 items-center" aria-label="Voxly is thinking">
                            <div className="w-7 h-7 rounded-full bg-voxly-violet-soft flex items-center justify-center shrink-0 text-voxly-violet">
                                <Sparkles className="w-3.5 h-3.5" />
                            </div>
                            <div className="flex items-center gap-1 h-7">
                                <span className="w-1.5 h-1.5 bg-voxly-ink-5 rounded-full animate-bounce [animation-delay:-0.3s]" />
                                <span className="w-1.5 h-1.5 bg-voxly-ink-5 rounded-full animate-bounce [animation-delay:-0.15s]" />
                                <span className="w-1.5 h-1.5 bg-voxly-ink-5 rounded-full animate-bounce" />
                            </div>
                        </div>
                    )}
                </div>

                <form
                    onSubmit={(e) => { e.preventDefault(); submit(); }}
                    className="p-3 sm:p-4 border-t border-border bg-voxly-surface-2/40 flex items-end gap-2"
                >
                    <Label htmlFor="chat-input" className="sr-only">Message</Label>
                    <Textarea
                        id="chat-input"
                        ref={inputRef}
                        rows={1}
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={(e) => {
                            // Enter sends; Shift+Enter adds a line.
                            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                                e.preventDefault();
                                submit();
                            }
                        }}
                        placeholder={contextProject ? `Ask about ${contextProject.name}…` : 'Ask Voxly anything…'}
                        className="min-h-[42px] max-h-40 resize-none"
                    />
                    <Button type="submit" disabled={loading || !input.trim()} aria-label="Send message" className="h-[42px] w-[42px] p-0 flex-none">
                        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    </Button>
                </form>
            </div>
        </div>
    );
}
