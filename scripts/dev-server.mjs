/**
 * Small development server for the web build.
 *
 * Serves the development build on 0.0.0.0 so it can be opened from a phone or
 * from a hosted preview, and rebuilds automatically whenever a file inside
 * `src/` changes. The build lands in `.dev-www/`, never in the committed
 * production bundle in `www/`.
 */

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { watch } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const root = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
// Development builds live outside www/ so the committed production bundle and
// the working tree stay untouched while the server rebuilds on every change.
const webDir = path.join(root, '.dev-www');
const watchDir = path.join(root, 'src');
const port = Number(process.env.PORT || 5173);
const host = process.env.HOST || '0.0.0.0';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.map': 'application/json; charset=utf-8',
};

function rebuild(reason) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(root, 'scripts', 'build-web.mjs'), '--dev'], {
      stdio: 'inherit',
      env: { ...process.env, OUT_DIR: '.dev-www' },
    });
    child.on('exit', (code) => {
      if (code === 0) console.log(`[dev] rebuilt (${reason})`);
      resolve();
    });
  });
}

async function serveFile(request, response) {
  const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
  const requested = decodeURIComponent(url.pathname);
  const relative = requested === '/' ? 'index.html' : requested.replace(/^\/+/, '');
  const filePath = path.join(webDir, relative);

  if (!filePath.startsWith(webDir)) {
    response.writeHead(403).end('forbidden');
    return;
  }

  try {
    const info = await stat(filePath);
    if (info.isDirectory()) throw new Error('directory');
    const body = await readFile(filePath);
    response.writeHead(200, {
      'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream',
      'Content-Length': body.length,
      'Cache-Control': 'no-store',
    });
    response.end(body);
  } catch {
    try {
      const fallback = await readFile(path.join(webDir, 'index.html'));
      response.writeHead(200, {
        'Content-Type': MIME['.html'],
        'Cache-Control': 'no-store',
      });
      response.end(fallback);
    } catch {
      response.writeHead(404).end('not found');
    }
  }
}

const server = createServer((request, response) => {
  serveFile(request, response).catch(() => response.writeHead(500).end('server error'));
});

await rebuild('initial');

server.listen(port, host, () => {
  console.log(`[dev] Calcivo web build on http://${host}:${port}`);
});

let timer = null;
watch(watchDir, { recursive: true }, () => {
  clearTimeout(timer);
  timer = setTimeout(() => rebuild('source change'), 150);
});

process.on('SIGTERM', () => server.close(() => process.exit(0)));
process.on('SIGINT', () => server.close(() => process.exit(0)));
