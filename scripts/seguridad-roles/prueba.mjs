/* ─────────────────────────────────────────────────────────────────────────
   PRUEBA LOCAL de supabase/seguridad_roles/propuesta.sql — SOLO DATOS DE PRUEBA.
   Sin conexión a producción.

   Levanta Postgres 16 + PostgREST 12 locales con los roles de Supabase y
   reproduce lo leído en producción el 2026-10-05 (U1–U9): las 6 tablas de
   autorización con su RLS y sus permisos, las funciones fn_mis_empresas,
   osi_current_empresa y osi_current_rol con su código real, y tablas
   dependientes con sus políticas reales (contab_*, osi_*).

   A. HOY: reproduce la escalada (un usuario con sesión se asigna una empresa y
      lee/modifica su contabilidad) y muestra lo que ya está protegido.
   B. Aplica la propuesta TAL CUAL (partes 0, 1 y 2).
   C. DESPUÉS: la escalada queda cerrada por todos los caminos (crear, mover,
      borrar asignaciones; llave sin sesión) y los usuarios AUTORIZADOS mantienen
      su acceso por cada mecanismo: asignación rbac hecha por el administrador,
      asignación Osiris (osi_user_empresa), claims del JWT, rol ADMIN de Osiris,
      catálogo de roles, y el administrador sigue pudiendo asignar.
   R. Reversión.

     POSTGREST_BIN=/ruta/postgrest node scripts/seguridad-roles/prueba.mjs
   ───────────────────────────────────────────────────────────────────────── */
