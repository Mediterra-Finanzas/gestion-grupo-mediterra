/* ─────────────────────────────────────────────────────────────────────────
   RESPALDO Y RESTAURAR (botones del administrador) — navegador, Supabase falso.

   1. "💾 Respaldo" descarga un archivo SIN credenciales (ni la fila pins, ni PIN
      heredados, ni hashes) y con los datos de negocio.
   2. Se pierde la fila finanzas y cambia un PIN después del respaldo.
   3. "📤 Restaurar" valida el archivo, muestra qué reemplaza y avisa lo
      modificado después; al confirmar, finanzas vuelve idéntica, el PIN ACTUAL
      se conserva y pins no se toca.
   4. Un respaldo ANTIGUO (v1) con credenciales: pins se excluye y no se restaura.
   5. Conflicto: si la fila cambia entre la revisión y la escritura, no se pisa.
   6. Un archivo con versión desconocida se rechaza.
   Uso:  APP_URL=http://127.0.0.1:4173 OUT_DIR=/tmp/rr node scripts/e2e/respaldo-restaurar.mjs
   ───────────────────────────────────────────────────────────────────────── */
import fs from 'fs';
import path from 'path';
import { nuevoStore, leerFila } from './fake.mjs';
import { abrirApp, login } from './lib.mjs';

const OUT = process.env.OUT_DIR || '.';
fs.mkdirSync(OUT, { recursive: true });
let ok = 0, fallos = 0;
const check = (n, c, x = '') => { c ? ok++ : fallos++; console.log(`${c ? '✓' : '✗ FALLA'}  ${n}${x ? '  — ' + x : ''}`); };

const store = nuevoStore();
const { browser, ctx, page } = await abrirApp(store);
await ctx.route(/\/api\/send-email|emailjs/, r => r.fulfill({ status: 200, body: '{}' }));
page.on('dialog', d => d.accept().catch(() => {}));
await login(page);
await page.waitForTimeout(3000);

// Credencial heredada en texto plano (como las que quedan en `usuarios`/`main`)
const filaUsuarios = store.usuarios ? 'usuarios' : 'main';
const usuariosDe = () => { const v = leerFila(store, filaUsuarios); return Array.isArray(v) ? v : v.usuarios; };
const setUsuarios = (lista) => { const v = leerFila(store, filaUsuarios); store[filaUsuarios].value = Array.isArray(v) ? lista : { ...v, usuarios: lista }; };
const us0 = usuariosDe(); us0.find(u => u.nombre === 'Angelo Huerta').pin = '123456'; setUsuarios(us0);
store.finanzas.value = { ...leerFila(store, 'finanzas'), marcador_prueba: { cuota: 120000, nota: 'dato de negocio' } };
store.finanzas.updated_at = new Date(Date.now() - 3600e3).toISOString();
const finanzasOriginal = JSON.stringify(leerFila(store, 'finanzas'));
const pinsAntes = JSON.stringify(store.pins);

// 1. Descargar respaldo
const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /💾 Respaldo/ }).click()]);
const archivo = path.join(OUT, 'respaldo-v2.json'); await dl.saveAs(archivo);
const txt = fs.readFileSync(archivo, 'utf8'); const resp = JSON.parse(txt);
check('el respaldo es v3 saneado (filas en tablasSaneadas: la versión anterior lo rechaza)', resp.version === 'Mediterra Hub Backup v3' && resp.formato === 'saneado' && !resp.tablas);
check('no trae la fila pins', !('pins' in resp.tablasSaneadas));
check('no trae PIN heredado ni hash de PIN', !txt.includes('123456') && !/"salt"\s*:/.test(txt) && !txt.includes('"pin":'), '');
check('trae los datos de negocio', txt.includes('dato de negocio'));
check('anota la ruta quitada', JSON.stringify(resp.tablasSaneadas[filaUsuarios].rutasQuitadas || []).includes('.pin'), JSON.stringify(resp.tablasSaneadas[filaUsuarios].rutasQuitadas));

// 2. Pérdida de datos + PIN cambiado después
await page.waitForTimeout(1500);
store.finanzas.value = { finanzas_real: {} }; store.finanzas.updated_at = new Date().toISOString();
const us1 = usuariosDe(); us1.find(u => u.nombre === 'Angelo Huerta').pin = '999000'; setUsuarios(us1); store[filaUsuarios].updated_at = new Date().toISOString();

