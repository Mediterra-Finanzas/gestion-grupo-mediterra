/* ─────────────────────────────────────────────────────────────────────────
   Prueba de punta a punta del SERVIDOR de la migración main/pins, sobre HTTP,
   contra Postgres 16 + PostgREST 12 LOCALES (entorno.mjs). SOLO datos de prueba.
     (a) vulnerabilidades de HOY reproducidas con la llave anon
     (b) endpoints /api/auth/* y /api/datos/* (reglas, scopes, admin, OCC)
     (c) fases 0, A, B y C aplicadas TAL CUAL, en orden: anon bloqueado y la app sigue
     (d) recuperar acceso con la fase C aplicada
     (e) reversion.sql deja la foto exacta de hoy
   Uso: POSTGREST_BIN=/ruta/postgrest node scripts/seguridad-main-pins/prueba-servidor.mjs
   ───────────────────────────────────────────────────────────────────────── */
import crypto from 'crypto';
import path from 'path';
import { createRequire } from 'module';
import { pathToFileURL } from 'url';
import { levantarEntorno, RAIZ } from './entorno.mjs';

const require = createRequire(import.meta.url);

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } return !!c; };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), JSON.stringify(a) === JSON.stringify(b) ? m : `${m} (esperado ${JSON.stringify(b)}, obtenido ${JSON.stringify(a)})`);
// Cada sección parte sin contadores de rate limit (las pruebas reusan los mismos correos).
let E = null;
const titulo = (t) => { console.log('\n' + t); if (E) E.psql('delete from frisku_sp_ratelimit'); };

const DIA = 86400000;
const hoy = new Date().toISOString().slice(0, 10);
const hace = (d) => new Date(Date.now() - d * DIA).toISOString().slice(0, 10);
function cred(pin, extra = {}) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.pbkdf2Sync(String(pin), salt, 1000, 32, 'sha256').toString('hex');
  return JSON.stringify({ v: 1, iter: 1000, salt: salt.toString('hex'), hash, ...extra });
}
const tempCred = (codigo, expMs) => { const c = JSON.parse(cred(codigo)); c.exp = expMs; return JSON.stringify(c); };

// ── Datos de prueba ──
const em = (n) => `${n.toLowerCase()}@prueba.test`;
const U = (nombre, extra = {}) => ({ nombre, email: em(nombre), cargo: 'Prueba', rol: 'editor', esCFO: false, desactivado: false, modulos: ['tareas'], tab_permisos: {}, ...extra });
const usuarios = [
  U('Ana', { rol: 'admin', esCFO: true }),        // admin real (seg_administradores)
  U('Beto'), U('Caro', { desactivado: true }),
  U('Dani'),                                     // _h sin pol (PIN de 4 dígitos)
  U('Eva'),                                      // _h vencido (70 días)
  U('Fede'),                                     // _temp vigente
  U('Fito'),                                     // _temp vencido
  U('Gabi', { pin: '1357' }),                    // sin _h (PIN plano heredado)
  U('Hugo', { rol: 'admin' }),                   // rol admin en usuarios, NO en seg_administradores
  U('Ines', { tab_permisos: { tareas: { config: 'editar' } } }),
  U('Rita'), U('Tomas'), U('Zoe'), U('Lalo'),
];
const PIN = { Ana: '482916', Beto: '579135', Caro: '680246', Dani: '4821', Eva: '802468', Fede: '913570', Fito: '914725',
  Hugo: '357913', Ines: '468024', Rita: '135792', Tomas: '246813', Zoe: '197531', Lalo: '286420' };
const pins = {};
for (const [n, p] of Object.entries(PIN)) pins[`${n}_h`] = cred(p, n === 'Dani' ? { fecha: hoy } : { pol: '6dig', fecha: n === 'Eva' ? hace(70) : hoy });
pins.Fede_temp = tempCred('640213', Date.now() + 40 * 60000);
pins.Fito_temp = tempCred('640214', Date.now() - 60000);
pins.Gabi = '1357';
pins.Tomas_tel = '56912345678';
const main = { estados: { m1: 'ok' }, comentarios: {}, tareasConfig: { m1: { bloqueada: false } }, supervisores: {}, tareasExtra: [],
  tareasOverrides: {}, recsDone: {}, recsComentarios: {}, mes: 9, anio: 2026, pinsPersonalizados: { Ana_h: pins.Ana_h } };

E = await levantarEntorno({ sembrar: { usuarios, pins, main, admins: [] } });
E.psql(`insert into calendario_data (id, value) values ('finanzas', '{"flujo":1}'::jsonb)`);
const fotoPoliticas = () => E.psql(`select string_agg(policyname||'|'||cmd||'|'||array_to_string(roles,',')||'|'||coalesce(qual,'')||'|'||coalesce(with_check,''), E'\\n' order by policyname) from pg_policies where tablename='calendario_data'`)
  + '\n' + E.psql(`select string_agg(grantee||':'||privilege_type, ',' order by grantee, privilege_type) from information_schema.role_table_grants where table_name='calendario_data'`);
const FOTO_HOY = fotoPoliticas();

async function pedir(metodo, ruta, { body, cookie, headers = {}, crudo } = {}) {
  const h = { ...headers };
  if (body !== undefined) h['Content-Type'] = 'application/json';
  if (cookie) h.Cookie = cookie;
  const r = await fetch(E.url + ruta, { method: metodo, headers: h, body: crudo !== undefined ? crudo : body !== undefined ? JSON.stringify(body) : undefined });
  const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch (e) {}
  const sc = r.headers.get('set-cookie');
  return { status: r.status, j, cookie: sc ? sc.split(';')[0] : null, setCookie: sc || '' };
}
const login = (email, pin) => pedir('POST', '/api/auth/login', { body: { email, pin } });
async function rest(metodo, ruta, { key = E.anon, body, prefer } = {}) {
  const h = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
  if (prefer) h.Prefer = prefer;
  const r = await fetch(`${E.supabase}/rest/v1/${ruta}`, { method: metodo, headers: h, body: body !== undefined ? JSON.stringify(body) : undefined });
  const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch (e) {}
  return { status: r.status, j };
}
const filaDB = (id) => JSON.parse(E.psql(`select value::text from calendario_data where id='${id}'`) || 'null');
const fijarFila = (id, v) => E.psql(`update calendario_data set value='${JSON.stringify(v).replace(/'/g, "''")}'::jsonb, updated_at=now() where id='${id}'`);
const codigoDe = (para) => { const c = [...E.correos].reverse().find((m) => m.to === para); const m = c && /código provisorio es: (\d{6})/.exec(c.message); return m ? m[1] : null; };
async function completa(nombre, pin = PIN[nombre]) { const r = await login(em(nombre), pin); return r.j && r.j.debeCambiarPin === false ? r.cookie : null; }
function verificacion() {
  const r = E.psqlTexto(require('fs').readFileSync(path.join(RAIZ, 'supabase/seguridad_main_pins/verificacion.sql'), 'utf8'));
  const filas = r.salida.split('\n').filter((l) => /^\d+\|/.test(l)).map((l) => l.split('|'));
  return { ok: r.ok, estado: (filas.find((f) => f[0] === '1') || [])[2], revisar: filas.filter((f) => !String(f[4]).startsWith('ok')).map((f) => `${f[0]} ${f[1]}: ${f[2]} (${f[4]})`) };
}

