'use client';

import { useCallback, useMemo, useState, useSyncExternalStore } from 'react';
import PortalChat from '@/components/portal/PortalChat';
import { LinkEnded, NoSession, Opening } from '@/components/portal/PortalStates';
import { clearSession, parseSession, readSessionRaw, subscribeSession } from '@/lib/portal';

// The server can't see localStorage; render "Opening…" until the client can.
const ON_SERVER = '__server__';

/** /c: the client's chat, from the session saved on this device. */
export default function ClientChatPage() {
    const raw = useSyncExternalStore(subscribeSession, readSessionRaw, () => ON_SERVER);
    const session = useMemo(() => (raw === ON_SERVER ? null : parseSession(raw)), [raw]);
    const [endedFor, setEndedFor] = useState<{ agency: string | null } | null>(null);

    const onEnded = useCallback(() => {
        setEndedFor({ agency: session?.profile.agency_name ?? null });
        clearSession();
    }, [session]);

    if (raw === ON_SERVER) return <Opening />;
    if (!session) return endedFor ? <LinkEnded agencyName={endedFor.agency} /> : <NoSession />;
    return <PortalChat key={session.accessToken} session={session} onEnded={onEnded} />;
}
