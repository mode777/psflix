#!/usr/bin/env node

import { spawnSync } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const isWindows = process.platform === 'win32';
const ext = isWindows ? '.exe' : '';
const pocketbasePath = join(__dirname, '..', 'bin', `pocketbase${ext}`);

const result = spawnSync(pocketbasePath, ['serve', '--publicDir', './dist', '--dir', './pb_data', '--hooksDir', './pb_hooks'], {
  stdio: 'inherit',
  cwd: join(__dirname, '..')
});

process.exit(result.status ?? 1);
