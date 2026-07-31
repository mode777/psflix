#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { existsSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const dist = resolve(root, 'dist');
const port = 5174;
const baseUrl = `http://localhost:${port}`;

const log = (msg) => console.log(`[verify:build] ${msg}`);
const fail = (msg) => {
  console.error(`[verify:build] FAIL: ${msg}`);
  process.exitCode = 1;
};

const run = (cmd, args, opts = {}) =>
  new Promise((resolveRun, rejectRun) => {
    const child = spawn(cmd, args, { stdio: 'inherit', cwd: root, ...opts });
    child.on('error', rejectRun);
    child.on('exit', (code) => {
      if (code === 0) resolveRun();
      else rejectRun(new Error(`${cmd} ${args.join(' ')} exited ${code}`));
    });
  });

const startServe = () => {
  const child = spawn('npx', ['--yes', 'serve', dist, '-p', String(port), '--no-clipboard'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    cwd: root,
  });

  child.stdout.on('data', (chunk) => process.stdout.write(`[serve] ${chunk}`));
  child.stderr.on('data', (chunk) => process.stderr.write(`[serve] ${chunk}`));

  return child;
};

const waitForServer = async (url, attempts = 40) => {
  for (let i = 0; i < attempts; i += 1) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // not up yet
    }
    await sleep(250);
  }
  throw new Error(`server at ${url} did not become ready`);
};

const assert = (cond, msg) => {
  if (!cond) fail(msg);
  else log(`ok — ${msg}`);
};

const checkResponse = async (label, url) => {
  log(`GET ${url}`);
  const res = await fetch(url);
  assert(res.status === 200, `${label} (${url}) → 200`);
  const body = await res.text();
  assert(body.includes('<div id="root"></div>'), `${label} serves index.html`);
  assert(body.includes('base href="./"'), `${label} preserves <base href="./">`);
  assert(!body.includes('https://'), `${label} contains no absolute origins`);
  return res;
};

const main = async () => {
  log('running npm run build…');
  await run('npm', ['run', 'build']);

  if (!existsSync(dist)) {
    fail(`expected ${dist} to exist after build`);
    return;
  }

  const server = startServe();
  const cleanup = () => {
    if (!server.killed) server.kill('SIGTERM');
  };
  process.on('exit', cleanup);
  process.on('SIGINT', () => {
    cleanup();
    process.exit(130);
  });

  try {
    await waitForServer(baseUrl);
    await checkResponse('browse', `${baseUrl}/`);
    await checkResponse('details hash route', `${baseUrl}/#/game/SCUS-94121`);
  } finally {
    cleanup();
    await sleep(200);
  }

  if (process.exitCode === 1) {
    log('verification FAILED');
  } else {
    log('verification PASSED');
  }
};

main().catch((err) => {
  fail(err.stack || err.message);
});
