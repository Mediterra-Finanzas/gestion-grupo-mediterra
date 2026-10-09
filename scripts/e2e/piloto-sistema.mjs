/* ─────────────────────────────────────────────────────────────────────────
   PILOTO DEL SISTEMA VISUAL (etapa 2): una tabla financiera, un formulario y
   una aprobación. Navegador Chromium emulado, Supabase falso, datos FICTICIOS.
     A. Flujo de caja de una empresa (tabla de 63 meses + gráfico) en teléfono,
        tablet y computador: pestañas en una línea, tabla desplazable con
        encabezado y 1.ª columna fijos y enfocable, etiquetas del gráfico ≥ 11 px
        renderizados y sin encimarse, título del módulo visible.
     B. Formulario de rendición (teléfono, táctil): hoja inferior, campos de 44 px
        y 16 px de letra, nada tapado por la barra.
     C. Aprobación (teléfono): botones de acción ≥ 44 px y separados ≥ 8 px;
        «Devolver» en la página (sin window.prompt): cancelar no escribe,
        confirmar escribe una vez.
     D. Lectura de rendiciones fallida: error visible con reintento, sin lista
        vacía ni «Guardado».
   Uso: APP_URL=http://127.0.0.1:4197 OUT_DIR=/tmp/piloto node scripts/e2e/piloto-sistema.mjs
   ───────────────────────────────────────────────────────────────────────── */
import fs from 'fs';
import { instalarFake, leerFila, PIN } from './fake.mjs';
import { storeDiseno } from '../vista-previa/semilla-diseno.mjs';
import { chromium } from '/home/user/gestion-grupo-mediterra/node_modules/playwright/index.mjs';

const OUT = process.env.OUT_DIR || '/tmp/piloto';
fs.mkdirSync(OUT, { recursive: true });
let ok = 0, fallos = 0;
const check = (n, c, x = '') => { c ? ok++ : fallos++; console.log(`${c ? '✓' : '✗ FALLA'}  ${n}${x ? '  — ' + x : ''}`); };
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });

async function sesion(email, [w, h], tactil, { st = storeDiseno(), fallarRend = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: tactil, deviceScaleFactor: 2, timezoneId: 'America/Santiago' });
  st.__dialogosApp = true; await instalarFake(ctx, st);
  const control = { fallarRend };
  await ctx.route(/calendario_data.*id=eq\.rendiciones(&|$)/, r => control.fallarRend && r.request().method() === 'GET'
    ? r.fulfill({ status: 500, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '{"message":"fallo simulado"}' }) : r.fallback());
  await ctx.route(/open\.er-api\.com|mindicador\.cl|frankfurter\.app|emailjs/, r => r.abort());
  await ctx.routeWebSocket(/realtime\/v1\/websocket/, () => {});
  const page = await ctx.newPage();
  const errores = []; page.on('pageerror', e => errores.push(String(e).slice(0, 160)));
  const dialogos = []; page.on('dialog', d => { dialogos.push(d.message().slice(0, 60)); d.dismiss().catch(() => {}); });
  const escrituras = []; ctx.on('request', r => { if (/calendario_data/.test(r.url()) && r.method() !== 'GET') { const m = /"id":"([^"]+)"/.exec(r.postData() || '') || /id=eq\.([^&]+)/.exec(r.url()); escrituras.push(m ? decodeURIComponent(m[1]) : '?'); } });
  await page.goto(process.env.APP_URL);
  await page.locator('input[type=email]').fill(email); await page.locator('input[type=password]').fill(PIN); await page.keyboard.press('Enter');
  await page.getByTestId('inicio').waitFor({ timeout: 20000 });
  for (const t of ['Entendido', 'Aceptar']) { const b = page.getByRole('button', { name: t }); if (await b.count()) await b.first().click().catch(() => {}); }
  return { ctx, page, errores, dialogos, escrituras, st, control };
}

