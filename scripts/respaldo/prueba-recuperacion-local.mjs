/* ─────────────────────────────────────────────────────────────────────────
   PRUEBA DE RECUPERACIÓN EN ENTORNO AISLADO (Postgres local + carpetas locales)

   No se conecta a Supabase ni a producción. Simula una pérdida total y la
   recuperación desde una copia "fuera del proyecto":
     1. Clúster Postgres efímero (puerto 55432, carpeta temporal).
     2. Base "origen": estructura reconstruida SOLO desde los .sql del repositorio
        (+ stubs mínimos de Supabase: roles anon/authenticated/service_role y auth.uid()).
        Se registra qué archivos fallan: eso mide si la estructura es reproducible.
     3. Datos de prueba ficticios en calendario_data (incl. una nómina con hash de
        documento) y en currency_tc.
     4. Documentos de prueba en carpetas que simulan los buckets, con manifiesto SHA-256.
     5. Copia: pg_dump -Fc + copia de documentos a una carpeta "externa".
     6. Pérdida: se borra la base y los buckets.
     7. Restauración en una base NUEVA + documentos desde la copia.
     8. Verificación: tablas, filas y md5 por tabla iguales; SHA-256 de cada documento
        igual al manifiesto y al hash guardado en la nómina.
   Uso:  node scripts/respaldo/prueba-recuperacion-local.mjs   (requiere postgresql-16)
   ───────────────────────────────────────────────────────────────────────── */
import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import { execFileSync } from 'child_process';

