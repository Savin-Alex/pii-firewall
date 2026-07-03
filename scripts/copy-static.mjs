// Copies static extension assets into dist/ after the vite passes.
import { copyFileSync, mkdirSync, cpSync } from 'fs';

mkdirSync('dist', { recursive: true });

// Manifest + HTML entry pages
copyFileSync('manifest.json', 'dist/manifest.json');
copyFileSync('src/popup/popup.html', 'dist/popup.html');
copyFileSync('src/options/options.html', 'dist/options.html');

// Directories: localisation, onboarding page + its script, icons
cpSync('_locales', 'dist/_locales', { recursive: true });
cpSync('onboarding', 'dist/onboarding', { recursive: true });
cpSync('icons', 'dist/icons', { recursive: true });

console.log('copied: manifest, popup.html, options.html, _locales/, onboarding/, icons/ -> dist/');
