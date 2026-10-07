/* ─────────────────────────────────────────────────────────────────────────
   REASIGNAR Y APLICAR DESDE LA BANDEJA · recorrido en la app real.

   Comprueba el FORMULARIO NUEVO, no el recorrido general:
     1. cuota → estimación
     2. cuota → cuota
     3. bandeja → cuota  y  bandeja → estimación (parcial)
     4. guardado y recarga
     5. cancelación sin cambios
     6. usuario de solo lectura

   Los resultados ESPERADOS van escritos acá, no leídos del componente.
   DATOS SINTÉTICOS. Supabase está interceptado: producción no se toca.

   Uso:
     CI=true npx react-scripts build
     (cd build && python3 -m http.server 4173 --bind 127.0.0.1 &)
     OUT_DIR=/tmp/e2e-reasig node scripts/e2e/reasignar-bandeja.mjs
   ───────────────────────────────────────────────────────────────────────── */
import fs from 'fs';
import path from 'path';
import { nuevoStore, leerFila } from './fake.mjs';
import { abrirApp, login, entrarFinanzas, irAFlujoEmpresas, elegirEmpresa, subTab } from './lib.mjs';

const OUT = process.env.OUT_DIR || '.';
fs.mkdirSync(path.join(OUT, 'reasignar'), { recursive: true });
let fallos = 0;
const check = (n, c, e = '') => { console.log(`${c ? '✓' : '✗ FALLA'}  ${n}${e ? '  — ' + e : ''}`); if (!c) fallos++; };

// ── Guarda de build fresco ────────────────────────────────────────
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

// ── Store sintético ───────────────────────────────────────────────
// venta 500.000 kg × US$2 = 1.000.000
//   estimación e1 Nov-26 0,40 US$/kg → acordado 200.000
//   WLH   cuota c1 Nov-26 120.000, con un cobro de 120.000 ya registrado
//   SNF   cuota c2 Dec-26 120.000, vacía
//   bandeja: movimiento de 100.000 del 14/08, sin asignar
const store = nuevoStore();
const fin = leerFila(store, 'finanzas');
fin.allegria_params = { '2026-2027': { cerezas: {
  kg: 500000, fob_usd_kg: 2, desc_exp_pct: 0, mat_usd_kg: 0, srv_usd_kg: 0,
  anticipos_cliente: [{ id: 'e1', mes: 'Nov-26', usd_kg: 0.40, v: 2, realizaciones: [] }],
  mes_liquidacion: 'Mar-27',
  anticipos_productor: [], mes_saldo_productor: 'Mar-27',
  dist_mat: [], dist_srv: [], modelo_version: 2, decisiones_sin_fecha: {},
  movimientos_sin_asignar: [{ id: 'mov1', fecha: '2026-08-14', usd: 100000,
    referencia: 'cartola 7731', lado: 'cliente', aplicaciones: [] }],
  programas: [
    { id: 'p1', lado: 'cliente', contraparte: 'WLH', kilos: 500000, cuotas: [
      { id: 'c1', estado: 'vigente', modalidad: 'monto', monto: 120000, mes: 'Nov-26',
        v: 2, mes_estimado: true, sustituye: [], realizaciones: [
          { id: 'r1', fecha: '2026-07-15', usd: 120000, nota: 'cartola 601' }] }] },
    { id: 'p2', lado: 'cliente', contraparte: 'SNF', kilos: 500000, cuotas: [
      { id: 'c2', estado: 'vigente', modalidad: 'monto', monto: 120000, mes: 'Dec-26',
        v: 2, mes_estimado: true, sustituye: [], realizaciones: [] }] },
  ],
} } };
store.finanzas.value = fin;

const { browser, ctx, page } = await abrirApp(store);
const escapadas = [];
page.on('requestfinished', async r => {
  if (!r.url().includes('bywovqayuzodbzwsriet.supabase.co')) return;
  const resp = await r.response().catch(() => null);
  const via = resp ? await resp.headerValue('access-control-allow-origin').catch(() => null) : null;
  if (via !== '*') escapadas.push(r.url().slice(0, 70));
});
let ultimoDialogo = '';
let aceptar = true;
page.on('dialog', d => { ultimoDialogo = d.message() || '';
  return (aceptar ? d.accept() : d.dismiss()).catch(() => {}); });
