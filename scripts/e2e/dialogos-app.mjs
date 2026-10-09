/* ─────────────────────────────────────────────────────────────────────────
   DIÁLOGOS DE LA APP (los de producción) y LÍMITE DE ERROR.
   A diferencia del resto de las pruebas antiguas, aquí NO se activa el modo
   nativo (__MDT_DIALOGOS_NATIVOS): el store lleva __dialogosApp y se verifica
   que window.__MDT_DIALOGOS_NATIVOS esté apagado antes de empezar.

   prompt/confirm del navegador bloqueaban la página; los diálogos de la app
   esperan sin bloquear. Por eso se prueba, además de aceptar/cancelar/cerrar:
   doble clic, una segunda solicitud mientras hay una abierta, y un cambio del
   registro llegado por realtime MIENTRAS se espera la respuesta.

   Chromium emulado, Supabase falso, datos ficticios, build congelado:
   APP_URL=http://127.0.0.1:4201 OUT_DIR=/tmp/dlg node scripts/e2e/dialogos-app.mjs
   ───────────────────────────────────────────────────────────────────────── */
import fs from 'fs';
import { instalarFake, leerFila, PIN } from './fake.mjs';
import { storeDiseno } from '../vista-previa/semilla-diseno.mjs';
import { chromium } from '/home/user/gestion-grupo-mediterra/node_modules/playwright/index.mjs';

const OUT = process.env.OUT_DIR || '/tmp/dlg';
fs.mkdirSync(OUT, { recursive: true });
let ok = 0, fallos = 0;
const check = (n, c, x = '') => { c ? ok++ : fallos++; console.log(`${c ? '✓' : '✗ FALLA'}  ${n}${x ? '  — ' + x : ''}`); };
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });

async function sesion({ tablasOtras = '[]' } = {}) {
  const st = Object.assign(storeDiseno(), { __dialogosApp: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, timezoneId: 'America/Santiago' });
  await instalarFake(ctx, st);
  await ctx.route(/open\.er-api\.com|mindicador\.cl|frankfurter\.app|emailjs/, r => r.abort());
  await ctx.route(/\/rest\/v1\/(?!calendario_data)[a-z_]+/, r => r.request().method() === 'GET' ? r.fulfill({ status: 200, contentType: 'application/json', body: tablasOtras }) : r.abort());
  // Realtime simulado: responde el join y permite empujar cambios «de otra sesión».
  const sockets = [];
  await ctx.routeWebSocket(/realtime\/v1\/websocket/, ws => {
    sockets.push(ws);
    ws.onMessage(m => { try { const msg = JSON.parse(m); if (msg.event === 'phx_join') ws.send(JSON.stringify({ topic: msg.topic, event: 'phx_reply', payload: { status: 'ok' }, ref: msg.ref })); } catch (e) {} });
  });
  const page = await ctx.newPage();
  const errores = []; page.on('pageerror', e => errores.push(String(e).slice(0, 160)));
  const nativos = []; page.on('dialog', d => { nativos.push(d.type() + ': ' + d.message().slice(0, 60)); d.dismiss().catch(() => {}); });
  await page.goto(process.env.APP_URL);
  await page.locator('input[type=email]').fill('ahuerta@grupomediterra.cl'); await page.locator('input[type=password]').fill(PIN); await page.keyboard.press('Enter');
  await page.waitForTimeout(2500);
  for (const t of ['Entendido', 'Aceptar']) { const b = page.getByRole('button', { name: t }); if (await b.count()) await b.first().click().catch(() => {}); }
  const empujar = (id, value) => {
    const updated_at = new Date().toISOString();
    st[id] = { value, updated_at };
    for (const ws of sockets) ws.send(JSON.stringify({ topic: 'realtime:public:calendario_data', event: 'UPDATE', payload: { record: { id, value, updated_at } } }));
    return sockets.length;
  };
  return { ctx, page, st, errores, nativos, empujar };
}
const escrituras = (st, id) => (st.__escrituras || []).filter(e => e.id === id).length;
const dlg = (p) => p.getByTestId('dialogo-app');
async function pulsar(p, nombre) { const b = p.locator('main').getByRole('button', typeof nombre === 'string' ? { name: nombre, exact: true } : { name: nombre }); await b.first().click(); await p.waitForTimeout(1200); }

