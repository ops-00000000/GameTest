// ═══════════════════════════════════════════════════
// Chess Roguelike — GameRoom Durable Object
// Phase-based turn system with pawn upgrades
// ═══════════════════════════════════════════════════

import {
    GameState, PlayerPiece, EnemyPiece, PieceType, TileType, TurnPhase, Upgrade,
    ClientView, Tile, Position,
    ClientMessage, ServerMessage, GameEvent,
    MAX_PLAYERS, TURN_TIMEOUT_MS, CAPTURES_PER_UPGRADE, ALL_UPGRADES,
} from '@chess-roguelike/shared';
import { isValidPlayerMove, getAttackPositions } from '@chess-roguelike/shared';
import { generateDungeon, generateEnemies, getSpawnPosition } from '../game/world.js';
import { playerCaptureEnemy, enemyCapturePlayer } from '../game/combat.js';
import { getEnemyAction } from '../game/ai.js';

interface PlayerConnection {
    playerId: string;
    playerName: string;
}

export class GameRoom implements DurableObject {
    private state: DurableObjectState;
    private gameState: GameState | null = null;
    private seed: number = 0;
    private connections: Map<WebSocket, PlayerConnection> = new Map();
    private turnEvents: GameEvent[] = [];

    constructor(state: DurableObjectState, _env: unknown) {
        this.state = state;
    }

    async fetch(request: Request): Promise<Response> {
        const url = new URL(request.url);

        if (request.headers.get('Upgrade') === 'websocket') {
            return this.handleWebSocket(request);
        }

        if (url.pathname === '/info') {
            return Response.json({
                roomId: url.searchParams.get('roomId'),
                players: this.gameState?.players.map(p => ({
                    name: p.name,
                    type: p.type,
                    alive: p.alive,
                    captures: p.captures,
                })) ?? [],
                floor: this.gameState?.floor ?? 0,
                phase: this.gameState?.phase ?? 'players',
            });
        }

        return new Response('Chess Roguelike GameRoom', { status: 200 });
    }

    private handleWebSocket(_request: Request): Response {
        const pair = new WebSocketPair();
        const [client, server] = [pair[0], pair[1]];
        this.state.acceptWebSocket(server);
        return new Response(null, { status: 101, webSocket: client });
    }

    // ── WebSocket Hibernation Handlers ────────────────

    async webSocketMessage(ws: WebSocket, rawMessage: string | ArrayBuffer): Promise<void> {
        const msgStr = typeof rawMessage === 'string' ? rawMessage : new TextDecoder().decode(rawMessage);

        let message: ClientMessage;
        try {
            message = JSON.parse(msgStr);
        } catch {
            this.send(ws, { type: 'error', message: 'Invalid JSON' });
            return;
        }

        switch (message.type) {
            case 'join':
                await this.handleJoin(ws, message.playerName);
                break;
            case 'move':
                await this.handleMove(ws, message.to);
                break;
            case 'choose_upgrade':
                await this.handleChooseUpgrade(ws, message.upgrade);
                break;
            case 'descend':
                await this.handleDescend(ws);
                break;
            case 'skip':
                await this.handleSkip(ws);
                break;
            case 'chat':
                this.handleChat(ws, message.text);
                break;
            default:
                this.send(ws, { type: 'error', message: 'Unknown message type' });
        }
    }

    async webSocketClose(ws: WebSocket, _code: number, _reason: string): Promise<void> {
        const conn = this.connections.get(ws);
        if (conn && this.gameState) {
            this.gameState.players = this.gameState.players.filter(p => p.id !== conn.playerId);
            this.gameState.playersActed = this.gameState.playersActed.filter(id => id !== conn.playerId);

            this.broadcast({
                type: 'player_left',
                playerId: conn.playerId,
                playerName: conn.playerName,
            });

            this.addLog(`${conn.playerName} покинул подземелье`);
            this.connections.delete(ws);
            await this.checkAllPlayersActed();
            await this.saveState();
        }
    }

    async webSocketError(ws: WebSocket, _error: unknown): Promise<void> {
        await this.webSocketClose(ws, 1006, 'error');
    }

    // ── Alarm (turn timeout) ──────────────────────────

