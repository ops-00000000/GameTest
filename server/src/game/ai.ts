// ═══════════════════════════════════════════════════
// Chess Roguelike — Enemy AI
// ═══════════════════════════════════════════════════

import { EnemyPiece, PlayerPiece, DungeonMap, Position, TileType } from '@chess-roguelike/shared';
import { getValidMoves, getAttackPositions } from '@chess-roguelike/shared';

/**
 * Determine the best action for an enemy piece.
 * 1. If a player is in attack range → attack
 * 2. If a player is nearby → move towards closest
 * 3. Otherwise → random valid move or stay
 */
export function getEnemyAction(
    enemy: EnemyPiece,
    players: PlayerPiece[],
    enemies: EnemyPiece[],
    map: DungeonMap,
): { type: 'move'; to: Position } | { type: 'attack'; targetId: string } | { type: 'stay' } {
    const alivePlayers = players.filter(p => p.alive);
    if (alivePlayers.length === 0) return { type: 'stay' };

    // Friendly positions = other alive enemies
    const friendlyPositions = enemies
        .filter(e => e.id !== enemy.id && e.alive)
        .map(e => e.pos);

    const playerPositions = alivePlayers.map(p => p.pos);

    // 1. Check if any player is in attack range
    const attackPositions = getAttackPositions(enemy.type, enemy.pos, map);
    for (const player of alivePlayers) {
        if (attackPositions.some(ap => ap.x === player.pos.x && ap.y === player.pos.y)) {
            return { type: 'attack', targetId: player.id };
        }
    }

    // 2. Move towards closest visible player
    const closestPlayer = findClosestPlayer(enemy.pos, alivePlayers);
    if (closestPlayer && manhattanDist(enemy.pos, closestPlayer.pos) <= 8) {
        const validMoves = getValidMoves(
            enemy.type,
            enemy.pos,
            map,
            friendlyPositions,
            playerPositions,
        );

        if (validMoves.length > 0) {
            // Pick the move that gets us closest to the player
            let bestMove = validMoves[0];
            let bestDist = manhattanDist(validMoves[0], closestPlayer.pos);

            for (const move of validMoves) {
                const d = manhattanDist(move, closestPlayer.pos);
                if (d < bestDist) {
                    bestDist = d;
                    bestMove = move;
                }
            }

            return { type: 'move', to: bestMove };
        }
    }

    // 3. Random wander (30% chance to move)
    if (Math.random() < 0.3) {
        const validMoves = getValidMoves(
            enemy.type,
            enemy.pos,
            map,
            friendlyPositions,
            playerPositions,
        );

        if (validMoves.length > 0) {
            const randomMove = validMoves[Math.floor(Math.random() * validMoves.length)];
            return { type: 'move', to: randomMove };
        }
    }

    return { type: 'stay' };
}

function manhattanDist(a: Position, b: Position): number {
    return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function findClosestPlayer(pos: Position, players: PlayerPiece[]): PlayerPiece | null {
    let closest: PlayerPiece | null = null;
    let minDist = Infinity;

    for (const player of players) {
        const d = manhattanDist(pos, player.pos);
        if (d < minDist) {
            minDist = d;
            closest = player;
        }
    }

    return closest;
}
