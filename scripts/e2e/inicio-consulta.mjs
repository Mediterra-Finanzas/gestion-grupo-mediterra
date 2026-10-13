/* ─────────────────────────────────────────────────────────────────────────
   INICIO · LECTURA DE CONSULTA en el navegador (rama de diseño). Chromium
   emulado, Supabase falso, datos FICTICIOS, diálogos de la app.

     APP_URL=http://127.0.0.1:4210 OUT_DIR=/tmp/consulta node scripts/e2e/inicio-consulta.mjs

   Recorrido: Finanzas queda en CONFLICTO (otra sesión escribe en la fila
   `finanzas` justo antes de su primer guardado) → se va al inicio → se vuelve a
   Finanzas. Se registra cada petición con su método y su fila.
     1. En el inicio solo hay lecturas (GET) y ninguna escritura.
     2. El inicio consulta rendiciones, nóminas y, para la franja, finanzas, bancos y TC.
     3. Volver a Finanzas: qué escribe y si el aviso de conflicto sigue.
     4. El servidor conserva lo que guardó la otra sesión.
   ───────────────────────────────────────────────────────────────────────── */
import fs from 'fs';
import { instalarFake, leerFila, PIN } from './fake.mjs';
import { storeDiseno } from '../vista-previa/semilla-diseno.mjs';
import { chromium } from '/home/user/gestion-grupo-mediterra/node_modules/playwright/index.mjs';

const OUT = process.env.OUT_DIR || '/tmp/consulta';
fs.mkdirSync(OUT, { recursive: true });
let ok = 0, fallos = 0;
const check = (n, c, x = '') => { c ? ok++ : fallos++; console.log(`${c ? '✓' : '✗ FALLA'}  ${n}${x ? '  — ' + x : ''}`); };
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });

const st = Object.assign(storeDiseno(), { __dialogosApp: true });
// Un anticipo antiguo sin identificador: al abrir Finanzas la app declara la
// normalización y guarda (PATCH de `finanzas`). Ese primer PATCH es el que choca.
const fin = leerFila(st, 'finanzas');
const temporada = (anticipos) => ({ cerezas: { kg: 1000, fob_usd_kg: 1, desc_exp_pct: 0, mat_usd_kg: 0, srv_usd_kg: 0,
  anticipos_cliente: anticipos, anticipos_productor: [], mes_liquidacion: 'Mar-27', mes_saldo_productor: 'Mar-27',
  programas: [], dist_mat: [], dist_srv: [], modelo_version: 2, decisiones_sin_fecha: {}, movimientos_sin_asignar: [], saldos_favor: [] } });
fin.allegria_params = { '2026-2027': temporada([{ mes: 'Nov-26', usd_kg: 0.2, realizaciones: [] }]) };
st.finanzas.value = typeof st.finanzas.value === 'string' ? JSON.stringify(fin) : fin;
// La otra sesión cambia un dato REAL del flujo (US$/kg del anticipo): 0,20 → 0,33.
const OTRA = JSON.parse(JSON.stringify(fin)); OTRA.allegria_params['2026-2027'].cerezas.anticipos_cliente[0].usd_kg = 0.33;
let chocado = false;
st.__interceptar = (m, id) => {
  if (!chocado && id === 'finanzas' && m === 'PATCH') {
    chocado = true;   // la otra sesión guardó entre la lectura y el PATCH
    st.finanzas = { value: JSON.stringify(OTRA), updated_at: new Date(Date.now() + 60000).toISOString() };
  }
  return null;
};

const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, timezoneId: 'America/Santiago' });
await instalarFake(ctx, st);
await ctx.route(/open\.er-api\.com|mindicador\.cl|frankfurter\.app|emailjs/, r => r.abort());
await ctx.route(/\/rest\/v1\/(?!calendario_data)[a-z_]+/, r => r.request().method() === 'GET' ? r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }) : r.abort());
await ctx.routeWebSocket(/realtime\/v1\/websocket/, () => {});
const page = await ctx.newPage();
const errores = []; page.on('pageerror', e => errores.push(String(e).slice(0, 160)));
const nativos = []; page.on('dialog', d => { nativos.push(d.type()); d.dismiss().catch(() => {}); });
let fase = 'login';
const peticiones = [];
page.on('request', r => {
  const u = r.url(); if (!u.includes('/rest/v1/')) return;
  const id = decodeURIComponent((/id=eq\.([^&]+)/.exec(u) || [])[1] || (u.includes('/rpc/') ? 'rpc:' + u.split('/rpc/')[1] : '?'));
  peticiones.push({ fase, metodo: r.method(), id });
});
const de = (f) => peticiones.filter(p => p.fase === f);
const escrituras = (f) => de(f).filter(p => p.metodo !== 'GET');
const texto = () => page.locator('body').innerText();
const AVISO = /No se guardó|otra sesión cambió los datos/;

