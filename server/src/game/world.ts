// ═══════════════════════════════════════════════════
// Chess Roguelike — Board Generation
// Large chessboard with fog of war
// ═══════════════════════════════════════════════════

import { DungeonMap, TileType, Room, Position, PieceType, EnemyPiece } from '@chess-roguelike/shared';
import { MAP_WIDTH, MAP_HEIGHT, ENEMIES_PER_FLOOR } from '@chess-roguelike/shared';
import { SeededRNG } from '../utils/seeded-rng.js';

/** Generate a chessboard — all floor tiles, no walls */
export function generateDungeon(floor: number, seed: number): DungeonMap {
    const width = MAP_WIDTH;
    const height = MAP_HEIGHT;

    const tiles: TileType[][] = [];
    for (let y = 0; y < height; y++) {
        tiles[y] = [];
        for (let x = 0; x < width; x++) {
            tiles[y][x] = TileType.Floor;
        }
    }

    // Single room covering the whole board
    const rooms: Room[] = [{ x: 0, y: 0, w: width, h: height }];

    return { width, height, tiles, rooms, floor };
}

/** Spawn position — bottom center of the board */
export function getSpawnPosition(map: DungeonMap): Position {
    return {
        x: Math.floor(map.width / 2),
        y: map.height - 1,  // bottom row
    };
}

/** Get random position on the board (not on bottom 2 rows — player spawn zone) */
function getEnemyPosition(width: number, height: number, rng: SeededRNG, occupied: Set<string>): Position {
    let attempts = 0;
    while (attempts < 100) {
        const x = rng.int(0, width - 1);
        const y = rng.int(0, height - 4); // top portion of board
        const key = `${x},${y}`;
        if (!occupied.has(key)) {
            occupied.add(key);
            return { x, y };
        }
        attempts++;
    }
    return { x: 0, y: 0 };
}

/** Generate enemies — chess pieces scattered across the board */
export function generateEnemies(map: DungeonMap, floor: number, seed: number): EnemyPiece[] {
    const rng = new SeededRNG(seed + floor * 2000 + 777);
    const count = ENEMIES_PER_FLOOR(floor);
    const enemies: EnemyPiece[] = [];
    const occupied = new Set<string>();

    // Available enemy types scale with floor
    const availableTypes: PieceType[] = [PieceType.Pawn, PieceType.Pawn]; // more pawns
    if (floor >= 1) availableTypes.push(PieceType.Knight);
    if (floor >= 2) availableTypes.push(PieceType.Bishop);
    if (floor >= 3) availableTypes.push(PieceType.Rook);
    if (floor >= 5) availableTypes.push(PieceType.Queen);

    for (let i = 0; i < count; i++) {
        const type = rng.pick(availableTypes);
        const pos = getEnemyPosition(map.width, map.height, rng, occupied);

        enemies.push({
            id: `enemy-${floor}-${i}`,
            type,
            color: 'black',
            pos,
            floor,
            alive: true,
        });
    }

    // Boss on every 5th floor
    if (floor % 5 === 0 && floor > 0) {
        const bossPos = getEnemyPosition(map.width, map.height, rng, occupied);
        enemies.push({
            id: `boss-${floor}`,
            type: PieceType.King,
            color: 'black',
            pos: bossPos,
            floor,
            alive: true,
        });
    }

    return enemies;
}