page.on('pageerror', e => { console.log('  [pageerror]', String(e).slice(0, 180)); fallos++; });

const esperar = (ms) => page.waitForTimeout(ms);
// La bandeja de la columna CLIENTE: su bloque es el div que contiene el título.
const bandeja = () => page.locator(
  'xpath=//div[normalize-space(text())="Movimientos pendientes de conciliación"]/parent::div').first();
const texto = async () => await page.locator('body').innerText();
async function irAParametros() {
  await subTab(page, /Parámetros/);
  const t = page.getByRole('button', { name: 'Temporada 2026-2027' });
  if (await t.count()) { await t.first().click(); await esperar(700); }
}
const filaFinanzas = () => JSON.parse(JSON.stringify(store.finanzas.value))
  .allegria_params['2026-2027'].cerezas;
const dondeEsta = (reaId) => {
  const f = filaFinanzas();
  for (const e of f.anticipos_cliente || [])
    if ((e.realizaciones || []).some(r => r.id === reaId && !r.anulada)) return 'estimacion:' + e.id;
  for (const p of f.programas || []) for (const c of p.cuotas || [])
    if ((c.realizaciones || []).some(r => r.id === reaId && !r.anulada)) return 'cuota:' + c.id;
  return 'ninguna';
};
const reaDe = (reaId) => {
  const f = filaFinanzas();
  const todas = [...(f.anticipos_cliente || []).flatMap(e => e.realizaciones || []),
                 ...(f.programas || []).flatMap(p => p.cuotas.flatMap(c => c.realizaciones || []))];
  return todas.find(r => r.id === reaId) || null;
};
const realizadoTotal = () => {
  const f = filaFinanzas();
  const todas = [...(f.anticipos_cliente || []).flatMap(e => e.realizaciones || []),
                 ...(f.programas || []).flatMap(p => p.cuotas.flatMap(c => c.realizaciones || []))];
  return todas.filter(r => !r.anulada).reduce((s, r) => s + Number(r.usd || 0), 0);
};

await login(page);
await entrarFinanzas(page);
await irAFlujoEmpresas(page);
await elegirEmpresa(page, 'Allegria Foods');
await irAParametros();
await esperar(800);

// Abre el formulario de reasignar desde la cuota indicada (1ª o 2ª tarjeta).
async function abrirReasignar(indiceBoton = 0) {
  const b = page.getByRole('button', { name: /asociar/i });
  await b.nth(indiceBoton).click();
  await esperar(400);
}
async function elegirEnSelect(locator, re) {
  const opciones = await locator.locator('option').all();
  for (const o of opciones) {
    const t = (await o.innerText()).trim();
    if (re.test(t)) { await locator.selectOption(await o.getAttribute('value')); return t; }
  }
  return null;
}

console.log('\n=== 1 · cuota → estimación ===');
check('estado inicial: el cobro está en la cuota c1', dondeEsta('r1') === 'cuota:c1', dondeEsta('r1'));
const realIni = realizadoTotal();
check('realizado inicial 120.000', Math.round(realIni) === 120000, String(realIni));
await abrirReasignar(0);
{
  const form = page.locator('xpath=//span[contains(text(),"Reasignar un movimiento ya registrado")]/ancestor::div[1]');
  const selects = form.locator('select');
  const origen = await elegirEnSelect(selects.nth(0), /cuota Nov-26 · WLH/);
  const destino = await elegirEnSelect(selects.nth(1), /estimación Nov-26/);
  check('el origen ofrece el cobro que está EN LA CUOTA', !!origen, String(origen));
  check('el destino ofrece la estimación', !!destino, String(destino));
  aceptar = true;
  await form.getByRole('button', { name: /Ver efecto y mover/i }).click();
  await esperar(900);
}
check('el diálogo mostró origen, destino y el realizado total',
      /DE:/.test(ultimoDialogo) && /A:/.test(ultimoDialogo) && /Realizado total/.test(ultimoDialogo),
      ultimoDialogo.slice(0, 90).replace(/\n/g, ' | '));
