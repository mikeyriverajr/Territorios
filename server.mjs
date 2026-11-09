import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST_DIR = path.resolve(__dirname, 'dist');
const CLOUD_DB_FILE = path.resolve(__dirname, '.cloud-db.json');
const PORT = Number(process.env.PORT || 5173);

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.kml': 'application/vnd.google-earth.kml+xml; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

  // Endpoint de sincronización en la nube (/api/cloud-state)
  if (url.pathname === '/api/cloud-state') {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');

    if (req.method === 'GET') {
      if (fs.existsSync(CLOUD_DB_FILE)) {
        try {
          res.statusCode = 200;
          res.end(fs.readFileSync(CLOUD_DB_FILE, 'utf-8'));
          return;
        } catch {
          res.statusCode = 200;
          res.end('null');
          return;
        }
      }
      res.statusCode = 200;
      res.end('null');
      return;
    }

    if (req.method === 'POST') {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
      });
      req.on('end', () => {
        try {
          JSON.parse(body);
          fs.writeFileSync(CLOUD_DB_FILE, body, 'utf-8');
          res.statusCode = 200;
          res.end(JSON.stringify({ ok: true }));
        } catch {
          res.statusCode = 400;
          res.end(JSON.stringify({ ok: false }));
        }
      });
      return;
    }

    res.statusCode = 405;
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  // Servir archivos estáticos de dist/
  let safePath = path.normalize(url.pathname).replace(/^(\.\.[\/\\])+/, '');
  let filePath = path.join(DIST_DIR, safePath);

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(DIST_DIR, 'index.html');
  }

  if (fs.existsSync(filePath)) {
    const ext = path.extname(filePath).toLowerCase();
    res.setHeader('Content-Type', MIME_TYPES[ext] || 'application/octet-stream');
    fs.createReadStream(filePath).pipe(res);
  } else {
    res.statusCode = 404;
    res.end('Ejecute "npm run build" antes de iniciar el servidor de producción.');
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Servidor en vivo iniciado en http://localhost:${PORT}`);
});
