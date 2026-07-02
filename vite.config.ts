import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'src/engine/engine.ts'),
      formats: ['es'],
      fileName: 'engine'
    }
  },
  test: {
    globals: true,
    environment: 'node'
  }
});
