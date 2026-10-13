// node scripts/seguridad/verificar-correo-protegido.test.mjs
// Prueba el verificador contra los DOS endpoints reales, servidos en local: el de esta rama
// (protegido) y el de origin/main (relé abierto). Sin credenciales SMTP: aunque una sonda
// llegara a pedir un envío, no habría cuenta con qué enviarlo. Ningún correo real.
import http from 'http';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { sondear, revisarCommit } from './verificar-correo-protegido.mjs';

const require = createRequire(import.meta.url);
const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
let fallos = 0;
const ok = (n, c, x = '') => { console.log(`${c ? '✓' : '✗ FALLA'}  ${n}${x ? '  — ' + x : ''}`); if (!c) fallos++; };
for (const k of Object.keys(process.env)) if (/^SMTP_/.test(k)) delete process.env[k];
process.env.CORREO_SESSION_SECRET = 'secreto-ficticio-de-prueba';
process.env.CORREO_ORIGENES = 'https://gestion-grupo-mediterra.vercel.app';

// Adaptador estilo Vercel: res.status().json()/end(), cuerpo JSON ya interpretado.
function servir(handler) {
  let envios = 0;
  const srv = http.createServer((req, res) => {
    let b = ''; req.on('data', (d) => b += d); req.on('end', async () => {
      const vres = { statusCode: 200, setHeader: (k, v) => res.setHeader(k, v), status(c) { this.statusCode = c; return this; },
        json(o) { res.statusCode = this.statusCode; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(o)); return this; },
        end() { res.statusCode = this.statusCode; res.end(); return this; } };
      let body = {}; try { body = b ? JSON.parse(b) : {}; } catch (e) {}
      await handler({ method: req.method, headers: req.headers, body }, vres);
    });
  });
  return new Promise((r) => srv.listen(0, '127.0.0.1', () => r({ srv, url: `http://127.0.0.1:${srv.address().port}`, envios: () => envios })));
}

const protegido = require(path.join(RAIZ, 'api/send-email.js'));
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'correo-antiguo-'));
fs.writeFileSync(path.join(dir, 'send-email.cjs'), execFileSync('git', ['show', 'origin/main:api/send-email.js'], { cwd: RAIZ, encoding: 'utf8' }));
// nodemailer simulado para la versión antigua: si llegara a intentar un envío, se cuenta y no sale.
const Module = require('module'); const resolverOrig = Module._resolveFilename;
let intentosAntiguo = 0;
require.cache[path.join(dir, 'nodemailer-sim.cjs')] = { exports: { createTransport: () => ({ sendMail: async () => { intentosAntiguo++; return {}; } }) } };
Module._resolveFilename = function (req, ...a) { if (req === 'nodemailer') return path.join(dir, 'nodemailer-sim.cjs'); return resolverOrig.call(this, req, ...a); };
fs.writeFileSync(path.join(dir, 'nodemailer-sim.cjs'), '');
const antiguo = require(path.join(dir, 'send-email.cjs'));

const P = await servir(protegido), A = await servir(antiguo);
const rp = await sondear(P.url), ra = await sondear(A.url);
ok('1. el endpoint de esta rama se clasifica PROTEGIDO', rp.veredicto === 'PROTEGIDO', rp.sondas.map(s => `${s.sonda}: ${s.status}`).join(' · '));
ok('2. el endpoint de origin/main (relé abierto) se clasifica INSEGURO', ra.veredicto === 'INSEGURO', ra.sondas.map(s => `${s.sonda}: ${s.status}`).join(' · '));
ok('3. ninguna sonda intentó un envío en la versión antigua', intentosAntiguo === 0, `${intentosAntiguo} intentos`);
ok('4. por commit: esta rama PROTEGIDO, origin/main INSEGURO', revisarCommit('HEAD', { cwd: RAIZ }).veredicto === 'PROTEGIDO' && revisarCommit('origin/main', { cwd: RAIZ }).veredicto === 'INSEGURO');
P.srv.close(); A.srv.close(); Module._resolveFilename = resolverOrig;
fs.rmSync(dir, { recursive: true, force: true });
console.log(fallos ? `\n${fallos} falla(s)` : '\nTodo OK · local · ningún correo real');
process.exit(fallos ? 1 : 0);
