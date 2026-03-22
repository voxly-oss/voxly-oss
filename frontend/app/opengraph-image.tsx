import { ImageResponse } from 'next/og';

export const runtime = 'edge';

export const alt = 'Voxly - AI-Powered Client Updates';
export const size = {
    width: 1200,
    height: 630,
};

export const contentType = 'image/png';

export default async function Image() {
    return new ImageResponse(
        (
            <div
                style={{
                    background: '#0a0a0f',
                    width: '100%',
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontFamily: 'sans-serif',
                }}
            >
                {/* Background Gradient Mesh */}
                <div
                    style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        background:
                            'radial-gradient(circle at 50% 40%, rgba(139, 92, 246, 0.1) 0%, transparent 60%)',
                    }}
                />

                {/* Orb Container (Scaled Up) */}
                <div
                    style={{
                        width: 200,
                        height: 200,
                        borderRadius: '50%',
                        background: '#0f0c29',
                        position: 'relative',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        marginBottom: 40,
                        boxShadow: '0 0 60px rgba(139, 92, 246, 0.4)',
                        overflow: 'hidden',
                    }}
                >
                    {/* Nebula Background */}
                    <div
                        style={{
                            position: 'absolute',
                            inset: -20,
                            background: 'conic-gradient(from 0deg, #4c1d95, #0ea5e9, #a855f7, #4c1d95)',
                            filter: 'blur(30px)',
                            opacity: 0.8,
                        }}
                    />
                    
                    {/* Inner Highlights - Swirls */}
                    <div
                        style={{
                            position: 'absolute',
                            top: 0,
                            right: 0,
                            width: 140,
                            height: 140,
                            background: '#22d3ee', // Cyan
                            borderRadius: '50%',
                            filter: 'blur(40px)',
                            opacity: 0.6,
                        }}
                    />
                    <div
                        style={{
                            position: 'absolute',
                            bottom: 0,
                            left: 0,
                            width: 140,
                            height: 140,
                            background: '#a855f7', // Purple
                            borderRadius: '50%',
                            filter: 'blur(40px)',
                            opacity: 0.6,
                        }}
                    />
                    
                    {/* Center Core */}
                     <div
                        style={{
                            position: 'absolute',
                            width: 60,
                            height: 60,
                            background: 'white',
                            borderRadius: '50%',
                            filter: 'blur(20px)',
                            opacity: 0.8,
                        }}
                    />

                    {/* Top Gloss Shine */}
                    <div
                        style={{
                            position: 'absolute',
                            top: 10,
                            left: 20,
                            right: 20,
                            height: 90,
                            background: 'linear-gradient(to bottom, rgba(255,255,255,0.7), transparent)',
                            borderRadius: '100px 100px 0 0',
                        }}
                    />
                    
                     {/* Rim Light */}
                     <div
                        style={{
                            position: 'absolute',
                            bottom: 0,
                            left: 0,
                            right: 0,
                            height: 40,
                            background: 'linear-gradient(to top, rgba(34, 211, 238, 0.5), transparent)',
                            borderRadius: '50%',
                        }}
                    />
                </div>

                {/* Brand Name */}
                <div
                    style={{
                        fontSize: 80,
                        fontWeight: 800,
                        color: 'white',
                        letterSpacing: '-2px',
                        marginBottom: 20,
                        textShadow: '0 0 40px rgba(139, 92, 246, 0.5)',
                    }}
                >
                    Voxly
                </div>

                {/* Tagline */}
                <div
                    style={{
                        fontSize: 32,
                        color: 'rgba(255,255,255,0.6)',
                        fontWeight: 500,
                    }}
                >
                    AI Client Updates for Dev Agencies
                </div>
            </div>
        ),
        {
            ...size,
        }
    );
}
