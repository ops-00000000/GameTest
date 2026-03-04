// ═══════════════════════════════════════════════════
// Chess Roguelike — Cloudflare Worker Entry Point
// ═══════════════════════════════════════════════════

export { GameRoom } from './durable/GameRoom.js';

interface Env {
    GAME_ROOM: DurableObjectNamespace;
}

export default {
    async fetch(request: Request, env: Env): Promise<Response> {
        const url = new URL(request.url);

        // CORS headers for client dev server
        const corsHeaders: Record<string, string> = {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Upgrade, Connection',
        };

        if (request.method === 'OPTIONS') {
            return new Response(null, { headers: corsHeaders });
        }

        // ── Routes ──────────────────────────────────────

        // GET / — Server status
        if (url.pathname === '/' || url.pathname === '') {
            return Response.json(
                {
                    name: 'Chess Roguelike Server',
                    version: '1.0.0',
                    status: 'running',
                },
                { headers: corsHeaders },
            );
        }

        // GET /api/rooms/:roomId — Room info
        const roomInfoMatch = url.pathname.match(/^\/api\/rooms\/(.+)$/);
        if (roomInfoMatch && request.method === 'GET') {
            const roomId = roomInfoMatch[1];
            const id = env.GAME_ROOM.idFromName(roomId);
            const stub = env.GAME_ROOM.get(id);

            const roomUrl = new URL('/info', request.url);
            roomUrl.searchParams.set('roomId', roomId);
            const response = await stub.fetch(roomUrl.toString());
            const data = await response.json();

            return Response.json(data, { headers: corsHeaders });
        }

        // WebSocket: /ws/:roomId
        const wsMatch = url.pathname.match(/^\/ws\/(.+)$/);
        if (wsMatch) {
            const roomId = wsMatch[1];

            if (request.headers.get('Upgrade') !== 'websocket') {
                return new Response('Expected WebSocket', { status: 426, headers: corsHeaders });
            }

            const id = env.GAME_ROOM.idFromName(roomId);
            const stub = env.GAME_ROOM.get(id);

            // Forward the WebSocket request to the Durable Object
            return stub.fetch(request);
        }

        return new Response('Not Found', { status: 404, headers: corsHeaders });
    },
};
