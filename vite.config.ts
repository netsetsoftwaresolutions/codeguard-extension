import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

/**
 * Extension pages (popup, side panel) and the background service worker.
 * The content script is built separately (vite.content.config.ts) as an IIFE because
 * MV3 content scripts cannot be ES modules.
 */
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  base: './',
  publicDir: 'public',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'chrome116',
    sourcemap: mode === 'development',
    minify: mode !== 'development',
    // The polyfill would be injected as an inline script; extension CSP forbids that.
    modulePreload: { polyfill: false },
    rollupOptions: {
      input: {
        popup: r('./popup.html'),
        upload: r('./upload.html'),
        sidepanel: r('./sidepanel.html'),
        background: r('./src/background/index.ts'),
      },
      output: {
        entryFileNames: (chunk) => (chunk.name === 'background' ? 'background.js' : 'assets/[name]-[hash].js'),
        chunkFileNames: 'assets/[name]-[hash].js',
        // Code shared by the service worker and the pages must stay DOM-free; keep it in its own chunk.
        manualChunks: (id) => {
          if (/[\\/](react|react-dom|scheduler|lucide-react)[\\/]/.test(id)) return 'vendor-react';
          if (id.includes('/src/contracts/') || /[\\/]zod[\\/]/.test(id) || /[\\/]src[\\/]shared[\\/]/.test(id)) return 'shared';
          return undefined;
        },
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.{ts,tsx}'],
    setupFiles: ['tests/setup.ts'],
  },
}));
