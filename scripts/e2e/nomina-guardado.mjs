/* ─────────────────────────────────────────────────────────────────────────
   E2E EN NAVEGADOR — Guardado de Nóminas cuando el servidor NO confirma.
   App real (build) + Supabase falso aislado; solo datos de prueba.

   Casos (escrituras a las filas nominas_* interceptadas):
     A. Rechazo por SELLO (HTTP 400 "MEDITERRA_SELLO…", datos desactualizados)
     B. Error de RED (sin respuesta)
     C. Error del SERVIDOR (HTTP 500)
     D. Transición de estado (Aprobar CFO) con red caída y con HTTP 500

   Comprueba en cada caso: aviso claro con el motivo; la edición sigue en
   pantalla; copia en este navegador; nada marcado como guardado; los
   refrescos no pisan la edición; cerrar la pestaña pide confirmación; cuándo
   hace falta recargar; descargar los cambios; recargar con confirmación; y que
   una transición no se completa ni envía correos si no se guardó.
   ───────────────────────────────────────────────────────────────────────── */
import fs from 'fs';
import path from 'path';
import { nuevoStore } from './fake.mjs';
import { abrirApp, login, entrarFinanzas, subTab } from './lib.mjs';

const OUT = process.env.OUT_DIR || '.';
fs.mkdirSync(OUT, { recursive: true });
let fallos = 0;
const check = (n, c, x = '') => { console.log(`${c ? '✓' : '✗ FALLA'}  ${n}${x ? '  — ' + x : ''}`); if (!c) fallos++; };
const foto = (page, n) => page.screenshot({ path: path.join(OUT, `${n}.png`), fullPage: false });

const hoy = new Date();
const t = new Date(Date.UTC(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()));
t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
const semana = Math.ceil((((t - new Date(Date.UTC(t.getUTCFullYear(), 0, 1))) / 86400000) + 1) / 7);
const anio = t.getUTCFullYear();
const item = (id) => ({ id, seccion: 'pagos_usd', tipoDoc: 'Factura', proveedor: 'Proveedor Prueba', rut: '', nDoc: '1', fDoc: '', fVenc: '', semVenc: '',
  concepto: 'Servicio', montoCLP: 0, montoUSD: 1000, montoPEN: 0, comentario: '', pagado: false, anticipo: 0, estadoLinea: 'activa', historial: [], documentos: [] });
const nom = (id, estado, sem) => ({ id, empresa: 'Osiris', semana: sem, año: anio, numero: 1, fecha: hoy.toISOString().slice(0, 10), tc: 950, estado,
  preparadoPor: 'x', revisadoPor: 'y', aprobadoPor: '', aprobado1Por: estado === 'aprobada1' ? 'Carol Machuca' : '', fechaAprobacion: '', fechaAprobacion1: '',
  items: [item('it-' + id)], bancos: {}, notas: '', seccionesExtra: [], estadoNomina: 'activa', historial: [] });

const store = nuevoStore();
store.nominas_v2_done = { value: JSON.stringify({ migrado: true }), updated_at: new Date(Date.now() - 40000).toISOString() };
store.nominas_osiris = { value: JSON.stringify({ empresa: 'Osiris', nominas: [nom('nomB', 'borrador', semana), nom('nomT', 'aprobada1', semana - 1)] }),
  updated_at: new Date(Date.now() - 39000).toISOString() };
const servidor = () => JSON.parse(store.nominas_osiris.value).nominas;
const delServidor = (id) => servidor().find(n => n.id === id);
const fijarServidor = (id, patch) => { const v = JSON.parse(store.nominas_osiris.value); v.nominas = v.nominas.map(n => n.id === id ? { ...n, ...patch } : n); store.nominas_osiris.value = JSON.stringify(v); };
const soloNominas = (resp) => (metodo, id) => (/^nominas_/.test(id || '') ? resp : null);

const { browser, ctx, page } = await abrirApp(store);
let correos = 0;
await ctx.route('**/api/send-email', r => { correos++; return r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }); });
await ctx.route('**api.emailjs.com/**', r => { correos++; return r.fulfill({ status: 200, body: 'OK' }); });
const errores = [];
page.on('pageerror', e => errores.push(String(e)));
const dialogos = [];
page.on('dialog', d => { dialogos.push(d.message()); d.accept().catch(() => {}); });

