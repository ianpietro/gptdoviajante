// dev-server.js — Local Node.js Development Server supporting both static files & /api serverless routes
const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = 7832;
const HOST = '127.0.0.1';

// Carrega segredos somente no processo local do servidor. Eles nunca são
// enviados ao navegador e os arquivos ocultos continuam bloqueados abaixo.
function loadLocalEnvironment() {
  const candidates = ['.env', '.env.development.local', '.env.local'];
  candidates.forEach((filename) => {
    const envPath = path.join(__dirname, filename);
    if (!fs.existsSync(envPath)) return;
    const content = fs.readFileSync(envPath, 'utf8');
    content.split(/\r?\n/).forEach((line) => {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!match || Object.prototype.hasOwnProperty.call(process.env, match[1])) return;
      let value = match[2].trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      process.env[match[1]] = value;
    });
  });
}

loadLocalEnvironment();
process.env.NODE_ENV = process.env.NODE_ENV || 'development';
// Enquanto o provedor Gemini estiver sem créditos, a prévia pode usar a
// chave OpenAI já configurada sem esperar uma tentativa que sabemos falhar.
if (!process.env.AI_PRIMARY_PROVIDER && process.env.OPENAI_API_KEY) {
  process.env.AI_PRIMARY_PROVIDER = 'openai';
}

// Set default fallback environment variables for local dev mode
process.env.SUPABASE_URL = process.env.SUPABASE_URL || "http://127.0.0.1:7832";
process.env.SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "sb_publishable_Mm7c0n4BbiFgmzgq2j-W3A_zf8jQc8v";

const mimeTypes = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = decodeURIComponent(parsedUrl.pathname);

  // Local preview safety: never expose hidden files, environment files or paths
  // outside this project, even when a crafted URL is requested.
  const pathSegments = pathname.split('/').filter(Boolean);
  if (pathSegments.some(segment => segment.startsWith('.')) || pathSegments.includes('node_modules')) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('404 Not Found');
    return;
  }

  // Mock Supabase Auth endpoint for local development
  if (pathname === '/auth/v1/user') {
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({
      id: 'local_dev_user_123',
      email: 'teste@viajante.com',
      role: 'authenticated'
    }));
    return;
  }

  // Route rewrites for SEO routes /roteiros/*, /roteiro/* and /inspiracoes/*
  let targetPathname = pathname;
  if (pathname.startsWith('/roteiros') || pathname.startsWith('/roteiro')) {
    const parts = pathname.split('/').filter(Boolean);
    const dest = parts[1] || 'buenos-aires';
    const daysPart = parts[2] ? parts[2].replace('-dias', '') : null;
    parsedUrl.query.destination = dest;
    if (daysPart) parsedUrl.query.days = daysPart;
    targetPathname = '/api/roteiro-seo';
  } else if (pathname.startsWith('/inspiracoes')) {
    const parts = pathname.split('/').filter(Boolean);
    const slug = parts[1] || '';
    if (slug) parsedUrl.query.slug = slug;
    targetPathname = '/api/inspiracoes';
  }

  // Route API calls to /api/*.js
  if (targetPathname.startsWith('/api/')) {
    const apiName = targetPathname.replace('/api/', '').split('?')[0];
    const apiPath = path.join(__dirname, 'api', `${apiName}.js`);

    if (fs.existsSync(apiPath)) {
      try {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', async () => {
          if (body) {
            try { req.body = JSON.parse(body); } catch (e) { req.body = body; }
          } else {
            req.body = {};
          }
          req.query = parsedUrl.query;
          // Marca criada exclusivamente pelo servidor local. O cliente não
          // consegue forjá-la por header ou corpo de requisição.
          req.localDev = true;

          // Polyfill Vercel Serverless Response helpers
          res.status = function(code) {
            res.statusCode = code;
            return res;
          };
          res.send = function(data) {
            if (!res.getHeader('Content-Type')) {
              res.setHeader('Content-Type', typeof data === 'object' ? 'application/json' : 'text/html; charset=utf-8');
            }
            res.end(typeof data === 'object' ? JSON.stringify(data) : data);
            return res;
          };
          res.json = function(data) {
            if (!res.getHeader('Content-Type')) {
              res.setHeader('Content-Type', 'application/json; charset=utf-8');
            }
            res.end(JSON.stringify(data));
            return res;
          };

          // Clear require cache for hot reloading in local dev
          try {
            delete require.cache[require.resolve(apiPath)];
            const handler = require(apiPath);
            await handler(req, res);
          } catch (err) {
            console.error(`API Error on ${pathname}:`, err);
            if (!res.headersSent) {
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json; charset=utf-8');
              res.end(JSON.stringify({ error: 'O serviço local encontrou um erro ao processar a solicitação.' }));
            } else if (!res.writableEnded) {
              res.end();
            }
          }
        });
        return;
      } catch (err) {
        console.error(`API Error on ${pathname}:`, err);
        if (!res.headersSent) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: err.message }));
        }
        return;
      }
    }
  }

  // Serve static files
  const projectRoot = path.resolve(__dirname);
  let filePath = path.resolve(projectRoot, `.${pathname === '/' ? '/index.html' : pathname}`);
  if (filePath !== projectRoot && !filePath.startsWith(`${projectRoot}${path.sep}`)) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('404 Not Found');
    return;
  }
  if (!fs.existsSync(filePath) && !path.extname(filePath)) {
    filePath += '.html';
  }

  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath).toLowerCase();
    const contentType = mimeTypes[ext] || 'application/octet-stream';
    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
      'Pragma': 'no-cache',
      'Expires': '0'
    });
    fs.createReadStream(filePath).pipe(res);
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('404 Not Found');
  }
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    const nextPort = Number(PORT) + 1;
    console.log(`Port ${PORT} is in use. Starting on http://localhost:${nextPort}/app.html`);
    server.listen(nextPort, HOST);
  } else {
    console.error('Server error:', err);
  }
});

server.listen(PORT, HOST, () => {
  console.log(`🚀 CoPiloto de Viagem Dev Server running at http://localhost:${PORT}/app.html`);
});
