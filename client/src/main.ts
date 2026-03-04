// ═══════════════════════════════════════════════════
// Chess Roguelike — Main Entry Point
// Pawn upgrade system + phase-based turns
// ═══════════════════════════════════════════════════

import './style.css';
import { WSClient } from './network/ws-client.js';
import { CanvasRenderer } from './renderer/canvas.js';
import { KeyboardInput } from './input/keyboard.js';
import { GameClientState } from './state/game-state.js';
import {
    ServerMessage, Position, Upgrade,
    getPlayerMoves,
    CAPTURES_PER_UPGRADE, UPGRADE_INFO,
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
const $capturesText = document.getElementById('captures-text')!;
const $floorText = document.getElementById('floor-text')!;
const $nextUpgradeText = document.getElementById('next-upgrade-text')!;
const $upgradesList = document.getElementById('upgrades-list')!;
const $turnIndicator = document.getElementById('turn-indicator')!;
const $turnNumber = document.getElementById('turn-number')!;
const $gameLog = document.getElementById('game-log')!;
const $chatMessages = document.getElementById('chat-messages')!;
const $chatInput = document.getElementById('chat-input') as HTMLInputElement;
const $btnChatSend = document.getElementById('btn-chat-send')!;
const $upgradeModal = document.getElementById('upgrade-modal')!;
const $upgradeOptions = document.getElementById('upgrade-options')!;
const $defeatModal = document.getElementById('defeat-modal')!;
const $defeatCaptures = document.getElementById('defeat-captures')!;
const $defeatUpgrades = document.getElementById('defeat-upgrades')!;
const $defeatTurns = document.getElementById('defeat-turns')!;
const $btnRestart = document.getElementById('btn-restart')!;

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
            if (action.action !== 'chat_focus') return;
        }

        switch (action.action) {
            case 'move': {
                const me = state.myPiece;
                if (!me || !state.view) return;
                const to: Position = { x: me.pos.x + action.dx, y: me.pos.y + action.dy };
                ws.send({ type: 'move', to });
                break;
            }
            case 'skip':
                ws.send({ type: 'skip' });
                break;
            case 'descend':
                ws.send({ type: 'descend' });
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

    // Restart
    $btnRestart.addEventListener('click', () => {
        location.reload();
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

    // Auto-detect server URL
    const isLocalDev = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
    const wsProto = location.protocol === 'https:' ? 'wss' : 'ws';
    const serverUrl = isLocalDev
        ? 'ws://localhost:8787'
        : `${wsProto}://${location.host}`;

    state.playerName = name;
    state.roomId = roomId;

    ws.connect(serverUrl, roomId);

    $menuScreen.classList.remove('active');
    $gameScreen.classList.add('active');
    renderer.resize();

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
            // Check defeat
            if (msg.view.myPiece && !msg.view.myPiece.alive) {
                showDefeatScreen(msg.view.myPiece.captures, msg.view.myPiece.upgrades.length, msg.view.turnNumber);
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
        case 'upgrade_available': {
            showUpgradeModal(msg.options);
            break;
        }
        case 'error': {
            addChatMessage('⚠️', msg.message);
            break;
        }
        case 'phase_change': {
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

// ── Valid Moves Calculation (upgrade-aware) ───────

function updateValidMoves(): void {
    if (!state.view || !state.canAct || !state.myPiece) {
        state.validMoves = [];
        return;
    }

    const me = state.myPiece;
    const friendlyPositions = state.view.visiblePlayers.map(p => p.pos);
    const enemyPositions = state.view.visibleEnemies.map(e => e.pos);

    const mapProxy = {
        width: state.view.mapWidth,
        height: state.view.mapHeight,
        tiles: state.view.tiles.map(row => row.map(t => t.type)),
        rooms: [],
        floor: state.view.floor,
    };

    // Use upgrade-aware player moves
    state.validMoves = getPlayerMoves(
        me.pos,
        mapProxy,
        friendlyPositions,
        enemyPositions,
        me.upgrades,
    );
}

// ── HUD Updates ───────────────────────────────────

function updateHUD(): void {
    if (!state.view || !state.myPiece) return;
    const me = state.myPiece;

    $playerInfoName.textContent = `♟ Пешка — ${me.name}`;
    $capturesText.textContent = String(me.captures);
    $floorText.textContent = String(state.view.floor);

    // Next upgrade counter
    const remaining = CAPTURES_PER_UPGRADE - (me.captures % CAPTURES_PER_UPGRADE);
    $nextUpgradeText.textContent = remaining === CAPTURES_PER_UPGRADE && me.captures > 0
        ? 'доступен!'
        : `через ${remaining}`;

    // Upgrades list
    if (me.upgrades.length === 0) {
        $upgradesList.innerHTML = '<div class="upgrades-empty">Нет апгрейдов</div>';
    } else {
        $upgradesList.innerHTML = me.upgrades.map(u => {
            const info = UPGRADE_INFO[u];
            return `<div class="upgrade-badge" title="${info.desc}">
                <span class="upgrade-icon">${info.icon}</span>
                <span class="upgrade-name">${info.name}</span>
            </div>`;
        }).join('');
    }

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

// ── Upgrade Modal ─────────────────────────────────

function showUpgradeModal(options: Upgrade[]): void {
    $upgradeModal.classList.remove('hidden');

    $upgradeOptions.innerHTML = options.map(upgrade => {
        const info = UPGRADE_INFO[upgrade];
        return `
        <div class="upgrade-option" data-upgrade="${upgrade}">
            <span class="upgrade-big-icon">${info.icon}</span>
            <span class="upgrade-option-name">${info.name}</span>
            <span class="upgrade-option-desc">${info.desc}</span>
        </div>`;
    }).join('');

    $upgradeOptions.querySelectorAll('.upgrade-option').forEach(el => {
        el.addEventListener('click', () => {
            const upgrade = (el as HTMLElement).dataset.upgrade as Upgrade;
            ws.send({ type: 'choose_upgrade', upgrade });
            $upgradeModal.classList.add('hidden');
        });
    });
}

// ── Defeat Screen ─────────────────────────────────

function showDefeatScreen(captures: number, upgrades: number, turns: number): void {
    $defeatCaptures.textContent = String(captures);
    $defeatUpgrades.textContent = String(upgrades);
    $defeatTurns.textContent = String(turns);
    $defeatModal.classList.remove('hidden');
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
