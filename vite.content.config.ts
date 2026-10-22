import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

/** Content script: a single self-contained IIFE at dist/content.js (no imports, no chunks). */
export default defineConfig(({ mode }) => ({
  publicDir: false,
  define: { 'process.env.NODE_ENV': JSON.stringify(mode === 'development' ? 'development' : 'production') },
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    target: 'chrome116',
    sourcemap: false,
    minify: mode !== 'development',
    lib: {
      entry: fileURLToPath(new URL('./src/content/index.ts', import.meta.url)),
      name: 'CodeGuardContent',
      formats: ['iife'],
      fileName: () => 'content.js',
    },
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
}));
