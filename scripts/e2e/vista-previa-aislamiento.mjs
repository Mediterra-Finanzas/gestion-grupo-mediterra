/* ─────────────────────────────────────────────────────────────────────────
   La vista previa LOCAL no puede llegar a producción aunque el simulador
   (shim.js) no se cargue. Incidente 2026-10-07: en un equipo Windows la vista
   previa abrió contra la base real (entró con el PIN real y guardó tipos de cambio).

   Arma una copia de scripts/vista-previa/dist con shim.js VACÍO, la sirve en un
   puerto propio y comprueba:
     1. la página muestra "VISTA PREVIA NO AISLADA";
     2. 0 peticiones HTTP y 0 WebSocket a bywovqayuzodbzwsriet.supabase.co
        (la política de contenido del navegador las bloquea);
     3. control: la misma copia SIN la política sí intenta salir (la prueba detecta).
   Una petición que llegara a la red se corta en la prueba: nunca sale de verdad.

     node scripts/vista-previa/armar.mjs && OUT_DIR=/tmp/vpa node scripts/e2e/vista-previa-aislamiento.mjs
   ───────────────────────────────────────────────────────────────────────── */
import fs from 'fs';
import os from 'os';
import path from 'path';
import http from 'http';
import { fileURLToPath } from 'url';
import { chromium } from '/home/user/gestion-grupo-mediterra/node_modules/playwright/index.mjs';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.resolve(AQUI, '../vista-previa/dist');
let fallos = 0;
const check = (n, c, x = '') => { console.log(`${c ? '✓' : '✗ FALLA'}  ${n}${x ? '  — ' + x : ''}`); if (!c) fallos++; };

function copiaSinShim(conPolitica) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vp-sin-shim-'));
  fs.cpSync(DIST, dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'shim.js'), '/* simulador ausente (prueba) */');
  if (!conPolitica) {
    const f = path.join(dir, 'index.html');
    fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/, ''));
  }
  return dir;
}
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.json': 'application/json' };
function servir(dir) {
  return new Promise((ok) => {
    const s = http.createServer((req, res) => {
      let p = new URL(req.url, 'http://x').pathname; if (p === '/') p = '/index.html';
      const f = path.join(dir, path.normalize(p));
      if (!f.startsWith(dir) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { 'content-type': TIPOS[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
    }).listen(0, '127.0.0.1', () => ok(s));
  });
}
async function abrir(dir) {
  const srv = await servir(dir);
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const ctx = await b.newContext(); const page = await ctx.newPage();
  const salidas = [];
  await ctx.route('**bywovqayuzodbzwsriet.supabase.co/**', (r) => r.abort());
  page.on('request', (r) => { if (/supabase\.co/.test(r.url())) salidas.push(r.url()); });
  page.on('websocket', (w) => { if (/supabase\.co/.test(w.url())) salidas.push(w.url()); });
  await page.goto(`http://127.0.0.1:${srv.address().port}/`, { waitUntil: 'load' }); await page.waitForTimeout(6000);
  const aviso = await page.locator('text=VISTA PREVIA NO AISLADA').count();
  await b.close(); srv.close(); fs.rmSync(dir, { recursive: true, force: true });
  return { aviso, salidas };
}

check('0. La vista previa local trae la política de contenido', /http-equiv="Content-Security-Policy"/.test(fs.readFileSync(path.join(DIST, 'index.html'), 'utf8')));
const r1 = await abrir(copiaSinShim(true));
check('1. Sin simulador: la página avisa "VISTA PREVIA NO AISLADA"', r1.aviso === 1);
check('2. Sin simulador: 0 peticiones HTTP/WebSocket a la base de producción', r1.salidas.length === 0, r1.salidas.slice(0, 2).join(' | '));
const r2 = await abrir(copiaSinShim(false));
check('3. Control: sin la política, la prueba SÍ detecta intentos de salida', r2.salidas.length > 0, `${r2.salidas.length} intentos (cortados por la prueba)`);
console.log(fallos ? `\n${fallos} FALLA(S)` : '\nAislamiento de la vista previa local: todos los casos OK');
process.exit(fallos ? 1 : 0);
