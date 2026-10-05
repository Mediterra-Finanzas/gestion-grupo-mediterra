/* ─────────────────────────────────────────────────────────────────────────
   PRUEBA LOCAL de supabase/propuesta_cerrar_tablas_roles.sql — DATOS DE PRUEBA.
   Postgres 16 + PostgREST 12 locales, tablas con los permisos y el RLS leídos en
   producción (U1, U2, U8 del 2026-10-05) y fn_mis_empresas tal como está allá.
   Reproduce la escalada (un usuario con sesión se asigna una empresa y lee su
   contabilidad), aplica la propuesta TAL CUAL, comprueba que la cierra sin romper
   fn_mis_empresas, y prueba la reversión.
     POSTGREST_BIN=/ruta/postgrest node scripts/nominas-cas/prueba-roles.mjs
   ───────────────────────────────────────────────────────────────────────── */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { levantarBaseLocal, RAIZ } from './pglocal.mjs';

let fallos = 0;
const check = (n, c, x = '') => { console.log(`${c ? '✓' : '✗ FALLA'}  ${n}${x ? '  — ' + x : ''}`); if (!c) fallos++; };
const db = await levantarBaseLocal({ pgPort: 54337, pgrstPort: 3918 });
const SQL = fs.readFileSync(path.join(RAIZ, 'supabase/propuesta_cerrar_tablas_roles.sql'), 'utf8');
const corte = (a, b) => SQL.slice(SQL.indexOf(a), b ? SQL.indexOf(b) : SQL.length);
const parte0 = corte('-- PARTE 0 — FOTO PREVIA', '-- PARTE 1 — EL CAMBIO');
const parte1 = corte('-- PARTE 1 — EL CAMBIO', '-- PARTE 2 — VERIFICACIÓN');
const parte2 = corte('-- PARTE 2 — VERIFICACIÓN', '-- PARTE 3 — REVERSIÓN');
const parte3 = corte('-- PARTE 3 — REVERSIÓN').split('\n').filter((l) => /^-- (begin;|drop |alter |grant |  on |commit;)/.test(l)).map((l) => l.slice(3)).join('\n');

const U1 = '11111111-1111-1111-1111-111111111111', E1 = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
db.psql(`create schema auth;
  create function auth.uid() returns uuid language sql stable as $f$ select nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'sub', '')::uuid $f$;
  grant usage on schema auth to anon, authenticated; grant execute on function auth.uid() to anon, authenticated;
  create table public.rbac_roles (id uuid primary key default gen_random_uuid(), codigo varchar, nombre varchar, descripcion text, nivel int);
  create table public.rbac_usuarios_roles (id uuid primary key default gen_random_uuid(), usuario_id uuid, empresa_id uuid, rol_id uuid, activo boolean default true, created_at timestamptz default now(), deleted_at timestamptz);
  create table public.usuarios_empresa (id uuid primary key default gen_random_uuid(), usuario_id uuid, empresa_id uuid, rol text, activo boolean default true, created_at timestamptz default now(), updated_at timestamptz);
  grant all on public.rbac_roles, public.rbac_usuarios_roles, public.usuarios_empresa to anon, authenticated, service_role;
  insert into public.rbac_roles (codigo, nombre, nivel) select 'R' || g, 'Rol ' || g, g from generate_series(1, 5) g;
  CREATE OR REPLACE FUNCTION public.fn_mis_empresas() RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER AS $f$
    SELECT empresa_id FROM rbac_usuarios_roles WHERE usuario_id = auth.uid() AND activo = true AND deleted_at IS NULL $f$;
  grant execute on function public.fn_mis_empresas() to anon, authenticated;
  create table public.contab_asientos (id serial primary key, empresa_id uuid, glosa text, deleted_at timestamptz);
  alter table public.contab_asientos enable row level security;
  create policy rls_asientos_select on public.contab_asientos for select to authenticated using ((empresa_id IN (SELECT fn_mis_empresas())) AND (deleted_at IS NULL));
  grant all on public.contab_asientos to anon, authenticated; grant usage on sequence contab_asientos_id_seq to anon, authenticated;
  insert into public.contab_asientos (empresa_id, glosa) values ('${E1}', 'asiento de prueba');`);
await db.recargarEsquema();

const SECRETO = 'prueba-local-solo-para-tests-0123456789abcdef';
const b64u = (x) => Buffer.from(JSON.stringify(x)).toString('base64url');
const jwt = (p) => { const h = b64u({ alg: 'HS256', typ: 'JWT' }), q = b64u(p); return `${h}.${q}.${crypto.createHmac('sha256', SECRETO).update(`${h}.${q}`).digest('base64url')}`; };
const AUTH = jwt({ role: 'authenticated', sub: U1 }), ANON = db.ANON, SERV = db.SERV;
const H = (k, extra = {}) => ({ apikey: k, Authorization: `Bearer ${k}`, 'Content-Type': 'application/json', ...extra });
const get = async (k, ruta) => { const r = await fetch(`${db.url}/${ruta}`, { headers: H(k) }); const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch (e) {} return { status: r.status, filas: Array.isArray(j) ? j.length : null }; };
const autoasignarse = () => fetch(`${db.url}/rbac_usuarios_roles`, { method: 'POST', headers: H(AUTH), body: JSON.stringify({ usuario_id: U1, empresa_id: E1, activo: true }) });

