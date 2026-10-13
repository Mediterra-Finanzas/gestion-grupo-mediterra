/* Correos que no salen: visibles y con reintento que no duplica (oct-2026).
   Chromium emulado, Supabase falso, datos ficticios. /api/send-email es un servidor de
   correo SIMULADO con identidad de envío (igual que api/_correo.js): nada sale.
     APP_URL=http://127.0.0.1:4173 OUT_DIR=/tmp/cp node scripts/e2e/correo-pendientes.mjs
   1. 5xx  → el panel lo muestra; NINGUNA petición a EmailJS.
   2. red  → reintento con la MISMA identidad; el servidor ya lo había enviado → un solo correo y
      el resultado queda INCIERTO («ya recibido»), no «enviado».
   3. 502 «no salió» → el reintento lleva otra identidad y sale una vez.
   4. 401 (sesión vencida) → renovar con el PIN desde el panel y reintentar → sale una vez.
   5. Salir descarta los pendientes. */
import fs from 'fs';
import { chromium } from '/home/user/gestion-grupo-mediterra/node_modules/playwright/index.mjs';
import { instalarFake, nuevoStore, PIN, EMAIL } from './fake.mjs';
const OUT = process.env.OUT_DIR || '/tmp/cp'; fs.mkdirSync(OUT, { recursive: true });
let fallos = 0; const check = (n, c, x = '') => { console.log(`${c ? '✓' : '✗ FALLA'}  ${n}${x ? '  — ' + x : ''}`); if (!c) fallos++; };
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 }, timezoneId: 'America/Santiago' });
await instalarFake(ctx, nuevoStore());

// Servidor de correo simulado
const pedidos = [], enviados = [], usados = new Set(), emailjs = [];
let guion = [];                 // próximas respuestas forzadas para notificaciones
await ctx.route('**/api/send-email', async (r) => {
  const b = JSON.parse(r.request().postData() || '{}'); pedidos.push(b);
  if (b.accion === 'sesion' || b.accion === 'cerrar') return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
  const paso = guion.shift();
  if (paso === 'abortar') return r.abort('failed');
  if (paso === 'red-tras-enviar') { if (!usados.has(b.idEnvio)) { usados.add(b.idEnvio); enviados.push(b); } return r.abort('failed'); }
  if (paso === '503') return r.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"no_disponible"}' });
  if (paso === '401') return r.fulfill({ status: 401, contentType: 'application/json', body: '{"error":"sin_sesion"}' });
  if (paso === 'smtp-incierto') { usados.add(b.idEnvio); enviados.push(b); return r.fulfill({ status: 502, contentType: 'application/json', body: '{"error":"resultado_incierto"}' }); }
  if (paso === '502-consumido') { usados.add(b.idEnvio); return r.fulfill({ status: 502, contentType: 'application/json', body: '{"error":"no_enviado","reintento":"nuevo"}' }); }
  if (usados.has(b.idEnvio)) return r.fulfill({ status: 200, contentType: 'application/json', body: '{"success":true,"duplicado":true}' });
  usados.add(b.idEnvio); enviados.push(b);
  return r.fulfill({ status: 200, contentType: 'application/json', body: '{"success":true}' });
});
await ctx.route(/emailjs/, r => { emailjs.push(r.request().url()); r.abort(); });
await ctx.route(/vercel\.app|open\.er-api\.com|mindicador\.cl|frankfurter\.app/, r => r.abort());
const p = await ctx.newPage(); p.on('dialog', d => d.accept());
const errores = []; p.on('pageerror', e => errores.push(String(e).slice(0, 160)));
await p.goto(process.env.APP_URL);
await p.locator('input[type=email]').fill(EMAIL); await p.locator('input[type=password]').fill(PIN); await p.keyboard.press('Enter');
await p.waitForTimeout(3500);
const panel = p.getByTestId('correos-pendientes');
const notificar = (asunto) => p.evaluate((a) => window._enviarNotificacion('cmachuca@grupomediterra.cl', 'Carol Machuca', a, 'texto ficticio'), asunto);
const nEnv = (asunto) => enviados.filter(e => e.asunto === asunto).length;
const reintentar = async () => { await panel.getByRole('button', { name: 'Reintentar', exact: true }).first().click(); await p.waitForTimeout(800); };

