/* ─────────────────────────────────────────────────────────────────────────
   Una INSTANCIA independiente del servidor (proceso propio, memoria propia) con
   los handlers reales de api/auth y api/datos. Emula una segunda instancia de
   Vercel contra la MISMA base local. Solo para pruebas.
   Uso: SUPABASE_URL=http://127.0.0.1:<puerto> SUPABASE_SERVICE_ROLE_KEY=… SESSION_SECRET=…
        AUTH_RATELIMIT_SECRET=… PUERTO=<n> node scripts/seguridad-main-pins/instancia.mjs
   Se niega a arrancar si SUPABASE_URL no es local (nunca apunta a producción).
   ───────────────────────────────────────────────────────────────────────── */
import http from 'http';
import path from 'path';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';

const url = String(process.env.SUPABASE_URL || '');
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(url)) { console.error('instancia: SUPABASE_URL debe ser local'); process.exit(2); }
const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(import.meta.url);
const hAuth = require(path.join(RAIZ, 'api/auth/[op].js'));
const hDatos = require(path.join(RAIZ, 'api/datos/[fila].js'));

const app = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://localhost');
  const trozos = [];
  req.on('data', (c) => trozos.push(c));
  req.on('end', async () => {
    const texto = Buffer.concat(trozos).toString('utf8');
    const m = u.pathname.match(/^\/api\/(auth|datos)\/([^/]+)\/?$/);
    if (!m) { res.writeHead(404); return res.end(); }
    req.query = Object.fromEntries(u.searchParams);
    if (m[1] === 'auth') req.query.op = m[2]; else req.query.fila = m[2];
    if (texto && /application\/json/i.test(String(req.headers['content-type'] || ''))) { try { req.body = JSON.parse(texto); } catch (e) { req.body = texto; } }
    else req.body = texto || undefined;
    req.headers['x-forwarded-for'] = req.socket.remoteAddress || '';
    delete req.headers['x-vercel-forwarded-for']; delete req.headers['x-real-ip'];
    res.status = (c) => { res.statusCode = c; return res; };
    res.json = (o) => { if (!res.getHeader('Content-Type')) res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.end(JSON.stringify(o)); return res; };
    try { await (m[1] === 'auth' ? hAuth : hDatos)(req, res); }
    catch (e) { if (!res.headersSent) { res.statusCode = 500; res.end('{"error":"excepcion"}'); } }
  });
});
app.listen(Number(process.env.PUERTO), '127.0.0.1', () => console.log('LISTA'));
