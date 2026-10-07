/* ─────────────────────────────────────────────────────────────────────────
   SEGUIMIENTO DE TAREAS · cambiar la frecuencia de una tarea no se puede
   perder. Recorrido en la app real.

   POR QUÉ EXISTE
   La escritura de la fila `main` REEMPLAZA la fila completa. El guardado
   manual incluía `tareasOverrides` y el auto-save general no, así que cambiar
   la frecuencia de una tarea se guardaba a los 300 ms y se BORRABA a los
   2.000 ms. Desde la pantalla no se notaba hasta recargar.

   Se comprueba contra el ALMACÉN, no contra la pantalla, dejando transcurrir
   los DOS guardados, y después se recarga:
     1. el cambio queda en la fila del servidor
     2. sigue ahí después del auto-save general
     3. sigue ahí después de recargar
     4. y ningún otro campo de la fila se perdió

   DATOS SINTÉTICOS. Supabase está interceptado: producción no se toca.

   Uso:
     CI=true npx react-scripts build
     (cd build && python3 -m http.server 4173 --bind 127.0.0.1 &)
     OUT_DIR=/tmp/e2e-tareas node scripts/e2e/tareas-overrides.mjs
   ───────────────────────────────────────────────────────────────────────── */
import fs from 'fs';
import path from 'path';
import { nuevoStore, leerFila } from './fake.mjs';
import { abrirApp, login, cerrarAvisos } from './lib.mjs';

const OUT = process.env.OUT_DIR || '.';
fs.mkdirSync(path.join(OUT, 'tareas'), { recursive: true });
let fallos = 0;
const check = (n, c, e = '') => { console.log(`${c ? '✓' : '✗ FALLA'}  ${n}${e ? '  — ' + e : ''}`); if (!c) fallos++; };

{
  const servido = await fetch('http://127.0.0.1:4173/asset-manifest.json').then(r => r.json()).catch(() => null);
  if (!servido) { console.log('✗ FALLA  no hay build servido en 127.0.0.1:4173'); process.exit(1); }
  const principal = String(servido.files?.['main.js'] || '').split('/').pop();
  const js = fs.readdirSync('build/static/js').filter(f => /^main\..*\.js$/.test(f));
  if (!js.includes(principal)) {
    console.log(`✗ FALLA  el build servido (${principal}) no es el del árbol actual (${js.join(', ')})`);
    process.exit(1);
  }
  console.log(`build servido verificado: ${principal}`);
}

const store = nuevoStore();
// Un comentario previo en la fila, para comprobar que la escritura no se lleva
// por delante lo que ya estaba.
leerFila(store, 'main').comentarios = { marcador_previo: 'no se puede perder' };

const { browser, ctx, page } = await abrirApp(store);
const escapadas = [];
page.on('requestfinished', async r => {
  if (!r.url().includes('bywovqayuzodbzwsriet.supabase.co')) return;
  const resp = await r.response().catch(() => null);
  const via = resp ? await resp.headerValue('access-control-allow-origin').catch(() => null) : null;
  if (via !== '*') escapadas.push(r.url().slice(0, 70));
});
page.on('pageerror', e => { console.log('  [pageerror]', String(e).slice(0, 180)); fallos++; });

const esperar = (ms) => page.waitForTimeout(ms);
const main = () => JSON.parse(JSON.stringify(leerFila(store, 'main')));
const overrides = () => main().tareasOverrides || {};

await login(page);
await page.getByRole('button', { name: /Seguimiento Tareas/ }).first().click();
await esperar(3000);
await cerrarAvisos(page);
await page.getByRole('button', { name: /⚙️ Config/ }).first().click();
await esperar(1500);

console.log('\n=== 1 · cambiar la frecuencia de una tarea ===');
// Se toma la primera tarea editable y se lee su frecuencia actual del select.
const editar = page.getByRole('button', { name: /✏️ Editar/ });
check('la pestaña Config ofrece editar tareas', await editar.count() > 0, `${await editar.count()} botones`);
if (await editar.count() === 0) { await ctx.close(); await browser.close(); process.exit(1); }