const aviso = () => page.locator('[data-aviso-nominas]');
const textoAviso = async () => (await aviso().count()) ? (await aviso().first().innerText()) : '';
const notas = () => page.locator('textarea[placeholder="Observaciones..."]').first();
const borrador = () => page.evaluate(() => { const v = localStorage.getItem('mediterra_nominas_sin_guardar'); return v ? JSON.parse(v) : null; });
const cierrePideConfirmar = () => page.evaluate(() => { const ev = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(ev); return ev.defaultPrevented; });
const abrir = async (textoFila) => {
  const btns = page.getByRole('button', { name: /Editar|Ver/ });
  const n = await btns.count();
  for (let i = 0; i < n; i++) {
    const fila = btns.nth(i).locator('xpath=ancestor::tr[1]');
    if ((await fila.innerText()).includes(textoFila)) { await btns.nth(i).click(); await page.waitForTimeout(1200); return true; }
  }
  return false;
};
const escribirNotas = async (txt) => { await notas().fill(txt); await page.waitForTimeout(2200); };

await login(page);
await entrarFinanzas(page);
await subTab(page, /Nóminas/);
await page.waitForTimeout(1500);
check('Abre la nómina borrador', await abrir('Borrador'));

// ── A. Rechazo por SELLO ────────────────────────────────────────────────
store.__interceptar = soloNominas({ status: 400, body: { code: 'P0001', message: 'MEDITERRA_SELLO: esta escritura deshace un dato aplicado por la conciliación (fila nominas_osiris, operación x). Recarga la página: tus datos están desactualizados.' } });
await escribirNotas('nota de prueba (sello)');
await foto(page, 'g01-sello');
let ta = await textoAviso();
check('A1. Sello: aviso de error con motivo "datos desactualizados" y que hace falta RECARGAR', (await aviso().first().getAttribute('data-motivo')) === 'sello' && /desactualizados/.test(ta) && /RECARGAR/.test(ta), ta.slice(0, 160));
check('A2. Sello: no ofrece "Reintentar guardar" (reintentar con datos viejos no sirve)', await page.getByRole('button', { name: 'Reintentar guardar' }).count() === 0);
check('A3. Sello: la edición sigue en pantalla', (await notas().inputValue()) === 'nota de prueba (sello)');
check('A4. Sello: nada se guardó en el servidor', delServidor('nomB').notas === '');
const bA = await borrador();
check('A5. Sello: copia en este navegador con la nómina editada', bA && bA.motivo === 'sello' && bA.nominas.length === 1 && bA.nominas[0].notas === 'nota de prueba (sello)');
check('A6. Cerrar la pestaña pide confirmación', await cierrePideConfirmar());
// Otro usuario cambia el servidor: ni el refresco por visibilidad ni el periódico (30 s) pisan la edición
fijarServidor('nomB', { notas: 'cambio de otra persona', estado: 'preparada' });
await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
await page.waitForTimeout(32000);
check('A7. Los refrescos (al volver a la pestaña y cada 30 s) no pisan la edición pendiente', (await notas().inputValue()) === 'nota de prueba (sello)');
// Descargar los cambios
const [descarga] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Descargar mis cambios/ }).first().click()]);
const contenido = fs.readFileSync(await descarga.path(), 'utf8');
check('A8. "Descargar mis cambios" entrega un JSON con la edición no guardada', /nota de prueba \(sello\)/.test(contenido) && JSON.parse(contenido).nominas.length === 1, descarga.suggestedFilename());
// Recargar: pide confirmación y advierte la pérdida
dialogos.length = 0;
await page.getByRole('button', { name: /Recargar datos del servidor/ }).first().click();
await page.waitForTimeout(1500);
check('A9. Recargar advierte antes de perder cambios (cuántas nóminas y que hay copia)', dialogos.some(m => /Se perderán/.test(m) && /1 nómina/.test(m) && /copia/.test(m)), dialogos.join(' | ').slice(0, 200));
check('A10. Tras recargar se ve la versión del servidor', (await notas().inputValue()) === 'cambio de otra persona');
ta = await textoAviso();
check('A11. Tras recargar sigue disponible la copia local (aviso "NO se guardaron", sin aplicarla sola)', (await aviso().first().getAttribute('data-aviso-nominas')) === 'borrador' && /NO se guardaron/.test(ta));
await page.getByRole('button', { name: /Eliminar la copia/ }).first().click();
await page.waitForTimeout(500);
check('A12. "Eliminar la copia" (con confirmación) la borra', !(await borrador()) && (await aviso().count()) === 0);
fijarServidor('nomB', { estado: 'borrador' });

