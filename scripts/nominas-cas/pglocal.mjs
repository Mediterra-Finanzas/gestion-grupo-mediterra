/* ─────────────────────────────────────────────────────────────────────────
   Postgres 16 + PostgREST 12 LOCALES con los roles de Supabase y las 5
   políticas de calendario_data tal como se leyeron en producción.
   SOLO DATOS DE PRUEBA: no hay conexión a producción.
   Uso: const db = await levantarBaseLocal({ pgPort, pgrstPort });
        db.psql(sql) · db.psqlTexto(sql) · db.ANON · db.SERV · db.url · db.cerrar()
   ───────────────────────────────────────────────────────────────────────── */
import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import { spawn, execFileSync } from 'child_process';
import { fileURLToPath } from 'url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
export const RAIZ = path.join(AQUI, '../..');
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

// Partes del archivo de propuesta, cortadas por sus títulos (se ejecutan TAL CUAL).
export function partesPropuesta() {
  const SQL = fs.readFileSync(path.join(RAIZ, 'supabase/propuesta_nominas_version_obligatoria.sql'), 'utf8');
  const corte = (desde, hasta) => { const a = SQL.indexOf(desde); const b = hasta ? SQL.indexOf(hasta, a + 1) : SQL.length; if (a < 0 || b < 0) throw new Error('marca no encontrada: ' + desde); return SQL.slice(a, b); };
  return {
    parte0: corte('-- PARTE 0 — COMPROBACIONES PREVIAS', '-- PARTE 1 — FUNCIÓN'),
    parte1: corte('-- PARTE 1 — FUNCIÓN', '-- PARTE 2 — ACTIVACIÓN'),
    parte2: corte('-- PARTE 2 — ACTIVACIÓN', '-- PARTE 3 — VERIFICACIÓN'),
    parte3: corte('-- PARTE 3 — VERIFICACIÓN'),
  };
}

export async function levantarBaseLocal({ pgPort = 54333, pgrstPort = 3914 } = {}) {
  const PG_BIN = process.env.PG_BIN || '/usr/lib/postgresql/16/bin';
  const POSTGREST_BIN = process.env.POSTGREST_BIN;
  if (!POSTGREST_BIN || !fs.existsSync(POSTGREST_BIN)) throw new Error('Falta POSTGREST_BIN (binario de PostgREST 12).');
  const esRoot = process.getuid && process.getuid() === 0;
  const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'nomcas-e2e-'));
  if (esRoot) execFileSync('chown', ['-R', 'postgres', DATA]);
  const comoPg = (cmd, args) => (esRoot ? ['runuser', ['-u', 'postgres', '--', cmd, ...args]] : [cmd, args]);
  execFileSync(...comoPg(`${PG_BIN}/initdb`, ['-D', DATA, '-A', 'trust', '-U', 'postgres']), { stdio: 'ignore' });
  const [c1, a1] = comoPg(`${PG_BIN}/postgres`, ['-D', DATA, '-p', String(pgPort), '-k', DATA, '-c', 'listen_addresses=127.0.0.1']);
  spawn(c1, a1, { stdio: 'ignore' });
  let pgrst = null;
  const detenerPg = () => { try { execFileSync(...comoPg(`${PG_BIN}/pg_ctl`, ['-D', DATA, '-m', 'immediate', 'stop']), { stdio: 'ignore' }); } catch (e) {} };
  const cerrar = () => { try { pgrst && pgrst.kill(); } catch (e) {} detenerPg(); try { fs.rmSync(DATA, { recursive: true, force: true }); } catch (e) {} };
  process.on('exit', cerrar);
  const psqlArgs = ['-h', '127.0.0.1', '-p', String(pgPort), '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-qAt'];
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
  // Los dos triggers que YA existen en producción (copia exacta, consulta V1 del 2026-10-05).
  const trgProd = psqlTexto(fs.readFileSync(path.join(RAIZ, 'supabase/produccion_triggers_existentes.sql'), 'utf8'));
  if (!trgProd.ok) throw new Error('No se pudieron crear los triggers de producción: ' + trgProd.salida.slice(0, 300));
  // Límites de tiempo por rol como en producción (consulta V8 del 2026-10-05).
  psql(`alter role anon set statement_timeout = '3s'; alter role authenticated set statement_timeout = '8s';`);
  const SECRETO = 'prueba-local-solo-para-tests-0123456789abcdef';
  const b64u = (x) => Buffer.from(JSON.stringify(x)).toString('base64url');
  const jwt = (p) => { const h = b64u({ alg: 'HS256', typ: 'JWT' }), q = b64u(p); return `${h}.${q}.${crypto.createHmac('sha256', SECRETO).update(`${h}.${q}`).digest('base64url')}`; };
  const ANON = jwt({ role: 'anon' }), SERV = jwt({ role: 'service_role' });
  const conf = path.join(DATA, 'pgrst.conf');
  fs.writeFileSync(conf, `db-uri = "postgres://authenticator@127.0.0.1:${pgPort}/postgres"\ndb-schemas = "public"\ndb-anon-role = "anon"\njwt-secret = "${SECRETO}"\nserver-host = "127.0.0.1"\nserver-port = ${pgrstPort}\n`);
  pgrst = spawn(POSTGREST_BIN, [conf], { stdio: 'ignore' });
  const url = `http://127.0.0.1:${pgrstPort}`;
  for (let i = 0; i < 50; i++) { try { const r = await fetch(`${url}/calendario_data?select=id`, { headers: { apikey: ANON, Authorization: `Bearer ${ANON}` } }); if (r.ok) break; } catch (e) {} await espera(200); }
  const recargarEsquema = async () => { psql(`notify pgrst, 'reload schema'`); await espera(900); };
  return { psql, psqlTexto, ANON, SERV, url, recargarEsquema, cerrar };
}
