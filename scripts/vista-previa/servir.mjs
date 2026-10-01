/* Sirve la vista previa armada (scripts/vista-previa/dist) en http://localhost:4180.
   Sin dependencias: solo Node. Los datos son simulados y viven en el navegador. */
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const DIR = path.resolve(process.argv[2] || path.join(AQUI, 'dist'));
const PUERTO = Number(process.env.PORT || 4180);
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.json': 'application/json', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.txt': 'text/plain' };

if (!fs.existsSync(path.join(DIR, 'index.html'))) {
  console.error(`No existe ${DIR}/index.html. Primero: node scripts/vista-previa/armar.mjs`);
  process.exit(1);
}
http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p === '/' || p === '') p = '/index.html';
  const f = path.join(DIR, path.normalize(p).replace(/^(\.\.[/\\])+/, ''));
  if (!f.startsWith(DIR) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('no encontrado'); }
  res.writeHead(200, { 'content-type': TIPOS[path.extname(f)] || 'application/octet-stream', 'cache-control': 'no-store' });
  fs.createReadStream(f).pipe(res);
}).listen(PUERTO, '127.0.0.1', () => console.log(`Vista previa (datos simulados): http://localhost:${PUERTO}  ·  Ctrl+C para cerrar`));
