// ═══════════════════════════════════════════════════
// Chess Roguelike — Procedural Dungeon Generation
// BSP (Binary Space Partition) algorithm
// ═══════════════════════════════════════════════════

import { DungeonMap, TileType, Room, Position, PieceType, EnemyPiece } from '@chess-roguelike/shared';
import { MAP_WIDTH, MAP_HEIGHT, DUNGEON, ENEMIES_PER_FLOOR } from '@chess-roguelike/shared';
import { SeededRNG } from '../utils/seeded-rng.js';

// ── BSP Leaf Node ─────────────────────────────────

interface BSPLeaf {
    x: number;
    y: number;
    w: number;
    h: number;
    left?: BSPLeaf;
    right?: BSPLeaf;
    room?: Room;
}

function splitLeaf(leaf: BSPLeaf, rng: SeededRNG): boolean {
    if (leaf.left || leaf.right) return false;

    let splitH: boolean;
    if (leaf.w / leaf.h >= 1.25) {
        splitH = false;
    } else if (leaf.h / leaf.w >= 1.25) {
        splitH = true;
    } else {
        splitH = rng.next() > 0.5;
    }

    const max = (splitH ? leaf.h : leaf.w) - DUNGEON.BSP_MIN_LEAF;
    if (max < DUNGEON.BSP_MIN_LEAF) return false;

    const split = rng.int(DUNGEON.BSP_MIN_LEAF, max);

    if (splitH) {
        leaf.left = { x: leaf.x, y: leaf.y, w: leaf.w, h: split };
        leaf.right = { x: leaf.x, y: leaf.y + split, w: leaf.w, h: leaf.h - split };
    } else {
        leaf.left = { x: leaf.x, y: leaf.y, w: split, h: leaf.h };
        leaf.right = { x: leaf.x + split, y: leaf.y, w: leaf.w - split, h: leaf.h };
    }

    return true;
}

function createRoom(leaf: BSPLeaf, rng: SeededRNG): void {
    if (leaf.left && leaf.right) {
        createRoom(leaf.left, rng);
        createRoom(leaf.right, rng);
        return;
    }

    const roomW = rng.int(DUNGEON.MIN_ROOM_SIZE, Math.min(DUNGEON.MAX_ROOM_SIZE, leaf.w - 2));
    const roomH = rng.int(DUNGEON.MIN_ROOM_SIZE, Math.min(DUNGEON.MAX_ROOM_SIZE, leaf.h - 2));
    const roomX = rng.int(leaf.x + 1, leaf.x + leaf.w - roomW - 1);
    const roomY = rng.int(leaf.y + 1, leaf.y + leaf.h - roomH - 1);

    leaf.room = { x: roomX, y: roomY, w: roomW, h: roomH };
}

function getRoom(leaf: BSPLeaf): Room | undefined {
    if (leaf.room) return leaf.room;
    if (leaf.left) {
        const r = getRoom(leaf.left);
        if (r) return r;
    }
    if (leaf.right) {
        return getRoom(leaf.right);
    }
    return undefined;
}

function connectRooms(tiles: TileType[][], r1: Room, r2: Room, rng: SeededRNG): void {
    const p1: Position = {
        x: Math.floor(r1.x + r1.w / 2),
        y: Math.floor(r1.y + r1.h / 2),
    };
    const p2: Position = {
        x: Math.floor(r2.x + r2.w / 2),
        y: Math.floor(r2.y + r2.h / 2),
    };

    if (rng.next() > 0.5) {
        carveHCorridor(tiles, p1.x, p2.x, p1.y);
        carveVCorridor(tiles, p1.y, p2.y, p2.x);
    } else {
        carveVCorridor(tiles, p1.y, p2.y, p1.x);
        carveHCorridor(tiles, p1.x, p2.x, p2.y);
    }
}

function carveHCorridor(tiles: TileType[][], x1: number, x2: number, y: number): void {
    const minX = Math.min(x1, x2);
    const maxX = Math.max(x1, x2);
    for (let x = minX; x <= maxX; x++) {
        if (y >= 0 && y < tiles.length && x >= 0 && x < tiles[0].length) {
            tiles[y][x] = TileType.Floor;
        }
    }
}

function carveVCorridor(tiles: TileType[][], y1: number, y2: number, x: number): void {
    const minY = Math.min(y1, y2);
    const maxY = Math.max(y1, y2);
    for (let y = minY; y <= maxY; y++) {
        if (y >= 0 && y < tiles.length && x >= 0 && x < tiles[0].length) {
            tiles[y][x] = TileType.Floor;
        }
    }
}

function createConnections(leaf: BSPLeaf, tiles: TileType[][], rng: SeededRNG): void {
    if (leaf.left && leaf.right) {
        createConnections(leaf.left, tiles, rng);
        createConnections(leaf.right, tiles, rng);

        const r1 = getRoom(leaf.left);
        const r2 = getRoom(leaf.right);
        if (r1 && r2) {
            connectRooms(tiles, r1, r2, rng);
        }
    }
}

