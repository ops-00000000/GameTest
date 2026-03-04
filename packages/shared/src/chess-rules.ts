// ═══════════════════════════════════════════════════
// Chess Roguelike — Chess Movement Rules
// ═══════════════════════════════════════════════════

import { PieceType, Position, TileType, DungeonMap } from './types.js';

/**
 * Offset-based moves (for Pawn, Knight, King).
 * Each entry is a [dx, dy] offset from current position.
 */
export type MoveOffset = [number, number];

/**
 * Direction-based moves (for Bishop, Rook, Queen).
 * The piece can move any number of tiles along these directions until blocked.
 */
export type MoveDirection = [number, number];

// ── Pawn Moves ────────────────────────────────────
// Roguelike pawn: moves 1 in any cardinal direction, attacks diagonally
const PAWN_MOVE_OFFSETS: MoveOffset[] = [
    [0, -1], [0, 1], [-1, 0], [1, 0],   // move: 4 cardinal
];
const PAWN_ATTACK_OFFSETS: MoveOffset[] = [
    [-1, -1], [1, -1], [-1, 1], [1, 1],  // attack: 4 diagonal
];

// ── Knight Moves ──────────────────────────────────
const KNIGHT_OFFSETS: MoveOffset[] = [
    [-2, -1], [-1, -2], [1, -2], [2, -1],
    [2, 1], [1, 2], [-1, 2], [-2, 1],
];

// ── King Moves ────────────────────────────────────
const KING_OFFSETS: MoveOffset[] = [
    [-1, -1], [0, -1], [1, -1],
    [-1, 0], [1, 0],
    [-1, 1], [0, 1], [1, 1],
];

// ── Sliding Directions ────────────────────────────
const DIAGONAL_DIRS: MoveDirection[] = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
const STRAIGHT_DIRS: MoveDirection[] = [[0, -1], [0, 1], [-1, 0], [1, 0]];
const ALL_DIRS: MoveDirection[] = [...STRAIGHT_DIRS, ...DIAGONAL_DIRS];

// ── Helpers ───────────────────────────────────────

function isInBounds(x: number, y: number, map: DungeonMap): boolean {
    return x >= 0 && x < map.width && y >= 0 && y < map.height;
}

function isWalkable(x: number, y: number, map: DungeonMap): boolean {
    if (!isInBounds(x, y, map)) return false;
    const t = map.tiles[y][x];
    return t === TileType.Floor || t === TileType.StairsDown || t === TileType.StairsUp || t === TileType.Door;
}

/**
 * Get all valid move positions for offset-based pieces (Pawn, Knight, King).
 */
function getOffsetMoves(
    pos: Position,
    offsets: MoveOffset[],
    map: DungeonMap,
    occupiedByFriendly: Set<string>, // "x,y" strings
): Position[] {
    const result: Position[] = [];
    for (const [dx, dy] of offsets) {
        const nx = pos.x + dx;
        const ny = pos.y + dy;
        if (isWalkable(nx, ny, map) && !occupiedByFriendly.has(`${nx},${ny}`)) {
            result.push({ x: nx, y: ny });
        }
    }
    return result;
}

/**
 * Get all valid move positions for sliding pieces (Bishop, Rook, Queen).
 * Slides along direction until hitting a wall or edge.
 * Can stop on enemy-occupied tile (capture), but not friendly.
 * Knight exception: can jump over walls!
 */
function getSlidingMoves(
    pos: Position,
    directions: MoveDirection[],
    map: DungeonMap,
    occupiedByFriendly: Set<string>,
    occupiedByEnemy: Set<string>,
): Position[] {
    const result: Position[] = [];
    for (const [dx, dy] of directions) {
        let cx = pos.x + dx;
        let cy = pos.y + dy;
        while (isInBounds(cx, cy, map)) {
            if (!isWalkable(cx, cy, map)) break;
            const key = `${cx},${cy}`;
            if (occupiedByFriendly.has(key)) break;
            result.push({ x: cx, y: cy });
            if (occupiedByEnemy.has(key)) break; // can capture but can't go further
            cx += dx;
            cy += dy;
        }
    }
    return result;
}

// ── Public API ────────────────────────────────────

/**
 * Get all valid positions a piece can move to.
 * Takes into account chess rules, dungeon walls, and occupied tiles.
 */
export function getValidMoves(
    pieceType: PieceType,
    pos: Position,
    map: DungeonMap,
    friendlyPositions: Position[],
    enemyPositions: Position[],
): Position[] {
    const friendlySet = new Set(friendlyPositions.map(p => `${p.x},${p.y}`));
    const enemySet = new Set(enemyPositions.map(p => `${p.x},${p.y}`));

    switch (pieceType) {
        case PieceType.Pawn:
            return getOffsetMoves(pos, PAWN_MOVE_OFFSETS, map, friendlySet);

        case PieceType.Knight:
            // Knight can jump over walls! Only check destination.
            return getOffsetMoves(pos, KNIGHT_OFFSETS, map, friendlySet);

        case PieceType.Bishop:
            return getSlidingMoves(pos, DIAGONAL_DIRS, map, friendlySet, enemySet);

        case PieceType.Rook:
            return getSlidingMoves(pos, STRAIGHT_DIRS, map, friendlySet, enemySet);

        case PieceType.Queen:
            return getSlidingMoves(pos, ALL_DIRS, map, friendlySet, enemySet);

        case PieceType.King:
            return getOffsetMoves(pos, KING_OFFSETS, map, friendlySet);

        default:
            return [];
    }
}

/**
 * Get all positions a piece can attack (may differ from move for Pawn).
 */
export function getAttackPositions(
    pieceType: PieceType,
    pos: Position,
    map: DungeonMap,
): Position[] {
    if (pieceType === PieceType.Pawn) {
        // Pawn attacks diagonally
        const result: Position[] = [];
        for (const [dx, dy] of PAWN_ATTACK_OFFSETS) {
            const nx = pos.x + dx;
            const ny = pos.y + dy;
            if (isInBounds(nx, ny, map)) {
                result.push({ x: nx, y: ny });
            }
        }
        return result;
    }
    // All other pieces attack same squares they can move to
    // For simplicity, return all reachable directions (without occupancy check)
    return getValidMoves(pieceType, pos, map, [], []);
}

/**
 * Check if a move from `from` to `to` is valid for given piece type.
 */
export function isValidMove(
    pieceType: PieceType,
    from: Position,
    to: Position,
    map: DungeonMap,
    friendlyPositions: Position[],
    enemyPositions: Position[],
): boolean {
    const validMoves = getValidMoves(pieceType, from, map, friendlyPositions, enemyPositions);
    return validMoves.some(m => m.x === to.x && m.y === to.y);
}
