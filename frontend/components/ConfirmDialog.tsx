'use client';

import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';

interface ConfirmDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    title: string;
    description: React.ReactNode;
    onConfirm: () => void;
    confirmLabel?: string;
    /** Keeps the dialog open and both buttons disabled while the action runs. */
    pending?: boolean;
    destructive?: boolean;
}

/**
 * The one confirmation pattern for irreversible actions in the app shell —
 * replaces window.confirm() and one-click deletes. Radix focuses the first
 * button (Cancel), so Enter on open never confirms by accident.
 */
export default function ConfirmDialog({
    open,
    onOpenChange,
    title,
    description,
    onConfirm,
    confirmLabel = 'Delete',
    pending = false,
    destructive = true,
}: ConfirmDialogProps) {
    return (
        <Dialog open={open} onOpenChange={(next) => { if (!pending) onOpenChange(next); }}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle>{title}</DialogTitle>
                    <DialogDescription className="text-voxly-ink-6 leading-relaxed">{description}</DialogDescription>
                </DialogHeader>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
                        Cancel
                    </Button>
                    <Button variant={destructive ? 'destructive' : 'default'} onClick={onConfirm} disabled={pending}>
                        {pending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                        {confirmLabel}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