// 1. 5xx
guion = ['503'];
await notificar('Prueba 5xx'); await p.waitForTimeout(500);
check('1. 5xx: el panel muestra «1 correo sin confirmar» con su descripción', await panel.count() === 1 && /1 correo sin confirmar/.test(await panel.innerText()) && /Prueba 5xx/.test(await panel.innerText()));
await p.screenshot({ path: `${OUT}/panel-5xx.png` });
check('1b. 5xx: ninguna petición a EmailJS', emailjs.length === 0);
// 2. red tras enviar (el servidor lo mandó, la respuesta se perdió)
guion = ['red-tras-enviar'];
await reintentar();
check('2. falla de red: sigue a la vista como resultado incierto', /Resultado incierto: no hubo respuesta/.test(await panel.innerText()));
await reintentar();
const ids = pedidos.filter(x => x.asunto === 'Prueba 5xx').map(x => x.idEnvio);
check('2b. los tres intentos llevan la MISMA identidad', ids.length === 3 && new Set(ids).size === 1, ids.join(' · '));
check('2c. un solo correo enviado aunque se reintentó', nEnv('Prueba 5xx') === 1);
check('2d. el reintento queda como RESULTADO INCIERTO («ya recibido»), no como enviado', /Resultado incierto: el servidor ya había recibido/.test(await panel.innerText()) && await p.getByTestId('correo-reenviar-igual').count() === 1);
await p.screenshot({ path: `${OUT}/panel-incierto.png` });
await panel.getByRole('button', { name: 'Ya llegó: quitar' }).click(); await p.waitForTimeout(400);
check('2e. «Ya llegó: quitar» lo saca sin enviar otra vez', await panel.count() === 0 && nEnv('Prueba 5xx') === 1);
// 3. 502 con identidad consumida
guion = ['502-consumido'];
await notificar('Prueba 502'); await p.waitForTimeout(500);
await reintentar();
const ids3 = pedidos.filter(x => x.asunto === 'Prueba 502').map(x => x.idEnvio);
check('3. 502 «no salió»: el reintento lleva otra identidad (id.1) y sale una vez', ids3.length === 2 && ids3[1] === `${ids3[0]}.1` && nEnv('Prueba 502') === 1, ids3.join(' · '));
// 3b. El envío empezó y se perdió la respuesta del proveedor (SMTP aceptó): resultado incierto
guion = ['smtp-incierto'];
await notificar('Prueba incierto'); await p.waitForTimeout(500);
check('3b. envío iniciado sin confirmación → «Resultado incierto», no «No salió»', /Resultado incierto: el envío empezó/.test(await panel.innerText()) && !/No salió/.test(await panel.innerText()));
check('3c. no se ofrece «Reintentar» (la identidad ya se usó)', await panel.getByRole('button', { name: 'Reintentar', exact: true }).count() === 0);
const nAntes = pedidos.filter(x => x.asunto === 'Prueba incierto').length;
await panel.getByTestId('correo-reenviar-igual').click(); await p.waitForTimeout(300);
check('3d. «Reenviar…» pide confirmar el posible duplicado y no envía todavía', await p.getByTestId('correo-confirmar-reenvio').count() === 1 && /dos veces/.test(await p.getByTestId('correo-confirmar-reenvio').innerText()) && pedidos.filter(x => x.asunto === 'Prueba incierto').length === nAntes);
await p.screenshot({ path: `${OUT}/panel-confirmar-reenvio.png` });
await panel.getByRole('button', { name: 'No reenviar' }).click(); await p.waitForTimeout(300);
check('3e. «No reenviar» no envía nada', pedidos.filter(x => x.asunto === 'Prueba incierto').length === nAntes && await panel.count() === 1);
await panel.getByTestId('correo-reenviar-igual').click(); await p.getByTestId('correo-confirmar-si').click(); await p.waitForTimeout(800);
const ids3b = pedidos.filter(x => x.asunto === 'Prueba incierto').map(x => x.idEnvio);
check('3f. con confirmación explícita se reenvía una vez, con otra identidad', ids3b.length === 2 && ids3b[1] === `${ids3b[0]}.1` && await panel.count() === 0, ids3b.join(' · '));
// 4. 401 → renovar con el PIN
guion = ['401'];
await notificar('Prueba 401'); await p.waitForTimeout(500);
check('4. sesión vencida: el panel pide el PIN para renovar', await p.getByTestId('correos-renovar').count() === 1);
await p.screenshot({ path: `${OUT}/panel-401.png` });
const nSes = pedidos.filter(x => x.accion === 'sesion').length;
await panel.locator('input[type=password]').fill(PIN); await p.getByTestId('correos-renovar').click(); await p.waitForTimeout(1200);
const ses = pedidos.filter(x => x.accion === 'sesion');
check('4b. renovar abre sesión con el correo de la persona y reintenta: sale una vez', ses.length === nSes + 1 && ses[ses.length - 1].email === EMAIL && nEnv('Prueba 401') === 1 && await panel.count() === 0);
// 5. salir descarta
guion = ['503'];
await notificar('Prueba salir'); await p.waitForTimeout(500);
await p.getByRole('button', { name: /Salir/ }).first().click(); await p.waitForTimeout(1200);
check('5. al salir se descartan los pendientes', await panel.count() === 0);
check('6. en todo el recorrido: 0 peticiones a EmailJS', emailjs.length === 0, `${emailjs.length}`);
check('6b. sin errores de página', !errores.length, errores.join(' | '));
await browser.close();
console.log(fallos ? `\n${fallos} falla(s)` : '\nTodo OK · Chromium emulado · correo simulado, ningún mensaje real');
process.exit(fallos ? 1 : 0);