    async alarm(): Promise<void> {
        if (!this.gameState || this.gameState.phase !== 'players') return;

        const alivePlayers = this.gameState.players.filter(p => p.alive);
        for (const player of alivePlayers) {
            if (!this.gameState.playersActed.includes(player.id)) {
                this.gameState.playersActed.push(player.id);
                this.addLog(`⏰ ${player.name} пропустил ход (таймаут)`);
            }
        }

        await this.runEnemyPhase();
        this.startPlayerPhase();
        this.broadcastViewsWithEvents(this.turnEvents);
        this.turnEvents = [];
        await this.saveState();
    }

    // ══════════════════════════════════════════════════
    // MESSAGE HANDLERS
    // ══════════════════════════════════════════════════

    private async handleJoin(ws: WebSocket, playerName: string): Promise<void> {
        if (!this.gameState) {
            this.seed = Date.now();
            const map = generateDungeon(1, this.seed);
            const enemies = generateEnemies(map, 1, this.seed);

            this.gameState = {
                roomId: '',
                floor: 1,
                map,
                players: [],
                enemies,
                phase: 'players',
                playersActed: [],
                turnNumber: 1,
                log: ['⚔️ Добро пожаловать в Шахматное Подземелье!'],
            };
        }

        if (this.gameState.players.length >= MAX_PLAYERS) {
            this.send(ws, { type: 'error', message: 'Комната заполнена' });
            ws.close(4001, 'Room full');
            return;
        }

        // Reconnect check
        const existingPlayer = this.gameState.players.find(p => p.name === playerName);
        if (existingPlayer) {
            this.connections.set(ws, { playerId: existingPlayer.id, playerName });
            const view = this.buildClientView(existingPlayer.id);
            this.send(ws, { type: 'snapshot', view, roomId: this.gameState.roomId, playerId: existingPlayer.id });
            return;
        }

        // Create new player — always a Pawn
        const playerId = `player-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        const spawnPos = getSpawnPosition(this.gameState.map);

        const player: PlayerPiece = {
            id: playerId,
            name: playerName,
            type: PieceType.Pawn,
            color: 'white',
            pos: { ...spawnPos },
            captures: 0,
            upgrades: [],
            hasExtraLife: false,
            floor: 1,
            alive: true,
        };

        this.gameState.players.push(player);
        this.connections.set(ws, { playerId, playerName });

        this.addLog(`♟️ ${playerName} вступает в бой`);

        const view = this.buildClientView(playerId);
        this.send(ws, { type: 'snapshot', view, roomId: this.gameState.roomId, playerId });

        // Initial upgrade choice: 3 options
        const initialOptions = this.getUpgradeOptions(player, 3);
        if (initialOptions.length > 0) {
            this.send(ws, { type: 'upgrade_available', options: initialOptions });
        }

        this.broadcast({
            type: 'player_joined',
            playerName,
            playerId,
            pieceType: PieceType.Pawn,
        }, ws);

        await this.saveState();
        this.setTurnTimeout();
    }

    // ── Player Action: Move (with auto-capture) ──────

    private async handleMove(ws: WebSocket, to: Position): Promise<void> {
        const conn = this.connections.get(ws);
        if (!conn || !this.gameState) return;

        if (!this.canPlayerAct(conn.playerId)) {
            this.send(ws, { type: 'error', message: 'Вы уже сделали ход в этой фазе' });
            return;
        }

        const player = this.gameState.players.find(p => p.id === conn.playerId);
        if (!player || !player.alive) return;

        // Validate move with upgrades
        const friendlyPositions = this.gameState.players
            .filter(p => p.alive && p.id !== player.id).map(p => p.pos);
        const enemyPositions = this.gameState.enemies
            .filter(e => e.alive).map(e => e.pos);

        if (!isValidPlayerMove(player.pos, to, this.gameState.map, friendlyPositions, enemyPositions, player.upgrades)) {
            this.send(ws, { type: 'error', message: 'Невалидный ход' });
            return;
        }

        const events: GameEvent[] = [];

        // Check if capture (enemy at destination)
        const targetEnemy = this.gameState.enemies.find(e => e.alive && e.pos.x === to.x && e.pos.y === to.y);
        if (targetEnemy) {
            playerCaptureEnemy(player, targetEnemy);
            events.push({ event: 'death', pieceId: targetEnemy.id, killedBy: player.id });
            this.addLog(`⚔️ ${player.name} захватил ${this.pieceName(targetEnemy.type)}! (${player.captures} всего)`);

            // Check if upgrade available
            if (player.captures % CAPTURES_PER_UPGRADE === 0) {
                const options = this.getUpgradeOptions(player, 2);
                if (options.length > 0) {
                    this.send(ws, { type: 'upgrade_available', options });
                    this.addLog(`⬆️ ${player.name} заслужил апгрейд!`);
                }
            }
        }

        // Move piece
        const from = { ...player.pos };
        player.pos = { ...to };
        events.unshift({ event: 'move', pieceId: player.id, from, to });

        // Mark player as acted
        this.markPlayerActed(conn.playerId);
        this.turnEvents.push(...events);
        this.broadcastPhaseStatus();
        await this.checkAllPlayersActed();
        await this.saveState();
    }

    // ── Player Action: Choose Upgrade ─────────────────

    private async handleChooseUpgrade(ws: WebSocket, upgrade: Upgrade): Promise<void> {
        const conn = this.connections.get(ws);
        if (!conn || !this.gameState) return;

        const player = this.gameState.players.find(p => p.id === conn.playerId);
        if (!player || !player.alive) return;

        // Validate upgrade choice
        if (!ALL_UPGRADES.includes(upgrade)) {
            this.send(ws, { type: 'error', message: 'Невалидный апгрейд' });
            return;
        }

        // Apply upgrade
        if (!player.upgrades.includes(upgrade)) {
            player.upgrades.push(upgrade);
        }

        // Special: ExtraLife activates the shield
        if (upgrade === Upgrade.ExtraLife) {
            player.hasExtraLife = true;
        }

        this.addLog(`⬆️ ${player.name} получил: ${this.upgradeName(upgrade)}`);
        this.broadcastViews();
        await this.saveState();
    }

    // ── Player Action: Skip Turn ──────────────────────

    private async handleSkip(ws: WebSocket): Promise<void> {
        const conn = this.connections.get(ws);
        if (!conn || !this.gameState) return;

        if (!this.canPlayerAct(conn.playerId)) {
            this.send(ws, { type: 'error', message: 'Вы уже сделали ход в этой фазе' });
            return;
        }

        const player = this.gameState.players.find(p => p.id === conn.playerId);
        if (player) {
            this.addLog(`♟ ${player.name} пропустил ход`);
        }

        this.markPlayerActed(conn.playerId);
        this.broadcastPhaseStatus();
        await this.checkAllPlayersActed();
        await this.saveState();
    }

    // ── Descend to next floor ─────────────────────────

    private async handleDescend(ws: WebSocket): Promise<void> {
        const conn = this.connections.get(ws);
        if (!conn || !this.gameState) return;

        const player = this.gameState.players.find(p => p.id === conn.playerId);
        if (!player || !player.alive) return;

        const tile = this.gameState.map.tiles[player.pos.y][player.pos.x];
        if (tile !== TileType.StairsDown) {
            this.send(ws, { type: 'error', message: 'Нужно стоять на лестнице вниз' });
            return;
        }

        const newFloor = this.gameState.floor + 1;
        const newMap = generateDungeon(newFloor, this.seed);
        const newEnemies = generateEnemies(newMap, newFloor, this.seed);
        const spawnPos = getSpawnPosition(newMap);

        this.gameState.floor = newFloor;
        this.gameState.map = newMap;
        this.gameState.enemies = newEnemies;

        for (let i = 0; i < this.gameState.players.length; i++) {
            const p = this.gameState.players[i];
            if (p.alive) {
                p.pos = { x: spawnPos.x + i, y: spawnPos.y };
                p.floor = newFloor;
            }
        }

        this.gameState.phase = 'players';
        this.gameState.playersActed = [];

        this.addLog(`🏰 Спуск на этаж ${newFloor}!`);

        for (const [socket, connection] of this.connections) {
            const view = this.buildClientView(connection.playerId);
            this.send(socket, { type: 'snapshot', view, roomId: this.gameState.roomId, playerId: connection.playerId });
        }

        await this.saveState();
        this.setTurnTimeout();
    }

    private handleChat(ws: WebSocket, text: string): void {
        const conn = this.connections.get(ws);
        if (!conn) return;
        this.broadcast({
            type: 'chat_broadcast',
            playerId: conn.playerId,
            playerName: conn.playerName,
            text: text.slice(0, 200),
        });
    }

    // ══════════════════════════════════════════════════
    // PHASE-BASED TURN SYSTEM
    // ══════════════════════════════════════════════════

    private canPlayerAct(playerId: string): boolean {
        if (!this.gameState) return false;
        if (this.gameState.phase !== 'players') return false;
        return !this.gameState.playersActed.includes(playerId);
    }

    private markPlayerActed(playerId: string): void {
        if (!this.gameState) return;
        if (!this.gameState.playersActed.includes(playerId)) {
            this.gameState.playersActed.push(playerId);
        }
    }

    private async checkAllPlayersActed(): Promise<void> {
        if (!this.gameState || this.gameState.phase !== 'players') return;

        const alivePlayers = this.gameState.players.filter(p => p.alive);
        if (alivePlayers.length === 0) return;

        const allActed = alivePlayers.every(p => this.gameState!.playersActed.includes(p.id));
        if (!allActed) return;

        this.addLog(`━━━ Фаза противников ━━━`);
        this.gameState.phase = 'enemies';
        this.broadcastPhaseChange();

        await this.runEnemyPhase();
        this.startPlayerPhase();
        this.broadcastViewsWithEvents(this.turnEvents);
        this.turnEvents = [];
        this.setTurnTimeout();
    }

    private async runEnemyPhase(): Promise<void> {
        if (!this.gameState) return;
        const events: GameEvent[] = [];

        for (const enemy of this.gameState.enemies) {
            if (!enemy.alive) continue;

            const action = getEnemyAction(
                enemy,
                this.gameState.players,
                this.gameState.enemies,
                this.gameState.map,
            );

            switch (action.type) {
                case 'move': {
                    const from = { ...enemy.pos };
                    enemy.pos = { ...action.to };
                    events.push({ event: 'move', pieceId: enemy.id, from, to: action.to });
                    break;
                }
                case 'attack': {
                    const target = this.gameState.players.find(p => p.id === action.targetId);
                    if (target && target.alive) {
                        const died = enemyCapturePlayer(enemy, target);
                        const from = { ...enemy.pos };
                        if (died) {
                            enemy.pos = { ...target.pos };
                            events.push({ event: 'move', pieceId: enemy.id, from, to: enemy.pos });
                            events.push({ event: 'death', pieceId: target.id, killedBy: enemy.id });
                            this.addLog(`${this.pieceName(enemy.type)} захватил ${target.name}!`);
                        } else {
                            // ExtraLife saved the player!
                            this.addLog(`${this.pieceName(enemy.type)} атаковал ${target.name}, но вторая жизнь спасла!`);
                        }
                    }
                    break;
                }
            }
        }

        this.turnEvents.push(...events);
    }

    private startPlayerPhase(): void {
        if (!this.gameState) return;
        this.gameState.phase = 'players';
        this.gameState.playersActed = [];
        this.gameState.turnNumber++;
        this.addLog(`━━━ Ход ${this.gameState.turnNumber}: Ваш ход ━━━`);
    }

    private broadcastPhaseChange(): void {
        if (!this.gameState) return;
        const alivePlayers = this.gameState.players.filter(p => p.alive);
        this.broadcast({
            type: 'phase_change',
            phase: this.gameState.phase,
            turnNumber: this.gameState.turnNumber,
            playersReady: this.gameState.playersActed.length,
            playersTotal: alivePlayers.length,
        });
    }

    private broadcastPhaseStatus(): void {
        if (!this.gameState) return;
        for (const [ws, conn] of this.connections) {
            const view = this.buildClientView(conn.playerId);
            this.send(ws, { type: 'turn_result', view, events: [] });
        }
    }

    // ══════════════════════════════════════════════════
    // UPGRADE SYSTEM
    // ══════════════════════════════════════════════════

    /** Pick N random upgrades the player doesn't have yet */
    private getUpgradeOptions(player: PlayerPiece, count: number = 2): Upgrade[] {
        const available = ALL_UPGRADES.filter(u => !player.upgrades.includes(u));
        if (available.length === 0) return [];
        if (available.length <= count) return [...available];

        const shuffled = [...available];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        return shuffled.slice(0, count);
    }

    // ══════════════════════════════════════════════════
    // VIEW BUILDING (no fog of war — full board visible)
    // ══════════════════════════════════════════════════

    private buildClientView(playerId: string): ClientView {
        const gs = this.gameState!;
        const player = gs.players.find(p => p.id === playerId);

        if (!player) return this.buildSpectatorView();

        // All tiles visible (no FOV)
        const tiles: Tile[][] = [];
        for (let y = 0; y < gs.map.height; y++) {
            tiles[y] = [];
            for (let x = 0; x < gs.map.width; x++) {
                tiles[y][x] = {
                    type: gs.map.tiles[y][x],
                    visible: true,
                    explored: true,
                };
            }
        }

        const visiblePlayers = gs.players.filter(p => p.alive && p.id !== playerId);
        const visibleEnemies = gs.enemies.filter(e => e.alive);

        const alivePlayers = gs.players.filter(p => p.alive);
        const canAct = gs.phase === 'players' && player.alive && !gs.playersActed.includes(playerId);

        return {
            floor: gs.floor,
            mapWidth: gs.map.width,
            mapHeight: gs.map.height,
            tiles,
            myPiece: player,
            visiblePlayers,
            visibleEnemies,
            phase: gs.phase,
            turnNumber: gs.turnNumber,
            log: gs.log.slice(-15),
            canAct,
            playersReady: gs.playersActed.length,
            playersTotal: alivePlayers.length,
        };
    }

    private buildSpectatorView(): ClientView {
        const gs = this.gameState!;
        const alivePlayers = gs.players.filter(p => p.alive);
        return {
            floor: gs.floor,
            mapWidth: gs.map.width,
            mapHeight: gs.map.height,
            tiles: [],
            myPiece: null as unknown as PlayerPiece,
            visiblePlayers: [],
            visibleEnemies: [],
            phase: gs.phase,
            turnNumber: gs.turnNumber,
            log: gs.log.slice(-15),
            canAct: false,
            playersReady: gs.playersActed.length,
            playersTotal: alivePlayers.length,
        };
    }

    // ══════════════════════════════════════════════════
    // BROADCASTING
    // ══════════════════════════════════════════════════

    private broadcastViews(): void {
        for (const [ws, conn] of this.connections) {
            const view = this.buildClientView(conn.playerId);
            this.send(ws, { type: 'turn_result', view, events: [] });
        }
    }

    private broadcastViewsWithEvents(events: GameEvent[]): void {
        for (const [ws, conn] of this.connections) {
            const view = this.buildClientView(conn.playerId);
            this.send(ws, { type: 'turn_result', view, events });
        }
    }

    private broadcast(msg: ServerMessage, exclude?: WebSocket): void {
        for (const [ws] of this.connections) {
            if (ws !== exclude) this.send(ws, msg);
        }
    }

    private send(ws: WebSocket, msg: ServerMessage): void {
        try { ws.send(JSON.stringify(msg)); } catch { /* closed */ }
    }

    // ══════════════════════════════════════════════════
    // PERSISTENCE
    // ══════════════════════════════════════════════════

    private async saveState(): Promise<void> {
        if (this.gameState) {
            await this.state.storage.put('gameState', this.gameState);
            await this.state.storage.put('seed', this.seed);
        }
    }

    // ══════════════════════════════════════════════════
    // HELPERS
    // ══════════════════════════════════════════════════

    private setTurnTimeout(): void {
        this.state.storage.setAlarm(Date.now() + TURN_TIMEOUT_MS);
    }

    private addLog(msg: string): void {
        if (this.gameState) {
            this.gameState.log.push(msg);
            if (this.gameState.log.length > 50) {
                this.gameState.log = this.gameState.log.slice(-50);
            }
        }
    }

    private pieceName(type: PieceType): string {
        return ({ pawn: 'Пешка', knight: 'Конь', bishop: 'Слон', rook: 'Ладья', queen: 'Ферзь', king: 'Король' })[type] ?? type;
    }

    private upgradeName(upgrade: Upgrade): string {
        const names: Record<string, string> = {
            diagonal_capture: '↗ Диагональный удар',
            knight_leap: '♞ Прыжок коня',
            bishop_slide: '♝ Скольжение слона',
            rook_rush: '♜ Бросок ладьи',
            extra_life: '❤ Вторая жизнь',
            double_step: '⏩ Двойной шаг',
        };
        return names[upgrade] ?? upgrade;
    }
}
