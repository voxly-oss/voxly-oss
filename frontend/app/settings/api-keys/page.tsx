'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiKeysAPI } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
    DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
    Plus, Loader2, MoreVertical, Copy, Trash2, Eye, EyeOff, Check, Key,
} from 'lucide-react';
import SettingsShell from '@/components/SettingsShell';
import { Panel, PanelRow, PanelText } from '@/components/SidePanel';

interface APIKeyData {
    id: string; key_prefix: string; label: string; scopes: string[]; is_active: boolean;
    last_used_at: string | null; expires_at: string | null; created_at: string; revoked_at: string | null; key?: string;
}

const timeAgo = (ts: string | null) => {
    if (!ts) return 'never';
    const d = Date.now() - new Date(ts).getTime();
    const m = Math.floor(d / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
};

const GRID_COLS = 'grid grid-cols-[1.7fr_2.3fr_1fr_0.85fr_0.85fr_28px]';

export default function APIKeysSettingsPage() {
    const { toast } = useToast();
    const [keys, setKeys] = useState<APIKeyData[]>([]);
    const [maxKeys, setMaxKeys] = useState(1);
    const [isLoading, setIsLoading] = useState(true);
    const [createOpen, setCreateOpen] = useState(false);
    const [newLabel, setNewLabel] = useState('');
    const [isCreating, setIsCreating] = useState(false);
    const [createdKey, setCreatedKey] = useState<string | null>(null);
    const [showCreatedKey, setShowCreatedKey] = useState(false);

    const fetchKeys = useCallback(async () => {
        setIsLoading(true);
        try {
            const res = await apiKeysAPI.list();
            setKeys(res.data.keys || []);
            setMaxKeys(res.data.max_allowed || 1);
        } catch { /* ignore */ } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => { fetchKeys(); }, [fetchKeys]);

    const activeKeys = keys.filter(k => !k.revoked_at);
    const revokedKeys = keys.filter(k => k.revoked_at);

    const handleCreate = async () => {
        if (!newLabel.trim()) return;
        setIsCreating(true);
        try {
            const res = await apiKeysAPI.create({ label: newLabel.trim() });
            setCreatedKey(res.data.key);
            setNewLabel('');
            fetchKeys();
        } catch (err: any) {
            toast({ title: 'Error', description: err.response?.data?.detail || 'Failed to create API key.', variant: 'destructive' });
        } finally {
            setIsCreating(false);
        }
    };

    const handleRevoke = async (id: string, label: string) => {
        if (!confirm(`Revoke key "${label}"? This action cannot be undone.`)) return;
        try {
            await apiKeysAPI.revoke(id);
            fetchKeys();
            toast({ title: 'Key revoked', description: `"${label}" has been revoked.` });
        } catch {
            toast({ title: 'Error', description: 'Failed to revoke key.', variant: 'destructive' });
        }
    };

    const handleCopy = async (value: string) => {
        try {
            await navigator.clipboard.writeText(value);
            toast({ title: 'Copied', description: 'API key copied to clipboard.' });
        } catch {
            toast({ title: 'Error', description: 'Failed to copy.', variant: 'destructive' });
        }
    };

    const closeCreateDialog = () => {
        setCreateOpen(false);
        setCreatedKey(null);
        setShowCreatedKey(false);
        setNewLabel('');
    };

    return (
        <SettingsShell breadcrumb={{ group: 'Developer', page: 'API Keys' }}>
            <div className="flex flex-col xl:flex-row gap-6 items-start">
                <div className="flex-1 min-w-0 w-full flex flex-col gap-[18px]">
                    <div className="flex items-end justify-between">
                        <div>
                            <h1 className="font-display font-bold text-[22px] text-foreground tracking-[-0.01em]">API Keys</h1>
                            <p className="text-[13px] text-voxly-ink-6 mt-[3px]">{activeKeys.length} active {activeKeys.length === 1 ? 'key' : 'keys'} · programmatic access to your workspace</p>
                        </div>
                        <Button onClick={() => setCreateOpen(true)} disabled={activeKeys.length >= maxKeys} className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-[13px] rounded-lg px-4 py-[9px] h-auto gap-[7px]">
                            <Plus className="w-[15px] h-[15px]" /> Generate new key
                        </Button>
                    </div>

                    {!isLoading && keys.length > 0 && (
                        <div className="flex items-center gap-[22px] px-[18px] py-3.5 border border-border rounded-xl bg-card">
                            <div><span className="font-display font-bold text-[17px] text-foreground">{keys.length}</span><span className="text-[11.5px] text-voxly-ink-5 ml-1.5">total</span></div>
                            <div className="w-px h-4 bg-border" />
                            <div><span className="font-display font-bold text-[17px] text-voxly-success">{activeKeys.length}</span><span className="text-[11.5px] text-voxly-ink-5 ml-1.5">active</span></div>
                            <div className="w-px h-4 bg-border" />
                            <div><span className="font-display font-bold text-[17px] text-voxly-heat">{revokedKeys.length}</span><span className="text-[11.5px] text-voxly-ink-5 ml-1.5">revoked</span></div>
                        </div>
                    )}

                    <div className="border border-border rounded-[14px] bg-card overflow-hidden">
                        {isLoading ? (
                            <div className="p-12 text-center"><Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" /></div>
                        ) : keys.length === 0 ? (
                            <div className="p-12 text-center">
                                <div className="w-14 h-14 rounded-2xl bg-secondary border border-border flex items-center justify-center mx-auto mb-4">
                                    <Key className="w-6 h-6 text-voxly-ink-5" />
                                </div>
                                <h3 className="text-sm font-semibold text-foreground mb-1">No API keys yet</h3>
                                <p className="text-xs text-voxly-ink-5 max-w-sm mx-auto">Generate a key to start making programmatic requests to the Voxly API.</p>
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                            <div className="min-w-[680px]">
                                <div className={`${GRID_COLS} px-4 py-2.5 font-mono text-[10px] font-semibold tracking-[0.04em] uppercase text-voxly-ink-5 border-b border-border`}>
                                    <div>Name</div><div>Key</div><div>Scopes</div><div>Last used</div><div>Status</div><div />
                                </div>
                                {keys.map(key => (
                                    <div key={key.id} className={`${GRID_COLS} px-4 py-3 items-center border-b border-border last:border-b-0 hover:bg-white/[0.02] transition-colors ${key.revoked_at ? 'bg-voxly-heat-soft' : ''}`}>
                                        <div className="min-w-0">
                                            <div className={`text-[13px] font-semibold truncate ${key.revoked_at ? 'text-voxly-ink-5' : 'text-foreground'}`}>{key.label}</div>
                                            <div className="text-[11px] text-voxly-ink-5">Created {new Date(key.created_at).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}</div>
                                        </div>
                                        <div className="min-w-0 flex items-center gap-1.5">
                                            <span className="font-mono text-[11.5px] text-voxly-ink-6 truncate">{key.key_prefix}••••••••</span>
                                            <Copy className="w-3 h-3 text-voxly-ink-5 cursor-pointer flex-none hover:text-foreground" onClick={() => handleCopy(key.key_prefix)} />
                                        </div>
                                        <div className="flex gap-[5px] flex-wrap">
                                            {(key.scopes ?? []).length === 0 ? (
                                                <span className="text-[10.5px] text-voxly-ink-5">—</span>
                                            ) : key.scopes.map(s => (
                                                <span key={s} className="text-[10.5px] text-voxly-ink-6 border border-border rounded-[5px] px-1.5 py-0.5 whitespace-nowrap capitalize">{s}</span>
                                            ))}
                                        </div>
                                        <div className="text-[12px] text-voxly-ink-5">{timeAgo(key.last_used_at)}</div>
                                        <div>
                                            <span className={`inline-flex items-center gap-[5px] text-[11px] font-semibold rounded-full pl-1.5 pr-2 py-[3px] whitespace-nowrap ${key.revoked_at ? 'bg-voxly-heat-soft text-voxly-heat' : 'bg-voxly-success-soft text-voxly-success'}`}>
                                                <span className={`w-[5px] h-[5px] rounded-full flex-none ${key.revoked_at ? 'bg-voxly-heat' : 'bg-voxly-success'}`} />
                                                {key.revoked_at ? 'Revoked' : 'Active'}
                                            </span>
                                        </div>
                                        {!key.revoked_at ? (
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <Button variant="ghost" size="icon" className="w-7 h-7 text-voxly-ink-5 hover:text-foreground">
                                                        <MoreVertical className="w-4 h-4" />
                                                    </Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end" className="bg-popover border-border">
                                                    <DropdownMenuItem
                                                        className="text-voxly-heat hover:bg-voxly-heat-soft focus:bg-voxly-heat-soft cursor-pointer"
                                                        onClick={() => handleRevoke(key.id, key.label)}
                                                    >
                                                        <Trash2 className="w-3.5 h-3.5 mr-2" /> Revoke
                                                    </DropdownMenuItem>
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        ) : <span />}
                                    </div>
                                ))}
                            </div>
                            </div>
                        )}
                    </div>
                    <p className="text-[11.5px] text-voxly-ink-5 leading-relaxed">
                        Keys inherit your account&apos;s permissions. Revoked keys stop authenticating immediately but stay listed for audit history.
                    </p>
                </div>

                <div className="w-full xl:w-80 flex-none flex flex-col gap-3.5">
                    <Panel title="Usage">
                        <PanelRow label="Active keys" value={`${activeKeys.length} / ${maxKeys}`} />
                        <PanelRow label="Revoked keys" value={revokedKeys.length} />
                    </Panel>
                    <Panel title="Documentation" defaultOpen={false}>
                        <PanelText>
                            <a href="#">API reference →</a><br /><a href="#">Authentication guide →</a><br /><a href="#">Webhooks →</a>
                        </PanelText>
                    </Panel>
                </div>
            </div>

            <Dialog open={createOpen} onOpenChange={(open) => { if (!open) closeCreateDialog(); else setCreateOpen(true); }}>
                <DialogContent className="bg-card border-border">
                    {createdKey ? (
                        <>
                            <DialogHeader>
                                <DialogTitle className="text-voxly-success flex items-center gap-2"><Check className="w-4 h-4" /> API key created</DialogTitle>
                                <DialogDescription className="text-voxly-ink-6">
                                    Copy this key now — for security reasons, it won&apos;t be shown again.
                                </DialogDescription>
                            </DialogHeader>
                            <div className="flex items-center gap-2 bg-background border border-voxly-success/30 rounded-lg px-3 py-2.5">
                                <code className="flex-1 text-sm text-voxly-success font-mono truncate">
                                    {showCreatedKey ? createdKey : '•'.repeat(Math.min(createdKey.length, 40))}
                                </code>
                                <Button size="icon" variant="ghost" onClick={() => setShowCreatedKey(v => !v)} className="h-7 w-7 text-voxly-ink-5">
                                    {showCreatedKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                                </Button>
                                <Button size="sm" onClick={() => handleCopy(createdKey)} className="bg-voxly-success-soft hover:bg-voxly-success-soft/70 text-voxly-success border border-voxly-success/30">
                                    <Copy className="w-3.5 h-3.5 mr-1.5" /> Copy
                                </Button>
                            </div>
                            <DialogFooter>
                                <Button onClick={closeCreateDialog} className="bg-secondary hover:bg-accent text-foreground border border-border w-full">Done</Button>
                            </DialogFooter>
                        </>
                    ) : (
                        <>
                            <DialogHeader>
                                <DialogTitle className="text-foreground">Generate new API key</DialogTitle>
                                <DialogDescription className="text-voxly-ink-6">Give it a label so you can identify it later.</DialogDescription>
                            </DialogHeader>
                            <Input
                                value={newLabel}
                                onChange={(e) => setNewLabel(e.target.value)}
                                placeholder='e.g. "Production Server", "CI/CD"'
                                className="bg-background border-voxly-ink-4"
                                onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                            />
                            <DialogFooter>
                                <Button variant="outline" onClick={closeCreateDialog} className="border-border text-foreground hover:bg-accent">Cancel</Button>
                                <Button onClick={handleCreate} disabled={isCreating || !newLabel.trim()} className="bg-primary hover:bg-primary/90 text-primary-foreground">
                                    {isCreating ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                                    Generate key
                                </Button>
                            </DialogFooter>
                        </>
                    )}
                </DialogContent>
            </Dialog>
        </SettingsShell>
    );
}
