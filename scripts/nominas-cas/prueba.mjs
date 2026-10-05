/* ─────────────────────────────────────────────────────────────────────────
   PRUEBA LOCAL de supabase/propuesta_nominas_version_obligatoria.sql
   — SOLO DATOS DE PRUEBA, sin conexión a producción.

   Levanta Postgres 16 + PostgREST 12 LOCALES con los roles de Supabase (anon,
   authenticated, service_role) y las 5 políticas de calendario_data tal como
   se leyeron en producción. Ejecuta las partes del archivo TAL CUAL y prueba
   por la API REST (por donde pasa la app):
     · las peticiones EXACTAS del código de producción (upsert sin condición) y
       de la rama actual (PATCH con filtro / POST sin merge) antes y después;
     · el transporte de la app (src/nominasTransporteRpc.js) con
       guardarFila REAL de src/nominasPersistencia.js: ediciones simultáneas,
       conflicto, creación simultánea, carrera real, respuesta perdida;
     · filas excluidas, restauración con service_role/SQL, intentos de saltarse
       la regla, la verificación (PARTE 3) y la reversión;
     · la consulta de respaldos (supabase/consulta_respaldos_existentes.sql):
       lista fechas y tamaños sin mostrar contenido.
     · caminos para eludir el control: función SECURITY DEFINER publicada, vista
       actualizable, variable fijada por rol, set_config falsa en public (K, B3b);
     · la foto de verificación de la activación (supabase/verificar_activacion_nominas.sql, L).
   No reproduce los dos triggers que ya existen en producción
   (trg_cd_scrub_main, trg_guard_main_no_user_shrink): su código completo está
   pendiente (consulta 7). Hay que repetir esta prueba con ellos antes de aplicar.

     POSTGREST_BIN=/ruta/postgrest node scripts/nominas-cas/prueba.mjs
   ───────────────────────────────────────────────────────────────────────── */
