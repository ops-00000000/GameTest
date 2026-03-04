// ═══════════════════════════════════════════════════
// Chess Roguelike — Shadowcasting Field of View
// ═══════════════════════════════════════════════════

import { Position, DungeonMap, TileType } from '@chess-roguelike/shared';

/**
 * Recursive shadowcasting for FOV calculation.
 * Returns set of visible positions as "x,y" strings.
 *
 * Based on the classic Björn Bergström algorithm.
 */
export function computeFOV(
    origin: Position,
    radius: number,
    map: DungeonMap,
): Set<string> {
    const visible = new Set<string>();
    visible.add(`${origin.x},${origin.y}`);

    for (let octant = 0; octant < 8; octant++) {
        castLight(map, origin, radius, 1, 1.0, 0.0, octant, visible);
    }

    return visible;
}

// Octant transformation multipliers
const MULT: number[][] = [
    [1, 0, 0, -1, -1, 0, 0, 1],  // xx
    [0, 1, -1, 0, 0, -1, 1, 0],  // xy
    [0, 1, 1, 0, 0, -1, -1, 0],  // yx
    [1, 0, 0, 1, -1, 0, 0, -1],  // yy
];

function castLight(
    map: DungeonMap,
    origin: Position,
    radius: number,
    row: number,
    startSlope: number,
    endSlope: number,
    octant: number,
    visible: Set<string>,
): void {
    if (startSlope < endSlope) return;

    let nextStartSlope = startSlope;

    for (let j = row; j <= radius; j++) {
        let blocked = false;

        for (let dx = -j; dx <= 0; dx++) {
            const dy = -j;

            // Map to actual coordinates using octant multipliers
            const mapX = origin.x + dx * MULT[0][octant] + dy * MULT[1][octant];
            const mapY = origin.y + dx * MULT[2][octant] + dy * MULT[3][octant];

            const leftSlope = (dx - 0.5) / (dy + 0.5);
            const rightSlope = (dx + 0.5) / (dy - 0.5);

            if (rightSlope > startSlope) continue;
            if (leftSlope < endSlope) break;

            // Check bounds
            if (mapX < 0 || mapX >= map.width || mapY < 0 || mapY >= map.height) {
                blocked = true;
                nextStartSlope = rightSlope;
                continue;
            }

            // Within radius?
            const dist2 = dx * dx + dy * dy;
            if (dist2 <= radius * radius) {
                visible.add(`${mapX},${mapY}`);
            }

            const isOpaque = map.tiles[mapY][mapX] === TileType.Wall;

            if (blocked) {
                if (isOpaque) {
                    nextStartSlope = rightSlope;
                } else {
                    blocked = false;
                    startSlope = nextStartSlope;
                }
            } else if (isOpaque && j < radius) {
                blocked = true;
                castLight(map, origin, radius, j + 1, startSlope, rightSlope, octant, visible);
                nextStartSlope = rightSlope;
            }
        }

        if (blocked) break;
    }
}
