// ═══════════════════════════════════════════════════
// Chess Roguelike — GameRoom Durable Object
// Phase-based turn system:
//   1. PLAYERS phase — all players submit actions
//   2. ENEMIES phase — all enemies act (server-side)
//   3. Back to PLAYERS phase
// ═══════════════════════════════════════════════════

import {
    GameState, PlayerPiece, EnemyPiece, PieceType, TileType, TurnPhase,
    ClientView, Tile, Position, Item,
    ClientMessage, ServerMessage, GameEvent,
    VIEW_RADIUS, MAX_PLAYERS, TURN_TIMEOUT_MS, BASE_STATS, PROMOTION_XP,
} from '@chess-roguelike/shared';
import { isValidMove, getAttackPositions } from '@chess-roguelike/shared';
import { generateDungeon, generateEnemies, generateItems, getSpawnPosition } from '../game/world.js';
import { playerCaptureEnemy, enemyCapturePlayer, promotePlayer, getPromotionOptions } from '../game/combat.js';
import { computeFOV } from '../game/fov.js';
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
    // Accumulate events during a full turn cycle for broadcasting
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
            case 'attack':
                await this.handleAttack(ws, message.targetId);
                break;
            case 'pickup':
                await this.handlePickup(ws);
                break;
            case 'use_item':
                await this.handleUseItem(ws, message.itemId);
                break;
            case 'promote':
                await this.handlePromote(ws, message.pieceType);
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

            // Check if all remaining players have acted
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

        // Auto-skip for all players who haven't acted
        const alivePlayers = this.gameState.players.filter(p => p.alive);
        for (const player of alivePlayers) {
            if (!this.gameState.playersActed.includes(player.id)) {
                this.gameState.playersActed.push(player.id);
                this.addLog(`⏰ ${player.name} пропустил ход (таймаут)`);
            }
        }

        // Force transition to enemy phase
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
        // Initialize game state on first join
        if (!this.gameState) {
            this.seed = Date.now();
            const map = generateDungeon(1, this.seed);
            const enemies = generateEnemies(map, 1, this.seed);
            const items = generateItems(map, 1, this.seed);

            this.gameState = {
                roomId: '',
                floor: 1,
                map,
                players: [],
                enemies,
                items,
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

        // Create new player as Pawn
        const playerId = `player-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        const spawnPos = getSpawnPosition(this.gameState.map);
        const base = BASE_STATS[PieceType.Pawn];

        const player: PlayerPiece = {
            id: playerId,
            name: playerName,
            type: PieceType.Pawn,
            color: 'white',
            pos: { ...spawnPos },
            stats: { hp: base.hp, maxHp: base.hp, attack: base.attack, defense: base.defense, xp: 0 },
            inventory: [],
            floor: 1,
            alive: true,
        };

        this.gameState.players.push(player);
        this.connections.set(ws, { playerId, playerName });

        this.addLog(`♟️ ${playerName} присоединился как Пешка`);

        // Send snapshot
        const view = this.buildClientView(playerId);
        this.send(ws, { type: 'snapshot', view, roomId: this.gameState.roomId, playerId });

        // Notify others
        this.broadcast({
            type: 'player_joined',
            playerName,
            playerId,
            pieceType: PieceType.Pawn,
        }, ws);

        await this.saveState();
        this.setTurnTimeout();
    }

    // ── Player Action: Move ───────────────────────────

    private async handleMove(ws: WebSocket, to: Position): Promise<void> {
        const conn = this.connections.get(ws);
        if (!conn || !this.gameState) return;

        // Check phase and whether player already acted
        if (!this.canPlayerAct(conn.playerId)) {
            this.send(ws, { type: 'error', message: 'Вы уже сделали ход в этой фазе' });
            return;
        }

        const player = this.gameState.players.find(p => p.id === conn.playerId);
        if (!player || !player.alive) return;

        // Validate move using chess rules
        const friendlyPositions = this.gameState.players
            .filter(p => p.alive && p.id !== player.id).map(p => p.pos);
        const enemyPositions = this.gameState.enemies
            .filter(e => e.alive).map(e => e.pos);

        if (!isValidMove(player.type, player.pos, to, this.gameState.map, friendlyPositions, enemyPositions)) {
            this.send(ws, { type: 'error', message: 'Невалидный ход' });
            return;
        }

        const events: GameEvent[] = [];

        // Check if capture (enemy at destination) — chess style: instant removal
        const targetEnemy = this.gameState.enemies.find(e => e.alive && e.pos.x === to.x && e.pos.y === to.y);
        if (targetEnemy) {
            const result = playerCaptureEnemy(player, targetEnemy);
            events.push({ event: 'death', pieceId: targetEnemy.id, killedBy: player.id });
            this.addLog(`⚔️ ${player.name} захватил ${this.pieceName(targetEnemy.type)}! (+${result.xpGained} XP)`);
            if (result.canPromote) {
                this.send(ws, { type: 'promotion_available', options: getPromotionOptions(player.type) });
                this.addLog(`👑 ${player.name} может повыситься!`);
            }
        }

        // Move piece
        const from = { ...player.pos };
        player.pos = { ...to };
        events.unshift({ event: 'move', pieceId: player.id, from, to });
        this.addLog(`${this.pieceSymbol(player.type)} ${player.name}: ${this.posStr(from)} → ${this.posStr(to)}`);

        // Mark player as acted
        this.markPlayerActed(conn.playerId);
        this.turnEvents.push(...events);

        // Broadcast updated state (so other players see the move immediately)
        this.broadcastPhaseStatus();

        // Check if all players have acted → trigger enemy phase
        await this.checkAllPlayersActed();
        await this.saveState();
    }

    // ── Player Action: Attack ─────────────────────────

    private async handleAttack(ws: WebSocket, targetId: string): Promise<void> {
        const conn = this.connections.get(ws);
        if (!conn || !this.gameState) return;

        if (!this.canPlayerAct(conn.playerId)) {
            this.send(ws, { type: 'error', message: 'Вы уже сделали ход в этой фазе' });
            return;
        }

        const player = this.gameState.players.find(p => p.id === conn.playerId);
        if (!player || !player.alive) return;

        const target = this.gameState.enemies.find(e => e.id === targetId && e.alive);
        if (!target) {
            this.send(ws, { type: 'error', message: 'Цель не найдена' });
            return;
        }

        const attackPositions = getAttackPositions(player.type, player.pos, this.gameState.map);
        if (!attackPositions.some(ap => ap.x === target.pos.x && ap.y === target.pos.y)) {
            this.send(ws, { type: 'error', message: 'Цель вне досягаемости' });
            return;
        }

        // Chess-style capture: instant kill, move to target square
        const result = playerCaptureEnemy(player, target);
        const events: GameEvent[] = [{ event: 'death', pieceId: target.id, killedBy: player.id }];
        this.addLog(`⚔️ ${player.name} захватил ${this.pieceName(target.type)}! (+${result.xpGained} XP)`);

        // Move player to captured square
        const from = { ...player.pos };
        player.pos = { ...target.pos };
        events.push({ event: 'move', pieceId: player.id, from, to: target.pos });

        if (result.canPromote) {
            this.send(ws, { type: 'promotion_available', options: getPromotionOptions(player.type) });
        }

        this.markPlayerActed(conn.playerId);
        this.turnEvents.push(...events);
        this.broadcastPhaseStatus();
        await this.checkAllPlayersActed();
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
            this.addLog(`${this.pieceSymbol(player.type)} ${player.name} пропустил ход`);
        }

        this.markPlayerActed(conn.playerId);
        this.broadcastPhaseStatus();
        await this.checkAllPlayersActed();
        await this.saveState();
    }

    // ── Free Actions (don't consume turn) ─────────────

    private async handlePickup(ws: WebSocket): Promise<void> {
        const conn = this.connections.get(ws);
        if (!conn || !this.gameState) return;

        const player = this.gameState.players.find(p => p.id === conn.playerId);
        if (!player || !player.alive) return;

        const itemIndex = this.gameState.items.findIndex(
            item => item.pos && item.pos.x === player.pos.x && item.pos.y === player.pos.y
        );
        if (itemIndex === -1) {
            this.send(ws, { type: 'error', message: 'Здесь нет предметов' });
            return;
        }

        const item = this.gameState.items[itemIndex];
        this.gameState.items.splice(itemIndex, 1);
        item.pos = undefined;
        player.inventory.push(item);
        this.addLog(`${player.name} подобрал ${item.name}`);
        this.broadcastViews();
        await this.saveState();
    }

    private async handleUseItem(ws: WebSocket, itemId: string): Promise<void> {
        const conn = this.connections.get(ws);
        if (!conn || !this.gameState) return;

        const player = this.gameState.players.find(p => p.id === conn.playerId);
        if (!player || !player.alive) return;

        const itemIndex = player.inventory.findIndex(i => i.id === itemId);
        if (itemIndex === -1) return;

        const item = player.inventory[itemIndex];
        player.inventory.splice(itemIndex, 1);

        switch (item.type) {
            case 'health_potion':
                player.stats.hp = Math.min(player.stats.maxHp, player.stats.hp + item.value);
                this.addLog(`❤️ ${player.name} использовал ${item.name}: +${item.value} HP`);
                break;
            case 'attack_boost':
                player.stats.attack += item.value;
                this.addLog(`⚔️ ${player.name} использовал ${item.name}: +${item.value} ATK`);
                break;
            case 'defense_boost':
                player.stats.defense += item.value;
                this.addLog(`🛡️ ${player.name} использовал ${item.name}: +${item.value} DEF`);
                break;
        }
        this.broadcastViews();
        await this.saveState();
    }

    private async handlePromote(ws: WebSocket, newType: PieceType): Promise<void> {
        const conn = this.connections.get(ws);
        if (!conn || !this.gameState) return;

        const player = this.gameState.players.find(p => p.id === conn.playerId);
        if (!player || !player.alive) return;

        if (player.stats.xp < PROMOTION_XP) {
            this.send(ws, { type: 'error', message: 'Недостаточно XP для повышения' });
            return;
        }

        const options = getPromotionOptions(player.type);
        if (!options.includes(newType)) {
            this.send(ws, { type: 'error', message: 'Невалидный выбор' });
            return;
        }

        const oldType = player.type;
        promotePlayer(player, newType);
        this.addLog(`👑 ${player.name}: ${this.pieceSymbol(oldType)} → ${this.pieceSymbol(newType)}`);
        this.broadcastViews();
        await this.saveState();
    }

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
        const newItems = generateItems(newMap, newFloor, this.seed);
        const spawnPos = getSpawnPosition(newMap);

        this.gameState.floor = newFloor;
        this.gameState.map = newMap;
        this.gameState.enemies = newEnemies;
        this.gameState.items = newItems;

        // Move all alive players to spawn
        for (let i = 0; i < this.gameState.players.length; i++) {
            const p = this.gameState.players[i];
            if (p.alive) {
                p.pos = { x: spawnPos.x + i, y: spawnPos.y };
                p.floor = newFloor;
            }
        }

        // Reset to new player phase
        this.gameState.phase = 'players';
        this.gameState.playersActed = [];

        this.addLog(`🏰 Спуск на этаж ${newFloor}!`);

        // Full re-snapshot for all clients
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

    /** Check if a player can act right now */
    private canPlayerAct(playerId: string): boolean {
        if (!this.gameState) return false;
        if (this.gameState.phase !== 'players') return false;
        return !this.gameState.playersActed.includes(playerId);
    }

    /** Mark a player as having submitted their action */
    private markPlayerActed(playerId: string): void {
        if (!this.gameState) return;
        if (!this.gameState.playersActed.includes(playerId)) {
            this.gameState.playersActed.push(playerId);
        }
    }

    /** Check if all alive players have acted — if so, run enemy phase */
    private async checkAllPlayersActed(): Promise<void> {
        if (!this.gameState || this.gameState.phase !== 'players') return;

        const alivePlayers = this.gameState.players.filter(p => p.alive);
        if (alivePlayers.length === 0) return;

        const allActed = alivePlayers.every(p => this.gameState!.playersActed.includes(p.id));
        if (!allActed) return;

        // ── All players acted → Run enemy phase ──
        this.addLog(`━━━ Фаза противников ━━━`);
        this.gameState.phase = 'enemies';
        this.broadcastPhaseChange();

        await this.runEnemyPhase();

        // ── Start new player phase ──
        this.startPlayerPhase();
        this.broadcastViewsWithEvents(this.turnEvents);
        this.turnEvents = [];
        this.setTurnTimeout();
    }

    /** Execute all enemy actions */
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
                    // Chess-style capture: enemy moves to player's square, player dies
                    const target = this.gameState.players.find(p => p.id === action.targetId);
                    if (target && target.alive) {
                        const from = { ...enemy.pos };
                        enemyCapturePlayer(enemy, target);
                        enemy.pos = { ...target.pos };
                        events.push({ event: 'move', pieceId: enemy.id, from, to: enemy.pos });
                        events.push({ event: 'death', pieceId: target.id, killedBy: enemy.id });
                        this.addLog(`${this.pieceName(enemy.type)} захватил ${target.name}!`);
                    }
                    break;
                }
            }
        }

        this.turnEvents.push(...events);
    }

    /** Begin a new player phase */
    private startPlayerPhase(): void {
        if (!this.gameState) return;
        this.gameState.phase = 'players';
        this.gameState.playersActed = [];
        this.gameState.turnNumber++;
        this.addLog(`━━━ Ход ${this.gameState.turnNumber}: Фаза союзников ━━━`);
    }

    /** Broadcast phase change notification */
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

    /** Broadcast current phase status (how many players have acted) */
    private broadcastPhaseStatus(): void {
        if (!this.gameState) return;
        // Send updated views so everyone sees latest board + their canAct status
        for (const [ws, conn] of this.connections) {
            const view = this.buildClientView(conn.playerId);
            this.send(ws, { type: 'turn_result', view, events: [] });
        }
    }

    // ══════════════════════════════════════════════════
    // VIEW BUILDING (fog of war)
    // ══════════════════════════════════════════════════

    private buildClientView(playerId: string): ClientView {
        const gs = this.gameState!;
        const player = gs.players.find(p => p.id === playerId);

        if (!player) return this.buildSpectatorView();

        const viewRadius = VIEW_RADIUS[player.type] ?? 5;
        const visibleSet = computeFOV(player.pos, viewRadius, gs.map);

        const tiles: Tile[][] = [];
        for (let y = 0; y < gs.map.height; y++) {
            tiles[y] = [];
            for (let x = 0; x < gs.map.width; x++) {
                const key = `${x},${y}`;
                tiles[y][x] = {
                    type: gs.map.tiles[y][x],
                    visible: visibleSet.has(key),
                    explored: visibleSet.has(key),
                };
            }
        }

        const visiblePlayers = gs.players.filter(
            p => p.alive && p.id !== playerId && visibleSet.has(`${p.pos.x},${p.pos.y}`)
        );
        const visibleEnemies = gs.enemies.filter(
            e => e.alive && visibleSet.has(`${e.pos.x},${e.pos.y}`)
        );
        const visibleItems = gs.items.filter(
            i => i.pos && visibleSet.has(`${i.pos.x},${i.pos.y}`)
        );

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
            visibleItems,
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
            visibleItems: [],
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

    private async loadState(): Promise<void> {
        this.gameState = await this.state.storage.get('gameState') ?? null;
        this.seed = await this.state.storage.get('seed') ?? 0;
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

    private pieceSymbol(type: PieceType): string {
        return ({ pawn: '♟', knight: '♞', bishop: '♝', rook: '♜', queen: '♛', king: '♚' })[type] ?? '?';
    }

    private pieceName(type: PieceType): string {
        return ({ pawn: 'Пешка', knight: 'Конь', bishop: 'Слон', rook: 'Ладья', queen: 'Ферзь', king: 'Король' })[type] ?? type;
    }

    private posStr(pos: Position): string {
        return `${String.fromCharCode(65 + pos.x % 26)}${pos.y + 1}`;
    }
}