// ── ANTES: la escalada existe ──────────────────────────────────────────
let a = await get(AUTH, 'contab_asientos?select=id');
check('A1. HOY: un usuario con sesión sin roles no ve asientos', a.status === 200 && a.filas === 0);
let r = await autoasignarse();
check('A2. HOY: ese usuario se inserta una fila "yo → empresa E1" en rbac_usuarios_roles', r.status === 201, `HTTP ${r.status}`);
a = await get(AUTH, 'contab_asientos?select=id');
check('A3. HOY: y pasa a ver la contabilidad de E1 (escalada reproducida)', a.filas === 1);
a = await get(ANON, 'rbac_roles?select=id');
check('A4. HOY: la llave pública sin sesión lee el catálogo de roles', a.status === 200 && a.filas === 5);
db.psql(`delete from public.rbac_usuarios_roles`);

// ── Aplicar ──────────────────────────────────────────────────────────────
let p = db.psqlTexto(parte0);
check('P0. PARTE 0 corre (foto previa)', p.ok && /rbac_usuarios_roles\|f\|/.test(p.salida) && /fn_mis_empresas/.test(p.salida), p.ok ? '' : p.salida.slice(0, 200));
p = db.psqlTexto(parte1); await db.recargarEsquema();
check('P1. PARTE 1 se aplica', p.ok, p.ok ? '' : p.salida.slice(0, 300));
p = db.psqlTexto(parte2);
check('P2. Verificación: RLS activo en las 3; la llave pública solo conserva SELECT de authenticated en rbac_roles',
  p.ok && /rbac_roles\|t\|authenticated:SELECT\s*\n/.test(p.salida + '\n') && /rbac_usuarios_roles\|t\|\s*\n/.test(p.salida + '\n') && /usuarios_empresa\|t\|\s*\n/.test(p.salida + '\n'), p.salida.trim());
const p1b = db.psqlTexto(parte1);
check('P3. PARTE 1 dos veces: falla sin dejar cambios a medias (la política ya existe)', !p1b.ok);

// ── DESPUÉS: la escalada está cerrada ───────────────────────────────────
r = await autoasignarse();
check('B1. Con la propuesta: el usuario con sesión NO puede asignarse una empresa', r.status === 401 || r.status === 403, `HTTP ${r.status}`);
a = await get(AUTH, 'contab_asientos?select=id');
check('B2. Y sigue sin ver la contabilidad', a.filas === 0);
const sinSesion = await Promise.all(['rbac_roles', 'rbac_usuarios_roles', 'usuarios_empresa'].map((t) => get(ANON, `${t}?select=id`)));
check('B3. La llave pública sin sesión ya no lee ninguna de las 3 tablas', sinSesion.every((x) => x.status === 401 || x.status === 403), sinSesion.map((x) => x.status).join(','));
r = await fetch(`${db.url}/rbac_roles`, { method: 'DELETE', headers: H(ANON) });
const conSesionBorra = await fetch(`${db.url}/rbac_roles?codigo=eq.R1`, { method: 'DELETE', headers: H(AUTH) });
check('B4. Nadie con la llave pública puede borrar el catálogo de roles', (r.status === 401 || r.status === 403) && (conSesionBorra.status === 401 || conSesionBorra.status === 403) && db.psql('select count(*) from public.rbac_roles') === '5');
a = await get(AUTH, 'rbac_roles?select=id');
check('B5. Un usuario con sesión sí puede listar el catálogo de roles (lectura)', a.status === 200 && a.filas === 5);
r = await fetch(`${db.url}/rbac_usuarios_roles`, { method: 'POST', headers: H(SERV), body: JSON.stringify({ usuario_id: U1, empresa_id: E1, activo: true }) });
a = await get(AUTH, 'contab_asientos?select=id');
check('B6. Una asignación legítima (service_role / administrador) sigue funcionando: fn_mis_empresas lee la tabla con RLS activo', r.status === 201 && a.filas === 1, `HTTP ${r.status}, filas ${a.filas}`);
check('B7. fn_mis_empresas queda con search_path fijo', /search_path=public, pg_temp/.test(db.psql(`select array_to_string(proconfig, ',') from pg_proc where oid = 'public.fn_mis_empresas()'::regprocedure`)));

// ── Reversión ────────────────────────────────────────────────────────────
db.psql(`delete from public.rbac_usuarios_roles`);
p = db.psqlTexto(parte3); await db.recargarEsquema();
r = await autoasignarse();
a = await get(ANON, 'rbac_roles?select=id');
check('R1. La reversión deja todo como estaba (la escalada vuelve a ser posible: así está hoy)', p.ok && r.status === 201 && a.filas === 5, p.ok ? '' : p.salida.slice(0, 200));

db.cerrar();
console.log(fallos ? `\n${fallos} FALLA(S)` : '\nPropuesta "cerrar tablas de roles": todos los casos OK');
process.exit(fallos ? 1 : 0);
