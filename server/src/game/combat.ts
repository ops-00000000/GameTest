// ═══════════════════════════════════════════════════
// Chess Roguelike — Combat System (Chess Capture)
// ═══════════════════════════════════════════════════
// Original chess rules: capture = instant death.
// Move to enemy square → enemy is removed.
// Enemy moves to player square → player is removed.

import { PlayerPiece, EnemyPiece, PieceType } from '@chess-roguelike/shared';
import { PROMOTION_XP } from '@chess-roguelike/shared';

export interface CaptureResult {
    captured: true;
    xpGained: number;
    canPromote: boolean;
}

/** XP reward for capturing an enemy piece */
function xpReward(enemyType: PieceType): number {
    const rewards: Record<string, number> = {
        pawn: 1,
        knight: 3,
        bishop: 3,
        rook: 4,
        queen: 5,
        king: 10,
    };
    return rewards[enemyType] ?? 1;
}

/** Player captures an enemy — chess style: instant removal */
export function playerCaptureEnemy(player: PlayerPiece, enemy: EnemyPiece): CaptureResult {
    enemy.alive = false;
    const xpGained = xpReward(enemy.type);
    player.stats.xp += xpGained;
    const canPromote = player.stats.xp >= PROMOTION_XP && player.type !== PieceType.Queen;

    return { captured: true, xpGained, canPromote };
}

/** Enemy captures a player — chess style: instant death */
export function enemyCapturePlayer(_enemy: EnemyPiece, player: PlayerPiece): void {
    player.alive = false;
}

/** Apply promotion — change player's piece type and reset XP */
export function promotePlayer(player: PlayerPiece, newType: PieceType): void {
    player.type = newType;
    player.stats.xp = 0;
}

/** Get valid promotion options based on current piece */
export function getPromotionOptions(currentType: PieceType): PieceType[] {
    switch (currentType) {
        case PieceType.Pawn:
            return [PieceType.Knight, PieceType.Bishop, PieceType.Rook];
        case PieceType.Knight:
        case PieceType.Bishop:
        case PieceType.Rook:
            return [PieceType.Queen];
        default:
            return [];
    }
}
