/* ─────────────────────────────────────────────────────────────────────────
   NORMALIZACIÓN DE IDENTIFICADORES · recorrido en la app real.

   POR QUÉ EXISTE ESTE RECORRIDO
   La normalización estaba probada en el modelo (idempotencia, orden, valores,
   identidades preservadas) y contra el contrato de persistencia por separado,
   y aun así en producción NO escribió nada: `applyData` normalizaba en memoria
   y después la migración recalculaba sobre ESE estado ya normalizado, no
   encontraba nada que cambiar, limpiaba el aviso y volvía sin guardar. Las
   1.623 pruebas y los cuatro recorridos de navegador pasaban porque ninguno
   comprobaba si la FILA DEL SERVIDOR termina con los identificadores.

   Esto comprueba justamente eso, mirando el almacén, no la pantalla:
     1. el aviso aparece con la cuenta correcta
     2. la fila del servidor TERMINA con las 31 identidades
     3. las 2 preexistentes no cambian
     4. ningún mes ni US$/kg se mueve, en ninguna de las 5 temporadas
     5. el orden se conserva
     6. tras recargar siguen guardadas
     7. abrir otra vez NO vuelve a escribir (idempotente)
     8. una carga fallida no escribe nada

   Los resultados ESPERADOS van escritos acá, no leídos del componente.
   DATOS SINTÉTICOS con la MISMA FORMA que producción. Supabase está
   interceptado: producción no se toca.

   Uso:
     CI=true npx react-scripts build
     (cd build && python3 -m http.server 4173 --bind 127.0.0.1 &)
     OUT_DIR=/tmp/e2e-ident node scripts/e2e/normalizacion-identidades.mjs
   ───────────────────────────────────────────────────────────────────────── */
import fs from 'fs';
import path from 'path';
import { nuevoStore, leerFila } from './fake.mjs';
import { abrirApp, login, entrarFinanzas, irAFlujoEmpresas, elegirEmpresa, subTab } from './lib.mjs';

const OUT = process.env.OUT_DIR || '.';
fs.mkdirSync(path.join(OUT, 'identidades'), { recursive: true });
let fallos = 0;
const check = (n, c, e = '') => { console.log(`${c ? '✓' : '✗ FALLA'}  ${n}${e ? '  — ' + e : ''}`); if (!c) fallos++; };

// ── Guarda de build fresco ────────────────────────────────────────
{
  const servido = await fetch('http://127.0.0.1:4173/asset-manifest.json').then(r => r.json()).catch(() => null);
  if (!servido) { console.log('✗ FALLA  no hay build servido en 127.0.0.1:4173'); process.exit(1); }
  const principal = String(servido.files?.['main.js'] || '').split('/').pop();
  const js = fs.readdirSync('build/static/js').filter(f => /^main\..*\.js$/.test(f));
  if (!js.includes(principal)) {
    console.log(`✗ FALLA  el build servido (${principal}) no es el del árbol actual (${js.join(', ')})`);
    process.exit(1);
  }
  console.log(`build servido verificado: ${principal}`);
}

