'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { getApiErrorMessage } from '@/lib/api';
import { isNotFound, portalAPI, saveSession } from '@/lib/portal';
import { CouldNotOpen, LinkEnded, Opening } from '@/components/portal/PortalStates';

/** /c/<link>: trade the personal link for a 30-day session on this device,
 *  then continue at /c — so the link doesn't linger in the address bar or
 *  history, and an installed app (start_url /c) opens straight into the chat. */
export default function OpenChatLinkPage() {
    const { token } = useParams<{ token: string }>();
    const router = useRouter();

    const session = useQuery({
        queryKey: ['portal-open', token],
        queryFn: async () => saveSession((await portalAPI.openSession(token)).data),
        retry: (count, err) => !isNotFound(err) && count < 2,
        staleTime: Infinity,
        gcTime: 0,
        refetchOnWindowFocus: false,
    });

    useEffect(() => {
        if (session.isSuccess) router.replace('/c');
    }, [session.isSuccess, router]);

    if (session.isError) {
        return isNotFound(session.error)
            ? <LinkEnded />
            : <CouldNotOpen message={getApiErrorMessage(session.error, 'Check your connection and try again.')} onRetry={() => session.refetch()} />;
    }
    return <Opening />;
}
