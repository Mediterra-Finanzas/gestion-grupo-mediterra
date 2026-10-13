/* ─────────────────────────────────────────────────────────────────────────
   E2E — Finanzas: un borrador en conflicto NO se pierde al salir y volver.
   Dos sesiones (dos contextos de navegador) sobre el MISMO Supabase falso.

     CI=true npx react-scripts build; (cd build && python3 -m http.server 4173 --bind 127.0.0.1 &)
     OUT_DIR=/tmp/borrador node scripts/e2e/conflicto-borrador.mjs

   Recorrido (se repite para cada salida):
     1. A y B abren Parámetros de Allegria Foods (misma versión de la fila).
     2. B cambia «KG a exportar» y se guarda.
     3. A cambia «FOB US$/kg» → conflicto: no se escribe, aparece el panel.
     4. A sale al Hub y vuelve a Finanzas: ve SU borrador (FOB de A), el panel
        «al volver» y la fila sigue bloqueada; no hubo ninguna escritura.
     5. «Comparar versiones» muestra las dos diferencias (kg y FOB).
     6. Salida: (a) cancelar el «Descartar» no cambia nada; (b) descartar
        expresamente carga lo de B; (c) guardar el borrador reemplaza con
        confirmación. En ningún momento una versión desaparece sin decisión.
   ───────────────────────────────────────────────────────────────────────── */
import fs from 'fs';
import { chromium } from '/home/user/gestion-grupo-mediterra/node_modules/playwright/index.mjs';
import { nuevoStore, leerFila, instalarFake } from './fake.mjs';
import { BASE, login, entrarFinanzas, irAFlujoEmpresas, elegirEmpresa, subTab, ponerNumero, inputTras } from './lib.mjs';

const OUT = process.env.OUT_DIR || '/tmp/borrador';
fs.mkdirSync(OUT, { recursive: true });
let ok = 0, fallos = 0;
const check = (n, c, x = '') => { c ? ok++ : fallos++; console.log(`${c ? '✓' : '✗ FALLA'}  ${n}${x ? '  — ' + x : ''}`); };
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });

const fruta = (st) => leerFila(st, 'finanzas')?.allegria_params?.['2026-2027']?.cerezas || {};
const escrFin = (st) => (st.__escrituras || []).filter(e => e.id === 'finanzas').length;
const num = (s) => Number(String(s).replace(/\./g, '').replace(',', '.'));

async function sesion(st, nombre) {
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  await instalarFake(ctx, st);
  const page = await ctx.newPage();
  const errores = []; page.on('pageerror', e => errores.push(String(e).slice(0, 160)));
  const dialogos = []; let respuesta = true;
  page.on('dialog', async d => { dialogos.push(d.message().slice(0, 80)); respuesta ? await d.accept() : await d.dismiss(); });
  await login(page);
  return { ctx, page, errores, dialogos, responder: (v) => { respuesta = v; }, nombre };
}
async function aParametros(p) {
  await entrarFinanzas(p); await irAFlujoEmpresas(p); await elegirEmpresa(p, 'Allegria Foods');
  await subTab(p, /Parámetros/);
  const t = p.getByRole('button', { name: 'Temporada 2026-2027' }); if (await t.count()) await t.first().click();
  await p.waitForTimeout(800);
}
const valorCampo = async (p, etiqueta) => num(await inputTras(p, etiqueta).inputValue());

