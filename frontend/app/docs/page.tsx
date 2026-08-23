'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import {
    MessageSquare,
    BookOpen,
    Rocket,
    Server,
    Key,
    Settings,
    HelpCircle,
    Copy,
    Check,
    ChevronRight,
    ArrowLeft,
    Search,
    Menu,
    X,
    ExternalLink,
    Terminal,
    Database,
    Globe,
    Shield,
    Code2,
    GitBranch,
    Zap,
} from 'lucide-react';

/* ─── Types ─── */
type Section = {
    id: string;
    title: string;
    icon: React.ElementType;
};

/* ─── Sections config ─── */
const sections: Section[] = [
    { id: 'getting-started', title: 'Getting Started', icon: Rocket },
    { id: 'cli-tools', title: 'CLI Tools', icon: Terminal },
    { id: 'architecture', title: 'Architecture', icon: Server },
    { id: 'api-reference', title: 'API Reference', icon: Code2 },
    { id: 'configuration', title: 'Configuration', icon: Settings },
    { id: 'deployment', title: 'Deployment', icon: Globe },
    { id: 'faq', title: 'FAQ', icon: HelpCircle },
];

/* ─── Code Block with Copy ─── */
function CodeBlock({ code, language = 'bash' }: { code: string; language?: string }) {
    const [copied, setCopied] = useState(false);
    const copy = () => {
        navigator.clipboard.writeText(code);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };
    return (
        <div className="relative group rounded-xl overflow-hidden border border-white/10 my-4">
            <div className="flex items-center justify-between px-4 py-2 bg-white/5 border-b border-white/5">
                <span className="text-xs text-white/40 font-mono">{language}</span>
                <button onClick={copy} className="text-white/40 hover:text-white transition-colors p-1 rounded-md hover:bg-white/5">
                    {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
            </div>
            <pre className="p-4 overflow-x-auto text-sm font-mono text-white/80 bg-background/80">
                <code>{code}</code>
            </pre>
        </div>
    );
}

/* ─── API Endpoint Row ─── */
function ApiRow({ method, path, desc, auth }: { method: string; path: string; desc: string; auth: string }) {
    const methodColors: Record<string, string> = {
        GET: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
        POST: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
        PUT: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
        PATCH: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
        DELETE: 'bg-red-500/20 text-red-400 border-red-500/30',
    };
    return (
        <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-4 py-3 border-b border-white/5 last:border-0">
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-bold border w-fit ${methodColors[method] || methodColors.GET}`}>
                {method}
            </span>
            <code className="text-sm font-mono text-violet-300 flex-1">{path}</code>
            <span className="text-sm text-white/60 flex-1">{desc}</span>
            <span className="text-xs text-white/40 bg-white/5 px-2 py-1 rounded-md w-fit">{auth}</span>
        </div>
    );
}

/* ─── ENV Row ─── */
function EnvRow({ name, required, description, example }: { name: string; required: boolean; description: string; example: string }) {
    return (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-2 py-3 border-b border-white/5 last:border-0">
            <code className="text-sm font-mono text-violet-300">{name}</code>
            <span className={`text-xs px-2 py-0.5 rounded-md w-fit ${required ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'bg-white/5 text-white/40'}`}>
                {required ? 'Required' : 'Optional'}
            </span>
            <span className="text-sm text-white/60">{description}</span>
            <code className="text-xs text-white/40 font-mono">{example}</code>
        </div>
    );
}

/* ═══════════════════ DOCS PAGE ═══════════════════ */
export default function DocsPage() {
    const [activeSection, setActiveSection] = useState('getting-started');
    const [searchQuery, setSearchQuery] = useState('');
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const contentRef = useRef<HTMLDivElement>(null);

    const filteredSections = sections.filter((s) =>
        s.title.toLowerCase().includes(searchQuery.toLowerCase())
    );

    // Update active section on scroll
    useEffect(() => {
        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) {
                        setActiveSection(entry.target.id);
                    }
                });
            },
            { rootMargin: '-20% 0px -60% 0px' }
        );
        sections.forEach((s) => {
            const el = document.getElementById(s.id);
            if (el) observer.observe(el);
        });
        return () => observer.disconnect();
    }, []);

    const scrollTo = (id: string) => {
        document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        setSidebarOpen(false);
    };

    return (
        <div className="min-h-screen bg-background text-foreground">
            {/* Background */}
            <div className="fixed inset-0 bg-mesh opacity-20 pointer-events-none" />

            {/* Top nav */}
            <nav className="fixed top-0 w-full z-50 glass border-b border-white/5">
                <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <button onClick={() => setSidebarOpen(!sidebarOpen)} className="lg:hidden p-2 hover:bg-white/5 rounded-lg">
                            {sidebarOpen ? <X className="w-5 h-5 text-white/70" /> : <Menu className="w-5 h-5 text-white/70" />}
                        </button>
                        <Link href="/" className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-600 to-blue-600 flex items-center justify-center">
                                <MessageSquare className="w-4 h-4 text-white" />
                            </div>
                            <span className="text-lg font-bold text-white">Voxly</span>
                        </Link>
                        <span className="text-white/20 mx-2">/</span>
                        <span className="text-white/60 text-sm flex items-center gap-1.5">
                            <BookOpen className="w-4 h-4" /> Documentation
                        </span>
                    </div>
                    <div className="flex items-center gap-3">
                        <Link href="/" className="text-sm text-white/60 hover:text-white transition-colors flex items-center gap-1">
                            <ArrowLeft className="w-3.5 h-3.5" /> Home
                        </Link>
                        <Link href="/login">
                            <Button variant="ghost" size="sm" className="text-white/70 hover:text-white hover:bg-white/5">Login</Button>
                        </Link>
                    </div>
                </div>
            </nav>

            <div className="pt-16 flex">
                {/* Sidebar */}
                <aside className={`fixed lg:sticky top-16 left-0 z-40 h-[calc(100vh-4rem)] w-64 glass border-r border-white/5 overflow-y-auto transition-transform duration-300 lg:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
                    <div className="p-4">
                        {/* Search */}
                        <div className="relative mb-4">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                            <input
                                type="text"
                                placeholder="Search sections..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full pl-10 pr-4 py-2.5 text-sm bg-white/5 border border-white/5 rounded-xl text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-violet-500/50"
                            />
                        </div>

                        {/* Nav items */}
                        <nav className="space-y-1">
                            {filteredSections.map((s) => (
                                <button
                                    key={s.id}
                                    onClick={() => scrollTo(s.id)}
                                    className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 text-left ${activeSection === s.id
                                        ? 'bg-gradient-to-r from-violet-600/20 to-blue-600/20 text-white border border-violet-500/20'
                                        : 'text-white/60 hover:text-white hover:bg-white/5'
                                        }`}
                                >
                                    <s.icon className={`w-4 h-4 ${activeSection === s.id ? 'text-violet-400' : ''}`} />
                                    {s.title}
                                    {activeSection === s.id && <ChevronRight className="w-4 h-4 ml-auto text-violet-400" />}
                                </button>
                            ))}
                        </nav>
                    </div>
                </aside>

                {/* Mobile backdrop */}
                <AnimatePresence>
                    {sidebarOpen && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="fixed inset-0 bg-black/60 z-30 lg:hidden"
                            onClick={() => setSidebarOpen(false)}
                        />
                    )}
                </AnimatePresence>

                {/* Main content */}
                <main ref={contentRef} className="flex-1 px-4 lg:px-12 py-8 max-w-4xl">

                    {/* ─── GETTING STARTED ─── */}
                    <section id="getting-started" className="mb-16 scroll-mt-20">
                        <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}>
                            <div className="flex items-center gap-3 mb-6">
                                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-600/20 to-blue-600/20 border border-violet-500/20 flex items-center justify-center">
                                    <Rocket className="w-5 h-5 text-violet-400" />
                                </div>
                                <h2 className="text-2xl font-bold text-white">Getting Started</h2>
                            </div>
                            <p className="text-white/60 mb-6 leading-relaxed">
                                Get Voxly running locally in under 5 minutes. You&apos;ll need Node.js 18+, Python 3.11+, and PostgreSQL installed.
                            </p>

                            <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
                                <Zap className="w-4 h-4 text-emerald-400" /> One-Command Setup
                            </h3>
                            <p className="text-white/60 mb-4 text-sm">
                                The fastest way to get started is using our CLI tool. It scaffolds the project and handles service orchestration.
                            </p>
                            <CodeBlock language="bash" code={`# Install the Voxly CLI globaly (or run via npx)
npx voxly create my-agency

# Step into the directory
cd my-agency

# Start EVERYTHING (Backend + Frontend)
voxly dev`} />

                            <div className="glass-card p-4 mt-6 border-emerald-500/20 border">
                                <p className="text-emerald-400 text-sm font-medium mb-1">✓ You&apos;re all set!</p>
                                <p className="text-white/60 text-sm">
                                    Visit <code className="text-violet-300 bg-white/5 px-1.5 py-0.5 rounded">http://localhost:3000</code> for the dashboard
                                    and <code className="text-violet-300 bg-white/5 px-1.5 py-0.5 rounded">http://localhost:8000/docs</code> for the API.
                                </p>
                            </div>
                        </motion.div>
                    </section>

                    {/* ─── CLI TOOLS ─── */}
                    <section id="cli-tools" className="mb-16 scroll-mt-20">
                        <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}>
                            <div className="flex items-center gap-3 mb-6">
                                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-600/20 to-blue-600/20 border border-violet-500/20 flex items-center justify-center">
                                    <Terminal className="w-5 h-5 text-violet-400" />
                                </div>
                                <h2 className="text-2xl font-bold text-white">CLI Tools</h2>
                            </div>
                            <p className="text-white/60 mb-6 leading-relaxed">
                                Voxly comes with a powerful CLI to manage your development and production lifecycle.
                            </p>

                            <div className="space-y-6">
                                <div>
                                    <h4 className="text-sm font-semibold text-white mb-2">voxly create [dir]</h4>
                                    <p className="text-xs text-white/50 mb-3">Scaffolds a new Voxly instance with guided configuration for AI providers (OpenAI, Gemini, Claude).</p>
                                </div>
                                <div>
                                    <h4 className="text-sm font-semibold text-white mb-2">voxly dev</h4>
                                    <p className="text-xs text-white/50 mb-3">The &quot;One-Command&quot; orchestrator. Automatically boots the FastAPI server and Next.js frontend in development mode.</p>
                                </div>
                                <div>
                                    <h4 className="text-sm font-semibold text-white mb-2">voxly migrate</h4>
                                    <p className="text-xs text-white/50 mb-3">Triggers Alembic migrations to keep your database schema in sync with the latest updates.</p>
                                </div>
                            </div>
                        </motion.div>
                    </section>

                    {/* ─── ARCHITECTURE ─── */}
                    <section id="architecture" className="mb-16 scroll-mt-20">
                        <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}>
                            <div className="flex items-center gap-3 mb-6">
                                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500/20 to-cyan-600/20 border border-blue-500/20 flex items-center justify-center">
                                    <Server className="w-5 h-5 text-blue-400" />
                                </div>
                                <h2 className="text-2xl font-bold text-white">Architecture</h2>
                            </div>

                            <p className="text-white/60 mb-6 leading-relaxed">
                                Voxly follows a modern fullstack architecture with a FastAPI backend, Next.js frontend, and integrations with GitHub, WhatsApp (Twilio), and Claude AI.
                            </p>

                            {/* Architecture flow */}
                            <div className="glass-card p-6 mb-8">
                                <h3 className="text-lg font-semibold text-white mb-4">System Flow</h3>
                                <div className="grid grid-cols-1 md:grid-cols-5 gap-4 items-center">
                                    {[
                                        { id: 'github', icon: GitBranch, label: 'GitHub Repos', color: 'text-white', bg: 'from-gray-500/20 to-gray-600/20' },
                                        { id: 'arrow-1', icon: ChevronRight, label: '', color: 'text-white/30', bg: '' },
                                        { id: 'backend', icon: Server, label: 'FastAPI Backend\n+ Claude AI', color: 'text-violet-400', bg: 'from-violet-500/20 to-blue-600/20' },
                                        { id: 'arrow-2', icon: ChevronRight, label: '', color: 'text-white/30', bg: '' },
                                        { id: 'whatsapp', icon: MessageSquare, label: 'WhatsApp\n(Twilio)', color: 'text-emerald-400', bg: 'from-emerald-500/20 to-green-600/20' },
                                    ].map((item) =>
                                        item.bg ? (
                                            <div key={item.id} className={`glass-card p-4 text-center bg-gradient-to-br ${item.bg}`}>
                                                <item.icon className={`w-8 h-8 mx-auto mb-2 ${item.color}`} />
                                                <p className="text-xs text-white/70 whitespace-pre-line">{item.label}</p>
                                            </div>
                                        ) : (
                                            <div key={item.id} className="hidden md:flex items-center justify-center">
                                                <ChevronRight className="w-6 h-6 text-white/20" />
                                            </div>
                                        )
                                    )}
                                </div>
                            </div>

                            <div className="grid md:grid-cols-2 gap-4">
                                <div className="glass-card p-5">
                                    <h4 className="text-sm font-semibold text-white mb-3">Backend Stack</h4>
                                    <ul className="space-y-2 text-sm text-white/60">
                                        <li>• <strong className="text-white/80">FastAPI</strong> — REST API framework</li>
                                        <li>• <strong className="text-white/80">SQLAlchemy</strong> — ORM with PostgreSQL</li>
                                        <li>• <strong className="text-white/80">Alembic</strong> — Database migrations</li>
                                        <li>• <strong className="text-white/80">Anthropic Claude</strong> — AI responses</li>
                                        <li>• <strong className="text-white/80">Twilio</strong> — WhatsApp messaging</li>
                                        <li>• <strong className="text-white/80">Redis</strong> — Rate limiting &amp; caching</li>
                                    </ul>
                                </div>
                                <div className="glass-card p-5">
                                    <h4 className="text-sm font-semibold text-white mb-3">Frontend Stack</h4>
                                    <ul className="space-y-2 text-sm text-white/60">
                                        <li>• <strong className="text-white/80">Next.js 14</strong> — React framework</li>
                                        <li>• <strong className="text-white/80">TypeScript</strong> — Type-safe code</li>
                                        <li>• <strong className="text-white/80">Tailwind CSS</strong> — Utility-first CSS</li>
                                        <li>• <strong className="text-white/80">Framer Motion</strong> — Animations</li>
                                        <li>• <strong className="text-white/80">React Query</strong> — Data fetching</li>
                                        <li>• <strong className="text-white/80">React Hook Form</strong> — Form handling</li>
                                    </ul>
                                </div>
                            </div>
                        </motion.div>
                    </section>

                    {/* ─── API REFERENCE ─── */}
                    <section id="api-reference" className="mb-16 scroll-mt-20">
                        <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}>
                            <div className="flex items-center gap-3 mb-6">
                                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500/20 to-green-600/20 border border-emerald-500/20 flex items-center justify-center">
                                    <Code2 className="w-5 h-5 text-emerald-400" />
                                </div>
                                <h2 className="text-2xl font-bold text-white">API Reference</h2>
                            </div>

                            <p className="text-white/60 mb-2 text-sm">
                                Base URL: <code className="text-violet-300 bg-white/5 px-1.5 py-0.5 rounded">http://localhost:8000/api/v1</code>
                            </p>
                            <p className="text-white/40 mb-6 text-xs">
                                All endpoints require JWT Bearer token unless marked as &quot;Public&quot; or &quot;API Key&quot;.
                            </p>

                            {/* Auth */}
                            <h3 className="text-lg font-semibold text-white mb-3 mt-6">🔐 Authentication</h3>
                            <div className="glass-card p-4 mb-6">
                                <ApiRow method="POST" path="/auth/register" desc="Register a new user" auth="Public" />
                                <ApiRow method="POST" path="/auth/login" desc="Login and receive JWT token" auth="Public" />
                                <ApiRow method="GET" path="/auth/me" desc="Get current user profile" auth="JWT" />
                                <ApiRow method="PUT" path="/auth/me" desc="Update profile" auth="JWT" />
                            </div>

                            {/* Clients */}
                            <h3 className="text-lg font-semibold text-white mb-3">👥 Clients</h3>
                            <div className="glass-card p-4 mb-6">
                                <ApiRow method="GET" path="/clients" desc="List all clients" auth="JWT" />
                                <ApiRow method="POST" path="/clients" desc="Create a new client" auth="JWT" />
                                <ApiRow method="GET" path="/clients/:id" desc="Get client details" auth="JWT" />
                                <ApiRow method="PUT" path="/clients/:id" desc="Update client" auth="JWT" />
                                <ApiRow method="DELETE" path="/clients/:id" desc="Delete client" auth="JWT" />
                            </div>

                            {/* Projects */}
                            <h3 className="text-lg font-semibold text-white mb-3">📁 Projects</h3>
                            <div className="glass-card p-4 mb-6">
                                <ApiRow method="GET" path="/projects" desc="List all projects" auth="JWT / API Key" />
                                <ApiRow method="POST" path="/projects" desc="Create a project" auth="JWT" />
                                <ApiRow method="GET" path="/projects/:id" desc="Get project details" auth="JWT / API Key" />
                                <ApiRow method="PUT" path="/projects/:id" desc="Update project" auth="JWT" />
                            </div>

                            {/* Milestones */}
                            <h3 className="text-lg font-semibold text-white mb-3">🎯 Milestones</h3>
                            <div className="glass-card p-4 mb-6">
                                <ApiRow method="GET" path="/projects/:id/milestones" desc="List milestones for a project" auth="JWT" />
                                <ApiRow method="POST" path="/projects/:id/milestones" desc="Create a milestone" auth="JWT" />
                                <ApiRow method="PUT" path="/milestones/:id" desc="Update milestone" auth="JWT" />
                            </div>

                            {/* API Keys */}
                            <h3 className="text-lg font-semibold text-white mb-3">🔑 API Keys</h3>
                            <div className="glass-card p-4 mb-6">
                                <ApiRow method="GET" path="/api_keys" desc="List your API keys" auth="JWT" />
                                <ApiRow method="POST" path="/api_keys" desc="Generate a new API key" auth="JWT" />
                                <ApiRow method="DELETE" path="/api_keys/:id" desc="Revoke an API key" auth="JWT" />
                            </div>

                            {/* Billing */}
                            <h3 className="text-lg font-semibold text-white mb-3">💳 Billing</h3>
                            <div className="glass-card p-4 mb-6">
                                <ApiRow method="GET" path="/billing/plans" desc="List available plans" auth="Public" />
                                <ApiRow method="GET" path="/billing/subscription" desc="Get current subscription" auth="JWT" />
                                <ApiRow method="GET" path="/billing/usage" desc="Get usage statistics" auth="JWT" />
                                <ApiRow method="POST" path="/billing/checkout" desc="Create checkout session" auth="JWT" />
                            </div>

                            {/* Notifications */}
                            <h3 className="text-lg font-semibold text-white mb-3">📲 Notifications</h3>
                            <div className="glass-card p-4 mb-6">
                                <ApiRow method="POST" path="/notifications/send" desc="Send custom WhatsApp message" auth="JWT" />
                            </div>
                        </motion.div>
                    </section>

                    {/* ─── CONFIGURATION ─── */}
                    <section id="configuration" className="mb-16 scroll-mt-20">
                        <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}>
                            <div className="flex items-center gap-3 mb-6">
                                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500/20 to-yellow-600/20 border border-amber-500/20 flex items-center justify-center">
                                    <Settings className="w-5 h-5 text-amber-400" />
                                </div>
                                <h2 className="text-2xl font-bold text-white">Configuration</h2>
                            </div>
                            <p className="text-white/60 mb-6">All configuration is done via <code className="text-violet-300 bg-white/5 px-1.5 py-0.5 rounded">.env</code> file in the <code className="text-violet-300 bg-white/5 px-1.5 py-0.5 rounded">backend/</code> directory.</p>

                            <div className="glass-card p-4 overflow-x-auto">
                                <div className="grid grid-cols-1 md:grid-cols-4 gap-2 py-2 border-b border-white/10 mb-2 text-xs font-semibold text-white/50">
                                    <span>Variable</span><span>Required</span><span>Description</span><span>Example</span>
                                </div>
                                <EnvRow name="DATABASE_URL" required description="PostgreSQL connection string" example="postgresql://user:pass@localhost/voxly" />
                                <EnvRow name="SECRET_KEY" required description="JWT signing secret" example="your-super-secret-key-here" />
                                <EnvRow name="ANTHROPIC_API_KEY" required={false} description="Claude AI API key" example="sk-ant-..." />
                                <EnvRow name="OPENAI_API_KEY" required={false} description="OpenAI API key (for GPT-4o Vision)" example="sk-..." />
                                <EnvRow name="GEMINI_API_KEY" required={false} description="Google Gemini API key" example="AIza..." />
                                <EnvRow name="TWILIO_ACCOUNT_SID" required description="Twilio account SID" example="AC..." />
                                <EnvRow name="TWILIO_AUTH_TOKEN" required description="Twilio auth token" example="your_auth_token" />
                                <EnvRow name="TWILIO_WHATSAPP_NUMBER" required description="Twilio WhatsApp number" example="whatsapp:+14155238886" />
                                <EnvRow name="GITHUB_TOKEN" required={false} description="GitHub personal access token" example="ghp_..." />
                                <EnvRow name="REDIS_URL" required={false} description="Redis connection URL" example="redis://localhost:6379" />
                                <EnvRow name="STRIPE_SECRET_KEY" required={false} description="Stripe secret key for billing" example="sk_test_..." />
                                <EnvRow name="RAZORPAY_KEY_ID" required={false} description="Razorpay key ID (Indian billing)" example="rzp_test_..." />
                            </div>
                        </motion.div>
                    </section>

                    {/* ─── DEPLOYMENT ─── */}
                    <section id="deployment" className="mb-16 scroll-mt-20">
                        <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}>
                            <div className="flex items-center gap-3 mb-6">
                                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500/20 to-blue-600/20 border border-cyan-500/20 flex items-center justify-center">
                                    <Globe className="w-5 h-5 text-cyan-400" />
                                </div>
                                <h2 className="text-2xl font-bold text-white">Deployment</h2>
                            </div>

                             <h3 className="text-lg font-semibold text-white mb-3">Option 1: VPS / Hetzner (Recommended)</h3>
                            <p className="text-white/60 mb-4 text-sm">
                                Use our automated scripts to set up a production-ready VPS with Nginx, SSL, and Docker.
                            </p>
                            <CodeBlock language="bash" code={`# 1. SSH into your VPS and run setup
bash <(curl -s https://voxly.dev/install-server.sh)

# 2. Configure your .env and run deployment
./scripts/deploy_voxly.sh`} />

                            <h3 className="text-lg font-semibold text-white mb-3 mt-8">Option 2: Docker Compose (Self-Hosted)</h3>
                            <CodeBlock language="bash" code={`# Run in production mode
docker-compose -f docker-compose.prod.yml up -d`} />

                            <h3 className="text-lg font-semibold text-white mb-3 mt-8">Deployment Architecture</h3>
                            <div className="glass-card p-5 bg-white/5 border border-white/10 rounded-xl">
                                <p className="text-white/70 text-sm leading-relaxed">
                                    In production, Voxly uses **Nginx** as a reverse proxy to handle SSL termination (via Let&apos;s Encrypt) and load balancing between the Next.js frontend and FastAPI backend. All services are containerized for high availability and easy scaling.
                                </p>
                            </div>

                            <h3 className="text-lg font-semibold text-white mb-3 mt-8">Production Checklist</h3>
                            <div className="glass-card p-5">
                                <ul className="space-y-2 text-sm text-white/60">
                                    {[
                                        'Set strong SECRET_KEY (32+ chars)',
                                        'Configure production DATABASE_URL',
                                        'Enable HTTPS on all endpoints',
                                        'Set up Stripe/Razorpay webhook URLs',
                                        'Configure Twilio production credentials',
                                        'Set up Redis for rate limiting',
                                        'Enable CORS for your frontend domain',
                                        'Set up monitoring and logging',
                                    ].map((item) => (
                                        <li key={item} className="flex items-center gap-2">
                                            <Shield className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                                            {item}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        </motion.div>
                    </section>

                    {/* ─── FAQ ─── */}
                    <section id="faq" className="mb-16 scroll-mt-20">
                        <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}>
                            <div className="flex items-center gap-3 mb-6">
                                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-rose-500/20 to-pink-600/20 border border-rose-500/20 flex items-center justify-center">
                                    <HelpCircle className="w-5 h-5 text-rose-400" />
                                </div>
                                <h2 className="text-2xl font-bold text-white">FAQ</h2>
                            </div>

                            <div className="space-y-4">
                                {[
                                    { q: 'Can I use different AI providers?', a: 'Yes! Voxly supports a multi-provider "Bring Your Own Key" (BYOK) architecture. You can use Anthropic Claude, OpenAI (GPT-4o), or Google Gemini. Switch providers in your organization settings.' },
                                    { q: 'How does Vision support work?', a: 'When a client sends a screenshot on WhatsApp, Voxly uses multimodal LLMs (like GPT-4o or Gemini 1.5) to analyze the image, cross-reference it with your GitHub code, and optionally open issues automatically.' },
                                    { q: 'Is my client data secure?', a: 'Security is our priority. Voxly uses industry-standard JWT for auth, enforces strict Row Level Security (RLS) in the database, and never trains models on your private repository data.' },
                                    { q: 'How do I add custom tools?', a: 'You can extend Voxly by adding new tool definitions in backend/app/services/ai_providers/tools/. Use the ReAct pattern to let the agent decide when to use them.' },
                                ].map((item) => (
                                    <div key={item.q} className="glass-card p-5 card-hover">
                                        <h4 className="text-white font-medium mb-2">{item.q}</h4>
                                        <p className="text-white/60 text-sm leading-relaxed">{item.a}</p>
                                    </div>
                                ))}
                            </div>
                        </motion.div>
                    </section>

                    {/* CTA */}
                    <div className="glass-card p-8 text-center gradient-border">
                        <h3 className="text-xl font-bold text-white mb-3">Ready to get started?</h3>
                        <p className="text-white/60 mb-6">Create your account and start automating client updates in minutes.</p>
                        <div className="flex gap-3 justify-center">
                            <Link href="/register">
                                <Button className="bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-500 hover:to-blue-500 text-white border-0 shadow-lg shadow-violet-500/25">
                                    Start Free Trial
                                </Button>
                            </Link>
                            <a href="https://github.com/ravin972/voxly" target="_blank" rel="noopener noreferrer">
                                <Button variant="outline" className="border-white/10 text-white hover:bg-white/5">
                                    <GitBranch className="w-4 h-4 mr-2" /> GitHub
                                    <ExternalLink className="w-3 h-3 ml-1" />
                                </Button>
                            </a>
                        </div>
                    </div>
                </main>
            </div>
        </div>
    );
}