const BIN = '/usr/lib/postgresql/16/bin';
const DIR = process.env.PRUEBA_DIR || fs.mkdtempSync(path.join(os.tmpdir(), 'mediterra-recuperacion-'));
const PORT = '55432';
const RAIZ = process.cwd();
let ok = 0, fallos = 0; const log = [];
const check = (n, c, x = '') => { c ? ok++ : fallos++; const l = `${c ? '✓' : '✗ FALLA'}  ${n}${x ? '  — ' + x : ''}`; console.log(l); log.push(l); };
const comoPostgres = (cmd, args, opts = {}) => execFileSync('su', ['postgres', '-s', '/bin/bash', '-c', [cmd, ...args].map(a => `'${String(a).replace(/'/g, `'\\''`)}'`).join(' ')], { encoding: 'utf8', ...opts });
const psql = (db, sql) => comoPostgres(`${BIN}/psql`, ['-h', DIR, '-p', PORT, '-d', db, '-v', 'ON_ERROR_STOP=1', '-At', '-c', sql]);
const psqlArchivo = (db, f) => { try { comoPostgres(`${BIN}/psql`, ['-h', DIR, '-p', PORT, '-d', db, '-v', 'ON_ERROR_STOP=1', '-q', '-f', f], { stdio: ['ignore', 'pipe', 'pipe'] }); return null; } catch (e) { return String(e.stderr || e.message).split('\n').find(l => /ERROR/.test(l)) || 'error'; } };
const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');

fs.chmodSync(DIR, 0o777);
const DATOS = path.join(DIR, 'pgdata');
console.log('Carpeta de la prueba:', DIR);
comoPostgres(`${BIN}/initdb`, ['-D', DATOS, '-A', 'trust', '-U', 'postgres', '--locale=C.UTF-8'], { stdio: 'ignore' });
comoPostgres(`${BIN}/pg_ctl`, ['-D', DATOS, '-o', `-p ${PORT} -k ${DIR} -c listen_addresses=''`, '-l', path.join(DIR, 'pg.log'), '-w', 'start'], { stdio: 'ignore' });

try {
  // ── 2. estructura desde el repo ──
  psql('postgres', 'CREATE DATABASE origen');
  psql('origen', `DO $$ BEGIN
      CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    CREATE SCHEMA IF NOT EXISTS auth; CREATE SCHEMA IF NOT EXISTS extensions;
    CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $f$ SELECT NULL::uuid $f$;
    CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $f$ SELECT '{}'::jsonb $f$;
    CREATE OR REPLACE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $f$ SELECT 'service_role'::text $f$;
    CREATE EXTENSION IF NOT EXISTS pgcrypto; CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
    -- calendario_data NO tiene DDL versionado en el repo: estructura INFERIDA del uso (id, value, updated_at)
    CREATE TABLE IF NOT EXISTS public.calendario_data (id text PRIMARY KEY, value jsonb, updated_at timestamptz NOT NULL DEFAULT now());`);
  const orden = (dir, filtro) => fs.readdirSync(path.join(RAIZ, dir)).filter(f => f.endsWith('.sql') && filtro(f))
    .sort((a, b) => a.localeCompare(b, 'en', { numeric: true })).map(f => path.join(dir, f));
  const excl = /DEV_ONLY|seed_|fase4_cerrar_todo|_staging_target_guard|test|preflight|rollback|DRAFT\.sql$/i;
  const ARCH = [
    ...['schema_core_identity_v1.sql', 'schema_core_contable_fase0.sql', 'schema_contable_v1.sql', 'schema_anf_v1.sql', 'schema_anf_v2_kpis.sql'].map(f => path.join('supabase', f)),
    ...orden('supabase', f => /^schema_proc_/.test(f) && !excl.test(f)),
    ...orden('src/currency/migration', f => !excl.test(f)),
    ...orden('src/accounting/migrations', f => !excl.test(f)),
    'api/sql/frisku_sp_ratelimit.sql',
  ];
  const errores = [];
  for (const f of ARCH) { const e = psqlArchivo('origen', path.join(RAIZ, f)); if (e) errores.push({ archivo: f, error: e.slice(0, 160) }); }
  const nTablas = +psql('origen', "SELECT count(*) FROM information_schema.tables WHERE table_type='BASE TABLE' AND table_schema NOT IN ('pg_catalog','information_schema')").trim();
  console.log(`Estructura: ${ARCH.length} archivos aplicados, ${errores.length} con error, ${nTablas} tablas creadas`);
  errores.forEach(e => console.log(`   · ${e.archivo}: ${e.error}`));
  check('la estructura se reconstruye desde el repo (con errores informados arriba)', nTablas > 100, `${nTablas} tablas`);

  // ── 3. datos de prueba ficticios ──
  const doc = Buffer.from('%PDF-1.4\n% documento ficticio de nomina para la prueba de recuperacion\n');
  const hashDoc = crypto.createHash('sha256').update(doc).digest('hex');
  const filas = {
    finanzas_bancos: { saldos: { 'Allegria Foods||BICE||clp': { monto: 96000000, fecha: '2026-09-15', moneda: 'clp', usd: 103738.92, tc: 925.4, tcPar: 'USD-CLP', tcFecha: '2026-09-15', tcFuente: 'mindicador', tcPolitica: 'maestro_tc_v1' } } },
    nominas: { nominas: [{ id: 'n1', empresa: 'Mediterra', items: [{ id: 'i1', proveedor: 'Proveedor ficticio', docs: [{ path: 'nominas/n1/i1/factura.pdf', hash: hashDoc, estado: 'activo' }] }] }] },
    maestro_tc: { 'USD-CLP': [{ fecha: '2026-09-15', valor: 925.4, fuente: 'mindicador' }] },
  };
  for (const [id, v] of Object.entries(filas)) psql('origen', `INSERT INTO calendario_data(id, value) VALUES ('${id}', '${JSON.stringify(v).replace(/'/g, "''")}'::jsonb)`);
  const tablaTC = psql('origen', "SELECT to_regclass('public.currency_tc') IS NOT NULL").trim() === 't';

  // ── 4. documentos (buckets simulados) ──
  const BUCKETS = path.join(DIR, 'storage'); const EXT = path.join(DIR, 'copia-externa');
  const docs = { 'nominas-docs/nominas/n1/i1/factura.pdf': doc, 'frisku-docs/rendiciones/r1/boleta.jpg': Buffer.from('JPEG ficticio'), 'osiris-fotos/informes-html/x.html': Buffer.from('<p>informe ficticio</p>') };
  for (const [rel, b] of Object.entries(docs)) { const p = path.join(BUCKETS, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, b); }
  const manifiesto = Object.fromEntries(Object.keys(docs).map(rel => [rel, sha(path.join(BUCKETS, rel))]));

  // ── 5. copia fuera del "proyecto" ──
  fs.mkdirSync(EXT, { recursive: true }); fs.chmodSync(EXT, 0o777);
  const dump = path.join(EXT, 'base.dump');
  comoPostgres(`${BIN}/pg_dump`, ['-h', DIR, '-p', PORT, '-Fc', '-f', dump, 'origen']);
  const huellaTablas = (db) => psql(db, `SELECT string_agg(t || ':' || n, ',' ORDER BY t) FROM (
      SELECT format('%I.%I', table_schema, table_name) t,
             (xpath('/row/c/text()', query_to_xml(format('SELECT count(*) AS c FROM %I.%I', table_schema, table_name), false, true, '')))[1]::text n
      FROM information_schema.tables WHERE table_type='BASE TABLE' AND table_schema NOT IN ('pg_catalog','information_schema')) x`).trim();
  const md5Datos = (db) => psql(db, "SELECT md5(string_agg(id || value::text, '|' ORDER BY id)) FROM calendario_data").trim();
  const huellaOrigen = huellaTablas('origen'), md5Origen = md5Datos('origen');
  for (const rel of Object.keys(docs)) { const d = path.join(EXT, 'storage', rel); fs.mkdirSync(path.dirname(d), { recursive: true }); fs.copyFileSync(path.join(BUCKETS, rel), d); }
  fs.writeFileSync(path.join(EXT, 'manifiesto.json'), JSON.stringify({ documentos: manifiesto, tablas: huellaOrigen, md5_calendario_data: md5Origen }, null, 2));

  // ── 6. pérdida total ──
  psql('postgres', 'DROP DATABASE origen'); fs.rmSync(BUCKETS, { recursive: true, force: true });
  check('pérdida simulada: base y documentos borrados', !fs.existsSync(BUCKETS) && psql('postgres', "SELECT count(*) FROM pg_database WHERE datname='origen'").trim() === '0');

  // ── 7. restauración en base NUEVA ──
  psql('postgres', 'CREATE DATABASE recuperada');
  psql('recuperada', `DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;`);
  try { comoPostgres(`${BIN}/pg_restore`, ['-h', DIR, '-p', PORT, '-d', 'recuperada', '--no-owner', dump], { stdio: ['ignore', 'pipe', 'pipe'] }); } catch (e) { /* avisos de roles ya existentes */ }
  for (const rel of Object.keys(docs)) { const d = path.join(BUCKETS, rel); fs.mkdirSync(path.dirname(d), { recursive: true }); fs.copyFileSync(path.join(EXT, 'storage', rel), d); }

  // ── 8. verificación ──
  const man = JSON.parse(fs.readFileSync(path.join(EXT, 'manifiesto.json'), 'utf8'));
  check('mismas tablas y mismas filas por tabla', huellaTablas('recuperada') === man.tablas, `${man.tablas.split(',').length} tablas`);
  check('calendario_data idéntica (md5)', md5Datos('recuperada') === man.md5_calendario_data);
  check('saldo con metadatos de TC intacto', psql('recuperada', "SELECT value->'saldos'->'Allegria Foods||BICE||clp'->>'tcPolitica' FROM calendario_data WHERE id='finanzas_bancos'").trim() === 'maestro_tc_v1');
  const docsOk = Object.entries(man.documentos).every(([rel, h]) => sha(path.join(BUCKETS, rel)) === h);
  check('cada documento restaurado coincide con su SHA-256 del manifiesto', docsOk, `${Object.keys(man.documentos).length} documentos`);
  const hashNomina = psql('recuperada', "SELECT value->'nominas'->0->'items'->0->'docs'->0->>'hash' FROM calendario_data WHERE id='nominas'").trim();
  check('el documento de nómina restaurado coincide con el hash guardado en la nómina', sha(path.join(BUCKETS, 'nominas-docs/nominas/n1/i1/factura.pdf')) === hashNomina);
  check('tabla currency_tc reconstruida', tablaTC);
  fs.writeFileSync(path.join(DIR, 'resultado.json'), JSON.stringify({ ok, fallos, archivosConError: errores, tablas: nTablas, log }, null, 2));
} finally {
  try { comoPostgres(`${BIN}/pg_ctl`, ['-D', DATOS, '-m', 'fast', 'stop'], { stdio: 'ignore' }); } catch {}
}
console.log(`\n${ok} correctas, ${fallos} fallas · detalle: ${path.join(DIR, 'resultado.json')}`);
process.exit(fallos ? 1 : 0);
