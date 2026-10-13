/* ─────────────────────────────────────────────────────────────────────────
   RESTAURACIÓN DE PUNTA A PUNTA (oct-2026). Chromium emulado, Supabase falso,
   datos y credenciales FICTICIOS. Se usan los botones reales de la app.

     APP_URL=http://127.0.0.1:4173 OUT_DIR=/tmp/rest node scripts/e2e/restauracion-completa.mjs

   1. Descargar   «💾 Respaldo» con Tareas cargadas (main = objeto, finanzas = texto).
   2. Después del respaldo: Angelo cambia su PIN (482913 → 135790) y se dañan las Tareas.
   3. Restaurar   «📤 Restaurar» con el archivo descargado (confirmación + RESTAURAR).
   4. Reabrir     ingresar con el PIN VIGENTE (135790); el anterior ya no debe servir.
   5. Comprobar   Tareas restauradas, cada fila con su codificación de hoy.
   6. Editar y guardar   agregar un comentario: se guarda y no borra lo restaurado.
   7. Formatos    un archivo con versión desconocida se rechaza sin escribir nada.
   ───────────────────────────────────────────────────────────────────────── */
import fs from 'fs';
import path from 'path';
import { chromium } from '/home/user/gestion-grupo-mediterra/node_modules/playwright/index.mjs';
import { instalarFake, nuevoStore, PIN, EMAIL } from './fake.mjs';

const OUT = process.env.OUT_DIR || '/tmp/rest'; fs.mkdirSync(OUT, { recursive: true });
const PIN_NUEVO = '135790';
// Credencial ficticia del PIN nuevo (PBKDF2, mismo formato que src/pinHash.js).
import crypto from 'crypto';
const salt = crypto.randomBytes(16).toString('hex');
const CRED_NUEVA = JSON.stringify({ v: 1, iter: 100000, salt, hash: crypto.pbkdf2Sync(PIN_NUEVO, Buffer.from(salt, 'hex'), 100000, 32, 'sha256').toString('hex'), pol: '6dig', fecha: new Date().toISOString() });

let fallos = 0;
const check = (n, c, x = '') => { console.log(`${c ? '✓' : '✗ FALLA'}  ${n}${x ? '  — ' + x : ''}`); if (!c) fallos++; };
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const leer = (st, id) => { const v = st[id]?.value; return typeof v === 'string' ? JSON.parse(v) : v; };

const st = nuevoStore();
st.main.value = { ...st.main.value, estados: { m3: { estadoResp: 'verde', estadoSup: 'verde', aprobado: true } },
  comentarios: { m3: 'comentario restaurable (ficticio)' }, supervisores: { m3: 'Angelo Huerta' }, tareasExtra: [{ id: 'x1', nombre: 'Tarea extra ficticia', responsable: 'Carol Machuca', supervisor: '', categoria: 'Finanzas', frecuencia: 'Mensual', diaLimite: 10, diaLimiteSem: null, dependeDe: null }] };
st.finanzas.value = JSON.stringify(st.finanzas.value);        // fila que en el servidor está como TEXTO

async function abrir() {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 }, timezoneId: 'America/Santiago', acceptDownloads: true });
  await instalarFake(ctx, st);
  await ctx.route(/vercel\.app|open\.er-api\.com|mindicador\.cl|frankfurter\.app|emailjs/, r => r.abort());
  const p = await ctx.newPage();
  const avisos = [];
  p.on('dialog', d => { avisos.push(`${d.type()}: ${d.message().slice(0, 3000)}`); d.type() === 'prompt' ? d.accept('RESTAURAR') : d.accept(); });
  const errores = []; p.on('pageerror', e => errores.push(String(e).slice(0, 160)));
  if (process.env.VER_CONSOLA) p.on('console', m => { const t = m.text(); if (/persist:main|main/.test(t)) console.log('   [consola]', t.slice(0, 200)); });
  await p.goto(process.env.APP_URL);
  return { ctx, p, avisos, errores };
}
async function ingresar(p, pin) {
  await p.locator('input[type=email]').waitFor({ timeout: 20000 });
  await p.locator('input[type=email]').fill(EMAIL); await p.locator('input[type=password]').fill(pin); await p.keyboard.press('Enter');
  await p.waitForTimeout(3500);
  return !(await p.locator('input[type=password]').count());
}