// ── B. Error de RED ─────────────────────────────────────────────────────
store.__interceptar = soloNominas('red');
await escribirNotas('nota de prueba (red)');
await foto(page, 'g02-red');
ta = await textoAviso();
check('B1. Red: aviso "sin conexión" y que NO hay que recargar', (await aviso().first().getAttribute('data-motivo')) === 'red' && /sin conexión/i.test(ta) && /NO recargues/.test(ta), ta.slice(0, 160));
check('B2. Red: la edición sigue en pantalla, no se guardó y hay copia local', (await notas().inputValue()) === 'nota de prueba (red)' && delServidor('nomB').notas === 'cambio de otra persona' && (await borrador())?.motivo === 'red');
await page.getByRole('button', { name: 'Reintentar guardar' }).click();
await page.waitForTimeout(1500);
check('B3. Red: reintentar sin conexión sigue avisando (no finge éxito)', (await aviso().count()) === 1 && delServidor('nomB').notas === 'cambio de otra persona');
store.__interceptar = null;
await page.getByRole('button', { name: 'Reintentar guardar' }).click();
await page.waitForTimeout(1500);
check('B4. Red: vuelve la conexión → reintentar guarda, el aviso desaparece y se borra la copia', (await aviso().count()) === 0 && delServidor('nomB').notas === 'nota de prueba (red)' && !(await borrador()));
check('B5. Sin cambios pendientes, cerrar la pestaña no pide confirmación', !(await cierrePideConfirmar()));

// ── C. Error del SERVIDOR (500) ─────────────────────────────────────────
store.__interceptar = soloNominas({ status: 500, body: { message: 'error interno simulado' } });
await escribirNotas('nota de prueba (500)');
await foto(page, 'g03-500');
ta = await textoAviso();
check('C1. 500: aviso con el código HTTP y que no hace falta recargar', (await aviso().first().getAttribute('data-motivo')) === 'http' && /HTTP 500/.test(ta) && /no hace falta recargar/.test(ta), ta.slice(0, 160));
check('C2. 500: la edición sigue en pantalla, no se guardó y hay copia local', (await notas().inputValue()) === 'nota de prueba (500)' && delServidor('nomB').notas === 'nota de prueba (red)' && (await borrador())?.status === 500);
store.__interceptar = null;
await page.getByRole('button', { name: 'Reintentar guardar' }).click();
await page.waitForTimeout(1500);
check('C3. 500: el servidor se recupera → reintentar guarda y el aviso desaparece', (await aviso().count()) === 0 && delServidor('nomB').notas === 'nota de prueba (500)');

// ── D. Transición de estado que depende del guardado ────────────────────
await page.getByRole('button', { name: /Volver|←/ }).first().click().catch(() => {});
await page.waitForTimeout(1000);
await page.locator('button', { hasText: '‹' }).first().click();
await page.waitForTimeout(1200);
check('Abre la nómina con V°B° (lista para aprobación CFO)', await abrir('V°B° Aprobador'));
const correos0 = correos;
for (const [nombre, resp] of [['red', 'red'], ['500', { status: 500, body: { message: 'x' } }]]) {
  store.__interceptar = soloNominas(resp);
  await page.getByRole('button', { name: /Aprobar \(CFO\)/ }).click();
  await page.waitForTimeout(2000);
  ta = await textoAviso();
  check(`D-${nombre}. Aprobar sin guardado: sigue en "V°B°", servidor sin cambio, 0 correos, aviso "El cambio de estado NO se hizo"`,
    (await page.getByRole('button', { name: /Aprobar \(CFO\)/ }).count()) === 1 && delServidor('nomT').estado === 'aprobada1' && correos === correos0 && /cambio de estado NO se hizo/.test(ta), ta.slice(0, 140));
}
await foto(page, 'g04-transicion');
check('D3. En una transición fallida no se ofrece el reintento genérico (se reintenta con el mismo botón)', await page.getByRole('button', { name: 'Reintentar guardar' }).count() === 0);
store.__interceptar = null;
await page.getByRole('button', { name: /Aprobar \(CFO\)/ }).click();
await page.waitForTimeout(2500);
check('D4. Con el servidor OK: queda aprobada en el servidor y RECIÉN AHÍ se envían los 2 correos', delServidor('nomT').estado === 'aprobada' && correos - correos0 === 2 && (await aviso().count()) === 0, `correos ${correos - correos0}`);
check('Sin errores de JavaScript', errores.length === 0, errores.slice(0, 2).join(' | '));
await browser.close();
console.log(fallos ? `\n${fallos} FALLA(S)` : '\nGuardado de Nóminas: todos los casos OK');
process.exit(fallos ? 1 : 0);
