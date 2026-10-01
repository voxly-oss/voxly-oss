'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { clientsAPI, getApiErrorMessage } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import type { Client } from '@/types';

/**
 * Activate / deactivate a client. Inactive is not cosmetic: inbound routing
 * (services/messaging_core.py) skips inactive clients, so Voxly stops
 * replying to them — the toast says so.
 */
export function useSetClientActive() {
    const queryClient = useQueryClient();
    const { toast } = useToast();
    return useMutation({
        mutationFn: ({ client, active }: { client: Client; active: boolean }) =>
            clientsAPI.update(client.id, { is_active: active }),
        onSuccess: (res, { active }) => {
            const saved = res.data as Client;
            queryClient.setQueryData(['client', saved.id], saved);
            queryClient.invalidateQueries({ queryKey: ['clients'] });
            queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
            toast({
                title: active ? 'Client reactivated' : 'Client marked inactive',
                description: active
                    ? `Voxly will reply to ${saved.name} again.`
                    : `Voxly won’t reply to ${saved.name}’s messages until you reactivate them.`,
            });
        },
        onError: (err) => {
            toast({ variant: 'destructive', title: 'Couldn’t update client status', description: getApiErrorMessage(err, 'Please try again.') });
        },
    });
}

export function useDeleteClient({ onDeleted }: { onDeleted?: (client: Client) => void } = {}) {
    const queryClient = useQueryClient();
    const { toast } = useToast();
    return useMutation({
        mutationFn: (client: Client) => clientsAPI.delete(client.id),
        onSuccess: (_res, client) => {
            queryClient.removeQueries({ queryKey: ['client', client.id] });
            queryClient.invalidateQueries({ queryKey: ['clients'] });
            queryClient.invalidateQueries({ queryKey: ['projects'] });
            queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
            toast({ title: 'Client deleted', description: `${client.name} and their projects were removed.` });
            onDeleted?.(client);
        },
        onError: (err) => {
            toast({ variant: 'destructive', title: 'Couldn’t delete client', description: getApiErrorMessage(err, 'Please try again.') });
        },
    });
}
