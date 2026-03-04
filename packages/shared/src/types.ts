// ═══════════════════════════════════════════════════
// Chess Roguelike — Core Game Types
// ═══════════════════════════════════════════════════

// ── Position ──────────────────────────────────────

export interface Position {
    x: number;
    y: number;
}

// ── Tiles ─────────────────────────────────────────

export enum TileType {
    Wall = 0,
    Floor = 1,
    StairsDown = 2,
    StairsUp = 3,
    Door = 4,
}

export interface Tile {
    type: TileType;
    explored: boolean;
    visible: boolean;
}

// ── Chess Pieces ──────────────────────────────────

export enum PieceType {
    Pawn = 'pawn',
    Knight = 'knight',
    Bishop = 'bishop',
    Rook = 'rook',
    Queen = 'queen',
    King = 'king',
}

export type PieceColor = 'white' | 'black';

// ── Upgrades (Roguelike perk system) ──────────────

export enum Upgrade {
    DiagonalCapture = 'diagonal_capture',   // capture diagonally
    KnightLeap = 'knight_leap',         // move like a knight
    BishopSlide = 'bishop_slide',        // move diagonally (sliding, 3 tiles)
    RookRush = 'rook_rush',           // move in straight lines (sliding, 3 tiles)
    ExtraLife = 'extra_life',          // survive one capture
    DoubleStep = 'double_step',         // move 2 tiles forward
    // New upgrades:
    SideStep = 'side_step',           // move left/right
    Retreat = 'retreat',             // move backward
    ForwardCapture = 'forward_capture',    // capture by moving forward
    Armor = 'armor',               // 2nd extra life shield
    LongStride = 'long_stride',        // move 3 tiles forward
    Swap = 'swap',                // jump 2 tiles in any direction
}

// ── Player & Enemy Pieces ─────────────────────────

export interface PlayerPiece {
    id: string;
    name: string;
    type: PieceType;     // always Pawn, but kept for rendering compatibility
    color: 'white';
    pos: Position;
    captures: number;    // total enemies captured
    upgrades: Upgrade[]; // acquired upgrades
    hasExtraLife: boolean; // whether extra life is currently active
    floor: number;
    alive: boolean;
}

export interface EnemyPiece {
    id: string;
    type: PieceType;     // standard chess piece type
    color: 'black';
    pos: Position;
    floor: number;
    alive: boolean;
}

export type GamePiece = PlayerPiece | EnemyPiece;

// ── Dungeon Map ───────────────────────────────────

export interface Room {
    x: number;
    y: number;
    w: number;
    h: number;
}

export interface DungeonMap {
    width: number;
    height: number;
    tiles: TileType[][]; // [y][x]
    rooms: Room[];
    floor: number;
}

// ── Turn Phases ───────────────────────────────────

export type TurnPhase = 'players' | 'enemies';

// ── Game State ────────────────────────────────────

export interface GameState {
    roomId: string;
    floor: number;
    map: DungeonMap;
    players: PlayerPiece[];
    enemies: EnemyPiece[];
    phase: TurnPhase;
    playersActed: string[];
    turnNumber: number;
    log: string[];
}

// ── Client View (fog-of-war filtered) ─────────────

export interface ClientView {
    floor: number;
    mapWidth: number;
    mapHeight: number;
    tiles: Tile[][];
    myPiece: PlayerPiece;
    visiblePlayers: PlayerPiece[];
    visibleEnemies: EnemyPiece[];
    phase: TurnPhase;
    turnNumber: number;
    log: string[];
    canAct: boolean;
    playersReady: number;
    playersTotal: number;
}
