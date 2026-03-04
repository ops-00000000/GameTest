// ═══════════════════════════════════════════════════
// Chess Roguelike — Canvas Renderer
// Chessboard-style dungeon with Unicode pieces
// ═══════════════════════════════════════════════════

import { ClientView, Tile, TileType, PieceType, Position, PlayerPiece, EnemyPiece, Item } from '@chess-roguelike/shared';
import { TILE_SIZE } from '@chess-roguelike/shared';

// ── Color Palette ─────────────────────────────────

const COLORS = {
    // Tiles
    tileLight: '#2f2f4a',
    tileDark: '#222238',
    tileLightVisible: '#3d3d62',
    tileDarkVisible: '#2f2f4a',
    tileFog: '#111120',
    wall: '#0e0e1c',
    wallVisible: '#1a1a30',
    stairsDown: '#4a3a20',
    stairsUp: '#3a4a20',
    door: '#5a4a2a',

    // Grid lines
    gridLine: 'rgba(60, 60, 100, 0.15)',

    // Pieces
    whitePiece: '#eeeef8',
    whitePieceShadow: 'rgba(100, 100, 255, 0.4)',
    blackPiece: '#dd4444',
    blackPieceShadow: 'rgba(255, 50, 50, 0.4)',

    // Highlights
    validMove: 'rgba(68, 204, 68, 0.35)',
    validMoveStroke: 'rgba(68, 204, 68, 0.6)',
    selectedTile: 'rgba(255, 215, 0, 0.4)',
    myTurnGlow: 'rgba(68, 204, 68, 0.15)',
    itemGlow: 'rgba(255, 215, 0, 0.5)',

    // Items
    item: '#ffd700',
};

// ── Piece Symbols ─────────────────────────────────

const WHITE_SYMBOLS: Record<string, string> = {
    pawn: '♙', knight: '♘', bishop: '♗',
    rook: '♖', queen: '♕', king: '♔',
};

const BLACK_SYMBOLS: Record<string, string> = {
    pawn: '♟', knight: '♞', bishop: '♝',
    rook: '♜', queen: '♛', king: '♚',
};

const ITEM_SYMBOLS: Record<string, string> = {
    health_potion: '❤',
    attack_boost: '⚔',
    defense_boost: '🛡',
    promotion_token: '👑',
};

// ── Renderer ──────────────────────────────────────

export class CanvasRenderer {
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    private tileSize: number = TILE_SIZE;
    private cameraX: number = 0;
    private cameraY: number = 0;
    private targetCameraX: number = 0;
    private targetCameraY: number = 0;