async function escenario(salida) {
  console.log(`\n═══ salida: ${salida} ═══`);
  const st = nuevoStore();
  const A = await sesion(st, 'A'), B = await sesion(st, 'B');
  await aParametros(A.page); await aParametros(B.page);
  const kg0 = fruta(st).kg, fob0 = fruta(st).fob_usd_kg;
  const KG_B = 2345678, FOB_A = 0.987;

  await ponerNumero(B.page, 'KG a exportar', KG_B); await B.page.waitForTimeout(2500);
  check('B guardó su cambio (kg en el servidor)', fruta(st).kg === KG_B, `kg ${fruta(st).kg}`);

  const escAntesA = escrFin(st);
  await ponerNumero(A.page, 'FOB US$/kg', FOB_A); await A.page.waitForTimeout(2500);
  const panel = A.page.getByTestId('conflicto-panel');
  check('A choca: aparece el panel de conflicto', (await panel.count()) === 1);
  check('A no escribió: el servidor conserva lo de B y el FOB original', fruta(st).kg === KG_B && fruta(st).fob_usd_kg === fob0,
    `kg ${fruta(st).kg} · fob ${fruta(st).fob_usd_kg}`);

  // Salir al Hub con el conflicto pendiente (permitido) y volver
  const escAlSalir = escrFin(st);
  await A.page.getByRole('button', { name: 'Mediterra', exact: true }).first().click(); await A.page.waitForTimeout(2000);
  check('A puede salir al Hub con el conflicto pendiente', (await A.page.getByRole('button', { name: /Flujo de Caja Grupo Mediterra/ }).count()) > 0);
  await entrarFinanzas(A.page); await A.page.waitForTimeout(3000);
  check('al volver: panel «tienes un borrador sin guardar» (no se recargó encima)', (await A.page.getByTestId('conflicto-al-volver').count()) === 1);
  await A.page.screenshot({ path: `${OUT}/${salida}-1-al-volver.png` });
  if (await A.page.getByTestId('conflicto-minimizar').count()) { await A.page.getByTestId('conflicto-minimizar').click(); await A.page.waitForTimeout(300); }
  await irAFlujoEmpresas(A.page); await elegirEmpresa(A.page, 'Allegria Foods'); await subTab(A.page, /Parámetros/);
  { const t = A.page.getByRole('button', { name: 'Temporada 2026-2027' }); if (await t.count()) await t.first().click(); }
  await A.page.waitForTimeout(800);
  check('al volver: la pantalla muestra el borrador de A (FOB de A, kg de A)',
    await valorCampo(A.page, 'FOB US$/kg') === FOB_A && await valorCampo(A.page, 'KG a exportar') === kg0,
    `fob ${await valorCampo(A.page, 'FOB US$/kg')} · kg ${await valorCampo(A.page, 'KG a exportar')}`);
  // Una edición más mientras está pendiente: tampoco se escribe
  await ponerNumero(A.page, 'Desc. exportadora', 3); await A.page.waitForTimeout(2500);
  check('salir, volver y seguir editando con el conflicto pendiente: 0 escrituras de finanzas',
    escrFin(st) === escAntesA && escAlSalir === escAntesA /* el falso solo registra escrituras APLICADAS */, `escrituras aplicadas ${escrFin(st) - escAntesA} desde el cambio de A`);
  check('el servidor sigue con lo de B', fruta(st).kg === KG_B && fruta(st).fob_usd_kg === fob0);

  if (process.env.SOLO_HASTA_VOLVER) { await A.ctx.close(); await B.ctx.close(); return; }
  await A.page.getByTestId('conflicto-banner').getByRole('button', { name: 'Resolver' }).click(); await A.page.waitForTimeout(300);
  await A.page.getByTestId('conflicto-comparar').click(); await A.page.waitForTimeout(300);
  const comp = await A.page.getByTestId('conflicto-comparacion').innerText();
  check('comparar: muestra kg (servidor = B) y FOB (tuyo = A)', /kg: tuyo [\d.]+ · servidor 2345678/.test(comp) && /fob_usd_kg: tuyo 0\.987/.test(comp),
    comp.replace(/\s+/g, ' ').slice(0, 220));
  await A.page.screenshot({ path: `${OUT}/${salida}-2-comparar.png` });

  if (salida === 'cancelar') {
    A.responder(false);
    await A.page.getByTestId('conflicto-descartar').click(); await A.page.waitForTimeout(1500);
    check('cancelar «Descartar»: el borrador sigue, el panel sigue, nada se escribe', (await A.page.getByTestId('conflicto-panel').count()) === 1
      && fruta(st).kg === KG_B && await valorCampo(A.page, 'FOB US$/kg') === FOB_A);
    A.responder(false);
    await A.page.getByTestId('conflicto-conservar').click(); await A.page.waitForTimeout(1500);
    check('cancelar «Guardar mi borrador»: nada se escribe', fruta(st).kg === KG_B && fruta(st).fob_usd_kg === fob0 && (await A.page.getByTestId('conflicto-panel').count()) === 1);
  }
  if (salida === 'descartar') {
    A.responder(true);
    await A.page.getByTestId('conflicto-descartar').click(); await A.page.waitForTimeout(2500);
    check('descartar pide confirmación explícita', A.dialogos.some(d => /Descartar tu borrador/.test(d)));
    check('descartar: A ve lo de B y el panel desaparece', (await A.page.getByTestId('conflicto-panel').count()) === 0
      && await valorCampo(A.page, 'KG a exportar') === KG_B && await valorCampo(A.page, 'FOB US$/kg') === fob0);
    check('descartar: el servidor no cambió', fruta(st).kg === KG_B && fruta(st).fob_usd_kg === fob0);
    await ponerNumero(A.page, 'Servicios US$/kg', 0.111); await A.page.waitForTimeout(2500);
    check('después de descartar, A vuelve a guardar normal (sobre la versión de B)', fruta(st).srv_usd_kg === 0.111 && fruta(st).kg === KG_B);
  }
  if (salida === 'conservar') {
    A.responder(true);
    await A.page.getByTestId('conflicto-conservar').click(); await A.page.waitForTimeout(3000);
    check('guardar el borrador pide confirmación y dice qué se reemplaza', A.dialogos.some(d => /Guardar tu borrador sobre la versión vigente/.test(d)));
    check('guardar el borrador: el servidor tiene la versión de A (FOB y desc. de A), el panel desaparece',
      fruta(st).fob_usd_kg === FOB_A && fruta(st).desc_exp_pct === 3 && fruta(st).kg === kg0 && (await A.page.getByTestId('conflicto-panel').count()) === 0,
      `kg ${fruta(st).kg} · fob ${fruta(st).fob_usd_kg} · desc ${fruta(st).desc_exp_pct}`);
    // B, sin cambios pendientes, adopta lo vigente al recargar Finanzas
    await B.page.getByRole('button', { name: 'Mediterra', exact: true }).first().click(); await B.page.waitForTimeout(1000);
    await aParametros(B.page);
    check('B ve la versión que se decidió guardar', await valorCampo(B.page, 'FOB US$/kg') === FOB_A);
  }
  check(`sin errores de página (${salida})`, !A.errores.length && !B.errores.length, [...A.errores, ...B.errores].join(' | '));
  await A.ctx.close(); await B.ctx.close();
}

for (const s of (process.env.SALIDAS || 'cancelar,descartar,conservar').split(',')) await escenario(s);
await browser.close();
console.log(`\n${ok} correctas, ${fallos} fallas · Chromium emulado · datos ficticios · ${BASE}`);
process.exit(fallos ? 1 : 0);
