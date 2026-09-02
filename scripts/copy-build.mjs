import { copyFileSync, mkdirSync } from 'node:fs';
mkdirSync('dist', { recursive: true });
copyFileSync('styles.css', 'dist/styles.css');
copyFileSync('manifest.json', 'dist/manifest.json');
