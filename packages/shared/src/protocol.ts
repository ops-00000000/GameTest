// ═══════════════════════════════════════════════════
// Chess Roguelike — WebSocket Protocol
// ═══════════════════════════════════════════════════

import { PieceType, Position, ClientView, TurnPhase, Upgrade } from './types.js';

// ── Client → Server Messages ──────────────────────

export interface JoinRoomMessage {
    type: 'join';
    playerName: string;
}

export interface MoveMessage {
    type: 'move';
    to: Position;
}

export interface ChooseUpgradeMessage {
    type: 'choose_upgrade';
    upgrade: Upgrade;
}

export interface DescendMessage {
    type: 'descend';
}

export interface ChatMessage {
    type: 'chat';
    text: string;
}

export interface SkipTurnMessage {
    type: 'skip';
}

export type ClientMessage =
    | JoinRoomMessage
    | MoveMessage
    | ChooseUpgradeMessage
    | DescendMessage
    | ChatMessage
    | SkipTurnMessage;

// ── Server → Client Messages ──────────────────────

export interface GameSnapshotMessage {
    type: 'snapshot';
    view: ClientView;
    roomId: string;
    playerId: string;
}

export interface TurnResultMessage {
    type: 'turn_result';
    view: ClientView;
    events: GameEvent[];
}

export interface PlayerJoinedMessage {
    type: 'player_joined';
    playerName: string;
    playerId: string;
    pieceType: PieceType;
}

export interface PlayerLeftMessage {
    type: 'player_left';
    playerId: string;
    playerName: string;
}

export interface ChatBroadcastMessage {
    type: 'chat_broadcast';
    playerId: string;
    playerName: string;
    text: string;
}

export interface ErrorMessage {
    type: 'error';
    message: string;
}

export interface UpgradeAvailableMessage {
    type: 'upgrade_available';
    options: Upgrade[]; // 2 random upgrades to choose from
}

export interface PhaseChangeMessage {
    type: 'phase_change';
    phase: TurnPhase;
    turnNumber: number;
    playersReady: number;
    playersTotal: number;
}

export type ServerMessage =
    | GameSnapshotMessage
    | TurnResultMessage
    | PlayerJoinedMessage
    | PlayerLeftMessage
    | ChatBroadcastMessage
    | ErrorMessage
    | UpgradeAvailableMessage
    | PhaseChangeMessage;

// ── Game Events (included in TurnResult) ──────────

export interface MoveEvent {
    event: 'move';
    pieceId: string;
    from: Position;
    to: Position;
}

export interface DeathEvent {
    event: 'death';
    pieceId: string;
    killedBy: string;
}

export interface UpgradeEvent {
    event: 'upgrade';
    playerId: string;
    upgrade: Upgrade;
}

export interface DescendEvent {
    event: 'descend';
    newFloor: number;
}

export type GameEvent =
    | MoveEvent
    | DeathEvent
    | UpgradeEvent
    | DescendEvent;
