/* ─────────────────────────────────────────────────────────────────────────
   "Salir" revoca TODAS las sesiones de la persona, en el servidor, entre DOS
   instancias independientes (dos procesos) que comparten la base local.
   Se reenvían copias reales de cookies; nada se falsifica. Datos de prueba.
   Uso: POSTGREST_BIN=/ruta/postgrest node scripts/seguridad-main-pins/prueba-revocacion.mjs
   ───────────────────────────────────────────────────────────────────────── */
import path from 'path';
import net from 'net';
import { spawn } from 'child_process';
import { createRequire } from 'module';
import { levantarEntorno, RAIZ } from './entorno.mjs';

const require = createRequire(import.meta.url);
const R = require(path.join(RAIZ, 'api/_reglasLogin.js'));
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), `${m}${JSON.stringify(a) === JSON.stringify(b) ? '' : ` (esperado ${JSON.stringify(b)}, obtenido ${JSON.stringify(a)})`}`);
const hoy = new Date().toISOString().slice(0, 10);
const cred = (pin) => { const c = R.hashPin(pin); c.pol = '6dig'; c.fecha = hoy; return JSON.stringify(c); };
const em = (n) => `${n.toLowerCase()}@prueba.test`;
const U = (nombre) => ({ nombre, email: em(nombre), cargo: 'Prueba', rol: 'editor', modulos: ['tareas'], tab_permisos: {} });
const PIN = { Ana: '482916', Beto: '579135' };
const puertoLibre = () => new Promise((r) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });

const E = await levantarEntorno({ sembrar: { usuarios: [U('Ana'), U('Beto')], pins: { Ana_h: cred(PIN.Ana), Beto_h: cred(PIN.Beto) }, main: { estados: {} }, admins: ['beto@prueba.test'] }, env: { AUTH_RL_ID_MAX: '1000' } });   // límite alto: aquí se prueba la revocación, no el contador
const hijos = [];
async function instancia(extraEnv = {}) {
  const puerto = await puertoLibre();
  const env = { ...process.env, PUERTO: String(puerto), ...extraEnv };
  const p = spawn(process.execPath, [path.join(RAIZ, 'scripts/seguridad-main-pins/instancia.mjs')], { env, stdio: ['ignore', 'pipe', 'inherit'] });
  hijos.push(p);
  await new Promise((r, m) => { p.stdout.on('data', (d) => { if (/LISTA/.test(d)) r(); }); p.on('exit', (c) => m(new Error('instancia salió ' + c))); });
  return `http://127.0.0.1:${puerto}`;
}
async function pedir(base, metodo, ruta, { body, cookie, tipo = 'application/json' } = {}) {
  const h = {}; if (body !== undefined) h['Content-Type'] = tipo; if (cookie) h.Cookie = cookie;
  const r = await fetch(base + ruta, { method: metodo, headers: h, body: body !== undefined ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined });
  let j = null; try { j = JSON.parse(await r.text()); } catch (e) {}
  const sc = r.headers.get('set-cookie') || '';
  return { status: r.status, j, cookie: sc ? sc.split(';')[0] : null, setCookie: sc };
}
const login = async (base, n) => (await pedir(base, 'POST', '/api/auth/login', { body: { email: em(n), pin: PIN[n] } })).cookie;
const usa = async (base, ck) => (await pedir(base, 'GET', '/api/datos/roster', { cookie: ck })).status;
const epoca = (n) => Number(E.psql(`select coalesce(value->>'${n}_epoca','0') from calendario_data where id='pins'`));