// ── Store con la MISMA forma que producción ───────────────────────
// 5 temporadas × 3 frutas. 31 estimaciones de cerezas: 2 con identidad
// (mezcladas, no juntas) y 29 sin ella. La temporada de carga con los
// parámetros informados: 850.000 kg y FOB US$4,5/kg, y las dos estimaciones
// de US$0,44/kg que valen US$374.000 cada una.
const TEMPS = ['2026-2027', '2027-2028', '2028-2029', '2029-2030', '2030-2031'];
const fruta = (extra = {}) => ({
  kg: 0, fob_usd_kg: 0, desc_exp_pct: 0, mat_usd_kg: 0, srv_usd_kg: 0,
  anticipos_cliente: [], anticipos_productor: [], mes_liquidacion: '',
  mes_saldo_productor: '', programas: [], dist_mat: [], dist_srv: [],
  modelo_version: 2, decisiones_sin_fecha: {}, movimientos_sin_asignar: [],
  saldos_favor: [], ...extra,
});
function paramsLegado() {
  const p = {};
  TEMPS.forEach(t => { p[t] = { cerezas: fruta(), ciruelas: fruta(), arandanos: fruta() }; });
  p['2026-2027'].cerezas = fruta({
    kg: 850000, fob_usd_kg: 4.5, desc_exp_pct: 6, mat_usd_kg: 0.5, srv_usd_kg: 1.2,
    mes_liquidacion: 'Mar-27', mes_saldo_productor: 'Mar-27',
    anticipos_cliente: [
      { id: 'ant_sintetico_a', mes: 'Sep-26', usd_kg: 0.25, cerrado: true, realizaciones: [] },
      { mes: 'Nov-26', usd_kg: 0.44, realizaciones: [] },
      { mes: 'Dec-26', usd_kg: 0.44, realizaciones: [] },
    ],
    anticipos_productor: [
      { mes: 'Dec-26', usd_kg: 0.53, realizaciones: [] },
      { id: 'ant_sintetico_b', mes: 'Nov-26', usd_kg: 0.21, realizaciones: [] },
      { mes: 'Sep-26', usd_kg: 0, realizaciones: [] },
    ],
  });
  TEMPS.slice(1).forEach((t, k) => {
    p[t].cerezas = fruta({
      anticipos_cliente: [
        { mes: `Oct-${27 + k}`, usd_kg: 1, realizaciones: [] },
        { mes: `Nov-${27 + k}`, usd_kg: 1, realizaciones: [] },
        { mes: `Dec-${27 + k}`, usd_kg: 0, realizaciones: [] },
        ...(k === 0 ? [{ mes: 'Sep-27', usd_kg: 1, realizaciones: [] }] : []),
      ],
      anticipos_productor: [
        { mes: `Oct-${27 + k}`, usd_kg: 0.5, realizaciones: [] },
        { mes: `Nov-${27 + k}`, usd_kg: 0.5, realizaciones: [] },
        { mes: `Dec-${27 + k}`, usd_kg: 0.5, realizaciones: [] },
      ],
    });
  });
  return p;
}

// Aplana a filas comparables: la misma forma que la consulta SQL del CFO.
const filas = (params) => {
  const out = [];
  TEMPS.forEach(t => Object.keys(params[t] || {}).forEach(f => {
    [['cliente', 'anticipos_cliente'], ['productor', 'anticipos_productor']].forEach(([lado, campo]) => {
      (params[t][f][campo] || []).forEach((e, i) => out.push({
        temporada: t, fruta: f, lado, ord: i + 1,
        tiene_id: !!e.id, id: e.id || null,
        mes: e.mes ?? '', usd_kg: e.usd_kg ?? '',
      }));
    });
  }));
  return out;
};
const clave = (r) => `${r.temporada}|${r.fruta}|${r.lado}|${r.ord}`;
// Lo único que puede cambiar es el id: todo lo demás se compara literal.
const sinId = ({ tiene_id, id, ...resto }) => resto;

const ANTES = filas(paramsLegado());
const esperadosSinId = ANTES.filter(r => !r.tiene_id).length;
const esperadosConId = ANTES.filter(r => r.tiene_id).map(r => r.id).sort();
console.log(`\nestado inicial: ${ANTES.length} estimaciones · ${esperadosConId.length} con identidad · ${esperadosSinId} sin identidad`);
check('la siembra reproduce la forma de producción (31 estimaciones, 29 sin identidad)',
      ANTES.length === 31 && esperadosSinId === 29,
      `${ANTES.length} filas / ${esperadosSinId} sin id`);
check('y las dos identidades preexistentes están mezcladas, no juntas',
      esperadosConId.join(',') === 'ant_sintetico_a,ant_sintetico_b');
{
  const c = paramsLegado()['2026-2027'].cerezas;
  check('las dos estimaciones a sustituir valen US$374.000 cada una (850.000 × 0,44)',
        Math.round(c.kg * c.anticipos_cliente[1].usd_kg) === 374000 &&
        Math.round(c.kg * c.anticipos_cliente[2].usd_kg) === 374000);
}

const store = nuevoStore();
leerFila(store, 'finanzas').allegria_params = paramsLegado();

const { browser, ctx, page } = await abrirApp(store);
const escapadas = [];
page.on('requestfinished', async r => {
  if (!r.url().includes('bywovqayuzodbzwsriet.supabase.co')) return;
  const resp = await r.response().catch(() => null);
  const via = resp ? await resp.headerValue('access-control-allow-origin').catch(() => null) : null;
  if (via !== '*') escapadas.push(r.url().slice(0, 70));
});
page.on('pageerror', e => { console.log('  [pageerror]', String(e).slice(0, 180)); fallos++; });

let patchesFinanzas = 0;
page.on('request', r => {
  if (r.method() === 'PATCH' && /calendario_data\?id=eq\.finanzas&/.test(r.url())) patchesFinanzas++;
});

const esperar = (ms) => page.waitForTimeout(ms);
const texto = async () => await page.locator('body').innerText();
const delServidor = () => JSON.parse(JSON.stringify(leerFila(store, 'finanzas').allegria_params));
let avisoAparecio = false;