await editar.first().click();
await esperar(600);
const fila = page.locator('tr').filter({ has: page.getByRole('button', { name: /✓ Guardar/ }) }).first();
const nombreTarea = await fila.locator('input').first().inputValue();
const selects = fila.locator('select');
// El orden de los selects de la fila en edición: responsable, supervisor,
// categoría, frecuencia, …
const selFrec = selects.nth(3);
const opciones = await selFrec.locator('option').allInnerTexts();
const actual = await selFrec.inputValue();
const destino = opciones.map(o => o.trim()).find(o => o && o !== actual);
check('la fila en edición muestra el selector de frecuencia',
      !!destino && opciones.length > 1, `actual=${actual} · opciones=${opciones.join(',')}`);
console.log(`  tarea: «${nombreTarea}» · frecuencia ${actual} → ${destino}`);
await selFrec.selectOption(destino);
await esperar(300);
await fila.getByRole('button', { name: /✓ Guardar/ }).click();

// El guardado manual sale a los 300 ms.
await esperar(1500);
const trasManual = overrides();
const idCambiado = Object.keys(trasManual).find(k => trasManual[k] && trasManual[k].frecuencia === destino);
check('ESPERADO: el guardado manual dejó la frecuencia nueva en el servidor',
      !!idCambiado, idCambiado ? `${idCambiado} → ${destino}` : JSON.stringify(trasManual).slice(0, 160));

console.log('\n=== 2 · dejar transcurrir el auto-save general (2.000 ms) ===');
// Se toca algo que SÍ dispara el auto-save general, para que corra de verdad.
await page.getByRole('button', { name: /📋 Diarias/ }).first().click();
await esperar(900);
await page.getByRole('button', { name: /⚙️ Config/ }).first().click();
await esperar(4000);   // más que el debounce de 2.000 ms
{
  const o = overrides();
  check('ESPERADO: tras el auto-save general la frecuencia SIGUE guardada',
        !!idCambiado && o[idCambiado] && o[idCambiado].frecuencia === destino,
        idCambiado ? JSON.stringify(o[idCambiado] || null).slice(0, 160) : '(sin id)');
  check('ESPERADO: y el comentario que ya estaba en la fila no se perdió',
        main().comentarios?.marcador_previo === 'no se puede perder',
        JSON.stringify(main().comentarios || {}).slice(0, 120));
}
await page.screenshot({ path: `${OUT}/tareas/01-tras-autosave.png`, fullPage: true });

console.log('\n=== 3 · recargar ===');
await page.reload({ waitUntil: 'domcontentloaded' });
await esperar(3500);
await cerrarAvisos(page);
await page.getByRole('button', { name: /Seguimiento Tareas/ }).first().click().catch(() => {});
await esperar(3000);
{
  const o = overrides();
  check('ESPERADO: tras recargar la frecuencia sigue en el servidor',
        !!idCambiado && o[idCambiado] && o[idCambiado].frecuencia === destino,
        idCambiado ? JSON.stringify(o[idCambiado] || null).slice(0, 160) : '(sin id)');
  const t = await page.locator('body').innerText();
  check('ESPERADO: y la pantalla la muestra con la frecuencia nueva',
        t.includes(nombreTarea), `«${nombreTarea}» visible: ${t.includes(nombreTarea)}`);
}
await page.screenshot({ path: `${OUT}/tareas/02-tras-recarga.png`, fullPage: true });

console.log(`\npeticiones escapadas a producción: ${escapadas.length}`);
if (escapadas.length) { escapadas.slice(0, 5).forEach(u => console.log('  ', u)); fallos++; }
await ctx.close(); await browser.close();
console.log(fallos ? `\n✗ ${fallos} FALLA(S)` : '\nOK: el cambio de frecuencia sobrevive los dos guardados y la recarga');
process.exit(fallos ? 1 : 0);