import fs from 'fs';
import os from 'os';
import path from 'path';
import http from 'http';
import crypto from 'crypto';
import { spawn, execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
import { guardarFila } from '../../src/nominasPersistencia.js';
import { crearTransporteRpc } from '../../src/nominasTransporteRpc.js';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.join(AQUI, '../..');
const SQL = fs.readFileSync(path.join(RAIZ, 'supabase/propuesta_nominas_version_obligatoria.sql'), 'utf8');
const SQL_REV = fs.readFileSync(path.join(RAIZ, 'supabase/propuesta_nominas_version_obligatoria_reversion.sql'), 'utf8');
const PG_BIN = process.env.PG_BIN || '/usr/lib/postgresql/16/bin';
const POSTGREST_BIN = process.env.POSTGREST_BIN;
if (!POSTGREST_BIN || !fs.existsSync(POSTGREST_BIN)) { console.error('Falta POSTGREST_BIN (binario de PostgREST 12).'); process.exit(2); }
const PG_PORT = 54332, PGRST_PORT = 3913, PROXY_PORT = 3903, BASE = `http://127.0.0.1:${PROXY_PORT}`;
let fallos = 0;
const check = (n, c, x = '') => { console.log(`${c ? '✓' : '✗ FALLA'}  ${n}${x ? '  — ' + x : ''}`); if (!c) fallos++; };
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Postgres + PostgREST ───────────────────────────────────────────────
const esRoot = process.getuid && process.getuid() === 0;
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'nomcas-pg-'));
if (esRoot) execFileSync('chown', ['-R', 'postgres', DATA]);
const comoPg = (cmd, args) => (esRoot ? ['runuser', ['-u', 'postgres', '--', cmd, ...args]] : [cmd, args]);
execFileSync(...comoPg(`${PG_BIN}/initdb`, ['-D', DATA, '-A', 'trust', '-U', 'postgres']), { stdio: 'ignore' });
const [c1, a1] = comoPg(`${PG_BIN}/postgres`, ['-D', DATA, '-p', String(PG_PORT), '-k', DATA, '-c', 'listen_addresses=127.0.0.1']);
spawn(c1, a1, { stdio: 'ignore' });
const detenerPg = () => { try { execFileSync(...comoPg(`${PG_BIN}/pg_ctl`, ['-D', DATA, '-m', 'immediate', 'stop']), { stdio: 'ignore' }); } catch (e) {} };
let pgrst = null, proxy = null;
process.on('exit', () => { try { pgrst && pgrst.kill(); } catch (e) {} try { proxy && proxy.close(); } catch (e) {} detenerPg(); try { fs.rmSync(DATA, { recursive: true, force: true }); } catch (e) {} });
const psqlArgs = ['-h', '127.0.0.1', '-p', String(PG_PORT), '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-qAt'];
const psql = (sql) => execFileSync(`${PG_BIN}/psql`, [...psqlArgs, '-c', sql], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const psqlTexto = (sql) => { const f = path.join(DATA, `q${Date.now()}${Math.random()}.sql`); fs.writeFileSync(f, sql); if (esRoot) execFileSync('chown', ['postgres', f]);
  try { return { ok: true, salida: execFileSync(`${PG_BIN}/psql`, [...psqlArgs, '-f', f], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) }; }
  catch (e) { return { ok: false, salida: String(e.stderr || e.message) }; } };
for (let i = 0; i < 50; i++) { try { psql('select 1'); break; } catch (e) { await espera(200); } }

psql(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  create role authenticator login noinherit; grant anon, authenticated, service_role to authenticator;
  create table public.calendario_data (id text primary key, value jsonb not null, updated_at timestamptz default now());
  grant all on public.calendario_data to anon, authenticated, service_role;
  alter table public.calendario_data enable row level security;
  create policy cd_anon_auth_delete on public.calendario_data as permissive for delete to authenticated, anon using ((id !~~ 'backup%'::text) and (id !~~ 'main_pre_restore%'::text));
  create policy cd_anon_auth_insert on public.calendario_data as permissive for insert to authenticated, anon with check ((id !~~ 'backup%'::text) and (id !~~ 'main_pre_restore%'::text));
  create policy cd_anon_auth_select on public.calendario_data as permissive for select to authenticated, anon using ((id !~~ 'backup%'::text) and (id !~~ 'main_pre_restore%'::text));
  create policy cd_anon_auth_update on public.calendario_data as permissive for update to authenticated, anon using ((id !~~ 'backup%'::text) and (id !~~ 'main_pre_restore%'::text)) with check ((id !~~ 'backup%'::text) and (id !~~ 'main_pre_restore%'::text));
  create policy cd_service_all on public.calendario_data as permissive for all to service_role using (true) with check (true);`);
const SECRETO = 'prueba-local-solo-para-tests-0123456789abcdef';
const b64u = (x) => Buffer.from(JSON.stringify(x)).toString('base64url');
const jwt = (p) => { const h = b64u({ alg: 'HS256', typ: 'JWT' }), q = b64u(p); return `${h}.${q}.${crypto.createHmac('sha256', SECRETO).update(`${h}.${q}`).digest('base64url')}`; };
const ANON = jwt({ role: 'anon' }), SERV = jwt({ role: 'service_role' });
const conf = path.join(DATA, 'pgrst.conf');
fs.writeFileSync(conf, `db-uri = "postgres://authenticator@127.0.0.1:${PG_PORT}/postgres"\ndb-schemas = "public"\ndb-anon-role = "anon"\njwt-secret = "${SECRETO}"\nserver-host = "127.0.0.1"\nserver-port = ${PGRST_PORT}\n`);
pgrst = spawn(POSTGREST_BIN, [conf], { stdio: 'ignore' });
// Proxy /rest/v1 → PostgREST (como el gateway de Supabase). Cuenta las llamadas a
// la función y puede PERDER la respuesta de la próxima (la base sí escribe).
const llamadas = { rpc: 0 };
let perderProxima = false;
proxy = http.createServer((req, res) => {
  const esRpc = req.url.startsWith('/rest/v1/rpc/nominas_guardar');
  if (esRpc) llamadas.rpc++;
  const perder = esRpc && perderProxima; if (perder) perderProxima = false;
  const p = http.request({ host: '127.0.0.1', port: PGRST_PORT, path: req.url.replace(/^\/rest\/v1/, ''), method: req.method, headers: req.headers }, (r) => {
    if (perder) { r.resume(); r.on('end', () => req.socket.destroy()); return; }
    res.writeHead(r.statusCode, r.headers); r.pipe(res);
  });
  p.on('error', (e) => { res.writeHead(502); res.end(String(e)); });
  req.pipe(p);
});
await new Promise((r) => proxy.listen(PROXY_PORT, '127.0.0.1', r));
for (let i = 0; i < 50; i++) { try { const r = await fetch(`${BASE}/rest/v1/calendario_data?select=id`, { headers: { apikey: ANON, Authorization: `Bearer ${ANON}` } }); if (r.ok) break; } catch (e) {} await espera(200); }
const recargarEsquema = async () => { psql(`notify pgrst, 'reload schema'`); await espera(900); };

// ── peticiones tal como las hace cada versión del cliente ───────────────
const H = (k) => ({ apikey: k, Authorization: `Bearer ${k}`, 'Content-Type': 'application/json' });
const texto = (empresa, nominas) => JSON.stringify({ nominas, empresa });
// Producción (origin/main, dbSaveNominas) y el panel de migración: upsert sin condición.
const upsertAntiguo = (id, valorTexto, k = ANON) => fetch(`${BASE}/rest/v1/calendario_data`, { method: 'POST',
  headers: { ...H(k), Prefer: 'resolution=merge-duplicates' }, body: JSON.stringify({ id, value: valorTexto, updated_at: new Date().toISOString() }) });
// Rama actual (transporteNominas): PATCH con filtro de versión / POST sin merge.
const patchRama = (id, version, valorTexto) => fetch(`${BASE}/rest/v1/calendario_data?id=eq.${encodeURIComponent(id)}&updated_at=eq.${encodeURIComponent(version)}`, { method: 'PATCH',
  headers: { ...H(ANON), Prefer: 'return=representation' }, body: JSON.stringify({ value: valorTexto, updated_at: new Date().toISOString() }) });
const postRama = (id, valorTexto) => fetch(`${BASE}/rest/v1/calendario_data`, { method: 'POST',
  headers: { ...H(ANON), Prefer: 'return=representation' }, body: JSON.stringify({ id, value: valorTexto, updated_at: new Date().toISOString() }) });
const rpc = (cuerpo, k = ANON) => fetch(`${BASE}/rest/v1/rpc/nominas_guardar`, { method: 'POST', headers: H(k), body: JSON.stringify(cuerpo) });
const T = crearTransporteRpc({ url: BASE, key: ANON });

const fila = (id) => { const r = psql(`select coalesce(value #>> '{}', '') || '¦' || updated_at from calendario_data where id = '${id}'`); if (!r) return null; const [v, u] = r.split('¦'); return { texto: v, updated_at: u }; };
const nominasDe = (id) => JSON.parse(fila(id).texto).nominas;
const huella = () => psql(`select md5(string_agg(id || value::text || updated_at::text, '|' order by id)) from calendario_data`);
const nom = (id, extra = {}) => ({ id, empresa: 'Osiris', semana: 40, anio: 2026, estado: 'borrador', notas: '', items: [{ id: `${id}-L1`, detalle: 'línea', monto: 100 }], historial: [], ...extra });
function sembrar() {
  psql(`truncate calendario_data`);
  const filas = [
    ['nominas_osiris', texto('Osiris', [nom('A'), nom('B')])],
    ['nominas_mediterra', texto('Mediterra', [{ ...nom('M'), empresa: 'Mediterra' }])],
    ['nominas', JSON.stringify({ nominas: [nom('VIEJA')] })],
    ['nominas_v2_done', JSON.stringify({ migrado: true })],
    ['nominas_tipos_doc', JSON.stringify(['Factura'])],
    ['finanzas', null],
  ];
  for (const [id, t] of filas) psql(`insert into calendario_data (id, value, updated_at) values ('${id}', ${t === null ? `'{"a":1}'::jsonb` : `to_jsonb(${pgTexto(t)}::text)`}, '2026-10-01T12:00:00.000Z')`);
  psql(`insert into calendario_data (id, value, updated_at) values ('nominas_correlativos', '{"MED":3}'::jsonb, '2026-10-01T12:00:00.000Z')`);
}
const pgTexto = (s) => `'${s.replace(/'/g, "''")}'`;
const corte = (desde, hasta) => { const a = SQL.indexOf(desde); const b = hasta ? SQL.indexOf(hasta, a + 1) : SQL.length; if (a < 0 || b < 0) throw new Error('marca no encontrada: ' + desde); return SQL.slice(a, b); };
const parte0 = corte('-- PARTE 0 — COMPROBACIONES PREVIAS', '-- PARTE 1 — FUNCIÓN');
const parte1 = corte('-- PARTE 1 — FUNCIÓN', '-- PARTE 2 — ACTIVACIÓN');
const parte2 = corte('-- PARTE 2 — ACTIVACIÓN', '-- PARTE 3 — VERIFICACIÓN');
const parte3 = corte('-- PARTE 3 — VERIFICACIÓN');
const nivel1 = SQL_REV.slice(SQL_REV.indexOf('-- NIVEL 1\n'), SQL_REV.indexOf('-- NIVEL 2\n'));
const nivel2 = SQL_REV.slice(SQL_REV.indexOf('-- NIVEL 2\n'));

// ═══ A. ANTES de aplicar: el hueco de hoy ═══════════════════════════════
sembrar();
let r = await upsertAntiguo('nominas_osiris', texto('Osiris', [nom('A', { notas: 'pestaña vieja' })]));
check('A1. HOY (sin la propuesta): el upsert del código de producción pisa la fila completa (se pierde la nómina B)', r.ok && nominasDe('nominas_osiris').length === 1, `HTTP ${r.status}`);

// ═══ B. PARTE 0 (solo lectura) y orden de aplicación ════════════════════
sembrar();
let foto = huella();
let p = psqlTexto(parte0);
check('B1. PARTE 0 corre sin error y no cambia datos', p.ok && huella() === foto, p.ok ? '' : p.salida.slice(0, 200));
check('B2. PARTE 0 informa qué filas quedan protegidas (osiris/mediterra), cuál queda de solo lectura (nominas) y cuáles no cambian',
  /nominas_osiris\|.*protegida/.test(p.salida) && /nominas_mediterra\|.*protegida/.test(p.salida) && /\nnominas\|.*solo lectura/.test(p.salida)
  && /nominas_correlativos\|.*sin cambio/.test(p.salida) && /nominas_tipos_doc\|.*sin cambio/.test(p.salida) && /nominas_v2_done\|.*sin cambio/.test(p.salida));
p = psqlTexto(parte2);
check('B3. PARTE 2 antes de la PARTE 1: se ABORTA sin crear nada', !p.ok && /ABORTADO: falta la PARTE 1/.test(p.salida) && psql(`select count(*) from pg_trigger where tgname='trg_nominas_exigir_version'`) === '0');
psql(`alter role anon set mediterra.nominas_cas = 'nominas_osiris'`);
p = psqlTexto(parte1);
check('B3b. PARTE 1 se ABORTA si algún rol tiene fijada una variable "mediterra." (activaría el permiso para toda la sesión)', !p.ok && /PARTE 0\.8/.test(p.salida) && psql(`select count(*) from pg_proc where proname='nominas_guardar'`) === '0');
psql(`alter role anon reset mediterra.nominas_cas`);
p = psqlTexto(parte1); await recargarEsquema();
check('B4. PARTE 1 (función) se aplica', p.ok, p.ok ? '' : p.salida.slice(0, 300));
p = psqlTexto(parte1);
check('B5. PARTE 1 dos veces: la segunda se ABORTA', !p.ok && /ABORTADO: ya existe una función/.test(p.salida));
// Entre la PARTE 1 y la 2 (cliente nuevo ya desplegado), el código antiguo sigue funcionando igual que hoy.
r = await upsertAntiguo('nominas_mediterra', texto('Mediterra', [{ ...nom('M'), empresa: 'Mediterra', notas: 'aún sin trigger' }]));
check('B6. Con solo la PARTE 1, el código antiguo sigue guardando como hoy (la función es inerte para él)', r.ok && nominasDe('nominas_mediterra')[0].notas === 'aún sin trigger');
let v = fila('nominas_osiris').updated_at;
let g = await T.patch('nominas_osiris', new Date(v).toISOString(), texto('Osiris', [nom('A'), nom('B')]));
check('B7. Con solo la PARTE 1, el cliente nuevo ya guarda vía la función', g.ok && nominasDe('nominas_osiris').length === 2, JSON.stringify(g));
p = psqlTexto(parte2);
check('B8. PARTE 2 (activación) se aplica', p.ok, p.ok ? '' : p.salida.slice(0, 300));

// ═══ C. Código ANTIGUO y de la rama actual, con la propuesta activa ═════
sembrar();
foto = huella();
r = await upsertAntiguo('nominas_osiris', texto('Osiris', [nom('A', { notas: 'pestaña vieja' })]));
let cuerpo = await r.text();
check('C1. Upsert del código de producción sobre una fila existente: RECHAZADO, la fila no cambia',
  r.status === 400 && /MEDITERRA_NOMINAS_SIN_VERSION/.test(cuerpo) && huella() === foto, `HTTP ${r.status} ${cuerpo.slice(0, 120)}`);
r = await upsertAntiguo('nominas_integrity_farms', texto('Integrity Farms', [nom('I')]));
check('C2. Upsert antiguo que CREARÍA una fila nueva: RECHAZADO, no se crea', r.status === 400 && fila('nominas_integrity_farms') === null);
r = await upsertAntiguo('nominas', JSON.stringify({ nominas: [] }));
cuerpo = await r.text();
check('C3. Escritura en la fila antigua `nominas` (desvío del código antiguo si falla "¿ya se migró?"): RECHAZADA', r.status === 400 && /MEDITERRA_NOMINAS_LEGADO/.test(cuerpo) && huella() === foto);
r = await patchRama('nominas_osiris', new Date(fila('nominas_osiris').updated_at).toISOString(), texto('Osiris', [nom('A')]));
check('C4. PATCH condicionado de la rama ACTUAL (sin el parche de cliente): también RECHAZADO → el parche es obligatorio', r.status === 400 && huella() === foto);
r = await postRama('nominas_integrity_farms', texto('Integrity Farms', [nom('I')]));
check('C5. POST de creación de la rama actual: también RECHAZADO', r.status === 400 && fila('nominas_integrity_farms') === null);
r = await fetch(`${BASE}/rest/v1/calendario_data?id=eq.nominas_osiris`, { method: 'PATCH', headers: H(ANON), body: JSON.stringify({ id: 'nominas_osiris_x' }) });
check('C6. Renombrar una fila de nóminas: RECHAZADO', r.status === 400 && huella() === foto);
r = await fetch(`${BASE}/rest/v1/calendario_data?id=eq.zz_otra`, { method: 'POST', headers: H(ANON), body: JSON.stringify({ id: 'zz_otra', value: { a: 1 } }) });
const r2 = await fetch(`${BASE}/rest/v1/calendario_data?id=eq.zz_otra`, { method: 'PATCH', headers: H(ANON), body: JSON.stringify({ id: 'nominas_zz' }) });
check('C7. Convertir otra fila en una de nóminas (renombrar hacia nominas_*): RECHAZADO', r.ok && r2.status === 400 && fila('nominas_zz') === null);

// ═══ D. Filas que NO cambian y restauración del administrador ═══════════
r = await upsertAntiguo('nominas_correlativos', JSON.stringify({ MED: 4 }));
const rT = await upsertAntiguo('nominas_tipos_doc', JSON.stringify(['Factura', 'Boleta']));
const rV = await upsertAntiguo('nominas_v2_done', JSON.stringify({ migrado: true, x: 1 }));
const rF = await upsertAntiguo('finanzas', JSON.stringify({ a: 2 }));
check('D1. nominas_correlativos, nominas_tipos_doc, nominas_v2_done y finanzas se siguen guardando igual que hoy', r.ok && rT.ok && rV.ok && rF.ok);
r = await upsertAntiguo('nominas_osiris', texto('Osiris', [nom('A', { notas: 'restaurado' }), nom('B')]), SERV);
check('D2. service_role (restauración del administrador) puede escribir directo', r.ok && nominasDe('nominas_osiris')[0].notas === 'restaurado');
psql(`update calendario_data set value = to_jsonb(${pgTexto(texto('Osiris', [nom('A', { notas: 'desde SQL' }), nom('B')]))}::text) where id = 'nominas_osiris'`);
check('D3. SQL Editor (postgres) puede escribir directo', nominasDe('nominas_osiris')[0].notas === 'desde SQL');

// ═══ E. La función: versión, formato, creación, carrera ═════════════════
sembrar();
v = fila('nominas_osiris').updated_at;
const leido = await T.leer('nominas_osiris');
const tA = texto('Osiris', [nom('A', { notas: 'con versión' }), nom('B')]);
g = await T.patch('nominas_osiris', leido.version, tA);
check('E1. Guardar con la versión leída: ok, versión nueva > anterior', g.ok && new Date(g.version) > new Date(leido.version), JSON.stringify(g));
check('E2. Formato intacto: la fila sigue siendo TEXTO JSON (string jsonb) idéntico byte a byte a lo enviado',
  psql(`select jsonb_typeof(value) from calendario_data where id='nominas_osiris'`) === 'string' && fila('nominas_osiris').texto === tA);
foto = huella();
g = await T.patch('nominas_osiris', leido.version, texto('Osiris', [nom('A', { notas: 'vieja' })]));
check('E3. Guardar con una versión VIEJA: "conflicto", no escribe nada', !g.ok && g.motivo === 'conflicto' && huella() === foto);
g = await T.insertar('nominas_frisku_foods', texto('Frisku Foods', [nom('F')]));
const g2 = await T.insertar('nominas_frisku_foods', texto('Frisku Foods', [nom('F2')]));
check('E4. Fila nueva: crear vía función ok; crearla otra vez → "existe" sin pisar', g.ok && !g2.ok && g2.motivo === 'existe' && nominasDe('nominas_frisku_foods')[0].id === 'F');
foto = huella();
r = await rpc({ p_id: 'finanzas', p_value: JSON.stringify({ nominas: [] }), p_version_leida: null });
const rx = await rpc({ p_id: 'nominas_correlativos', p_value: JSON.stringify({ nominas: [] }), p_version_leida: null });
check('E5. La función no sirve para otras filas (finanzas, correlativos): rechazada', r.status === 400 && rx.status === 400 && /FILA_NO_VALIDA/.test(await r.text()) && huella() === foto);
r = await rpc({ p_id: 'nominas_osiris', p_value: { nominas: [] }, p_version_leida: fila('nominas_osiris').updated_at });
const rb = await rpc({ p_id: 'nominas_osiris', p_value: '{"sin_lista":1}', p_version_leida: fila('nominas_osiris').updated_at });
const rc = await rpc({ p_id: 'nominas_osiris', p_value: 'no es json', p_version_leida: fila('nominas_osiris').updated_at });
check('E6. Formato distinto (objeto en vez de texto, sin lista "nominas", texto inválido): rechazado sin escribir',
  r.status === 400 && rb.status === 400 && rc.status === 400 && huella() === foto);
r = await fetch(`${BASE}/rest/v1/rpc/set_config`, { method: 'POST', headers: H(ANON), body: JSON.stringify({ setting_name: 'mediterra.nominas_cas', new_value: 'nominas_osiris', is_local: true }) });
check('E7. La llave pública no puede activar el permiso de la función por su cuenta (set_config no está expuesta)', !r.ok && huella() === foto, `HTTP ${r.status}`);
// Carrera real: 6 guardados simultáneos con la MISMA versión leída → gana exactamente uno.
v = (await T.leer('nominas_osiris')).version;
const resultados = await Promise.all([1, 2, 3, 4, 5, 6].map((i) => T.patch('nominas_osiris', v, texto('Osiris', [nom('A', { notas: `carrera ${i}` }), nom('B')]))));
const ganadores = resultados.filter((x) => x.ok);
check('E8. Carrera real en la base: 6 guardados simultáneos con la misma versión → exactamente 1 escribe, 5 "conflicto"',
  ganadores.length === 1 && resultados.filter((x) => x.motivo === 'conflicto').length === 5 && /carrera/.test(nominasDe('nominas_osiris')[0].notas));
// Fila borrada después de leerla → "no_existe" se trata como conflicto (relee y crea).
psql(`delete from calendario_data where id='nominas_frisku_foods'`);
g = await T.patch('nominas_frisku_foods', '2026-10-01T12:00:00.000Z', texto('Frisku Foods', [nom('F')]));
check('E9. Fila borrada entre lectura y escritura: "conflicto" (no se recrea a ciegas)', !g.ok && g.motivo === 'conflicto' && fila('nominas_frisku_foods') === null);

// ═══ F. Flujo completo con guardarFila REAL (dos sesiones) ══════════════
sembrar();
const s1 = await T.leer('nominas_osiris'), s2 = await T.leer('nominas_osiris');
const edita = (lista, id, cambios) => lista.map((n) => (n.id === id ? { ...n, ...cambios } : n));
let a = await guardarFila({ fila: 'nominas_osiris', empresa: 'Osiris', mio: edita(s1.valor.nominas, 'A', { notas: 'sesión 1' }), base: s1.valor.nominas, version: s1.version, existe: true, transporte: T });
let b = await guardarFila({ fila: 'nominas_osiris', empresa: 'Osiris', mio: edita(s2.valor.nominas, 'B', { notas: 'sesión 2' }), base: s2.valor.nominas, version: s2.version, existe: true, transporte: T });
let n = nominasDe('nominas_osiris');
check('F1. Ediciones independientes desde dos sesiones con la misma versión leída: la segunda recibe conflicto, relee, COMBINA y guarda las dos',
  a.ok && b.ok && b.fusionado && n.find((x) => x.id === 'A').notas === 'sesión 1' && n.find((x) => x.id === 'B').notas === 'sesión 2');
const s3 = await T.leer('nominas_osiris');
a = await guardarFila({ fila: 'nominas_osiris', empresa: 'Osiris', mio: edita(s3.valor.nominas, 'A', { notas: 'X' }), base: s3.valor.nominas, version: s3.version, existe: true, transporte: T });
foto = huella();
b = await guardarFila({ fila: 'nominas_osiris', empresa: 'Osiris', mio: edita(s3.valor.nominas, 'A', { notas: 'Y' }), base: s3.valor.nominas, version: s3.version, existe: true, transporte: T });
check('F2. Mismo campo: conflicto explícito, el servidor conserva lo de la otra sesión', a.ok && !b.ok && b.motivo === 'conflicto' && b.conflictos.length === 1 && huella() === foto && nominasDe('nominas_osiris')[0].notas === 'X');
// Creación simultánea de una fila nueva desde dos sesiones.
a = await guardarFila({ fila: 'nominas_integrity_farms', empresa: 'Integrity Farms', mio: [{ ...nom('I1'), empresa: 'Integrity Farms' }], base: [], version: null, existe: false, transporte: T });
b = await guardarFila({ fila: 'nominas_integrity_farms', empresa: 'Integrity Farms', mio: [{ ...nom('I2'), empresa: 'Integrity Farms' }], base: [], version: null, existe: false, transporte: T });
check('F3. Creación simultánea de la fila: la segunda recibe "existe", relee y combina → quedan las dos nóminas', a.ok && b.ok && nominasDe('nominas_integrity_farms').length === 2);
// Respuesta perdida después de un guardado exitoso.
const s4 = await T.leer('nominas_osiris');
const antes = llamadas.rpc;
perderProxima = true;
a = await guardarFila({ fila: 'nominas_osiris', empresa: 'Osiris', mio: edita(s4.valor.nominas, 'B', { notas: 'respuesta perdida' }), base: s4.valor.nominas, version: s4.version, existe: true, transporte: T });
check('F4. Respuesta perdida (la base SÍ guardó): relee, verifica y lo da por guardado con UNA sola llamada',
  a.ok && a.verificadoTrasRed && llamadas.rpc === antes + 1 && nominasDe('nominas_osiris').find((x) => x.id === 'B').notas === 'respuesta perdida');
b = await guardarFila({ fila: 'nominas_osiris', empresa: 'Osiris', mio: edita(s4.valor.nominas, 'B', { notas: 'respuesta perdida' }), base: s4.valor.nominas, version: s4.version, existe: true, transporte: T });
check('F5. Reintento del mismo guardado con la versión ya superada: reconoce que ya estaba, no escribe de nuevo', b.ok && b.yaEstaba && llamadas.rpc === antes + 2);

// ═══ G. PARTE 3 (verificación, termina en ROLLBACK) ═════════════════════
sembrar();
foto = huella();
p = psqlTexto(parte3);
const filasVerif = (p.salida || '').split('\n').filter((l) => /^\d+\|/.test(l));
check('G1. PARTE 3 corre y sus 9 pruebas dan ok = true', p.ok && filasVerif.length === 9 && filasVerif.every((l) => l.endsWith('|t')), p.ok ? filasVerif.filter((l) => !l.endsWith('|t')).join(' / ') : p.salida.slice(0, 300));
check('G2. PARTE 3 no deja ningún cambio (ROLLBACK)', huella() === foto && fila('nominas_zz_verificacion') === null && fila('zz_verificacion_libre') === null);

// ═══ H. Reversión ═══════════════════════════════════════════════════════
p = psqlTexto(nivel2);
check('H1. Nivel 2 antes del nivel 1: se ABORTA (si no, toda escritura fallaría)', !p.ok && /ejecutar primero el NIVEL 1/.test(p.salida) && psql(`select count(*) from pg_proc where proname='nominas_guardar'`) === '1');
p = psqlTexto(nivel1);
r = await upsertAntiguo('nominas_osiris', texto('Osiris', [nom('A', { notas: 'tras revertir' }), nom('B')]));
g = await T.patch('nominas_osiris', (await T.leer('nominas_osiris')).version, texto('Osiris', [nom('A', { notas: 'cliente nuevo tras nivel 1' }), nom('B')]));
check('H2. Nivel 1: el código antiguo vuelve a guardar como hoy y el cliente nuevo sigue funcionando', p.ok && r.ok && g.ok && nominasDe('nominas_osiris')[0].notas === 'cliente nuevo tras nivel 1');
p = psqlTexto(nivel2); await recargarEsquema();
r = await rpc({ p_id: 'nominas_osiris', p_value: texto('Osiris', []), p_version_leida: null });
check('H3. Nivel 2: la función desaparece (el cliente nuevo ya no podría guardar: revertir el cliente ANTES)', p.ok && r.status === 404 && psql(`select count(*) from pg_proc where proname like 'nominas\\_%'`) === '0', `HTTP ${r.status}`);
r = await upsertAntiguo('finanzas', JSON.stringify({ a: 3 }));
check('H4. Tras la reversión completa, el resto de la tabla funciona normal', r.ok);

// ═══ K. Caminos para eludir el control (con la propuesta activa) ═══════
// La sección H revirtió todo: se vuelve a aplicar la propuesta tal cual.
p = psqlTexto(parte1); await recargarEsquema();
const p2k = psqlTexto(parte2);
check('K0. La propuesta se vuelve a aplicar después de revertirla (PARTE 1 + PARTE 2)', p.ok && p2k.ok, (p.ok ? '' : p.salida.slice(0, 150)) + (p2k.ok ? '' : p2k.salida.slice(0, 150)));
sembrar();
// K1. Función SECURITY DEFINER (dueño postgres) publicada que escribe en calendario_data.
psql(`create function public.zz_definer_escribe(p_id text, p_txt text) returns void language sql security definer set search_path = pg_catalog, public as $f$
  insert into public.calendario_data (id, value, updated_at) values (p_id, to_jsonb(p_txt), now())
  on conflict (id) do update set value = excluded.value, updated_at = excluded.updated_at $f$;
  grant execute on function public.zz_definer_escribe(text, text) to anon, service_role;`);
await recargarEsquema();
foto = huella();
r = await fetch(`${BASE}/rest/v1/rpc/zz_definer_escribe`, { method: 'POST', headers: H(ANON), body: JSON.stringify({ p_id: 'nominas_osiris', p_txt: texto('Osiris', []) }) });
cuerpo = await r.text();
check('K1. Una función SECURITY DEFINER llamada con la llave pública NO puede escribir nóminas sin versión (se mira el rol del JWT)',
  r.status === 400 && /MEDITERRA_NOMINAS_SIN_VERSION/.test(cuerpo) && huella() === foto, `HTTP ${r.status}`);
r = await fetch(`${BASE}/rest/v1/rpc/zz_definer_escribe`, { method: 'POST', headers: H(SERV), body: JSON.stringify({ p_id: 'nominas_osiris', p_txt: texto('Osiris', [nom('A', { notas: 'restauración' })]) }) });
check('K1b. La misma función llamada con service_role (administrador) sí escribe', r.ok && nominasDe('nominas_osiris')[0].notas === 'restauración', `HTTP ${r.status}`);
// K2. Vista actualizable sobre calendario_data publicada a la llave pública.
sembrar();
psql(`create view public.zz_vista as select * from public.calendario_data; grant select, insert, update on public.zz_vista to anon;`);
await recargarEsquema();
foto = huella();
r = await fetch(`${BASE}/rest/v1/zz_vista?id=eq.nominas_osiris`, { method: 'PATCH', headers: H(ANON), body: JSON.stringify({ value: texto('Osiris', []) }) });
const rv2 = await fetch(`${BASE}/rest/v1/zz_vista`, { method: 'POST', headers: { ...H(ANON), Prefer: 'resolution=merge-duplicates' }, body: JSON.stringify({ id: 'nominas_mediterra', value: texto('Mediterra', []) }) });
check('K2. Escribir por una vista actualizable (dueño postgres) tampoco pasa: el trigger de la tabla igual rechaza', r.status === 400 && rv2.status >= 400 && huella() === foto, `HTTP ${r.status} / ${rv2.status}`);
// K3. Una función maliciosa "set_config" en public no reemplaza a la del sistema (search_path con pg_catalog primero).
psql(`create function public.set_config(text, text, boolean) returns text language sql as $f$ select 'falsa'::text $f$; grant execute on function public.set_config(text, text, boolean) to anon;`);
await recargarEsquema();
v = (await T.leer('nominas_osiris')).version;
g = await T.patch('nominas_osiris', v, texto('Osiris', [nom('A', { notas: 'con set_config falsa en public' }), nom('B')]));
check('K3. Una set_config falsa en public no altera la función (usa la del sistema): guarda normal', g.ok && nominasDe('nominas_osiris')[0].notas === 'con set_config falsa en public', JSON.stringify(g));
// K4. La PARTE 0 marca la función peligrosa y la vista.
p = psqlTexto(parte0);
check('K4. PARTE 0 lista la función SECURITY DEFINER que toca calendario_data, su código, la vista actualizable y no cambia datos',
  p.ok && /\npublic\|zz_definer_escribe\|[^\n]*\|t\|sql\|t\|/.test(p.salida) && /CREATE OR REPLACE FUNCTION public\.zz_definer_escribe/.test(p.salida) && /\npublic\|zz_vista\|v\|t\|/.test(p.salida),
  p.ok ? '' : p.salida.slice(0, 200));
psql(`drop function public.zz_definer_escribe(text, text); drop view public.zz_vista; drop function public.set_config(text, text, boolean);`);
await recargarEsquema();

// ═══ L. Foto de verificación para la activación (solo lectura) ══════════
sembrar();
const VERIF = fs.readFileSync(path.join(RAIZ, 'supabase/verificar_activacion_nominas.sql'), 'utf8');
foto = huella();
const f1 = psqlTexto(VERIF), f2 = psqlTexto(VERIF);
const totalDe = (salida) => (salida.split('\n').find((l) => /^\d+\|.*\|[0-9a-f]{32}$/.test(l)) || '').split('|').pop();
check('L1. Foto de nóminas: lista cada fila con cantidad de nóminas y huella, sin contenido; dos fotos seguidas son idénticas; no cambia datos',
  f1.ok && f2.ok && /\nnominas_osiris\|[^\n]*\|string\|2\|[0-9a-f]{32}/.test('\n' + f1.salida) && !/notas|Proveedor/.test(f1.salida) && totalDe(f1.salida) && totalDe(f1.salida) === totalDe(f2.salida) && huella() === foto);
v = (await T.leer('nominas_osiris')).version;
await T.patch('nominas_osiris', v, texto('Osiris', [nom('A', { notas: 'cambio' }), nom('B')]));
const f3 = psqlTexto(VERIF);
check('L2. Si alguien guarda entre dos fotos, la huella total cambia (así se detecta que la pausa no se respetó)', totalDe(f3.salida) !== totalDe(f1.salida));
check('L3. La foto informa función existente y trigger activo (O)', /\n1\|O\s*$/.test('\n' + f3.salida.trim().split('\n').pop()) || /(^|\n)1\|O(\n|$)/.test(f3.salida), f3.salida.trim().split('\n').pop());

// ═══ J. Consulta de respaldos (solo lectura, sin contenido) ═════════════
psql(`insert into calendario_data (id, value, updated_at) values
  ('backup_2026-09-02', '{"main":{"pin":"SECRETO-DE-PRUEBA-123"}}', '2026-09-02T03:00:00Z'),
  ('backup_2026-08-31', '{"x":"SECRETO-DE-PRUEBA-123"}', '2026-08-31T03:00:00Z'),
  ('main_pre_restore_1756000000', '{"pins":"SECRETO-DE-PRUEBA-123"}', '2026-08-24T10:00:00Z')`);
foto = huella();
p = psqlTexto(fs.readFileSync(path.join(RAIZ, 'supabase/consulta_respaldos_existentes.sql'), 'utf8'));
const lineasResp = (p.salida || '').trim().split('\n');
check('J1. Consulta de respaldos: lista los 3 respaldos (el más reciente primero) y el resumen por tipo, sin cambiar datos',
  p.ok && /^backup_2026-09-02\|backup_\*\|2026-09-02/.test(lineasResp[0]) && lineasResp.some((l) => /^backup_\*\|2\|/.test(l)) && lineasResp.some((l) => /^main_pre_restore\*\|1\|/.test(l)) && huella() === foto,
  p.ok ? '' : p.salida.slice(0, 200));
check('J2. No muestra contenido ni credenciales (la marca de prueba no aparece en la salida)', p.ok && !/SECRETO/.test(p.salida));

console.log(fallos ? `\n${fallos} FALLA(S)` : '\nPropuesta "versión obligatoria" de Nóminas: todos los casos OK');
process.exit(fallos ? 1 : 0);
