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
    explored: boolean; // has this player ever seen this tile
    visible: boolean;  // is currently visible by this player
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

export interface Stats {
    hp: number;
    maxHp: number;
    attack: number;
    defense: number;
    xp: number;
}

export interface PlayerPiece {
    id: string;
    name: string;
    type: PieceType;
    color: 'white';
    pos: Position;
    stats: Stats;
    inventory: Item[];
    floor: number;
    alive: boolean;
}

export interface EnemyPiece {
    id: string;
    type: PieceType;
    color: 'black';
    pos: Position;
    stats: Stats;
    floor: number;
    alive: boolean;
}

export type GamePiece = PlayerPiece | EnemyPiece;

// ── Items / Loot ──────────────────────────────────

export enum ItemType {
    HealthPotion = 'health_potion',
    AttackBoost = 'attack_boost',
    DefenseBoost = 'defense_boost',
    PromotionToken = 'promotion_token',
}

export interface Item {
    id: string;
    type: ItemType;
    name: string;
    value: number; // effect magnitude
    pos?: Position; // if on the ground
}

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
    items: Item[];
    phase: TurnPhase;       // current turn phase
    playersActed: string[]; // IDs of players who already acted this turn
    turnNumber: number;
    log: string[];          // last N game log messages
}

// ── Client View (fog-of-war filtered) ─────────────

export interface ClientView {
    floor: number;
    mapWidth: number;
    mapHeight: number;
    tiles: Tile[][];           // fog-filtered [y][x]
    myPiece: PlayerPiece;
    visiblePlayers: PlayerPiece[];
    visibleEnemies: EnemyPiece[];
    visibleItems: Item[];
    phase: TurnPhase;
    turnNumber: number;
    log: string[];
    canAct: boolean;           // can this player submit an action right now
    playersReady: number;      // how many players have acted this turn
    playersTotal: number;      // total alive players
}
