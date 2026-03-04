// ═══════════════════════════════════════════════════
// Chess Roguelike — Main Entry Point
// Wires up all client modules
// ═══════════════════════════════════════════════════

import './style.css';
import { WSClient } from './network/ws-client.js';
import { CanvasRenderer } from './renderer/canvas.js';
import { KeyboardInput } from './input/keyboard.js';
import { GameClientState } from './state/game-state.js';
import {
    ServerMessage, PieceType, Position,
    getValidMoves,
    PROMOTION_XP,
} from '@chess-roguelike/shared';

// ── DOM Elements ──────────────────────────────────

const $menuScreen = document.getElementById('menu-screen')!;
const $gameScreen = document.getElementById('game-screen')!;
const $btnJoin = document.getElementById('btn-join')!;
const $playerName = document.getElementById('player-name') as HTMLInputElement;
const $roomId = document.getElementById('room-id') as HTMLInputElement;
const $canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const $connectionStatus = document.getElementById('connection-status')!;
const $connectionText = document.getElementById('connection-text')!;

// HUD
const $playerInfoName = document.getElementById('player-info-name')!;
const $xpText = document.getElementById('xp-text')!;
const $floorText = document.getElementById('floor-text')!;
const $capturesText = document.getElementById('captures-text')!;
const $inventoryList = document.getElementById('inventory-list')!;
const $turnIndicator = document.getElementById('turn-indicator')!;
const $turnNumber = document.getElementById('turn-number')!;
const $gameLog = document.getElementById('game-log')!;
const $chatMessages = document.getElementById('chat-messages')!;
const $chatInput = document.getElementById('chat-input') as HTMLInputElement;
const $btnChatSend = document.getElementById('btn-chat-send')!;
const $promotionModal = document.getElementById('promotion-modal')!;
const $promotionOptions = document.getElementById('promotion-options')!;

// ── State ─────────────────────────────────────────

const state = new GameClientState();
let renderer: CanvasRenderer;
let ws: WSClient;
let hoveredTile: Position | null = null;
let animFrameId: number;

// ── Init ──────────────────────────────────────────

function init(): void {
    renderer = new CanvasRenderer($canvas);

    ws = new WSClient(handleServerMessage, handleConnectionStatus);

    new KeyboardInput((action) => {
        if (!state.view || !state.canAct) {
            if (action.action !== 'chat_focus' && action.action !== 'inventory' && action.action !== 'pickup') return;
        }

        switch (action.action) {
            case 'move': {
                const me = state.myPiece;
                if (!me || !state.view) return;
                const to: Position = { x: me.pos.x + action.dx, y: me.pos.y + action.dy };

                // Check if there's an enemy at target (auto-attack via move for Pawn diagonal)
                const enemy = state.view.visibleEnemies.find(
                    e => e.pos.x === to.x && e.pos.y === to.y
                );

                if (enemy) {
                    // Try move-capture
                    ws.send({ type: 'move', to });
                } else {
                    // Regular move
                    ws.send({ type: 'move', to });
                }
                break;
            }
            case 'pickup':
                ws.send({ type: 'pickup' });
                break;
            case 'skip':
                ws.send({ type: 'skip' });
                break;
            case 'descend':
                ws.send({ type: 'descend' });
                break;
            case 'inventory':
                // Toggle inventory visibility (future: expand)
                break;
            case 'chat_focus':
                $chatInput.focus();
                break;
        }
    });

    // Canvas mouse events
    $canvas.addEventListener('mousemove', (e) => {
        const rect = $canvas.getBoundingClientRect();
        hoveredTile = renderer.getTileFromMouse(e.clientX - rect.left, e.clientY - rect.top);
    });

    $canvas.addEventListener('click', (e) => {
        if (!state.view || !state.canAct) return;

        const rect = $canvas.getBoundingClientRect();
        const tile = renderer.getTileFromMouse(e.clientX - rect.left, e.clientY - rect.top);

        // Check if clicking on a valid move
        const isValid = state.validMoves.some(m => m.x === tile.x && m.y === tile.y);
        if (isValid) {
            ws.send({ type: 'move', to: tile });
        }
    });

    $canvas.addEventListener('mouseleave', () => {
        hoveredTile = null;
    });

    // Join button
    $btnJoin.addEventListener('click', joinGame);

    // Chat
    $btnChatSend.addEventListener('click', sendChat);
    $chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            sendChat();
        }
    });

    // Start render loop
    renderLoop();
}

