/* ─────────────────────────────────────────────────────────────────────────
   ¿Este despliegue (o este commit) tiene el correo protegido? (oct-2026)

     node scripts/seguridad/verificar-correo-protegido.mjs --url https://<despliegue>.vercel.app
     node scripts/seguridad/verificar-correo-protegido.mjs --commit <sha>

   NUNCA envía un correo, ni contra la versión insegura: ninguna sonda lleva destinatario ni asunto,
   y la versión antigua exige los dos antes de llamar al SMTP («to y subject son obligatorios»).
   Sondas, todas sin efecto:
     1. OPTIONS desde un origen ajeno     → protegido: 403 sin Allow-Origin · inseguro: 200 con «*»
     2. POST {} desde un origen ajeno     → protegido: 403                  · inseguro: 400 (falta «to»)
     3. POST {accion:"cerrar"} del sitio  → protegido: 200 y cookie de correo con Max-Age=0
                                            · inseguro: 400 (falta «to»)
   Resultado: PROTEGIDO (las 3 sondas coinciden), INSEGURO (alguna muestra el relé abierto) o
   INDETERMINADO (otra cosa: no promover ese despliegue sin revisarlo).
   --commit revisa el código de ese commit: api/_correo.js presente y api/send-email.js sin
   «Access-Control-Allow-Origin: *» ni respaldo abierto.
   ───────────────────────────────────────────────────────────────────────── */
import { execFileSync } from 'child_process';

const args = process.argv.slice(2);
const val = (k) => (args.includes(k) ? args[args.indexOf(k) + 1] : null);
const URL_BASE = val('--url'), COMMIT = val('--commit');
const ORIGEN_SITIO = val('--origen') || 'https://gestion-grupo-mediterra.vercel.app';
const AJENO = 'https://sonda-correo.invalid';

export async function sondear(base, { origenSitio = ORIGEN_SITIO, fetchImpl = fetch } = {}) {
  const url = base.replace(/\/$/, '') + '/api/send-email';
  const r1 = await fetchImpl(url, { method: 'OPTIONS', headers: { Origin: AJENO, 'Access-Control-Request-Method': 'POST' } });
  const r2 = await fetchImpl(url, { method: 'POST', headers: { Origin: AJENO, 'Content-Type': 'application/json' }, body: '{}' });
  const r3 = await fetchImpl(url, { method: 'POST', headers: { Origin: origenSitio, 'Content-Type': 'application/json' }, body: '{"accion":"cerrar"}' });
  const acao = r1.headers.get('access-control-allow-origin');
  const cookie = r3.headers.get('set-cookie') || '';
  const s = [
    { sonda: 'OPTIONS origen ajeno', status: r1.status, protegido: r1.status === 403 && !acao, inseguro: acao === '*' },
    { sonda: 'POST {} origen ajeno', status: r2.status, protegido: r2.status === 403, inseguro: r2.status === 400 },
    { sonda: 'POST cerrar desde el sitio', status: r3.status, protegido: r3.status === 200 && /mediterra_correo=/.test(cookie) && /Max-Age=0/i.test(cookie), inseguro: r3.status === 400 },
  ];
  const veredicto = s.some(x => x.inseguro) ? 'INSEGURO' : s.every(x => x.protegido) ? 'PROTEGIDO' : 'INDETERMINADO';
  return { veredicto, sondas: s };
}

export function revisarCommit(sha, { cwd = process.cwd() } = {}) {
  const leer = (f) => { try { return execFileSync('git', ['show', `${sha}:${f}`], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); } catch (e) { return null; } };
  const correo = leer('api/_correo.js'), endpoint = leer('api/send-email.js') || '';
  const r = [
    { revision: 'api/_correo.js presente (autorización en el servidor)', ok: !!correo && /function crearCorreo/.test(correo) },
    { revision: 'api/send-email.js usa crearCorreo', ok: /crearCorreo\(/.test(endpoint) },
    { revision: 'sin «Access-Control-Allow-Origin: *»', ok: !/Allow-Origin["']\s*,\s*["']\*/.test(endpoint) },
    { revision: 'sin TLS sin validar', ok: !/rejectUnauthorized\s*:\s*false/.test(endpoint) },
  ];
  return { veredicto: r.every(x => x.ok) ? 'PROTEGIDO' : 'INSEGURO', revisiones: r };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (!URL_BASE && !COMMIT) { console.error('Uso: --url <despliegue> | --commit <sha>'); process.exit(2); }
  let malo = false;
  if (COMMIT) {
    const c = revisarCommit(COMMIT);
    c.revisiones.forEach(x => console.log(`${x.ok ? '✓' : '✗'} ${x.revision}`));
    console.log(`commit ${COMMIT}: ${c.veredicto}`); malo = malo || c.veredicto !== 'PROTEGIDO';
  }
  if (URL_BASE) {
    const r = await sondear(URL_BASE);
    r.sondas.forEach(x => console.log(`${x.protegido ? '✓' : x.inseguro ? '✗' : '?'} ${x.sonda} → HTTP ${x.status}`));
    console.log(`${URL_BASE}: ${r.veredicto} · ninguna sonda puede enviar un correo`); malo = malo || r.veredicto !== 'PROTEGIDO';
  }
  process.exit(malo ? 1 : 0);
}
