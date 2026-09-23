import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

// The React islands are shipped as ONE js + ONE css file that index.html loads directly
// (GitHub Pages is static; same convention as the legacy js/app.js). build.mjs copies
// dist/sigma.js|css into ui/ and stamps ?v= on them.
export default defineConfig({
  base: './',
  plugins: [react()],
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    cssCodeSplit: false,
    // No modulepreload links / polyfill (task 22b). Vite preloads the WHOLE dynamic-import
    // graph from the entry, so a boot on a phone downloaded every lazy chunk — 📈 שימוש alone
    // is 400 kB — before the card home had painted: "reduce unused JavaScript ≈ 1.4 s" on the
    // Lighthouse gate, and on a throttled connection that bandwidth IS the LCP. The chunks are
    // code-split on purpose; they now arrive when their island is actually opened. The entry's
    // own static imports are still discovered natively by the module loader.
    modulePreload: false,
    rollupOptions: {
      // no index.html entry — the islands are injected into the legacy page, so the entry is the module itself
      input: path.resolve(__dirname, 'src/main.tsx'),
      output: {
        entryFileNames: 'sigma.js',
        chunkFileNames: 'sigma-[name].js',
        assetFileNames: 'sigma.[ext]',
      },
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    // 15 s: with a dozen parallel build agents on this machine, render tests hit the 5 s default (round 5).
    testTimeout: 15000,
  },
} as any);
