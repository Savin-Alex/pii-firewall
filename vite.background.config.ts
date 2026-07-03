import { defineConfig } from 'vite';
import { resolve } from 'path';

// MV3 service worker is declared with "type": "module" — ES output is fine.
export default defineConfig({
  build: {
    emptyOutDir: false,
    lib: {
      entry: resolve(__dirname, 'src/background/index.ts'),
      formats: ['es'],
      fileName: () => 'background.js'
    }
  }
});
