'use client';

import { useCallback, useEffect, useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { aiKeysAPI, getApiErrorMessage } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    Loader2, Plus, Save, Trash2, RotateCw, ExternalLink, Zap,
    CheckCircle2, XCircle, HelpCircle, X as XIcon,
} from 'lucide-react';
import SettingsShell from '@/components/SettingsShell';
import { SettingsRow, StatusPill } from '@/components/SettingsRow';
import { HelpLinks, Panel, PanelText } from '@/components/SidePanel';
import ConfirmDialog from '@/components/ConfirmDialog';
import AIProviderIcon from '@/components/AIProviderIcon';
import { motion, AnimatePresence } from 'framer-motion';

interface AIKeyProvider { id: string; name: string; prefix: string; placeholder: string; docs_url: string; has_key: boolean }
interface AIKeyData { id: string; provider: string; provider_name: string; label: string | null; key_masked: string; is_active: boolean; is_valid: boolean | null; last_validated_at: string | null; last_used_at: string | null; created_at: string }

export default function AIDefaultsSettingsPage() {
    const { toast } = useToast();
    const [keyToRemove, setKeyToRemove] = useState<{ id: string; providerName: string } | null>(null);
    const [isRemoving, setIsRemoving] = useState(false);

    // Real BYOK provider key management, migrated from the old /settings tabs.
    const [providers, setProviders] = useState<AIKeyProvider[]>([]);
    const [keys, setKeys] = useState<AIKeyData[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [addingProvider, setAddingProvider] = useState<string | null>(null);
    const [newKeyValue, setNewKeyValue] = useState('');
    const [isAdding, setIsAdding] = useState(false);
    const [validatingId, setValidatingId] = useState<string | null>(null);

    const fetchKeys = useCallback(async () => {
        setIsLoading(true);
        try {
            const [providersRes, keysRes] = await Promise.all([aiKeysAPI.providers(), aiKeysAPI.list()]);
            setProviders(providersRes.data);
            setKeys(keysRes.data);
        } catch { /* ignore */ } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => { fetchKeys(); }, [fetchKeys]);

    const handleAdd = async (provider: string) => {
        if (!newKeyValue.trim()) return;
        setIsAdding(true);
        try {
            await aiKeysAPI.add({ provider, api_key: newKeyValue.trim() });
            setNewKeyValue('');
            setAddingProvider(null);
            fetchKeys();
            toast({ title: 'AI key added', description: `Your ${provider} key has been saved securely.` });
        } catch (err) {
            toast({ title: 'Couldn’t add key', description: getApiErrorMessage(err, 'Please check the key and try again.'), variant: 'destructive' });
        } finally {
            setIsAdding(false);
        }
    };

    // Confirmed through ConfirmDialog — was a native window.confirm().
    const handleDelete = async () => {
        if (!keyToRemove) return;
        const { id, providerName } = keyToRemove;
        setIsRemoving(true);
        try {
            await aiKeysAPI.delete(id);
            fetchKeys();
            toast({ title: 'Key removed', description: `${providerName} key has been removed.` });
            setKeyToRemove(null);
        } catch (err) {
            toast({ title: 'Couldn’t remove key', description: getApiErrorMessage(err, 'Please try again.'), variant: 'destructive' });
        } finally {
            setIsRemoving(false);
        }
    };

    const handleValidate = async (id: string) => {
        setValidatingId(id);
        try {
            const res = await aiKeysAPI.validate(id);
            fetchKeys();
            toast({
                title: res.data.is_valid ? 'Key is valid' : 'Key is invalid',
                description: res.data.message,
                variant: res.data.is_valid ? 'default' : 'destructive',
            });
        } catch (err) {
            toast({ title: 'Couldn’t validate key', description: getApiErrorMessage(err, 'Please try again.'), variant: 'destructive' });
        } finally {
            setValidatingId(null);
        }
    };

    return (
        <SettingsShell breadcrumb={{ group: 'Application', page: 'AI Defaults' }}>
            <div className="flex flex-col xl:flex-row gap-6 items-start">
                <div className="flex-1 min-w-0 w-full flex flex-col gap-[18px]">
                    <div>
                        <h1 className="font-display font-bold text-[22px] text-foreground tracking-[-0.01em]">AI Defaults</h1>
                        <p className="text-[13px] text-voxly-ink-6 mt-[3px]">Default model and behavior for new AI Agent configurations</p>
                    </div>

                    {/* No per-workspace AI-behavior fields exist on the backend. These
                        were a fake "GPT-4o" dropdown and two toggles that reset on
                        reload while reading as safety settings — now truthful. */}
                    <div className="border border-border rounded-[14px] bg-card overflow-hidden">
                        <SettingsRow label="Default AI model" description="Replies use your provider key below, with that provider’s default model.">
                            <StatusPill />
                        </SettingsRow>
                        <SettingsRow label="Default response tone">
                            <StatusPill />
                        </SettingsRow>
                        <SettingsRow label="Auto-escalate to a human when uncertain" description="Today you can take over any conversation from Conversations.">
                            <StatusPill />
                        </SettingsRow>
                        <SettingsRow label="Respond only during working hours">
                            <StatusPill />
                        </SettingsRow>
                    </div>

                    {/* Real BYOK key management */}
                    <div>
                        <h2 className="font-display font-semibold text-[15px] text-foreground">Your AI Provider Keys (BYOK)</h2>
                        <p className="text-[12px] text-voxly-ink-5 mt-1">Bring your own API keys — Voxly uses these instead of the platform key, and you pay your provider directly.</p>
                    </div>

                    {isLoading ? (
                        <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
                    ) : (
                        <div className="flex flex-col gap-2.5">
                            {providers.map(provider => {
                                const existingKey = keys.find(k => k.provider === provider.id && k.is_active);
                                const isAddingThis = addingProvider === provider.id;
                                return (
                                    <div key={provider.id} className="border border-border rounded-[12px] bg-card p-4">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-3">
                                                <div className="w-9 h-9 rounded-lg bg-secondary border border-border flex items-center justify-center">
                                                    <AIProviderIcon provider={provider.id} size={18} className="text-voxly-ink-6" />
                                                </div>
                                                <div>
                                                    <h3 className="text-foreground font-semibold text-[13px]">{provider.name}</h3>
                                                    {existingKey ? (
                                                        <div className="flex items-center gap-1.5 mt-0.5">
                                                            <code className="text-[11px] text-voxly-ink-5 font-mono">{existingKey.key_masked}</code>
                                                            {existingKey.is_valid === true && <CheckCircle2 className="w-3.5 h-3.5 text-voxly-success" />}
                                                            {existingKey.is_valid === false && <XCircle className="w-3.5 h-3.5 text-voxly-heat" />}
                                                            {existingKey.is_valid === null && <HelpCircle className="w-3.5 h-3.5 text-voxly-ink-5" />}
                                                        </div>
                                                    ) : (
                                                        <p className="text-[11px] text-voxly-ink-5 mt-0.5">No key configured</p>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-1">
                                                {existingKey ? (
                                                    <>
                                                        <Button size="sm" variant="ghost" title="Test this key" aria-label={`Test ${provider.name} key`} className="h-8 px-2.5 text-voxly-ink-5 hover:text-foreground" onClick={() => handleValidate(existingKey.id)} disabled={validatingId === existingKey.id}>
                                                            {validatingId === existingKey.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
                                                        </Button>
                                                        <Button size="sm" variant="ghost" title="Replace key" aria-label={`Replace ${provider.name} key`} className="h-8 px-2.5 text-voxly-ink-5 hover:text-foreground" onClick={() => { setAddingProvider(provider.id); setNewKeyValue(''); }}>
                                                            <RotateCw className="w-3.5 h-3.5" />
                                                        </Button>
                                                        <Button size="sm" variant="ghost" title="Remove key" aria-label={`Remove ${provider.name} key`} className="h-8 px-2.5 text-voxly-ink-5 hover:text-voxly-heat hover:bg-voxly-heat-soft" onClick={() => setKeyToRemove({ id: existingKey.id, providerName: provider.name })}>
                                                            <Trash2 className="w-3.5 h-3.5" />
                                                        </Button>
                                                    </>
                                                ) : (
                                                    <Button size="sm" variant="outline" className="h-8 font-semibold" onClick={() => { setAddingProvider(provider.id); setNewKeyValue(''); }}>
                                                        <Plus className="w-3.5 h-3.5 mr-1" /> Add key
                                                    </Button>
                                                )}
                                            </div>
                                        </div>
                                        <AnimatePresence>
                                            {isAddingThis && (
                                                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                                                    <form
                                                        className="mt-3 pt-3 border-t border-border flex gap-2"
                                                        onSubmit={(e) => { e.preventDefault(); handleAdd(provider.id); }}
                                                    >
                                                        <Input
                                                            type="password"
                                                            autoFocus
                                                            autoComplete="off"
                                                            aria-label={`${provider.name} API key`}
                                                            placeholder={provider.placeholder}
                                                            value={newKeyValue}
                                                            onChange={e => setNewKeyValue(e.target.value)}
                                                            onKeyDown={e => { if (e.key === 'Escape') setAddingProvider(null); }}
                                                            className="flex-1 font-mono"
                                                        />
                                                        <Button type="submit" disabled={isAdding || !newKeyValue.trim()} className="h-10 px-4 gap-1.5 font-semibold">
                                                            {isAdding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                                            <span className="hidden sm:inline">Save</span>
                                                        </Button>
                                                        <Button type="button" variant="ghost" aria-label="Cancel" onClick={() => setAddingProvider(null)} className="h-10 px-3 text-voxly-ink-5">
                                                            <XIcon className="w-4 h-4" />
                                                        </Button>
                                                    </form>
                                                    <a href={provider.docs_url} target="_blank" rel="noreferrer" className="text-xs text-primary mt-2 inline-flex items-center gap-1">
                                                        Get your API key <ExternalLink className="w-3 h-3" />
                                                    </a>
                                                </motion.div>
                                            )}
                                        </AnimatePresence>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                <div className="w-full xl:w-80 flex-none flex flex-col gap-3.5">
                    <Panel title="Recent Changes">
                        <PanelText>No recent changes.</PanelText>
                    </Panel>
                    <Panel title="Need Help?" defaultOpen={false}>
                        <HelpLinks />
                    </Panel>
                </div>
            </div>

            <ConfirmDialog
                open={!!keyToRemove}
                onOpenChange={(open) => { if (!open) setKeyToRemove(null); }}
                title={`Remove your ${keyToRemove?.providerName ?? ''} key?`}
                description="Voxly will stop using this key for AI replies. You can add it again any time."
                confirmLabel="Remove key"
                pending={isRemoving}
                onConfirm={handleDelete}
            />
        </SettingsShell>
    );
}
