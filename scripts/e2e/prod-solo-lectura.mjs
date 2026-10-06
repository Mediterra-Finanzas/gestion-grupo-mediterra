/* ─────────────────────────────────────────────────────────────────────────
   PRUEBA DE PRODUCCIÓN EN SOLO LECTURA FORZADA.

   La app escribe aunque solo se navegue: al iniciar sesión reescribe las filas
   `usuarios` y `pins` (mismo valor), registra `audit_log` y, si el perfil es
   admin, envía un correo de "respaldo" (ver efectos-navegacion.mjs). Un perfil
   de consulta NO basta para garantizar una prueba de lectura. Por eso este
   script BLOQUEA en la red todo lo que no sea lectura:
     · cualquier método ≠ GET hacia *.supabase.co (REST, Storage, Functions);
     · cualquier /api/* salvo POST /api/login (el guardia necesita la sesión);
     · EmailJS y cualquier otro envío ≠ GET a terceros.
   Cada intento bloqueado queda registrado (método, ruta y fila; nunca el cuerpo).

   Credenciales: SOLO por variables de entorno, nunca por chat ni en el repo.
     MEDITERRA_CONSULTA_EMAIL   correo de la cuenta de consulta
     MEDITERRA_CONSULTA_PIN     su PIN
   Un único intento de login (no reintenta: evita bloqueos por intentos fallidos).

   Uso:  OUT_DIR=/tmp/prod node scripts/e2e/prod-solo-lectura.mjs
         (APP_URL por defecto = https://gestion-grupo-mediterra.vercel.app)
   Validación local contra el Supabase falso:  FAKE=1 APP_URL=http://127.0.0.1:4173 …
   ───────────────────────────────────────────────────────────────────────── */
import fs from 'fs';
import path from 'path';
import { chromium } from '/home/user/gestion-grupo-mediterra/node_modules/playwright/index.mjs';

const APP = process.env.APP_URL || 'https://gestion-grupo-mediterra.vercel.app';
const OUT = process.env.OUT_DIR || '.';
const EMAIL = process.env.MEDITERRA_CONSULTA_EMAIL, PIN = process.env.MEDITERRA_CONSULTA_PIN;
if (!EMAIL || !PIN) { console.error('Faltan MEDITERRA_CONSULTA_EMAIL / MEDITERRA_CONSULTA_PIN en el entorno.'); process.exit(2); }
fs.mkdirSync(OUT, { recursive: true });

const MODULOS = ['Administración y Finanzas', 'Genética Diferenciada', 'Flujo de Caja Grupo Mediterra', 'Exportación Fruta Fresca', 'Connecting Quality', 'Sistema Contable Grupo Mediterra', 'Proceso de Fruta Fresca (Planta)'];
const NO_TOCAR = /guardar|nuev|agregar|crear|eliminar|borrar|marcar|aprobar|rechazar|pagar|enviar|subir|importar|exportar|descargar|excel|pdf|imprimir|respaldo|restaurar|salir|pin|permisos|reset|anular|registrar|ingresar real|\+|✕|×|🗑|mediterra$|vencidas|actualizar|resolver/i;