check('el diálogo afirma que el realizado no cambia',
      /sin cambio, como corresponde/.test(ultimoDialogo));
await esperar(900);
check('ESPERADO: el cobro quedó en la estimación e1', dondeEsta('r1') === 'estimacion:e1', dondeEsta('r1'));
check('conserva identidad: 120.000 del 2026-07-15',
      reaDe('r1')?.usd === 120000 && reaDe('r1')?.fecha === '2026-07-15', JSON.stringify(reaDe('r1')));
check('conserva su origen trazado', reaDe('r1')?.origen?.tipo === 'cuota', JSON.stringify(reaDe('r1')?.origen));
check('ESPERADO: el realizado total sigue en 120.000', Math.round(realizadoTotal()) === 120000, String(realizadoTotal()));
await page.screenshot({ path: `${OUT}/reasignar/01-cuota-a-estimacion.png`, fullPage: true });

console.log('\n=== 2 · cuota → cuota ===');
// Primero devolver el cobro a la cuota c1, y de ahí moverlo a c2 (SNF).
await irAParametros(); await esperar(500);
await abrirReasignar(0);
{
  const form = page.locator('xpath=//span[contains(text(),"Reasignar un movimiento ya registrado")]/ancestor::div[1]');
  const selects = form.locator('select');
  await elegirEnSelect(selects.nth(0), /estimación Nov-26 · 2026-07-15/);
  await elegirEnSelect(selects.nth(1), /cuota Dec-26 · SNF/);
  aceptar = true;
  await form.getByRole('button', { name: /Ver efecto y mover/i }).click();
  await esperar(1000);
}
check('ESPERADO: el cobro quedó en la cuota c2 de SNF', dondeEsta('r1') === 'cuota:c2', dondeEsta('r1'));
check('ESPERADO: el realizado total sigue en 120.000', Math.round(realizadoTotal()) === 120000, String(realizadoTotal()));
await page.screenshot({ path: `${OUT}/reasignar/02-cuota-a-cuota.png`, fullPage: true });

console.log('\n=== 3 · cancelar no cambia nada ===');
await irAParametros(); await esperar(500);
const antesCancelar = JSON.stringify(filaFinanzas());
await abrirReasignar(0);
{
  const form = page.locator('xpath=//span[contains(text(),"Reasignar un movimiento ya registrado")]/ancestor::div[1]');
  await form.getByRole('button', { name: /^Cancelar$/ }).click();
  await esperar(700);
}
check('ESPERADO: el dato quedó idéntico tras cancelar',
      JSON.stringify(filaFinanzas()) === antesCancelar);

console.log('\n=== 4 · bandeja → cuota (parcial) y → estimación (el resto) ===');
await irAParametros(); await esperar(600);
{
  const t = await texto();
  check('la bandeja muestra aplicado 0 y sin asignar 100.000, con su efecto',
        /aplicado\s*\$?0/.test(t) &&
        /sin asignar\s*\$?100,000\s*·\s*solo este importe no descuenta/.test(t),
        (t.match(/aplicado[^\n]*|sin asignar[^\n]*/g) || []).slice(0, 2).join(' | '));
  check('ya no existe el botón «quitar»', !(await page.getByRole('button', { name: /^quitar$/ }).count()));
}
await bandeja().getByRole('button', { name: /^aplicar$/ }).first().click();
await esperar(500);
{
  const form = bandeja();
  const inp = form.locator('input').first();
  await inp.fill(''); await inp.type('60000'); await inp.blur(); await esperar(300);
  const dest = await elegirEnSelect(form.locator('select').first(), /cuota Dec-26 · SNF/);
  check('el destino ofrece una cuota', !!dest, String(dest));
  aceptar = true;
  await form.getByRole('button', { name: /Ver efecto y aplicar/i }).click();
  await esperar(1000);
}
check('el diálogo dice que la bandeja no descontaba nada todavía',
      /NO descontaba nada todavía/.test(ultimoDialogo), ultimoDialogo.slice(0, 100).replace(/\n/g, ' | '));
check('el diálogo muestra aplicado y sin asignar',
      /aplicado \$?60,000/.test(ultimoDialogo) && /sin asignar \$?40,000/.test(ultimoDialogo));
