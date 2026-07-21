import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
export default defineConfig({
    plugins: [vue()],
    resolve: {
        alias: {
            '@plainlist/shared': fileURLToPath(new URL('../../packages/shared/index.ts', import.meta.url)),
            '@': fileURLToPath(new URL('./src', import.meta.url)),
        },
    },
    server: {
        port: 5173,
        proxy: {
            '/api': {
                target: 'http://localhost:3000',
                timeout: 300000,
                proxyTimeout: 300000,
            },
            // Proxy widget iframes to their local sidecar processes. See
            // vite.config.ts for the full rationale.
            // /widget/fishtime/api must come BEFORE /widget/fishtime.
            '/widget/fishtime/api': {
                target: 'http://localhost:8000',
                changeOrigin: true,
                rewrite: (p) => p.replace(/^\/widget\/fishtime/, ''),
            },
            '/widget/fishtime': {
                target: 'http://localhost:5174',
                changeOrigin: true,
                rewrite: (p) => p.replace(/^\/widget\/fishtime/, ''),
            },
        },
    },
});
