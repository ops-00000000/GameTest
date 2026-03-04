import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
    resolve: {
        alias: {
            '@chess-roguelike/shared': path.resolve(__dirname, '../packages/shared/src'),
        },
    },
    server: {
        port: 3000,
        open: true,
    },
});
