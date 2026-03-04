// ═══════════════════════════════════════════════════
// Chess Roguelike — Premium Canvas Renderer
// Rich chessboard with animations and effects
// ═══════════════════════════════════════════════════

import { ClientView, Tile, TileType, PieceType, Position, Upgrade, UPGRADE_INFO } from '@chess-roguelike/shared';
import { TILE_SIZE } from '@chess-roguelike/shared';

// ── Color Palette (Premium Dark Theme) ────────────

const COLORS = {
    // Board
    boardBg: '#0c0c16',
    tileLight: '#3a3a5c',
    tileDark: '#28283e',
    tileBorder: 'rgba(80, 80, 140, 0.15)',

    // Pieces
    whitePiece: '#f0f0ff',
    whitePieceOutline: '#8888cc',
    whitePieceGlow: 'rgba(120, 120, 255, 0.5)',
    blackPiece: '#ff5555',
    blackPieceOutline: '#cc2222',
    blackPieceGlow: 'rgba(255, 50, 50, 0.5)',

    // Highlights
    validMove: 'rgba(80, 220, 80, 0.3)',
    validMoveDot: 'rgba(80, 220, 80, 0.7)',
    validMoveCapture: 'rgba(255, 80, 80, 0.35)',
    hoveredTile: 'rgba(255, 220, 100, 0.25)',
    myTurnGlow: 'rgba(80, 220, 80, 0.12)',
    extraLifeGlow: 'rgba(255, 80, 80, 0.2)',

    // Board edge
    boardEdge: '#1a1a30',
    boardLabel: 'rgba(150, 150, 200, 0.5)',
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

// ── Particle System ───────────────────────────────

interface Particle {
    x: number; y: number;
    vx: number; vy: number;
    life: number; maxLife: number;
    color: string; size: number;
}

// ── Renderer ──────────────────────────────────────

export class CanvasRenderer {
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    private tileSize: number = TILE_SIZE;
    private cameraX: number = 0;
    private cameraY: number = 0;
    private targetCameraX: number = 0;
    private targetCameraY: number = 0;
    private particles: Particle[] = [];
    private lastEnemyCount: number = 0;
    private animTime: number = 0;

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

    render(view: ClientView, validMoves: Position[], hoveredTile: Position | null): void {
        const { ctx, canvas } = this;
        const w = canvas.clientWidth;
        const h = canvas.clientHeight;
        this.animTime = Date.now();

        // Clear with gradient background
        const bgGrad = ctx.createLinearGradient(0, 0, 0, h);
        bgGrad.addColorStop(0, '#08080f');
        bgGrad.addColorStop(1, '#0c0c1a');
        ctx.fillStyle = bgGrad;
        ctx.fillRect(0, 0, w, h);

        if (!view || !view.myPiece) return;

        // Check for captures (spawn particles)
        const currentEnemyCount = view.visibleEnemies.length;
        if (this.lastEnemyCount > 0 && currentEnemyCount < this.lastEnemyCount) {
            // Enemy was captured — spawn particles at player position
            this.spawnCaptureParticles(
                view.myPiece.pos.x * this.tileSize + this.tileSize / 2,
                view.myPiece.pos.y * this.tileSize + this.tileSize / 2,
            );
        }
        this.lastEnemyCount = currentEnemyCount;

        // Camera
        const boardPixelW = view.mapWidth * this.tileSize;
        const boardPixelH = view.mapHeight * this.tileSize;
        this.targetCameraX = boardPixelW / 2 - w / 2;
        this.targetCameraY = boardPixelH / 2 - h / 2;
        this.cameraX += (this.targetCameraX - this.cameraX) * 0.15;
        this.cameraY += (this.targetCameraY - this.cameraY) * 0.15;

        ctx.save();
        ctx.translate(-Math.round(this.cameraX), -Math.round(this.cameraY));

        // Board shadow / glow
        this.drawBoardShadow(boardPixelW, boardPixelH);

        // Draw tiles
        for (let y = 0; y < view.mapHeight; y++) {
            for (let x = 0; x < view.mapWidth; x++) {
                this.drawTile(x, y, view.mapWidth, view.mapHeight);
            }
        }

        // Draw board border
        ctx.strokeStyle = 'rgba(100, 100, 180, 0.3)';
        ctx.lineWidth = 2;
        ctx.strokeRect(0, 0, boardPixelW, boardPixelH);

        // Draw rank/file labels
        this.drawBoardLabels(view.mapWidth, view.mapHeight);

        // Draw valid move highlights
        const enemySet = new Set(view.visibleEnemies.map(e => `${e.pos.x},${e.pos.y}`));
        for (const pos of validMoves) {
            const isCapture = enemySet.has(`${pos.x},${pos.y}`);
            this.drawMoveHighlight(pos.x, pos.y, isCapture);
        }

        // Draw hovered tile
        if (hoveredTile) {
            this.drawHoverHighlight(hoveredTile.x, hoveredTile.y);
        }

        // Draw enemies with breathing animation
        for (const enemy of view.visibleEnemies) {
            this.drawPiece(enemy.pos.x, enemy.pos.y, enemy.type, 'black');
        }

        // Draw other players
        for (const player of view.visiblePlayers) {
            this.drawPiece(player.pos.x, player.pos.y, player.type, 'white');
        }

        // Draw my piece with effects
        const me = view.myPiece;

        // Turn glow ring
        if (view.canAct) {
            const pulse = 0.7 + Math.sin(this.animTime / 400) * 0.3;
            ctx.fillStyle = `rgba(80, 220, 80, ${0.08 * pulse})`;
            ctx.beginPath();
            ctx.arc(
                me.pos.x * this.tileSize + this.tileSize / 2,
                me.pos.y * this.tileSize + this.tileSize / 2,
                this.tileSize * 0.7,
                0, Math.PI * 2,
            );
            ctx.fill();

            // Animated ring
            ctx.strokeStyle = `rgba(80, 220, 80, ${0.4 * pulse})`;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(
                me.pos.x * this.tileSize + this.tileSize / 2,
                me.pos.y * this.tileSize + this.tileSize / 2,
                this.tileSize * 0.45 + Math.sin(this.animTime / 600) * 3,
                0, Math.PI * 2,
            );
            ctx.stroke();
        }

        // Extra life shield effect
        if (me.hasExtraLife) {
            const pulse = 0.6 + Math.sin(this.animTime / 500) * 0.4;
            ctx.strokeStyle = `rgba(255, 100, 100, ${0.5 * pulse})`;
            ctx.lineWidth = 2;
            ctx.setLineDash([4, 4]);
            ctx.beginPath();
            ctx.arc(
                me.pos.x * this.tileSize + this.tileSize / 2,
                me.pos.y * this.tileSize + this.tileSize / 2,
                this.tileSize * 0.5,
                0, Math.PI * 2,
            );
            ctx.stroke();
            ctx.setLineDash([]);
        }

        this.drawPiece(me.pos.x, me.pos.y, me.type, 'white', true);

        // Draw upgrade markers
        if (me.upgrades.length > 0) {
            this.drawUpgradeMarkers(me.pos.x, me.pos.y, me.upgrades);
        }

        // Draw particles
        this.updateAndDrawParticles();

        ctx.restore();
    }

    // ── Board Drawing ─────────────────────────────────

    private drawBoardShadow(bw: number, bh: number): void {
        const { ctx } = this;
        // Outer glow
        ctx.shadowColor = 'rgba(80, 80, 180, 0.15)';
        ctx.shadowBlur = 40;
        ctx.fillStyle = COLORS.boardEdge;
        ctx.fillRect(-8, -8, bw + 16, bh + 16);
        ctx.shadowBlur = 0;
    }

    private drawTile(x: number, y: number, _mapW: number, _mapH: number): void {
        const { ctx } = this;
        const px = x * this.tileSize;
        const py = y * this.tileSize;
        const isLight = (x + y) % 2 === 0;

        // Tile fill with subtle gradient
        if (isLight) {
            const grad = ctx.createLinearGradient(px, py, px + this.tileSize, py + this.tileSize);
            grad.addColorStop(0, '#3e3e60');
            grad.addColorStop(1, '#363656');
            ctx.fillStyle = grad;
        } else {
            const grad = ctx.createLinearGradient(px, py, px + this.tileSize, py + this.tileSize);
            grad.addColorStop(0, '#2a2a42');
            grad.addColorStop(1, '#252540');
            ctx.fillStyle = grad;
        }
        ctx.fillRect(px, py, this.tileSize, this.tileSize);

        // Subtle inner border
        ctx.strokeStyle = COLORS.tileBorder;
        ctx.lineWidth = 0.5;
        ctx.strokeRect(px + 0.5, py + 0.5, this.tileSize - 1, this.tileSize - 1);
    }

    private drawBoardLabels(mapW: number, mapH: number): void {
        const { ctx } = this;
        ctx.fillStyle = COLORS.boardLabel;
        ctx.font = `${this.tileSize * 0.22}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // File labels (a-p)
        for (let x = 0; x < mapW; x++) {
            const letter = String.fromCharCode(97 + x);
            ctx.fillText(letter, x * this.tileSize + this.tileSize / 2, mapH * this.tileSize + 12);
        }

        // Rank labels (1-16)
        ctx.textAlign = 'right';
        for (let y = 0; y < mapH; y++) {
            ctx.fillText(`${mapH - y}`, -6, y * this.tileSize + this.tileSize / 2);
        }
    }

    // ── Piece Drawing ─────────────────────────────────

    private drawPiece(
        x: number, y: number,
        type: PieceType, color: 'white' | 'black',
        isMe: boolean = false,
    ): void {
        const { ctx } = this;
        const px = x * this.tileSize + this.tileSize / 2;
        const py = y * this.tileSize + this.tileSize / 2;

        const symbols = color === 'white' ? WHITE_SYMBOLS : BLACK_SYMBOLS;
        const pieceColor = color === 'white' ? COLORS.whitePiece : COLORS.blackPiece;
        const glowColor = color === 'white' ? COLORS.whitePieceGlow : COLORS.blackPieceGlow;

        // Breathing animation for enemies
        const breathe = color === 'black'
            ? 1 + Math.sin(this.animTime / 800 + x * 0.7 + y * 1.3) * 0.04
            : 1;
        const fontSize = this.tileSize * 0.65 * breathe;

        // Shadow glow
        ctx.shadowColor = glowColor;
        ctx.shadowBlur = isMe ? 16 : 8;

        // Piece symbol
        ctx.fillStyle = pieceColor;
        ctx.font = `${fontSize}px serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(symbols[type] ?? '?', px, py);

        ctx.shadowBlur = 0;

        // Player circle
        if (isMe) {
            ctx.strokeStyle = 'rgba(200, 200, 255, 0.6)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(px, py, this.tileSize * 0.4, 0, Math.PI * 2);
            ctx.stroke();
        }
    }

    // ── Upgrade Markers ───────────────────────────────

    private drawUpgradeMarkers(x: number, y: number, upgrades: Upgrade[]): void {
        const { ctx } = this;
        const cx = x * this.tileSize + this.tileSize / 2;
        const cy = y * this.tileSize + this.tileSize / 2;
        const radius = this.tileSize * 0.48;
        const count = upgrades.length;

        for (let i = 0; i < count; i++) {
            const angle = (i / Math.max(count, 4)) * Math.PI * 2 - Math.PI / 2;
            const mx = cx + Math.cos(angle) * radius;
            const my = cy + Math.sin(angle) * radius;

            const info = UPGRADE_INFO[upgrades[i]];
            if (!info) continue;

            // Glowing background circle
            ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
            ctx.beginPath();
            ctx.arc(mx, my, 7, 0, Math.PI * 2);
            ctx.fill();

            ctx.strokeStyle = 'rgba(255, 215, 0, 0.4)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.arc(mx, my, 7, 0, Math.PI * 2);
            ctx.stroke();

            // Icon
            ctx.fillStyle = '#ffdd88';
            ctx.font = '9px serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(info.icon, mx, my);
        }
    }

    // ── Move Highlights ───────────────────────────────

    private drawMoveHighlight(x: number, y: number, isCapture: boolean): void {
        const { ctx } = this;
        const px = x * this.tileSize;
        const py = y * this.tileSize;
        const cx = px + this.tileSize / 2;
        const cy = py + this.tileSize / 2;

        if (isCapture) {
            // Capture: red corners
            ctx.fillStyle = COLORS.validMoveCapture;
            ctx.fillRect(px + 1, py + 1, this.tileSize - 2, this.tileSize - 2);

            ctx.strokeStyle = 'rgba(255, 80, 80, 0.6)';
            ctx.lineWidth = 2;
            const s = this.tileSize * 0.3;
            // Top-left corner
            ctx.beginPath();
            ctx.moveTo(px + 2, py + s); ctx.lineTo(px + 2, py + 2); ctx.lineTo(px + s, py + 2);
            ctx.stroke();
            // Top-right corner
            ctx.beginPath();
            ctx.moveTo(px + this.tileSize - s, py + 2); ctx.lineTo(px + this.tileSize - 2, py + 2); ctx.lineTo(px + this.tileSize - 2, py + s);
            ctx.stroke();
            // Bottom-left corner
            ctx.beginPath();
            ctx.moveTo(px + 2, py + this.tileSize - s); ctx.lineTo(px + 2, py + this.tileSize - 2); ctx.lineTo(px + s, py + this.tileSize - 2);
            ctx.stroke();
            // Bottom-right corner
            ctx.beginPath();
            ctx.moveTo(px + this.tileSize - s, py + this.tileSize - 2); ctx.lineTo(px + this.tileSize - 2, py + this.tileSize - 2); ctx.lineTo(px + this.tileSize - 2, py + this.tileSize - s);
            ctx.stroke();
        } else {
            // Normal move: green dot
            const pulse = 0.8 + Math.sin(this.animTime / 500) * 0.2;
            ctx.fillStyle = `rgba(80, 220, 80, ${0.6 * pulse})`;
            ctx.beginPath();
            ctx.arc(cx, cy, this.tileSize * 0.12, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    private drawHoverHighlight(x: number, y: number): void {
        const { ctx } = this;
        const px = x * this.tileSize;
        const py = y * this.tileSize;

        ctx.fillStyle = COLORS.hoveredTile;
        ctx.fillRect(px, py, this.tileSize, this.tileSize);

        ctx.strokeStyle = 'rgba(255, 220, 100, 0.4)';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(px + 1, py + 1, this.tileSize - 2, this.tileSize - 2);
    }

    // ── Particle System ───────────────────────────────

    private spawnCaptureParticles(cx: number, cy: number): void {
        const colors = ['#ff5555', '#ffaa33', '#ffdd44', '#ff8844', '#ffffff'];
        for (let i = 0; i < 20; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 1 + Math.random() * 3;
            this.particles.push({
                x: cx, y: cy,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                life: 1,
                maxLife: 0.6 + Math.random() * 0.4,
                color: colors[Math.floor(Math.random() * colors.length)],
                size: 2 + Math.random() * 3,
            });
        }
    }

    private updateAndDrawParticles(): void {
        const { ctx } = this;
        const dt = 0.032; // ~30fps

        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.x += p.vx;
            p.y += p.vy;
            p.vy += 0.05; // gravity
            p.life -= dt / p.maxLife;

            if (p.life <= 0) {
                this.particles.splice(i, 1);
                continue;
            }

            ctx.globalAlpha = p.life;
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;
    }

    // ── Utility ───────────────────────────────────────

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