// ── Join Game ─────────────────────────────────────

function joinGame(): void {
    const name = $playerName.value.trim();
    if (!name) {
        $playerName.focus();
        return;
    }

    const roomId = $roomId.value.trim() || `room-${Date.now().toString(36)}`;

    // Auto-detect server URL: same host in production, localhost in dev
    const isLocalDev = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
    const wsProto = location.protocol === 'https:' ? 'wss' : 'ws';
    const serverUrl = isLocalDev
        ? 'ws://localhost:8787'
        : `${wsProto}://${location.host}`;

    state.playerName = name;
    state.roomId = roomId;

    // Connect
    ws.connect(serverUrl, roomId);

    // Switch to game screen after short delay
    $menuScreen.classList.remove('active');
    $gameScreen.classList.add('active');
    renderer.resize();

    // Send join after connection
    const waitForConnection = setInterval(() => {
        if (ws.isConnected) {
            clearInterval(waitForConnection);
            ws.send({ type: 'join', playerName: name });
        }
    }, 100);
}

// ── Server Message Handler ────────────────────────

function handleServerMessage(msg: ServerMessage): void {
    switch (msg.type) {
        case 'snapshot': {
            state.playerId = msg.playerId;
            state.roomId = msg.roomId;
            state.updateView(msg.view);
            updateValidMoves();
            updateHUD();
            break;
        }
        case 'turn_result': {
            state.updateView(msg.view);
            updateValidMoves();
            updateHUD();
            // Add events to log
            for (const event of msg.events) {
                // Events are already logged server-side in the game log
            }
            break;
        }
        case 'player_joined': {
            addChatMessage('🟢', `${msg.playerName} присоединился`);
            break;
        }
        case 'player_left': {
            addChatMessage('🔴', `${msg.playerName} покинул игру`);
            break;
        }
        case 'chat_broadcast': {
            addChatMessage(msg.playerName, msg.text);
            break;
        }
        case 'promotion_available': {
            showPromotionModal(msg.options);
            break;
        }
        case 'error': {
            addChatMessage('⚠️', msg.message);
            break;
        }

        case 'phase_change': {
            // Update turn phase indicator
            if (msg.phase === 'enemies') {
                $turnIndicator.textContent = '🔴 Фаза противников...';
                $turnIndicator.classList.add('waiting');
            } else {
                $turnIndicator.textContent = `⚔️ Фаза союзников (${msg.playersReady}/${msg.playersTotal})`;
                $turnIndicator.classList.remove('waiting');
            }
            $turnNumber.textContent = `Ход #${msg.turnNumber}`;
            break;
        }
    }
}

// ── Connection Status ─────────────────────────────

function handleConnectionStatus(status: 'connecting' | 'connected' | 'disconnected'): void {
    switch (status) {
        case 'connecting':
            $connectionStatus.classList.remove('hidden', 'connected');
            $connectionText.textContent = 'Подключение...';
            break;
        case 'connected':
            $connectionStatus.classList.add('connected');
            $connectionText.textContent = 'Подключено ✓';
            setTimeout(() => $connectionStatus.classList.add('hidden'), 2000);
            break;
        case 'disconnected':
            $connectionStatus.classList.remove('hidden', 'connected');
            $connectionText.textContent = 'Переподключение...';
            break;
    }
}

// ── Valid Moves Calculation ───────────────────────

function updateValidMoves(): void {
    if (!state.view || !state.canAct || !state.myPiece) {
        state.validMoves = [];
        return;
    }

    const me = state.myPiece;
    const friendlyPositions = state.view.visiblePlayers.map(p => p.pos);
    const enemyPositions = state.view.visibleEnemies.map(e => e.pos);

    // Build a partial map from visible tiles for chess-rules
    const mapProxy = {
        width: state.view.mapWidth,
        height: state.view.mapHeight,
        tiles: state.view.tiles.map(row =>
            row.map(t => t.type)
        ),
        rooms: [],
        floor: state.view.floor,
    };

    state.validMoves = getValidMoves(
        me.type,
        me.pos,
        mapProxy,
        friendlyPositions,
        enemyPositions,
    );
}

