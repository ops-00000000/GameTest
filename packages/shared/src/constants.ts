// ═══════════════════════════════════════════════════
// Chess Roguelike — Game Constants
// ═══════════════════════════════════════════════════

import { Upgrade } from './types.js';

/** Chessboard dimensions */
export const MAP_WIDTH = 16;
export const MAP_HEIGHT = 16;

/** Tile size in pixels for rendering */
export const TILE_SIZE = 48;

/** Max players per room */
export const MAX_PLAYERS = 4;

/** Fog of War — view radius (increases with upgrades) */
export const BASE_VIEW_RADIUS = 5;

/** Turn timeout in ms (30 seconds) */
export const TURN_TIMEOUT_MS = 30_000;

/** Enemy count — lots of pieces on the board */
export const ENEMIES_PER_FLOOR = (floor: number) => 8 + Math.floor(floor * 3);

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
        desc: 'Скольжение по диагонали (до 3 клеток)',
    },
    [Upgrade.RookRush]: {
        name: 'Бросок ладьи',
        icon: '♜',
        desc: 'Скольжение по прямой (до 3 клеток)',
    },
    [Upgrade.ExtraLife]: {
        name: 'Вторая жизнь',
        icon: '❤',
        desc: 'Выживание после одного захвата',
    },
    [Upgrade.DoubleStep]: {
        name: 'Двойной шаг',
        icon: '⏩',
        desc: 'Продвижение на 2 клетки вперёд',
    },
    [Upgrade.SideStep]: {
        name: 'Боковой шаг',
        icon: '↔',
        desc: 'Движение влево и вправо',
    },
    [Upgrade.Retreat]: {
        name: 'Отступление',
        icon: '↩',
        desc: 'Движение назад на 1 клетку',
    },
    [Upgrade.ForwardCapture]: {
        name: 'Таран',
        icon: '🗡',
        desc: 'Захват врага прямо перед собой',
    },
    [Upgrade.Armor]: {
        name: 'Броня',
        icon: '🛡',
        desc: 'Ещё один щит (как вторая жизнь)',
    },
    [Upgrade.LongStride]: {
        name: 'Длинный шаг',
        icon: '🏃',
        desc: 'Ход на 3 клетки вперёд',
    },
    [Upgrade.Swap]: {
        name: 'Телепорт',
        icon: '⚡',
        desc: 'Прыжок на 2 клетки в любом направлении',
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
