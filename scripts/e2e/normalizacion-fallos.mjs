/* ─────────────────────────────────────────────────────────────────────────
   NORMALIZACIÓN DE IDENTIFICADORES · qué pasa cuando el guardado NO se
   confirma. Recorrido en la app real.

   La regla que se comprueba: mientras las identidades no estén CONFIRMADAS
   EN EL SERVIDOR, el aviso se queda puesto y declarar una sustitución sigue
   bloqueado. Un aviso que se limpia solo, o un control que se desbloquea con
   identidades que viven únicamente en memoria, dejaría una referencia a un id
   que el servidor no tiene y el mismo monto proyectado dos veces.

   Dos casos, cada uno con su propio navegador y su propio almacén:
     A · el servidor rechaza las escrituras (HTTP 500)
     B · otra sesión escribió en el medio (conflicto en el PATCH condicionado)

   Los resultados ESPERADOS van escritos acá. DATOS SINTÉTICOS con la misma
   forma que producción. Supabase está interceptado: producción no se toca.

   Uso:
     CI=true npx react-scripts build
     (cd build && python3 -m http.server 4173 --bind 127.0.0.1 &)
     OUT_DIR=/tmp/e2e-fallos node scripts/e2e/normalizacion-fallos.mjs
   ───────────────────────────────────────────────────────────────────────── */
import fs from 'fs';
import path from 'path';
import { nuevoStore, leerFila } from './fake.mjs';
import { abrirApp, login, entrarFinanzas, irAFlujoEmpresas, elegirEmpresa, subTab } from './lib.mjs';

const OUT = process.env.OUT_DIR || '.';
fs.mkdirSync(path.join(OUT, 'fallos'), { recursive: true });
let fallos = 0;
const check = (n, c, e = '') => { console.log(`${c ? '✓' : '✗ FALLA'}  ${n}${e ? '  — ' + e : ''}`); if (!c) fallos++; };

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

// ── Siembra: la forma de producción, más un programa con una cuota vigente
// para que el control de sustitución exista en pantalla y se pueda comprobar
// que está bloqueado.
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
    programas: [{ id: 'prg_sint', lado: 'cliente', contraparte: 'Contraparte Sintética',
      kilos: 850000, cuotas: [{ id: 'cuo_sint', estado: 'vigente', modalidad: 'monto',
        monto: 374000, mes: 'Nov-26', v: 2, sustituye: [], realizaciones: [] }] }],
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
const filas = (params) => {
  const out = [];
  TEMPS.forEach(t => Object.keys(params[t] || {}).forEach(f => {
    [['cliente', 'anticipos_cliente'], ['productor', 'anticipos_productor']].forEach(([lado, campo]) => {
      (params[t][f][campo] || []).forEach((e, i) => out.push({
        temporada: t, fruta: f, lado, ord: i + 1, tiene_id: !!e.id,
        mes: e.mes ?? '', usd_kg: e.usd_kg ?? '',
      }));
    });
  }));
  return out;
};

async function correrCaso(nombre, preparar) {
  console.log(`\n═══ ${nombre} ═══`);
  const store = nuevoStore();
  leerFila(store, 'finanzas').allegria_params = paramsLegado();
  const antes = JSON.stringify(leerFila(store, 'finanzas').allegria_params);

  const { browser, ctx, page } = await abrirApp(store);
  const escapadas = [];
  page.on('requestfinished', async r => {
    if (!r.url().includes('bywovqayuzodbzwsriet.supabase.co')) return;
    const resp = await r.response().catch(() => null);
    const via = resp ? await resp.headerValue('access-control-allow-origin').catch(() => null) : null;
    if (via !== '*') escapadas.push(r.url().slice(0, 70));
  });
  page.on('pageerror', e => { console.log('  [pageerror]', String(e).slice(0, 180)); fallos++; });

  await preparar({ store, ctx, page });

  const esperar = (ms) => page.waitForTimeout(ms);
  const texto = async () => await page.locator('body').innerText();

  await login(page);
  await entrarFinanzas(page);
  await irAFlujoEmpresas(page);
  await elegirEmpresa(page, 'Allegria Foods');
  await subTab(page, /Parámetros/);
  {
    const t = page.getByRole('button', { name: 'Temporada 2026-2027' });
    if (await t.count()) { await t.first().click(); }
  }
  await esperar(4000);

  const t = await texto();
  const despues = JSON.stringify(leerFila(store, 'finanzas').allegria_params);
  const sinId = filas(JSON.parse(despues)).filter(r => !r.tiene_id).length;

  check('ESPERADO: el aviso de registros sin identificador SIGUE puesto',
        /registros guardados sin identificador propio/.test(t),
        (t.match(/\d+ registros guardados sin identificador propio/) || ['(el aviso desapareció)'])[0]);
  check('ESPERADO: la fila del servidor NO cambió (las 29 siguen sin identidad)',
        despues === antes && sinId === 29,
        `sin identidad: ${sinId} · fila ${despues === antes ? 'intacta' : 'MODIFICADA'}`);
  check('ESPERADO: el usuario ve que NO se guardó',
        /No se guardó|otra sesión cambió los datos|No se pudo guardar/.test(t),
        (t.match(/No se guardó[^\n]*|otra sesión cambió los datos|No se pudo guardar[^\n]*/) || ['(sin aviso de error)'])[0]);
  check('ESPERADO: declarar una sustitución sigue BLOQUEADO',
        /no se puede sustituir/.test(t),
        /no se puede sustituir/.test(t) ? 'control bloqueado' : '(el control quedó habilitado con identidades no confirmadas)');

  await page.screenshot({ path: `${OUT}/fallos/${nombre.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.png`, fullPage: true });
  console.log(`  peticiones escapadas: ${escapadas.length}`);
  if (escapadas.length) fallos++;
  await ctx.close(); await browser.close();
}

// ── A · el servidor rechaza toda escritura ────────────────────────
await correrCaso('A · el servidor rechaza las escrituras (HTTP 500)', async ({ store }) => {
  store.__fallarEscrituras = true;
});

// ── B · otra sesión escribió en el medio (conflicto) ──────────────
// Se intercepta ANTES que el falso (el último handler registrado corre
// primero) y, en el primer PATCH a `finanzas`, se mueve la versión de la fila:
// el PATCH condicionado deja de calzar y el servidor devuelve 0 filas, que es
// exactamente un conflicto.
await correrCaso('B · otra sesión escribió en el medio (conflicto)', async ({ store, ctx }) => {
  let yaMovida = false;
  await ctx.route('**bywovqayuzodbzwsriet.supabase.co/**', async (route) => {
    const r = route.request();
    if (!yaMovida && r.method() === 'PATCH' && /id=eq\.finanzas&/.test(r.url())) {
      yaMovida = true;
      const f = store.finanzas;
      f.updated_at = new Date(Date.now() + 60000).toISOString();   // la otra sesión guardó
    }
    await route.fallback();
  });
});

console.log(fallos
  ? `\n✗ ${fallos} FALLA(S)`
  : '\nOK: sin confirmación del servidor, el aviso se conserva y las sustituciones siguen bloqueadas');
process.exit(fallos ? 1 : 0);
