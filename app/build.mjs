// Bundles the Electron main process and the game UI into dist/.
import { build } from 'esbuild';
import { cpSync, mkdirSync } from 'node:fs';

mkdirSync('dist', { recursive: true });
await build({
  entryPoints: ['src/main/main.ts'],
  outfile: 'dist/main.js',
  bundle: true,
  platform: 'node',
  format: 'cjs',
  external: ['electron'],
  target: 'node20',
});
await build({
  entryPoints: ['src/renderer/index.tsx'],
  outfile: 'dist/renderer.js',
  bundle: true,
  platform: 'browser',
  format: 'iife',
  target: 'chrome120',
  jsx: 'automatic',
  define: { 'process.env.NODE_ENV': '"production"' },
  minify: true,
  sourcemap: false,
});
cpSync('src/renderer/index.html', 'dist/index.html');
cpSync('src/renderer/styles.css', 'dist/styles.css');
cpSync('assets', 'dist/assets', { recursive: true });
console.log('Built dist/');