// 1. Descargar
let s = await abrir();
check('1. ingreso con el PIN de ese momento', await ingresar(s.p, PIN));
const [dl] = await Promise.all([s.p.waitForEvent('download', { timeout: 30000 }), s.p.getByRole('button', { name: /💾 Respaldo/ }).first().click()]);
const archivo = path.join(OUT, 'respaldo-ficticio.json'); await dl.saveAs(archivo);
const bk = JSON.parse(fs.readFileSync(archivo, 'utf8'));
check('1b. respaldo descargado con main, pins y finanzas', !!(bk.tablas?.main && bk.tablas?.pins && bk.tablas?.finanzas), Object.keys(bk.tablas || {}).join(', '));
await s.ctx.close();

// 2. Cambios posteriores al respaldo
st.pins.value = { ...st.pins.value, 'Angelo Huerta_h': CRED_NUEVA };                      // cambio de PIN
st.pins.updated_at = new Date().toISOString();
st.main.value = { ...st.main.value, estados: {}, comentarios: {}, tareasExtra: [], supervisores: { m3: 'Carol Machuca' } };   // daño + cambio de supervisor
st.main.updated_at = new Date().toISOString();
// Cambio de ACCESO posterior al respaldo: Carol queda desactivada y con perfil consulta.
const usuariosHoy = leer(st, 'usuarios');
const carolHoy = (usuariosHoy || []).find(u => u.nombre === 'Carol Machuca');
if (carolHoy) { carolHoy.desactivado = true; carolHoy.rol = 'consulta'; st.usuarios.value = usuariosHoy; st.usuarios.updated_at = new Date().toISOString(); }

// 3. Restaurar
s = await abrir();
check('2. con el PIN vigente se puede entrar antes de restaurar', await ingresar(s.p, PIN_NUEVO));
const [fc] = await Promise.all([s.p.waitForEvent('filechooser', { timeout: 15000 }), s.p.getByRole('button', { name: /📤 Restaurar/ }).first().click()]);
await fc.setFiles(archivo); await s.p.waitForTimeout(6000);
const msg = s.avisos.filter(a => /^alert/.test(a)).pop() || '';
check('3a. ANTES de escribir, la app muestra los accesos y asignaciones que no aplicará', s.avisos.some(a => /^confirm: ANTES DE RESTAURAR/.test(a) && /Asignaciones de Tareas que NO se cambiarán/.test(a) && /Carol Machuca/.test(a)));
check('3. la app informa la restauración', /Respaldo restaurado|RESTAURACIÓN PARCIAL/.test(msg), msg.slice(0, 160).replace(/\n/g, ' '));
await s.ctx.close();

// 4. Reabrir con el PIN vigente; el anterior no debe servir
// (primero el PIN anterior, en su propia pestaña que se cierra: una segunda pestaña
// abierta escribiría `main` al abrir y la de edición chocaría con esa versión)
const t2 = await abrir(); check('4b. reabrir: el PIN anterior al cambio NO sirve', !(await ingresar(t2.p, PIN))); await t2.ctx.close();
s = await abrir();
const entra = await ingresar(s.p, PIN_NUEVO);
check('4. reabrir: el PIN VIGENTE sigue sirviendo (no se revirtió la credencial)', entra);

