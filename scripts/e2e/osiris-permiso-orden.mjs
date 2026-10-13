/* Reordenar el hub de Osiris: solo administrador (oct-2026). Chromium emulado, Supabase falso,
   datos FICTICIOS. Prueba la pantalla Y la acción (soltar una tarjeta sobre otra).
     APP_URL=http://127.0.0.1:4260 [CONTROL=1] node scripts/e2e/osiris-permiso-orden.mjs
   Con CONTROL=1 (contra el build de main sin corregir) se espera el DEFECTO: los perfiles no
   administradores pueden arrastrar y la acción escribe la fila osiris. */
import { instalarFake, PIN } from './fake.mjs';
import { storeDiseno } from '../vista-previa/semilla-diseno.mjs';
import { chromium } from '/home/user/gestion-grupo-mediterra/node_modules/playwright/index.mjs';

const CONTROL = !!process.env.CONTROL;
let ok = 0, fallos = 0;
const check = (n, c, x = '') => { c ? ok++ : fallos++; console.log(`${c ? '✓' : '✗ FALLA'}  ${n}${x ? '  — ' + x : ''}`); };
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const orden = (st) => { const v = st.osiris && st.osiris.value; const o = typeof v === 'string' ? JSON.parse(v) : v; return (o && o.hubCardsOrder) || null; };

async function probar(email, perfil, debePoder) {
  const st = storeDiseno(); st.__dialogosApp = true;
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
  await p.getByText('Osiris Plant Management').first().click(); await p.waitForTimeout(3000);
  const arrastrables = await p.locator('[draggable="true"]').count();
  const asas = await p.locator('[title="Arrastra para reordenar"]').count();
  const antes = JSON.stringify(orden(st));
  const esc0 = (st.__escrituras || []).filter(e => e.id === 'osiris').length;
  // La ACCIÓN, no solo la pantalla: se disparan los eventos de arrastre aunque el atributo no esté.
  await p.evaluate(() => {
    const cards = [...document.querySelectorAll('[draggable]')];
    const src = cards.find(d => d.textContent.includes('Ingresos Osiris'));
    const dst = cards.find(d => d.textContent.includes('Contratos Exportadores-Productores'));
    if (!src || !dst) return;
    const dt = new DataTransfer();
    src.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt }));
    dst.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt }));
    dst.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
    src.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer: dt }));
  });
  await p.waitForTimeout(2500);
  const despues = JSON.stringify(orden(st));
  const escribio = (st.__escrituras || []).filter(e => e.id === 'osiris').length > esc0;
  const cambio = despues !== antes;
  if (debePoder) {
    check(`${perfil} (permitido) · tarjetas arrastrables y asa visibles`, arrastrables === 7 && asas === 7, `${arrastrables} arrastrables · ${asas} asas`);
    check(`${perfil} (permitido) · soltar cambia el orden y lo guarda`, cambio && escribio, despues);
  } else {
    check(`${perfil} (denegado) · sin tarjetas arrastrables ni asa`, arrastrables === 0 && asas === 0, `${arrastrables} arrastrables · ${asas} asas`);
    check(`${perfil} (denegado) · forzar la acción no cambia el orden ni escribe la fila osiris`, !cambio && !escribio, `cambió ${cambio} · escribió ${escribio}`);
  }
  check(`${perfil} · sin errores de página`, !errores.length, errores.join(' | '));
  await ctx.close();
}

const PERFILES = [['ahuerta@grupomediterra.cl', 'admin', true], ['cmachuca@grupomediterra.cl', 'editor con Osiris', false], ['socia.consulta@ejemplo.cl', 'consulta', false]];
for (const [email, perfil, puede] of PERFILES) await probar(email, perfil, CONTROL ? true : puede);
await browser.close();
console.log(`\n${ok} correctas, ${fallos} fallas${CONTROL ? ' · CONTROL sobre main sin corregir: se espera que todos puedan (defecto)' : ''} · Chromium emulado · datos ficticios`);
process.exit(fallos ? 1 : 0);
