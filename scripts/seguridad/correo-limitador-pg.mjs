/* ─────────────────────────────────────────────────────────────────────────
   CORREO contra la función REAL del limitador (oct-2026). Postgres 16 local,
   datos y credenciales ficticios, correo SIMULADO (ningún mensaje real).

     node scripts/seguridad/correo-limitador-pg.mjs

   Aplica api/sql/frisku_sp_ratelimit.sql tal cual y conecta api/_correo.js con el
   adaptador de producción (api/_friskuSpRateLimiter.js); solo cambia el transporte
   HTTP de la RPC por una llamada psql. Comprueba:
   1. la identidad de envío se registra (una fila HMAC, sin PII) y un reintento NO reenvía;
   2. cinco reintentos simultáneos → un solo correo (FOR UPDATE de la función real);
   3. el límite de intentos de PIN corta al sexto;
   4. control: con la regla anterior (tipo 'idem', bloqueo 0) la función real rechaza
      cada envío (503) o deja pasar el duplicado.
   ───────────────────────────────────────────────────────────────────────── */
import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import { spawn, execFileSync } from 'child_process';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
const require = createRequire(import.meta.url);
const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, '../..');
const { crearCorreo, IDEM } = require(path.join(RAIZ, 'api/_correo.js'));
const RL = require(path.join(RAIZ, 'api/_friskuSpRateLimiter.js'));

const PG_BIN = process.env.PG_BIN || '/usr/lib/postgresql/16/bin';
const PG_PORT = 54341;
let fallos = 0;
const check = (n, c, x = '') => { console.log(`${c ? '✓' : '✗ FALLA'}  ${n}${x ? '  — ' + x : ''}`); if (!c) fallos++; };
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