// ── A. Nómina: devolver con comentarios (perfil CFO, nómina con V°B°) ──
{
  const s = await sesion();
  const { page: p, st } = s;
  check('Modo de producción: __MDT_DIALOGOS_NATIVOS apagado', await p.evaluate(() => !window.__MDT_DIALOGOS_NATIVOS));
  await p.getByTestId('nav-modulo-finanzas').click(); await p.waitForTimeout(4000);
  await pulsar(p, '📋 Nóminas');
  await p.locator('main select').filter({ has: p.locator('option[value="40"]') }).first().selectOption('40'); await p.waitForTimeout(800);
  const fila = p.locator('tr', { hasText: 'Osiris' }).filter({ hasText: /V°B°|Revisi/i });
  if (await fila.count()) await fila.first().getByRole('button', { name: /Editar|Ver/ }).first().click();
  else await p.locator('main').getByText(/N°\s*2|#2/).first().click();
  await p.waitForTimeout(2000);
  const nomina = () => (leerFila(st, 'nominas_osiris')?.nominas || []).find(x => x.id === 'NOMR');
  const devolver = p.getByRole('button', { name: /Devolver con comentarios/ }).first();
  const base = { esc: escrituras(st, 'nominas_osiris'), estado: nomina()?.estado, hist: (nomina()?.historial || []).length };
  check('Nómina de partida con V°B° (aprobada1)', base.estado === 'aprobada1', base.estado);

  // Cancelar, Esc y la «×»: ninguno escribe ni cambia el estado.
  for (const [modo, cerrar] of [
    ['Cancelar', () => dlg(p).getByRole('button', { name: 'Cancelar', exact: true }).click()],
    ['Esc', () => p.keyboard.press('Escape')],
    ['× (cerrar)', () => dlg(p).getByRole('button', { name: 'Cerrar' }).click()],
  ]) {
    await devolver.click(); await p.waitForTimeout(400);
    const abierto = await dlg(p).count();
    await dlg(p).locator('textarea').fill('texto que no debe guardarse');
    await cerrar(); await p.waitForTimeout(1500);
    const n = nomina();
    check(`Devolver · ${modo}: cierra el diálogo sin escribir ni cambiar el estado`,
      abierto === 1 && (await dlg(p).count()) === 0 && escrituras(st, 'nominas_osiris') === base.esc && n?.estado === 'aprobada1' && (n?.historial || []).length === base.hist,
      `escrituras ${escrituras(st, 'nominas_osiris') - base.esc} · ${n?.estado}`);
  }
  check('Devolver: cancelar no muestra avisos ni diálogos del navegador', s.nativos.length === 0, s.nativos.join(' | '));

  // Validación del motivo.
  await devolver.click(); await p.waitForTimeout(400);
  const ac = p.getByTestId('dialogo-aceptar');
  check('Motivo vacío: «Devolver» deshabilitado', await ac.isDisabled());
  await dlg(p).locator('textarea').fill('   ');
  check('Motivo con solo espacios: «Devolver» deshabilitado', await ac.isDisabled());
  await dlg(p).locator('textarea').press('Enter'); await p.waitForTimeout(300);
  check('Enter en el campo no confirma un motivo vacío', (await dlg(p).count()) === 1 && nomina()?.estado === 'aprobada1');

  // Segunda solicitud mientras hay una abierta: se responde como cancelar (no abre otra ni ejecuta).
  const segunda = await p.evaluate(async () => {
    // El botón de fondo queda tapado por el modal: se dispara su acción por programa.
    const b = [...document.querySelectorAll('button')].find(x => /Devolver con comentarios/.test(x.innerText));
    b.click(); await new Promise(r => setTimeout(r, 300));
    return document.querySelectorAll('[data-testid="dialogo-app"]').length;
  });
  check('Una segunda solicitud con el diálogo abierto no abre otro', segunda === 1, `${segunda} diálogos`);

  // Aceptar con doble clic: una sola devolución.
  await dlg(p).locator('textarea').fill('Falta respaldo de la línea 2 (prueba)');
  await ac.dblclick(); await p.waitForTimeout(3000);
  const n = nomina();
  const devs = (n?.historial || []).filter(h => /devoluci/i.test(JSON.stringify(h)));
  check('Aceptar (doble clic): la nómina vuelve a «revision» con el motivo', n?.estado === 'revision' && /línea 2/.test(n?.ultimaDevolucion?.motivo || ''), `${n?.estado}`);
  check('Aceptar (doble clic): UNA sola entrada de devolución en el historial', devs.length === 1, `${devs.length}`);
  check('Aceptar (doble clic): una sola escritura de la nómina', escrituras(st, 'nominas_osiris') - base.esc === 1, `${escrituras(st, 'nominas_osiris') - base.esc}`);
  check('Nómina: sin errores de página ni diálogos del navegador', !s.errores.length && !s.nativos.length, [...s.errores, ...s.nativos].join(' | '));
  await p.screenshot({ path: `${OUT}/nomina-tras-devolver.png` });
  await s.ctx.close();
}

// ── B. Créditos: anular crédito (aceptar, cancelar, y dato cambiado durante la espera) ──
{
  const s = await sesion();
  const { page: p, st } = s;
  await p.getByTestId('nav-modulo-finanzas').click(); await p.waitForTimeout(4000);
  await pulsar(p, '💳 Créditos');
  const fin = () => leerFila(st, 'finanzas');
  const anular = () => p.locator('main').getByRole('button', { name: 'Anular', exact: true });
  const nAntes = await anular().count();
  check('Créditos: hay créditos anulables en los datos de prueba', nAntes >= 2, `${nAntes}`);
  const textoDlg = async () => (await dlg(p).innerText()).replace(/\s+/g, ' ');

  // Cancelar.
  const escF0 = escrituras(st, 'finanzas');
  await anular().first().click(); await p.waitForTimeout(400);
  await dlg(p).locator('textarea').fill('no debe guardarse');
  await dlg(p).getByRole('button', { name: 'Cancelar', exact: true }).click(); await p.waitForTimeout(2000);
  check('Anular crédito · Cancelar: no escribe y el crédito sigue activo', escrituras(st, 'finanzas') === escF0 && (await anular().count()) === nAntes, `escrituras ${escrituras(st, 'finanzas') - escF0}`);

  // Aceptar sin cambios externos.
  await anular().first().click(); await p.waitForTimeout(400);
  const t1 = await textoDlg();
  check('Anular crédito: motivo obligatorio', await p.getByTestId('dialogo-aceptar').isDisabled());
  await dlg(p).locator('textarea').fill('Crédito duplicado (prueba)');
  await p.getByTestId('dialogo-aceptar').click(); await p.waitForTimeout(3000);
  const acr1 = (t1.match(/Anular el crédito (.+?) \(/) || [])[1];
  const c1 = (fin()?.creditos_data || []).find(c => c.anulado && c.motivoAnulacion === 'Crédito duplicado (prueba)');
  check('Anular crédito · Aceptar: queda anulado con el motivo (una escritura)', !!c1 && (await anular().count()) === nAntes - 1, `${acr1} · ${c1 ? 'anulado' : 'no anulado'}`);

  // Dato cambiado mientras se espera: otra sesión edita ESE crédito por realtime.
  await anular().first().click(); await p.waitForTimeout(400);
  const t2 = await textoDlg();
  const acr2 = (t2.match(/Anular el crédito (.+?) \(/) || [])[1];
  await dlg(p).locator('textarea').fill('Motivo escrito con datos viejos');
  const v = JSON.parse(JSON.stringify(fin()));
  const obj = (v.creditos_data || []).find(c => !c.anulado && c.acreedor === acr2);
  check('Crédito objetivo encontrado en el servidor falso', !!obj, acr2);
  if (obj) obj.nota = 'Modificado por otra sesión durante el diálogo';
  const escF1 = escrituras(st, 'finanzas');
  const n = s.empujar('finanzas', v); await p.waitForTimeout(1500);
  check('Realtime simulado conectado', n > 0, `${n} sockets`);
  await p.getByTestId('dialogo-aceptar').click(); await p.waitForTimeout(1500);
  const aviso = await dlg(p).count() ? await textoDlg() : '';
  check('Dato cambiado durante la espera: avisa y NO aplica', /cambió mientras respondías/.test(aviso), aviso.slice(0, 90));
  await p.screenshot({ path: `${OUT}/creditos-datos-actualizados.png` });
  if (await dlg(p).count()) await p.getByTestId('dialogo-aceptar').click();
  await p.waitForTimeout(2000);
  const c2 = (fin()?.creditos_data || []).find(c => c.acreedor === acr2 && c.nota === 'Modificado por otra sesión durante el diálogo');
  check('Dato cambiado: el crédito conserva el cambio de la otra sesión y no queda anulado', !!c2 && !c2.anulado && escrituras(st, 'finanzas') === escF1,
    `${c2 ? (c2.anulado ? 'anulado' : 'activo') : 'cambio perdido'} · escrituras ${escrituras(st, 'finanzas') - escF1}`);
  check('Créditos: sin errores de página ni diálogos del navegador', !s.errores.length && !s.nativos.length, [...s.errores, ...s.nativos].join(' | '));
  await s.ctx.close();
}

// ── C. Límite de error: un módulo que falla no tumba la app ni afirma que se guardó ──
{
  // Contabilidad recibe un objeto donde espera una lista (fallo de datos simulado).
  const s = await sesion({ tablasOtras: '{}' });
  const { page: p } = s;
  await p.getByTestId('nav-modulo-contabilidad').click(); await p.waitForTimeout(3500);
  const err = p.getByTestId('modulo-error');
  if (!(await err.count())) {
    check('Límite de error: el fallo simulado no se produjo (Contabilidad tolera el dato)', false, 'no se pudo provocar el error');
  } else {
    const t = (await err.innerText()).replace(/\s+/g, ' ');
    await p.screenshot({ path: `${OUT}/limite-error.png` });
    check('Límite de error: aviso dentro del marco, con la navegación visible', (await p.getByTestId('nav-lateral').count()) === 1, t.slice(0, 80));
    check('Límite de error: no afirma que algo se guardó', !/se guard[óo] (todo|correctamente)|cambios guardados|guardado ✓|no se guardó nada/i.test(t) && /puede no haberse registrado/.test(t), t.slice(0, 160));
    await p.getByTestId('nav-modulo-finanzas').click(); await p.waitForTimeout(3500);
    check('Límite de error: se puede ir a otro módulo desde la navegación', (await p.getByTestId('modulo-error').count()) === 0 && (await p.locator('main').getByRole('button', { name: '📋 Nóminas', exact: true }).count()) === 1);
    await p.getByTestId('nav-modulo-contabilidad').click(); await p.waitForTimeout(2500);
    await p.getByTestId('modulo-error').getByRole('button', { name: 'Volver al inicio' }).click(); await p.waitForTimeout(1500);
    check('Límite de error: «Volver al inicio» lleva al inicio', (await p.getByTestId('modulo-error').count()) === 0 && (await p.getByTestId('nav-inicio').getAttribute('aria-current')) === 'page');
  }
  await s.ctx.close();
}

await browser.close();
console.log(`\n${ok} correctas, ${fallos} fallas · diálogos de la app (sin modo nativo) · Chromium emulado · datos ficticios`);
process.exit(fallos ? 1 : 0);
