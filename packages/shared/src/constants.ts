// ═══════════════════════════════════════════════════
// Chess Roguelike — Game Constants
// ═══════════════════════════════════════════════════

import { Upgrade } from './types.js';

/** Default dungeon dimensions (in tiles) */
export const MAP_WIDTH = 48;
export const MAP_HEIGHT = 32;

/** Tile size in pixels for rendering */
export const TILE_SIZE = 24;

/** Max players per room */
export const MAX_PLAYERS = 4;

/** Fog of War — view radius (increases with upgrades) */
export const BASE_VIEW_RADIUS = 5;

/** Turn timeout in ms (30 seconds) */
export const TURN_TIMEOUT_MS = 30_000;

/** BSP dungeon generation params */
export const DUNGEON = {
    MIN_ROOM_SIZE: 4,
    MAX_ROOM_SIZE: 10,
    MIN_ROOMS: 6,
    MAX_ROOMS: 12,
    CORRIDOR_WIDTH: 1,
    BSP_MIN_LEAF: 6,
} as const;

/** Enemy count scaling per floor */
export const ENEMIES_PER_FLOOR = (floor: number) => 3 + Math.floor(floor * 1.5);

/** Captures needed per upgrade */
export const CAPTURES_PER_UPGRADE = 3;

/** Upgrade info — display data for UI */
export const UPGRADE_INFO: Record<Upgrade, { name: string; icon: string; desc: string }> = {
    [Upgrade.DiagonalCapture]: {
        name: 'Диагональный удар',
        icon: '↗',
        desc: 'Захват врагов по диагонали',
    },
    [Upgrade.KnightLeap]: {
        name: 'Прыжок коня',
        icon: '♞',
        desc: 'Ход буквой Г (как конь)',
    },
    [Upgrade.BishopSlide]: {
        name: 'Скольжение слона',
        icon: '♝',
        desc: 'Движение по диагоналям',
    },
    [Upgrade.RookRush]: {
        name: 'Бросок ладьи',
        icon: '♜',
        desc: 'Движение по прямым линиям',
    },
    [Upgrade.ExtraLife]: {
        name: 'Вторая жизнь',
        icon: '❤',
        desc: 'Выживание после одного захвата',
    },
    [Upgrade.DoubleStep]: {
        name: 'Двойной шаг',
        icon: '⏩',
        desc: 'Ход на 2 клетки кардинально',
    },
};

/** All available upgrades */
export const ALL_UPGRADES: Upgrade[] = Object.values(Upgrade);

/** WebSocket close codes */
export const WS_CLOSE = {
    NORMAL: 1000,
    ROOM_FULL: 4001,
    INVALID_MESSAGE: 4002,
    KICKED: 4003,
} as const;