const esRoot = process.getuid && process.getuid() === 0;
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'correo-pg-'));
if (esRoot) execFileSync('chown', ['-R', 'postgres', DATA]);
fs.chmodSync(DATA, 0o700);
const comoPg = (cmd, args) => (esRoot ? ['runuser', ['-u', 'postgres', '--', cmd, ...args]] : [cmd, args]);
execFileSync(...comoPg(`${PG_BIN}/initdb`, ['-D', DATA, '-A', 'trust', '-U', 'postgres']), { stdio: 'ignore' });
const [c0, a0] = comoPg(`${PG_BIN}/postgres`, ['-D', DATA, '-p', String(PG_PORT), '-k', DATA, '-c', 'listen_addresses=127.0.0.1']);
spawn(c0, a0, { stdio: 'ignore' });
const detener = () => { try { execFileSync(...comoPg(`${PG_BIN}/pg_ctl`, ['-D', DATA, '-m', 'immediate', 'stop']), { stdio: 'ignore' }); } catch (e) {} try { fs.rmSync(DATA, { recursive: true, force: true }); } catch (e) {} };
process.on('exit', detener);
const PSQL = ['-h', '127.0.0.1', '-p', String(PG_PORT), '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-qAt'];
const psql = (sql) => execFileSync(`${PG_BIN}/psql`, [...PSQL, '-c', sql], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const psqlAsync = (sql) => new Promise((ok, mal) => {
  const p = spawn(`${PG_BIN}/psql`, [...PSQL, '-c', sql]); let o = '', e = '';
  p.stdout.on('data', d => o += d); p.stderr.on('data', d => e += d);
  p.on('close', (code) => code === 0 ? ok(o.trim()) : mal(new Error(e.trim())));
});
for (let i = 0; i < 60; i++) { try { psql('select 1'); break; } catch (e) { await espera(200); } }
psql('create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;');
execFileSync(`${PG_BIN}/psql`, [...PSQL, '-f', path.join(RAIZ, 'api/sql/frisku_sp_ratelimit.sql')], { stdio: ['ignore', 'pipe', 'pipe'] });

// La RPC de Supabase, servida por psql: mismo cuerpo que envía el adaptador de producción.
const fetchRpc = async (url, init) => {
  const b = JSON.parse(init.body);
  const lit = (s) => `'${String(s).replace(/'/g, "''")}'`;
  try {
    const out = await psqlAsync(`select frisku_sp_rl_consumir(${lit(b.p_bucket)}, ${lit(b.p_tipo)}, ${Number(b.p_ventana_seg)}, ${Number(b.p_max)}, ${Number(b.p_bloqueo_seg)})::text`);
    return { ok: true, status: 200, json: async () => JSON.parse(out) };
  } catch (e) { return { ok: false, status: 400, json: async () => ({ message: e.message }) }; }
};
const SECRETO_RL = crypto.randomBytes(24).toString('hex');      // ficticio, solo de esta prueba
const limitador = RL.crearLimiterSupabase({ supaUrl: 'http://local.invalid', serviceKey: 'clave-ficticia', hmacSecret: SECRETO_RL, fetchImpl: fetchRpc });

const credFicticia = (pin) => { const salt = crypto.randomBytes(16).toString('hex');
  return JSON.stringify({ v: 1, iter: 1000, salt, hash: crypto.pbkdf2Sync(pin, Buffer.from(salt, 'hex'), 1000, 32, 'sha256').toString('hex'), pol: '6dig' }); };
const usuarios = [{ nombre: 'Persona Ficticia', email: 'persona@ejemplo.test', rol: 'admin', modulos: ['tareas'] },
  { nombre: 'Destino Ficticio', email: 'destino@ejemplo.test', rol: 'editor', modulos: ['tareas'] }];
const pins = { 'Persona Ficticia_h': credFicticia('246810'), 'Destino Ficticio_h': credFicticia('135790') };
const ORIGEN = 'https://gestion-grupo-mediterra.vercel.app';
function entorno(idem) {
  const enviados = [];
  const h = crearCorreo({ leerFilas: async () => ({ usuarios, pins }), transporte: { async enviar(m) { enviados.push(m); return { messageId: 'sim' }; } },
    limitador, leerEjecucion: async () => null, armarReporte: () => ({}), cfg: { secret: crypto.randomBytes(24).toString('hex'), origenes: [ORIGEN] } });
  return { h, enviados };
}
async function pedir(env, body, cookie = '', ip = '10.9.0.1') {
  const res = { statusCode: 0, headers: {}, cuerpo: null, setHeader(k, v) { this.headers[k.toLowerCase()] = v; }, status(c) { this.statusCode = c; return this; }, json(b) { this.cuerpo = b; return this; }, end() { return this; } };
  await env.h({ method: 'POST', headers: { origin: ORIGEN, cookie, 'x-forwarded-for': ip }, body }, res);
  return res;
}

const e = entorno();
const s = await pedir(e, { accion: 'sesion', email: 'persona@ejemplo.test', pin: '246810' });
const cookie = String(s.headers['set-cookie'] || '').split(';')[0];
check('0. sesión abierta contra la función real del limitador', s.statusCode === 200 && !!cookie, `HTTP ${s.statusCode}`);
const notif = (id) => pedir(e, { accion: 'notificacion', para: ['destino@ejemplo.test'], asunto: 'Prueba', mensaje: 'texto ficticio', idEnvio: id }, cookie);
const a = await notif('envio-real-0001'), b = await notif('envio-real-0001');
check('1. primer envío sale; el reintento con la misma identidad NO reenvía («ya procesado»)', a.statusCode === 200 && !a.cuerpo.duplicado && b.cuerpo.duplicado === true && e.enviados.length === 1);
const filas = psql("select count(*) from frisku_sp_ratelimit where bucket ~ '^[0-9a-f]{64}$'");
const pii = psql("select count(*) from frisku_sp_ratelimit where bucket like '%@%' or bucket like '%envio%'");
check('1b. la identidad queda como fila HMAC opaca, sin correo ni id en claro', Number(filas) >= 1 && pii === '0', `${filas} filas`);
const simult = await Promise.all(Array.from({ length: 5 }, () => notif('envio-real-0002')));
check('2. cinco reintentos simultáneos → un solo correo', e.enviados.length === 2 && simult.filter(x => x.cuerpo && x.cuerpo.duplicado).length === 4, simult.map(x => x.statusCode).join(','));
let ult;
for (let i = 0; i < 6; i++) ult = await pedir(e, { accion: 'sesion', email: 'persona@ejemplo.test', pin: '000000' }, '', '10.9.0.9');
check('3. el sexto intento de PIN en 15 minutos → 429', ult.statusCode === 429, `HTTP ${ult.statusCode}`);
// 4. Control con la regla anterior
const { _corr } = {};
let ctlTipo, ctlBloqueo;
try { await limitador.golpe('idem:control', { tipo: 'idem', max: 1, ventanaMs: 86400e3, bloqueoMs: 0 }); ctlTipo = 'aceptado'; } catch (err) { ctlTipo = 'rechazado'; }
const r1 = await limitador.golpe('idem:control-bloqueo', { tipo: 'identidad', max: 1, ventanaMs: 86400e3, bloqueoMs: 0 });
const r2 = await limitador.golpe('idem:control-bloqueo', { tipo: 'identidad', max: 1, ventanaMs: 86400e3, bloqueoMs: 0 });
ctlBloqueo = r1.permitido && r2.permitido;
check("4. control: tipo 'idem' lo rechaza la función real (cada envío habría respondido 503)", ctlTipo === 'rechazado');
check('4b. control: con bloqueo 0 el segundo uso queda PERMITIDO (no deduplicaba)', ctlBloqueo === true);
check('4c. la regla vigente usa tipo admitido y bloqueo > 0', ['ip', 'identidad'].includes(IDEM.tipo) && IDEM.bloqueoMs > 0);
console.log(fallos ? `\n${fallos} falla(s)` : '\nTodo OK · Postgres 16 local · función real · correo simulado, ningún mensaje real');
process.exit(fallos ? 1 : 0);