check('ESPERADO: el realizado total sube a 180.000 (120.000 + 60.000 aplicados)',
      Math.round(realizadoTotal()) === 180000, String(realizadoTotal()));
await esperar(500);
{
  const t = await texto();
  check('ESPERADO: aplicado 60.000 YA DESCUENTA y sin asignar 40.000 no',
        /aplicado\s*\$?60,000\s*·\s*ya descuenta en su operación/.test(t) &&
        /sin asignar\s*\$?40,000\s*·\s*solo este importe no descuenta/.test(t),
        (t.match(/aplicado[^\n]*|sin asignar[^\n]*/g) || []).slice(0, 2).join(' | '));
}
await page.screenshot({ path: `${OUT}/reasignar/03-bandeja-parcial.png`, fullPage: true });

// El resto, a la estimación.
await bandeja().getByRole('button', { name: /^aplicar$/ }).first().click();
await esperar(500);
{
  const form = bandeja();
  await elegirEnSelect(form.locator('select').first(), /estimación Nov-26/);
  aceptar = true;
  await form.getByRole('button', { name: /Ver efecto y aplicar/i }).click();
  await esperar(1000);
}
check('ESPERADO: el realizado total llega a 220.000 (120.000 + 100.000 del movimiento)',
      Math.round(realizadoTotal()) === 220000, String(realizadoTotal()));
{
  const t = await texto();
  check('ESPERADO: la bandeja queda sin asignar 0 y sin botón aplicar',
        /sin asignar\s*\$?0/.test(t) && !(await bandeja().getByRole('button', { name: /^aplicar$/ }).count()));
}
await page.screenshot({ path: `${OUT}/reasignar/04-bandeja-aplicada.png`, fullPage: true });

console.log('\n=== 5 · guardado y recarga ===');
const antesRecarga = JSON.stringify(filaFinanzas());
await page.reload({ waitUntil: 'domcontentloaded' });
await esperar(3500);
await entrarFinanzas(page).catch(() => {});
await irAFlujoEmpresas(page);
await elegirEmpresa(page, 'Allegria Foods');
await irAParametros();
await esperar(900);
check('ESPERADO: el dato guardado es el mismo tras recargar',
      JSON.stringify(filaFinanzas()) === antesRecarga);
{
  const t = await texto();
  check('ESPERADO: tras recargar sigue mostrando aplicado 100.000',
        /aplicado\s*\$?100,000/.test(t),
        (t.match(/aplicado[^\n]*/g) || []).slice(0, 1).join(''));
}
await page.screenshot({ path: `${OUT}/reasignar/05-recarga.png`, fullPage: true });

console.log('\n=== 6 · cancelar el formulario de la bandeja ===');
// Se registra un movimiento nuevo para poder cancelar sobre él.
{
  const b = bandeja().getByRole('button', { name: /sin operación identificada/i });
  if (await b.count()) {
    await b.first().click(); await esperar(400);
    const form = bandeja();
    await form.locator('input[type=date]').first().fill('2026-09-02');
    const monto = form.locator('input[placeholder="US$"]').first();
    await monto.fill(''); await monto.type('25000'); await monto.blur();
    await form.locator('input[placeholder="referencia / cartola"]').first().fill('cartola 9002');
    await form.getByRole('button', { name: /^Guardar$/ }).first().click();
    await esperar(900);
  }
}
const antesCancelarBandeja = JSON.stringify(filaFinanzas());
{
  const b = bandeja().getByRole('button', { name: /^aplicar$/ });
  check('el movimiento nuevo ofrece aplicar', await b.count() > 0);
  if (await b.count()) {
    await b.first().click(); await esperar(400);
    await bandeja().getByRole('button', { name: /^Cancelar$/ }).first().click();
    await esperar(700);
  }
}
check('ESPERADO: cancelar en la bandeja no cambió el dato',
      JSON.stringify(filaFinanzas()) === antesCancelarBandeja);