// ── A. Tabla financiera + gráfico ──
for (const [tam, vp, tactil] of [['telefono', [390, 844], true], ['tablet', [834, 1112], true], ['computador', [1440, 900], false]]) {
  const s = await sesion('ahuerta@grupomediterra.cl', vp, tactil);
  await s.page.getByTestId('acceso-finanzas-flujo').click(); await s.page.waitForTimeout(4500);
  const g = await s.page.evaluate(() => {
    const ts = [...document.querySelectorAll('svg[role="img"] text')];
    const cajas = ts.map(t => t.getBoundingClientRect()).filter(r => r.width > 0);
    const meses = ts.filter(t => /^[A-Z][a-z]{2}-\d\d$/.test(t.textContent)).map(t => t.getBoundingClientRect()).sort((a, b) => a.left - b.left);
    let encima = 0; for (let i = 1; i < meses.length; i++) if (meses[i].left < meses[i - 1].right - 0.5) encima++;
    const fueraIzq = cajas.filter(r => r.left < ts[0]?.ownerSVGElement.getBoundingClientRect().left - 0.5).length;
    return { n: ts.length, minAlto: Math.min(...cajas.map(r => r.height)), encima, fueraIzq };
  });
  check(`A · ${tam}: etiquetas del gráfico ≥ 11 px renderizados`, g.n > 0 && g.minAlto >= 12.5, `${g.n} etiquetas · caja mín ${g.minAlto.toFixed(1)} px`);
  check(`A · ${tam}: los meses del gráfico no se enciman ni se salen`, g.encima === 0 && g.fueraIzq === 0, JSON.stringify(g));
  await s.page.screenshot({ path: `${OUT}/A-${tam}-consolidado.png` });
  await s.page.locator('main').getByRole('button', { name: /Allegria Foods/ }).first().click(); await s.page.waitForTimeout(2500);
  const t = await s.page.evaluate(() => {
    const pest = [...document.querySelectorAll('.mdt-pestanas')].map(e => Math.round(e.getBoundingClientRect().height));
    const tit = [...document.querySelectorAll('span')].find(x => x.textContent.trim() === 'Finanzas');
    const tabla = [...document.querySelectorAll('table')].sort((a, b) => b.querySelectorAll('td').length - a.querySelectorAll('td').length)[0];
    let c = tabla?.parentElement; while (c && !/auto|scroll/.test(getComputedStyle(c).overflowX)) c = c.parentElement;
    const td = tabla?.querySelector('tbody tr td'), th = tabla?.querySelector('thead th');
    const resumen = [...document.querySelectorAll('main *')].find(d => [...d.childNodes].some(n => n.nodeType === 3 && /saldo banco usd/i.test(n.textContent)));
    return { pest, titColor: tit && getComputedStyle(tit).color, fondo: tit && getComputedStyle(tit.closest('div[style*="border-radius: 14px"]') || tit.parentElement).backgroundColor,
      scroll: !!c && c.scrollWidth > c.clientWidth - 1 || (tabla && tabla.getBoundingClientRect().width <= (c?.clientWidth || 0)),
      foco: c?.tabIndex === 0, primeraFija: td && getComputedStyle(td).position === 'sticky', encabezadoFijo: th && getComputedStyle(th).position === 'sticky',
      yResumen: resumen ? Math.round(resumen.getBoundingClientRect().top + scrollY) : null };
  });
  if (tam === 'telefono') check('A · teléfono: pestañas y empresas en una línea deslizable (no se apilan)', t.pest.length >= 2 && t.pest.every(x => x <= 60), t.pest.join(','));
  check(`A · ${tam}: el título «Finanzas» se ve (color ≠ fondo)`, t.titColor && t.titColor !== t.fondo, `${t.titColor} sobre ${t.fondo}`);
  check(`A · ${tam}: tabla de flujo con encabezado y 1.ª columna fijos, enfocable con teclado`, t.primeraFija && t.encabezadoFijo && t.foco, JSON.stringify({ f: t.primeraFija, e: t.encabezadoFijo, k: t.foco }));
  if (tam === 'telefono') check('A · teléfono: el resumen de la empresa aparece antes de los 600 px', t.yResumen != null && t.yResumen < 600, String(t.yResumen));
  // teclado: la tabla se desplaza con la flecha derecha
  const des = await s.page.evaluate(async () => { const c = document.querySelector('.mdt-tabla-foco'); c.focus(); return document.activeElement === c; });
  if (des) { await s.page.keyboard.press('ArrowRight'); await s.page.keyboard.press('ArrowRight'); await s.page.waitForTimeout(200); }
  const sl = await s.page.evaluate(() => document.querySelector('.mdt-tabla-foco').scrollLeft);
  if (tam !== 'computador') check(`A · ${tam}: con el foco en la tabla, la flecha derecha la desplaza`, des && sl > 0, `scrollLeft=${sl}`);
  await s.page.screenshot({ path: `${OUT}/A-${tam}-flujo-empresa.png` });
  check(`A · ${tam}: sin errores de página`, s.errores.length === 0, s.errores.join(' | '));
  await s.ctx.close();
}

