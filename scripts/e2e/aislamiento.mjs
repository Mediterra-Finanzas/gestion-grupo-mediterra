/* Verifica dos cosas en el navegador real, con la app real y un Supabase falso:

   1) AISLAMIENTO: que ninguna llamada a Supabase salga del navegador. Cuenta las
      peticiones que el navegador dirige al host de producción y las compara con
      las que el falso respondió; además intercepta cualquier petición que NO haya
      sido atendida por el falso.

   2) ABRIR NO ESCRIBE: cuántas ESCRITURAS produce abrir la app y navegar sin
      editar nada, fila por fila. `applyData` de FinanzasModule re-defaultea el
      blob al cargarlo, así que lo que se escribía no era igual a lo que se leyó y
      el guardia canónico del contrato no podía suprimirlo: abrir Finanzas dejaba
      un PATCH de ~4,4 MB sin que nadie tocara nada. Acá se exige 0.

   Resultado esperado, declarado y no fotografiado:
     finanzas            0 escrituras   (el blob del flujo: ~4,4 MB)
     finanzas_bancos     0 escrituras   (la fila ya está poblada en el store → no
                                         corresponde migrar desde el blob)
     finanzas_esc_index  0 escrituras
     finanzas_esc_*      0 escrituras
   Las filas de App.jsx (`main`, `usuarios`, `pins`) se listan aparte y NO hacen
   fallar esta prueba: son de otro módulo y se trabajan por separado.
*/
import { nuevoStore, instalarFake } from './fake.mjs';
import { abrirApp, login, entrarFinanzas, irAFlujoEmpresas, elegirEmpresa, subTab } from './lib.mjs';

// Filas cuyas escrituras al abrir SÍ hacen fallar la prueba, con el máximo
// admitido. Abrir el módulo no es una edición.
const LIMITE = { finanzas: 0, finanzas_bancos: 0, finanzas_esc_index: 0 };
const esEscenario = (id) => /^finanzas_esc_/.test(id || '');
// Filas de App.jsx: se informan, no se exigen (las trabaja otro agente).
const AJENAS = new Set(['main', 'usuarios', 'pins', 'audit_log']);

const store = nuevoStore();
let atendidas = 0;
const { browser, ctx, page } = await abrirApp(store, { log: () => { atendidas++; } });

const pedidas = [];
const escrituras = [];   // {metodo, id}
const escapadas = [];

function idDePeticion(r) {
  const u = new URL(r.url());
  const m = /id=eq\.([^&]+)/.exec(u.search);
  if (m) return decodeURIComponent(m[1]);
  // POST (upsert) lleva el id en el cuerpo
  try { const b = JSON.parse(r.postData() || 'null'); if (b && b.id) return String(b.id); } catch (_) {}
  return '(sin id)';
}

page.on('request', r => {
  const u = r.url();
  if (!u.includes('bywovqayuzodbzwsriet.supabase.co')) return;
  pedidas.push(`${r.method()} ${u.slice(0, 90)}`);
  if (r.method() !== 'GET') escrituras.push({ metodo: r.method(), id: idDePeticion(r) });
});
page.on('requestfinished', async r => {
  const u = r.url();
  if (!u.includes('bywovqayuzodbzwsriet.supabase.co')) return;
  const resp = await r.response().catch(() => null);
  const via = resp ? (await resp.headerValue('access-control-allow-origin').catch(() => null)) : null;
  // el falso siempre responde con este header; si falta, la respuesta vino de la red
  if (via !== '*') escapadas.push(`${r.method()} ${u.slice(0, 90)}`);
});

// Recorrido de SOLO LECTURA: entrar, mirar, no tocar nada.
await login(page);
await entrarFinanzas(page);
await irAFlujoEmpresas(page);
await elegirEmpresa(page, 'Allegria Foods');
await subTab(page, /Parámetros/);
// Más que el debounce del auto-save (800 ms) para que, si hubiera una escritura
// agendada, ya haya salido.
await page.waitForTimeout(3000);

console.log(`peticiones del navegador a supabase: ${pedidas.length}`);
console.log(`respondidas por el falso:            ${atendidas}`);
console.log(`escapadas a la red real:             ${escapadas.length}`);
if (escapadas.length) escapadas.forEach(e => console.log('   ⚠', e));
console.log(pedidas.map(p => '   ' + p).join('\n'));

// ── Escrituras al abrir, por fila ───────────────────────────────────────────
const porFila = {};
escrituras.forEach(e => { porFila[e.id] = (porFila[e.id] || 0) + 1; });
const ids = Object.keys(porFila).sort();
console.log('\n── Escrituras producidas por ABRIR y navegar, sin editar nada ──');
if (!ids.length) console.log('   (ninguna)');
ids.forEach(id => {
  const n = porFila[id];
  const propia = !AJENAS.has(id);
  const limite = esEscenario(id) ? 0 : LIMITE[id];
  const etiqueta = propia
    ? (limite === undefined ? 'informativo' : `esperado ${limite}`)
    : 'informativo · fila de App.jsx, se trabaja aparte';
  console.log(`   ${id.padEnd(20)} ${String(n).padStart(2)}   ${etiqueta}`);
});

const fallas = [];
Object.entries(LIMITE).forEach(([id, max]) => {
  const n = porFila[id] || 0;
  if (n > max) fallas.push(`${id}: ${n} escritura(s) al abrir, se esperaban ${max}`);
});
ids.filter(esEscenario).forEach(id => {
  if (porFila[id] > 0) fallas.push(`${id}: ${porFila[id]} escritura(s) al abrir, se esperaban 0`);
});

console.log('');
Object.keys(LIMITE).forEach(id => {
  console.log(`   ${porFila[id] ? '✗' : '✓'} ${id}: ${porFila[id] || 0} escrituras (esperado ${LIMITE[id]})`);
});
if (fallas.length) { console.log('\n⚠ ABRIR ESCRIBE:'); fallas.forEach(f => console.log('   ⚠', f)); }

await browser.close();
process.exit((escapadas.length || fallas.length) ? 1 : 0);
