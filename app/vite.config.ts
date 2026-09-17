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
  },
} as any);
