'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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
    RotateCw, AlertTriangle, RefreshCw,
} from 'lucide-react';
import SettingsShell from '@/components/SettingsShell';
import { Panel, PanelRow, PanelText } from '@/components/SidePanel';
import { PreviewBanner } from '@/components/PreviewBadge';

interface APIKeyData {
    id: string; key_prefix: string; label: string; scopes: string[]; is_active: boolean;
    last_used_at: string | null; expires_at: string | null; created_at: string; revoked_at: string | null;
}
interface APIKeyListResponse { keys: APIKeyData[]; total: number; max_allowed: number }
/** Only ever returned by create and rotate — the full secret is shown once. */
interface APIKeyCreatedResponse extends APIKeyData { key: string }

const timeAgo = (ts: string | null) => {
    if (!ts) return 'never';
    const m = Math.floor((Date.now() - new Date(ts).getTime()) / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
};

function detailOf(err: unknown, fallback: string) {
    const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
    return typeof detail === 'string' ? detail : fallback;
}

const GRID_COLS = 'grid grid-cols-[1.7fr_2.3fr_1fr_0.85fr_0.85fr_28px]';

type RevealedKey = { key: string; label: string; origin: 'created' | 'rotated' };

export default function APIKeysSettingsPage() {
    const { toast } = useToast();
    const queryClient = useQueryClient();

    const [createOpen, setCreateOpen] = useState(false);
    const [newLabel, setNewLabel] = useState('');
    const [revealed, setRevealed] = useState<RevealedKey | null>(null);
    const [showSecret, setShowSecret] = useState(false);
    const [copied, setCopied] = useState(false);
    const [confirmRevoke, setConfirmRevoke] = useState<APIKeyData | null>(null);
    const [confirmRotate, setConfirmRotate] = useState<APIKeyData | null>(null);

    const keysQuery = useQuery({
        queryKey: ['api-keys'],
        queryFn: async () => (await apiKeysAPI.list()).data as APIKeyListResponse,
    });

    const keys = keysQuery.data?.keys ?? [];
    const maxKeys = keysQuery.data?.max_allowed ?? 1;
    const activeKeys = keys.filter(k => !k.revoked_at);
    const revokedKeys = keys.filter(k => k.revoked_at);
    const atLimit = activeKeys.length >= maxKeys;

    const invalidate = () => queryClient.invalidateQueries({ queryKey: ['api-keys'] });

    const createMutation = useMutation({
        mutationFn: (label: string) => apiKeysAPI.create({ label }),
        onSuccess: (res) => {
            const data = res.data as APIKeyCreatedResponse;
            setRevealed({ key: data.key, label: data.label, origin: 'created' });
            setNewLabel('');
            setCreateOpen(false);
            invalidate();
        },
        onError: (err) => toast({
            variant: 'destructive', title: 'Could not create key',
            description: detailOf(err, 'Failed to create API key.'),
        }),
    });

    const rotateMutation = useMutation({
        mutationFn: (id: string) => apiKeysAPI.rotate(id),
        onSuccess: (res) => {
            const data = res.data as APIKeyCreatedResponse;
            setRevealed({ key: data.key, label: data.label, origin: 'rotated' });
            setConfirmRotate(null);
            invalidate();
        },
        onError: (err) => {
            setConfirmRotate(null);
            toast({
                variant: 'destructive', title: 'Could not rotate key',
                description: detailOf(err, 'Failed to rotate API key.'),
            });
        },
    });

    const revokeMutation = useMutation({
        mutationFn: (id: string) => apiKeysAPI.revoke(id),
        onSuccess: (_res, _id) => {
            toast({ title: 'Key revoked', description: `"${confirmRevoke?.label ?? 'The key'}" stops authenticating immediately.` });
            setConfirmRevoke(null);
            invalidate();
        },
        onError: (err) => {
            setConfirmRevoke(null);
            toast({
                variant: 'destructive', title: 'Could not revoke key',
                description: detailOf(err, 'Failed to revoke API key.'),
            });
        },
    });

    const handleCopy = async (value: string) => {
        try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
            toast({ title: 'Copied', description: 'API key copied to clipboard.' });
        } catch {
            toast({ variant: 'destructive', title: 'Copy failed', description: 'Select the key and copy it manually.' });
        }
    };

    const closeReveal = () => { setRevealed(null); setShowSecret(false); setCopied(false); };

    return (
        <SettingsShell breadcrumb={{ group: 'Developer', page: 'API Keys' }}>
            <div className="flex flex-col xl:flex-row gap-6 items-start">
                <div className="flex-1 min-w-0 w-full flex flex-col gap-[18px]">
                    <div className="flex items-end justify-between gap-4 flex-wrap">
                        <div>
                            <h1 className="font-display font-bold text-[22px] text-foreground tracking-[-0.01em]">API Keys</h1>
                            <p className="text-[13px] text-voxly-ink-6 mt-[3px]">
                                {activeKeys.length} active {activeKeys.length === 1 ? 'key' : 'keys'} of {maxKeys} allowed on your plan
                            </p>
                        </div>
                        <Button
                            onClick={() => setCreateOpen(true)}
                            disabled={atLimit || keysQuery.isPending}
                            title={atLimit ? `Your plan allows ${maxKeys} active ${maxKeys === 1 ? 'key' : 'keys'}. Revoke one first.` : undefined}
                            className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-[13px] rounded-lg px-4 py-[9px] h-auto gap-[7px] disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                            <Plus className="w-[15px] h-[15px]" /> Generate new key
                        </Button>
                    </div>

                    {/* Key management below is fully real. What a key cannot yet do
                        is authenticate a request — the dual-auth dependency exists
                        in the backend but is not attached to any route, so saying
                        otherwise here would be a promise the API can't keep. */}
                    <PreviewBanner>
                        <b className="font-semibold">Preview.</b> Creating, rotating, and revoking keys is live, and revocation takes effect immediately. Programmatic request authentication is not enabled yet, so these keys cannot sign API calls today.
                    </PreviewBanner>

                    {keys.length > 0 && (
                        <div className="flex items-center gap-[22px] px-[18px] py-3.5 border border-border rounded-xl bg-card flex-wrap">
                            <div><span className="font-display font-bold text-[17px] text-foreground">{keys.length}</span><span className="text-[11.5px] text-voxly-ink-5 ml-1.5">total</span></div>
                            <div className="w-px h-4 bg-border" />
                            <div><span className="font-display font-bold text-[17px] text-voxly-success">{activeKeys.length}</span><span className="text-[11.5px] text-voxly-ink-5 ml-1.5">active</span></div>
                            <div className="w-px h-4 bg-border" />
                            <div><span className="font-display font-bold text-[17px] text-voxly-heat">{revokedKeys.length}</span><span className="text-[11.5px] text-voxly-ink-5 ml-1.5">revoked</span></div>
                            <div className="w-px h-4 bg-border" />
                            <div><span className="font-display font-bold text-[17px] text-foreground">{activeKeys.filter(k => k.last_used_at).length}</span><span className="text-[11.5px] text-voxly-ink-5 ml-1.5">ever used</span></div>
                        </div>
                    )}

                    <div className="border border-border rounded-[14px] bg-card overflow-hidden">
                        {keysQuery.isError ? (
                            <div className="p-12 text-center">
                                <AlertTriangle className="w-8 h-8 text-voxly-heat mx-auto mb-3" />
                                <h3 className="text-sm font-semibold text-foreground mb-1">Couldn&apos;t load your keys</h3>
                                <p className="text-xs text-voxly-ink-5 max-w-sm mx-auto mb-4">{detailOf(keysQuery.error, 'The API keys service did not respond.')}</p>
                                <Button onClick={() => keysQuery.refetch()} className="bg-secondary hover:bg-accent text-foreground border border-voxly-ink-4">
                                    <RefreshCw className="w-3.5 h-3.5 mr-2" />Try again
                                </Button>
                            </div>
                        ) : keysQuery.isPending ? (
                            <div className="p-4 space-y-2">
                                {[1, 2, 3].map(k => <div key={k} className="h-12 bg-secondary rounded-lg animate-pulse" />)}
                            </div>
                        ) : keys.length === 0 ? (
                            <div className="p-12 text-center">
                                <div className="w-14 h-14 rounded-2xl bg-secondary border border-border flex items-center justify-center mx-auto mb-4">
                                    <Key className="w-6 h-6 text-voxly-ink-5" />
                                </div>
                                <h3 className="text-sm font-semibold text-foreground mb-1">No API keys yet</h3>
                                <p className="text-xs text-voxly-ink-5 max-w-sm mx-auto">Generate a key to have it ready for when programmatic access is enabled.</p>
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <div className="min-w-[680px]">
                                    <div className={`${GRID_COLS} px-4 py-2.5 font-mono text-[10px] font-semibold tracking-[0.04em] uppercase text-voxly-ink-5 border-b border-border`}>
                                        <div>Name</div><div>Key</div><div>Scopes</div><div>Last used</div><div>Status</div><div />
                                    </div>
                                    {keys.map(key => {
                                        const busy = (rotateMutation.isPending && rotateMutation.variables === key.id)
                                            || (revokeMutation.isPending && revokeMutation.variables === key.id);
                                        return (
                                            <div key={key.id} className={`${GRID_COLS} px-4 py-3 items-center border-b border-border last:border-b-0 hover:bg-white/[0.02] transition-colors ${key.revoked_at ? 'bg-voxly-heat-soft' : ''}`}>
                                                <div className="min-w-0">
                                                    <div className={`text-[13px] font-semibold truncate ${key.revoked_at ? 'text-voxly-ink-5' : 'text-foreground'}`}>{key.label}</div>
                                                    <div className="text-[11px] text-voxly-ink-5">Created {new Date(key.created_at).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}</div>
                                                </div>
                                                {/* Only the prefix is stored — the secret is hashed and is
                                                    genuinely unrecoverable, so there is nothing to copy here. */}
                                                <div className="min-w-0">
                                                    <span className="font-mono text-[11.5px] text-voxly-ink-6 truncate block" title="Only the prefix is stored; the full key is shown once at creation">
                                                        {key.key_prefix}••••••••
                                                    </span>
                                                </div>
                                                <div className="flex gap-[5px] flex-wrap">
                                                    {(key.scopes ?? []).length === 0 ? (
                                                        <span className="text-[10.5px] text-voxly-ink-5">—</span>
                                                    ) : key.scopes.slice(0, 2).map(s => (
                                                        <span key={s} className="text-[10.5px] text-voxly-ink-6 border border-border rounded-[5px] px-1.5 py-0.5 whitespace-nowrap">{s}</span>
                                                    ))}
                                                    {(key.scopes ?? []).length > 2 && (
                                                        <span className="text-[10.5px] text-voxly-ink-5" title={key.scopes.join(', ')}>+{key.scopes.length - 2}</span>
                                                    )}
                                                </div>
                                                <div className="text-[12px] text-voxly-ink-5">{timeAgo(key.last_used_at)}</div>
                                                <div>
                                                    <span className={`inline-flex items-center gap-[5px] text-[11px] font-semibold rounded-full pl-1.5 pr-2 py-[3px] whitespace-nowrap ${key.revoked_at ? 'bg-voxly-heat-soft text-voxly-heat' : 'bg-voxly-success-soft text-voxly-success'}`}>
                                                        <span className={`w-[5px] h-[5px] rounded-full flex-none ${key.revoked_at ? 'bg-voxly-heat' : 'bg-voxly-success'}`} />
                                                        {key.revoked_at ? 'Revoked' : 'Active'}
                                                    </span>
                                                </div>
                                                {key.revoked_at ? <span /> : busy ? (
                                                    <Loader2 className="w-4 h-4 animate-spin text-voxly-ink-5" />
                                                ) : (
                                                    <DropdownMenu>
                                                        <DropdownMenuTrigger asChild>
                                                            <Button variant="ghost" size="icon" className="w-7 h-7 text-voxly-ink-5 hover:text-foreground">
                                                                <MoreVertical className="w-4 h-4" />
                                                            </Button>
                                                        </DropdownMenuTrigger>
                                                        <DropdownMenuContent align="end" className="bg-popover border-border">
                                                            <DropdownMenuItem className="cursor-pointer" onClick={() => setConfirmRotate(key)}>
                                                                <RotateCw className="w-3.5 h-3.5 mr-2" /> Rotate
                                                            </DropdownMenuItem>
                                                            <DropdownMenuItem
                                                                className="text-voxly-heat hover:bg-voxly-heat-soft focus:bg-voxly-heat-soft cursor-pointer"
                                                                onClick={() => setConfirmRevoke(key)}
                                                            >
                                                                <Trash2 className="w-3.5 h-3.5 mr-2" /> Revoke
                                                            </DropdownMenuItem>
                                                        </DropdownMenuContent>
                                                    </DropdownMenu>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </div>
                    <p className="text-[11.5px] text-voxly-ink-5 leading-relaxed">
                        Keys inherit your account&apos;s permissions. Rotating issues a new secret and revokes the old one in the same step. Revoked keys stay listed for audit history.
                    </p>
                </div>

                <div className="w-full xl:w-80 flex-none flex flex-col gap-3.5">
                    <Panel title="Usage">
                        <PanelRow label="Active keys" value={`${activeKeys.length} / ${maxKeys}`} />
                        <PanelRow label="Revoked keys" value={revokedKeys.length} />
                        <PanelRow label="Never used" value={activeKeys.filter(k => !k.last_used_at).length} />
                        {atLimit && (
                            <PanelText>
                                You&apos;ve reached your plan&apos;s key limit. Revoke an existing key or upgrade to add more.
                            </PanelText>
                        )}
                    </Panel>
                    <Panel title="Documentation" defaultOpen={false}>
                        <PanelText>
                            The API reference and authentication guide will be published alongside programmatic access.
                        </PanelText>
                    </Panel>
                </div>
            </div>

            {/* Generate */}
            <Dialog open={createOpen} onOpenChange={(open) => { if (!createMutation.isPending) { setCreateOpen(open); if (!open) setNewLabel(''); } }}>
                <DialogContent className="bg-card border-border">
                    <DialogHeader>
                        <DialogTitle className="text-foreground">Generate new API key</DialogTitle>
                        <DialogDescription className="text-voxly-ink-6">Give it a label so you can identify it later.</DialogDescription>
                    </DialogHeader>
                    <Input
                        value={newLabel}
                        autoFocus
                        maxLength={100}
                        onChange={(e) => setNewLabel(e.target.value)}
                        placeholder='e.g. "Production Server", "CI/CD"'
                        className="bg-background border-voxly-ink-4"
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && newLabel.trim() && !createMutation.isPending) {
                                createMutation.mutate(newLabel.trim());
                            }
                        }}
                    />
                    <DialogFooter>
                        <Button variant="outline" onClick={() => { setCreateOpen(false); setNewLabel(''); }} disabled={createMutation.isPending} className="border-border text-foreground hover:bg-accent">Cancel</Button>
                        <Button onClick={() => createMutation.mutate(newLabel.trim())} disabled={createMutation.isPending || !newLabel.trim()} className="bg-primary hover:bg-primary/90 text-primary-foreground">
                            {createMutation.isPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                            Generate key
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Reveal — the one and only time the secret is visible */}
            <Dialog open={!!revealed} onOpenChange={(open) => { if (!open) closeReveal(); }}>
                <DialogContent className="bg-card border-border">
                    <DialogHeader>
                        <DialogTitle className="text-voxly-success flex items-center gap-2">
                            <Check className="w-4 h-4" /> API key {revealed?.origin === 'rotated' ? 'rotated' : 'created'}
                        </DialogTitle>
                        <DialogDescription className="text-voxly-ink-6">
                            {revealed?.origin === 'rotated'
                                ? <>The previous key for <b className="text-foreground">{revealed?.label}</b> is now revoked. Copy the new one — it won&apos;t be shown again.</>
                                : <>Copy this key now — it is hashed on the server and won&apos;t be shown again.</>}
                        </DialogDescription>
                    </DialogHeader>
                    {revealed && (
                        <div className="flex items-center gap-2 bg-background border border-voxly-success/30 rounded-lg px-3 py-2.5">
                            <code className="flex-1 text-sm text-voxly-success font-mono truncate">
                                {showSecret ? revealed.key : '•'.repeat(Math.min(revealed.key.length, 40))}
                            </code>
                            <Button size="icon" variant="ghost" onClick={() => setShowSecret(v => !v)} title={showSecret ? 'Hide' : 'Reveal'} className="h-7 w-7 text-voxly-ink-5">
                                {showSecret ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                            </Button>
                            <Button size="sm" onClick={() => handleCopy(revealed.key)} className="bg-voxly-success-soft hover:bg-voxly-success-soft/70 text-voxly-success border border-voxly-success/30">
                                {copied ? <><Check className="w-3.5 h-3.5 mr-1.5" />Copied</> : <><Copy className="w-3.5 h-3.5 mr-1.5" />Copy</>}
                            </Button>
                        </div>
                    )}
                    <DialogFooter>
                        <Button onClick={closeReveal} className="bg-secondary hover:bg-accent text-foreground border border-border w-full">Done</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Rotate confirmation */}
            <Dialog open={!!confirmRotate} onOpenChange={(open) => { if (!open && !rotateMutation.isPending) setConfirmRotate(null); }}>
                <DialogContent className="bg-card border-border">
                    <DialogHeader>
                        <DialogTitle className="text-foreground flex items-center gap-2"><RotateCw className="w-4 h-4" /> Rotate key</DialogTitle>
                        <DialogDescription className="text-voxly-ink-6">
                            A new secret is issued for <b className="text-foreground">{confirmRotate?.label}</b> and the current one is revoked immediately. Anything still using the old key stops working.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setConfirmRotate(null)} disabled={rotateMutation.isPending} className="border-border text-foreground hover:bg-accent">Cancel</Button>
                        <Button onClick={() => confirmRotate && rotateMutation.mutate(confirmRotate.id)} disabled={rotateMutation.isPending} className="bg-primary hover:bg-primary/90 text-primary-foreground">
                            {rotateMutation.isPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                            Rotate key
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Revoke confirmation */}
            <Dialog open={!!confirmRevoke} onOpenChange={(open) => { if (!open && !revokeMutation.isPending) setConfirmRevoke(null); }}>
                <DialogContent className="bg-card border-border">
                    <DialogHeader>
                        <DialogTitle className="text-voxly-heat flex items-center gap-2"><AlertTriangle className="w-4 h-4" /> Revoke key</DialogTitle>
                        <DialogDescription className="text-voxly-ink-6">
                            <b className="text-foreground">{confirmRevoke?.label}</b> stops authenticating immediately. This cannot be undone — generate a new key if you need one.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setConfirmRevoke(null)} disabled={revokeMutation.isPending} className="border-border text-foreground hover:bg-accent">Cancel</Button>
                        <Button variant="destructive" onClick={() => confirmRevoke && revokeMutation.mutate(confirmRevoke.id)} disabled={revokeMutation.isPending}>
                            {revokeMutation.isPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                            Revoke key
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </SettingsShell>
    );
}
