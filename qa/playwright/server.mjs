// The static server the Playwright suite runs against (QA gate 3).
//
// Dependency-free on purpose. `npx http-server` was tried first and answered
// ERR_CONNECTION_REFUSED under four parallel browser workers (the island chunks were the
// requests that got dropped), which showed up as "the island never mounted" flakes. This is
// plain `node:http` over the repo root: one process, no cache headers, no directory listing.
//
//   node qa/playwright/server.mjs [port]        # default 8123
//
// Started automatically by playwright.config.ts (`webServer`). `npx http-server -p 8123 -c-1 .`
// still works for poking at the app by hand — see qa/README.md.
import { createServer } from 'node:http';
import { createReadStream, statSync } from 'node:fs';
import { createGzip } from 'node:zlib';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(import.meta.url), '..', '..', '..');
const PORT = Number(process.argv[2] || process.env.QA_PORT || 8123);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8',
};

const server = createServer((req, res) => {
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); }
  catch { res.writeHead(400).end('bad request'); return; }
  if (pathname === '/') pathname = '/index.html';

  // Path traversal: normalize, then require the result to still be inside ROOT.
  const file = join(ROOT, normalize(pathname).replace(/^([/\\])+/, ''));
  if (file !== ROOT && !file.startsWith(ROOT + sep)) { res.writeHead(403).end('forbidden'); return; }

  let st;
  try { st = statSync(file); } catch { res.writeHead(404).end('not found'); return; }
  if (st.isDirectory()) { res.writeHead(404).end('no directory listing'); return; }

  const type = TYPES[extname(file).toLowerCase()] || 'application/octet-stream';
  // GZIP for text assets. Not a nicety: GitHub Pages (the real host) compresses, and an
  // uncompressed js/app.js turns "Enable text compression" into a ~7 s Lighthouse opportunity
  // that says nothing about the app. Measuring without it would be measuring this file.
  const compressible = /^(text\/|application\/(javascript|json|manifest\+json)|image\/svg)/.test(type);
  const wantsGzip = /gzip/.test(req.headers['accept-encoding'] || '');
  const headers = { 'Content-Type': type, 'Cache-Control': 'no-store, max-age=0' };

  const stream = createReadStream(file);
  stream.on('error', () => res.destroy());
  if (compressible && wantsGzip && st.size > 512) {
    res.writeHead(200, { ...headers, 'Content-Encoding': 'gzip', Vary: 'Accept-Encoding' });
    const gz = createGzip({ level: 6 });
    gz.on('error', () => res.destroy());
    stream.pipe(gz).pipe(res);
  } else {
    res.writeHead(200, { ...headers, 'Content-Length': st.size });
    stream.pipe(res);
  }
});

// A browser closing a keep-alive socket mid-response must not take the server down — that is
// exactly the class of failure this file replaced.
server.on('clientError', socket => { try { socket.destroy(); } catch { /* already gone */ } });
server.keepAliveTimeout = 30_000;
server.listen(PORT, '127.0.0.1', () => {
  process.stdout.write(`qa static server: http://127.0.0.1:${PORT}/  (root ${ROOT})\n`);
});
