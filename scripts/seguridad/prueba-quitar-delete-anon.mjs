/* ─────────────────────────────────────────────────────────────────────────
   PRUEBA LOCAL de supabase/propuesta_quitar_delete_anon.sql — SOLO DATOS DE PRUEBA.

   Levanta Postgres 16 + PostgREST 12 LOCALES con los roles de Supabase
   (anon, authenticated, service_role), los permisos por defecto de Supabase
   (anon con todos los privilegios de tabla) y las 5 políticas de
   calendario_data tal como se leyeron en producción. Ejecuta las partes del
   archivo de propuesta TAL CUAL (0, 1, 2 y 3) y comprueba el efecto real por
   la API REST, que es por donde pasa la app. No hay conexión a producción.

     POSTGREST_BIN=/ruta/postgrest node scripts/seguridad/prueba-quitar-delete-anon.mjs
   ───────────────────────────────────────────────────────────────────────── */
import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import { spawn, execFileSync } from 'child_process';
import { fileURLToPath } from 'url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const ARCHIVO = path.join(AQUI, '../../supabase/propuesta_quitar_delete_anon.sql');
const PG_BIN = process.env.PG_BIN || '/usr/lib/postgresql/16/bin';
const POSTGREST_BIN = process.env.POSTGREST_BIN;
if (!POSTGREST_BIN || !fs.existsSync(POSTGREST_BIN)) { console.error('Falta POSTGREST_BIN (binario de PostgREST 12).'); process.exit(2); }
const PG_PORT = 54331, PGRST_PORT = 3912, BASE = `http://127.0.0.1:${PGRST_PORT}`;
let fallos = 0;
const check = (n, c, x = '') => { console.log(`${c ? '✓' : '✗ FALLA'}  ${n}${x ? '  — ' + x : ''}`); if (!c) fallos++; };
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Postgres + PostgREST ───────────────────────────────────────────────
const esRoot = process.getuid && process.getuid() === 0;
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'deldel-pg-'));
if (esRoot) execFileSync('chown', ['-R', 'postgres', DATA]);
const comoPg = (cmd, args) => (esRoot ? ['runuser', ['-u', 'postgres', '--', cmd, ...args]] : [cmd, args]);
execFileSync(...comoPg(`${PG_BIN}/initdb`, ['-D', DATA, '-A', 'trust', '-U', 'postgres']), { stdio: 'ignore' });
const [c1, a1] = comoPg(`${PG_BIN}/postgres`, ['-D', DATA, '-p', String(PG_PORT), '-k', DATA, '-c', 'listen_addresses=127.0.0.1']);
spawn(c1, a1, { stdio: 'ignore' });
const detenerPg = () => { try { execFileSync(...comoPg(`${PG_BIN}/pg_ctl`, ['-D', DATA, '-m', 'immediate', 'stop']), { stdio: 'ignore' }); } catch (e) {} };
let pgrst = null;
process.on('exit', () => { try { pgrst && pgrst.kill(); } catch (e) {} detenerPg(); try { fs.rmSync(DATA, { recursive: true, force: true }); } catch (e) {} });
const psqlArgs = ['-h', '127.0.0.1', '-p', String(PG_PORT), '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-qAt'];
const psql = (sql) => execFileSync(`${PG_BIN}/psql`, [...psqlArgs, '-c', sql], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const psqlTexto = (sql) => { const f = path.join(DATA, `q${Date.now()}${Math.random()}.sql`); fs.writeFileSync(f, sql); if (esRoot) execFileSync('chown', ['postgres', f]);
  try { return { ok: true, salida: execFileSync(`${PG_BIN}/psql`, [...psqlArgs, '-f', f], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) }; }
  catch (e) { return { ok: false, salida: String(e.stderr || e.message) }; } };
for (let i = 0; i < 50; i++) { try { psql('select 1'); break; } catch (e) { await espera(200); } }

// Roles y permisos como Supabase; políticas como producción (leídas el 2026-10-01).
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
for (let i = 0; i < 50; i++) { try { const r = await fetch(`${BASE}/calendario_data?select=id`, { headers: { apikey: ANON, Authorization: `Bearer ${ANON}` } }); if (r.ok) break; } catch (e) {} await espera(200); }
const recargarEsquema = async () => { psql(`notify pgrst, 'reload schema'`); await espera(800); };

const H = (k) => ({ apikey: k, Authorization: `Bearer ${k}`, 'Content-Type': 'application/json' });
const sembrar = () => { psql(`truncate calendario_data; insert into calendario_data (id, value) values
  ('finanzas','{"a":1}'), ('nominas_osiris', to_jsonb('{"nominas":[]}'::text)), ('main','{"x":1}'), ('backup_2026-09-01','{"b":1}'), ('main_pre_restore_1','{"r":1}')`); };
const filas = () => psql(`select string_agg(id, ',' order by id) from calendario_data`);
const borrarAnon = (filtro) => fetch(`${BASE}/calendario_data?${filtro}`, { method: 'DELETE', headers: { ...H(ANON), Prefer: 'return=representation' } });

// ── Partes del archivo, tal cual ──────────────────────────────────────
const texto = fs.readFileSync(ARCHIVO, 'utf8');
const corte = (desde, hasta) => texto.slice(texto.indexOf(desde), hasta ? texto.indexOf(hasta) : undefined);
const parte0 = corte('-- PARTE 0 — COMPROBACIONES PREVIAS (solo lectura). Ejecutar', '-- PARTE 1 — EL CAMBIO');
const parte1 = corte('-- PARTE 1 — EL CAMBIO', '-- PARTE 2 — VERIFICACIÓN');
const parte2 = corte('-- PARTE 2 — VERIFICACIÓN', '-- PARTE 3 — REVERSIÓN');
const parte3 = corte('-- PARTE 3 — REVERSIÓN').split('\n').filter((l) => /^-- (begin;|grant |create policy |  as permissive|  using |commit;)/.test(l)).map((l) => l.slice(3)).join('\n');

// ── ANTES ───────────────────────────────────────────────────────────────
sembrar();
let r = await borrarAnon('id=eq.finanzas');
check('ANTES: con la llave pública se puede borrar finanzas (el riesgo es real)', r.ok && !filas().split(',').includes('finanzas'), `HTTP ${r.status}`);
sembrar();
r = await borrarAnon('id=neq.__nada__');
check('ANTES: un solo DELETE con la llave pública borra todas las filas salvo backup*/main_pre_restore*', filas() === 'backup_2026-09-01,main_pre_restore_1', filas());

// ── PARTE 0 (solo lectura) ──────────────────────────────────────────────
sembrar();
const fotoAntes = psql(`select md5(string_agg(id||value::text, '|' order by id)) from calendario_data`);
const p0 = psqlTexto(parte0);
check('PARTE 0: las comprobaciones previas corren sin error y no cambian datos', p0.ok && psql(`select md5(string_agg(id||value::text, '|' order by id)) from calendario_data`) === fotoAntes, p0.ok ? '' : p0.salida.slice(0, 200));

// ── PARTE 1: aborta si el estado no es el verificado ────────────────────
psql(`alter policy cd_anon_auth_delete on public.calendario_data to anon`);   // roles distintos a los verificados
let p1 = psqlTexto(parte1);
check('PARTE 1 se ABORTA si la política no es la verificada, y no deja nada a medias', !p1.ok && /ABORTADO/.test(p1.salida)
  && psql(`select count(*) from pg_policies where policyname='cd_anon_auth_delete'`) === '1' && psql(`select has_table_privilege('anon','public.calendario_data','DELETE')`) === 't', p1.salida.split('\n').find((l) => /ABORTADO/.test(l)) || '');
psql(`alter policy cd_anon_auth_delete on public.calendario_data to authenticated, anon`);

// ── PARTE 1: el cambio ──────────────────────────────────────────────────
p1 = psqlTexto(parte1);
check('PARTE 1 se aplica sin errores', p1.ok, p1.ok ? '' : p1.salida.slice(0, 300));
await recargarEsquema();
const p2 = psqlTexto(parte2);
check('PARTE 2: anon/authenticated sin DELETE ni TRUNCATE; anon conserva SELECT/INSERT/UPDATE', p2.ok && p2.salida.trim().split('\n')[0] === 'f|f|f|f|t|t|t', p2.salida.trim().split('\n')[0]);
check('PARTE 2: quedan 4 políticas (sin cd_anon_auth_delete)', p2.salida.trim().split('\n').length === 5 && !/cd_anon_auth_delete/.test(p2.salida));

// ── DESPUÉS: por la API, como la app ────────────────────────────────────
r = await borrarAnon('id=eq.finanzas');
const txt = await r.text();
check('DESPUÉS: borrar con la llave pública falla con "permission denied" y la fila sigue', [401, 403].includes(r.status) && /permission denied/i.test(txt) && filas().split(',').includes('finanzas'), `HTTP ${r.status}`);
r = await borrarAnon('id=neq.__nada__');
check('DESPUÉS: el borrado masivo también falla; no se borró nada', !r.ok && filas() === 'backup_2026-09-01,finanzas,main,main_pre_restore_1,nominas_osiris');
// lo que la app hace sigue funcionando
const v = JSON.parse(psql(`select json_build_object('u', updated_at)::text from calendario_data where id='finanzas'`)).u;
r = await fetch(`${BASE}/calendario_data?id=eq.finanzas&updated_at=eq.${encodeURIComponent(v)}`, { method: 'PATCH', headers: { ...H(ANON), Prefer: 'return=representation' }, body: JSON.stringify({ value: { a: 2 }, updated_at: new Date().toISOString() }) });
check('DESPUÉS: guardado condicionado (PATCH) de la app sigue funcionando', r.ok && (await r.json()).length === 1);
r = await fetch(`${BASE}/calendario_data`, { method: 'POST', headers: { ...H(ANON), Prefer: 'resolution=merge-duplicates' }, body: JSON.stringify({ id: 'nominas_osiris', value: JSON.stringify({ nominas: [1] }), updated_at: new Date().toISOString() }) });
check('DESPUÉS: upsert de nóminas y de "Restaurar" (POST merge-duplicates) sigue funcionando', r.ok);
r = await fetch(`${BASE}/calendario_data`, { method: 'POST', headers: { ...H(ANON), Prefer: 'return=minimal' }, body: JSON.stringify({ id: 'fila_nueva_prueba', value: { n: 1 } }) });
check('DESPUÉS: crear una fila nueva sigue funcionando', r.ok);
r = await fetch(`${BASE}/calendario_data?select=id`, { headers: H(ANON) });
check('DESPUÉS: lectura y descarga de respaldo (SELECT) siguen funcionando, sin ver backup*', r.ok && !(await r.json()).some((x) => /^backup/.test(x.id)));
r = await fetch(`${BASE}/calendario_data?id=eq.fila_nueva_prueba`, { method: 'DELETE', headers: { ...H(SERV), Prefer: 'return=representation' } });
check('DESPUÉS: la llave de servicio (servidor, respaldos futuros) sí puede borrar', r.ok && !filas().includes('fila_nueva_prueba'));

// ── PARTE 3: reversión ──────────────────────────────────────────────────
const p3 = psqlTexto(parte3);
check('PARTE 3: la reversión del archivo se ejecuta sin errores', p3.ok, p3.ok ? '' : p3.salida.slice(0, 200));
await recargarEsquema();
// (el orden de los roles en el arreglo lo decide Postgres; se compara como conjunto)
const pol = psql(`select cmd||'|'||permissive||'|'||(select string_agg(x, ',' order by x) from unnest(roles) x)||'|'||qual from pg_policies where policyname='cd_anon_auth_delete'`);
check('PARTE 3: la política vuelve idéntica a la de producción (mismo comando, roles y condición)', pol === "DELETE|PERMISSIVE|anon,authenticated|((id !~~ 'backup%'::text) AND (id !~~ 'main_pre_restore%'::text))", pol);
r = await borrarAnon('id=eq.main');
check('PARTE 3: tras revertir, la llave pública vuelve a poder borrar (estado anterior)', r.ok && !filas().split(',').includes('main'));

console.log(fallos ? `\n${fallos} FALLA(S)` : '\nPropuesta de quitar DELETE a anon: OK (solo en local, con datos de prueba)');
process.exit(fallos ? 1 : 0);
