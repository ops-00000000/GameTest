// ═══════════════════════════════════════════════════
// Chess Roguelike — Premium Canvas Renderer
// Rich chessboard with piece move animations
// ═══════════════════════════════════════════════════

import { ClientView, Tile, TileType, PieceType, Position, Upgrade, UPGRADE_INFO, GameEvent } from '@chess-roguelike/shared';
import { TILE_SIZE } from '@chess-roguelike/shared';

// ── Color Palette (Premium Dark Theme) ────────────

const COLORS = {
    boardBg: '#0c0c16',
    tileLight: '#3a3a5c',
    tileDark: '#28283e',
    tileBorder: 'rgba(80, 80, 140, 0.15)',
    whitePiece: '#f0f0ff',
    whitePieceGlow: 'rgba(120, 120, 255, 0.5)',
    blackPiece: '#ff5555',
    blackPieceGlow: 'rgba(255, 50, 50, 0.5)',
    validMove: 'rgba(80, 220, 80, 0.3)',
    validMoveCapture: 'rgba(255, 80, 80, 0.35)',
    hoveredTile: 'rgba(255, 220, 100, 0.25)',
    boardEdge: '#1a1a30',
    boardLabel: 'rgba(150, 150, 200, 0.5)',
};

const WHITE_SYMBOLS: Record<string, string> = {
    pawn: '♙', knight: '♘', bishop: '♗',
    rook: '♖', queen: '♕', king: '♔',
};

const BLACK_SYMBOLS: Record<string, string> = {
    pawn: '♟', knight: '♞', bishop: '♝',
    rook: '♜', queen: '♛', king: '♚',
};

// ── Animation Types ───────────────────────────────

