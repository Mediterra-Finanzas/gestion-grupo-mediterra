/* ─────────────────────────────────────────────────────────────────────────
   Prueba en navegador real de api/informe.js (datos de prueba, sin red externa).
   El endpoint sirve HTML desde el MISMO dominio de la app. Comprueba que un
   <script> en el `id` reflejado o en el HTML guardado NO se ejecuta y no puede
   usar la cookie de sesión. Control: la misma página SIN la cabecera sí lo ejecuta
   (así la prueba demuestra que detectaría el ataque).
   Uso: node scripts/seguridad-main-pins/prueba-informe.mjs
   ───────────────────────────────────────────────────────────────────────── */
import http from 'http';
import path from 'path';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const { chromium } = require(path.join(RAIZ, 'node_modules/playwright'));

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };

// HTML "guardado" por un atacante: intenta leer la sesión y avisar a /robo.
const ATAQUE = `<script>fetch('/api/auth/sesion',{credentials:'include'}).then(r=>r.text()).then(t=>fetch('/robo?d='+encodeURIComponent(t))).catch(e=>fetch('/robo?err=1'));document.title='EJECUTADO'</script>`;
const INFORME_OK = `<html><head><style>h1{color:#0f766e}</style></head><body><h1>Informe técnico</h1><img src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7" alt="logo"></body></html>`;

// La función real, con el fetch hacia Supabase simulado (nada sale de esta máquina).
// Se simula producción (VERCEL_ENV) para que el endpoint use su destino de siempre.
process.env.VERCEL_ENV = 'production';
const salidas = [];
const fetchReal = globalThis.fetch;
globalThis.fetch = async (url, opts) => {
  const u = String(url);
  salidas.push(u);
  if (u.includes('/storage/v1/object/public/osiris-fotos/informes-html/INF_OK')) return new Response(INFORME_OK, { status: 200 });
  if (u.includes('/storage/v1/object/public/osiris-fotos/informes-html/INF_MALO')) return new Response('<h1>x</h1>' + ATAQUE, { status: 200 });
  if (u.includes('supabase.co/storage/')) return new Response('no', { status: 404 });
  if (u.includes('supabase.co/rest/')) return new Response(JSON.stringify([{ value: { opTecnica: { informes: [{ id: 'INF_CACHE', _htmlCache: '<p>cache</p>' + ATAQUE }] } } }]), { status: 200 });
  return fetchReal(url, opts);
};
const informe = require(path.join(RAIZ, 'api/informe.js'));

const robos = [];
const srv = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname === '/entrar') { res.setHeader('Set-Cookie', 'mediterra_sess=SECRETO; HttpOnly; Secure; SameSite=Strict; Path=/'); return res.end('ok'); }
  if (u.pathname === '/api/auth/sesion') { res.setHeader('Content-Type', 'application/json'); return res.end(JSON.stringify({ cookie: /mediterra_sess=SECRETO/.test(req.headers.cookie || '') })); }
  if (u.pathname === '/robo') { robos.push(u.search); return res.end(''); }
  if (u.pathname === '/control') { res.setHeader('Content-Type', 'text/html; charset=utf-8'); return res.end('<h1>sin cabecera</h1>' + ATAQUE); }
  if (u.pathname === '/api/informe') {
    const r = { headers: {}, statusCode: 200, setHeader(k, v) { this.headers[k] = v; }, status(c) { this.statusCode = c; return this; },
      send(b) { for (const [k, v] of Object.entries(this.headers)) res.setHeader(k, v); res.statusCode = this.statusCode; res.end(b); return this; } };
    return informe({ query: Object.fromEntries(u.searchParams) }, r);
  }
  res.statusCode = 404; res.end('');
});
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const base = `http://localhost:${srv.address().port}`;

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
try {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(base + '/entrar');
  const visitar = async (ruta) => { robos.length = 0; const r = await page.goto(base + ruta); await page.waitForTimeout(800); return { r, titulo: await page.title(), robos: robos.slice() }; };

  const c = await visitar('/control');
  ok(c.titulo === 'EJECUTADO' && c.robos.some((x) => /true/.test(decodeURIComponent(x))), 'CONTROL: sin la cabecera el script corre y lee la sesión (la prueba detecta el ataque)');

  const refl = await visitar('/api/informe?id=' + encodeURIComponent(ATAQUE));
  ok(refl.r.status() === 404 && refl.titulo !== 'EJECUTADO' && refl.robos.length === 0, 'id con <script> reflejado → no se ejecuta, nada sale');
  ok((await page.content()).includes('&lt;script&gt;'), '…y el id aparece escapado como texto');

  const mal = await visitar('/api/informe?id=INF_MALO');
  ok(mal.titulo !== 'EJECUTADO' && mal.robos.length === 0, 'HTML guardado en Storage con <script> → no se ejecuta');

  const cache = await visitar('/api/informe?id=INF_CACHE');
  ok(cache.titulo !== 'EJECUTADO' && cache.robos.length === 0, 'HTML guardado en la fila osiris (_htmlCache) con <script> → no se ejecuta');
  ok(/sandbox/.test(cache.r.headers()['content-security-policy'] || ''), 'cabecera Content-Security-Policy: sandbox presente');

  // Aislamiento (D7): fuera de producción y sin SUPABASE_URL no se conecta a ninguna base.
  process.env.VERCEL_ENV = 'preview';
  salidas.length = 0;
  const sinConf = await page.goto(base + '/api/informe?id=INF_OK');
  ok(sinConf.status() === 503 && salidas.length === 0, 'Preview sin SUPABASE_URL → 503 y ninguna conexión a Supabase');
  process.env.SUPABASE_URL = 'http://127.0.0.1:9'; salidas.length = 0;
  await page.goto(base + '/api/informe?id=INF_X');
  ok(salidas.length > 0 && salidas.every((x) => x.startsWith('http://127.0.0.1:9/')) && !salidas.some((x) => x.includes('/rest/')), 'Preview con SUPABASE_URL → solo ese destino, y sin SUPABASE_ANON_KEY no consulta la base');
  delete process.env.SUPABASE_URL; process.env.VERCEL_ENV = 'production';

  const bueno = await visitar('/api/informe?id=INF_OK');
  const vis = await page.evaluate(() => ({ h1: getComputedStyle(document.querySelector('h1')).color, img: document.querySelector('img').complete && document.querySelector('img').naturalWidth > 0 }));
  ok(bueno.r.status() === 200 && vis.h1 === 'rgb(15, 118, 110)' && vis.img, `informe legítimo: estilos e imagen se ven igual (${JSON.stringify(vis)})`);
} finally {
  await browser.close();
  srv.close();
}
console.log(`\nprueba-informe: ${pass} pass / ${fail} fail`);
process.exit(fail ? 1 : 0);
