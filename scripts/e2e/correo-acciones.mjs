/* La app pide ACCIONES al servidor de correo (oct-2026). Chromium emulado, Supabase falso,
   correo interceptado (nada sale). Comprueba que: al ingresar se abre la sesión de correo con
   el correo y el PIN tecleados; ninguna petición usa el formato del relé antiguo
   (to/subject/html libres); al salir se cierra la sesión.
     APP_URL=http://127.0.0.1:4173 node scripts/e2e/correo-acciones.mjs */
import { chromium } from '/home/user/gestion-grupo-mediterra/node_modules/playwright/index.mjs';
import { instalarFake, nuevoStore, PIN, EMAIL } from './fake.mjs';
let fallos = 0; const check = (n, c, x = '') => { console.log(`${c ? '✓' : '✗ FALLA'}  ${n}${x ? '  — ' + x : ''}`); if (!c) fallos++; };
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
await instalarFake(ctx, nuevoStore());
const pedidos = [];
await ctx.route('**/api/send-email', async (r) => { pedidos.push(JSON.parse(r.request().postData() || '{}')); await r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }); });
await ctx.route(/vercel\.app|emailjs|open\.er-api\.com|mindicador\.cl|frankfurter\.app/, r => r.abort());
const p = await ctx.newPage(); p.on('dialog', d => d.accept());
await p.goto(process.env.APP_URL);
await p.locator('input[type=email]').fill(EMAIL); await p.locator('input[type=password]').fill(PIN); await p.keyboard.press('Enter');
await p.waitForTimeout(3500);
const s = pedidos.find(x => x.accion === 'sesion');
check('al ingresar se abre la sesión de correo con el correo y el PIN tecleados', !!s && s.email === EMAIL && s.pin === PIN);
await p.getByRole('button', { name: /Salir/ }).first().click(); await p.waitForTimeout(1500);
check('al salir se cierra la sesión de correo', pedidos.some(x => x.accion === 'cerrar'));
check('ninguna petición usa el formato del relé antiguo (to/subject/html)', pedidos.every(x => x.accion && !('to' in x) && !('html' in x)), JSON.stringify(pedidos.map(x => x.accion)));
await browser.close();
console.log(fallos ? `\n${fallos} falla(s)` : '\nTodo OK · correo interceptado, ningún mensaje real');
process.exit(fallos ? 1 : 0);
