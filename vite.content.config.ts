import { defineConfig } from 'vite';
import { resolve } from 'path';

// Content scripts in MV3 are classic scripts (no import) — bundle as IIFE.
export default defineConfig({
  build: {
    emptyOutDir: true,
    lib: {
      entry: resolve(__dirname, 'src/content/index.ts'),
      formats: ['iife'],
      name: 'PIIFirewall',
      fileName: () => 'content.js'
    }
  }
});
