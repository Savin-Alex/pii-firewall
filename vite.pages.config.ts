import { defineConfig } from 'vite';
import { resolve } from 'path';

// Extension pages (popup, options) load as <script type="module"> — ES output is fine.
// emptyOutDir:false so this pass keeps content.js/background.js from earlier passes.
export default defineConfig({
  build: {
    emptyOutDir: false,
    lib: {
      entry: {
        popup: resolve(__dirname, 'src/popup/popup.ts'),
        options: resolve(__dirname, 'src/options/options.ts')
      },
      formats: ['es']
    },
    rollupOptions: {
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name]-[hash].js'
      }
    }
  }
});