// 5. Datos restaurados y codificación
const m = leer(st, 'main');
check('5. Tareas restauradas (estados, comentarios, tarea extra)', m?.estados?.m3?.estadoResp === 'verde' && m?.comentarios?.m3 === 'comentario restaurable (ficticio)' && (m?.tareasExtra || []).some(t => t.id === 'x1'));
const carolTras = (leer(st, 'usuarios') || []).find(u => u.nombre === 'Carol Machuca');
check('5f. el supervisor de Tareas asignado después del respaldo se conserva', m?.supervisores?.m3 === 'Carol Machuca', JSON.stringify(m?.supervisores || {}));
check('5c. el respaldo NO reactiva a la persona desactivada después ni le devuelve el perfil', !!carolHoy && !!carolTras && carolTras.desactivado === true && carolTras.rol === 'consulta');
check('5d. main.usuarios (espejo) tampoco trae a Carol activa', !(m?.usuarios || []).some(u => u.nombre === 'Carol Machuca' && !u.desactivado));
check('5e. el aviso lista la diferencia de acceso no aplicada, sin credenciales', /Diferencias de acceso NO aplicadas/.test(msg) && /Carol Machuca/.test(msg) && !/"hash"|salt/.test(msg));
check('5b. main sigue como OBJETO y finanzas como TEXTO', typeof st.main.value === 'object' && typeof st.finanzas.value === 'string', `main ${typeof st.main.value} · finanzas ${typeof st.finanzas.value}`);

// 6. Editar y guardar: un comentario nuevo en Tareas
if (!entra) { check('6. editar y guardar tras reabrir', false, 'no se pudo ingresar después de restaurar'); } else {
await s.p.getByText(/Seguimiento Tareas/).first().click(); await s.p.waitForTimeout(3000);
await s.p.getByRole('button', { name: /Mensuales/ }).first().click().catch(() => {}); await s.p.waitForTimeout(800);
await s.p.screenshot({ path: path.join(OUT, 'tareas-antes-de-editar.png') });
if (s.errores.length) console.log('   errores de página:', s.errores.join(' | '));
await s.p.getByRole('button', { name: '+', exact: true }).first().click({ timeout: 8000 }); await s.p.waitForTimeout(500);
await s.p.locator('textarea').first().fill('comentario nuevo tras restaurar (ficticio)');
await s.p.screenshot({ path: path.join(OUT, 'comentario-escrito.png') });
const nEsc0 = (st.__escrituras || []).filter(e => e.id === 'main').length;
await s.p.getByRole('button', { name: 'Guardar', exact: true }).first().click(); await s.p.waitForTimeout(4000);
console.log('   escrituras de main al guardar:', (st.__escrituras || []).filter(e => e.id === 'main').length - nEsc0, '· comentarios:', JSON.stringify(leer(st, 'main')?.comentarios || {}).slice(0, 200));
const m2 = leer(st, 'main');
check('6. el comentario nuevo se guardó', Object.values(m2?.comentarios || {}).includes('comentario nuevo tras restaurar (ficticio)'));
check('6b. guardar no borró lo restaurado', m2?.estados?.m3?.estadoResp === 'verde' && m2?.comentarios?.m3 === 'comentario restaurable (ficticio)' && (m2?.tareasExtra || []).some(t => t.id === 'x1'));
check('6c. sin errores de página', !s.errores.length, s.errores.join(' | '));
}
await s.ctx.close();

// 7. Formato no aceptado: no escribe nada
{
  const malo = path.join(OUT, 'respaldo-version-desconocida.json');
  fs.writeFileSync(malo, JSON.stringify({ ...bk, version: 'Otro formato v9' }));
  const antes = JSON.stringify(st.main.value) + JSON.stringify(st.pins.value);
  s = await abrir(); await ingresar(s.p, PIN_NUEVO);
  const [fc2] = await Promise.all([s.p.waitForEvent('filechooser'), s.p.getByRole('button', { name: /📤 Restaurar/ }).first().click()]);
  await fc2.setFiles(malo); await s.p.waitForTimeout(3000);
  const ult = s.avisos.filter(a => /^alert/.test(a)).pop() || '';
  check('7. versión desconocida: se rechaza y no se escribe nada', /NO aceptado|inválido/.test(ult) && antes === JSON.stringify(st.main.value) + JSON.stringify(st.pins.value), ult.slice(0, 120).replace(/\n/g, ' '));
  await s.ctx.close();
}
await browser.close();
console.log(`\n${fallos ? fallos + ' falla(s)' : 'Todo OK'} · Chromium emulado · datos y credenciales ficticios`);
process.exit(fallos ? 1 : 0);