    constructor(canvas: HTMLCanvasElement) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d')!;
        this.resize();
        window.addEventListener('resize', () => this.resize());
    }

    resize(): void {
        const container = this.canvas.parentElement!;
        const dpr = window.devicePixelRatio || 1;
        const w = container.clientWidth;
        const h = container.clientHeight;
        this.canvas.width = w * dpr;
        this.canvas.height = h * dpr;
        this.canvas.style.width = `${w}px`;
        this.canvas.style.height = `${h}px`;
        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    /**
     * Main render function — draws everything based on client view.
     */
    render(
        view: ClientView,
        validMoves: Position[],
        hoveredTile: Position | null,
    ): void {
        const { ctx, canvas } = this;
        const w = canvas.clientWidth;
        const h = canvas.clientHeight;

        // Clear
        ctx.fillStyle = '#08080f';
        ctx.fillRect(0, 0, w, h);

        if (!view || !view.myPiece) return;

        // Smoothly follow player
        this.targetCameraX = view.myPiece.pos.x * this.tileSize - w / 2 + this.tileSize / 2;
        this.targetCameraY = view.myPiece.pos.y * this.tileSize - h / 2 + this.tileSize / 2;
        this.cameraX += (this.targetCameraX - this.cameraX) * 0.15;
        this.cameraY += (this.targetCameraY - this.cameraY) * 0.15;

        ctx.save();
        ctx.translate(-Math.round(this.cameraX), -Math.round(this.cameraY));

        // Calculate visible tile range
        const startX = Math.max(0, Math.floor(this.cameraX / this.tileSize) - 1);
        const startY = Math.max(0, Math.floor(this.cameraY / this.tileSize) - 1);
        const endX = Math.min(view.mapWidth, Math.ceil((this.cameraX + w) / this.tileSize) + 1);
        const endY = Math.min(view.mapHeight, Math.ceil((this.cameraY + h) / this.tileSize) + 1);

        // Draw tiles
        for (let y = startY; y < endY; y++) {
            if (!view.tiles[y]) continue;
            for (let x = startX; x < endX; x++) {
                if (!view.tiles[y][x]) continue;
                this.drawTile(x, y, view.tiles[y][x]);
            }
        }

        // Draw valid move highlights
        for (const pos of validMoves) {
            this.drawHighlight(pos.x, pos.y, COLORS.validMove, COLORS.validMoveStroke);
        }

        // Draw hovered tile
        if (hoveredTile) {
            this.drawHighlight(hoveredTile.x, hoveredTile.y, COLORS.selectedTile, COLORS.selectedTile);
        }

        // Draw items
        for (const item of view.visibleItems) {
            if (item.pos) {
                this.drawItem(item);
            }
        }

        // Draw enemies
        for (const enemy of view.visibleEnemies) {
            this.drawPiece(enemy.pos.x, enemy.pos.y, enemy.type, 'black', enemy.stats.hp, enemy.stats.maxHp);
        }

        // Draw other players
        for (const player of view.visiblePlayers) {
            this.drawPiece(player.pos.x, player.pos.y, player.type, 'white', player.stats.hp, player.stats.maxHp);
        }

        // Draw my piece (always on top)
        const me = view.myPiece;
        // Glow when it's my turn
        if (view.canAct) {
            ctx.fillStyle = COLORS.myTurnGlow;
            ctx.beginPath();
            ctx.arc(
                me.pos.x * this.tileSize + this.tileSize / 2,
                me.pos.y * this.tileSize + this.tileSize / 2,
                this.tileSize * 0.8,
                0, Math.PI * 2,
            );
            ctx.fill();
        }
        this.drawPiece(me.pos.x, me.pos.y, me.type, 'white', me.stats.hp, me.stats.maxHp, true);

        ctx.restore();
    }

    private drawTile(x: number, y: number, tile: Tile): void {
        const { ctx } = this;
        const px = x * this.tileSize;
        const py = y * this.tileSize;
        const isChessLight = (x + y) % 2 === 0;

        if (!tile.visible && !tile.explored) {
            // Completely fog
            ctx.fillStyle = COLORS.tileFog;
            ctx.fillRect(px, py, this.tileSize, this.tileSize);
            return;
        }

        if (tile.type === TileType.Wall) {
            ctx.fillStyle = tile.visible ? COLORS.wallVisible : COLORS.wall;
            ctx.fillRect(px, py, this.tileSize, this.tileSize);

            // Wall pattern
            if (tile.visible) {
                ctx.strokeStyle = 'rgba(40, 40, 70, 0.3)';
                ctx.lineWidth = 0.5;
                ctx.strokeRect(px + 1, py + 1, this.tileSize - 2, this.tileSize - 2);
            }
            return;
        }

        // Floor tiles
        if (tile.visible) {
            ctx.fillStyle = isChessLight ? COLORS.tileLightVisible : COLORS.tileDarkVisible;
        } else {
            // Explored but not visible — dimmed
            ctx.fillStyle = isChessLight ? COLORS.tileLight : COLORS.tileDark;
            ctx.globalAlpha = 0.4;
        }
        ctx.fillRect(px, py, this.tileSize, this.tileSize);
        ctx.globalAlpha = 1;

        // Stairs
        if (tile.type === TileType.StairsDown && tile.visible) {
            ctx.fillStyle = COLORS.stairsDown;
            ctx.fillRect(px + 2, py + 2, this.tileSize - 4, this.tileSize - 4);
            ctx.fillStyle = '#ccaa55';
            ctx.font = `${this.tileSize * 0.6}px ${getComputedStyle(document.body).getPropertyValue('--font-mono') || 'monospace'}`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('▼', px + this.tileSize / 2, py + this.tileSize / 2);
        } else if (tile.type === TileType.StairsUp && tile.visible) {
            ctx.fillStyle = COLORS.stairsUp;
            ctx.fillRect(px + 2, py + 2, this.tileSize - 4, this.tileSize - 4);
            ctx.fillStyle = '#aacc55';
            ctx.font = `${this.tileSize * 0.6}px monospace`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('▲', px + this.tileSize / 2, py + this.tileSize / 2);
        }

        // Subtle grid line
        if (tile.visible) {
            ctx.strokeStyle = COLORS.gridLine;
            ctx.lineWidth = 0.5;
            ctx.strokeRect(px, py, this.tileSize, this.tileSize);
        }
    }

    private drawPiece(
        x: number, y: number,
        type: PieceType, color: 'white' | 'black',
        hp: number, maxHp: number,
        isMe: boolean = false,
    ): void {
        const { ctx } = this;
        const px = x * this.tileSize + this.tileSize / 2;
        const py = y * this.tileSize + this.tileSize / 2;

        const symbols = color === 'white' ? WHITE_SYMBOLS : BLACK_SYMBOLS;
        const pieceColor = color === 'white' ? COLORS.whitePiece : COLORS.blackPiece;
        const shadowColor = color === 'white' ? COLORS.whitePieceShadow : COLORS.blackPieceShadow;

        // Glow shadow
        ctx.shadowColor = shadowColor;
        ctx.shadowBlur = isMe ? 12 : 6;

        // Draw piece symbol
        ctx.fillStyle = pieceColor;
        ctx.font = `${this.tileSize * 0.75}px serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(symbols[type] ?? '?', px, py);

        ctx.shadowBlur = 0;

        // HP bar below piece (if damaged)
        if (hp < maxHp) {
            const barW = this.tileSize - 4;
            const barH = 3;
            const barX = x * this.tileSize + 2;
            const barY = y * this.tileSize + this.tileSize - 4;
            const ratio = Math.max(0, hp / maxHp);

            ctx.fillStyle = 'rgba(0,0,0,0.5)';
            ctx.fillRect(barX, barY, barW, barH);
            ctx.fillStyle = ratio > 0.5 ? '#44cc44' : ratio > 0.25 ? '#ccaa44' : '#cc4444';
            ctx.fillRect(barX, barY, barW * ratio, barH);
        }

        // "Me" indicator
        if (isMe) {
            ctx.strokeStyle = COLORS.whitePiece;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(px, py, this.tileSize * 0.42, 0, Math.PI * 2);
            ctx.stroke();
        }
    }

    private drawItem(item: Item): void {
        if (!item.pos) return;
        const { ctx } = this;
        const px = item.pos.x * this.tileSize + this.tileSize / 2;
        const py = item.pos.y * this.tileSize + this.tileSize / 2;

        // Pulsing glow
        const pulse = 0.6 + Math.sin(Date.now() / 500) * 0.3;
        ctx.shadowColor = COLORS.itemGlow;
        ctx.shadowBlur = 6 * pulse;

        ctx.fillStyle = COLORS.item;
        ctx.font = `${this.tileSize * 0.5}px serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(ITEM_SYMBOLS[item.type] ?? '?', px, py);

        ctx.shadowBlur = 0;
    }

    private drawHighlight(x: number, y: number, fill: string, stroke: string): void {
        const { ctx } = this;
        const px = x * this.tileSize;
        const py = y * this.tileSize;

        ctx.fillStyle = fill;
        ctx.fillRect(px + 1, py + 1, this.tileSize - 2, this.tileSize - 2);

        ctx.strokeStyle = stroke;
        ctx.lineWidth = 1;
        ctx.strokeRect(px + 1, py + 1, this.tileSize - 2, this.tileSize - 2);

        // Dot in center
        ctx.fillStyle = stroke;
        ctx.beginPath();
        ctx.arc(px + this.tileSize / 2, py + this.tileSize / 2, 3, 0, Math.PI * 2);
        ctx.fill();
    }

    /** Get tile coords from mouse position */
    getTileFromMouse(mouseX: number, mouseY: number): Position {
        return {
            x: Math.floor((mouseX + this.cameraX) / this.tileSize),
            y: Math.floor((mouseY + this.cameraY) / this.tileSize),
        };
    }

    get currentTileSize(): number {
        return this.tileSize;
    }
}
