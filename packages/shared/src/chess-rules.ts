// ═══════════════════════════════════════════════════
// Chess Roguelike — Chess Movement Rules
// With upgrade-based movement for the player pawn
// ═══════════════════════════════════════════════════

import { PieceType, Position, TileType, DungeonMap, Upgrade } from './types.js';

export type MoveOffset = [number, number];
export type MoveDirection = [number, number];

// ── Standard Piece Offsets ────────────────────────

const PAWN_MOVE_OFFSETS: MoveOffset[] = [
    [0, -1], [0, 1], [-1, 0], [1, 0],   // 4 cardinal directions
];

const PAWN_DOUBLE_STEP_OFFSETS: MoveOffset[] = [
    [0, -2], [0, 2], [-2, 0], [2, 0],   // 2 tiles cardinal
];

const DIAGONAL_OFFSETS: MoveOffset[] = [
    [-1, -1], [1, -1], [-1, 1], [1, 1],
];

const KNIGHT_OFFSETS: MoveOffset[] = [
    [-2, -1], [-1, -2], [1, -2], [2, -1],
    [2, 1], [1, 2], [-1, 2], [-2, 1],
];

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

function getOffsetMoves(
    pos: Position,
    offsets: MoveOffset[],
    map: DungeonMap,
    occupiedByFriendly: Set<string>,
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
 * Get valid moves for the PLAYER (a pawn with upgrades).
 * Base: 4 cardinal directions.
 * Upgrades add more movement types.
 */
export function getPlayerMoves(
    pos: Position,
    map: DungeonMap,
    friendlyPositions: Position[],
    enemyPositions: Position[],
    upgrades: Upgrade[],
): Position[] {
    const friendlySet = new Set(friendlyPositions.map(p => `${p.x},${p.y}`));
    const enemySet = new Set(enemyPositions.map(p => `${p.x},${p.y}`));
    const seen = new Set<string>();
    const result: Position[] = [];

    const addUnique = (positions: Position[]) => {
        for (const p of positions) {
            const key = `${p.x},${p.y}`;
            if (!seen.has(key)) {
                seen.add(key);
                result.push(p);
            }
        }
    };

    // Base pawn moves: 4 cardinal directions
    addUnique(getOffsetMoves(pos, PAWN_MOVE_OFFSETS, map, friendlySet));

    // Upgrade: Diagonal Capture — can move diagonally ONLY if enemy is there
    if (upgrades.includes(Upgrade.DiagonalCapture)) {
        for (const [dx, dy] of DIAGONAL_OFFSETS) {
            const nx = pos.x + dx;
            const ny = pos.y + dy;
            const key = `${nx},${ny}`;
            if (isWalkable(nx, ny, map) && enemySet.has(key) && !seen.has(key)) {
                seen.add(key);
                result.push({ x: nx, y: ny });
            }
        }
    }

    // Upgrade: Knight Leap
    if (upgrades.includes(Upgrade.KnightLeap)) {
        addUnique(getOffsetMoves(pos, KNIGHT_OFFSETS, map, friendlySet));
    }

    // Upgrade: Bishop Slide
    if (upgrades.includes(Upgrade.BishopSlide)) {
        addUnique(getSlidingMoves(pos, DIAGONAL_DIRS, map, friendlySet, enemySet));
    }

    // Upgrade: Rook Rush
    if (upgrades.includes(Upgrade.RookRush)) {
        addUnique(getSlidingMoves(pos, STRAIGHT_DIRS, map, friendlySet, enemySet));
    }

    // Upgrade: Double Step — move 2 tiles cardinally (must have clear path)
    if (upgrades.includes(Upgrade.DoubleStep)) {
        for (const [dx, dy] of PAWN_DOUBLE_STEP_OFFSETS) {
            const mx = pos.x + dx / 2; // midpoint
            const my = pos.y + dy / 2;
            const nx = pos.x + dx;
            const ny = pos.y + dy;
            const key = `${nx},${ny}`;
            if (
                isWalkable(mx, my, map) &&
                isWalkable(nx, ny, map) &&
                !friendlySet.has(`${mx},${my}`) &&
                !friendlySet.has(key) &&
                !seen.has(key)
            ) {
                seen.add(key);
                result.push({ x: nx, y: ny });
            }
        }
    }

    return result;
}

/**
 * Get valid moves for standard chess pieces (enemies).
 * Uses traditional chess movement rules.
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
            // Enemy pawns: move forward + diagonal capture
            return [
                ...getOffsetMoves(pos, PAWN_MOVE_OFFSETS, map, friendlySet),
            ];

        case PieceType.Knight:
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
 * Get attack positions for a piece (for enemy AI).
 */
export function getAttackPositions(
    pieceType: PieceType,
    pos: Position,
    map: DungeonMap,
): Position[] {
    // Enemy pawns can attack on diagonal
    if (pieceType === PieceType.Pawn) {
        const result: Position[] = [];
        for (const [dx, dy] of DIAGONAL_OFFSETS) {
            const nx = pos.x + dx;
            const ny = pos.y + dy;
            if (isInBounds(nx, ny, map)) {
                result.push({ x: nx, y: ny });
            }
        }
        // Also can capture cardinally (same as move)
        for (const [dx, dy] of PAWN_MOVE_OFFSETS) {
            const nx = pos.x + dx;
            const ny = pos.y + dy;
            if (isInBounds(nx, ny, map)) {
                result.push({ x: nx, y: ny });
            }
        }
        return result;
    }
    return getValidMoves(pieceType, pos, map, [], []);
}

/**
 * Check if a move is valid for the player (with upgrades).
 */
export function isValidPlayerMove(
    pos: Position,
    to: Position,
    map: DungeonMap,
    friendlyPositions: Position[],
    enemyPositions: Position[],
    upgrades: Upgrade[],
): boolean {
    const validMoves = getPlayerMoves(pos, map, friendlyPositions, enemyPositions, upgrades);
    return validMoves.some(m => m.x === to.x && m.y === to.y);
}

/**
 * Check if a move is valid for an enemy piece.
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
