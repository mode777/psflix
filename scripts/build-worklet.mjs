#!/usr/bin/env node
// Bundles the PSxAnywhere audio worklet into a standalone ES module that
// AudioWorklet.addModule() can load in production (Vite does not transform a
// raw string passed to addModule, so we pre-bundle it with esbuild and ship it
// as a static asset under public/).
//
// Inlines the worklet's ./sab/layout dependency and transpiles away the TS so
// the output is a single self-contained .js file. Run `npm run build:worklet`
// whenever src/vendor/psxanywhere/emulator/audio-worklet.ts changes.

import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

const entry = resolve(root, 'src/vendor/psxanywhere/emulator/audio-worklet.ts');
const outfile = resolve(root, 'public/audio-worklet.js');

await build({
  entryPoints: [entry],
  bundle: true,
  format: 'esm',
  target: 'es2022',
  platform: 'browser',
  outfile,
  minify: false,
  sourcemap: false,
  legalComments: 'none',
  banner: {
    js: '/* Generated from src/vendor/psxanywhere/emulator/audio-worklet.ts — run: npm run build:worklet. Do not edit by hand. */',
  },
  logLevel: 'info',
});

console.log(`[build:worklet] wrote ${outfile}`);
