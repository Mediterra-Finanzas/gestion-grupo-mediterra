/* ─────────────────────────────────────────────────────────────────────────
   PRUEBA del script asistido de conciliación — SOLO DATOS DE PRUEBA.

   Levanta un Postgres 16 y un PostgREST 12 LOCALES (misma familia que usa
   Supabase), con la tabla calendario_data (id text, value jsonb, updated_at
   timestamptz) y el rol anon sin RLS, como la auditoría describe producción.
   Un proxy local agrega el prefijo /rest/v1 de Supabase. No hay conexión a
   producción: el script rechaza cualquier destino no local.

     PG_BIN=/usr/lib/postgresql/16/bin POSTGREST_BIN=/ruta/postgrest \
       OUT_DIR=/tmp/conc node scripts/conciliacion/prueba.mjs

   Escenarios: ensayo con las 7 clases; aplicación de lo aprobado; decisión
   individual de duplicados (uno omitido, uno aplicado); dependencias
   bloqueadas (también entre filas); cambios posteriores conservados;
   reintento sin duplicar; escritura concurrente entre lectura y escritura
   (rechazada); carrera real en la base (UPDATE bloqueado por otra
   transacción → 0 filas); el hueco de un escritor que NO cambia updated_at
   y su cierre con un trigger; rechazo de destinos de producción.
   Además (las propuestas SQL se ejecutan TAL CUAL):
     T  trigger de versión con persistContract y friskuHelpers REALES de src/
        (su red se redirige a la base local; cualquier otra salida se bloquea);
     S  sellos: una pestaña con datos antiguos no puede deshacer lo aplicado;
     P  falla entre filas (finanzas sí, nómina no; y la última) y reintento;
     R  reversión de ambas propuestas.
   Roles como en Supabase: anon / authenticated / service_role con JWT local.
   ───────────────────────────────────────────────────────────────────────── */
import fs from 'fs';
import os from 'os';
import path from 'path';
import http from 'http';
import crypto from 'crypto';
import { spawn, execFileSync } from 'child_process';
import { createRequire, register } from 'module';
import { pathToFileURL } from 'url';
import { fileURLToPath } from 'url';
import { asegurarUids, registrarPago, anularPago, confirmarImpaga, registrarPagoIdempotente } from '../../src/creditos.js';
import { ensayo, aplicar, transportePostgrest, validarDestino } from './aplicar.mjs';
import { sha256, invariantesNominaCredito, decodificarFila } from './motor.mjs';

const require = createRequire(import.meta.url);
const VPDiff = require('../vista-previa/diff.js');
const AQUI = path.dirname(fileURLToPath(import.meta.url));
const PG_BIN = process.env.PG_BIN || '/usr/lib/postgresql/16/bin';
const POSTGREST_BIN = process.env.POSTGREST_BIN;
const OUT = process.env.OUT_DIR || fs.mkdtempSync(path.join(os.tmpdir(), 'conc-'));
const PG_PORT = 54330, PGRST_PORT = 3911, PROXY_PORT = 3901;
const DESTINO = `http://127.0.0.1:${PROXY_PORT}`;
if (!POSTGREST_BIN || !fs.existsSync(POSTGREST_BIN)) { console.error('Falta POSTGREST_BIN (binario de PostgREST 12).'); process.exit(2); }
fs.mkdirSync(OUT, { recursive: true });

