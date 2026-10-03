import { defineConfig } from 'vite';

// The app is published from https://github.com/Kba05/KeysFromJSON via GitHub
// Pages, which serves the repository from a sub-path, so production builds need
// a matching `base`. The dev server keeps `/` so localhost URLs stay simple.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/KeysFromJSON/' : '/',
  build: {
    target: 'es2022',
    outDir: 'dist',
    sourcemap: true,
    // Everything is client-side; a single chunk keeps the offline service
    // worker cache list short and predictable.
    assetsInlineLimit: 4096,
  },
  server: {
    port: 5173,
    open: false,
  },
}));

// Tests deliberately avoid Vite and Vitest. The core and the formatters are
// plain ES modules with no transform step, so `node --test` runs them directly:
// fewer dependencies, no bundler in the loop, and the suite still runs in CI
// with nothing but a Node install.