// ── HUD Updates ───────────────────────────────────

function updateHUD(): void {
    if (!state.view || !state.myPiece) return;
    const me = state.myPiece;

    $playerInfoName.textContent = `${state.pieceSymbol(me.type)} ${state.pieceName(me.type)} — ${me.name}`;

    $xpText.textContent = `${me.stats.xp}/${PROMOTION_XP}`;
    $floorText.textContent = String(state.view.floor);
    $capturesText.textContent = String(me.stats.xp); // XP = captures in chess mode

    // Turn / Phase indicator
    const view = state.view;
    if (view.phase === 'enemies') {
        $turnIndicator.textContent = '🔴 Фаза противников...';
        $turnIndicator.classList.add('waiting');
    } else if (view.canAct) {
        $turnIndicator.textContent = `⚔️ Ваш ход! (${view.playersReady}/${view.playersTotal})`;
        $turnIndicator.classList.remove('waiting');
    } else {
        $turnIndicator.textContent = `✓ Ход сделан (${view.playersReady}/${view.playersTotal})`;
        $turnIndicator.classList.add('waiting');
    }
    $turnNumber.textContent = `Ход #${state.view.turnNumber}`;

    // Inventory
    if (me.inventory.length === 0) {
        $inventoryList.innerHTML = '<div class="inventory-empty">Пусто</div>';
    } else {
        $inventoryList.innerHTML = me.inventory.map(item => `
      <div class="inventory-item" data-item-id="${item.id}" title="Нажмите для использования">
        <span>${item.name}</span>
        <span class="btn-small" style="padding:2px 6px;font-size:10px;">Исп.</span>
      </div>
    `).join('');

        // Attach click handlers
        $inventoryList.querySelectorAll('.inventory-item').forEach(el => {
            el.addEventListener('click', () => {
                const itemId = (el as HTMLElement).dataset.itemId!;
                ws.send({ type: 'use_item', itemId });
            });
        });
    }

    // Game log
    $gameLog.innerHTML = state.view.log.map(
        entry => `<div class="log-entry">${entry}</div>`
    ).join('');
    $gameLog.scrollTop = $gameLog.scrollHeight;
}

// ── Chat ──────────────────────────────────────────

function sendChat(): void {
    const text = $chatInput.value.trim();
    if (!text) return;
    ws.send({ type: 'chat', text });
    $chatInput.value = '';
    $chatInput.blur();
}

function addChatMessage(name: string, text: string): void {
    const div = document.createElement('div');
    div.className = 'chat-msg';
    div.innerHTML = `<span class="chat-name">${name}:</span> ${text}`;
    $chatMessages.appendChild(div);
    $chatMessages.scrollTop = $chatMessages.scrollHeight;
}

// ── Promotion Modal ───────────────────────────────

const PIECE_NAMES: Record<string, string> = {
    knight: 'Конь', bishop: 'Слон', rook: 'Ладья', queen: 'Ферзь',
};

const PIECE_SYMBOLS_WHITE: Record<string, string> = {
    knight: '♘', bishop: '♗', rook: '♖', queen: '♕',
};

function showPromotionModal(options: PieceType[]): void {
    $promotionModal.classList.remove('hidden');

    $promotionOptions.innerHTML = options.map(type => `
    <div class="promotion-option" data-type="${type}">
      <span class="piece-symbol">${PIECE_SYMBOLS_WHITE[type]}</span>
      <span class="piece-name">${PIECE_NAMES[type]}</span>
    </div>
  `).join('');

    $promotionOptions.querySelectorAll('.promotion-option').forEach(el => {
        el.addEventListener('click', () => {
            const pieceType = (el as HTMLElement).dataset.type as PieceType;
            ws.send({ type: 'promote', pieceType });
            $promotionModal.classList.add('hidden');
        });
    });
}

// ── Render Loop ───────────────────────────────────

function renderLoop(): void {
    if (state.view) {
        renderer.render(state.view, state.validMoves, hoveredTile);
    }
    animFrameId = requestAnimationFrame(renderLoop);
}

// ── GO ────────────────────────────────────────────

init();
