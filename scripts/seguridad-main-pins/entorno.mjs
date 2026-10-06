/* ─────────────────────────────────────────────────────────────────────────
   Entorno LOCAL de pruebas de la migración de seguridad main/pins.
   Postgres 16 + PostgREST 12 con los roles de Supabase, las 5 políticas,
   los privilegios y los 2 triggers de calendario_data TAL COMO están en
   producción; un servidor http en localhost que sirve el build estático (si se
   da) y despacha /api/auth/* y /api/datos/* a los handlers REALES con un shim
   parecido al de Vercel. SOLO DATOS DE PRUEBA: nada sale a la red.

   Uso:
     import { levantarEntorno } from './scripts/seguridad-main-pins/entorno.mjs';
     const E = await levantarEntorno({ build?, puerto?, sembrar:{usuarios,pins,main,admins}, env? });
     E.url (http://localhost:<p>) · E.pgrst (PostgREST directo) · E.supabase (con /rest/v1)
     E.anon · E.service · E.psql(sql) · E.psqlTexto(sql) · E.correos · E.secretoVerificar
     E.aplicar('faseA_bloquear_escritura.sql') → {ok, salida} · E.cerrar()
   Requiere: PG_BIN (por defecto /usr/lib/postgresql/16/bin) y POSTGREST_BIN.
   ───────────────────────────────────────────────────────────────────────── */
import fs from 'fs';
import os from 'os';
import net from 'net';
import http from 'http';
import path from 'path';
import crypto from 'crypto';
import { spawn, spawnSync, execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
export const RAIZ = path.join(AQUI, '../..');
const DIR_SQL = path.join(RAIZ, 'supabase/seguridad_main_pins');
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const lit = (s) => `'${String(s).replace(/'/g, "''")}'`;

async function puertoLibre() {
  return new Promise((ok, mal) => { const s = net.createServer(); s.unref(); s.on('error', mal); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => ok(p)); }); });
}

const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2', '.txt': 'text/plain', '.map': 'application/json' };

// Shim de req/res al estilo Vercel: req.query, req.body (JSON parseado), res.status().json(), setHeader.
function shim(req, res, query, cuerpoTexto) {
  req.query = query;
  const ct = String(req.headers['content-type'] || '');
  if (cuerpoTexto && /application\/json/i.test(ct)) { try { req.body = JSON.parse(cuerpoTexto); } catch (e) { req.body = cuerpoTexto; } }
  else req.body = cuerpoTexto || undefined;
  // Como Vercel: la IP del cliente la pone la plataforma (no se confía en la del cliente).
  req.headers['x-forwarded-for'] = req.socket.remoteAddress || '';
  delete req.headers['x-vercel-forwarded-for']; delete req.headers['x-real-ip'];
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (o) => { if (!res.getHeader('Content-Type')) res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.end(JSON.stringify(o)); return res; };
  res.send = (b) => { res.end(typeof b === 'string' || Buffer.isBuffer(b) ? b : JSON.stringify(b)); return res; };
}