import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import { spawn, execFileSync } from 'child_process';
import { fileURLToPath } from 'url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.join(AQUI, '../..');
const SQL = fs.readFileSync(path.join(RAIZ, 'supabase/seguridad_roles/propuesta.sql'), 'utf8');
const CONSULTAS = fs.readFileSync(path.join(RAIZ, 'supabase/seguridad_roles/consultas_lectura.sql'), 'utf8');
const PG_BIN = process.env.PG_BIN || '/usr/lib/postgresql/16/bin';
const POSTGREST_BIN = process.env.POSTGREST_BIN;
if (!POSTGREST_BIN || !fs.existsSync(POSTGREST_BIN)) { console.error('Falta POSTGREST_BIN (binario de PostgREST 12).'); process.exit(2); }
const PG_PORT = 54338, PGRST_PORT = 3919, URL = `http://127.0.0.1:${PGRST_PORT}`;
let fallos = 0;
const check = (n, c, x = '') => { console.log(`${c ? '✓' : '✗ FALLA'}  ${n}${x ? '  — ' + x : ''}`); if (!c) fallos++; };
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Postgres + PostgREST ───────────────────────────────────────────────
const esRoot = process.getuid && process.getuid() === 0;
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'segroles-'));
if (esRoot) execFileSync('chown', ['-R', 'postgres', DATA]);
const comoPg = (cmd, args) => (esRoot ? ['runuser', ['-u', 'postgres', '--', cmd, ...args]] : [cmd, args]);
execFileSync(...comoPg(`${PG_BIN}/initdb`, ['-D', DATA, '-A', 'trust', '-U', 'postgres']), { stdio: 'ignore' });
const [c1, a1] = comoPg(`${PG_BIN}/postgres`, ['-D', DATA, '-p', String(PG_PORT), '-k', DATA, '-c', 'listen_addresses=127.0.0.1']);
spawn(c1, a1, { stdio: 'ignore' });
let pgrst = null;
const detener = () => { try { pgrst && pgrst.kill(); } catch (e) {} try { execFileSync(...comoPg(`${PG_BIN}/pg_ctl`, ['-D', DATA, '-m', 'immediate', 'stop']), { stdio: 'ignore' }); } catch (e) {} try { fs.rmSync(DATA, { recursive: true, force: true }); } catch (e) {} };
process.on('exit', detener);
const psqlArgs = ['-h', '127.0.0.1', '-p', String(PG_PORT), '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-qAt'];
const psql = (sql) => execFileSync(`${PG_BIN}/psql`, [...psqlArgs, '-c', sql], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const psqlTexto = (sql) => { const f = path.join(DATA, `q${Date.now()}${Math.random()}.sql`); fs.writeFileSync(f, sql); if (esRoot) execFileSync('chown', ['postgres', f]);
  try { return { ok: true, salida: execFileSync(`${PG_BIN}/psql`, [...psqlArgs, '-f', f], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) }; }
  catch (e) { return { ok: false, salida: String(e.stderr || e.message) }; } };
for (let i = 0; i < 50; i++) { try { psql('select 1'); break; } catch (e) { await espera(200); } }

// ── Réplica de producción (2026-10-05) ──────────────────────────────────
const E1 = 'e1e1e1e1-0000-0000-0000-000000000001', E2 = 'e2e2e2e2-0000-0000-0000-000000000002';
const U = { contab: 'aaaaaaaa-0000-0000-0000-000000000001', osi: 'aaaaaaaa-0000-0000-0000-000000000002', osiAdmin: 'aaaaaaaa-0000-0000-0000-000000000003',
  claim: 'aaaaaaaa-0000-0000-0000-000000000004', intruso: 'bbbbbbbb-0000-0000-0000-00000000000f' };
psql(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  create role authenticator login noinherit; grant anon, authenticated, service_role to authenticator;
  create schema auth; grant usage on schema auth to anon, authenticated, service_role;
  create function auth.uid() returns uuid language sql stable as $f$ select nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'sub', '')::uuid $f$;
  grant execute on function auth.uid() to anon, authenticated, service_role;
  -- tablas de autorización (columnas de U4)
  create table public.rbac_roles (id uuid primary key default gen_random_uuid(), codigo varchar, nombre varchar, descripcion text, nivel int);
  create table public.rbac_usuarios_roles (id uuid primary key default gen_random_uuid(), usuario_id uuid, empresa_id uuid, rol_id uuid, activo boolean default true, created_at timestamptz default now(), deleted_at timestamptz);
  create table public.usuarios_empresa (id uuid primary key default gen_random_uuid(), usuario_id uuid, empresa_id uuid, rol text, activo boolean default true, created_at timestamptz default now(), updated_at timestamptz);
  create table public.osi_user_empresa (auth_user_id uuid, empresa_id uuid, rol text, activo boolean default true, created_at timestamptz default now(), updated_at timestamptz);
  create table public.user_osiris_accounts (app_user_email text primary key, rol_osiris text, activo boolean);
  create table public.osi_auth_rate_limit (scope text, identifier_hash text, attempt_count int, window_start timestamptz, locked_until timestamptz, lock_count int, updated_at timestamptz);
  -- RLS y permisos como U1/U2/U3
  grant all on public.rbac_roles, public.rbac_usuarios_roles, public.usuarios_empresa to anon, authenticated, service_role;
  alter table public.osi_user_empresa enable row level security;
  create policy pol_ue_sel on public.osi_user_empresa for select to authenticated using (auth_user_id = auth.uid());
  grant select, insert, update, delete on public.osi_user_empresa to authenticated; grant all on public.osi_user_empresa to service_role;
  alter table public.user_osiris_accounts enable row level security;
  grant select, insert, update, delete on public.user_osiris_accounts to authenticated; grant all on public.user_osiris_accounts to service_role;
  alter table public.osi_auth_rate_limit enable row level security; grant all on public.osi_auth_rate_limit to service_role;
  -- funciones con el código de producción (V6)
  CREATE OR REPLACE FUNCTION public.fn_mis_empresas() RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER AS $f$
    SELECT empresa_id FROM rbac_usuarios_roles WHERE usuario_id = auth.uid() AND activo = true AND deleted_at IS NULL $f$;
  CREATE OR REPLACE FUNCTION public.osi_current_empresa() RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'auth' AS $f$
    select coalesce(nullif(current_setting('request.jwt.claims', true)::jsonb->>'empresa_id','')::uuid,
      (select empresa_id from osi_user_empresa where auth_user_id = auth.uid() and activo limit 1)); $f$;
  CREATE OR REPLACE FUNCTION public.osi_current_rol() RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'auth' AS $f$
    select coalesce(nullif(current_setting('request.jwt.claims', true)::jsonb->>'osiris_rol',''),
      (select rol from osi_user_empresa where auth_user_id = auth.uid() and activo limit 1)); $f$;
  grant execute on function public.fn_mis_empresas(), public.osi_current_empresa(), public.osi_current_rol() to anon, authenticated, service_role;
  -- tablas dependientes con sus políticas reales (U8)
  create table public.contab_asientos (id serial primary key, empresa_id uuid, glosa text, deleted_at timestamptz);
  alter table public.contab_asientos enable row level security;
  create policy rls_asientos_select on public.contab_asientos for select to authenticated using ((empresa_id IN (SELECT fn_mis_empresas())) AND (deleted_at IS NULL));
  create policy rls_asientos_insert on public.contab_asientos for insert to authenticated with check (empresa_id IN (SELECT fn_mis_empresas()));
  create table public.contab_plan_cuentas (id serial primary key, empresa_id uuid, nombre text, deleted_at timestamptz);
  alter table public.contab_plan_cuentas enable row level security;
  create policy rls_plan_select on public.contab_plan_cuentas for select to authenticated using ((empresa_id IN (SELECT fn_mis_empresas())) AND (deleted_at IS NULL));
  create policy rls_plan_update on public.contab_plan_cuentas for update to authenticated using ((empresa_id IN (SELECT fn_mis_empresas())) AND (deleted_at IS NULL));
  grant all on public.contab_asientos, public.contab_plan_cuentas to anon, authenticated, service_role;
  grant usage on all sequences in schema public to anon, authenticated, service_role;
  create table public.osi_contratos (id serial primary key, empresa_id uuid, nombre text);
  alter table public.osi_contratos enable row level security;
  create policy pol_osi_contratos on public.osi_contratos for all to public using (empresa_id = osi_current_empresa()) with check (empresa_id = osi_current_empresa());
  create table public.osi_config (empresa_id uuid primary key, valor text);
  alter table public.osi_config enable row level security;
  create policy pol_cfg_sel on public.osi_config for select to authenticated using (empresa_id = osi_current_empresa());
  create policy pol_cfg_upd on public.osi_config for update to authenticated using ((empresa_id = osi_current_empresa()) AND (osi_current_rol() = 'ADMIN'::text)) with check ((empresa_id = osi_current_empresa()) AND (osi_current_rol() = 'ADMIN'::text));
  grant all on public.osi_contratos, public.osi_config to authenticated, service_role;
  grant usage on all sequences in schema public to anon, authenticated, service_role;
  -- datos de prueba
  insert into public.rbac_roles (codigo, nombre, nivel) select 'R' || g, 'Rol ' || g, g from generate_series(1, 5) g;
  insert into public.contab_asientos (empresa_id, glosa) values ('${E1}', 'asiento E1'), ('${E2}', 'asiento E2');
  insert into public.contab_plan_cuentas (empresa_id, nombre) values ('${E1}', 'Caja E1'), ('${E2}', 'Caja E2');
  insert into public.osi_contratos (empresa_id, nombre) values ('${E1}', 'contrato E1'), ('${E2}', 'contrato E2');
  insert into public.osi_config values ('${E1}', 'config E1'), ('${E2}', 'config E2');
  insert into public.rbac_usuarios_roles (usuario_id, empresa_id) values ('${U.contab}', '${E1}');
  insert into public.osi_user_empresa (auth_user_id, empresa_id, rol) values ('${U.osi}', '${E1}', 'USUARIO'), ('${U.osiAdmin}', '${E1}', 'ADMIN');
  insert into public.user_osiris_accounts values ('osi@prueba.cl', 'USUARIO', true);`);
const SECRETO = 'prueba-local-solo-para-tests-0123456789abcdef';
const b64u = (x) => Buffer.from(JSON.stringify(x)).toString('base64url');
const jwt = (p) => { const h = b64u({ alg: 'HS256', typ: 'JWT' }), q = b64u(p); return `${h}.${q}.${crypto.createHmac('sha256', SECRETO).update(`${h}.${q}`).digest('base64url')}`; };
const ANON = jwt({ role: 'anon' }), SERV = jwt({ role: 'service_role' });
const K = {
  contab: jwt({ role: 'authenticated', sub: U.contab }), osi: jwt({ role: 'authenticated', sub: U.osi }),
  osiAdmin: jwt({ role: 'authenticated', sub: U.osiAdmin }), intruso: jwt({ role: 'authenticated', sub: U.intruso }),
  claim: jwt({ role: 'authenticated', sub: U.claim, empresa_id: E1, osiris_rol: 'USUARIO' }),   // claims emitidos por el servidor (firmados)
};
const conf = path.join(DATA, 'pgrst.conf');
fs.writeFileSync(conf, `db-uri = "postgres://authenticator@127.0.0.1:${PG_PORT}/postgres"\ndb-schemas = "public"\ndb-anon-role = "anon"\njwt-secret = "${SECRETO}"\nserver-host = "127.0.0.1"\nserver-port = ${PGRST_PORT}\n`);
pgrst = spawn(POSTGREST_BIN, [conf], { stdio: 'ignore' });
for (let i = 0; i < 50; i++) { try { const r = await fetch(`${URL}/rbac_roles?select=id`, { headers: { apikey: ANON, Authorization: `Bearer ${ANON}` } }); if (r.ok) break; } catch (e) {} await espera(200); }
const recargar = async () => { psql(`notify pgrst, 'reload schema'`); await espera(900); };

const H = (k, extra = {}) => ({ apikey: k, Authorization: `Bearer ${k}`, 'Content-Type': 'application/json', ...extra });
const pedir = async (k, metodo, ruta, cuerpo, extra = {}) => {
  const r = await fetch(`${URL}/${ruta}`, { method: metodo, headers: H(k, extra), body: cuerpo ? JSON.stringify(cuerpo) : undefined });
  const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch (e) {}
  return { status: r.status, filas: Array.isArray(j) ? j : null, n: Array.isArray(j) ? j.length : null };
};
const ok = (s) => s >= 200 && s < 300;
const denegado = (s) => s === 401 || s === 403;
const ver = (k, tabla, filtro = '') => pedir(k, 'GET', `${tabla}?select=*${filtro}`);
const corte = (a, b) => SQL.slice(SQL.indexOf(a), b ? SQL.indexOf(b) : SQL.length);
const parte0 = corte('-- PARTE 0 — FOTO PREVIA', '-- PARTE 1 — EL CAMBIO');
const parte1 = corte('-- PARTE 1 — EL CAMBIO', '-- PARTE 2 — VERIFICACIÓN');
const parte2 = corte('-- PARTE 2 — VERIFICACIÓN', '-- PARTE 3 — REVERSIÓN');
const parte3 = corte('-- PARTE 3 — REVERSIÓN').split('\n').filter((l) => /^-- (begin;|drop |alter |grant |commit;)/.test(l)).map((l) => l.slice(3)).join('\n');
const huellaAuth = () => psql(`select md5(coalesce((select string_agg(usuario_id::text || empresa_id::text, ',' order by usuario_id, empresa_id) from public.rbac_usuarios_roles), '') ||
  coalesce((select string_agg(auth_user_id::text || empresa_id::text || rol, ',' order by auth_user_id) from public.osi_user_empresa), '') ||
  coalesce((select string_agg(app_user_email || rol_osiris, ',') from public.user_osiris_accounts), '') ||
  coalesce((select string_agg(codigo, ',' order by codigo) from public.rbac_roles), ''))`);

// ═══ A. HOY ═════════════════════════════════════════════════════════════
// Línea base: lo que los usuarios autorizados pueden hacer HOY (se repite igual en C).
async function accesosAutorizados() {
  const a = await ver(K.contab, 'contab_asientos');
  const b = await pedir(K.contab, 'POST', 'contab_asientos', { empresa_id: E1, glosa: 'base' }, { Prefer: 'return=representation' });
  const c = await ver(K.osi, 'osi_contratos');
  const d = await pedir(K.osi, 'POST', 'osi_contratos', { empresa_id: E1, nombre: 'base' }, { Prefer: 'return=representation' });
  const e = await ver(K.claim, 'osi_contratos');
  const f = await pedir(K.osiAdmin, 'PATCH', `osi_config?empresa_id=eq.${E1}`, { valor: 'base' }, { Prefer: 'return=representation' });
  psql(`delete from public.contab_asientos where glosa = 'base'; delete from public.osi_contratos where nombre = 'base'`);
  return [a.n, b.status, c.n, d.status, e.n, f.n].join('/');
}
const baseAutorizados = await accesosAutorizados();
check('A0. HOY: los usuarios autorizados acceden (rbac ve 1 y registra asientos; Osiris ve 1 y crea contratos; claims ve 2 de E1; ADMIN configura)', baseAutorizados === '1/201/1/201/2/1', baseAutorizados);
let r = await ver(K.intruso, 'contab_asientos');
check('A1. HOY: un usuario con sesión sin asignación no ve asientos', r.status === 200 && r.n === 0);
r = await pedir(K.intruso, 'POST', 'rbac_usuarios_roles', { usuario_id: U.intruso, empresa_id: E1 });
check('A2. HOY: ese usuario se asigna la empresa E1 en rbac_usuarios_roles', r.status === 201, `HTTP ${r.status}`);
r = await ver(K.intruso, 'contab_asientos');
const rPlan = await pedir(K.intruso, 'PATCH', `contab_plan_cuentas?empresa_id=eq.${E1}`, { nombre: 'ALTERADO' }, { Prefer: 'return=representation' });
check('A3. HOY: y pasa a ver los asientos de E1 y a MODIFICAR su plan de cuentas (escalada reproducida)', r.n === 1 && rPlan.n === 1, `asientos ${r.n}, plan modificado ${rPlan.n}`);
r = await pedir(K.intruso, 'PATCH', `rbac_usuarios_roles?usuario_id=eq.${U.contab}`, { usuario_id: U.intruso }, { Prefer: 'return=representation' });
check('A4. HOY: también puede "robarse" la asignación de otro usuario (moverla a sí mismo)', r.n === 1);
r = await ver(ANON, 'rbac_roles');
check('A5. HOY: la llave sin sesión lee el catálogo de roles', r.n === 5);
r = await pedir(K.intruso, 'POST', 'osi_user_empresa', { auth_user_id: U.intruso, empresa_id: E1, rol: 'ADMIN' });
check('A6. HOY YA PROTEGIDO: no puede asignarse una empresa de Osiris (osi_user_empresa)', denegado(r.status), `HTTP ${r.status}`);
r = await pedir(K.intruso, 'PATCH', `user_osiris_accounts?app_user_email=eq.osi@prueba.cl`, { rol_osiris: 'ADMIN' }, { Prefer: 'return=representation' });
check('A7. HOY YA PROTEGIDO: no puede modificar user_osiris_accounts (RLS sin políticas)', r.n === 0 || denegado(r.status));
// restaurar el estado legítimo antes de aplicar
psql(`delete from public.rbac_usuarios_roles; insert into public.rbac_usuarios_roles (usuario_id, empresa_id) values ('${U.contab}', '${E1}');
  update public.contab_plan_cuentas set nombre = 'Caja E1' where empresa_id = '${E1}';`);

// ═══ B. Aplicar la propuesta tal cual ═══════════════════════════════════
let p = psqlTexto(parte0);
check('B1. PARTE 0 (foto previa) corre y muestra las 6 tablas y las 3 funciones', p.ok && (p.salida.match(/^(rbac_roles|rbac_usuarios_roles|usuarios_empresa|osi_user_empresa|user_osiris_accounts|osi_auth_rate_limit)\|/gm) || []).length === 6 && /fn_mis_empresas\|postgres\|t\|/.test(p.salida), p.ok ? '' : p.salida.slice(0, 200));
const antesAuth = huellaAuth();
p = psqlTexto(parte1); await recargar();
check('B2. PARTE 1 se aplica', p.ok, p.ok ? '' : p.salida.slice(0, 300));
check('B3. No cambia ninguna asignación existente', huellaAuth() === antesAuth);
p = psqlTexto(parte2);
const fila = (t) => (p.salida.split('\n').find((l) => l.startsWith(t + '|')) || '');
check('B4. PARTE 2: RLS activo en las 6 y la llave pública conserva solo lectura donde corresponde',
  p.ok && fila('rbac_roles').endsWith('|t|authenticated:SELECT') && fila('rbac_usuarios_roles').endsWith('|t|authenticated:SELECT')
  && fila('osi_user_empresa').endsWith('|t|authenticated:SELECT') && fila('usuarios_empresa').endsWith('|t|(sin permisos de la llave pública)')
  && fila('user_osiris_accounts').endsWith('|t|(sin permisos de la llave pública)') && fila('osi_auth_rate_limit').endsWith('|t|(sin permisos de la llave pública)'), p.salida.trim());
check('B5. PARTE 1 dos veces: falla entera, sin cambios a medias', !psqlTexto(parte1).ok && huellaAuth() === antesAuth);

// ═══ C. DESPUÉS: escalada cerrada ═══════════════════════════════════════
r = await pedir(K.intruso, 'POST', 'rbac_usuarios_roles', { usuario_id: U.intruso, empresa_id: E1 });
check('C1. Ya no puede asignarse una empresa', denegado(r.status), `HTTP ${r.status}`);
r = await pedir(K.intruso, 'PATCH', `rbac_usuarios_roles?usuario_id=eq.${U.contab}`, { usuario_id: U.intruso });
const rBorra = await pedir(K.intruso, 'DELETE', `rbac_usuarios_roles?usuario_id=eq.${U.contab}`);
check('C2. Ni robarse ni borrar la asignación de otro', denegado(r.status) && denegado(rBorra.status) && huellaAuth() === antesAuth, `${r.status}/${rBorra.status}`);
r = await ver(K.intruso, 'contab_asientos');
const rPlan2 = await pedir(K.intruso, 'PATCH', `contab_plan_cuentas?empresa_id=eq.${E1}`, { nombre: 'ALTERADO' }, { Prefer: 'return=representation' });
check('C3. No ve asientos ni puede modificar el plan de cuentas', r.n === 0 && rPlan2.n === 0 && psql(`select nombre from public.contab_plan_cuentas where empresa_id='${E1}'`) === 'Caja E1');
const tablas6 = ['rbac_roles', 'rbac_usuarios_roles', 'usuarios_empresa', 'osi_user_empresa', 'user_osiris_accounts', 'osi_auth_rate_limit'];
const sinSesion = await Promise.all(tablas6.map((t) => ver(ANON, t)));
const sinSesionEscribe = await Promise.all(tablas6.map((t) => pedir(ANON, 'POST', t, {})));
check('C4. La llave sin sesión no lee ni escribe ninguna de las 6 tablas', sinSesion.every((x) => denegado(x.status)) && sinSesionEscribe.every((x) => denegado(x.status)), sinSesion.map((x) => x.status).join(','));
const escrituras = await Promise.all([
  pedir(K.intruso, 'POST', 'osi_user_empresa', { auth_user_id: U.intruso, empresa_id: E1, rol: 'ADMIN' }),
  pedir(K.intruso, 'POST', 'usuarios_empresa', { usuario_id: U.intruso, empresa_id: E1 }),
  pedir(K.intruso, 'POST', 'user_osiris_accounts', { app_user_email: 'intruso@x.cl', rol_osiris: 'ADMIN', activo: true }),
  pedir(K.intruso, 'POST', 'rbac_roles', { codigo: 'X' }),
  pedir(K.intruso, 'DELETE', 'rbac_roles?codigo=eq.R1'),
]);
check('C5. Con sesión tampoco escribe osi_user_empresa, usuarios_empresa, user_osiris_accounts ni el catálogo', escrituras.every((x) => denegado(x.status)) && huellaAuth() === antesAuth, escrituras.map((x) => x.status).join(','));
r = await pedir(ANON, 'POST', 'rpc/fn_mis_empresas', {});
check('C6. La llave sin sesión ya no puede ejecutar fn_mis_empresas', denegado(r.status) || r.status === 404, `HTTP ${r.status}`);
check('C7. fn_mis_empresas queda con search_path fijo', /search_path=public, pg_temp/.test(psql(`select array_to_string(proconfig, ',') from pg_proc where oid = 'public.fn_mis_empresas()'::regprocedure`)));

// ═══ C. DESPUÉS: los autorizados mantienen su acceso ═══════════════════
const despuesAutorizados = await accesosAutorizados();
check('C0. DESPUÉS: exactamente los mismos accesos autorizados que HOY', despuesAutorizados === baseAutorizados, `${baseAutorizados} → ${despuesAutorizados}`);
r = await ver(K.contab, 'contab_asientos');
const rIns = await pedir(K.contab, 'POST', 'contab_asientos', { empresa_id: E1, glosa: 'nuevo' });
const rInsE2 = await pedir(K.contab, 'POST', 'contab_asientos', { empresa_id: E2, glosa: 'ajeno' });
check('C8. Usuario asignado por el administrador (rbac): sigue viendo y registrando asientos de SU empresa, no de otra', r.n === 1 && r.filas[0].empresa_id === E1 && rIns.status === 201 && denegado(rInsE2.status), `ve ${r.n}, inserta ${rIns.status}, ajena ${rInsE2.status}`);
r = await ver(K.contab, 'rbac_usuarios_roles');
check('C9. Y puede ver SUS asignaciones (solo las suyas)', r.status === 200 && r.n === 1 && r.filas[0].usuario_id === U.contab);
r = await ver(K.osi, 'osi_contratos');
const rOsiIns = await pedir(K.osi, 'POST', 'osi_contratos', { empresa_id: E1, nombre: 'nuevo' });
check('C10. Usuario de Osiris (osi_user_empresa): sigue viendo y creando contratos de su empresa', r.n === 1 && r.filas[0].empresa_id === E1 && rOsiIns.status === 201, `ve ${r.n}, crea ${rOsiIns.status}`);
r = await ver(K.osi, 'osi_user_empresa');
check('C11. Y sigue leyendo su propia fila de osi_user_empresa', r.status === 200 && r.n === 1);
const rCfgUser = await pedir(K.osi, 'PATCH', `osi_config?empresa_id=eq.${E1}`, { valor: 'x' }, { Prefer: 'return=representation' });
const rCfgAdmin = await pedir(K.osiAdmin, 'PATCH', `osi_config?empresa_id=eq.${E1}`, { valor: 'cambiado por ADMIN' }, { Prefer: 'return=representation' });
check('C12. La regla de rol de Osiris sigue igual: ADMIN modifica la configuración, USUARIO no', rCfgUser.n === 0 && rCfgAdmin.n === 1);
r = await ver(K.claim, 'osi_contratos');
check('C13. Acceso por claims del JWT (empresa_id firmado por el servidor) sigue funcionando', r.n >= 1 && r.filas.every((f) => f.empresa_id === E1));
r = await ver(K.osi, 'rbac_roles');
check('C14. Cualquier usuario con sesión puede seguir listando el catálogo de roles', r.status === 200 && r.n === 5);
const adm1 = await pedir(SERV, 'POST', 'rbac_usuarios_roles', { usuario_id: U.osi, empresa_id: E2 });
const adm2 = await pedir(SERV, 'POST', 'osi_user_empresa', { auth_user_id: U.contab, empresa_id: E2, rol: 'USUARIO' });
r = await ver(K.osi, 'contab_asientos');
check('C15. El administrador (service_role) sigue asignando, y la asignación nueva da acceso de inmediato', adm1.status === 201 && adm2.status === 201 && r.n === 1 && r.filas[0].empresa_id === E2, `${adm1.status}/${adm2.status}/${r.n}`);

// ═══ Consultas de solo lectura S1–S7 (que corran y no muestren identidades) ═
psql(`create table auth.users (id uuid, email text, email_confirmed_at timestamptz, is_anonymous boolean, created_at timestamptz, last_sign_in_at timestamptz, raw_user_meta_data jsonb, raw_app_meta_data jsonb);
  create table auth.identities (user_id uuid, provider text);
  insert into auth.users values ('${U.osi}', 'secreto@prueba.cl', now(), false, now(), now(), '{"empresa_id":"x"}', '{}'), ('${U.contab}', 'otro@prueba.cl', null, true, now(), null, '{}', '{}');
  insert into auth.identities values ('${U.osi}', 'email'), ('${U.contab}', 'anonymous');`);
const bloquesS = CONSULTAS.split(/\n(?=-- S\d\.)/).slice(1);
const salidasS = bloquesS.map((b) => psqlTexto(b));
check('S. Las 7 consultas de lectura corren sin error', bloquesS.length === 7 && salidasS.every((x) => x.ok), salidasS.map((x, i) => x.ok ? '' : `S${i + 1}: ${x.salida.slice(0, 120)}`).join(' '));
check('S1. Cuenta usuarios, anónimos y metadatos con claves de permiso (2 · 1 · 1)', /^2\|1\|1\|2\|1\|1\|0$/m.test(salidasS[0].salida), salidasS[0].salida.trim());
check('S5. El barrido no encuentra tablas abiertas después del cambio (las 6 tienen RLS)', !/rbac_|usuarios_empresa|osi_user_empresa/.test(salidasS[4].salida));
check('S. Ninguna consulta muestra correos', !salidasS.some((x) => /@prueba\.cl/.test(x.salida)));

// ═══ R. Reversión ═══════════════════════════════════════════════════════
psql(`delete from public.rbac_usuarios_roles where usuario_id = '${U.osi}'; delete from public.osi_user_empresa where auth_user_id = '${U.contab}'`);
p = psqlTexto(parte3); await recargar();
r = await pedir(K.intruso, 'POST', 'rbac_usuarios_roles', { usuario_id: U.intruso, empresa_id: E1 });
const rAnon = await ver(ANON, 'rbac_roles');
check('R1. La reversión deja todo como hoy (la escalada vuelve a ser posible)', p.ok && r.status === 201 && rAnon.n === 5, p.ok ? '' : p.salida.slice(0, 200));

detener();
console.log(fallos ? `\n${fallos} FALLA(S)` : '\nSeguridad de roles y empresas: todos los casos OK');
process.exit(fallos ? 1 : 0);
