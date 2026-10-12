import path from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// The app is published from https://github.com/Kba05/KeysFromJSON via GitHub
// Pages, which serves the repository from a sub-path, so production builds need
// a matching `base`. The dev server keeps `/` so localhost URLs stay simple.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/KeysFromJSON/' : '/',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  build: {
    target: 'es2022',
    outDir: 'dist',
    sourcemap: true,
    assetsInlineLimit: 4096,
  },
  server: {
    port: 5173,
    open: false,
  },
}));

// Vitest has its own matching config. Keeping the production config focused
// makes the GitHub Pages base path explicit and prevents test-only settings from
// leaking into the shipped bundle.
