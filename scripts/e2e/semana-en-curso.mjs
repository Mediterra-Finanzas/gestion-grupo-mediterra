/* ─────────────────────────────────────────────────────────────────────────
   SEMANA EN CURSO — fin de mes y domingos, en HORARIO DE CHILE (oct-2026).
   App real, Supabase falso aislado, DATOS SINTÉTICOS, reloj controlado y
   navegador con zona horaria America/Santiago.

   Antes: la semana en curso se calculaba con la hora del reloj (desde el
   domingo a mediodía saltaba a la semana siguiente) y, si la semana ISO del
   día no estaba entre las 4 del mes (Oct 26-31 es la S44, que el flujo pone en
   noviembre), quedaba en la 1ª semana del mes: el saldo semanal trataba como
   futuras semanas ya pasadas y no marcaba el atrasado.

   Datos: Arriendo Camionetas con 100 / 200 / 300 / 400 cargados en S40..S43
   de octubre. En cada instante se comprueba la columna donde arranca el saldo
   (saldo banco) y el atrasado (semanas anteriores, pendiente).
   ───────────────────────────────────────────────────────────────────────── */
import fs from 'fs';
import { nuevoStore, leerFila } from './fake.mjs';
import { abrirApp, login, entrarFinanzas, irAFlujoEmpresas, elegirEmpresa, subTab, num } from './lib.mjs';

const OUT = process.env.OUT_DIR || '.';
fs.mkdirSync(OUT, { recursive: true });
let fallos = 0;
const check = (n, c, e = '') => { console.log(`${c ? '✓' : '✗ FALLA'}  ${n}${e ? '  — ' + e : ''}`); if (!c) fallos++; };
const EMP = 'Allegria Foods';

const CASOS = [
  { nombre: 'martes 13-10 12:00', t: '2026-10-13T12:00:00-03:00', col: 'S42', atrasado: -300 },
  { nombre: 'domingo 18-10 09:00', t: '2026-10-18T09:00:00-03:00', col: 'S42', atrasado: -300 },
  { nombre: 'domingo 18-10 15:00 (antes saltaba a S43)', t: '2026-10-18T15:00:00-03:00', col: 'S42', atrasado: -300 },
  { nombre: 'jueves 29-10 12:00 (S44 ISO: fin de mes)', t: '2026-10-29T12:00:00-03:00', col: 'S43', atrasado: -600 },
  { nombre: 'sábado 31-10 23:30 Chile (en UTC ya es 1-11)', t: '2026-10-31T23:30:00-03:00', col: 'S43', atrasado: -600 },
];

for (const caso of CASOS) {
  console.log(`\n=== ${caso.nombre} ===`);
  const store = nuevoStore();
  const fin = leerFila(store, 'finanzas');
  fin.finanzas_real = { [EMP]: { _proyOverrides: {
    'egr_fijo::Arriendo Camionetas': { 6: { _sem0: 100, _sem1: 200, _sem2: 300, _sem3: 400 } },
  } } };
  store.finanzas.value = fin;
  const { browser, ctx, page } = await abrirApp(store, { ctxOpts: { timezoneId: 'America/Santiago' } });
  await ctx.clock.install({ time: new Date(caso.t) });
  const errores = [];
  page.on('pageerror', e => errores.push(String(e)));
  page.on('dialog', d => d.accept().catch(() => {}));
  await login(page);
  await entrarFinanzas(page).catch(() => {});
  await irAFlujoEmpresas(page);
  await elegirEmpresa(page, EMP);
  await subTab(page, /Flujo de Caja/);
  await page.waitForTimeout(1200);
  await page.getByRole('button', { name: /📊 Semanal/ }).first().click();
  await page.waitForTimeout(1200);
  const r = await page.evaluate(() => {
    const zona = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const hoy = new Date();
    const cabecera = (td) => {
      const t = td.closest('table'); const q = td.getBoundingClientRect(); const cx = q.left + q.width / 2;
      const th = [...t.querySelectorAll('thead th')].filter(x => /^S\d{2}$/.test(x.innerText.trim())).find(x => { const b = x.getBoundingClientRect(); return b.left <= cx && cx <= b.right; });
      return th ? th.innerText.trim() : null;
    };
    const banco = document.querySelector('[data-testid="flujo-saldo-banco"]');
    let atr = null, colAtr = null;
    for (const tr of document.querySelectorAll('tbody tr')) {
      if (!tr.cells[0] || !tr.cells[0].innerText.includes('· atrasado')) continue;
      for (const td of [...tr.cells].slice(1)) { const v = td.innerText.trim(); if (v && v !== '—') { atr = v; colAtr = cabecera(td); } }
    }
    return { zona, fechaLocal: `${hoy.getFullYear()}-${hoy.getMonth() + 1}-${hoy.getDate()} ${hoy.getHours()}h`,
             colBanco: banco ? cabecera(banco) : null, atr, colAtr };
  });
  check(`zona horaria del navegador = America/Santiago (${r.fechaLocal})`, r.zona === 'America/Santiago', r.zona);
  check(`la semana en curso (saldo banco) es ${caso.col}`, r.colBanco === caso.col, `${r.colBanco}`);
  check(`atrasado ${caso.atrasado} en ${caso.col}`, r.colAtr === caso.col && num(r.atr) === caso.atrasado, `${r.atr} en ${r.colAtr}`);
  check('sin errores de JavaScript', errores.length === 0, errores.slice(0, 2).join(' | '));
  await browser.close();
}
console.log(fallos ? `\n✗ ${fallos} falla(s)` : '\n✓ todo OK');
process.exit(fallos ? 1 : 0);
