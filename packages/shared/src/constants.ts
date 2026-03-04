// ═══════════════════════════════════════════════════
// Chess Roguelike — Game Constants
// ═══════════════════════════════════════════════════

/** Default dungeon dimensions (in tiles) */
export const MAP_WIDTH = 48;
export const MAP_HEIGHT = 32;

/** Tile size in pixels for rendering */
export const TILE_SIZE = 24;

/** Max players per room */
export const MAX_PLAYERS = 4;

/** Fog of War — view radius per piece type */
export const VIEW_RADIUS: Record<string, number> = {
    pawn: 4,
    knight: 5,
    bishop: 6,
    rook: 6,
    queen: 7,
    king: 5,
};

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

/** Loot chance per room (0..1) */
export const LOOT_CHANCE = 0.4;

/** Base stats per piece type */
export const BASE_STATS: Record<string, { hp: number; attack: number; defense: number }> = {
    pawn: { hp: 10, attack: 3, defense: 1 },
    knight: { hp: 15, attack: 5, defense: 2 },
    bishop: { hp: 12, attack: 6, defense: 1 },
    rook: { hp: 20, attack: 4, defense: 4 },
    queen: { hp: 18, attack: 7, defense: 3 },
    king: { hp: 30, attack: 8, defense: 5 },
};

/** XP required for promotion */
export const PROMOTION_XP = 10;

/** WebSocket close codes */
export const WS_CLOSE = {
    NORMAL: 1000,
    ROOM_FULL: 4001,
    INVALID_MESSAGE: 4002,
    KICKED: 4003,
} as const;
