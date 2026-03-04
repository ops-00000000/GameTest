// ═══════════════════════════════════════════════════
// Chess Roguelike — Combat System
// ═══════════════════════════════════════════════════

import { PlayerPiece, EnemyPiece, Stats, PieceType } from '@chess-roguelike/shared';
import { PROMOTION_XP } from '@chess-roguelike/shared';

export interface CombatResult {
    damage: number;
    targetHp: number;
    killed: boolean;
    xpGained: number;
    canPromote: boolean;
}

/** Calculate damage: attacker.attack - defender.defense (min 1) */
function calcDamage(attacker: Stats, defender: Stats): number {
    return Math.max(1, attacker.attack - defender.defense);
}

/** XP reward for killing an enemy */
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

/** Player attacks an enemy */
export function playerAttackEnemy(player: PlayerPiece, enemy: EnemyPiece): CombatResult {
    const damage = calcDamage(player.stats, enemy.stats);
    enemy.stats.hp -= damage;

    const killed = enemy.stats.hp <= 0;
    let xpGained = 0;
    let canPromote = false;

    if (killed) {
        enemy.alive = false;
        xpGained = xpReward(enemy.type);
        player.stats.xp += xpGained;
        canPromote = player.stats.xp >= PROMOTION_XP && player.type !== PieceType.Queen;
    }

    return {
        damage,
        targetHp: Math.max(0, enemy.stats.hp),
        killed,
        xpGained,
        canPromote,
    };
}

/** Enemy attacks a player */
export function enemyAttackPlayer(enemy: EnemyPiece, player: PlayerPiece): CombatResult {
    const damage = calcDamage(enemy.stats, player.stats);
    player.stats.hp -= damage;

    const killed = player.stats.hp <= 0;
    if (killed) {
        player.alive = false;
    }

    return {
        damage,
        targetHp: Math.max(0, player.stats.hp),
        killed,
        xpGained: 0,
        canPromote: false,
    };
}

/** Apply promotion — change player's piece type and reset XP */
export function promotePlayer(player: PlayerPiece, newType: PieceType): void {
    const { hp: baseHp, attack, defense } = {
        knight: { hp: 15, attack: 5, defense: 2 },
        bishop: { hp: 12, attack: 6, defense: 1 },
        rook: { hp: 20, attack: 4, defense: 4 },
        queen: { hp: 18, attack: 7, defense: 3 },
    }[newType] ?? { hp: 10, attack: 3, defense: 1 };

    player.type = newType;
    player.stats.maxHp = baseHp;
    player.stats.hp = baseHp; // full heal on promotion
    player.stats.attack = attack;
    player.stats.defense = defense;
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
