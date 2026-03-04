// ═══════════════════════════════════════════════════
// Chess Roguelike — Client Game State
// ═══════════════════════════════════════════════════

import { ClientView, Position, PieceType, TurnPhase } from '@chess-roguelike/shared';

export class GameClientState {
    view: ClientView | null = null;
    playerId: string = '';
    roomId: string = '';
    playerName: string = '';
    validMoves: Position[] = [];
    selectedTarget: Position | null = null;
    showInventory: boolean = false;

    updateView(view: ClientView): void {
        this.view = view;
    }

    get canAct(): boolean {
        return this.view?.canAct ?? false;
    }

    get myPiece() {
        return this.view?.myPiece ?? null;
    }

    get floor(): number {
        return this.view?.floor ?? 1;
    }

    pieceSymbol(type: PieceType): string {
        const symbols: Record<string, string> = {
            pawn: '♟', knight: '♞', bishop: '♝',
            rook: '♜', queen: '♛', king: '♚',
        };
        return symbols[type] ?? '?';
    }

    pieceName(type: PieceType): string {
        const names: Record<string, string> = {
            pawn: 'Пешка', knight: 'Конь', bishop: 'Слон',
            rook: 'Ладья', queen: 'Ферзь', king: 'Король',
        };
        return names[type] ?? type;
    }
}