try {
  // ═══════════════════════ (a) VULNERABILIDADES DE HOY ═══════════════════════
  titulo('(a) Hoy, con la llave pública (anon):');
  {
    const v = verificacion();
    eq([v.ok, v.estado, v.revisar], [true, 'HOY', []], 'verificacion.sql detecta HOY y todo coincide');
    const r = await rest('GET', 'calendario_data?id=eq.pins&select=value');
    ok(r.status === 200 && r.j[0] && r.j[0].value.Ana_h, 'VULNERABLE: anon LEE la fila pins (hashes de todos)');
    const orig = filaDB('pins');
    const w = await rest('PATCH', 'calendario_data?id=eq.pins', { body: { value: { ...orig, Ana_temp: tempCred('777123', Date.now() + 40 * 60000) } }, prefer: 'return=representation' });
    ok(w.status === 200 && w.j.length === 1, 'VULNERABLE: anon ESCRIBE pins (código provisorio para la admin Ana)');
    const l = await login(em('Ana'), '777123');
    const c = await pedir('POST', '/api/auth/cambiar-pin', { cookie: l.cookie, body: { pinNuevo: '730518' } });
    ok(l.j && l.j.debeCambiarPin && c.status === 200, 'VULNERABLE: con ese código se toma la cuenta de Ana (login + cambio de PIN)');
    fijarFila('pins', orig);
    const u = filaDB('usuarios');
    const w2 = await rest('PATCH', 'calendario_data?id=eq.usuarios', { body: { value: u.map((x) => x.nombre === 'Beto' ? { ...x, rol: 'admin' } : x) }, prefer: 'return=representation' });
    ok(w2.status === 200 && filaDB('usuarios').find((x) => x.nombre === 'Beto').rol === 'admin', 'VULNERABLE: anon ESCRIBE usuarios (Beto rol admin)');
    fijarFila('usuarios', u);
    const t = await rest('DELETE', 'calendario_data?id=eq.zz_prueba', {});
    ok(t.status === 204, 'anon puede BORRAR filas (prueba sobre una fila inexistente)');
    const b = await completa('Beto');
    eq((await pedir('POST', '/api/auth/admin-reset-pin', { cookie: b, body: { nombre: 'Rita' } })).status, 503, 'sin seg_administradores, admin-reset-pin falla CERRADO (503)');
    const fa = await E.aplicar('faseA_bloquear_escritura.sql');
    ok(!fa.ok && /falta public.seg_administradores/.test(fa.salida) && fotoPoliticas() === FOTO_HOY, 'fase A sin fase 0 → ABORTA sin tocar nada');
    const fb = await E.aplicar('faseB_bloquear_lectura.sql');
    ok(!fb.ok && /se esperaba el estado A/.test(fb.salida) && fotoPoliticas() === FOTO_HOY, 'fase B desde HOY → ABORTA sin tocar nada');
  }

  {
    const txt = require('fs').readFileSync(path.join(RAIZ, 'supabase/seguridad_main_pins/consultas_previas.sql'), 'utf8');
    const bloque = (cod) => txt.split(/\n(?=-- M\d\.)/).find((b) => b.startsWith(`-- ${cod}.`));
    const m1 = E.psqlTexto(bloque('M1'));
    ok(m1.ok && /main\|jsonb\|object/.test(m1.salida) && /pins\|jsonb\|object/.test(m1.salida) && /usuarios\|jsonb\|array/.test(m1.salida), 'consultas_previas M1: tipo de columna y de cada fila');
    const m4 = E.psqlTexto(bloque('M4'));
    // 14 usuarios · 1 desactivada (Caro) · Gabi sin _h · Dani sin 6dig · Eva vencida · 12 activos sin sello ts
    // · Fede/Fito con código hasheado · Tomas con celular · Gabi con PIN plano
    eq(m4.ok ? m4.salida.trim() : m4.salida, '14|1|0|0|0|1|1|1|12|0|2|1|1', 'consultas_previas M4: conteos de quién quedaría sin acceso');
    const m5 = E.psqlTexto(bloque('M5'));
    eq(m5.ok ? m5.salida.trim() : m5.salida, '1|1|0', 'consultas_previas M5: RPC y tabla del rate limit presentes, aún sin seg_administradores');
  }

  // ═══════════════════════ FASE 0 ═══════════════════════
  titulo('Fase 0 (seg_administradores):');
  {
    const f0 = await E.aplicar('fase0_admins.sql');
    ok(f0.ok, 'fase0_admins.sql aplicada tal cual');
    const fa = await E.aplicar('faseA_bloquear_escritura.sql');
    ok(!fa.ok && /ningún administrador activo/.test(fa.salida), 'fase A sin admins activos → ABORTA');
    E.psql(`insert into seg_administradores (email, motivo, otorgado_por) values ('ana@prueba.test','prueba','prueba-servidor')`);
    ok((await E.aplicar('fase0_admins.sql')).ok, 'fase0 re-ejecutable (tabla ya existe con la forma esperada)');
    const r = await rest('GET', 'seg_administradores?select=email');
    ok(r.status === 401 || r.status === 403 || r.status === 404, `anon NO puede leer seg_administradores (HTTP ${r.status})`);
    const s = await rest('GET', 'seg_administradores?select=email', { key: E.service });
    eq(s.j, [{ email: 'ana@prueba.test' }], 'service_role sí la lee');
    let err = ''; try { E.psql(`insert into seg_administradores (email, motivo, otorgado_por) values ('MAYUS@x.cl','m','p')`); } catch (e) { err = String(e.stderr || e.message); }
    ok(/check/i.test(err), 'email en mayúsculas → rechazado por CHECK');
  }

  // ═══════════════════════ (b) ENDPOINTS ═══════════════════════
  titulo('(b) Login (los 5 casos de 8d7116f y más):');
  {
    const f = await login(em('Fede'), '640213');
    eq([f.status, f.j.debeCambiarPin, f.j.motivo, /scope/.test(f.setCookie) || f.cookie !== null], [200, true, 'temp', true], '_temp vigente + código → cambio obligatorio (cookie cambio_pin)');
    eq((await login(em('Fede'), PIN.Fede)).status, 401, '_temp vigente: el PIN antiguo NO entra');
    eq((await login(em('Gabi'), '1357')).status, 401, 'sin _h: el PIN plano NO entra (sin respaldo en modo servidor)');
    const d = await login(em('Dani'), PIN.Dani);
    eq([d.status, d.j.debeCambiarPin, d.j.motivo], [200, true, 'politica'], '_h sin pol:6dig → cambio obligatorio (politica)');
    const e = await login(em('Eva'), PIN.Eva);
    eq([e.status, e.j.debeCambiarPin, e.j.motivo], [200, true, 'vencido'], '_h con más de 60 días → cambio obligatorio (vencido)');
    const b = await login(em('Beto'), PIN.Beto);
    eq([b.status, b.j.debeCambiarPin, b.j.usuario && b.j.usuario.nombre, 'pin' in (b.j.usuario || {})], [200, false, 'Beto', false], 'OK → sesión completa con usuario (sin pin)');
    ok(/HttpOnly/.test(b.setCookie) && /SameSite=Strict/.test(b.setCookie) && /Secure/.test(b.setCookie), 'cookie HttpOnly; Secure; SameSite=Strict');
    eq((await login(em('Fito'), '640214')).status, 401, '_temp vencido → 401');
    eq([(await login(em('Caro'), PIN.Caro)).status, (await login(em('Caro'), PIN.Caro)).j.error], [403, 'desactivado'], 'desactivado → 403');
    const x = await login('nadie@prueba.test', '123987');
    eq([x.status, x.j], [401, { error: 'credenciales' }], 'email inexistente → 401 credenciales (genérico)');
    eq((await login(em('Beto'), '000001')).j, { error: 'credenciales' }, 'PIN incorrecto → 401 credenciales (mismo cuerpo)');
    for (let i = 0; i < 8; i++) await login(em('Rita'), '000000');
    const rl = await login(em('Rita'), PIN.Rita);
    eq([rl.status, rl.j], [429, { error: 'bloqueado' }], 'rate limit: 9.º intento en 5 min → 429 (aunque el PIN sea correcto)');
    eq((await pedir('POST', '/api/auth/login', { crudo: 'email=a', headers: { 'Content-Type': 'text/plain' } })).status, 415, 'login sin JSON → 415');
  }

  titulo('(b) Cookie "cambio_pin" no sirve para nada más:');
  {
    const d = await login(em('Dani'), PIN.Dani);
    for (const [m, r, body] of [['GET', '/api/datos/main'], ['GET', '/api/datos/roster'], ['GET', '/api/datos/usuarios'],
      ['PUT', '/api/datos/usuarios', { valor: usuarios, version: 'x' }], ['PATCH', '/api/datos/main', { patch: { mes: 1 }, version: 'x' }],
      ['POST', '/api/auth/admin-reset-pin', { nombre: 'Beto' }]]) {
      eq((await pedir(m, r, { cookie: d.cookie, body })).status, 403, `cambio_pin → 403 en ${m} ${r}`);
    }
    const s = await pedir('GET', '/api/auth/sesion', { cookie: d.cookie });
    eq([s.status, s.j.scope, Object.keys(s.j.usuario).sort()], [200, 'cambio_pin', ['email', 'nombre']], 'sesion con cambio_pin → scope cambio_pin, sin permisos');
    // api/storage.js (guardia de archivos) tampoco la acepta.
    const storage = require(path.join(RAIZ, 'api/storage.js'));
    const correr = (cookie) => new Promise((res) => { const r = { statusCode: 0, setHeader() {}, status(c) { this.statusCode = c; return this; }, json(o) { res([this.statusCode, o]); } };
      storage({ method: 'POST', headers: { cookie }, body: { op: 'sign', bucket: 'otro', path: 'x' } }, r); });
    eq((await correr(d.cookie))[0], 401, 'api/storage.js con cambio_pin → 401');
    const bc = await completa('Beto');
    eq((await correr(bc))[1], { error: 'bucket_no_permitido', bucket: 'otro' }, 'api/storage.js con sesión completa → pasa la sesión');
    // Huella: si la credencial cambia (reseteo del admin), la cookie cambio_pin ya no cambia el PIN sin el código.
    const ana = await completa('Ana');
    eq((await pedir('POST', '/api/auth/admin-reset-pin', { cookie: ana, body: { nombre: 'Dani' } })).status, 200, 'admin resetea a Dani');
    eq((await pedir('POST', '/api/auth/cambiar-pin', { cookie: d.cookie, body: { pinNuevo: '730519' } })).status, 401, 'cookie cambio_pin emitida ANTES del reseteo → 401 sin el código');
    const cod = codigoDe(em('Dani'));
    eq((await pedir('POST', '/api/auth/cambiar-pin', { cookie: d.cookie, body: { pinActual: cod, pinNuevo: '730519' } })).status, 200, '…con el código provisorio sí cambia');
  }

  titulo('(b) cambiar-pin:');
  {
    const e = await login(em('Eva'), PIN.Eva);
    eq((await pedir('POST', '/api/auth/cambiar-pin', { cookie: e.cookie, body: { pinNuevo: '123456' } })).j, { error: 'pin_invalido' }, 'secuencia → 400 pin_invalido');
    eq((await pedir('POST', '/api/auth/cambiar-pin', { cookie: e.cookie, body: { pinNuevo: PIN.Eva } })).j, { error: 'pin_repetido' }, 'PIN actual → 400 pin_repetido');
    const c = await pedir('POST', '/api/auth/cambiar-pin', { cookie: e.cookie, body: { pinNuevo: '913580' } });
    eq([c.status, c.j.usuario && c.j.usuario.nombre], [200, 'Eva'], 'cambio OK → 200 + cookie completa');
    eq((await pedir('GET', '/api/datos/roster', { cookie: c.cookie })).status, 200, 'la cookie nueva da acceso a datos');
    eq((await login(em('Eva'), '913580')).j.debeCambiarPin, false, 'con el PIN nuevo entra sin cambio obligatorio');
    const h = JSON.parse(filaDB('pins').Eva_h);
    eq([h.pol, h.fecha], ['6dig', hoy], 'el _h nuevo queda sellado (pol 6dig, fecha de hoy)');
    const f = await login(em('Fede'), '640213');
    eq((await pedir('POST', '/api/auth/cambiar-pin', { cookie: f.cookie, body: { pinNuevo: '740251' } })).status, 200, 'Fede (código provisorio) crea su PIN');
    eq(filaDB('pins').Fede_temp, undefined, 'el _temp se elimina');
    eq((await login(em('Fede'), '640213')).status, 401, 'el código provisorio ya no sirve (un solo uso)');
    const b = await completa('Beto');
    eq((await pedir('POST', '/api/auth/cambiar-pin', { cookie: b, body: { pinNuevo: '740252' } })).status, 401, 'sesión completa sin PIN actual → 401');
    eq((await pedir('POST', '/api/auth/cambiar-pin', { cookie: b, body: { pinActual: '000000', pinNuevo: '740252' } })).status, 401, 'PIN actual incorrecto → 401');
    eq((await pedir('POST', '/api/auth/cambiar-pin', { body: { pinNuevo: '740252' } })).status, 401, 'sin cookie → 401');
  }

  titulo('(b) recuperar:');
  {
    const n0 = E.correos.length;
    eq((await pedir('POST', '/api/auth/recuperar', { body: { email: 'nadie@prueba.test' } })).j, { ok: true }, 'email inexistente → 200 {ok:true}');
    eq((await pedir('POST', '/api/auth/recuperar', { body: { email: em('Tomas') } })).status, 200, 'cuenta con celular, sin celular → 200…');
    eq(E.correos.length, n0, '…y no se envía nada');
    eq((await pedir('POST', '/api/auth/recuperar', { body: { email: em('Tomas'), tel: '9 1234 5678' } })).status, 200, 'cuenta con celular, celular correcto → 200');
    ok(codigoDe(em('Tomas')), '…correo capturado con código');
    eq((await pedir('POST', '/api/auth/recuperar', { body: { email: em('Zoe') } })).status, 200, 'recuperar Zoe → 200');
    const cod = codigoDe(em('Zoe'));
    ok(/^\d{6}$/.test(cod || '') && !JSON.stringify(filaDB('pins')).includes(`"${cod}"`), 'código de 6 dígitos por correo; en pins solo su hash');
    eq((await login(em('Zoe'), PIN.Zoe)).status, 401, 'tras pedir código, el PIN antiguo no entra');
    const l = await login(em('Zoe'), cod);
    eq([l.status, l.j.motivo], [200, 'temp'], 'con el código entra a cambio obligatorio');
    eq((await pedir('POST', '/api/auth/cambiar-pin', { cookie: l.cookie, body: { pinNuevo: '851937' } })).status, 200, 'crea PIN nuevo');
    PIN.Zoe = '851937';
    eq((await login(em('Zoe'), cod)).status, 401, 'el código funciona UNA vez');
  }

  titulo('(b) sesion, desactivación en curso, cookie falsificada, logout:');
  {
    const b = await completa('Beto');
    const s = await pedir('GET', '/api/auth/sesion', { cookie: b });
    eq([s.status, s.j.scope, s.j.usuario.nombre, s.j.admin], [200, 'completa', 'Beto', false], 'sesion restaura usuario (admin=false)');
    eq((await pedir('GET', '/api/auth/sesion', { cookie: await completa('Ana') })).j.admin, true, 'Ana: admin=true (seg_administradores)');
    const u = filaDB('usuarios');
    fijarFila('usuarios', u.map((x) => x.nombre === 'Beto' ? { ...x, desactivado: true } : x));
    eq((await pedir('GET', '/api/auth/sesion', { cookie: b })).status, 401, 'desactivado a mitad de sesión → sesion 401');
    eq((await pedir('GET', '/api/datos/main', { cookie: b })).status, 401, '… y datos 401');
    fijarFila('usuarios', u);
    const [cuerpo, firma] = decodeURIComponent(b.split('=')[1]).split('.');
    const p = JSON.parse(Buffer.from(cuerpo, 'base64url').toString()); p.email = em('Ana'); p.nombre = 'Ana';
    const falsa = `mediterra_sess=${encodeURIComponent(Buffer.from(JSON.stringify(p)).toString('base64url') + '.' + firma)}`;
    eq((await pedir('GET', '/api/auth/sesion', { cookie: falsa })).status, 401, 'cookie con payload cambiado (HMAC no coincide) → 401');
    eq((await pedir('GET', '/api/datos/roster', { cookie: falsa })).status, 401, '… y en datos → 401');
    const sinFirma = `mediterra_sess=${encodeURIComponent(Buffer.from(JSON.stringify({ ...p, scope: 'completa', exp: Date.now() + 1e6 })).toString('base64url') + '.AAAA')}`;
    eq((await pedir('POST', '/api/auth/admin-reset-pin', { cookie: sinFirma, body: { nombre: 'Beto' } })).status, 401, 'cookie forjada en admin-reset-pin → 401');
    const lo = await pedir('POST', '/api/auth/logout', { cookie: b, body: {} });
    ok(lo.status === 200 && /Max-Age=0/.test(lo.setCookie), 'logout → 200 y borra la cookie');
  }

  titulo('(b) admin-reset-pin solo para seg_administradores:');
  {
    const ana = await completa('Ana');
    const r = await pedir('POST', '/api/auth/admin-reset-pin', { cookie: ana, body: { nombre: 'Lalo' } });
    ok(r.status === 200 && /^\d{6}$/.test(r.j.codigo) && codigoDe(em('Lalo')) === r.j.codigo, 'Ana (seg_administradores) → 200 {codigo} + correo');
    eq((await login(em('Lalo'), r.j.codigo)).j.motivo, 'temp', 'el código del admin permite entrar a cambio obligatorio');
    const hugo = await completa('Hugo');
    eq((await pedir('POST', '/api/auth/admin-reset-pin', { cookie: hugo, body: { nombre: 'Beto' } })).status, 403, 'Hugo (rol admin en usuarios, NO en seg_administradores) → 403');
    eq((await pedir('POST', '/api/auth/admin-reset-pin', { cookie: await completa('Beto'), body: { nombre: 'Ana' } })).status, 403, 'Beto (editor) → 403');
    eq((await pedir('POST', '/api/auth/admin-reset-pin', { cookie: ana, body: { nombre: 'NoExiste' } })).status, 404, 'usuario inexistente → 404');
    E.psql(`update seg_administradores set activo=false, revocado_por='prueba', revocado_en=now(), revocado_motivo='prueba' where email='ana@prueba.test'`);
    eq((await pedir('POST', '/api/auth/admin-reset-pin', { cookie: ana, body: { nombre: 'Lalo' } })).status, 403, 'admin revocado → 403 en la siguiente petición (se relee siempre)');
    E.psql(`update seg_administradores set activo=true, revocado_por=null, revocado_en=null, revocado_motivo=null where email='ana@prueba.test'`);
  }

  titulo('(b) GET/PUT /api/datos/usuarios:');
  {
    const ana = await completa('Ana');
    const g = await pedir('GET', '/api/datos/usuarios', { cookie: ana });
    ok(g.status === 200 && g.j.version && g.j.usuarios.length === usuarios.length && !JSON.stringify(g.j).includes('"pin"'), 'GET usuarios → padrón sin pin + version');
    const r = await pedir('GET', '/api/datos/roster', { cookie: await completa('Beto') });
    ok(r.status === 200 && !('version' in r.j) && !JSON.stringify(r.j).includes('_h'), 'GET roster (cualquier sesión completa) → sin credenciales');
    const nuevo = g.j.usuarios.map((x) => x.nombre === 'Beto' ? { ...x, cargo: 'Analista' } : x);
    const p = await pedir('PUT', '/api/datos/usuarios', { cookie: ana, body: { valor: nuevo, version: g.j.version } });
    ok(p.status === 200 && p.j.version && p.j.version !== g.j.version, 'admin PUT → 200 + version nueva');
    eq(filaDB('usuarios').find((x) => x.nombre === 'Gabi').pin, '1357', 'PUT conserva el pin heredado guardado (no visible al navegador)');
    eq((await pedir('PUT', '/api/datos/usuarios', { cookie: ana, body: { valor: nuevo, version: g.j.version } })).status, 409, 'versión vieja → 409');
    eq((await pedir('PUT', '/api/datos/usuarios', { cookie: ana, body: { valor: nuevo.map((x, i) => i ? x : { ...x, pin: '9999' }), version: p.j.version } })).j, { error: 'campos_credenciales' }, 'con pin → 400 campos_credenciales');
    eq((await pedir('PUT', '/api/datos/usuarios', { cookie: ana, body: { valor: nuevo.map((x, i) => i ? x : { ...x, Ana_h: '{}' }), version: p.j.version } })).status, 400, 'con _h → 400');
    eq((await pedir('PUT', '/api/datos/usuarios', { cookie: await completa('Hugo'), body: { valor: nuevo, version: p.j.version } })).status, 403, 'Hugo (rol admin solo en usuarios) → 403');
  }

  titulo('(b) GET/PATCH /api/datos/main:');
  {
    const b = await completa('Beto');
    const g = await pedir('GET', '/api/datos/main', { cookie: b });
    ok(g.status === 200 && g.j.version && g.j.valor.estados && !('usuarios' in g.j.valor) && !('pinsPersonalizados' in g.j.valor), 'GET main → valor sin usuarios ni pinsPersonalizados + version');
    const p = await pedir('PATCH', '/api/datos/main', { cookie: b, body: { patch: { estados: { m1: 'pendiente' }, tareasConfig: g.j.valor.tareasConfig }, version: g.j.version } });
    eq(p.status, 200, 'Beto PATCH estados (+ config idéntica) → 200');
    eq((await pedir('PATCH', '/api/datos/main', { cookie: b, body: { patch: { mes: 3 }, version: g.j.version } })).status, 409, 'versión vieja → 409');
    const cf = await pedir('PATCH', '/api/datos/main', { cookie: b, body: { patch: { tareasConfig: { m1: { bloqueada: true } } }, version: p.j.version } });
    eq(cf.status, 403, 'Beto cambia tareasConfig sin permiso → 403');
    const hu = await pedir('PATCH', '/api/datos/main', { cookie: await completa('Hugo'), body: { patch: { supervisores: { m1: 'Hugo' } }, version: p.j.version } });
    eq(hu.status, 403, 'Hugo (rol admin solo en usuarios) cambia supervisores → 403');
    const ines = await pedir('PATCH', '/api/datos/main', { cookie: await completa('Ines'), body: { patch: { tareasConfig: { m1: { bloqueada: true } } }, version: p.j.version } });
    eq(ines.status, 200, 'Ines (Config = editar) cambia tareasConfig → 200');
    eq((await pedir('PATCH', '/api/datos/main', { cookie: b, body: { patch: { usuarios: [] }, version: ines.j.version } })).status, 400, 'patch de usuarios → 400');
    // Espejo: quitar a Zoe del padrón y guardar Tareas; el trigger anti-encogimiento no debe bloquear.
    const ana = await completa('Ana');
    const gu = await pedir('GET', '/api/datos/usuarios', { cookie: ana });
    eq((await pedir('PUT', '/api/datos/usuarios', { cookie: ana, body: { valor: gu.j.usuarios.filter((x) => x.nombre !== 'Lalo'), version: gu.j.version } })).status, 200, 'admin quita a Lalo del padrón');
    const pa = await pedir('PATCH', '/api/datos/main', { cookie: ana, body: { patch: { tareasOverrides: { m1: { diaLimiteSem: 2 } } }, version: ines.j.version } });
    const m = filaDB('main');
    ok(pa.status === 200 && m.usuarios.length === usuarios.length && !m.pinsPersonalizados && m.tareasOverrides.m1.diaLimiteSem === 2,
      'PATCH main pasa el trigger guard_main_no_user_shrink (espejo conserva a Lalo) y sin pinsPersonalizados');
    fijarFila('usuarios', usuarios);
  }

  titulo('(b) Sesión: cierre del navegador, inactividad, huella de credencial, filas dañadas, corte:');
  {
    const A = require(path.join(RAIZ, 'api/_auth.js'));
    const decod = (ck) => A.verificarSesion(decodeURIComponent(ck.split('=').slice(1).join('=')));
    const firmar = (p) => {
      const b64 = (x) => Buffer.from(x).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      const body = b64(JSON.stringify(p));
      return 'mediterra_sess=' + encodeURIComponent(body + '.' + b64(crypto.createHmac('sha256', process.env.SESSION_SECRET).update(body).digest()));
    };
    const roster = (ck) => pedir('GET', '/api/datos/roster', { cookie: ck });
    const pinsAntes = filaDB('pins'), mainAntes = filaDB('main');
    E.psql(`delete from frisku_sp_ratelimit`);
    const r = await login(em('Zoe'), PIN.Zoe);
    ok(r.status === 200 && r.cookie && !/max-age/i.test(r.setCookie), 'cookie "completa" SIN Max-Age (cerrar el navegador la descarta)');
    const p0 = decod(r.cookie);
    eq((await roster(firmar({ ...p0, act: Date.now() - 31 * 60000 }))).status, 401, '31 min sin uso → 401 (inactividad controlada en el servidor)');
    const { fp, ...sinFp } = p0;
    eq((await roster(firmar(sinFp))).status, 401, 'cookie sin huella (emitida antes de este cambio) → 401');
    const ren = await roster(firmar({ ...p0, act: Date.now() - 5 * 60000 }));
    ok(ren.status === 200 && /mediterra_sess=/.test(ren.setCookie) && decod(ren.cookie).exp === p0.exp, 'uso tras 5 min → renueva el último uso sin alargar el vencimiento de 12 h');
    const otra = (await login(em('Zoe'), PIN.Zoe)).cookie;
    const c = await pedir('POST', '/api/auth/cambiar-pin', { cookie: r.cookie, body: { pinActual: PIN.Zoe, pinNuevo: '318642' } });
    eq(c.status, 200, 'Zoe cambia su PIN');
    eq((await roster(otra)).status, 401, 'cambiar el PIN cierra las DEMÁS sesiones de esa persona');
    eq((await roster(c.cookie)).status, 200, '…y la sesión que lo cambió sigue');
    await pedir('POST', '/api/auth/recuperar', { body: { email: em('Zoe') } });
    eq((await roster(c.cookie)).status, 200, 'pedir un código (público) NO cierra la sesión de nadie');
    const ana = await completa('Ana');
    const rita = await completa('Rita');
    eq((await roster(rita)).status, 200, 'Rita con sesión');
    eq((await pedir('POST', '/api/auth/admin-reset-pin', { cookie: ana, body: { nombre: 'Rita' } })).status, 200, 'Ana resetea a Rita');
    eq((await roster(rita)).status, 401, 'el reseteo del administrador expulsa a Rita en la siguiente petición');
    // Tiempo de recuperar: igual exista o no el correo.
    const t = async (email) => { const a = Date.now(); await pedir('POST', '/api/auth/recuperar', { body: { email } }); return Date.now() - a; };
    const tNo = await t('nadie@prueba.test'), tSi = await t(em('Beto'));
    ok(tNo >= 2900 && tSi >= 2900 && Math.abs(tNo - tSi) < 500, `recuperar responde en ≥ 3 s exista o no el correo (${tNo} ms vs ${tSi} ms)`);
    fijarFila('pins', pinsAntes);
    // Fila dañada: nunca se trata como vacía.
    E.psql(`update calendario_data set value = to_jsonb('{no-es-json'::text), updated_at = now() where id = 'pins'`);
    await pedir('POST', '/api/auth/recuperar', { body: { email: em('Beto') } });
    eq(filaDB('pins'), '{no-es-json', 'pins ilegible + recuperar (público) → NO se sobrescribe (no se borran los PIN)');
    eq((await login(em('Beto'), PIN.Beto)).status, 503, 'pins ilegible → login 503');
    fijarFila('pins', pinsAntes);
    const beto = await completa('Beto');
    const gm = await pedir('GET', '/api/datos/main', { cookie: beto });
    // (los triggers de main impedirían dañarla: se simula con ellos desactivados en esta sesión)
    E.psql(`set session_replication_role = replica; update calendario_data set value = to_jsonb('{roto'::text) where id = 'main'`);
    const pm = await pedir('PATCH', '/api/datos/main', { cookie: beto, body: { patch: { estados: {} }, version: gm.j.version } });
    ok(pm.status === 503 || pm.status === 409, `main ilegible → PATCH rechazado (${pm.status})`);
    eq(filaDB('main'), '{roto', '…y main NO se sobrescribe (no se borran las Tareas)');
    E.psql(`set session_replication_role = replica; update calendario_data set value='${JSON.stringify(mainAntes).replace(/'/g, "''")}'::jsonb, updated_at=now() where id='main'`);
    // Corte de credenciales (AUTH_CREDENCIALES_DESDE).
    E.psql(`delete from frisku_sp_ratelimit`);
    process.env.AUTH_CREDENCIALES_DESDE = new Date().toISOString();
    const lc = await login(em('Beto'), PIN.Beto);
    eq([lc.status, lc.j && lc.j.error, lc.cookie], [401, 'debe_recuperar', null], 'con corte: PIN anterior (aunque sea correcto) → 401 debe_recuperar, sin cookie');
    eq((await login(em('Beto'), '000000')).j.error, 'credenciales', 'con corte y PIN incorrecto → credenciales (no revela nada)');
    eq((await pedir('POST', '/api/auth/cambiar-pin', { cookie: beto, body: { pinActual: PIN.Beto, pinNuevo: '318642' } })).status, 401, 'con corte: la sesión emitida antes sigue, pero el PIN viejo no sirve para fijar uno nuevo');
    await pedir('POST', '/api/auth/recuperar', { body: { email: em('Beto') } });
    const cod = codigoDe(em('Beto'));
    const lt = await login(em('Beto'), cod);
    const cp = await pedir('POST', '/api/auth/cambiar-pin', { cookie: lt.cookie, body: { pinNuevo: '318642' } });
    const ln = await login(em('Beto'), '318642');
    eq([lt.j && lt.j.motivo, cp.status, ln.j && ln.j.debeCambiarPin], ['temp', 200, false], 'con corte: recupera por correo → crea PIN → entra normal');
    process.env.AUTH_CREDENCIALES_DESDE = 'no-es-fecha';
    eq((await login(em('Beto'), '318642')).status, 503, 'corte mal configurado → 503 (falla cerrado)');
    delete process.env.AUTH_CREDENCIALES_DESDE;
    fijarFila('pins', pinsAntes);
    E.psql(`delete from frisku_sp_ratelimit`);
  }

  titulo('(b) Sesión reproducida SIN falsificar (copias reales de cookies, tiempo real):');
  {
    // Lo que hace un navegador que restaura la sesión (o un tercero con una copia de la
    // cookie) es reenviar la misma cookie: aquí se reenvían copias reales, sin firmar nada.
    const roster = (ck) => pedir('GET', '/api/datos/roster', { cookie: ck });
    const pinsAntes = filaDB('pins');
    E.psql(`delete from frisku_sp_ratelimit`);
    process.env.AUTH_INACTIVIDAD_MIN = '2';
    const espera = (ms) => new Promise((r) => setTimeout(r, ms));
    // Cambio de PIN: la copia vieja deja de servir.
    const copiaA = (await login(em('Zoe'), PIN.Zoe)).cookie;
    const sesB = (await login(em('Zoe'), PIN.Zoe)).cookie;
    eq((await roster(copiaA)).status, 200, 'copia A de la sesión de Zoe sirve');
    const cb = await pedir('POST', '/api/auth/cambiar-pin', { cookie: sesB, body: { pinActual: PIN.Zoe, pinNuevo: '318642' } });
    eq(cb.status, 200, 'Zoe cambia el PIN desde la sesión B');
    eq((await roster(copiaA)).status, 401, 'copia A reproducida tras el cambio de PIN → 401');
    eq((await roster(sesB)).status, 401, 'la cookie ANTERIOR de la propia sesión B reproducida → 401 (solo vale la nueva)');
    eq((await roster(cb.cookie)).status, 200, 'la cookie nueva de B sirve');
    fijarFila('pins', pinsAntes);
    // "Salir" (D3): revoca en el servidor todas las sesiones de la persona, copias incluidas.
    const copiaL = (await login(em('Beto'), PIN.Beto)).cookie;
    const otraL = (await login(em('Beto'), PIN.Beto)).cookie;
    const lo = await pedir('POST', '/api/auth/logout', { cookie: copiaL, body: { revocar: true } });
    ok(lo.status === 200 && lo.j && lo.j.revocado === true && /max-age=0/i.test(lo.setCookie), '"Salir" responde revocado:true y borra la cookie del navegador');
    eq([(await roster(copiaL)).status, (await roster(otraL)).status], [401, 401], 'una copia hecha antes de "Salir" y la otra sesión de Beto → 401 (prueba entre dos instancias: prueba-revocacion.mjs)');
    fijarFila('pins', pinsAntes);
    // Inactividad real (AUTH_INACTIVIDAD_MIN=2 en esta prueba): sin firmar nada, esperando.
    const quieta = (await login(em('Rita'), PIN.Rita)).cookie;
    const activa0 = (await login(em('Ines'), PIN.Ines)).cookie;
    await espera(70 * 1000);
    const uso = await roster(activa0);
    ok(uso.status === 200 && uso.cookie, 'a los 70 s, usar la sesión de Ines la renueva (cookie nueva con el último uso)');
    const activa1 = uso.cookie;
    await espera(55 * 1000);
    eq((await roster(quieta)).status, 401, '125 s sin uso (límite 2 min) → la sesión de Rita se rechaza');
    eq((await roster(activa0)).status, 401, 'la copia ANTERIOR a la renovación de Ines (último uso hace 125 s) → 401');
    eq((await roster(activa1)).status, 200, 'la cookie renovada de Ines (último uso hace 55 s) sigue valiendo');
    delete process.env.AUTH_INACTIVIDAD_MIN;
    E.psql(`delete from frisku_sp_ratelimit`);
  }

  titulo('(b) verificar (servidor a servidor):');
  {
    const v = (h, body) => pedir('POST', '/api/auth/verificar', { headers: h, body });
    eq((await v({}, { email: em('Beto'), pin: PIN.Beto })).status, 401, 'sin secreto → 401');
    eq((await v({ 'x-mediterra-secreto': 'otro' }, { email: em('Beto'), pin: PIN.Beto })).status, 401, 'secreto incorrecto → 401');
    const S = { 'x-mediterra-secreto': E.secretoVerificar };
    eq((await v(S, { email: em('Beto'), pin: PIN.Beto })).j, { ok: true, email: em('Beto'), nombre: 'Beto', debeCambiarPin: false }, 'con secreto y PIN correcto → 200');
    eq((await v(S, { email: em('Ines'), pin: '000000' })).status, 401, 'PIN incorrecto → 401');
    eq((await v(S, { email: em('Caro'), pin: PIN.Caro })).status, 401, 'desactivado → 401');
    eq((await v(S, { email: em('Gabi'), pin: '1357' })).status, 401, 'PIN plano → 401');
    const pinsAhora = filaDB('pins'); pinsAhora.Tomas_temp = '640299'; fijarFila('pins', pinsAhora);
    eq((await v(S, { email: em('Tomas'), pin: '640299' })).status, 401, '_temp plano SIN _temp_exp → 401 (no es una puerta permanente)');
    pinsAhora.Tomas_temp_exp = Date.now() + 3600000; fijarFila('pins', pinsAhora);
    eq((await v(S, { email: em('Tomas'), pin: '640299' })).j.debeCambiarPin, true, '_temp plano con _temp_exp vigente → 200 pero debeCambiarPin:true');
    delete pinsAhora.Tomas_temp; delete pinsAhora.Tomas_temp_exp; fijarFila('pins', pinsAhora);
  }

  titulo('(b) Edge Function osiris-auth (lógica real bajo Node con un shim de Deno):');
  await probarOsiris();

  // ═══════════════════════ (c) FASES ═══════════════════════
  async function appSigue(etiqueta) {
    const b = await completa('Beto');
    const g = await pedir('GET', '/api/datos/main', { cookie: b });
    const p = await pedir('PATCH', '/api/datos/main', { cookie: b, body: { patch: { comentarios: { [etiqueta]: 'ok' } }, version: g.j && g.j.version } });
    const ana = await completa('Ana');
    const gu = await pedir('GET', '/api/datos/usuarios', { cookie: ana });
    const pu = await pedir('PUT', '/api/datos/usuarios', { cookie: ana, body: { valor: gu.j.usuarios.map((x) => x.nombre === 'Ines' ? { ...x, cargo: etiqueta } : x), version: gu.j.version } });
    const rs = await pedir('POST', '/api/auth/admin-reset-pin', { cookie: ana, body: { nombre: 'Lalo' } });
    const l = await login(em('Lalo'), rs.j && rs.j.codigo);
    const nuevo = { 'Fase A': '518274', 'Fase B': '518275', 'Fase C': '518276' }[etiqueta];
    const c = await pedir('POST', '/api/auth/cambiar-pin', { cookie: l.cookie, body: { pinNuevo: nuevo } });
    const s = await pedir('GET', '/api/auth/sesion', { cookie: c.cookie });
    eq([!!b, g.status, p.status, gu.status, pu.status, rs.status, l.j && l.j.motivo, c.status, s.status], [true, 200, 200, 200, 200, 200, 'temp', 200, 200],
      `${etiqueta}: la app sigue (login, GET/PATCH main, GET/PUT usuarios, admin-reset, cambiar-pin, sesion)`);
  }
  async function anon(etiqueta, esperado) {
    const lee = async (id) => { const r = await rest('GET', `calendario_data?id=eq.${id}&select=id`); return r.status === 200 && r.j.length === 1; };
    const escribe = async (id) => { const v = filaDB(id); const r = await rest('PATCH', `calendario_data?id=eq.${id}`, { body: { value: v }, prefer: 'return=representation' }); return r.status === 200 && r.j.length === 1; };
    const upsert = async (id) => { const v = filaDB(id); const r = await rest('POST', 'calendario_data', { body: { id, value: v }, prefer: 'resolution=merge-duplicates,return=representation' }); return r.status >= 200 && r.status < 300; };
    const borraMain = async () => { const r = await rest('DELETE', 'calendario_data?id=eq.main', { prefer: 'return=representation' }); return r.status === 200 && r.j.length === 1; };
    const obtenido = { leePins: await lee('pins'), leeUsuarios: await lee('usuarios'), leeMain: await lee('main'),
      escribePins: await escribe('pins'), upsertPins: await upsert('pins'), escribeUsuarios: await escribe('usuarios'), escribeMain: await escribe('main') };
    if (!esperado.borraMain) obtenido.borraMain = await borraMain();   // solo se intenta cuando debe fallar
    else obtenido.borraMain = true;
    eq(obtenido, esperado, `${etiqueta}: anon ${JSON.stringify(esperado)}`);
    ok(filaDB('main') && filaDB('pins') && filaDB('usuarios'), `${etiqueta}: main/pins/usuarios siguen existiendo`);
  }
  titulo('(c) Fases aplicadas tal cual, en orden:');
  await anon('HOY', { leePins: true, leeUsuarios: true, leeMain: true, escribePins: true, upsertPins: true, escribeUsuarios: true, escribeMain: true, borraMain: true });
  for (const [archivo, est, esperado] of [
    ['faseA_bloquear_escritura.sql', 'A', { leePins: true, leeUsuarios: true, leeMain: true, escribePins: false, upsertPins: false, escribeUsuarios: false, escribeMain: true, borraMain: false }],
    ['faseB_bloquear_lectura.sql', 'B', { leePins: false, leeUsuarios: false, leeMain: true, escribePins: false, upsertPins: false, escribeUsuarios: false, escribeMain: true, borraMain: false }],
    ['faseC_cerrar_main.sql', 'C', { leePins: false, leeUsuarios: false, leeMain: false, escribePins: false, upsertPins: false, escribeUsuarios: false, escribeMain: false, borraMain: false }],
  ]) {
    const r = await E.aplicar(archivo);
    ok(r.ok, `${archivo} aplicada tal cual`);
    const v = verificacion();
    eq([v.estado, v.revisar], [est, []], `verificacion.sql → estado ${est}, todo coincide`);
    eq(Number(E.psql(`select count(*) from information_schema.role_table_grants where table_name='calendario_data' and grantee in ('anon','authenticated') and privilege_type in ('TRUNCATE','REFERENCES','TRIGGER')`)), 0, `${est}: anon/authenticated sin TRUNCATE/REFERENCES/TRIGGER`);
    await anon(`Fase ${est}`, esperado);
    await appSigue(`Fase ${est}`);
    const again = await E.aplicar(archivo);
    ok(again.ok && /no corresponde/.test(again.salida), `${archivo} re-ejecutada → no hace nada`);
  }
  { const r = await E.aplicar('faseA_bloquear_escritura.sql'); ok(r.ok && /no corresponde/.test(r.salida), 'fase A sobre estado C → no hace nada (no retrocede)'); }

  // ═══════════════════════ (d) RECUPERAR ACCESO CON FASE C ═══════════════════════
  titulo('(d) Recuperar acceso con la fase C aplicada:');
  {
    await pedir('POST', '/api/auth/recuperar', { body: { email: em('Ines') } });
    const cod = codigoDe(em('Ines'));
    const l = await login(em('Ines'), cod);
    const c = await pedir('POST', '/api/auth/cambiar-pin', { cookie: l.cookie, body: { pinNuevo: '629384' } });
    eq([l.j.motivo, c.status, (await login(em('Ines'), '629384')).j.debeCambiarPin], ['temp', 200, false], '"¿Olvidaste tu PIN?" → correo → código → PIN nuevo → entra');
    const ana = await completa('Ana');
    const rs = await pedir('POST', '/api/auth/admin-reset-pin', { cookie: ana, body: { nombre: 'Rita' } });
    E.psql(`delete from frisku_sp_ratelimit`); // Rita quedó bloqueada en (b); en producción el bloqueo expira solo (15 min)
    const lr = await login(em('Rita'), rs.j.codigo);
    eq([rs.status, lr.j.motivo, (await pedir('POST', '/api/auth/cambiar-pin', { cookie: lr.cookie, body: { pinNuevo: '629385' } })).status], [200, 'temp', 200], 'reseteo por admin (seg_administradores) → entra y crea PIN');
    // Último recurso (nadie puede entrar, sin correo): SQL Editor con rol postgres.
    // (exactamente el bloque del documento: código + vencimiento en 2 horas)
    E.psql(`update calendario_data set value = value || jsonb_build_object('Ana_temp', '583920', 'Ana_temp_exp', (extract(epoch from now() + interval '2 hours') * 1000)::bigint), updated_at = now() where id = 'pins' and jsonb_typeof(value) = 'object'`);
    const la = await login(em('Ana'), '583920');
    const ca = await pedir('POST', '/api/auth/cambiar-pin', { cookie: la.cookie, body: { pinNuevo: '629386' } });
    eq([la.j.motivo, ca.status], ['temp', 200], 'SQL Editor: código provisorio en texto plano → entra solo a cambio obligatorio');
    ok(!JSON.stringify(filaDB('pins')).includes('583920') && !('Ana_temp_exp' in filaDB('pins')), '…y al cambiar el PIN el código plano y su vencimiento desaparecen');
    E.psql(`insert into seg_administradores (email, motivo, otorgado_por) values ('ines@prueba.test','respaldo','SQL Editor')`);
    eq((await pedir('POST', '/api/auth/admin-reset-pin', { cookie: await completa('Ines', '629384'), body: { nombre: 'Tomas' } })).status, 200, 'SQL Editor: dar admin a otra persona → puede resetear');
  }

  // ═══════════════════════ (e) REVERSIÓN ═══════════════════════
  titulo('(e) reversion.sql:');
  {
    const r = await E.aplicar('reversion.sql');
    ok(r.ok, 'reversion.sql aplicada tal cual (C → B → A → HOY)');
    eq(fotoPoliticas(), FOTO_HOY, 'políticas y privilegios EXACTAMENTE como hoy');
    eq(verificacion().estado, 'HOY', 'verificacion.sql → HOY');
    const r2 = await E.aplicar('reversion.sql');
    ok(r2.ok && fotoPoliticas() === FOTO_HOY, 'reversion.sql re-ejecutada desde HOY → no cambia nada');
    await anon('Revertido', { leePins: true, leeUsuarios: true, leeMain: true, escribePins: true, upsertPins: true, escribeUsuarios: true, escribeMain: true, borraMain: true });
    // Estado desconocido → reversión aborta sin tocar nada.
    E.psql(`alter policy cd_anon_auth_select on calendario_data using (true)`);
    const foto = fotoPoliticas();
    const r3 = await E.aplicar('reversion.sql');
    ok(!r3.ok && fotoPoliticas() === foto, 'políticas cambiadas a mano (DESCONOCIDO) → reversion.sql ABORTA sin tocar nada');
    const r4 = await E.aplicar('faseA_bloquear_escritura.sql');
    ok(!r4.ok && fotoPoliticas() === foto, '… y fase A también ABORTA');
  }
} catch (e) {
  fail++; console.log('  ✗ excepción: ' + (e && e.stack || e));
} finally {
  await E.cerrar();
}