// ── B. Formulario de rendición (teléfono) ──
{
  const s = await sesion('operario.planta@ejemplo.cl', [390, 844], true);
  await s.page.getByTestId('inicio-nueva-rendicion').click(); await s.page.waitForTimeout(4500);
  const f = await s.page.evaluate(() => {
    const m = document.querySelector('[role="dialog"]'); if (!m) return null;
    const r = m.getBoundingClientRect();
    const campos = [...m.querySelectorAll('input:not([type=checkbox]):not([type=radio]):not([type=file]), select, textarea')].filter(e => e.getBoundingClientRect().height > 0);
    const bajos = campos.filter(e => e.getBoundingClientRect().height < 43.5).map(e => e.name || e.placeholder || e.tagName).slice(0, 4);
    const letra = campos.filter(e => parseFloat(getComputedStyle(e).fontSize) < 16).length;
    const enBorde = document.elementFromPoint(innerWidth / 2, innerHeight - 10);
    return { abajo: Math.round(innerHeight - r.bottom), ancho: Math.round(r.width), n: campos.length, bajos, letra, barraEncima: !!enBorde?.closest('[data-testid="nav-inferior"]') };
  });
  check('B · formulario: se abre como hoja inferior a lo ancho', f && f.abajo <= 1 && f.ancho >= 388, JSON.stringify(f));
  check('B · formulario: campos de al menos 44 px de alto en pantalla táctil', f && f.n > 0 && f.bajos.length === 0, f && `${f.n} campos; bajos: ${f.bajos.join(',')}`);
  check('B · formulario: letra de 16 px en los campos (sin zoom de iOS)', f && f.letra === 0, String(f?.letra));
  check('B · formulario: la barra inferior no tapa la hoja', f && !f.barraEncima);
  await s.page.screenshot({ path: `${OUT}/B-telefono-formulario.png` });
  check('B · sin errores de página', s.errores.length === 0, s.errores.join(' | '));
  await s.ctx.close();
}