let fallos = 0;
const check = (n, c, x = '') => { console.log(`${c ? '✓' : '✗ FALLA'}  ${n}${x ? '  — ' + x : ''}`); if (!c) fallos++; };
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Postgres + PostgREST locales ───────────────────────────────────────
const esRoot = process.getuid && process.getuid() === 0;
const comoPg = (cmd, args, opts = {}) => (esRoot ? spawn('runuser', ['-u', 'postgres', '--', cmd, ...args], opts) : spawn(cmd, args, opts));
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'conc-pg-'));
if (esRoot) execFileSync('chown', ['-R', 'postgres', DATA]);
fs.chmodSync(DATA, 0o700);
execFileSync(esRoot ? 'runuser' : `${PG_BIN}/initdb`, esRoot ? ['-u', 'postgres', '--', `${PG_BIN}/initdb`, '-D', DATA, '-A', 'trust', '-U', 'postgres'] : ['-D', DATA, '-A', 'trust', '-U', 'postgres'], { stdio: 'ignore' });
const pg = comoPg(`${PG_BIN}/postgres`, ['-D', DATA, '-p', String(PG_PORT), '-k', DATA, '-c', 'listen_addresses=127.0.0.1'], { stdio: 'ignore' });
const psql = (sql) => execFileSync(`${PG_BIN}/psql`, ['-h', '127.0.0.1', '-p', String(PG_PORT), '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-qAt', '-c', sql], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
// Detener Postgres con pg_ctl (matar el proceso intermedio runuser no lo detiene).
const detenerPg = () => { try { execFileSync(esRoot ? 'runuser' : `${PG_BIN}/pg_ctl`, esRoot ? ['-u', 'postgres', '--', `${PG_BIN}/pg_ctl`, '-D', DATA, '-m', 'immediate', 'stop'] : ['-D', DATA, '-m', 'immediate', 'stop'], { stdio: 'ignore' }); } catch (e) {} };
process.on('exit', () => { try { if (typeof pgrst !== 'undefined') pgrst.kill(); } catch (e) {} detenerPg(); });   // nunca dejar procesos vivos
const psqlArchivo = (f) => execFileSync(`${PG_BIN}/psql`, ['-h', '127.0.0.1', '-p', String(PG_PORT), '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-qAt', '-f', f], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
for (let i = 0; i < 50; i++) { try { psql('select 1'); break; } catch (e) { await espera(200); } }
// Roles como en Supabase: anon (llave pública de la app), authenticated y
// service_role (la llave de servicio que usaría el script), con JWT HS256.
const JWT_SECRETO = 'prueba-local-solo-para-tests-0123456789abcdef';
const b64u = (x) => Buffer.from(typeof x === 'string' ? x : JSON.stringify(x)).toString('base64url');
const jwt = (payload) => { const h = b64u({ alg: 'HS256', typ: 'JWT' }), p = b64u(payload); return `${h}.${p}.${crypto.createHmac('sha256', JWT_SECRETO).update(`${h}.${p}`).digest('base64url')}`; };
const ANON = jwt({ role: 'anon' }), SERVICIO = jwt({ role: 'service_role' });
const cabApp = { apikey: ANON, Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json' };
psql(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  create role authenticator login noinherit; grant anon, authenticated, service_role to authenticator;
  create table public.calendario_data (id text primary key, value jsonb, updated_at timestamptz default now());
  grant select, insert, update on public.calendario_data to anon, authenticated, service_role;`);
const conf = path.join(DATA, 'pgrst.conf');
fs.writeFileSync(conf, `db-uri = "postgres://authenticator@127.0.0.1:${PG_PORT}/postgres"\ndb-schemas = "public"\ndb-anon-role = "anon"\njwt-secret = "${JWT_SECRETO}"\nserver-host = "127.0.0.1"\nserver-port = ${PGRST_PORT}\n`);
var pgrst = spawn(POSTGREST_BIN, [conf], { stdio: 'ignore' });
// proxy /rest/v1 → PostgREST (como el gateway de Supabase); cuenta los PATCH y
// puede simular una FALLA de red/servidor (503) en la próxima escritura a una fila.
const conteo = { PATCH: 0, POST: 0, GET: 0 };
let fallarEn = null;   // { fila, restantes }
const proxy = http.createServer((req, res) => {
  conteo[req.method] = (conteo[req.method] || 0) + 1;
  if (fallarEn && req.method === 'PATCH' && req.url.includes(`id=eq.${encodeURIComponent(fallarEn.fila)}`) && fallarEn.restantes-- > 0) {
    req.resume(); res.writeHead(503, { 'Content-Type': 'application/json' }); res.end('{"message":"falla simulada"}'); return;
  }
  const p = http.request({ host: '127.0.0.1', port: PGRST_PORT, path: req.url.replace(/^\/rest\/v1/, ''), method: req.method, headers: req.headers }, (r) => { res.writeHead(r.statusCode, r.headers); r.pipe(res); });
  p.on('error', (e) => { res.writeHead(502); res.end(String(e)); });
  req.pipe(p);
});
await new Promise((r) => proxy.listen(PROXY_PORT, '127.0.0.1', r));
for (let i = 0; i < 50; i++) { try { const r = await fetch(`${DESTINO}/rest/v1/calendario_data?select=id`); if (r.ok) break; } catch (e) {} await espera(200); }
async function cerrar() { proxy.close(); pgrst.kill(); detenerPg(); await espera(300); try { fs.rmSync(DATA, { recursive: true, force: true }); } catch (e) {} }

// ── Datos de PRUEBA ────────────────────────────────────────────────────
const src = fs.readFileSync(path.join(AQUI, '../../src/FinanzasModule.jsx'), 'utf8');
const historicos = Function(`return ${/const CREDITOS_DEFAULT = (\[[\s\S]*?\n\]);/.exec(src)[1]}`)().slice(0, 5);
const contrato = { uid: 'cr-prueba-contrato', n: 900, tipo_credito: 'contrato', empresa: 'Osiris', acreedor: 'Banco Real Prueba', moneda: 'USD', tipo_cr: 'Capital de trabajo',
  monto: 200000, fecha_desembolso: '2026-03-15', primer_venc: '2026-06-15', vencimiento_final: '2027-03-15', periodicidad: 3, modalidad: 'lineal',
  tasa_tipo: 'fija', tasa_anual: 9, base: 'act360', control_desde: '2026-03-15',
  pagos: [{ id: 'pg-prueba-1', vencKey: 'cr-prueba-contrato@2026-06-15', fecha: '2026-06-15', capital: 50000, interes: 4500, cargos: 0, sinDesglose: 0, tipo: 'pago', nota: 'cartola', usuario: 'Angelo Huerta', ts: '2026-06-15T15:00:00Z' }] };
// Crédito con un pago que salió de la línea L4 de nómina (vinculada).
const creditoL4 = { ...contrato, uid: 'cr-prueba-l4', n: 901, acreedor: 'Banco L4 Prueba', monto: 80000,
  pagos: [{ id: 'pg-l4', vencKey: 'cr-prueba-l4@2026-09-15', fecha: '2026-09-15', capital: 20000, interes: 1800, cargos: 0, sinDesglose: 0, tipo: 'pago',
    origen: { tipo: 'nomina', clave: 'nomina:NOM1:L4' }, usuario: 'Angelo Huerta', ts: '2026-09-15T15:00:00Z' }] };
const FECHA_RESP = '2026-09-30T21:15:00.000Z';
const respaldo = {
  fecha: FECHA_RESP, usuario: 'Angelo Huerta', version: 'Mediterra Hub Backup v1',
  tablas: {
    finanzas: { updated_at: '2026-09-30T19:00:00+00:00', data: {
      creditos_data: [...historicos, contrato, creditoL4], creditos_saldos_informados: [], creditos_config: { tolerancias: { CLP: 1, USD: 0.01, EUR: 0.01, PEN: 0.01, UF: 0.0001 } },
      params_emp: { tc: 950 },
      finanzas_real: { Osiris: { _proyOverrides: { 'Pago Préstamos - Total': { 6: 55000, 7: 30000 } } } } } },
    nominas_osiris: { updated_at: '2026-09-30T19:10:00+00:00', data: JSON.stringify({ empresa: 'Osiris', nominas: [{ id: 'NOM1', empresa: 'Osiris', estadoNomina: 'borrador', items: [
      { id: 'L1', detalle: 'Cuota Banco Real Prueba dic', monto: 54000 }, { id: 'L2', detalle: 'Cuota Banco Real Prueba mar', monto: 52000 },
      { id: 'L3', detalle: 'Cuota crédito nuevo dic', monto: 30000 },
      { id: 'L4', detalle: 'Cuota Banco L4 sep', monto: 21800, creditoVinculo: { uid: 'cr-prueba-l4', vencKey: 'cr-prueba-l4@2026-09-15' } }] }] }) },
    maestro_tc: { updated_at: '2026-09-30T19:20:00+00:00', data: { 'USD-CLP': [{ fecha: '2026-09-29', valor: 955, fuente: 'manual' }] } },
  },
};
const textoRespaldo = JSON.stringify(respaldo, null, 2);

// La "sesión" en la vista previa: acciones hechas con las funciones reales de la app.
function sesionVistaPrevia() {
  const F = JSON.parse(JSON.stringify(respaldo.tablas.finanzas.data));
  let cr = asegurarUids(F.creditos_data).lista;
  const U = 'Angelo Huerta';
  const iC = cr.findIndex((c) => c.uid === 'cr-prueba-contrato');
  // [0] Zelun: pago de la cuota (legacy, sin uid en el respaldo)
  cr[0] = registrarPago(cr[0], { vencKey: 'cr-1-0@2026-11-30', fecha: '2026-09-29', sinDesglose: 120000, nota: 'cartola 29/09' }, U);
  // [1] Yiannis: pago de la cuota (en producción alguien registró otro después del respaldo)
  cr[1] = registrarPago(cr[1], { vencKey: 'cr-2-1@2026-11-30', fecha: '2026-09-28', sinDesglose: 117000, nota: 'cartola 28/09' }, U);
  // [2] Fresion: desglose (en producción se desglosó distinto)
  cr[2] = { ...cr[2], desglose: { capital: 130000, interes: 6000, cargos: 0, respaldo: 'contrato p.3' }, historial: [...(cr[2].historial || []), { ts: '2026-09-30T22:00:00Z', usuario: U, accion: 'desglose', detalle: 'capital 130000 · interés 6000' }] };
  // [3] Qupai: control_desde (en producción le cambiaron la cuota: la huella ya no calza)
  cr[3] = { ...cr[3], control_desde: '2026-09-01' };
  // contrato: anular pago, confirmar impaga, pago desde nómina (L2)
  cr[iC] = anularPago(cr[iC], 'pg-prueba-1', 'duplicado en cartola', U);
  cr[iC] = confirmarImpaga(cr[iC], 'cr-prueba-contrato@2026-09-15', 'certificado banco 30/09', U);
  cr[iC] = registrarPagoIdempotente(cr[iC], { vencKey: 'cr-prueba-contrato@2027-03-15', fecha: '2026-09-30', capital: 50000, interes: 2000, cargos: 0, origen: { tipo: 'nomina', clave: 'nomina:NOM1:L2' } }, U).credito;
  // crédito NUEVO + pago desde la línea L3 (alta, vínculo y pago en la misma sesión)
  let nuevo = { ...contrato, uid: 'cr-sesion-nuevo', n: 902, acreedor: 'Banco Nuevo Prueba', monto: 120000, pagos: [], historial: [{ ts: '2026-09-30T22:30:00Z', usuario: U, accion: 'alta', detalle: 'alta en conciliación' }] };
  nuevo = registrarPagoIdempotente(nuevo, { vencKey: 'cr-sesion-nuevo@2026-12-15', fecha: '2026-09-30', capital: 30000, interes: 0, cargos: 0, origen: { tipo: 'nomina', clave: 'nomina:NOM1:L3' } }, U).credito;
  cr.push(nuevo);
  // L4: el pago que salió de la nómina se anula y la línea se desvincula
  const iL4 = cr.findIndex((c) => c.uid === 'cr-prueba-l4');
  cr[iL4] = anularPago(cr[iL4], 'pg-l4', 'cuota mal imputada', U);
  F.creditos_data = cr;
  F.creditos_saldos_informados = [{ id: 'si-sesion', empresa: 'Osiris', acreedor: 'Banco Real Prueba', moneda: 'USD', fecha: '2026-09-30', capital: 100000, respaldo: 'certificado', usuario: U, ts: '2026-09-30T22:10:00Z' }];
  F.creditos_config = { tolerancias: { ...F.creditos_config.tolerancias, CLP: 2 } };
  // valores manuales: retirar mes 6 y mes 7, con su decisión (como handleConciliarOverrideCredito)
  const ov = F.finanzas_real.Osiris._proyOverrides['Pago Préstamos - Total'];
  delete ov[6]; delete ov[7];
  F.finanzas_real.Osiris._resolucionesCreditos = [6, 7].map((idx) => ({ id: `rc_s${idx}`, linea: 'Pago Préstamos - Total', cat: 'egr_nop', idx, mes: `m${idx}`, decision: 'creditos',
    valorManual: idx === 6 ? 55000 : 30000, valorCreditos: 0, diferencia: 0, nota: 'usar Créditos', usuario: U, ts: '2026-09-30T22:20:00Z' }));
  const N = JSON.parse(respaldo.tablas.nominas_osiris.data);
  N.nominas[0].items[0].creditoVinculo = { uid: 'cr-prueba-contrato', vencKey: 'cr-prueba-contrato@2026-12-15' };
  N.nominas[0].items[1].creditoVinculo = { uid: 'cr-prueba-contrato', vencKey: 'cr-prueba-contrato@2027-03-15' };
  N.nominas[0].items[2].creditoVinculo = { uid: 'cr-sesion-nuevo', vencKey: 'cr-sesion-nuevo@2026-12-15' };
  delete N.nominas[0].items[3].creditoVinculo;
  const T = JSON.parse(JSON.stringify(respaldo.tablas.maestro_tc.data));
  T['UF-CLP'] = [{ fecha: '2026-10-01', valor: 39500.12, fuente: 'mindicador' }];
  T['USD-CLP'] = [...T['USD-CLP'], { fecha: '2026-09-30', valor: 960, fuente: 'manual' }];
  return { finanzas: { value: F }, nominas_osiris: { value: JSON.stringify(N) }, maestro_tc: { value: T } };
}
const trabajo = sesionVistaPrevia();
const comp = VPDiff.comparar(JSON.parse(textoRespaldo), trabajo);
const resultado = {
  formato: 'mediterra-conciliacion-creditos-v1', generado: '2026-09-30T23:00:00Z',
  respaldo: { archivo: 'backup_prueba.json', sha256: sha256(textoRespaldo), verificacionSha256: 'coincide', fecha: FECHA_RESP, usuario: 'Angelo Huerta',
    versionesFilas: Object.fromEntries(Object.entries(respaldo.tablas).map(([k, v]) => [k, v.updated_at])) },
  resumen: comp.resumen, alertas: comp.alertas, operaciones: comp.operaciones, filasConCambios: comp.filas,
  referencia: { creditos_data: trabajo.finanzas.value.creditos_data, creditos_saldos_informados: trabajo.finanzas.value.creditos_saldos_informados, creditos_config: trabajo.finanzas.value.creditos_config },
};
const RES = path.join(OUT, 'conciliacion_creditos_prueba.json');
fs.writeFileSync(RES, JSON.stringify(resultado, null, 2));
const shaRespaldoArchivo = sha256(textoRespaldo);

// Estado de "producción" de PRUEBA = respaldo + lo que pasó después del respaldo.
function estadoProduccion() {
  const F = JSON.parse(JSON.stringify(respaldo.tablas.finanzas.data));
  const cr = F.creditos_data;
  cr[1] = { ...cr[1], uid: 'cr-2-1', pagos: [{ id: 'pg-prod-yian', vencKey: 'cr-2-1@2026-11-30', fecha: '2026-10-01', capital: 0, interes: 0, cargos: 0, sinDesglose: 117000, tipo: 'pago', nota: 'registrado en prod', usuario: 'Carol', ts: '2026-10-01T10:00:00Z' }] };
  cr[2] = { ...cr[2], desglose: { capital: 128000, interes: 8000, cargos: 0, respaldo: 'otro' } };
  cr[3] = { ...cr[3], cuota: 76000 };
  cr[4] = { ...cr[4], uid: 'cr-5-4', pagos: [{ id: 'pg-prod-china', vencKey: 'cr-5-4@2026-11-30', fecha: '2026-10-01', sinDesglose: 50000, tipo: 'pago', usuario: 'Carol', ts: '2026-10-01T11:00:00Z' }] };
  const iC = cr.findIndex((c) => c.uid === 'cr-prueba-contrato');
  cr[iC] = { ...cr[iC], pagos: [...cr[iC].pagos, { id: 'pg-prod-contrato', vencKey: 'cr-prueba-contrato@2026-12-15', fecha: '2026-10-01', capital: 50000, interes: 3000, cargos: 0, sinDesglose: 0, tipo: 'pago', usuario: 'Carol', ts: '2026-10-01T12:00:00Z' }] };
  F.creditos_saldos_informados = [{ id: 'si-prod', empresa: 'Osiris', acreedor: 'Banco Real Prueba', moneda: 'USD', fecha: '2026-09-30', capital: 100000, respaldo: 'mismo certificado', usuario: 'Carol', ts: '2026-10-01T09:00:00Z' }];
  F.params_emp = { tc: 951 };   // cambio ajeno a Créditos
  F.finanzas_real.Osiris._proyOverrides['Pago Préstamos - Total'][6] = 56000;   // el valor manual del mes 6 cambió
  const N = JSON.parse(respaldo.tablas.nominas_osiris.data);
  N.nominas[0].items[1].creditoVinculo = { uid: 'cr-prueba-contrato', vencKey: 'cr-prueba-contrato@2026-12-15' };   // L2 vinculada distinto
  const T = JSON.parse(JSON.stringify(respaldo.tablas.maestro_tc.data));
  T['UF-CLP'] = [{ fecha: '2026-10-01', valor: 39500.12, fuente: 'mindicador' }];   // la app ya bajó la misma UF
  T['USD-CLP'] = [...T['USD-CLP'], { fecha: '2026-09-30', valor: 958, fuente: 'mindicador' }];
  return { finanzas: { value: F, enc: 'objeto' }, nominas_osiris: { value: N, enc: 'texto' }, maestro_tc: { value: T, enc: 'objeto' } };
}
const lit = (v) => `'${String(v).replace(/'/g, "''")}'`;
function cargarProduccion() {
  psql('truncate calendario_data');
  const P = estadoProduccion();
  Object.entries(P).forEach(([id, f]) => {
    const v = f.enc === 'texto' ? JSON.stringify(JSON.stringify(f.value)) : JSON.stringify(f.value);
    psql(`insert into calendario_data (id, value, updated_at) values (${lit(id)}, ${lit(v)}::jsonb, '2026-10-01T12:30:00.123Z')`);
  });
  psql(`insert into calendario_data (id, value, updated_at) values ('osiris', '{"x":1}'::jsonb, now())`);
}
const fila = (id) => { const t = psql(`select json_build_object('value', value, 'updated_at', updated_at)::text from calendario_data where id=${lit(id)}`); const o = JSON.parse(t); let v = o.value; while (typeof v === 'string') v = JSON.parse(v); return { v, updated_at: o.updated_at }; };
const credito = (F, uid) => F.creditos_data.find((c) => c.uid === uid);

const transporte = transportePostgrest(DESTINO, SERVICIO);
const porClave = (plan) => Object.fromEntries(plan.items.map((it) => [it.clave, it]));
const buscar = (plan, pref) => plan.items.find((it) => it.clave.startsWith(pref));

try {
  // ── 0. Destinos de producción rechazados ──────────────────────────────
  let rechazo = '';
  try { validarDestino('https://bywovqayuzodbzwsriet.supabase.co'); } catch (e) { rechazo = e.message; }
  check('Destino de producción rechazado', /PRODUCCIÓN rechazado/.test(rechazo), rechazo);
  rechazo = ''; try { validarDestino('https://otro.example.com'); } catch (e) { rechazo = e.message; }
  check('Destino no local rechazado', /no local/.test(rechazo));

  // ── 1. Ensayo ─────────────────────────────────────────────────────────
  cargarProduccion();
  const antesEnsayo = psql(`select string_agg(id||'='||updated_at::text, ',' order by id) from calendario_data`);
  conteo.PATCH = 0;
  const E1 = await ensayo({ resultadoPath: RES, transporte, salida: path.join(OUT, '1-ensayo'), ahora: new Date('2026-10-01T13:00:00Z') });
  const P1 = E1.plan, K1 = porClave(P1);
  fs.writeFileSync(path.join(OUT, '1-ensayo', 'clases.txt'), P1.items.map((it) => `${it.estado.padEnd(20)} ${it.clave}`).join('\n'));
  check('Ensayo no escribe (0 PATCH, versiones iguales)', conteo.PATCH === 0 && antesEnsayo === psql(`select string_agg(id||'='||updated_at::text, ',' order by id) from calendario_data`));
  const est = (pref) => (buscar(P1, pref) || {}).estado;
  check('Aplicable: pago en crédito antiguo sin uid (se le fija uid por huella)', est('agregar_pago|cr-1-0') === 'aplicable' && buscar(P1, 'agregar_pago|cr-1-0').fijaUid === 'cr-1-0');
  check('Aplicable: anular pago del contrato', est('anular_pago|cr-prueba-contrato|pg-prueba-1') === 'aplicable');
  check('Aplicable: confirmar impaga', est('agregar_conciliacion|cr-prueba-contrato') === 'aplicable');
  check('Aplicable: vínculo L1 de nómina', est('vincular_linea_nomina|nominas_osiris|NOM1/L1') === 'aplicable');
  check('Aplicable: retirar valor manual mes 7 + su decisión (grupo)', est('retirar_valor_manual|emp:Osiris|Pago Préstamos - Total@7') === 'aplicable' && est('agregar_resolucion_credito|emp:Osiris|rc_s7') === 'aplicable');
  check('Ya aplicada: UF-CLP igual en producción', est('agregar_tc|UF-CLP') === 'ya_aplicada');
  check('Conflicto: desglose cambiado en producción', est('cambiar_campo|cr-3-2|desglose') === 'conflicto');
  check('Conflicto: TC del 30/09 distinto en producción', est('agregar_tc|USD-CLP') === 'conflicto');
  check('Conflicto: vínculo L2 cambiado en producción', est('vincular_linea_nomina|nominas_osiris|NOM1/L2') === 'conflicto');
  check('Conflicto: valor manual mes 6 cambiado', est('retirar_valor_manual|emp:Osiris|Pago Préstamos - Total@6') === 'conflicto');
  check('No encontrada: crédito cuya huella ya no calza', est('cambiar_campo|cr-4-3|control_desde') === 'no_encontrada');
  check('Posible duplicado: pago Yiannis (misma cuota registrada después)', est('agregar_pago|cr-2-1') === 'pendiente_decision' && buscar(P1, 'agregar_pago|cr-2-1').clase === 'posible_duplicado');
  check('Posible duplicado: saldo informado mismo acreedor y fecha', est('agregar_saldo_informado||si-sesion') === 'pendiente_decision' || est('agregar_saldo_informado|si-sesion') === 'pendiente_decision');
  const pagoNom = P1.items.find((it) => it.op === 'agregar_pago' && it.clave.includes('cr-prueba-contrato'));
  check('Bloqueada: pago desde nómina L2 (depende del vínculo en conflicto, otra fila)', pagoNom && pagoNom.estado === 'bloqueada' && /NOM1\/L2/.test(pagoNom.motivo), pagoNom && pagoNom.motivo);
  check('Bloqueada: decisión del mes 6 (se guarda junto con el valor manual en conflicto)', est('agregar_resolucion_credito|emp:Osiris|rc_s6') === 'bloqueada');
  const histDesg = P1.items.find((it) => it.op === 'agregar_historial' && it.clave.includes('cr-3-2'));
  check('Bloqueada: bitácora del desglose en conflicto', histDesg && histDesg.estado === 'bloqueada');
  const histYian = P1.items.find((it) => it.op === 'agregar_historial' && it.clave.includes('cr-2-1'));
  check('Bloqueada: bitácora del pago con posible duplicado sin decisión', histYian && histYian.estado === 'bloqueada');
  check('Informe lista lo registrado en producción después del respaldo', P1.posterioresAlRespaldo.some((p) => p.registro.id === 'pg-prod-contrato') && P1.posterioresAlRespaldo.some((p) => p.registro.id === 'pg-prod-yian'));
  check('Sin advertencia de antigüedad (respaldo de 0 días) y aun así se comprobó cada operación', P1.advertencias.length === 0 && P1.items.every((it) => it.estado));
  const P1v = (await ensayo({ resultadoPath: RES, transporte, salida: path.join(OUT, '1b-ensayo-viejo'), ahora: new Date('2026-10-09T13:00:00Z') })).plan;
  check('Advertencia si el respaldo supera 7 días (solo advertencia)', P1v.advertencias.some((a) => /umbral de advertencia: 7/.test(a)) && P1v.resumen.aplicable === P1.resumen.aplicable);
  check('Informe y plantilla de decisiones generados', fs.existsSync(path.join(OUT, '1-ensayo', 'decisiones_plantilla.json')) && /BLOQUEADAS POR DEPENDENCIA/.test(E1.texto));

  // ── 2. Aplicar sin aprobación registrada → nada ─────────────────
  const plantilla = JSON.parse(fs.readFileSync(path.join(OUT, '1-ensayo', 'decisiones_plantilla.json'), 'utf8'));
  const DEC = path.join(OUT, 'decisiones.json');
  fs.writeFileSync(DEC, JSON.stringify(plantilla));
  let err = ''; try { await aplicar({ resultadoPath: RES, decisionesPath: DEC, transporte, salida: path.join(OUT, '2'), usuario: 'Prueba', sellos: false }); } catch (e) { err = e.message; }
  check('Sin aprobación registrada no se aplica nada', /no tienen la aprobación registrada/.test(err) && conteo.PATCH === 0);

  // ── 3. Aplicar lo aprobado: duplicados sin decisión no se aplican ─────
  const dupPago = Object.keys(plantilla.duplicados).find((k) => k.startsWith('agregar_pago|cr-2-1'));
  const dupSaldo = Object.keys(plantilla.duplicados).find((k) => k.includes('si-sesion'));
  check('La plantilla trae los 2 posibles duplicados con decisión vacía', !!dupPago && !!dupSaldo && Object.values(plantilla.duplicados).every((d) => d.decision === null));
  const aprobada = { ...plantilla, aprobadoPor: 'Angelo Huerta (PRUEBA)', fechaAprobacion: '2026-10-01' };
  fs.writeFileSync(DEC, JSON.stringify(aprobada, null, 2));
  const prodAntes = fila('finanzas');
  const A1 = await aplicar({ resultadoPath: RES, decisionesPath: DEC, transporte, salida: path.join(OUT, '3-aplicar'), usuario: 'Prueba', sellos: false, ahora: new Date('2026-10-01T13:05:00Z') });
  const F1 = fila('finanzas').v;
  check('Aplicación OK y verificación posterior OK', A1.audit.estado === 'ok' && A1.audit.verificacion.ok, A1.audit.estado + ' ' + (A1.audit.verificacion.fallas || []).join('|'));
  check('Pago del crédito antiguo aplicado y uid fijado', credito(F1, 'cr-1-0') && credito(F1, 'cr-1-0').pagos.length === 1 && credito(F1, 'cr-1-0').n === 1);
  check('Duplicado sin decisión NO aplicado (Yiannis conserva solo el pago de producción)', credito(F1, 'cr-2-1').pagos.map((p) => p.id).join() === 'pg-prod-yian');
  check('Saldo informado duplicado NO aplicado', F1.creditos_saldos_informados.map((x) => x.id).join() === 'si-prod');
  const C1 = credito(F1, 'cr-prueba-contrato');
  check('Contrato: pago anulado, impaga confirmada, pago de producción conservado, pago de nómina bloqueado', C1.pagos.find((p) => p.id === 'pg-prueba-1').anulado === true
    && C1.conciliaciones.length === 1 && C1.pagos.some((p) => p.id === 'pg-prod-contrato') && !C1.pagos.some((p) => p.origen));
  check('Cambios posteriores conservados: desglose de prod, cuota de prod, pago China, params_emp', !F1.creditos_data[2].uid && F1.creditos_data[2].desglose.capital === 128000
    && F1.creditos_data[3].cuota === 76000 && credito(F1, 'cr-5-4').pagos[0].id === 'pg-prod-china' && F1.params_emp.tc === 951);
  check('Valores manuales: mes 7 retirado con su decisión; mes 6 intacto (56000) sin decisión', F1.finanzas_real.Osiris._proyOverrides['Pago Préstamos - Total'][6] === 56000
    && F1.finanzas_real.Osiris._proyOverrides['Pago Préstamos - Total'][7] === undefined && F1.finanzas_real.Osiris._resolucionesCreditos.map((r) => r.id).join() === 'rc_s7');
  const N1 = fila('nominas_osiris');
  check('Nómina: L1 vinculada, L2 conserva el vínculo de producción; sigue guardada como texto', typeof JSON.parse(psql(`select value::text from calendario_data where id='nominas_osiris'`)) === 'string'
    && N1.v.nominas[0].items[0].creditoVinculo.vencKey.endsWith('2026-12-15') && N1.v.nominas[0].items[1].creditoVinculo.vencKey.endsWith('2026-12-15'));
  check('TC: el valor de producción del 30/09 (958) se conserva', fila('maestro_tc').v['USD-CLP'].find((e) => e.fecha === '2026-09-30').valor === 958);
  check('Config de tolerancias aplicada', F1.creditos_config.tolerancias.CLP === 2);
  const otras = Object.keys(prodAntes.v).filter((k) => JSON.stringify(prodAntes.v[k]) !== JSON.stringify(F1[k]));
  check('En finanzas solo cambiaron claves de Créditos', otras.every((k) => /^(creditos_data|creditos_saldos_informados|creditos_config|finanzas_real)$/.test(k)), otras.join());
  check('Registro de auditoría escrito (json + txt + jsonl)', fs.readdirSync(path.join(OUT, '3-aplicar')).some((f) => /^auditoria_.*\.json$/.test(f)) && fs.existsSync(path.join(OUT, '3-aplicar', 'auditoria.jsonl')));

  // ── 4. Decisión individual: omitir un duplicado, aplicar el otro ──────
  const dec2 = JSON.parse(fs.readFileSync(DEC, 'utf8'));
  dec2.duplicados[dupPago] = { decision: 'omitir', motivo: 'Es el mismo abono que Carol registró el 01/10 (cartola).' };
  dec2.duplicados[dupSaldo] = { decision: 'aplicar' };   // sin motivo: no cuenta
  dec2.aprobadas = [...dec2.aprobadas, dupSaldo];
  fs.writeFileSync(DEC, JSON.stringify(dec2, null, 2));
  const A2 = await aplicar({ resultadoPath: RES, decisionesPath: DEC, transporte, salida: path.join(OUT, '4-decisiones'), usuario: 'Prueba', sellos: false });
  const it2 = Object.fromEntries(A2.audit.operaciones.map((o) => [o.clave, o]));
  check('Decisión sin motivo no cuenta: el duplicado sigue pendiente', it2[dupSaldo].estado === 'pendiente_decision' && fila('finanzas').v.creditos_saldos_informados.length === 1);
  check('Duplicado omitido con motivo: queda "omitida" y su bitácora bloqueada', it2[dupPago].estado === 'omitida' && A2.audit.operaciones.some((o) => o.clave.startsWith('agregar_historial|cr-2-1') && o.estado === 'bloqueada'));
  dec2.duplicados[dupSaldo] = { decision: 'aplicar', motivo: 'Certificados distintos: el de producción es de otro tramo (PRUEBA).' };
  fs.writeFileSync(DEC, JSON.stringify(dec2, null, 2));
  const A3 = await aplicar({ resultadoPath: RES, decisionesPath: DEC, transporte, salida: path.join(OUT, '4-decisiones'), usuario: 'Prueba', sellos: false });
  check('Duplicado aprobado con motivo: se aplica', A3.audit.estado === 'ok' && fila('finanzas').v.creditos_saldos_informados.map((x) => x.id).join() === 'si-prod,si-sesion');

  // ── 5. Reintento del mismo resultado: no duplica ──────────────────────
  conteo.PATCH = 0;
  const F_antes = fila('finanzas');
  const A4 = await aplicar({ resultadoPath: RES, decisionesPath: DEC, transporte, salida: path.join(OUT, '5-reintento'), usuario: 'Prueba', sellos: false });
  const F_desp = fila('finanzas');
  check('Reintento: 0 escrituras, misma versión, nada duplicado', conteo.PATCH === 0 && F_antes.updated_at === F_desp.updated_at && A4.audit.aplicadas.length === 0
    && credito(F_desp.v, 'cr-1-0').pagos.length === 1 && F_desp.v.creditos_saldos_informados.length === 2 && credito(F_desp.v, 'cr-prueba-contrato').conciliaciones.length === 1);
  check('Reintento: lo ya hecho figura como "ya_aplicada"', A4.audit.operaciones.filter((o) => o.estado === 'ya_aplicada').length >= A1.audit.aplicadas.length);

  // ── 6. Otro guardado entre la lectura y la escritura → rechazo ────────
  cargarProduccion();
  const decC = { ...dec2 };
  fs.writeFileSync(DEC, JSON.stringify(decC, null, 2));
  const A5 = await aplicar({ resultadoPath: RES, decisionesPath: DEC, transporte, salida: path.join(OUT, '6-concurrencia'), usuario: 'Prueba', sellos: false, hooks: {
    antesDeEscribir: async (id) => {
      if (id !== 'finanzas') return;
      // simula a la app guardando (contrato de persistencia: PATCH condicionado con updated_at nuevo)
      const f = fila('finanzas'); f.v.params_emp = { tc: 999 };
      const r = await fetch(`${DESTINO}/rest/v1/calendario_data?id=eq.finanzas&updated_at=eq.${encodeURIComponent(f.updated_at)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' }, body: JSON.stringify({ value: f.v, updated_at: new Date().toISOString() }) });
      if ((await r.json()).length !== 1) throw new Error('la escritura simulada no se hizo');
    } } });
  const F5 = fila('finanzas').v;
  check('Escritura rechazada por la base (conflicto) y detenido sin escribir las filas siguientes', A5.audit.estado === 'detenido_sin_cambios' && A5.audit.detenido.motivo === 'conflicto'
    && A5.audit.escrituras.length === 1 && Date.parse(fila('nominas_osiris').updated_at) === Date.parse('2026-10-01T12:30:00.123Z'), JSON.stringify(A5.audit.detenido));
  check('El guardado concurrente quedó intacto y nada de la conciliación se escribió', F5.params_emp.tc === 999 && !credito(F5, 'cr-1-0'));
  const A6 = await aplicar({ resultadoPath: RES, decisionesPath: DEC, transporte, salida: path.join(OUT, '6-concurrencia'), usuario: 'Prueba', sellos: false });
  const F6 = fila('finanzas').v;
  check('Al repetir (relee y reclasifica) se aplica conservando el cambio concurrente', A6.audit.estado === 'ok' && F6.params_emp.tc === 999 && credito(F6, 'cr-1-0').pagos.length === 1);

  // ── 7. Carrera real en Postgres: el UPDATE condicionado espera y no actualiza ──
  cargarProduccion();
  const v0 = fila('finanzas').updated_at;
  const tx = spawn(`${PG_BIN}/psql`, ['-h', '127.0.0.1', '-p', String(PG_PORT), '-U', 'postgres', '-d', 'postgres', '-qAt', '-c',
    `begin; update calendario_data set value = jsonb_set(value, '{params_emp,tc}', '777'), updated_at = clock_timestamp() where id='finanzas'; select pg_sleep(1.5); commit;`], { stdio: 'ignore' });
  const txFin = new Promise((r) => tx.on('exit', r));
  await espera(400);   // la otra transacción ya tiene la fila bloqueada
  const t0 = Date.now();
  const rCas = await transporte.escribirCondicionado('finanzas', v0, { pisado: true }, new Date().toISOString());
  const dt = Date.now() - t0;
  await txFin;
  check('Carrera: el PATCH condicionado esperó el bloqueo y devolvió 0 filas (conflicto)', rCas.ok === false && rCas.motivo === 'conflicto' && dt > 700, `espera ${dt} ms`);
  check('Carrera: prevaleció la otra transacción, no la escritura condicionada', fila('finanzas').v.params_emp.tc === 777);

  // ── 8. Hueco: un escritor que NO cambia updated_at ─────────────────────
  cargarProduccion();
  const v1 = fila('finanzas').updated_at;
  psql(`update calendario_data set value = jsonb_set(value, '{params_emp,tc}', '555') where id='finanzas'`);   // p. ej. edición directa en el panel SQL
  const rHueco = await transporte.escribirCondicionado('finanzas', v1, { pisado: true }, new Date().toISOString());
  check('HUECO documentado: si un escritor no cambia updated_at, la condición no lo detecta', rHueco.ok === true && fila('finanzas').v.pisado === true);
  // Cierre: trigger que fija updated_at en el servidor en TODA actualización
  psqlArchivo(path.join(AQUI, 'propuesta-trigger-version.sql'));   // la propuesta TAL CUAL
  cargarProduccion();
  const v2 = fila('finanzas').updated_at;
  psql(`update calendario_data set value = jsonb_set(value, '{params_emp,tc}', '555') where id='finanzas'`);
  const rTrig = await transporte.escribirCondicionado('finanzas', v2, { pisado: true }, new Date().toISOString());
  check('Con el trigger, la misma edición directa sí se detecta (0 filas)', rTrig.ok === false && rTrig.motivo === 'conflicto' && fila('finanzas').v.params_emp.tc === 555);
  const f3 = fila('finanzas');
  const rApp = await transporte.escribirCondicionado('finanzas', f3.updated_at, f3.v, '2000-01-01T00:00:00.000Z');
  check('Con el trigger, una escritura condicionada normal sigue funcionando y devuelve la versión del servidor', rApp.ok === true && !rApp.updatedAt.startsWith('2000-01-01'));
  cargarProduccion();
  const A7 = await aplicar({ resultadoPath: RES, decisionesPath: DEC, transporte, salida: path.join(OUT, '8-con-trigger'), usuario: 'Prueba', sellos: false });
  check('Con el trigger, el script completo aplica y verifica OK', A7.audit.estado === 'ok', A7.audit.estado + ' ' + (A7.audit.verificacion.fallas || []).join('|'));

  // ══ T. Trigger de versión: compatibilidad con los módulos REALES de la app ══
  // persistContract y friskuHelpers se importan tal cual desde src/. Su fetch
  // pasa por un filtro: la URL de producción se redirige a la base LOCAL y
  // cualquier otro destino se bloquea (no sale nada a internet).
  register(pathToFileURL(path.join(AQUI, 'resolver-src.mjs')));
  const PROD = 'https://bywovqayuzodbzwsriet.supabase.co';
  const fetchOriginal = globalThis.fetch;
  let salidasBloqueadas = 0;
  globalThis.fetch = (url, o = {}) => {
    let u = String(url);
    if (u.startsWith(PROD)) { u = DESTINO + u.slice(PROD.length); o = { ...o, headers: { ...(o.headers || {}), apikey: ANON, Authorization: `Bearer ${ANON}` } }; }
    else if (!u.startsWith(DESTINO)) { salidasBloqueadas++; return Promise.reject(new Error('salida bloqueada en la prueba: ' + u)); }
    return fetchOriginal(u, o);
  };
  const { crearPersistencia } = await import('../../src/persistencia/persistContract.js');
  const frisku = await import('../../src/friskuHelpers.js');
  const silencio = { info() {}, warn() {}, error() {} };
  const persistApp = () => crearPersistencia({ fetch: globalThis.fetch, supaUrl: PROD, supaKey: 'llave-de-prueba', logger: silencio });
  const verTipo = psql(`select data_type from information_schema.columns where table_name='calendario_data' and column_name='updated_at'`);
  check('T0. Trigger instalado desde propuesta-trigger-version.sql (INSERT y UPDATE) sobre updated_at timestamptz',
    psql(`select string_agg(tgname||':'||tgtype::text, ',') from pg_trigger where tgrelid='public.calendario_data'::regclass and not tgisinternal`) === 'calendario_data_version:23' && verTipo === 'timestamp with time zone');
  psql(`insert into calendario_data (id, value, updated_at) values ('compat_blob', '{"a":1}', '1999-01-01T00:00:00Z'), ('compat_lista', '[{"id":"x1","v":1}]', '1999-01-01T00:00:00Z'), ('compat_frisku', '[{"id":"f1","vv":1}]', '1999-01-01T00:00:00Z')`);
  check('T1. INSERT: la versión la pone la base (se ignora la del cliente)', !fila('compat_blob').updated_at.startsWith('1999'));
  // persistContract (finanzas, main, pins, allegria…): carga, dos guardados, conflicto
  const pA = persistApp();
  const cA = await pA.load('compat_blob');
  const g1 = await pA.saveConfirmed('compat_blob', { a: 2 });
  const g2 = await pA.saveConfirmed('compat_blob', { a: 3 });
  check('T2. persistContract real: dos guardados seguidos OK con la versión del servidor (con microsegundos)', g1.ok && g2.ok && g2.version === fila('compat_blob').updated_at && g1.version !== cA.version && fila('compat_blob').v.a === 3, `${cA.version} → ${g1.version} → ${g2.version}`);
  psql(`update calendario_data set value = '{"a":99}' where id='compat_blob'`);   // edición directa SIN tocar updated_at
  const g3 = await pA.saveConfirmed('compat_blob', { a: 4 });
  check('T3. persistContract real: tras una edición directa sin updated_at, su guardado se rechaza (conflicto) y no pisa', g3.ok === false && g3.motivo === 'conflicto' && fila('compat_blob').v.a === 99);
  // persistContract en fila-colección: fusión por ítem con otra sesión
  const pB = persistApp(), pC = persistApp();
  await pB.load('compat_lista'); await pC.load('compat_lista');
  const gB = await pB.saveConfirmed('compat_lista', [{ id: 'x1', v: 1 }, { id: 'x2', v: 2 }], { merge: true });
  const gC = await pC.saveConfirmed('compat_lista', [{ id: 'x1', v: 1 }, { id: 'x3', v: 3 }], { merge: true });
  check('T4. persistContract real: dos sesiones en una colección se fusionan por ítem con el trigger', gB.ok && gC.ok && gC.fusionado && fila('compat_lista').v.map((x) => x.id).sort().join() === 'x1,x2,x3');
  // friskuHelpers (maestros, Frisku, rendiciones)
  frisku._resetPersistencia();
  await frisku.dbLoadGeneric('compat_frisku');
  // (claves de igual largo: jsonb ordena las claves por largo y la fusión de la app
  //  compara sensible al orden; ese efecto es previo e independiente del trigger)
  const fr1 = await frisku.dbSaveGeneric('compat_frisku', [{ id: 'f1', vv: 2 }]);
  const fr2 = await frisku.dbSaveGeneric('compat_frisku', [{ id: 'f1', vv: 3 }]);
  psql(`update calendario_data set value = '[{"id":"f1","vv":3},{"id":"f9","vv":9}]' where id='compat_frisku'`);
  const fr3 = await frisku.dbSaveGeneric('compat_frisku', [{ id: 'f1', vv: 4 }]);
  const lf = fila('compat_frisku').v.map((x) => `${x.id}=${x.vv}`).sort().join();
  check('T5. friskuHelpers real: guardados seguidos OK y, ante una edición ajena, fusiona sin perderla', fr1.ok && fr2.ok && fr3.ok && fr3.fusionado && lf === 'f1=4,f9=9', lf);
  // upsert sin condición (nóminas, auditoría, respaldo, Restaurar) — mismo request que el código
  const ru = await fetch(`${DESTINO}/rest/v1/calendario_data`, { method: 'POST', headers: { ...cabApp, Prefer: 'resolution=merge-duplicates' }, body: JSON.stringify({ id: 'compat_blob', value: JSON.stringify({ a: 5 }), updated_at: '2001-01-01T00:00:00.000Z' }) });
  check('T6. Upsert sin condición (como nóminas/Restaurar): se guarda y la versión la pone la base', ru.ok && !fila('compat_blob').updated_at.startsWith('2001') && fila('compat_blob').v.a === 5);
  const vv = psql(`begin; update calendario_data set value='{"b":1}' where id='compat_blob'; select updated_at::text from calendario_data where id='compat_blob'; update calendario_data set value='{"b":2}' where id='compat_blob'; select updated_at::text from calendario_data where id='compat_blob'; commit;`).split('\n');
  check('T7. Dos actualizaciones en la misma transacción: la versión cambia en cada una', vv.length === 2 && vv[0] !== vv[1] && vv[1] > vv[0], vv.join(' → '));
  check('T8. Ninguna llamada salió fuera de la base local', salidasBloqueadas === 0);

  // ══ S. Sellos: una sesión con datos antiguos no puede deshacer lo aplicado ══
  psqlArchivo(path.join(AQUI, 'propuesta-sellos.sql'));   // la propuesta TAL CUAL
  for (let i = 0; i < 30; i++) { const r = await fetch(`${DESTINO}/rest/v1/calendario_data_sellos?select=id&limit=1`, { headers: { apikey: SERVICIO, Authorization: `Bearer ${SERVICIO}` } }); if (r.ok) break; await espera(200); }
  cargarProduccion();
  const viejoN = fila('nominas_osiris').v;                 // lo que tenía cargado una pestaña ANTES de aplicar
  const viejoF = fila('finanzas');
  const pViejo = persistApp(); await pViejo.load('finanzas');   // pestaña antigua de Finanzas (contrato real)
  const AS = await aplicar({ resultadoPath: RES, decisionesPath: DEC, transporte, salida: path.join(OUT, 'S-sellos'), usuario: 'Prueba' });
  check('S1. Aplicación con sellos OK y verificada', AS.audit.estado === 'ok' && AS.audit.verificacion.ok, AS.audit.estado + ' ' + JSON.stringify(AS.audit.detenido) + ' ' + (AS.audit.verificacion.fallas || []).join('|'));
  const nSellos = Number(psql(`select count(*) from calendario_data_sellos where levantado_en is null`));
  check('S2. Un sello por operación aplicada', nSellos === AS.audit.aplicadas.length && nSellos > 0, `${nSellos} sellos / ${AS.audit.aplicadas.length} op.`);
  // ¿cada sello se cumple sobre la fila escrita? (valida las rutas jsonpath)
  const incumplidos = psql(`select count(*) from calendario_data_sellos s join calendario_data d on d.id = s.fila
     where s.levantado_en is null and not (case s.modo when 'existe' then coalesce(jsonb_path_exists(calendario_data_json(d.value), s.ruta), false)
       when 'ausente' then not coalesce(jsonb_path_exists(calendario_data_json(d.value), s.ruta), false)
       else jsonb_path_query_first(calendario_data_json(d.value), s.ruta) is not distinct from s.valor end)`);
  check('S3. Todos los sellos se cumplen sobre lo escrito (rutas correctas)', incumplidos === '0', incumplidos);
  // pestaña de nóminas con datos antiguos guarda (request idéntico a dbSaveNominas) con una edición suya
  viejoN.nominas[0].items[1].detalle = 'edición de una pestaña antigua';
  const rViejo = await fetch(`${DESTINO}/rest/v1/calendario_data`, { method: 'POST', headers: { ...cabApp, Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify({ id: 'nominas_osiris', value: JSON.stringify({ nominas: viejoN.nominas, empresa: 'Osiris' }), updated_at: new Date().toISOString() }) });
  const txtViejo = await rViejo.text();
  const nDesp = fila('nominas_osiris').v.nominas[0].items;
  check('S4. Nóminas: la pestaña antigua es rechazada (HTTP 400, MEDITERRA_SELLO) y los vínculos aplicados siguen',
    rViejo.status === 400 && /MEDITERRA_SELLO/.test(txtViejo) && nDesp[0].creditoVinculo && nDesp[2].creditoVinculo && !nDesp[3].creditoVinculo, `HTTP ${rViejo.status}`);
  // una sesión al día (recargada) guarda normal
  const fresca = fila('nominas_osiris').v; fresca.nominas[0].items[1].detalle = 'edición de una sesión al día';
  const rFresca = await fetch(`${DESTINO}/rest/v1/calendario_data`, { method: 'POST', headers: { ...cabApp, Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify({ id: 'nominas_osiris', value: JSON.stringify({ nominas: fresca.nominas, empresa: 'Osiris' }), updated_at: new Date().toISOString() }) });
  check('S5. Nóminas: una sesión al día guarda normal', rFresca.ok && fila('nominas_osiris').v.nominas[0].items[1].detalle === 'edición de una sesión al día');
  // Finanzas: la pestaña antigua usa el contrato de persistencia → conflicto; un "Restaurar"/upsert antiguo → sello
  const gViejo = await pViejo.saveConfirmed('finanzas', { ...viejoF.v, params_emp: { tc: 1 } });
  check('S6. Finanzas: pestaña antigua con el contrato real → conflicto, no pisa', gViejo.ok === false && gViejo.motivo === 'conflicto' && credito(fila('finanzas').v, 'cr-1-0'));
  const rRest = await fetch(`${DESTINO}/rest/v1/calendario_data`, { method: 'POST', headers: { ...cabApp, Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify({ id: 'finanzas', value: viejoF.v, updated_at: new Date().toISOString() }) });
  check('S7. Finanzas: un upsert con datos antiguos (como "Restaurar") se rechaza por sello', rRest.status === 400 && credito(fila('finanzas').v, 'cr-1-0').pagos.length === 1);
  // cambio legítimo: anular un pago aplicado (el sello exige que exista, no que esté vigente)
  const pHoy = persistApp(); const cHoy = await pHoy.load('finanzas');
  const Fh = JSON.parse(JSON.stringify(cHoy.value)); const c10 = credito(Fh, 'cr-1-0'); c10.pagos[0] = { ...c10.pagos[0], anulado: true, motivoAnulacion: 'prueba', anuladoPor: 'Prueba', anuladoTs: new Date().toISOString() };
  const gHoy = await pHoy.saveConfirmed('finanzas', Fh);
  check('S8. Cambio legítimo permitido: anular un pago aplicado por la conciliación', gHoy.ok === true);
  // permisos: la llave pública no crea ni levanta sellos
  const rAnon1 = await fetch(`${DESTINO}/rest/v1/calendario_data_sellos`, { method: 'POST', headers: cabApp, body: JSON.stringify({ id: 'x', fila: 'finanzas', ruta: '$.a', modo: 'existe', operacion: 'x', conciliacion: 'x', vence_en: '2030-01-01' }) });
  const rAnon2 = await fetch(`${DESTINO}/rest/v1/calendario_data_sellos?levantado_en=is.null`, { method: 'PATCH', headers: cabApp, body: JSON.stringify({ levantado_en: new Date().toISOString() }) });
  check('S9. La llave pública (anon) no puede crear ni levantar sellos', [401, 403].includes(rAnon1.status) && [401, 403].includes(rAnon2.status) && Number(psql(`select count(*) from calendario_data_sellos where levantado_en is null`)) === nSellos, `${rAnon1.status}/${rAnon2.status}`);
  // levantar los sellos (consulta documentada) → la pestaña antigua vuelve a poder pisar: el sello es la protección
  psql(`update public.calendario_data_sellos set levantado_en = now(), levantado_por = 'Prueba', motivo_levantamiento = 'prueba' where conciliacion = '${AS.audit.resultado.sha256}' and levantado_en is null`);
  const rViejo2 = await fetch(`${DESTINO}/rest/v1/calendario_data`, { method: 'POST', headers: { ...cabApp, Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify({ id: 'nominas_osiris', value: JSON.stringify({ nominas: viejoN.nominas, empresa: 'Osiris' }), updated_at: new Date().toISOString() }) });
  check('S10. Con los sellos levantados, la misma pestaña antigua SÍ pisa (por eso los sellos tienen vigencia y se levantan con registro)', rViejo2.ok && !fila('nominas_osiris').v.nominas[0].items[2].creditoVinculo);

  // ══ P. Falla entre filas y reintento ══════════════════════════════════
  // Plan: 1) finanzas (alta del crédito nuevo, anulación de pg-l4…) 2) nómina (L1)
  //       3) nómina (vínculo L3, desvínculo L4) 4) finanzas (pago que sale de L3)
  const invariantes = () => invariantesNominaCredito({ finanzas: fila('finanzas').v, nominas_osiris: fila('nominas_osiris').v });
  const pagosDe = (F, uid, id) => (credito(F, uid) ? credito(F, uid).pagos.filter((p) => p.id === id).length : 0);
  const pagoL3 = resultado.operaciones.find((o) => o.op === 'agregar_credito').registro.pagos[0].id;
  // P0. qué pasaría con el orden ingenuo (toda finanzas primero) si la nómina falla
  { const fin = estadoProduccion(); const Ffinal = JSON.parse(JSON.stringify(fin.finanzas.value)); Ffinal.creditos_data.push(resultado.operaciones.find((o) => o.op === 'agregar_credito').registro);
    const inv = invariantesNominaCredito({ finanzas: Ffinal, nominas_osiris: fin.nominas_osiris.value });
    check('P0. Orden ingenuo (finanzas completa y falla nóminas) dejaría un pago de nómina sin vínculo', inv.some((x) => x.includes(pagoL3)), inv.join(' | ')); }
  // P1. Finanzas se guarda y la PRIMERA escritura de nóminas falla
  cargarProduccion();
  fallarEn = { fila: 'nominas_osiris', restantes: 1 };
  const AP1 = await aplicar({ resultadoPath: RES, decisionesPath: DEC, transporte, salida: path.join(OUT, 'P-parcial'), usuario: 'Prueba' });
  fallarEn = null;
  const FP1 = fila('finanzas').v;
  check('P1. Finanzas escrita, nóminas falló (503): resultado "parcial_detenido" y nada más se escribió', AP1.audit.estado === 'parcial_detenido' && AP1.audit.escrituras.map((e) => `${e.fila}:${e.ok}`).join() === 'finanzas:true,nominas_osiris:false', AP1.audit.escrituras.map((e) => `${e.fila}:${e.ok}`).join());
  check('P2. Estado intermedio coherente: crédito nuevo SIN el pago de L3, pg-l4 anulado con L4 aún vinculada, 0 inconsistencias',
    credito(FP1, 'cr-sesion-nuevo') && pagosDe(FP1, 'cr-sesion-nuevo', pagoL3) === 0 && credito(FP1, 'cr-prueba-l4').pagos[0].anulado === true && invariantes().length === 0, invariantes().join(' | '));
  check('P3. Los sellos de lo no escrito se levantaron (no quedan protegiendo nada)', Number(psql(`select count(*) from calendario_data_sellos where conciliacion='${AP1.audit.resultado.sha256}' and levantado_en is null and fila='nominas_osiris'`)) === 0);
  const AP2 = await aplicar({ resultadoPath: RES, decisionesPath: DEC, transporte, salida: path.join(OUT, 'P-parcial'), usuario: 'Prueba' });
  const FP2 = fila('finanzas').v, NP2 = fila('nominas_osiris').v.nominas[0].items;
  check('P4. Reintento: relee, completa lo pendiente (nómina y luego el pago de L3) y verifica OK', AP2.audit.estado === 'ok' && AP2.audit.escrituras.map((e) => e.fila).join() === 'nominas_osiris,finanzas' && AP2.audit.verificacion.ok, AP2.audit.escrituras.map((e) => e.fila).join());
  check('P5. Reintento: pago de L3 una sola vez, L3 vinculada, L4 desvinculada, pago de Zelun una sola vez, 0 inconsistencias',
    pagosDe(FP2, 'cr-sesion-nuevo', pagoL3) === 1 && NP2[2].creditoVinculo && !NP2[3].creditoVinculo && credito(FP2, 'cr-1-0').pagos.length === 1 && invariantes().length === 0);
  check('P6. Reintento: los sellos de las operaciones completadas quedan vigentes', Number(psql(`select count(*) from calendario_data_sellos where conciliacion='${AP2.audit.resultado.sha256}' and levantado_en is null`)) === AP1.audit.aplicadas.length + AP2.audit.aplicadas.length);
  // P7. La falla en la ÚLTIMA escritura (pago de L3): queda L3 vinculada sin pago (válido: vincular no paga)
  cargarProduccion(); psql(`update calendario_data_sellos set levantado_en = now() where levantado_en is null`);
  let nFin = 0;
  const AP3 = await aplicar({ resultadoPath: RES, decisionesPath: DEC, transporte, salida: path.join(OUT, 'P-parcial-final'), usuario: 'Prueba',
    hooks: { antesDeEscribir: (id) => { if (id === 'finanzas' && ++nFin === 2) fallarEn = { fila: 'finanzas', restantes: 1 }; } } });
  fallarEn = null;
  check('P7. Falla en la última escritura (finanzas, pago de L3): L3 vinculada sin pago, 0 inconsistencias', AP3.audit.estado === 'parcial_detenido'
    && fila('nominas_osiris').v.nominas[0].items[2].creditoVinculo && pagosDe(fila('finanzas').v, 'cr-sesion-nuevo', pagoL3) === 0 && invariantes().length === 0);
  const AP4 = await aplicar({ resultadoPath: RES, decisionesPath: DEC, transporte, salida: path.join(OUT, 'P-parcial-final'), usuario: 'Prueba' });
  const AP5 = await aplicar({ resultadoPath: RES, decisionesPath: DEC, transporte, salida: path.join(OUT, 'P-parcial-final'), usuario: 'Prueba' });
  check('P8. Reintento completa solo el pago (1 escritura); un tercer intento no escribe nada; pago una sola vez',
    AP4.audit.estado === 'ok' && AP4.audit.escrituras.length === 1 && AP5.audit.escrituras.length === 0 && pagosDe(fila('finanzas').v, 'cr-sesion-nuevo', pagoL3) === 1);

  // ══ R. Reversión de ambas propuestas ═════════════════════════════════
  const reversion = [
    'drop trigger if exists calendario_data_respetar_sellos on public.calendario_data;',
    'drop function if exists public.calendario_data_respetar_sellos();',
    'drop function if exists public.calendario_data_json(jsonb);',
    'drop trigger if exists calendario_data_version on public.calendario_data;',
    'drop function if exists public.calendario_data_version();',
  ];
  const textoProp = fs.readFileSync(path.join(AQUI, 'propuesta-trigger-version.sql'), 'utf8') + fs.readFileSync(path.join(AQUI, 'propuesta-sellos.sql'), 'utf8');
  check('R1. Las instrucciones de reversión probadas son las que figuran en las propuestas', reversion.every((l) => textoProp.includes(l)));
  psql(reversion.join(' '));
  check('R2. Tras revertir no queda ningún trigger en calendario_data', psql(`select count(*) from pg_trigger where tgrelid='public.calendario_data'::regclass and not tgisinternal`) === '0');
  const rv = await fetch(`${DESTINO}/rest/v1/calendario_data`, { method: 'POST', headers: { ...cabApp, Prefer: 'resolution=merge-duplicates' }, body: JSON.stringify({ id: 'compat_blob', value: { r: 1 }, updated_at: '2026-10-01T15:00:00.000Z' }) });
  check('R3. Tras revertir, la versión vuelve a ser la del cliente (comportamiento actual)', rv.ok && Date.parse(fila('compat_blob').updated_at) === Date.parse('2026-10-01T15:00:00.000Z'));
  const pR = persistApp(); await pR.load('compat_blob'); const gR = await pR.saveConfirmed('compat_blob', { r: 2 });
  check('R4. Tras revertir, el contrato de persistencia real sigue funcionando', gR.ok && fila('compat_blob').v.r === 2);
  globalThis.fetch = fetchOriginal;

  // ── 9. Respaldo original intacto ─────────────────────────────────────
  check('El respaldo de prueba no se modificó (SHA-256)', sha256(textoRespaldo) === shaRespaldoArchivo && resultado.respaldo.sha256 === shaRespaldoArchivo);
} catch (e) {
  console.error(e); fallos++;
} finally {
  await cerrar();
}
console.log(fallos ? `\n${fallos} FALLA(S)` : `\nTodo OK. Informes y auditoría en ${OUT}`);
process.exit(fallos ? 1 : 0);
