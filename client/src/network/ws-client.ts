// ═══════════════════════════════════════════════════
// Chess Roguelike — WebSocket Client
// Auto-reconnect with exponential backoff
// ═══════════════════════════════════════════════════

import { ClientMessage, ServerMessage } from '@chess-roguelike/shared';

export type MessageHandler = (msg: ServerMessage) => void;
export type StatusHandler = (status: 'connecting' | 'connected' | 'disconnected') => void;

export class WSClient {
    private ws: WebSocket | null = null;
    private url: string = '';
    private onMessage: MessageHandler;
    private onStatus: StatusHandler;
    private reconnectTimer: number | null = null;
    private reconnectAttempt = 0;
    private maxReconnectDelay = 10000;
    private intentionallyClosed = false;

    constructor(onMessage: MessageHandler, onStatus: StatusHandler) {
        this.onMessage = onMessage;
        this.onStatus = onStatus;
    }

    connect(serverUrl: string, roomId: string): void {
        this.intentionallyClosed = false;
        this.url = `${serverUrl}/ws/${roomId}`;
        this.reconnectAttempt = 0;
        this.doConnect();
    }

    private doConnect(): void {
        if (this.ws) {
            this.ws.onclose = null;
            this.ws.close();
        }

        this.onStatus('connecting');

        try {
            this.ws = new WebSocket(this.url);
        } catch {
            this.scheduleReconnect();
            return;
        }

        this.ws.onopen = () => {
            this.reconnectAttempt = 0;
            this.onStatus('connected');
        };

        this.ws.onmessage = (event) => {
            try {
                const msg: ServerMessage = JSON.parse(event.data);
                this.onMessage(msg);
            } catch (e) {
                console.error('Failed to parse message:', e);
            }
        };

        this.ws.onclose = () => {
            if (!this.intentionallyClosed) {
                this.onStatus('disconnected');
                this.scheduleReconnect();
            }
        };

        this.ws.onerror = () => {
            // onclose will fire after onerror
        };
    }

    private scheduleReconnect(): void {
        if (this.intentionallyClosed) return;

        const delay = Math.min(
            1000 * Math.pow(2, this.reconnectAttempt),
            this.maxReconnectDelay,
        );
        this.reconnectAttempt++;

        console.log(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempt})`);

        this.reconnectTimer = window.setTimeout(() => {
            this.doConnect();
        }, delay);
    }

    send(msg: ClientMessage): void {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(msg));
        }
    }

    disconnect(): void {
        this.intentionallyClosed = true;
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
        }
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
    }

    get isConnected(): boolean {
        return this.ws?.readyState === WebSocket.OPEN;
    }
}