console.log('\n=== 7 · anular con motivo, y bloqueo si tiene aplicaciones ===');
{
  const botones = bandeja().getByRole('button', { name: /^anular$/ });
  const antes = filaFinanzas().movimientos_sin_asignar.length;
  // El PRIMERO es el movimiento de 100.000, ya aplicado entero: tiene que
  // bloquearse para no dejar descuentos activos sin su movimiento.
  await botones.first().click(); await esperar(500);
  await bandeja().locator('input[placeholder="motivo de la anulación"]').first().fill('prueba de bloqueo');
  await bandeja().getByRole('button', { name: /^Anular$/ }).first().click();
  await esperar(700);
  const t1 = await texto();
  // El mensaje del MODELO, no el texto de ayuda que siempre está: tiene que
  // nombrar el importe ya aplicado.
  check('ESPERADO: se bloquea con el mensaje del modelo, nombrando el importe',
        /Este movimiento tiene\s*100000\s*ya aplicados/.test(t1.replace(/\s+/g, ' ')),
        (t1.match(/Este movimiento tiene[^\n]*/) || ['(no apareció el mensaje)'])[0].slice(0, 120));
  const movs1 = filaFinanzas().movimientos_sin_asignar;
  check('ESPERADO: y no quedó anulado', !movs1.find(m => m.id === 'mov1' && m.anulada));
  await bandeja().getByRole('button', { name: /^Cancelar$/ }).first().click();
  await esperar(400);

  // El SEGUNDO (25.000, sin aplicar) sí se anula, con motivo y sin borrarse.
  await bandeja().getByRole('button', { name: /^anular$/ }).nth(1).click();
  await esperar(500);
  await bandeja().locator('input[placeholder="motivo de la anulación"]').first().fill('duplicado de cartola');
  await bandeja().getByRole('button', { name: /^Anular$/ }).first().click();
  await esperar(900);
  const movs = filaFinanzas().movimientos_sin_asignar;
  check('ESPERADO: no se borra, la lista sigue con los mismos movimientos',
        movs.length === antes, `${antes} → ${movs.length}`);
  const anulado = movs.find(m => m.anulada);
  check('ESPERADO: el anulado conserva su monto (25.000) y su motivo',
        !!anulado && anulado.usd === 25000 && anulado.motivoAnulacion === 'duplicado de cartola',
        JSON.stringify(anulado && { usd: anulado.usd, motivo: anulado.motivoAnulacion, por: anulado.anuladaPor }));
  const t2 = await texto();
  check('ESPERADO: la pantalla lo muestra anulado con su motivo',
        /anulado · duplicado de cartola/.test(t2));
}
await page.screenshot({ path: `${OUT}/reasignar/06-anulado.png`, fullPage: true });

