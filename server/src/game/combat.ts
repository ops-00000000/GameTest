// ═══════════════════════════════════════════════════
// Chess Roguelike — Combat System (Chess Capture)
// ═══════════════════════════════════════════════════
// Chess rules: capture = move to opponent's square.
// ExtraLife / Armor upgrades: survive captures.

import { PlayerPiece, EnemyPiece, Upgrade } from '@chess-roguelike/shared';

export interface CaptureResult {
    captured: true;
}

/** Player captures an enemy — chess style: instant removal */
export function playerCaptureEnemy(player: PlayerPiece, enemy: EnemyPiece): CaptureResult {
    enemy.alive = false;
    player.captures++;
    return { captured: true };
}

/**
 * Enemy captures a player — chess style.
 * If player has ExtraLife or Armor upgrade, survives (loses the shield).
 * Returns true if player actually died.
 */
export function enemyCapturePlayer(_enemy: EnemyPiece, player: PlayerPiece): boolean {
    if (player.hasExtraLife) {
        player.hasExtraLife = false;
        // Remove one shield upgrade (ExtraLife first, then Armor)
        const extraIdx = player.upgrades.indexOf(Upgrade.ExtraLife);
        const armorIdx = player.upgrades.indexOf(Upgrade.Armor);
        if (extraIdx >= 0) {
            player.upgrades.splice(extraIdx, 1);
        } else if (armorIdx >= 0) {
            player.upgrades.splice(armorIdx, 1);
        }
        // Check if still has another shield
        player.hasExtraLife = player.upgrades.includes(Upgrade.ExtraLife) ||
            player.upgrades.includes(Upgrade.Armor);
        return false; // survived!
    }
    player.alive = false;
    return true; // dead
}
