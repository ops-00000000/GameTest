// ═══════════════════════════════════════════════════
// Chess Roguelike — WebSocket Protocol
// ═══════════════════════════════════════════════════

import { PieceType, Position, ClientView, Item, TurnPhase } from './types.js';

// ── Client → Server Messages ──────────────────────

export interface JoinRoomMessage {
    type: 'join';
    playerName: string;
}

export interface MoveMessage {
    type: 'move';
    to: Position;
}

export interface AttackMessage {
    type: 'attack';
    targetId: string;
}

export interface UseItemMessage {
    type: 'use_item';
    itemId: string;
}

export interface PickupItemMessage {
    type: 'pickup';
}

export interface PromoteMessage {
    type: 'promote';
    pieceType: PieceType;
}

export interface DescendMessage {
    type: 'descend'; // go down stairs
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
    | AttackMessage
    | UseItemMessage
    | PickupItemMessage
    | PromoteMessage
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

export interface PromotionAvailableMessage {
    type: 'promotion_available';
    options: PieceType[];
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
    | PromotionAvailableMessage
    | PhaseChangeMessage;

// ── Game Events (included in TurnResult) ──────────

export interface MoveEvent {
    event: 'move';
    pieceId: string;
    from: Position;
    to: Position;
}

export interface AttackEvent {
    event: 'attack';
    attackerId: string;
    targetId: string;
    damage: number;
    targetHp: number;
}

export interface DeathEvent {
    event: 'death';
    pieceId: string;
    killedBy: string;
}

export interface PickupEvent {
    event: 'pickup';
    playerId: string;
    item: Item;
}

export interface PromoteEvent {
    event: 'promote';
    playerId: string;
    from: PieceType;
    to: PieceType;
}

export interface DescendEvent {
    event: 'descend';
    newFloor: number;
}

export type GameEvent =
    | MoveEvent
    | AttackEvent
    | DeathEvent
    | PickupEvent
    | PromoteEvent
    | DescendEvent;