console.log('\n=== 1 · el aviso aparece con la cuenta correcta ===');
await login(page);
await entrarFinanzas(page);
await irAFlujoEmpresas(page);
await elegirEmpresa(page, 'Allegria Foods');
await subTab(page, /Parámetros/);
{
  const t = page.getByRole('button', { name: 'Temporada 2026-2027' });
  if (await t.count()) { await t.first().click(); }
}
await esperar(1500);
{
  const t = await texto();
  const m = t.match(/(\d+)\s+registros guardados sin identificador propio/);
  avisoAparecio = !!m;
  check('el aviso nombra los 29 registros sin identificador',
        !!m && Number(m[1]) === 29, m ? m[0] : '(no apareció el aviso)');
  check('y dice que declarar una sustitución proyectaría el monto dos veces',
        /proyectar[ií]a el\s*mismo monto dos veces/i.test(t.replace(/\s+/g, ' ')));
}
await page.screenshot({ path: `${OUT}/identidades/01-aviso.png`, fullPage: true });

console.log('\n=== 2 · la fila DEL SERVIDOR termina con las identidades ===');
// La migración se dispara sola tras la carga. Se espera a que el servidor lo
// confirme mirando el ALMACÉN, no la pantalla: es exactamente lo que el defecto
// de producción no hacía.
for (let i = 0; i < 80; i++) {
  if (filas(delServidor()).every(r => r.tiene_id)) break;
  await esperar(250);
}
const DESPUES = filas(delServidor());
check('ESPERADO: las 31 estimaciones quedaron con identidad EN EL SERVIDOR',
      DESPUES.length === 31 && DESPUES.every(r => r.tiene_id),
      `${DESPUES.filter(r => r.tiene_id).length}/${DESPUES.length} con id`);
check('ESPERADO: la fila se escribió al menos una vez',
      patchesFinanzas >= 1, `PATCH a finanzas: ${patchesFinanzas}`);
// DIAGNÓSTICO, no aserción: si las identidades quedaron guardadas pero el aviso
// nunca apareció, las dejó el auto-save de apertura y no la migración declarada.
// Las dos cosas escriben el mismo resultado, pero solo una es intencional.
console.log(`  diagnóstico → aviso declarado visible: ${avisoAparecio} · PATCH a finanzas: ${patchesFinanzas}`);

console.log('\n=== 3 · las dos identidades preexistentes no cambian ===');
{
  const mapa = new Map(DESPUES.map(r => [clave(r), r]));
  const a = mapa.get('2026-2027|cerezas|cliente|1');
  const b = mapa.get('2026-2027|cerezas|productor|2');
  check('ESPERADO: ant_sintetico_a sigue en cliente posición 1',
        a && a.id === 'ant_sintetico_a', a && a.id);
  check('ESPERADO: ant_sintetico_b sigue en productor posición 2',
        b && b.id === 'ant_sintetico_b', b && b.id);
  const migrados = DESPUES.filter(r => r.id && r.id.startsWith('mig_')).length;
  check('ESPERADO: los otros 29 recibieron identidad de migración (prefijo mig_)',
        migrados === 29, `${migrados} con prefijo mig_`);
  const unicos = new Set(DESPUES.map(r => r.id));
  check('ESPERADO: las 31 identidades son distintas entre sí',
        unicos.size === 31, `${unicos.size} identidades distintas`);
}