async function probarOsiris() {
  // Sandbox simulado: user_osiris_accounts + generate_link + verify. Registra todo lo que se pide.
  const http = await import('http');
  const pedidos = [];
  const sb = http.createServer((req, res) => {
    pedidos.push(req.url);
    let t = ''; req.on('data', (c) => (t += c)); req.on('end', () => {
      res.setHeader('Content-Type', 'application/json');
      if (req.url.startsWith('/rest/v1/user_osiris_accounts')) return res.end(JSON.stringify([{ rol_osiris: 'gerente', activo: true }]));
      if (req.url === '/auth/v1/admin/generate_link') return res.end(JSON.stringify({ properties: { hashed_token: 'h' } }));
      if (req.url === '/auth/v1/verify') return res.end(JSON.stringify({ access_token: 'at', refresh_token: 'rt', expires_at: 1, expires_in: 3600 }));
      res.statusCode = 404; res.end('{}');
    });
  });
  await new Promise((r) => sb.listen(0, '127.0.0.1', r));
  const ENV = { SUPABASE_URL: `http://127.0.0.1:${sb.address().port}`, SUPABASE_ANON_KEY: 'a', SUPABASE_SERVICE_ROLE_KEY: 's',
    PROD_APP_URL: E.url, OSIRIS_VERIFICAR_SECRETO: E.secretoVerificar, ALLOWED_ORIGINS: 'http://localhost' };
  let handler = null;
  globalThis.Deno = { env: { get: (k) => ENV[k] }, serve: (h) => { handler = h; } };
  try {
    await import(pathToFileURL(path.join(RAIZ, 'supabase/functions/osiris-auth/index.ts')).href + '?t=' + Date.now());
  } catch (e) {
    ok(false, 'osiris-auth: no se pudo cargar index.ts con --experimental-strip-types (' + String(e && e.message).slice(0, 120) + ')');
    sb.close(); return;
  }
  const llamar = (body) => handler(new Request('http://edge/osiris-auth', { method: 'POST', headers: { 'Content-Type': 'application/json', origin: 'http://localhost' }, body: JSON.stringify(body) }));
  const r1 = await llamar({ email: em('Beto'), pin: PIN.Beto });
  const j1 = await r1.json();
  eq([r1.status, j1.access_token, j1.user && j1.user.email], [200, 'at', em('Beto')], 'osiris-auth: PIN correcto → valida en /api/auth/verificar y emite sesión');
  eq((await llamar({ email: em('Beto'), pin: '000000' })).status, 401, 'osiris-auth: PIN incorrecto → 401');
  eq((await llamar({ email: em('Gabi'), pin: '1357' })).status, 401, 'osiris-auth: PIN plano heredado → 401');
  const pinsAhora = filaDB('pins'); pinsAhora.Hugo_temp = '640300'; fijarFila('pins', pinsAhora);
  eq((await llamar({ email: em('Hugo'), pin: '640300' })).status, 401, 'osiris-auth: _temp en texto plano → 401 (debe cambiar PIN primero)');
  delete pinsAhora.Hugo_temp; fijarFila('pins', pinsAhora);
  ok(!pedidos.some((u) => u.includes('calendario_data')), 'osiris-auth: no lee filas de calendario_data');
  // Segunda instancia con otro secreto (el cargador de TS no re-evalúa el mismo archivo con otra query).
  ENV.OSIRIS_VERIFICAR_SECRETO = 'otro';
  const fsm = await import('fs'); const osm = await import('os');
  const copia = path.join(fsm.mkdtempSync(path.join(osm.tmpdir(), 'osiris-')), 'index.ts');
  fsm.copyFileSync(path.join(RAIZ, 'supabase/functions/osiris-auth/index.ts'), copia);
  await import(pathToFileURL(copia).href);
  eq((await llamar({ email: em('Beto'), pin: PIN.Beto })).status, 401, 'osiris-auth con secreto incorrecto → 401 (producción rechaza)');
  sb.close();
}

console.log(`\nprueba-servidor: ${pass} pass / ${fail} fail`);
process.exit(fail ? 1 : 0);
