/* Reordenar el hub de Allegria Foods: solo administrador (oct-2026). Chromium emulado,
   Supabase falso, datos FICTICIOS. Prueba la pantalla Y la acción (se disparan los eventos de
   arrastre aunque la tarjeta no sea arrastrable).
     APP_URL=http://127.0.0.1:4270 [CONTROL=1] node scripts/e2e/allegria-permiso-orden.mjs
   CONTROL=1 contra el build de main sin corregir: se espera el defecto (todos pueden). */
import { instalarFake, PIN } from './fake.mjs';
import { storeDiseno } from '../vista-previa/semilla-diseno.mjs';
import { chromium } from '/home/user/gestion-grupo-mediterra/node_modules/playwright/index.mjs';

const CONTROL = !!process.env.CONTROL;
let ok = 0, fallos = 0;
const check = (n, c, x = '') => { c ? ok++ : fallos++; console.log(`${c ? '✓' : '✗ FALLA'}  ${n}${x ? '  — ' + x : ''}`); };
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const leer = (st, id) => { const v = st[id] && st[id].value; return typeof v === 'string' ? JSON.parse(v) : v; };

async function probar(email, perfil, debePoder) {
  const st = storeDiseno(); st.__dialogosApp = true;
  // Datos ficticios: Carol (editor) recibe acceso de edición a Allegria SOLO en esta prueba.
  const us = leer(st, 'usuarios');
  if (Array.isArray(us)) { const c = us.find(u => u.nombre === 'Carol Machuca'); if (c) { c.modulos = [...new Set([...(c.modulos || []), 'allegria'])]; } st.usuarios.value = us; }
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, timezoneId: 'America/Santiago' });
  await instalarFake(ctx, st);
  await ctx.route(/vercel\.app|open\.er-api\.com|mindicador\.cl|frankfurter\.app|emailjs/, r => r.abort());
  await ctx.route(/\/rest\/v1\/(?!calendario_data)[a-z_]+/, r => r.request().method() === 'GET' ? r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }) : r.abort());
  await ctx.routeWebSocket(/realtime\/v1\/websocket/, () => {});
  const p = await ctx.newPage();
  const errores = []; p.on('pageerror', e => errores.push(String(e).slice(0, 160)));
  await p.goto(process.env.APP_URL);
  await p.locator('input[type=email]').fill(email); await p.locator('input[type=password]').fill(PIN); await p.keyboard.press('Enter');
  await p.waitForTimeout(3000);
  for (const t of ['Entendido', 'Aceptar']) { const b = p.getByRole('button', { name: t }); if (await b.count()) await b.first().click().catch(() => {}); }
  await p.getByText('Allegria Foods').first().click(); await p.waitForTimeout(3000);
  const enHub = await p.getByText('Clientes Importadores').count() > 0;
  const arrastrables = await p.locator('[draggable="true"]').count();
  const asas = await p.locator('[title="Arrastra para reordenar"]').count();
  const antes = JSON.stringify((leer(st, 'allegria') || {}).hubCardsOrder || null);
  const esc0 = (st.__escrituras || []).filter(e => e.id === 'allegria').length;
  await p.evaluate(() => {
    const cards = [...document.querySelectorAll('[draggable]')];
    const src = cards.find(d => d.textContent.includes('Clientes Importadores'));
    const dst = cards.find(d => d.textContent.includes('Productores & Contratos'));
    if (!src || !dst) return;
    const dt = new DataTransfer();
    src.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt }));
    dst.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt }));
    dst.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
    src.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer: dt }));
  });
  await p.waitForTimeout(3000);
  const despues = JSON.stringify((leer(st, 'allegria') || {}).hubCardsOrder || null);
  const escribio = (st.__escrituras || []).filter(e => e.id === 'allegria').length > esc0;
  const cambio = despues !== antes;
  check(`${perfil} · entra al hub de Allegria (acceso legítimo conservado)`, enHub);
  if (debePoder) {
    check(`${perfil} (permitido) · tarjetas arrastrables y asa visibles`, arrastrables > 0 && asas === arrastrables, `${arrastrables} arrastrables · ${asas} asas`);
    check(`${perfil} (permitido) · soltar cambia el orden y lo guarda`, cambio && escribio, despues);
  } else {
    check(`${perfil} (denegado) · sin tarjetas arrastrables ni asa`, arrastrables === 0 && asas === 0, `${arrastrables} arrastrables · ${asas} asas`);
    check(`${perfil} (denegado) · forzar la acción no cambia el orden ni escribe la fila allegria`, !cambio && !escribio, `cambió ${cambio} · escribió ${escribio}`);
  }
  check(`${perfil} · sin errores de página`, !errores.length, errores.join(' | '));
  await ctx.close();
}
for (const [email, perfil, puede] of [['ahuerta@grupomediterra.cl', 'admin', true], ['cmachuca@grupomediterra.cl', 'editor con Allegria', false], ['socia.consulta@ejemplo.cl', 'consulta', false]])
  await probar(email, perfil, CONTROL ? true : puede);
await browser.close();
console.log(`\n${ok} correctas, ${fallos} fallas${CONTROL ? ' · CONTROL sobre main sin corregir: se espera que todos puedan (defecto)' : ''} · Chromium emulado · datos ficticios`);
process.exit(fallos ? 1 : 0);
