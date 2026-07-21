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
  define: {
    __API_BASE_URL__: JSON.stringify(process.env.VITE_API_BASE_URL || ''),
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        timeout: 300_000,
        proxyTimeout: 300_000,
      },
      // Proxy widget iframes to their local sidecar processes. The browser
      // always loads widgets from the main app's origin (`/widget/<id>/`)
      // because the widget HTML references assets with the `base` prefix
      // (e.g. `/widget/fishtime/assets/index-xxx.js`). We rewrite the
      // request path before forwarding so the upstream Vite/Python server
      // receives `/...` and serves its own files.
      // IMPORTANT: /widget/fishtime/api must come BEFORE /widget/fishtime
      // so API calls are routed to the backend (:8000), not the preview
      // server (:5174).
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