const browser = await chromium.launch({ executablePath: fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined, args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
let store = null;
if (process.env.FAKE) {   // solo para validar el arnés en local
  const { nuevoStore, instalarFake } = await import('./fake.mjs');
  store = nuevoStore(); await instalarFake(ctx, store);
}
const antes = store ? JSON.stringify(store) : null;
let paso = 'inicio';
const bloqueados = [], hallazgos = [], dejadosPasar = [];

await ctx.route('**/*', async (route) => {
  const r = route.request(), u = new URL(r.url()), m = r.method();
  if (m === 'GET' || m === 'HEAD' || m === 'OPTIONS') return route.fallback();
  const esLogin = u.pathname === '/api/login' && m === 'POST' && u.origin === new URL(APP).origin;
  if (esLogin) { dejadosPasar.push(`${m} ${u.pathname}`); return route.fallback(); }
  let fila = (/id=eq\.([^&]+)/.exec(u.search) || [])[1];
  if (!fila) { try { const b = JSON.parse(r.postData() || '{}'); fila = Array.isArray(b) ? b.map(x => x.id).join(',') : b.id; } catch (_) {} }
  bloqueados.push({ paso, metodo: m, host: u.host, ruta: u.pathname, fila: fila ? decodeURIComponent(fila) : undefined });
  return route.abort('blockedbyclient');
});

const page = await ctx.newPage();
page.on('dialog', d => d.dismiss().catch(() => {}));
page.on('pageerror', e => hallazgos.push({ paso, tipo: 'error JS', msg: String(e).slice(0, 300) }));
page.on('console', m => { if (m.type() === 'error' && !/blockedbyclient|ERR_BLOCKED_BY_CLIENT/i.test(m.text())) hallazgos.push({ paso, tipo: 'console.error', msg: m.text().slice(0, 300) }); });
page.on('requestfailed', r => { const t = r.failure()?.errorText || ''; if (!/BLOCKED_BY_CLIENT/.test(t)) hallazgos.push({ paso, tipo: 'request falló', msg: `${r.method()} ${r.url().slice(0, 120)} ${t}` }); });
page.on('response', r => { if (r.status() >= 400 && r.request().method() === 'GET') hallazgos.push({ paso, tipo: `HTTP ${r.status()}`, msg: r.url().slice(0, 160) }); });

// Login: si un intento falla, se detiene (no se reintenta un PIN incorrecto).
let logins = 0;
async function asegurarSesion() {
  if (!(await page.locator('input[type=email]').count())) return;
  paso = `login #${++logins}`;
  await page.locator('input[type=email]').fill(EMAIL);
  await page.locator('input[type=password]').fill(PIN);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(4000);
  if (await page.locator('input[type=email]').count()) {
    console.error('El login no prosperó. Se detiene sin reintentar.'); await page.screenshot({ path: path.join(OUT, 'login.png') });
    await browser.close(); process.exit(3);
  }
}
await page.goto(APP, { waitUntil: 'domcontentloaded' });
await page.locator('input[type=email]').waitFor({ timeout: 30000 });
await asegurarSesion();
paso = 'hub'; await page.waitForTimeout(8000);
await page.screenshot({ path: path.join(OUT, '00-hub.png') });
for (const mod of MODULOS) {
  await asegurarSesion();
  const tile = page.getByRole('button', { name: new RegExp(mod.replace(/[()]/g, '\\$&')) }).first();
  if (!(await tile.count())) { hallazgos.push({ paso: mod, tipo: 'sin acceso o sin módulo', msg: 'tile no visible para este perfil' }); continue; }
  paso = `entrar: ${mod}`; await tile.click(); await page.waitForTimeout(4000);
  await page.screenshot({ path: path.join(OUT, `${mod.slice(0, 14).replace(/\W+/g, '_')}.png`) });
  const textos = [...new Set(await page.getByRole('button').evaluateAll(bs => bs.map(b => (b.innerText || '').trim()).filter(t => t && t.length < 30)))];
  for (const t of textos.filter(t => !NO_TOCAR.test(t)).slice(0, 20)) {
    paso = `${mod} › ${t}`;
    const b = page.getByRole('button', { name: t, exact: true }).first();
    if (!(await b.isVisible().catch(() => false))) continue;
    await b.click({ timeout: 2000 }).catch(() => {}); await page.waitForTimeout(1200);
    const largo = await page.evaluate(() => document.getElementById('root')?.innerText.length || 0);
    if (largo < 30) hallazgos.push({ paso, tipo: 'PANTALLA EN BLANCO', msg: `root=${largo}` });
    await page.keyboard.press('Escape');
  }
  // Volver al hub: al recargar, la app restaura el último módulo (sessionStorage
  // 'mediterra_modulo'); se borra solo esa clave del navegador de prueba.
  await page.evaluate(() => { try { sessionStorage.removeItem('mediterra_modulo'); } catch (_) {} });
  await page.goto(APP); await page.waitForTimeout(2500);
  await asegurarSesion();
}
await browser.close();

const informe = { app: APP, fecha: new Date().toISOString(), logins, escriturasBloqueadas: bloqueados, permitidas: dejadosPasar, hallazgos,
  storeIntacto: store ? JSON.stringify(store) === antes : 'n/a (producción: nada salió, todo intento ≠ GET fue abortado)' };
fs.writeFileSync(path.join(OUT, 'prod-solo-lectura.json'), JSON.stringify(informe, null, 2));
const agg = (arr, f) => Object.entries(arr.reduce((a, x) => ((a[f(x)] ||= 0), a[f(x)]++, a), {}));
console.log(`Escrituras bloqueadas: ${bloqueados.length}`); agg(bloqueados, x => `${x.metodo} ${x.host}${x.ruta}${x.fila ? ' [' + x.fila + ']' : ''}`).forEach(([k, n]) => console.log(`  ${n}× ${k}`));
console.log(`Permitidas: ${dejadosPasar.length ? dejadosPasar.join(', ') : 'ninguna'}`);
console.log(`Hallazgos: ${hallazgos.length}`); agg(hallazgos, x => `${x.tipo}: ${x.msg.slice(0, 120)}`).slice(0, 25).forEach(([k, n]) => console.log(`  ${n}× ${k}`));
if (store) console.log(`Store falso intacto: ${informe.storeIntacto}`);
