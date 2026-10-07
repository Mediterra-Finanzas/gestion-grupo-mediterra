/* Prueba de la cadena de copia mínima, con datos FICTICIOS:
   respaldo v3 (créditos por defecto + filas sensibles simuladas) → extraer-creditos-minimo.html
   en navegador (sin red) → el archivo resultante NO trae nada sensible y la herramienta
   `npm run comparar:tz` lo acepta. Uso: node scripts/datos/prueba-extractor.mjs           */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';
import { chromium } from '../../node_modules/playwright/index.mjs';

const RAIZ = process.cwd();
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'mediterra-extractor-'));
let ok = 0, fallos = 0;
const check = (n, c, x = '') => { c ? ok++ : fallos++; console.log(`${c ? '✓' : '✗ FALLA'}  ${n}${x ? '  — ' + x : ''}`); };

// Créditos por defecto del repo (leídos del código, sin ejecutar la app) + campos que NO deben salir
const fuente = fs.readFileSync(path.join(RAIZ, 'src/FinanzasModule.jsx'), 'utf8');
const ini = fuente.indexOf('export const CREDITOS_DEFAULT');
const lit = fuente.slice(fuente.indexOf('[', ini), fuente.indexOf('];', ini) + 1);
const creditos = Function(`return ${lit}`)().map((c, i) => ({ ...c, notas: 'nota interna ficticia', rut_acreedor: '11.111.111-1', contacto: 'x@y.cl' }));
// Formato que genera la versión PUBLICADA (App.jsx de main, "Mediterra Hub Backup v1"):
// todas las filas menos backup_*, incluida `pins`. Se prueba ese y el v3 de la rama.
const sensibles = {
  pins: { data: { 'Angelo Huerta_h': '{"v":1,"iter":100000,"salt":"aa","hash":"HASHFICTICIO"}' }, updated_at: new Date().toISOString() },
  nominas: { data: { nominas: [{ id: 'n1', lineas: [{ monto: 123 }] }] } },
  usuarios: { data: [{ nombre: 'X', email: 'x@y.cl' }] },
};
const finanzas = { data: JSON.stringify({ creditos_data: creditos, finanzas_real: { secreto: 'flujo ficticio' } }), updated_at: new Date().toISOString() }; // string-encoded, como algunas filas reales
const FORMATOS = {
  'v1 (versión publicada)': { fecha: new Date().toISOString(), usuario: 'Angelo Huerta', version: 'Mediterra Hub Backup v1', tablas: { ...sensibles, finanzas } },
  'v3 (rama)': { version: 'Mediterra Hub Backup v3', formato: 'saneado', fecha: new Date().toISOString(), tablasSaneadas: { finanzas, nominas: sensibles.nominas, usuarios: sensibles.usuarios } },
};
let archM;
for (const [nombre, respaldo] of Object.entries(FORMATOS)) {
  const archR = path.join(DIR, 'respaldo.json'); fs.writeFileSync(archR, JSON.stringify(respaldo));
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const ctx = await b.newContext({ acceptDownloads: true });
  const pedidos = []; ctx.on('request', r => { if (!/^(file|blob|data):/.test(r.url())) pedidos.push(r.url()); });
  const p = await ctx.newPage();
  await p.goto('file://' + path.join(RAIZ, 'scripts/datos/extraer-creditos-minimo.html'));
  await p.setInputFiles('#f', archR); await p.waitForTimeout(400);
  check(`${nombre}: reconoce los créditos`, /créditos encontrados/.test(await p.locator('#res').innerText()));
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#b')]);
  archM = path.join(DIR, 'minimo.json'); await dl.saveAs(archM);
  await b.close();
  fs.rmSync(archR);                                         // el original no queda en ninguna parte
  const m = JSON.parse(fs.readFileSync(archM, 'utf8'));
  const texto = fs.readFileSync(archM, 'utf8');
  check(`${nombre}: mismo número de créditos`, m.creditos.length === creditos.length, `${m.creditos.length}/${creditos.length}`);
  check(`${nombre}: no trae PIN ni hashes`, !/HASHFICTICIO|"[^"]*_h"|"salt"|"iter"|"hash"/.test(texto));
  check(`${nombre}: no trae notas, RUT ni contactos`, !/nota interna|11\.111\.111|x@y\.cl/.test(texto));
  check(`${nombre}: no trae otras filas (flujo, nóminas, usuarios)`, !/flujo ficticio|"nominas"|"usuarios"|"lineas"/.test(texto));
  check(`${nombre}: solo campos de la lista`, m.creditos.every(c => Object.keys(c).every(k => m.campos.includes(k))));
  check(`${nombre}: la página no hizo pedidos de red`, pedidos.length === 0, pedidos.join(' '));
}

// La herramienta de comparación lo acepta y da el mismo resultado que con los datos por defecto
const out = path.join(DIR, 'salida');
const log = execFileSync('npx', ['react-scripts', 'test', '--watchAll=false', '--testPathPattern', 'compararZonaHoraria'],
  { cwd: RAIZ, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, CI: 'true', TZ: 'America/Santiago', COMPARAR_TZ_EJECUTAR: '1', COMPARAR_TZ_ARCHIVO: archM, COMPARAR_TZ_SALIDA: out, COMPARAR_TZ_CORTE: '2026-10-07' } });
const r = JSON.parse(fs.readFileSync(path.join(out, 'comparacion-zona-horaria.json'), 'utf8'));
check('comparar:tz acepta la copia mínima: 10 cuotas cambian de mes (igual que con los datos por defecto)', r.cuotasConCambioDeMes === 10, String(r.cuotasConCambioDeMes));
const l = JSON.parse(fs.readFileSync(path.join(out, 'verificacion-leasing-capital.json'), 'utf8'));
check('verificación de leasing y capital generada', Array.isArray(l.leasing) && l.capital && l.corte === '2026-10-07', `${l.leasing.length} leasing`);
if (process.env.CONSERVAR) console.log('dir', DIR); else fs.rmSync(DIR, { recursive: true, force: true });
console.log(`\n${ok} correctas, ${fallos} fallas · datos ficticios`);
process.exit(fallos ? 1 : 0);
