import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
const root = resolve(process.argv[2]);
const probe = process.argv[3];
if (probe === 'server-start-fail') throw new Error('Controlled server startup failure');
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json' };
const server = http.createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname);
    const file = resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
    if (!file.startsWith(root + sep) || pathname.split('/').some(s => s.startsWith('.')) || !['GET', 'HEAD'].includes(req.method)) {
      res.writeHead(403).end(); return;
    }
    if (!(await stat(file)).isFile()) { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(req.method === 'HEAD' ? undefined : await readFile(file));
  } catch { res.writeHead(404).end(); }
});
server.listen(0, '127.0.0.1', () => {
  if (probe !== 'startup-never-ready') process.send?.({ type: 'ready', url: `http://127.0.0.1:${server.address().port}`, pid: process.pid });
  else process.send?.({ type: 'held-not-ready', port: server.address().port, pid: process.pid });
});
process.on('SIGTERM', () => { server.closeAllConnections(); server.close(() => process.exit(0)); });