function collectRooms(leaf: BSPLeaf): Room[] {
    const rooms: Room[] = [];
    if (leaf.room) {
        rooms.push(leaf.room);
    }
    if (leaf.left) rooms.push(...collectRooms(leaf.left));
    if (leaf.right) rooms.push(...collectRooms(leaf.right));
    return rooms;
}

// ── Public API ────────────────────────────────────

export function generateDungeon(floor: number, seed: number): DungeonMap {
    const rng = new SeededRNG(seed + floor * 1000);
    const width = MAP_WIDTH;
    const height = MAP_HEIGHT;

    const tiles: TileType[][] = [];
    for (let y = 0; y < height; y++) {
        tiles[y] = new Array(width).fill(TileType.Wall);
    }

    const root: BSPLeaf = { x: 0, y: 0, w: width, h: height };
    const leaves: BSPLeaf[] = [root];
    let didSplit = true;

    while (didSplit) {
        didSplit = false;
        for (const leaf of [...leaves]) {
            if (!leaf.left && !leaf.right) {
                if (leaf.w > DUNGEON.BSP_MIN_LEAF * 2 || leaf.h > DUNGEON.BSP_MIN_LEAF * 2) {
                    if (splitLeaf(leaf, rng)) {
                        leaves.push(leaf.left!, leaf.right!);
                        didSplit = true;
                    }
                }
            }
        }
    }

    createRoom(root, rng);

    const rooms = collectRooms(root);
    for (const room of rooms) {
        for (let y = room.y; y < room.y + room.h; y++) {
            for (let x = room.x; x < room.x + room.w; x++) {
                if (y >= 0 && y < height && x >= 0 && x < width) {
                    tiles[y][x] = TileType.Floor;
                }
            }
        }
    }

    createConnections(root, tiles, rng);

    if (rooms.length >= 2) {
        const firstRoom = rooms[0];
        const lastRoom = rooms[rooms.length - 1];

        const upX = Math.floor(firstRoom.x + firstRoom.w / 2);
        const upY = Math.floor(firstRoom.y + firstRoom.h / 2);
        tiles[upY][upX] = TileType.StairsUp;

        const downX = Math.floor(lastRoom.x + lastRoom.w / 2);
        const downY = Math.floor(lastRoom.y + lastRoom.h / 2);
        tiles[downY][downX] = TileType.StairsDown;
    }

    return { width, height, tiles, rooms, floor };
}

export function getRandomRoomPosition(room: Room, rng: SeededRNG): Position {
    return {
        x: rng.int(room.x + 1, room.x + room.w - 2),
        y: rng.int(room.y + 1, room.y + room.h - 2),
    };
}

export function getSpawnPosition(map: DungeonMap): Position {
    const firstRoom = map.rooms[0];
    return {
        x: Math.floor(firstRoom.x + firstRoom.w / 2) + 1,
        y: Math.floor(firstRoom.y + firstRoom.h / 2),
    };
}

/** Generate enemies — standard chess pieces, no stats */
export function generateEnemies(map: DungeonMap, floor: number, seed: number): EnemyPiece[] {
    const rng = new SeededRNG(seed + floor * 2000 + 777);
    const count = ENEMIES_PER_FLOOR(floor);
    const enemies: EnemyPiece[] = [];

    // Available enemy types scale with floor depth
    const availableTypes: PieceType[] = [PieceType.Pawn];
    if (floor >= 2) availableTypes.push(PieceType.Knight);
    if (floor >= 3) availableTypes.push(PieceType.Bishop);
    if (floor >= 4) availableTypes.push(PieceType.Rook);
    if (floor >= 6) availableTypes.push(PieceType.Queen);

    const eligibleRooms = map.rooms.slice(1);
    if (eligibleRooms.length === 0) return enemies;

    for (let i = 0; i < count; i++) {
        const room = rng.pick(eligibleRooms);
        const type = rng.pick(availableTypes);

        enemies.push({
            id: `enemy-${floor}-${i}`,
            type,
            color: 'black',
            pos: getRandomRoomPosition(room, rng),
            floor,
            alive: true,
        });
    }

    // Boss on every 5th floor — a King
    if (floor % 5 === 0 && floor > 0) {
        const bossRoom = eligibleRooms[eligibleRooms.length - 1];
        enemies.push({
            id: `boss-${floor}`,
            type: PieceType.King,
            color: 'black',
            pos: {
                x: Math.floor(bossRoom.x + bossRoom.w / 2),
                y: Math.floor(bossRoom.y + bossRoom.h / 2),
            },
            floor,
            alive: true,
        });
    }

    return enemies;
}
