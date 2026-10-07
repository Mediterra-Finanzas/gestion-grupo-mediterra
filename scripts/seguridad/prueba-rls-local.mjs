/* ─────────────────────────────────────────────────────────────────────────
   PRUEBA LOCAL de supabase/propuesta_rls_calendario_data.sql (ETAPA 1) y de
   supabase/consulta_metadatos_solo_lectura.sql. Postgres 16 efímero, roles
   anon/authenticated/service_role simulados, datos ficticios. No se conecta a
   Supabase ni a producción.

   Comprueba que la etapa 1 NO bloquea lo que la app hace con la llave pública
   (leer, crear con upsert, actualizar con control de versión) y SÍ bloquea
   borrar/vaciar y leer o alterar el historial; que el historial guarda la
   versión anterior con el límite de una cada 15 min; y que la reversa vuelve
   al estado actual. También que la consulta de metadatos corre y que su
   transacción de solo lectura rechaza una escritura.
   Uso: node scripts/seguridad/prueba-rls-local.mjs   (requiere postgresql-16)
   ───────────────────────────────────────────────────────────────────────── */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';

const BIN = '/usr/lib/postgresql/16/bin';
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'mediterra-rls-'));
const PORT = '55433';
const RAIZ = process.cwd();
let ok = 0, fallos = 0;
const check = (n, c, x = '') => { c ? ok++ : fallos++; console.log(`${c ? '✓' : '✗ FALLA'}  ${n}${x ? '  — ' + x : ''}`); };
const comoPostgres = (cmd, args, opts = {}) => execFileSync('su', ['postgres', '-s', '/bin/bash', '-c', [cmd, ...args].map(a => `'${String(a).replace(/'/g, `'\\''`)}'`).join(' ')], { encoding: 'utf8', ...opts });
const psql = (sql, rol = null) => comoPostgres(`${BIN}/psql`, ['-h', DIR, '-p', PORT, '-d', 'app', '-v', 'ON_ERROR_STOP=1', '-At', '-c', rol ? `SET ROLE ${rol}; ${sql}` : sql], { stdio: ['ignore', 'pipe', 'pipe'] });
const intenta = (sql, rol) => { try { psql(sql, rol); return 'ok'; } catch (e) { return (String(e.stderr || e.message).match(/ERROR:\s*([^\n]+)/) || [, 'error'])[1]; } };
const archivo = (f) => { try { comoPostgres(`${BIN}/psql`, ['-h', DIR, '-p', PORT, '-d', 'app', '-v', 'ON_ERROR_STOP=1', '-q', '-f', path.join(RAIZ, f)], { stdio: ['ignore', 'pipe', 'pipe'] }); return 'ok'; } catch (e) { return String(e.stderr || e.message).split('\n').find(l => /ERROR/.test(l)) || 'error'; } };

fs.chmodSync(DIR, 0o777);
const DATOS = path.join(DIR, 'pgdata');
comoPostgres(`${BIN}/initdb`, ['-D', DATOS, '-A', 'trust', '-U', 'postgres', '--locale=C.UTF-8'], { stdio: 'ignore' });
comoPostgres(`${BIN}/pg_ctl`, ['-D', DATOS, '-o', `-p ${PORT} -k ${DIR} -c listen_addresses=''`, '-l', path.join(DIR, 'pg.log'), '-w', 'start'], { stdio: 'ignore' });
try {
  comoPostgres(`${BIN}/psql`, ['-h', DIR, '-p', PORT, '-d', 'postgres', '-c', 'CREATE DATABASE app'], { stdio: 'ignore' });
  // Estado ACTUAL simulado: tabla abierta a anon/authenticated, sin RLS (como dice la auditoría de jun-2026).
  psql(`CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
    CREATE SCHEMA storage; CREATE TABLE storage.buckets (id text primary key, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    CREATE TABLE storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, metadata jsonb);
    INSERT INTO storage.buckets VALUES ('nominas-docs', false, null, null);
    CREATE TABLE public.calendario_data (id text PRIMARY KEY, value jsonb, updated_at timestamptz NOT NULL DEFAULT now());
    GRANT USAGE ON SCHEMA public TO anon, authenticated; GRANT ALL ON public.calendario_data TO anon, authenticated;
    INSERT INTO public.calendario_data VALUES ('finanzas', '{"v":1}', now()), ('pins', '{"x_h":"ficticio"}', now());`);

  check('consulta de metadatos corre completa (transacción de solo lectura)', archivo('supabase/consulta_metadatos_solo_lectura.sql') === 'ok');
  check('la transacción READ ONLY rechaza una escritura', /read-only transaction/.test(intenta(`BEGIN TRANSACTION READ ONLY; UPDATE public.calendario_data SET value='{}' WHERE id='finanzas'; ROLLBACK;`)));

  // ── Aplicar la ETAPA 1 (solo la parte ejecutable del archivo) ──
  check('etapa 1 se aplica sin errores', archivo('supabase/propuesta_rls_calendario_data.sql') === 'ok');

  // Lo que la app hace con la llave pública sigue funcionando
  check('anon: lee', intenta(`SELECT value FROM public.calendario_data WHERE id='finanzas'`, 'anon') === 'ok');
  check('anon: crea con upsert (POST merge-duplicates)', intenta(`INSERT INTO public.calendario_data(id,value,updated_at) VALUES ('nueva','{"a":1}',now()) ON CONFLICT (id) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at`, 'anon') === 'ok');
  check('anon: actualiza con control de versión (PATCH ...&updated_at=eq.)', intenta(`UPDATE public.calendario_data SET value='{"v":2}', updated_at=now() WHERE id='finanzas' AND updated_at=(SELECT updated_at FROM public.calendario_data WHERE id='finanzas')`, 'anon') === 'ok');
  check('authenticated: también lee y escribe', intenta(`UPDATE public.calendario_data SET value='{"v":3}' WHERE id='finanzas'`, 'authenticated') === 'ok');

  // Lo que se bloquea
  check('anon: NO puede borrar una fila', /permission denied/.test(intenta(`DELETE FROM public.calendario_data WHERE id='finanzas'`, 'anon')));
  check('anon: NO puede vaciar la tabla', /permission denied/.test(intenta(`TRUNCATE public.calendario_data`, 'anon')));
  check('anon: NO puede leer el historial', /permission denied/.test(intenta(`SELECT * FROM public.calendario_data_historial`, 'anon')));
  check('anon: NO puede borrar el historial', /permission denied/.test(intenta(`DELETE FROM public.calendario_data_historial`, 'anon')));
  check('anon: NO puede escribir en el historial', /permission denied/.test(intenta(`INSERT INTO public.calendario_data_historial(id,operacion) VALUES ('x','UPDATE')`, 'anon')));

  // Historial
  const h = psql(`SELECT id||':'||operacion||':'||(value->>'v') FROM public.calendario_data_historial ORDER BY hist_id`).trim().split('\n').filter(Boolean);
  check('historial: guardó la versión ANTERIOR al primer cambio (v=1)', h[0] === 'finanzas:UPDATE:1', h.join(' | '));
  check('historial: el segundo cambio dentro de 15 min NO agrega versión', h.filter(x => x.startsWith('finanzas')).length === 1, h.join(' | '));
  psql(`UPDATE public.calendario_data_historial SET guardado_en = now() - interval '16 minutes'`);
  psql(`UPDATE public.calendario_data SET value='{"v":4}' WHERE id='finanzas'`, 'anon');
  const h2 = +psql(`SELECT count(*) FROM public.calendario_data_historial WHERE id='finanzas'`).trim();
  check('historial: pasados 15 min, el siguiente cambio guarda otra versión', h2 === 2, String(h2));
  check('service_role (servidor) sigue pudiendo borrar', intenta(`DELETE FROM public.calendario_data WHERE id='nueva'`) === 'ok');
  const hd = psql(`SELECT operacion FROM public.calendario_data_historial WHERE id='nueva'`).trim();
  check('historial: un borrado del servidor también queda guardado', hd === 'DELETE', hd);

  // Reversa
  psql(`DROP TRIGGER IF EXISTS calendario_data_version ON public.calendario_data; GRANT DELETE, TRUNCATE ON public.calendario_data TO anon, authenticated;`);
  check('reversa: anon vuelve a poder borrar (estado actual)', intenta(`DELETE FROM public.calendario_data WHERE id='pins' AND false`, 'anon') === 'ok');
  check('reversa: el historial se conserva', +psql(`SELECT count(*) FROM public.calendario_data_historial`).trim() >= 3);
} finally {
  try { comoPostgres(`${BIN}/pg_ctl`, ['-D', DATOS, '-m', 'fast', 'stop'], { stdio: 'ignore' }); } catch {}
  fs.rmSync(DIR, { recursive: true, force: true });
}
console.log(`\n${ok} correctas, ${fallos} fallas · Postgres local con roles simulados (NO es Supabase ni producción)`);
process.exit(fallos ? 1 : 0);
