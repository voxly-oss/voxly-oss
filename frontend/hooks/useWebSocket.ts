import { useEffect, useRef, useState, useCallback } from 'react';
import { useAuth } from './useAuth';
import { useToast } from './use-toast';

export interface WebSocketMessage {
    type: string;
    payload?: any;
    message?: any;
}

// Reconnect config
const MAX_RETRIES = 5;
const BASE_DELAY_MS = 1000;       // 1s → 2s → 4s → 8s → 16s
const PING_INTERVAL_MS = 30000;   // Send ping every 30s to keep connection alive

export function useWebSocket() {
    const { token } = useAuth();
    const { toast } = useToast();
    const ws = useRef<WebSocket | null>(null);
    const pingInterval = useRef<NodeJS.Timeout | null>(null);
    const retryCount = useRef(0);
    const retryTimeout = useRef<NodeJS.Timeout | null>(null);
    const [isConnected, setIsConnected] = useState(false);
    const [lastMessage, setLastMessage] = useState<WebSocketMessage | null>(null);

    const cleanup = useCallback(() => {
        // Clear ping interval
        if (pingInterval.current) {
            clearInterval(pingInterval.current);
            pingInterval.current = null;
        }
        // Clear retry timeout
        if (retryTimeout.current) {
            clearTimeout(retryTimeout.current);
            retryTimeout.current = null;
        }
    }, []);

    const connect = useCallback(() => {
        if (!token) return;

        // Close existing connection if any
        if (ws.current) {
            ws.current.close();
        }
        cleanup();

        // Build WS URL
        const host = process.env.NEXT_PUBLIC_API_URL
            ? process.env.NEXT_PUBLIC_API_URL.replace(/^http/, 'ws')
            : 'ws://localhost:8000';

        const wsUrl = `${host}/api/v1/chat/ws?token=${token}`;

        try {
            console.log(`[WS] Connecting (attempt ${retryCount.current + 1}/${MAX_RETRIES})...`);
            const socket = new WebSocket(wsUrl);

            socket.onopen = () => {
                console.log('[WS] Connected ✅');
                setIsConnected(true);
                retryCount.current = 0; // Reset retry counter on success

                // Start ping keepalive
                pingInterval.current = setInterval(() => {
                    if (socket.readyState === WebSocket.OPEN) {
                        socket.send(JSON.stringify({ type: 'ping' }));
                    }
                }, PING_INTERVAL_MS);
            };

            socket.onmessage = (event) => {
                try {
                    const message = JSON.parse(event.data);
                    // Ignore pong responses
                    if (message.type === 'pong') return;
                    setLastMessage(message);
                } catch (e) {
                    console.error('[WS] Failed to parse message', e);
                }
            };

            socket.onclose = (event) => {
                console.log(`[WS] Disconnected (code=${event.code}, clean=${event.wasClean})`);
                setIsConnected(false);
                cleanup();

                // Reconnect with exponential backoff (only for unclean closes)
                if (!event.wasClean && retryCount.current < MAX_RETRIES) {
                    const delay = BASE_DELAY_MS * Math.pow(2, retryCount.current);
                    console.log(`[WS] Reconnecting in ${delay}ms...`);
                    retryCount.current += 1;
                    retryTimeout.current = setTimeout(connect, delay);
                } else if (retryCount.current >= MAX_RETRIES) {
                    console.warn('[WS] Max retries reached. Giving up.');
                    toast({
                        title: 'Connection Lost',
                        description: 'Real-time updates unavailable. Refresh the page to reconnect.',
                        variant: 'destructive',
                    });
                }
            };

            socket.onerror = () => {
                // WebSocket error events don't carry useful info — onclose handles reconnection
                console.warn('[WS] Connection error (will retry via onclose)');
            };

            ws.current = socket;
        } catch (e) {
            console.error('[WS] Connection failed', e);
        }
    }, [token, toast, cleanup]);

    useEffect(() => {
        if (token) {
            retryCount.current = 0; // Reset on new token
            connect();
        }
        return () => {
            cleanup();
            if (ws.current) {
                ws.current.close();
            }
        };
    }, [token, connect, cleanup]);

    const sendMessage = useCallback((type: string, payload: any) => {
        if (ws.current && ws.current.readyState === WebSocket.OPEN) {
            ws.current.send(JSON.stringify({ type, payload }));
        }
    }, []);

    return { isConnected, lastMessage, sendMessage };
}