interface PieceAnim {
    pieceId: string;
    fromX: number; fromY: number;
    toX: number; toY: number;
    startTime: number;
    duration: number;
}

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
    private particles: Particle[] = [];
    private lastEnemyCount: number = 0;
    private animTime: number = 0;

    // Animation queue: sequential enemy moves
    private animations: PieceAnim[] = [];
    private activeAnimIndex: number = 0;
    private animDurationMs: number = 250; // ms per piece move

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

    /** Queue move animations from server events */
    queueAnimations(events: GameEvent[]): void {
        const now = Date.now();
        let delay = 0;

        for (const ev of events) {
            if (ev.event === 'move') {
                this.animations.push({
                    pieceId: ev.pieceId,
                    fromX: ev.from.x, fromY: ev.from.y,
                    toX: ev.to.x, toY: ev.to.y,
                    startTime: now + delay,
                    duration: this.animDurationMs,
                });
                // Only add sequential delay for enemy moves (not player)
                if (ev.pieceId.startsWith('enemy') || ev.pieceId.startsWith('boss')) {
                    delay += this.animDurationMs + 50; // stagger
                }
            }
            if (ev.event === 'death') {
                // Spawn capture particles at the death location after animations
                const moveEv = events.find(e => e.event === 'move' && e.pieceId === ev.killedBy);
                if (moveEv && moveEv.event === 'move') {
                    setTimeout(() => {
                        this.spawnCaptureParticles(
                            moveEv.to.x * this.tileSize + this.tileSize / 2,
                            moveEv.to.y * this.tileSize + this.tileSize / 2,
                        );
                    }, delay);
                }
            }
        }
    }

    /** Get animated position for a piece (if animating) */
    private getAnimatedPos(pieceId: string, currentX: number, currentY: number): { x: number, y: number } {
        const now = Date.now();

        for (const anim of this.animations) {
            if (anim.pieceId !== pieceId) continue;

            const elapsed = now - anim.startTime;
            if (elapsed < 0) {
                // Animation hasn't started yet — show at from position
                return { x: anim.fromX, y: anim.fromY };
            }
            if (elapsed < anim.duration) {
                // Animating — smooth interpolation with easeInOut
                const t = elapsed / anim.duration;
                const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
                return {
                    x: anim.fromX + (anim.toX - anim.fromX) * ease,
                    y: anim.fromY + (anim.toY - anim.fromY) * ease,
                };
            }
            // Animation done — continue to next (already at final position)
        }

        // Clean up finished animations periodically
        if (this.animations.length > 0) {
            const allDone = this.animations.every(a => now > a.startTime + a.duration + 100);
            if (allDone) {
                this.animations = [];
            }
        }

        return { x: currentX, y: currentY };
    }

    render(view: ClientView, validMoves: Position[], hoveredTile: Position | null): void {
        const { ctx, canvas } = this;
        const w = canvas.clientWidth;
        const h = canvas.clientHeight;
        this.animTime = Date.now();

        // Background gradient
        const bgGrad = ctx.createLinearGradient(0, 0, 0, h);
        bgGrad.addColorStop(0, '#08080f');
        bgGrad.addColorStop(1, '#0c0c1a');
        ctx.fillStyle = bgGrad;
        ctx.fillRect(0, 0, w, h);

        if (!view || !view.myPiece) return;

        // Camera centered on board
        const boardPixelW = view.mapWidth * this.tileSize;
        const boardPixelH = view.mapHeight * this.tileSize;
        const targetCX = boardPixelW / 2 - w / 2;
        const targetCY = boardPixelH / 2 - h / 2;
        this.cameraX += (targetCX - this.cameraX) * 0.15;
        this.cameraY += (targetCY - this.cameraY) * 0.15;

        ctx.save();
        ctx.translate(-Math.round(this.cameraX), -Math.round(this.cameraY));

        // Board
        this.drawBoardShadow(boardPixelW, boardPixelH);
        for (let y = 0; y < view.mapHeight; y++) {
            for (let x = 0; x < view.mapWidth; x++) {
                this.drawTile(x, y);
            }
        }
        ctx.strokeStyle = 'rgba(100, 100, 180, 0.3)';
        ctx.lineWidth = 2;
        ctx.strokeRect(0, 0, boardPixelW, boardPixelH);
        this.drawBoardLabels(view.mapWidth, view.mapHeight);

        // Valid move highlights
        const enemySet = new Set(view.visibleEnemies.map(e => `${e.pos.x},${e.pos.y}`));
        for (const pos of validMoves) {
            const isCapture = enemySet.has(`${pos.x},${pos.y}`);
            this.drawMoveHighlight(pos.x, pos.y, isCapture);
        }

        // Hovered tile
        if (hoveredTile) {
            this.drawHoverHighlight(hoveredTile.x, hoveredTile.y);
        }

        // Draw enemies with animation
        for (const enemy of view.visibleEnemies) {
            const animPos = this.getAnimatedPos(enemy.id, enemy.pos.x, enemy.pos.y);
            this.drawPiece(animPos.x, animPos.y, enemy.type, 'black');
        }

        // Draw other players
        for (const player of view.visiblePlayers) {
            const animPos = this.getAnimatedPos(player.id, player.pos.x, player.pos.y);
            this.drawPiece(animPos.x, animPos.y, player.type, 'white');
        }

        // My piece with effects
        const me = view.myPiece;
        const myAnimPos = this.getAnimatedPos(me.id, me.pos.x, me.pos.y);

        if (view.canAct) {
            const pulse = 0.7 + Math.sin(this.animTime / 400) * 0.3;
            const cx = myAnimPos.x * this.tileSize + this.tileSize / 2;
            const cy = myAnimPos.y * this.tileSize + this.tileSize / 2;

            ctx.fillStyle = `rgba(80, 220, 80, ${0.08 * pulse})`;
            ctx.beginPath();
            ctx.arc(cx, cy, this.tileSize * 0.7, 0, Math.PI * 2);
            ctx.fill();

            ctx.strokeStyle = `rgba(80, 220, 80, ${0.4 * pulse})`;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(cx, cy, this.tileSize * 0.45 + Math.sin(this.animTime / 600) * 3, 0, Math.PI * 2);
            ctx.stroke();
        }

        if (me.hasExtraLife) {
            const pulse = 0.6 + Math.sin(this.animTime / 500) * 0.4;
            const cx = myAnimPos.x * this.tileSize + this.tileSize / 2;
            const cy = myAnimPos.y * this.tileSize + this.tileSize / 2;
            ctx.strokeStyle = `rgba(255, 100, 100, ${0.5 * pulse})`;
            ctx.lineWidth = 2;
            ctx.setLineDash([4, 4]);
            ctx.beginPath();
            ctx.arc(cx, cy, this.tileSize * 0.5, 0, Math.PI * 2);
            ctx.stroke();
            ctx.setLineDash([]);
        }

        this.drawPiece(myAnimPos.x, myAnimPos.y, me.type, 'white', true);

        if (me.upgrades.length > 0) {
            this.drawUpgradeMarkers(myAnimPos.x, myAnimPos.y, me.upgrades);
        }

        // Particles
        this.updateAndDrawParticles();

        ctx.restore();
    }

    // ── Board Drawing ─────────────────────────────────

    private drawBoardShadow(bw: number, bh: number): void {
        const { ctx } = this;
        ctx.shadowColor = 'rgba(80, 80, 180, 0.15)';
        ctx.shadowBlur = 40;
        ctx.fillStyle = COLORS.boardEdge;
        ctx.fillRect(-8, -8, bw + 16, bh + 16);
        ctx.shadowBlur = 0;
    }

    private drawTile(x: number, y: number): void {
        const { ctx } = this;
        const px = x * this.tileSize;
        const py = y * this.tileSize;
        const isLight = (x + y) % 2 === 0;

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
        for (let x = 0; x < mapW; x++) {
            ctx.fillText(String.fromCharCode(97 + x), x * this.tileSize + this.tileSize / 2, mapH * this.tileSize + 12);
        }
        ctx.textAlign = 'right';
        for (let y = 0; y < mapH; y++) {
            ctx.fillText(`${mapH - y}`, -6, y * this.tileSize + this.tileSize / 2);
        }
    }

    // ── Piece Drawing (supports fractional tile coords) ─

    private drawPiece(
        tileX: number, tileY: number,
        type: PieceType, color: 'white' | 'black',
        isMe: boolean = false,
    ): void {
        const { ctx } = this;
        const px = tileX * this.tileSize + this.tileSize / 2;
        const py = tileY * this.tileSize + this.tileSize / 2;

        const symbols = color === 'white' ? WHITE_SYMBOLS : BLACK_SYMBOLS;
        const pieceColor = color === 'white' ? COLORS.whitePiece : COLORS.blackPiece;
        const glowColor = color === 'white' ? COLORS.whitePieceGlow : COLORS.blackPieceGlow;

        const breathe = color === 'black'
            ? 1 + Math.sin(this.animTime / 800 + tileX * 0.7 + tileY * 1.3) * 0.04
            : 1;
        const fontSize = this.tileSize * 0.65 * breathe;

        ctx.shadowColor = glowColor;
        ctx.shadowBlur = isMe ? 16 : 8;

        ctx.fillStyle = pieceColor;
        ctx.font = `${fontSize}px serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(symbols[type] ?? '?', px, py);

        ctx.shadowBlur = 0;

        if (isMe) {
            ctx.strokeStyle = 'rgba(200, 200, 255, 0.6)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(px, py, this.tileSize * 0.4, 0, Math.PI * 2);
            ctx.stroke();
        }
    }

    // ── Upgrade Markers ───────────────────────────────

    private drawUpgradeMarkers(tileX: number, tileY: number, upgrades: Upgrade[]): void {
        const { ctx } = this;
        const cx = tileX * this.tileSize + this.tileSize / 2;
        const cy = tileY * this.tileSize + this.tileSize / 2;
        const radius = this.tileSize * 0.48;

        for (let i = 0; i < upgrades.length; i++) {
            const angle = (i / Math.max(upgrades.length, 4)) * Math.PI * 2 - Math.PI / 2;
            const mx = cx + Math.cos(angle) * radius;
            const my = cy + Math.sin(angle) * radius;

            const info = UPGRADE_INFO[upgrades[i]];
            if (!info) continue;

            ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
            ctx.beginPath();
            ctx.arc(mx, my, 7, 0, Math.PI * 2);
            ctx.fill();

            ctx.strokeStyle = 'rgba(255, 215, 0, 0.4)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.arc(mx, my, 7, 0, Math.PI * 2);
            ctx.stroke();

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
            ctx.fillStyle = COLORS.validMoveCapture;
            ctx.fillRect(px + 1, py + 1, this.tileSize - 2, this.tileSize - 2);
            ctx.strokeStyle = 'rgba(255, 80, 80, 0.6)';
            ctx.lineWidth = 2;
            const s = this.tileSize * 0.3;
            ctx.beginPath();
            ctx.moveTo(px + 2, py + s); ctx.lineTo(px + 2, py + 2); ctx.lineTo(px + s, py + 2);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(px + this.tileSize - s, py + 2); ctx.lineTo(px + this.tileSize - 2, py + 2); ctx.lineTo(px + this.tileSize - 2, py + s);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(px + 2, py + this.tileSize - s); ctx.lineTo(px + 2, py + this.tileSize - 2); ctx.lineTo(px + s, py + this.tileSize - 2);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(px + this.tileSize - s, py + this.tileSize - 2); ctx.lineTo(px + this.tileSize - 2, py + this.tileSize - 2); ctx.lineTo(px + this.tileSize - 2, py + this.tileSize - s);
            ctx.stroke();
        } else {
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
                life: 1, maxLife: 0.6 + Math.random() * 0.4,
                color: colors[Math.floor(Math.random() * colors.length)],
                size: 2 + Math.random() * 3,
            });
        }
    }

    private updateAndDrawParticles(): void {
        const { ctx } = this;
        const dt = 0.032;
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.x += p.vx; p.y += p.vy;
            p.vy += 0.05;
            p.life -= dt / p.maxLife;
            if (p.life <= 0) { this.particles.splice(i, 1); continue; }
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