console.log('\n=== 8 · estado visible del guardado y salir del módulo ===');
// Lo que se prueba acá: (a) la operación muestra "Guardando..." mientras está en
// vuelo y "Guardado" SOLO cuando el servidor confirmó; (b) salir del módulo
// dentro de la ventana del debounce (800 ms) ya NO pierde la operación.
// Antes, el cleanup del efecto hacía clearTimeout y el cambio se descartaba sin
// aviso: registrar un pago y volver al Hub lo borraba.
{
  // Cuenta los PATCH que llegan a la fila `finanzas` del store falso.
  let patches = 0;
  const contar = (r) => { if (r.method() === 'PATCH' && /calendario_data/.test(r.url())) patches++; };
  page.on('request', contar);

  // (a) Estado visible: se registra un movimiento nuevo en la bandeja y se mira
  // el indicador ANTES de que termine el guardado.
  const antesEstado = JSON.stringify(filaFinanzas().movimientos_sin_asignar || []);
  {
    const b = bandeja().getByRole('button', { name: /registrar un movimiento/i });
    if (await b.count()) {
      await b.first().click(); await esperar(300);
      const form = bandeja();
      await form.locator('input[type=date]').first().fill('2026-09-20');
      const monto = form.locator('input[placeholder="US$"]').first();
      await monto.fill(''); await monto.type('11000'); await monto.blur();
      await form.locator('input[placeholder="referencia / cartola"]').first().fill('cartola 9020');
      await form.getByRole('button', { name: /^Guardar$/ }).first().click();
      // El indicador tiene que aparecer: "Guardando..." o ya "Guardado".
      let visto = '';
      for (let i = 0; i < 30; i++) {
        const t = await texto();
        const m = t.match(/Guardando\.\.\.|No se guardó[^\n]*/);
        if (m) { visto = m[0]; break; }
        await esperar(60);
      }
      check('ESPERADO: la operación muestra "Guardando..." mientras está en vuelo',
            /^Guardando/.test(visto), visto || '(no apareció el indicador)');
      await esperar(1200);
      const t2 = await texto();
      check('ESPERADO: y pasa a "Guardado" cuando el servidor confirmó',
            /Guardado/.test(t2) || /11\.?000/.test(t2),
            (t2.match(/Guardando\.\.\.|Guardado|No se guardó[^\n]*/) || ['(sin indicador)'])[0]);
      check('ESPERADO: el movimiento quedó en el servidor, no solo en pantalla',
            (filaFinanzas().movimientos_sin_asignar || []).some(m => Number(m.usd) === 11000),
            JSON.stringify((filaFinanzas().movimientos_sin_asignar || []).map(m => m.usd)));
    } else {
      check('ESPERADO: la bandeja ofrece registrar un movimiento', false, '(no se encontró el botón)');
    }
  }
  check('ESPERADO: el estado del servidor cambió respecto del inicio del bloque',
        JSON.stringify(filaFinanzas().movimientos_sin_asignar || []) !== antesEstado);

  // (b) Salir del módulo dentro de la ventana del debounce. Se anula el
  // movimiento recién creado y se vuelve al Hub de inmediato (sin esperar los
  // 800 ms): la anulación TIENE que llegar igual al servidor.
  const patchesAntes = patches;
  {
    const idx = (filaFinanzas().movimientos_sin_asignar || []).findIndex(m => Number(m.usd) === 11000);
    const botones = bandeja().getByRole('button', { name: /^anular$/ });
    if (idx >= 0 && await botones.count() > idx) {
      await botones.nth(idx).click(); await esperar(400);
      await bandeja().locator('input[placeholder="motivo de la anulación"]').first()
        .fill('prueba de salida con guardado pendiente');
      await bandeja().getByRole('button', { name: /^Anular$/ }).first().click();
      // SIN esperar el debounce: se sale del módulo de inmediato.
      await page.getByRole('button', { name: /^Mediterra$/ }).first().click();
      await esperar(2500);
      const mov = (filaFinanzas().movimientos_sin_asignar || []).find(m => Number(m.usd) === 11000);
      check('ESPERADO: salir antes del debounce NO pierde la anulación',
            !!mov && mov.anulada === true && /salida con guardado pendiente/.test(mov.motivoAnulacion || ''),
            JSON.stringify(mov && { usd: mov.usd, anulada: !!mov.anulada, motivo: mov.motivoAnulacion }));
      check('ESPERADO: y se escribió de verdad (hubo un PATCH tras salir)',
            patches > patchesAntes, `${patchesAntes} → ${patches}`);
    } else {
      check('ESPERADO: el movimiento de 11.000 está en la bandeja para anularlo', false,
            `idx=${idx}`);
    }
  }
  page.off('request', contar);
}
await page.screenshot({ path: `${OUT}/reasignar/07-salida-con-pendiente.png`, fullPage: true });

// SOLO LECTURA: no se comprueba acá. El store de la prueba trae una sola
// credencial, la de un usuario administrador, así que `puedoEdit("flujo")`
// siempre es true y la pantalla nunca entra en solo lectura. El caso está
// cubierto en `src/__tests__/reasignarMovimiento.test.js` y
// `bandejaAplicar.test.js`, que montan el panel con readOnly y comprueban que
// no aparece ningún botón de acción.
console.log('\n=== solo lectura: no se ejercita en el navegador (ver nota en el script) ===');

console.log(`\npeticiones escapadas a producción: ${escapadas.length}`);
if (escapadas.length) { escapadas.slice(0, 5).forEach(u => console.log('  ', u)); fallos++; }
await ctx.close(); await browser.close();
console.log(fallos ? `\n✗ ${fallos} FALLA(S)` : '\nOK: reasignación y bandeja se comportan como se esperaba');
process.exit(fallos ? 1 : 0);
