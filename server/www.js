// NoteThread — servidor UNICO (frontend + sync WebSocket na MESMA porta).
// ideal para um só deploy com HTTPS (Render/Railway/...): o navegador e o
// websocket ficam na mesma origem, sem mixed-content.
const http = require('http');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { installSync } = require('./sync');

const PUBLIC = path.join(__dirname, '..', 'public');
const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.webmanifest': 'application/manifest+json', '.ico': 'image/x-icon',
};

// Security + cache headers
function setSecurityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '0');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  // CSP leve: permite self + fonts/google + esm.sh/cuelume + supabase
  res.setHeader('Content-Security-Policy', [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' https://esm.sh",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: blob:",
    "connect-src 'self' ws: wss: https://esm.sh https://*.supabase.co wss://*.supabase.co",
    "manifest-src 'self'",
  ].join('; '));
}

function cacheHeader(ext) {
  if (ext === '.html' || ext === '.webmanifest') return 'no-cache';
  if (ext === '.js' || ext === '.css') return 'public, max-age=3600';
  if (ext === '.png' || ext === '.svg' || ext === '.ico') return 'public, max-age=86400';
  return 'public, max-age=600';
}

const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    setSecurityHeaders(res);
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ ok: true, ts: Date.now() }));
    return;
  }
  const url = req.url === '/' ? '/index.html' : req.url.split('?')[0];
  const file = path.join(PUBLIC, url);
  if (!file.startsWith(PUBLIC)) { setSecurityHeaders(res); res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { setSecurityHeaders(res); res.writeHead(404); return res.end('Not found'); }
    const ext = path.extname(file);
    setSecurityHeaders(res);
    const headers = {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': cacheHeader(ext),
    };
    // gzip para js/css/svg (W2.6 perf)
    const accept = req.headers['accept-encoding'] || '';
    const shouldGzip = accept.includes('gzip') && ['.js','.css','.svg','.webmanifest','.json'].includes(ext) && data.length > 1024;
    if (shouldGzip) {
      headers['Content-Encoding'] = 'gzip';
      headers['Vary'] = 'Accept-Encoding';
      res.writeHead(200, headers);
      res.end(zlib.gzipSync(data));
    } else {
      res.writeHead(200, headers);
      res.end(data);
    }
  });
});

installSync(server); // WebSocket na MESMA porta do frontend

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`NoteThread (frontend + sync) em :${PORT}`));