try {
  const I1 = E.url, I2 = await instancia();   // I1 = proceso de la prueba; I2 = OTRO proceso
  console.log('Dos instancias independientes, misma base:');
  const a1 = await login(I1, 'Ana'), a2 = await login(I2, 'Ana'), b1 = await login(I1, 'Beto');
  const copiaA1 = a1;   // copia real de la cookie (lo que tendría un tercero)
  eq([await usa(I1, a1), await usa(I2, a1), await usa(I1, a2), await usa(I2, a2)], [200, 200, 200, 200], 'cada sesión de Ana sirve en ambas instancias');

  console.log('"Salir" en la instancia 2:');
  const e0 = epoca('Ana');
  const lo = await pedir(I2, 'POST', '/api/auth/logout', { cookie: a2, body: { revocar: true } });
  eq([lo.status, lo.j && lo.j.revocado, /max-age=0/i.test(lo.setCookie)], [200, true, true], 'responde revocado:true y borra la cookie');
  eq(epoca('Ana'), e0 + 1, 'la época de Ana subió en la base (revocación persistida, no en memoria)');
  eq([await usa(I1, copiaA1), await usa(I2, copiaA1)], [401, 401], 'la COPIA de la otra sesión de Ana → 401 en ambas instancias');
  eq([await usa(I1, a2), await usa(I2, a2)], [401, 401], 'la cookie de la sesión que salió, reenviada → 401 en ambas');
  eq(await usa(I2, b1), 200, 'la sesión de Beto (otra persona) no se toca');
  const a3 = await login(I1, 'Ana');
  eq([await usa(I1, a3), await usa(I2, a3)], [200, 200], 'Ana vuelve a entrar con su PIN y la sesión nueva sirve en ambas');

  console.log('Casos borde:');
  const st = await pedir(I1, 'POST', '/api/auth/logout', { cookie: copiaA1, body: { revocar: true } });
  eq([st.status, st.j && st.j.revocado, await usa(I2, a3)], [200, false, 200], 'una copia ya inválida NO puede cerrar la sesión nueva (revocado:false)');
  const a4 = await login(I2, 'Ana');
  const inact = await pedir(I2, 'POST', '/api/auth/logout', { cookie: a4, body: { revocar: false } });
  eq([inact.j && inact.j.revocado, /max-age=0/i.test(inact.setCookie), await usa(I1, a3)], [false, true, 200], 'cierre por inactividad (revocar:false): borra la cookie local, no cierra otras sesiones');
  const sinJson = await pedir(I1, 'POST', '/api/auth/logout', { cookie: a3, body: 'x', tipo: 'text/plain' });
  eq([sinJson.j && sinJson.j.revocado, await usa(I1, a3)], [false, 200], 'logout sin JSON (posible petición de otro sitio) → no revoca');
  const sinCookie = await pedir(I2, 'POST', '/api/auth/logout', { body: {} });
  eq([sinCookie.status, sinCookie.j && sinCookie.j.revocado, sinCookie.j && sinCookie.j.motivo], [200, false, 'sin_sesion'], 'logout sin sesión → 200 revocado:false motivo sin_sesion (la app avisa)');
  eq(st.j && st.j.motivo, 'ya_invalida', 'copia ya inválida → motivo ya_invalida (la app avisa)');

  console.log('Concurrencia (dos "Salir" simultáneos en instancias distintas):');
  const c1 = await login(I1, 'Ana'), c2 = await login(I2, 'Ana'), c3 = await login(I1, 'Ana');
  const e1 = epoca('Ana');
  const [r1, r2] = await Promise.all([
    pedir(I1, 'POST', '/api/auth/logout', { cookie: c1, body: { revocar: true } }),
    pedir(I2, 'POST', '/api/auth/logout', { cookie: c2, body: { revocar: true } }),
  ]);
  ok(r1.status === 200 && r2.status === 200 && (r1.j.revocado || r2.j.revocado), `ambos responden 200; al menos uno revoca (${r1.j.revocado}/${r2.j.revocado})`);
  ok(epoca('Ana') >= e1 + 1, 'la época subió (la escritura condicionada no pierde la revocación)');
  eq([await usa(I1, c3), await usa(I2, c3), await usa(I1, c1), await usa(I2, c2)], [401, 401, 401, 401], 'todas las sesiones previas de Ana → 401');

  console.log('Carreras sobre la fila pins (escritura condicionada):');
  for (let i = 0; i < 6; i++) {
    // "Salir" vs cambio de PIN de OTRA sesión de la misma persona: exactamente uno gana.
    const s1 = await login(I1, 'Ana'), s2 = await login(I2, 'Ana');
    const nuevo = ['618273', '739182'][i % 2];
    const [lo2, cp] = await Promise.all([
      pedir(I1, 'POST', '/api/auth/logout', { cookie: s1, body: { revocar: true } }),
      pedir(I2, 'POST', '/api/auth/cambiar-pin', { cookie: s2, body: { pinActual: PIN.Ana, pinNuevo: nuevo } }),
    ]);
    const ganoSalir = lo2.j && lo2.j.revocado === true, ganoCambio = cp.status === 200;
    ok(ganoSalir !== ganoCambio, `ronda ${i + 1}: "Salir" vs cambio de PIN → gana exactamente uno (salir=${ganoSalir}, cambio=${cp.status})`);
    if (ganoCambio) {
      PIN.Ana = nuevo;
      eq([await usa(I1, cp.cookie), await usa(I2, s1)], [200, 401], `ronda ${i + 1}: el PIN nuevo quedó y la otra sesión cayó`);
    }
  }
  for (let i = 0; i < 4; i++) {
    // "Salir" de Ana vs reseteo de Ana por el admin Beto: no se pierde ni el código ni la época.
    const sA = await login(I1, 'Ana');
    const bAdm = await login(I2, 'Beto');
    const e2 = epoca('Ana');
    const [lo3, rs] = await Promise.all([
      pedir(I1, 'POST', '/api/auth/logout', { cookie: sA, body: { revocar: true } }),
      pedir(I2, 'POST', '/api/auth/admin-reset-pin', { cookie: bAdm, body: { nombre: 'Ana' } }),
    ]);
    const tieneTemp = E.psql(`select (value ? 'Ana_temp')::text from calendario_data where id='pins'`) === 'true';
    const esperado = e2 + 1 + (lo3.j && lo3.j.revocado ? 1 : 0);
    ok(rs.status === 200 && tieneTemp && epoca('Ana') === esperado,
      `ronda ${i + 1}: reseteo y "Salir" simultáneos → el código provisorio sigue y la época = ${esperado} (obtenido ${epoca('Ana')})`);
    // Volver a un PIN conocido para la siguiente ronda (como haría Ana con el código).
    const cod = rs.j && rs.j.codigo;
    const lt = await pedir(I1, 'POST', '/api/auth/login', { body: { email: em('Ana'), pin: cod } });
    const nuevo = ['528391', '639402', '741503', '852614'][i];
    await pedir(I1, 'POST', '/api/auth/cambiar-pin', { cookie: lt.cookie, body: { pinNuevo: nuevo } });
    PIN.Ana = nuevo;
  }
  E.psql(`delete from frisku_sp_ratelimit`);

  console.log('Base no disponible:');
  const I3 = await instancia({ SUPABASE_URL: 'http://127.0.0.1:9' });
  const d1 = await login(I1, 'Ana');
  const caida = await pedir(I3, 'POST', '/api/auth/logout', { cookie: d1, body: { revocar: true } });
  eq([caida.status, caida.j && caida.j.revocado, /max-age=0/i.test(caida.setCookie)], [503, false, true], 'sin base: 503 revocado:false (no informa éxito) y borra la cookie local');
  eq(await usa(I1, d1), 200, '…y la sesión sigue vigente en el servidor (el cliente puede saber que no se revocó)');
} catch (e) {
  fail++; console.log('  ✗ excepción: ' + (e && e.stack || e));
} finally {
  for (const h of hijos) { try { h.kill(); } catch (e) {} }
  await E.cerrar();
}
console.log(`\nprueba-revocacion: ${pass} pass / ${fail} fail`);
process.exit(fail ? 1 : 0);
