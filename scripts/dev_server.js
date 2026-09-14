// scripts/dev_server.js — Zero-dependency Node.js HTTP Server bound to 0.0.0.0:3000
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3333;
const PUBLIC_DIR = path.resolve(__dirname, '..');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

const server = http.createServer((req, res) => {
  let reqPath = req.url.split('?')[0].split('#')[0];
  if (reqPath === '/') reqPath = '/app.html';

  const filePath = path.join(PUBLIC_DIR, reqPath);

  // Security check
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      // Fallback to app.html for SPA routes
      const fallbackPath = path.join(PUBLIC_DIR, 'app.html');
      fs.readFile(fallbackPath, (fErr, content) => {
        if (fErr) {
          res.writeHead(404);
          return res.end('Not Found');
        }
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(content);
      });
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    fs.readFile(filePath, (rErr, content) => {
      if (rErr) {
        res.writeHead(500);
        return res.end('Internal Error');
      }
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
    });
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Dev Server rodando em http://localhost:${PORT}/ e http://127.0.0.1:${PORT}/`);
});