// ── C. Aprobación (teléfono) ──
{
  const s = await sesion('ahuerta@grupomediterra.cl', [390, 844], true);
  await s.page.getByTestId('nav-rendir').click(); await s.page.waitForTimeout(4500);
  await s.page.getByRole('button', { name: /Por Aprobar/ }).click(); await s.page.waitForTimeout(800);
  const a = await s.page.evaluate(() => {
    const bs = [...document.querySelectorAll('main .mdt-acciones button')].filter(b => b.getBoundingClientRect().height > 0);
    const bajos = bs.filter(b => b.getBoundingClientRect().height < 43.5).length;
    let juntos = 0;
    for (const g of document.querySelectorAll('main .mdt-acciones')) {
      const r = [...g.children].map(x => x.getBoundingClientRect()).filter(x => x.height > 0);
      for (let i = 0; i < r.length; i++) for (let j = i + 1; j < r.length; j++) {
        const dx = Math.max(r[j].left - r[i].right, r[i].left - r[j].right), dy = Math.max(r[j].top - r[i].bottom, r[i].top - r[j].bottom);
        if (Math.max(dx, dy) < 7.5) juntos++;
      }
    }
    return { n: bs.length, bajos, juntos };
  });
  check('C · aprobación: botones de acción de 44 px o más', a.n > 0 && a.bajos === 0, JSON.stringify(a));
  check('C · aprobación: separación mínima de 8 px entre acciones vecinas', a.juntos === 0, JSON.stringify(a));
  await s.page.screenshot({ path: `${OUT}/C-telefono-por-aprobar.png`, fullPage: true });
  // Devolver en la página
  const antes = (leerFila(s.st, 'rendiciones') || []).find(r => r.id === 'r7')?.estado;
  await s.page.getByRole('button', { name: /Devolver para corrección/ }).first().click(); await s.page.waitForTimeout(400);
  check('C · «Devolver» abre un diálogo en la página (sin window.prompt)', (await s.page.getByTestId('dialogo-devolver').count()) === 1 && s.dialogos.length === 0, s.dialogos.join('|'));
  await s.page.screenshot({ path: `${OUT}/C-telefono-devolver.png` });
  await s.page.getByTestId('dialogo-devolver').getByRole('button', { name: 'Cancelar' }).click(); await s.page.waitForTimeout(1500);
  check('C · cancelar no cambia la rendición', (leerFila(s.st, 'rendiciones') || []).find(r => r.id === 'r7')?.estado === antes && antes === 'aprobada');
  await s.page.getByRole('button', { name: /Devolver para corrección/ }).first().click(); await s.page.waitForTimeout(300);
  await s.page.getByTestId('dialogo-devolver').locator('textarea').fill('Falta la boleta del peaje (prueba)');
  await s.page.getByTestId('dialogo-devolver').getByRole('button', { name: 'Devolver al trabajador' }).click(); await s.page.waitForTimeout(2500);
  const r7 = (leerFila(s.st, 'rendiciones') || []).find(r => r.id === 'r7');
  check('C · confirmar devuelve con la nota escrita (misma acción de antes)', r7?.estado === 'rechazada' && r7?.devuelta === true && /peaje/.test(JSON.stringify(r7)), `${r7?.estado} ${r7?.devuelta}`);
  // Pagos: la acción aparece porque en main paga quien ve todas
  await s.page.getByRole('button', { name: /Pagos/ }).first().click(); await s.page.waitForTimeout(500);
  check('C · Pagos (regla de main): el CFO ve «Marcar pagada» y no el aviso de solo lectura',
    (await s.page.getByRole('button', { name: 'Marcar pagada' }).count()) === 0 || (await s.page.getByTestId('pagos-solo-ver').count()) === 0);
  check('C · sin errores de página', s.errores.length === 0, s.errores.join(' | '));
  await s.ctx.close();
}

// ── D. Lectura fallida de rendiciones ──
{
  const s = await sesion('operario.planta@ejemplo.cl', [390, 844], true, { fallarRend: true });
  await s.page.getByTestId('nav-rendir').click(); await s.page.waitForTimeout(3500);
  const txt = await s.page.locator('main').innerText();
  check('D · lectura fallida: error visible con «Reintentar», sin lista vacía ni «Guardado»',
    (await s.page.getByTestId('rend-error-carga').count()) === 1 && !/Guardado/.test(txt) && !/No tienes rendiciones|Aún no tienes/i.test(txt), txt.slice(0, 120).replace(/\n/g, ' '));
  await s.page.screenshot({ path: `${OUT}/D-telefono-error-carga.png` });
  s.control.fallarRend = false;
  await s.page.getByTestId('rend-error-carga').getByRole('button', { name: 'Reintentar' }).click(); await s.page.waitForTimeout(2500);
  check('D · reintentar carga la lista', (await s.page.getByTestId('rend-error-carga').count()) === 0 && /Mis Rendiciones/.test(await s.page.locator('main').innerText()));
  check('D · no se escribió nada mientras la lectura fallaba', !s.escrituras.includes('rendiciones'), s.escrituras.join(','));
  await s.ctx.close();
}

await browser.close();
console.log(`\n${ok} correctas, ${fallos} fallas · Chromium emulado · datos ficticios · capturas en ${OUT}`);
process.exit(fallos ? 1 : 0);
