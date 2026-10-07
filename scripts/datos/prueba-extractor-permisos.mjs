/* Prueba de scripts/datos/extraer-permisos.html con datos FICTICIOS en el formato que genera
   la versión publicada ("Mediterra Hub Backup v1", con pins, usuarios con correo y PIN,
   rendiciones_config con aprobadores por correo). Uso: node scripts/datos/prueba-extractor-permisos.mjs */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { chromium } from '../../node_modules/playwright/index.mjs';

const RAIZ = process.cwd();
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'mediterra-permisos-'));
let ok = 0, fallos = 0;
const check = (n, c, x = '') => { c ? ok++ : fallos++; console.log(`${c ? '✓' : '✗ FALLA'}  ${n}${x ? '  — ' + x : ''}`); };

const usuarios = [
  { nombre: 'Persona Admin', email: 'admin@ficticio.cl', rol: 'admin', esCFO: true, modulos: ['finanzas'], pin: '123456', pin_h: '{"hash":"HASHFICTICIO"}', token: 'TOKENFICTICIO', telefono: '+56 9 0000 0000' },
  { nombre: 'Persona Pagos', email: 'pagos@ficticio.cl', rol: 'editor', modulos: ['finanzas', 'contabilidad'], rendVerTodas: true, rendPorOtros: true,
    tab_permisos: { finanzas: { nominas: 'editar', params: 'ver' } }, cadenaAprobacion: ['admin@ficticio.cl', 'otro@externo.cl'] },
  { nombre: 'Persona Consulta', email: 'consulta@ficticio.cl', rol: 'consulta', desactivado: false, empresas_permitidas: ['Allegria Foods'] },
];
const respaldo = { fecha: new Date().toISOString(), usuario: 'Persona Admin', version: 'Mediterra Hub Backup v1', tablas: {
  pins: { data: { 'Persona Admin_h': '{"v":1,"salt":"aa","hash":"HASHFICTICIO"}' } },
  usuarios: { data: usuarios },
  rendiciones_config: { data: { aprobadores: { 'pagos@ficticio.cl': 'admin@ficticio.cl', 'ext:7': 'pagos@ficticio.cl', 'consulta@ficticio.cl': 'desconocido@x.cl' },
    personasExternas: [{ id: 7, nombre: 'Externo Uno', rut: '11.111.111-1', email: 'ext@x.cl' }] } },
  finanzas: { data: { creditos_data: [{ monto: 1 }], secreto: 'flujo ficticio' } },
} };
const archR = path.join(DIR, 'respaldo.json'); fs.writeFileSync(archR, JSON.stringify(respaldo));

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const ctx = await b.newContext({ acceptDownloads: true });
const pedidos = []; ctx.on('request', r => { if (!/^(file|blob|data):/.test(r.url())) pedidos.push(r.url()); });
const p = await ctx.newPage();
await p.goto('file://' + path.join(RAIZ, 'scripts/datos/extraer-permisos.html'));
await p.setInputFiles('#f', archR); await p.waitForTimeout(400);
const vista = await p.locator('#res').innerText();
check('muestra la vista previa antes de descargar', /Vista previa de lo que se exportará/.test(vista) && /Persona Pagos/.test(vista));
check('lista los campos descartados (pin, pin_h, token, email, teléfono)', ['pin', 'pin_h', 'token', 'email', 'telefono'].every(k => vista.includes(k)));
check('la vista previa no muestra correos ni hashes', !/@ficticio\.cl|HASHFICTICIO|TOKENFICTICIO|123456/.test(vista));
const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#b')]);
const archP = path.join(DIR, 'permisos.json'); await dl.saveAs(archP);
await b.close();
const texto = fs.readFileSync(archP, 'utf8'); const r = JSON.parse(texto);
check('tres personas, identificadas por nombre', r.personas.length === 3 && r.personas.map(x => x.nombre).join() === 'Persona Admin,Persona Pagos,Persona Consulta');
check('no trae PIN, hashes, tokens ni correos', !/HASHFICTICIO|TOKENFICTICIO|123456|@|"salt"|"pin/.test(texto));
check('no trae teléfono, RUT ni otros módulos', !/\+56|11\.111|flujo ficticio|creditos_data/.test(texto));
check('conserva rol, módulos, pestañas y marcas', r.personas[1].rol === 'editor' && r.personas[1].tab_permisos.finanzas.params === 'ver' && r.personas[1].rendVerTodas === true && r.personas[0].esCFO === true);
check('cadena de aprobación como nombres (correo ajeno anonimizado)', JSON.stringify(r.personas[1].cadenaAprobacion) === JSON.stringify(['Persona Admin', 'correo no registrado 1']), JSON.stringify(r.personas[1].cadenaAprobacion));
const ap = Object.fromEntries(r.aprobadoresRendiciones.map(a => [a.persona, a.aprobador]));
check('aprobadores de rendiciones como nombres (incluido externo)', ap['Persona Pagos'] === 'Persona Admin' && ap['Externo Uno (externo)'] === 'Persona Pagos' && /^correo no registrado/.test(ap['Persona Consulta']), JSON.stringify(ap));
check('declara las reglas de nóminas fijas en el código', /V°B° de nóminas/.test(r.advertencia));
check('la página no hizo pedidos de red', pedidos.length === 0, pedidos.join(' '));
fs.rmSync(DIR, { recursive: true, force: true });   // datos ficticios de la prueba
console.log(`\n${ok} correctas, ${fallos} fallas · datos ficticios`);
process.exit(fallos ? 1 : 0);
