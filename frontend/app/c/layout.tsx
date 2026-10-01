import type { Metadata, Viewport } from 'next';

// The client's chat: installable (Add to Home Screen), never indexed, and with
// no Referer header — /c/<link> carries the client's personal link token.
export const metadata: Metadata = {
    title: 'Chat',
    description: 'Your private chat with your agency.',
    manifest: '/chat.webmanifest',
    robots: { index: false, follow: false },
    referrer: 'no-referrer',
    appleWebApp: { capable: true, title: 'Chat', statusBarStyle: 'black-translucent' },
    icons: { apple: '/orb-icon.png' },
};

export const viewport: Viewport = {
    width: 'device-width',
    initialScale: 1,
    viewportFit: 'cover',
    themeColor: '#0c0c0f',
};

export default function ClientChatLayout({ children }: { children: React.ReactNode }) {
    // .voxly-app-shell carries the app theme's tokens (see globals.css).
    return <div className="voxly-app-shell min-h-dvh bg-background text-foreground">{children}</div>;
}