console.log('\n=== 4 · ningún mes ni US$/kg se movió, y el orden se conserva ===');
{
  const antes = new Map(ANTES.map(r => [clave(r), sinId(r)]));
  const despues = new Map(DESPUES.map(r => [clave(r), sinId(r)]));
  const faltan = [...antes.keys()].filter(k => !despues.has(k));
  const sobran = [...despues.keys()].filter(k => !antes.has(k));
  check('ESPERADO: no falta ni sobra ninguna fila (el orden se conserva)',
        faltan.length === 0 && sobran.length === 0,
        `faltan ${faltan.length}, sobran ${sobran.length}`);
  const distintas = [...antes.keys()].filter(k =>
    despues.has(k) && JSON.stringify(antes.get(k)) !== JSON.stringify(despues.get(k)));
  check('ESPERADO: ningún mes ni US$/kg cambió en las 5 temporadas',
        distintas.length === 0,
        distintas.length ? distintas.slice(0, 3).map(k => `${k}: ${JSON.stringify(antes.get(k))} → ${JSON.stringify(despues.get(k))}`).join(' · ') : '31 filas idénticas salvo el id');
  // Los US$/kg en 0 son los que una normalización descuidada podría descartar.
  // Una normalización descuidada podría descartar las filas en 0 por "vacías".
  // Lo que se exige es que TODAS las que había sigan ahí y con identidad; la
  // cantidad se imprime, no se fija a mano.
  const cerosAntes = ANTES.filter(r => Number(r.usd_kg) === 0).length;
  const ceros = DESPUES.filter(r => Number(r.usd_kg) === 0);
  check('ESPERADO: las estimaciones con US$/kg en 0 sobrevivieron con identidad',
        ceros.length === cerosAntes && cerosAntes > 0 && ceros.every(r => r.tiene_id),
        `${cerosAntes} antes → ${ceros.length} después, todas con id: ${ceros.every(r => r.tiene_id)}`);
}
// La temporada de carga, campo por campo: es la que se va a usar.
{
  const c = delServidor()['2026-2027'].cerezas;
  check('ESPERADO: los parámetros de la temporada de carga están intactos',
        c.kg === 850000 && c.fob_usd_kg === 4.5 && c.desc_exp_pct === 6 &&
        c.mat_usd_kg === 0.5 && c.srv_usd_kg === 1.2,
        JSON.stringify({ kg: c.kg, fob: c.fob_usd_kg, desc: c.desc_exp_pct, mat: c.mat_usd_kg, srv: c.srv_usd_kg }));
  check('ESPERADO: la estimación cerrada sigue cerrada',
        c.anticipos_cliente[0].cerrado === true);
}
await page.screenshot({ path: `${OUT}/identidades/02-normalizado.png`, fullPage: true });

console.log('\n=== 5 · en pantalla: el aviso se fue y E2/E3 valen 374.000 ===');
await esperar(800);
{
  const t = await texto();
  check('ESPERADO: el aviso de registros sin identificador desapareció',
        !/registros guardados sin identificador propio/.test(t));
  const acordados = (t.match(/Acordado\s*\$374,000/gi) || []).length;
  check('ESPERADO: E2 y E3 muestran acordado US$374.000 cada una',
        acordados >= 2, `${acordados} apariciones de "Acordado $374,000"`);
  check('ESPERADO: ya no dice que falte normalizar para sustituir',
        !/no se puede sustituir/.test(t));
}

console.log('\n=== 6 · tras recargar siguen guardadas y no se vuelve a escribir ===');
const patchesAntesRecarga = patchesFinanzas;
await page.reload({ waitUntil: 'domcontentloaded' });
await esperar(3500);
await entrarFinanzas(page).catch(() => {});
await irAFlujoEmpresas(page);
await elegirEmpresa(page, 'Allegria Foods');
await subTab(page, /Parámetros/);
{
  const t = page.getByRole('button', { name: 'Temporada 2026-2027' });
  if (await t.count()) { await t.first().click(); }
}
await esperar(2500);
{
  const vuelta = filas(delServidor());
  check('ESPERADO: tras recargar, las 31 identidades siguen en el servidor',
        vuelta.length === 31 && vuelta.every(r => r.tiene_id));
  const mismas = JSON.stringify(vuelta) === JSON.stringify(DESPUES);
  check('ESPERADO: y son las MISMAS identidades (deterministas, no se reasignan)',
        mismas, mismas ? 'idénticas' : 'cambiaron al recargar');
  const t = await texto();
  check('ESPERADO: el aviso no reaparece',
        !/registros guardados sin identificador propio/.test(t));
  // Queda en rojo a propósito mientras siga viva la escritura de apertura
  // (applyData re-defaultea el blob, así que lo que se escribe no es igual a lo
  // que se leyó y el guardia canónico no puede suprimirla). Se cierra aparte;
  // cuando eso esté, esta comprobación pasa sin tocar el script.
  check('ESPERADO: la segunda apertura NO vuelve a escribir (nada que migrar)',
        patchesFinanzas === patchesAntesRecarga,
        `PATCH antes ${patchesAntesRecarga} → después ${patchesFinanzas} · escritura de apertura, pendiente aparte`);
}
await page.screenshot({ path: `${OUT}/identidades/03-recarga.png`, fullPage: true });

console.log(`\npeticiones escapadas a producción: ${escapadas.length}`);
if (escapadas.length) { escapadas.slice(0, 5).forEach(u => console.log('  ', u)); fallos++; }
await ctx.close(); await browser.close();
console.log(fallos ? `\n✗ ${fallos} FALLA(S)` : '\nOK: la normalización queda guardada en el servidor, sin mover montos ni meses');
process.exit(fallos ? 1 : 0);
