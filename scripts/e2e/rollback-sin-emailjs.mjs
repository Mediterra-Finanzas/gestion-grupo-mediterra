/* ¿Sirve esta rama de rollback cuando EmailJS ya fue retirado? (oct-2026)
   Chromium emulado, Supabase falso, datos ficticios. El endpoint protegido se simula con la
   respuesta que da al formato antiguo (401, ver api/send-email.test.mjs caso 1). EmailJS se
   simula en sus dos estados; nada sale.
     APP_URL=http://127.0.0.1:4261 node scripts/e2e/rollback-sin-emailjs.mjs
   A. EmailJS activo   → la app antigua entrega por EmailJS (el relé de EmailJS sigue abierto).
   B. EmailJS retirado → la notificación se pierde y la pantalla no lo dice. */
import { chromium } from '/home/user/gestion-grupo-mediterra/node_modules/playwright/index.mjs';
import { instalarFake, nuevoStore, PIN, EMAIL } from './fake.mjs';
let fallos = 0; const check = (n, c, x = '') => { console.log(`${c ? '✓' : '✗ FALLA'}  ${n}${x ? '  — ' + x : ''}`); if (!c) fallos++; };
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
async function escenario(emailjsActivo) {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  await instalarFake(ctx, nuevoStore());
  const api = [], ejs = [];
  await ctx.route('**/api/send-email', r => { api.push(JSON.parse(r.request().postData() || '{}')); r.fulfill({ status: 401, contentType: 'application/json', body: '{"error":"sin_sesion"}' }); });
  await ctx.route(/api\.emailjs\.com/, r => { ejs.push(1); r.fulfill(emailjsActivo ? { status: 200, body: 'OK' } : { status: 400, body: 'The template ID is invalid' }); });
  await ctx.route(/vercel\.app|open\.er-api\.com|mindicador\.cl|frankfurter\.app/, r => r.abort());
  const p = await ctx.newPage(); p.on('dialog', d => d.accept());
  await p.goto(process.env.APP_URL);
  await p.locator('input[type=email]').fill(EMAIL); await p.locator('input[type=password]').fill(PIN); await p.keyboard.press('Enter');
  await p.waitForTimeout(3500);
  const textoAntes = await p.locator('body').innerText();
  const r = await p.evaluate(async () => { try { await window._enviarNotificacion('cmachuca@grupomediterra.cl', 'Carol', 'Prueba rollback', 'texto ficticio'); return 'resuelta'; } catch (e) { return 'error: ' + e.message; } });
  await p.waitForTimeout(800);
  const textoDespues = await p.locator('body').innerText();
  const aviso = textoDespues !== textoAntes && /correo|enviar|no se pudo/i.test(textoDespues.replace(textoAntes, ''));
  await ctx.close();
  return { api: api.length, ejs: ejs.length, formatoAntiguo: api.every(x => 'to' in x && !('accion' in x)), r, aviso };
}
const A = await escenario(true);
check('A. con EmailJS activo: el servidor protegido rechaza el formato antiguo (401) y la app lo entrega por EmailJS', A.api === 1 && A.formatoAntiguo && A.ejs === 1, JSON.stringify(A));
const B = await escenario(false);
check('B. con EmailJS retirado: la notificación NO sale (servidor 401 y EmailJS rechaza)', B.api === 1 && B.ejs === 1, JSON.stringify(B));
check('B2. y la pantalla no avisa nada: el envío se pierde en silencio', B.r === 'resuelta' && !B.aviso);
await browser.close();
console.log(fallos ? `\n${fallos} falla(s)` : '\nComprobado · Chromium emulado · correo simulado, ningún mensaje real');
process.exit(fallos ? 1 : 0);
