import type { Metadata } from 'next';
import { Space_Grotesk, Plus_Jakarta_Sans, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import { AuthProvider } from '@/hooks/useAuth';
import { Toaster } from '@/components/ui/toaster';
import QueryProvider from '@/components/QueryProvider';
import UpgradeModal from '@/components/UpgradeModal';

const spaceGrotesk = Space_Grotesk({
    subsets: ['latin'],
    variable: '--font-space',
});

const plusJakarta = Plus_Jakarta_Sans({
    subsets: ['latin'],
    variable: '--font-jakarta',
});

const jetbrainsMono = JetBrains_Mono({
    subsets: ['latin'],
    variable: '--font-mono',
});

export const metadata: Metadata = {
    title: 'Voxly - AI-Powered Client Updates for Dev Agencies',
    description:
        'Automate client communication with AI-powered WhatsApp responses based on live GitHub project data.',
    keywords: ['client management', 'AI', 'WhatsApp', 'dev agency', 'project management'],
};

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html lang="en" suppressHydrationWarning>
            <body className={`${spaceGrotesk.variable} ${plusJakarta.variable} ${jetbrainsMono.variable} font-sans`} suppressHydrationWarning>
                <QueryProvider>
                    <AuthProvider>
                        {children}
                        <UpgradeModal />
                        <Toaster />
                    </AuthProvider>
                </QueryProvider>
            </body>
        </html>
    );
}