// 3. Restaurar
async function abrirRestaurar(rutaArchivo) {
  await page.getByRole('button', { name: /📤 Restaurar/ }).click();
  await page.locator('#rr-archivo').setInputFiles(rutaArchivo);
  await page.waitForTimeout(1500);
}
await abrirRestaurar(archivo);
const dialogo = page.getByRole('dialog');
const textoPlan = await dialogo.innerText();
await page.screenshot({ path: path.join(OUT, 'plan-restauracion.png') });
check('muestra el plan antes de escribir', /Restaurar un respaldo/.test(textoPlan) && /finanzas/.test(textoPlan) && /Reemplaza/.test(textoPlan));
check('avisa que finanzas cambió después del respaldo', /Modificada después del respaldo/.test(textoPlan));
const finCheck = dialogo.getByRole('checkbox', { name: 'Restaurar finanzas' });
check('lo modificado después queda sin marcar por defecto', !(await finCheck.isChecked()));
check('nada se escribió todavía', leerFila(store, 'finanzas').finanzas_real && !leerFila(store, 'finanzas').marcador_prueba);
await finCheck.check();
for (const cb of await dialogo.getByRole('checkbox').all()) { const n = await cb.getAttribute('aria-label'); if (n !== 'Restaurar finanzas' && n !== `Restaurar ${filaUsuarios}`) await cb.uncheck(); }
await dialogo.getByRole('checkbox', { name: `Restaurar ${filaUsuarios}` }).check().catch(() => {});
await page.locator('#rr-conf').fill('RESTAURAR');
await dialogo.getByRole('button', { name: /^Restaurar \d+ de/ }).click();
await page.waitForTimeout(1500);
const textoRes = await dialogo.innerText();
check('informa filas restauradas', /finanzas: restaurada/.test(textoRes), textoRes.replace(/\n/g, ' ').slice(0, 160));
check('finanzas vuelve idéntica al respaldo', JSON.stringify(leerFila(store, 'finanzas')) === finanzasOriginal);
check('se conserva el PIN ACTUAL (no vuelve el del respaldo)', usuariosDe().find(u => u.nombre === 'Angelo Huerta').pin === '999000');
check('pins no se tocó', JSON.stringify(store.pins) === pinsAntes);
await dialogo.getByRole('button', { name: 'Cerrar' }).click();

// 4. Respaldo ANTIGUO v1 con credenciales (incluida la fila pins)
const v1 = { version: 'Mediterra Hub Backup v1', fecha: new Date(Date.now() - 86400e3).toISOString(), usuario: 'x', tablas: {
  pins: { data: { 'Angelo Huerta_h': '{"v":1,"iter":100000,"salt":"00ff","hash":"aa"}' }, updated_at: 't' },
  finanzas: { data: { finanzas_real: {}, viejo: true }, updated_at: 't' } } };
const archivoV1 = path.join(OUT, 'respaldo-v1-antiguo.json'); fs.writeFileSync(archivoV1, JSON.stringify(v1));
await abrirRestaurar(archivoV1);
const t1 = await dialogo.innerText();
check('v1 antiguo: pins aparece como "No se restaura (credenciales)"', /pins[\s\S]*No se restaura \(credenciales\)/.test(t1));
check('v1 antiguo: no hay casilla para restaurar pins', (await dialogo.getByRole('checkbox', { name: 'Restaurar pins' }).count()) === 0);

// 5. Conflicto: la fila cambia mientras se revisa
await dialogo.getByRole('checkbox', { name: 'Restaurar finanzas' }).check();
store.finanzas.value = { ...leerFila(store, 'finanzas'), editadoPorOtro: 1 }; store.finanzas.updated_at = new Date().toISOString();
const antesConflicto = JSON.stringify(leerFila(store, 'finanzas'));
await page.locator('#rr-conf').fill('RESTAURAR');
await dialogo.getByRole('button', { name: /^Restaurar \d+ de/ }).click();
await page.waitForTimeout(1200);
check('conflicto detectado antes de escribir', /cambiaron mientras revisabas/.test(await dialogo.innerText()));
check('no pisó la edición ajena', JSON.stringify(leerFila(store, 'finanzas')) === antesConflicto && JSON.stringify(store.pins) === pinsAntes);
await dialogo.getByRole('button', { name: 'Cancelar' }).click();

// 6. Versión desconocida
const malo = path.join(OUT, 'desconocido.json'); fs.writeFileSync(malo, JSON.stringify({ version: 'otra cosa', fecha: '2026-10-01', tablas: { a: { data: 1 } } }));
await abrirRestaurar(malo);
check('versión desconocida se rechaza', /versión desconocida/.test(await dialogo.innerText()));

await browser.close();
console.log(`\n${ok} correctas, ${fallos} fallas`);
process.exit(fallos ? 1 : 0);
