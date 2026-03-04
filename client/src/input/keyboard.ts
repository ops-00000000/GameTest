// ═══════════════════════════════════════════════════
// Chess Roguelike — Keyboard Input Handler
// ═══════════════════════════════════════════════════

export type InputAction =
    | { action: 'move'; dx: number; dy: number }
    | { action: 'pickup' }
    | { action: 'skip' }
    | { action: 'descend' }
    | { action: 'inventory' }
    | { action: 'chat_focus' };

export type InputCallback = (action: InputAction) => void;

export class KeyboardInput {
    private callback: InputCallback;
    private chatFocused: boolean = false;

    constructor(callback: InputCallback) {
        this.callback = callback;
        document.addEventListener('keydown', (e) => this.handleKeyDown(e));
    }

    setChatFocused(focused: boolean): void {
        this.chatFocused = focused;
    }

    private handleKeyDown(e: KeyboardEvent): void {
        // Don't intercept when typing in inputs
        const target = e.target as HTMLElement;
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
            if (e.key === 'Enter' && target.id === 'chat-input') {
                this.callback({ action: 'chat_focus' });
            }
            return;
        }

        switch (e.key) {
            // Movement — WASD
            case 'w': case 'W': case 'ArrowUp':
                e.preventDefault();
                this.callback({ action: 'move', dx: 0, dy: -1 });
                break;
            case 's': case 'S': case 'ArrowDown':
                e.preventDefault();
                this.callback({ action: 'move', dx: 0, dy: 1 });
                break;
            case 'a': case 'A': case 'ArrowLeft':
                e.preventDefault();
                this.callback({ action: 'move', dx: -1, dy: 0 });
                break;
            case 'd': case 'D': case 'ArrowRight':
                e.preventDefault();
                this.callback({ action: 'move', dx: 1, dy: 0 });
                break;

            // Diagonals (numpad style: QEZC)
            case 'q': case 'Q':
                this.callback({ action: 'move', dx: -1, dy: -1 });
                break;
            case 'e': case 'E':
                // E is both diagonal and pickup — check context
                this.callback({ action: 'pickup' });
                break;
            case 'z': case 'Z':
                this.callback({ action: 'move', dx: -1, dy: 1 });
                break;
            case 'c': case 'C':
                this.callback({ action: 'move', dx: 1, dy: 1 });
                break;

            // Actions
            case ' ':
                e.preventDefault();
                this.callback({ action: 'skip' });
                break;
            case 'f': case 'F':
                this.callback({ action: 'descend' });
                break;
            case 'i': case 'I':
                this.callback({ action: 'inventory' });
                break;
            case 'Enter':
                this.callback({ action: 'chat_focus' });
                break;
        }
    }
}
