// Copies static extension assets into dist/ after the vite passes.
import { copyFileSync, mkdirSync } from 'fs';

mkdirSync('dist', { recursive: true });
copyFileSync('manifest.json', 'dist/manifest.json');
console.log('copied: manifest.json -> dist/');
