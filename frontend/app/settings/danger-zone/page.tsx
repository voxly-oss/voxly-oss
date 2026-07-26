'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { authAPI } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Loader2, AlertTriangle } from 'lucide-react';
import SettingsShell from '@/components/SettingsShell';
import { Panel, PanelText } from '@/components/SidePanel';

export default function DangerZoneSettingsPage() {
    const { logout } = useAuth();
    const { toast } = useToast();
    const router = useRouter();
    const [isExporting, setIsExporting] = useState(false);
    const [deleteOpen, setDeleteOpen] = useState(false);
    const [deleteConfirmText, setDeleteConfirmText] = useState('');
    const [isDeleting, setIsDeleting] = useState(false);

    const handleExport = async () => {
        setIsExporting(true);
        try {
            const res = await authAPI.exportData();
            const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `voxly-export-${new Date().toISOString().slice(0, 10)}.json`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
            toast({ title: 'Export ready', description: 'Your data export has been downloaded.' });
        } catch (err: any) {
            toast({ title: 'Error', description: err.response?.data?.detail || 'Failed to export data.', variant: 'destructive' });
        } finally {
            setIsExporting(false);
        }
    };

    const handleDelete = async () => {
        setIsDeleting(true);
        try {
            await authAPI.deleteAccount();
            toast({ title: 'Account deleted', description: 'Your account and all data have been permanently deleted.' });
            logout();
            router.push('/login');
        } catch (err: any) {
            toast({ title: 'Error', description: err.response?.data?.detail || 'Failed to delete account.', variant: 'destructive' });
        } finally {
            setIsDeleting(false);
        }
    };

    return (
        <SettingsShell breadcrumb={{ group: 'Advanced', page: 'Danger Zone' }}>
            <div className="flex flex-col xl:flex-row gap-6 items-start">
                <div className="flex-1 min-w-0 w-full flex flex-col gap-[18px]">
                    <div>
                        <h1 className="font-display font-bold text-[22px] text-voxly-heat tracking-[-0.01em]">Danger Zone</h1>
                        <p className="text-[13px] text-voxly-ink-6 mt-[3px]">Irreversible, account-wide actions</p>
                    </div>

                    <div className="border border-voxly-heat/30 rounded-[14px] bg-card overflow-hidden">
                        <div className="flex items-center justify-between gap-4 px-[18px] py-3.5 border-b border-voxly-heat/15">
                            <div>
                                <div className="text-[13px] text-foreground font-medium">Transfer ownership</div>
                                <div className="text-[11.5px] text-voxly-ink-5 mt-0.5">Hand the Owner role to another member.</div>
                            </div>
                            <button disabled title="No other members exist yet" className="font-semibold text-[12.5px] bg-secondary text-voxly-ink-5 border border-border rounded-lg px-3.5 py-2 opacity-50 cursor-not-allowed flex-none whitespace-nowrap">
                                Transfer…
                            </button>
                        </div>
                        <div className="flex items-center justify-between gap-4 px-[18px] py-3.5 border-b border-voxly-heat/15">
                            <div>
                                <div className="text-[13px] text-foreground font-medium">Export your data</div>
                                <div className="text-[11.5px] text-voxly-ink-5 mt-0.5">Clients, projects, and AI key metadata as a JSON file.</div>
                            </div>
                            <Button onClick={handleExport} disabled={isExporting} className="font-semibold text-[12.5px] bg-secondary hover:bg-accent text-foreground border border-voxly-ink-4 rounded-lg px-3.5 py-2 h-auto flex-none whitespace-nowrap">
                                {isExporting ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : null}
                                Export data
                            </Button>
                        </div>
                        <div className="flex items-center justify-between gap-4 px-[18px] py-3.5">
                            <div>
                                <div className="text-[13px] text-foreground font-medium">Delete account</div>
                                <div className="text-[11.5px] text-voxly-ink-5 mt-0.5">Permanently deletes all data. Cannot be undone.</div>
                            </div>
                            <Button onClick={() => setDeleteOpen(true)} className="font-semibold text-[12.5px] bg-voxly-heat-soft hover:bg-voxly-heat-soft/70 text-voxly-heat border border-voxly-heat/30 rounded-lg px-3.5 py-2 h-auto flex-none whitespace-nowrap">
                                Delete account
                            </Button>
                        </div>
                    </div>
                </div>

                <div className="w-full xl:w-80 flex-none flex flex-col gap-3.5">
                    <div className="border border-voxly-heat/30 bg-voxly-heat-soft rounded-xl p-3.5">
                        <div className="font-mono text-[11px] font-bold uppercase tracking-wider text-voxly-heat mb-2">Owner-only</div>
                        <div className="text-xs text-foreground/90 leading-relaxed">These actions are restricted to your account and cannot be delegated. Export or confirm before proceeding.</div>
                    </div>
                    <Panel title="Need Help?" defaultOpen={false}>
                        <PanelText>
                            <a href="#">Settings documentation →</a><br /><a href="#">Contact support →</a>
                        </PanelText>
                    </Panel>
                </div>
            </div>

            <Dialog open={deleteOpen} onOpenChange={(open) => { setDeleteOpen(open); if (!open) setDeleteConfirmText(''); }}>
                <DialogContent className="bg-card border-border">
                    <DialogHeader>
                        <DialogTitle className="text-foreground flex items-center gap-2">
                            <AlertTriangle className="w-4 h-4 text-voxly-heat" /> Delete account
                        </DialogTitle>
                        <DialogDescription className="text-voxly-ink-6">
                            This permanently deletes your account, clients, projects, and all associated data. This cannot be undone.
                            Type <span className="font-mono text-foreground font-semibold">DELETE</span> to confirm.
                        </DialogDescription>
                    </DialogHeader>
                    <Input
                        value={deleteConfirmText}
                        onChange={(e) => setDeleteConfirmText(e.target.value)}
                        placeholder="DELETE"
                        className="bg-background border-voxly-ink-4 font-mono"
                    />
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setDeleteOpen(false)} className="border-border text-foreground hover:bg-accent">
                            Cancel
                        </Button>
                        <Button variant="destructive" onClick={handleDelete} disabled={deleteConfirmText !== 'DELETE' || isDeleting}>
                            {isDeleting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                            Delete permanently
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </SettingsShell>
    );
}
