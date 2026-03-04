// ═══════════════════════════════════════════════════
// Chess Roguelike — Combat System (Chess Capture)
// ═══════════════════════════════════════════════════
// Chess rules: capture = move to opponent's square.
// ExtraLife upgrade: survive one capture.

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
 * If player has ExtraLife upgrade, survives once (loses the upgrade).
 * Returns true if player actually died.
 */
export function enemyCapturePlayer(_enemy: EnemyPiece, player: PlayerPiece): boolean {
    if (player.hasExtraLife) {
        player.hasExtraLife = false;
        // Remove ExtraLife from upgrades list
        const idx = player.upgrades.indexOf(Upgrade.ExtraLife);
        if (idx >= 0) player.upgrades.splice(idx, 1);
        return false; // survived!
    }
    player.alive = false;
    return true; // dead
}