export async function levantarEntorno({ build, puerto, sembrar = {}, env = {} } = {}) {
  const PG_BIN = process.env.PG_BIN || '/usr/lib/postgresql/16/bin';
  const POSTGREST_BIN = process.env.POSTGREST_BIN;
  if (!POSTGREST_BIN || !fs.existsSync(POSTGREST_BIN)) throw new Error('Falta POSTGREST_BIN (binario de PostgREST 12).');
  const pgPort = await puertoLibre(), pgrstPort = await puertoLibre(), proxyPort = await puertoLibre();
  const esRoot = process.getuid && process.getuid() === 0;
  const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'segmp-'));
  if (esRoot) execFileSync('chown', ['-R', 'postgres', DATA]);
  const comoPg = (cmd, args) => (esRoot ? ['runuser', ['-u', 'postgres', '--', cmd, ...args]] : [cmd, args]);
  execFileSync(...comoPg(`${PG_BIN}/initdb`, ['-D', DATA, '-A', 'trust', '-U', 'postgres']), { stdio: 'ignore' });
  const [c1, a1] = comoPg(`${PG_BIN}/postgres`, ['-D', DATA, '-p', String(pgPort), '-k', DATA, '-c', 'listen_addresses=127.0.0.1']);
  spawn(c1, a1, { stdio: 'ignore' });
  let pgrst = null, proxy = null, app = null, cerrado = false;
  const cerrar = async () => {
    if (cerrado) return; cerrado = true;
    for (const s of [app, proxy]) { if (s) { try { s.closeAllConnections && s.closeAllConnections(); } catch (e) {} await new Promise((r) => s.close(() => r())); } }
    try { pgrst && pgrst.kill(); } catch (e) {}
    try { execFileSync(...comoPg(`${PG_BIN}/pg_ctl`, ['-D', DATA, '-m', 'immediate', 'stop']), { stdio: 'ignore' }); } catch (e) {}
    try { fs.rmSync(DATA, { recursive: true, force: true }); } catch (e) {}
  };
  process.on('exit', () => { if (!cerrado) { try { pgrst && pgrst.kill(); } catch (e) {} try { execFileSync(...comoPg(`${PG_BIN}/pg_ctl`, ['-D', DATA, '-m', 'immediate', 'stop']), { stdio: 'ignore' }); } catch (e) {} try { fs.rmSync(DATA, { recursive: true, force: true }); } catch (e) {} } });

  const psqlArgs = ['-h', '127.0.0.1', '-p', String(pgPort), '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-qAt'];
  const psql = (sql) => execFileSync(`${PG_BIN}/psql`, [...psqlArgs, '-c', sql], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const psqlTexto = (sql) => {
    const f = path.join(DATA, `q${Date.now()}${Math.random()}.sql`); fs.writeFileSync(f, sql); if (esRoot) execFileSync('chown', ['postgres', f]);
    // stdout + stderr (los NOTICE de las guardas van por stderr).
    const r = spawnSync(`${PG_BIN}/psql`, [...psqlArgs.filter((x) => x !== '-qAt'), '-At', '-f', f], { encoding: 'utf8' });
    return { ok: r.status === 0, salida: String(r.stdout || '') + String(r.stderr || '') + (r.error ? String(r.error.message) : '') };
  };
  for (let i = 0; i < 75; i++) { try { psql('select 1'); break; } catch (e) { await espera(200); } }

  // ── Roles, tabla, políticas y privilegios como en producción ──
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
  for (const f of [path.join(AQUI, 'produccion_triggers_existentes.sql'), path.join(RAIZ, 'api/sql/frisku_sp_ratelimit.sql'), path.join(RAIZ, 'api/sql/seg_intentos.sql')]) {
    const t = psqlTexto(fs.readFileSync(f, 'utf8'));
    if (!t.ok) throw new Error(`No se pudo aplicar ${path.basename(f)}: ${t.salida.slice(0, 400)}`);
  }
  psql(`alter role anon set statement_timeout = '3s'; alter role authenticated set statement_timeout = '8s';`);

  // ── Datos de prueba ──
  const admins = Array.isArray(sembrar.admins) ? sembrar.admins : [];
  if (admins.length) {
    const t = psqlTexto(fs.readFileSync(path.join(DIR_SQL, 'fase0_admins.sql'), 'utf8'));
    if (!t.ok) throw new Error('fase0_admins.sql falló: ' + t.salida.slice(0, 400));
    for (const em of admins) psql(`insert into public.seg_administradores (email, motivo, otorgado_por) values (${lit(String(em).toLowerCase())}, 'prueba local', 'entorno.mjs')`);
  }
  const usuarios = Array.isArray(sembrar.usuarios) ? sembrar.usuarios : [];
  const sembrarFila = (id, valor) => psql(`insert into public.calendario_data (id, value) values (${lit(id)}, ${lit(JSON.stringify(valor))}::jsonb)`);
  if (sembrar.usuarios) sembrarFila('usuarios', usuarios);
  if (sembrar.pins) sembrarFila('pins', sembrar.pins);
  if (sembrar.main || sembrar.usuarios) sembrarFila('main', { ...(sembrar.main || {}), usuarios: (sembrar.main && sembrar.main.usuarios) || usuarios });

  // ── PostgREST + proxy /rest/v1 (como el gateway de Supabase) ──
  const SECRETO = crypto.randomBytes(24).toString('hex');
  const b64u = (x) => Buffer.from(JSON.stringify(x)).toString('base64url');
  const jwt = (p) => { const h = b64u({ alg: 'HS256', typ: 'JWT' }), q = b64u(p); return `${h}.${q}.${crypto.createHmac('sha256', SECRETO).update(`${h}.${q}`).digest('base64url')}`; };
  const anon = jwt({ role: 'anon' }), service = jwt({ role: 'service_role' });
  const conf = path.join(DATA, 'pgrst.conf');
  fs.writeFileSync(conf, `db-uri = "postgres://authenticator@127.0.0.1:${pgPort}/postgres"\ndb-schemas = "public"\ndb-anon-role = "anon"\njwt-secret = "${SECRETO}"\nserver-host = "127.0.0.1"\nserver-port = ${pgrstPort}\n`);
  pgrst = spawn(POSTGREST_BIN, [conf], { stdio: 'ignore' });
  const pgrstUrl = `http://127.0.0.1:${pgrstPort}`;
  for (let i = 0; i < 75; i++) { try { const r = await fetch(`${pgrstUrl}/calendario_data?select=id`, { headers: { apikey: anon, Authorization: `Bearer ${anon}` } }); if (r.ok) break; } catch (e) {} await espera(200); }
  proxy = http.createServer((req, res) => {
    const p = http.request({ host: '127.0.0.1', port: pgrstPort, path: req.url.replace(/^\/rest\/v1/, ''), method: req.method, headers: { ...req.headers, host: `127.0.0.1:${pgrstPort}` } }, (r) => { res.writeHead(r.statusCode, r.headers); r.pipe(res); });
    p.on('error', (e) => { res.writeHead(502); res.end(String(e)); });
    req.pipe(p);
  });
  await new Promise((r) => proxy.listen(proxyPort, '127.0.0.1', r));
  const supabase = `http://127.0.0.1:${proxyPort}`;
  const recargarEsquema = async () => {
    psql(`notify pgrst, 'reload schema'`);
    for (let i = 0; i < 30; i++) { await espera(150); try { const r = await fetch(`${pgrstUrl}/`, { headers: { apikey: service, Authorization: `Bearer ${service}` } }); if (r.ok) break; } catch (e) {} }
    await espera(400);
  };
  if (admins.length) await recargarEsquema();

  // ── Handlers reales (variables de entorno ANTES de cargarlos) ──
  const secretoVerificar = crypto.randomBytes(16).toString('hex');
  Object.assign(process.env, {
    SUPABASE_URL: supabase, SUPABASE_SERVICE_ROLE_KEY: service,
    SESSION_SECRET: crypto.randomBytes(32).toString('hex'), AUTH_RATELIMIT_SECRET: crypto.randomBytes(32).toString('hex'),
    OSIRIS_VERIFICAR_SECRETO: secretoVerificar, AUTH_RL_IP_MAX: '100000',
  }, env);
  const require = createRequire(import.meta.url);
  const apiDir = path.join(RAIZ, 'api') + path.sep;
  for (const k of Object.keys(require.cache)) if (k.startsWith(apiDir)) delete require.cache[k];
  const S = require(path.join(RAIZ, 'api/_segServidor.js'));
  const hAuth = require(path.join(RAIZ, 'api/auth/[op].js'));
  const hDatos = require(path.join(RAIZ, 'api/datos/[fila].js'));
  const correos = [];
  S.__pruebas.setEnviarCorreo(async (m) => { correos.push({ ...m, ts: Date.now() }); return { success: true }; });

  const dirBuild = build ? path.resolve(build) : null;
  app = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://localhost');
    const trozos = [];
    req.on('data', (c) => trozos.push(c));
    req.on('end', async () => {
      const texto = Buffer.concat(trozos).toString('utf8');
      const m = u.pathname.match(/^\/api\/(auth|datos)\/([^/]+)\/?$/);
      if (m) {
        const query = Object.fromEntries(u.searchParams);
        if (m[1] === 'auth') query.op = decodeURIComponent(m[2]); else query.fila = decodeURIComponent(m[2]);
        shim(req, res, query, texto);
        try { await (m[1] === 'auth' ? hAuth : hDatos)(req, res); }
        catch (e) { if (!res.headersSent) { res.statusCode = 500; res.end(JSON.stringify({ error: 'excepcion', detalle: String(e && e.message) })); } }
        return;
      }
      if (u.pathname.startsWith('/api/')) { res.writeHead(404, { 'Content-Type': 'application/json' }); res.end('{"error":"no_existe_en_entorno"}'); return; }
      if (!dirBuild) { res.writeHead(404); res.end('sin build'); return; }
      let f = path.join(dirBuild, decodeURIComponent(u.pathname));
      if (!f.startsWith(dirBuild)) { res.writeHead(403); res.end(); return; }
      if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(dirBuild, 'index.html');
      res.writeHead(200, { 'Content-Type': TIPOS[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      fs.createReadStream(f).pipe(res);
    });
  });
  const pApp = puerto || await puertoLibre();
  await new Promise((r) => app.listen(pApp, 'localhost', r));

  const aplicar = async (nombre) => {
    const r = psqlTexto(fs.readFileSync(path.join(DIR_SQL, nombre), 'utf8'));
    await recargarEsquema();
    return r;
  };
  return { url: `http://localhost:${pApp}`, pgrst: pgrstUrl, supabase, anon, service, psql, psqlTexto, correos,
    secretoVerificar, aplicar, recargarEsquema, cerrar };
}