await page.goto(process.env.APP_URL);
await page.locator('input[type=email]').fill('ahuerta@grupomediterra.cl'); await page.locator('input[type=password]').fill(PIN); await page.keyboard.press('Enter');
await page.waitForTimeout(3000);
for (const t of ['Entendido', 'Aceptar']) { const b = page.getByRole('button', { name: t }); if (await b.count()) await b.first().click().catch(() => {}); }

fase = 'finanzas';
await page.getByTestId('nav-modulo-finanzas').click(); await page.waitForTimeout(6000);
check('Finanzas intentó guardar y chocó con la otra sesión', chocado);
const avisoAntes = AVISO.test(await texto());
check('Finanzas muestra el aviso de conflicto', avisoAntes);
await page.screenshot({ path: `${OUT}/1-finanzas-conflicto.png` });

fase = 'inicio';   // incluye el desmontaje de Finanzas: sus escrituras también contarían acá
await page.getByTestId('nav-inicio').click();
await page.waitForTimeout(4000);
check('inicio: «Requiere tu decisión» visible', (await page.getByTestId('decisiones').count()) === 1);
const enInicio = de('inicio');
check('inicio: solo lecturas (GET), ninguna escritura', enInicio.length > 0 && escrituras('inicio').length === 0,
  [...new Set(enInicio.map(p => `${p.metodo} ${p.id}`))].join(', '));
check('inicio: consulta rendiciones, nóminas y (franja) finanzas, bancos y maestro_tc, solo con GET',
  ['rendiciones', 'finanzas', 'finanzas_bancos', 'maestro_tc'].every(id => enInicio.some(p => p.id === id)) && enInicio.some(p => /^nominas_/.test(p.id)),
  [...new Set(enInicio.map(p => p.id))].join(', '));
await page.screenshot({ path: `${OUT}/2-inicio.png` });

fase = 'vuelta';
await page.getByTestId('nav-modulo-finanzas').click(); await page.waitForTimeout(6000);
const avisoDespues = AVISO.test(await texto());
const escrVuelta = escrituras('vuelta');
console.log(`   vuelta a Finanzas: escrituras ${escrVuelta.length ? escrVuelta.map(p => `${p.metodo} ${p.id}`).join(', ') : 'ninguna'} · aviso de conflicto ${avisoDespues ? 'SIGUE' : 'YA NO ESTÁ'}`);
// Lo que hace Finanzas al volver NO depende del inicio: su carga (dbLoad →
// registrarCarga) limpia el conflicto y la normalización vuelve a correr. Se
// informa como observación; ESPERA_CONSERVA=1 lo exige (para cuando se corrija).
if (process.env.ESPERA_CONSERVA) {
  check('vuelta a Finanzas: ninguna escritura', escrVuelta.length === 0, escrVuelta.map(p => `${p.metodo} ${p.id}`).join(', '));
  check('vuelta a Finanzas: el conflicto sigue visible', avisoDespues);
}
await page.screenshot({ path: `${OUT}/3-vuelta-finanzas.png` });
const usdSrv = leerFila(st, 'finanzas')?.allegria_params?.['2026-2027']?.cerezas?.anticipos_cliente?.[0]?.usd_kg;
check('el servidor conserva el dato de la otra sesión (0,33 US$/kg)', usdSrv === 0.33, `US$/kg en el servidor: ${usdSrv}`);
check('sin errores ni diálogos del navegador', !errores.length && !nativos.length, [...errores, ...nativos].join(' | '));
fs.writeFileSync(`${OUT}/peticiones.json`, JSON.stringify(peticiones, null, 1));
await browser.close();
console.log(`\n${ok} correctas, ${fallos} fallas · Chromium emulado · datos ficticios`);
process.exit(fallos ? 1 : 0);
