/* ─────────────────────────────────────────────────────────────────────────
   MÓDULOS EN TELÉFONO Y TABLET dentro de la navegación nueva (rama de diseño).
   Navegador, Supabase falso, datos FICTICIOS (semilla-diseno.mjs), perfil CFO
   (ve todos los módulos). Por pantalla mide:
     · desborde horizontal de la página (px);
     · elementos fijos del módulo que la barra inferior tapa o que tapan la barra;
     · si el último control de la página queda alcanzable sobre la barra;
     · texto visible de menos de 12 px y controles de menos de 32 px de alto.
   Además: un modal de prueba con la prioridad más baja de los módulos (199) debe
   quedar SOBRE la barra inferior.
   Uso: APP_URL=http://127.0.0.1:4197 OUT_DIR=/tmp/movil node scripts/e2e/modulos-movil.mjs
   ───────────────────────────────────────────────────────────────────────── */
import fs from 'fs';
import { instalarFake, PIN } from './fake.mjs';
import { storeDiseno } from '../vista-previa/semilla-diseno.mjs';
import { chromium } from '/home/user/gestion-grupo-mediterra/node_modules/playwright/index.mjs';

const OUT = process.env.OUT_DIR || '/tmp/movil';
fs.mkdirSync(OUT, { recursive: true });
let ok = 0, fallos = 0;
const check = (n, c, x = '') => { c ? ok++ : fallos++; console.log(`${c ? '✓' : '✗ FALLA'}  ${n}${x ? '  — ' + x : ''}`); };
const TAM = { telefono: [390, 844], tablet: [834, 1112] };
const MODULOS = ['tareas', 'osiris', 'finanzas', 'allegria', 'frisku', 'contabilidad', 'allegria_service'];
const TABS_FIN = ['📊 Dashboard', '📈 Flujo Empresas', '🏦 Saldos Bancos', '💳 Créditos', '📋 Nóminas', '📅 Reporte Semanal', '🔍 Auditoría', '📑 EEFF', '🧾 Rendiciones'];

const medir = () => {
  const W = innerWidth, H = innerHeight;
  const nav = document.querySelector('[data-testid="nav-inferior"]');
  const navTop = nav ? nav.getBoundingClientRect().top : H;
  const fuera = (e) => e.closest('[data-testid="nav-inferior"],[data-testid="panel-mas"],[data-testid="nav-riel"],#vp-barra,#vp-etiqueta');
  const visible = (e) => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0; };
  const desc = (e) => `${e.tagName.toLowerCase()}«${(e.innerText || e.value || '').trim().replace(/\s+/g, ' ').slice(0, 40)}»`;
  const todos = [...document.querySelectorAll('body *')];
  const fijos = todos.filter(e => getComputedStyle(e).position === 'fixed' && !fuera(e) && visible(e))
    .filter(e => { const r = e.getBoundingClientRect(); return r.bottom > navTop + 1 && r.top < H; })
    .map(e => ({ d: desc(e), z: getComputedStyle(e).zIndex }));
  // Desborde: elementos que salen por la derecha sin un contenedor con desplazamiento propio.
  const conScroll = (e) => { for (let p = e.parentElement; p && p !== document.body; p = p.parentElement) { const o = getComputedStyle(p).overflowX; if (o === 'auto' || o === 'scroll' || o === 'hidden') return true; } return false; };
  const anchos = todos.filter(e => !fuera(e) && visible(e) && e.getBoundingClientRect().right > W + 1 && !conScroll(e)).slice(0, 4).map(e => `${desc(e)} ${Math.round(e.getBoundingClientRect().right - W)}px`);
  const textoChico = todos.filter(e => !fuera(e) && visible(e) && [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()) && parseFloat(getComputedStyle(e).fontSize) < 12);
  const controles = todos.filter(e => !fuera(e) && visible(e) && /^(BUTTON|SELECT|INPUT)$/.test(e.tagName) && e.type !== 'hidden' && e.type !== 'checkbox' && e.type !== 'radio');
  // Texto RECORTADO: un elemento con texto propio cuyo contenido no cabe y queda
  // escondido (overflow hidden/clip, o ellipsis). Con cifras es grave: se lee mal.
  const recortados = todos.filter(e => !fuera(e) && visible(e) && [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()))
    .filter(e => { const cs = getComputedStyle(e);
      const escondeX = /hidden|clip/.test(cs.overflowX) || cs.textOverflow === 'ellipsis';
      const sobra = e.scrollWidth > e.clientWidth + 1;
      // o el texto se sale de un ancestro que lo esconde
      let anc = e.parentElement, cortaAnc = false; const r = e.getBoundingClientRect();
      for (; anc && anc !== document.body; anc = anc.parentElement) { const ca = getComputedStyle(anc); if (/auto|scroll/.test(ca.overflowX)) break; if (/hidden|clip/.test(ca.overflowX)) { const ra = anc.getBoundingClientRect(); if (r.right > ra.right + 1 || sobra) cortaAnc = true; break; } }
      return (escondeX && sobra) || cortaAnc; })
    .map(e => ({ t: (e.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 30), cifra: /\d/.test(e.innerText || '') }));
  return {
    recortados: recortados.slice(0, 8), recortadosN: recortados.length, recortadasCifras: recortados.filter(x => x.cifra).length,
    // DD8: texto HTML (fuera de gráficos SVG) bajo 11 px dentro de Finanzas.
    finanzasMenor11: todos.filter(e => e.closest('.mdt-finanzas') && !e.closest('svg') && !fuera(e) && visible(e) && [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()) && parseFloat(getComputedStyle(e).fontSize) < 11).slice(0, 5).map(e => `${desc(e)} ${getComputedStyle(e).fontSize}`),
    controlesMenor36: controles.filter(e => e.getBoundingClientRect().height < 35.5).length,
    tactil: matchMedia('(pointer: coarse)').matches,
    dupNavVisibles: [...document.querySelectorAll('.mdt-dup-nav')].filter(e => e.getBoundingClientRect().height > 0).length,
    dupNavTotal: document.querySelectorAll('.mdt-dup-nav').length,
    desborde: document.documentElement.scrollWidth - W, anchos, fijos,
    textoChico: textoChico.length, textoMin: textoChico.length ? Math.min(...textoChico.map(e => parseFloat(getComputedStyle(e).fontSize))) : null,
    controlesChicos: controles.filter(e => e.getBoundingClientRect().height < 32).length, controles: controles.length,
  };
};
const alcanceFinal = () => {
  window.scrollTo(0, document.documentElement.scrollHeight);
  const nav = document.querySelector('[data-testid="nav-inferior"]');
  const navTop = nav ? nav.getBoundingClientRect().top : innerHeight;
  const bs = [...document.querySelectorAll('main button, main input, main select')].filter(e => { const r = e.getBoundingClientRect(); return r.height > 0 && getComputedStyle(e).visibility !== 'hidden'; });
  if (!bs.length) return { ok: true, ultimo: null };
  const ult = bs.reduce((a, b) => a.getBoundingClientRect().bottom > b.getBoundingClientRect().bottom ? a : b);
  const r = ult.getBoundingClientRect();
  return { ok: r.bottom <= navTop + 1, ultimo: `${(ult.innerText || ult.value || ult.tagName).trim().slice(0, 30)} (${Math.round(r.bottom)} vs barra ${Math.round(navTop)})` };
};

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const filas = [];
for (const [tam, [w, h]] of Object.entries(TAM)) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, timezoneId: 'America/Santiago', deviceScaleFactor: 2, hasTouch: true, isMobile: tam === 'telefono' });
  await instalarFake(ctx, Object.assign(storeDiseno(), { __dialogosApp: true }));
  await ctx.route(/open\.er-api\.com|mindicador\.cl|frankfurter\.app|emailjs/, r => r.abort());
  await ctx.route(/\/rest\/v1\/(?!calendario_data)[a-z_]+/, r => r.request().method() === 'GET' ? r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }) : r.abort());
  await ctx.routeWebSocket(/realtime\/v1\/websocket/, () => {});
  const page = await ctx.newPage();
  const errores = []; page.on('pageerror', e => errores.push(String(e).slice(0, 160)));
  page.on('dialog', d => d.dismiss().catch(() => {}));
  await page.goto(process.env.APP_URL);
  await page.locator('input[type=email]').fill('ahuerta@grupomediterra.cl'); await page.locator('input[type=password]').fill(PIN); await page.keyboard.press('Enter');
  await page.getByTestId('inicio').waitFor({ timeout: 20000 });
  for (const t of ['Entendido', 'Aceptar']) { const b = page.getByRole('button', { name: t }); if (await b.count()) await b.first().click().catch(() => {}); }

  const abrir = async (id) => {
    if (tam === 'telefono') { await page.getByTestId('nav-mas').click(); await page.getByTestId(`mas-modulo-${id}`).click(); }
    else await page.getByTestId(`nav-modulo-${id}`).click();
    await page.waitForTimeout(id === 'finanzas' ? 4000 : 2500);
    for (const t of ['Entendido', 'Aceptar']) { const b = page.getByRole('button', { name: t }); if (await b.count()) await b.first().click().catch(() => {}); }
  };
  const registrar = async (pantalla) => {
    await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(300);
    const m = await page.evaluate(medir);
    await page.screenshot({ path: `${OUT}/${tam}-${pantalla}.png` });
    const a = await page.evaluate(alcanceFinal); await page.waitForTimeout(200);
    await page.screenshot({ path: `${OUT}/${tam}-${pantalla}-final.png` });
    filas.push({ tam, pantalla, ...m, alcanzable: a.ok, ultimo: a.ultimo });
  };

  for (const id of MODULOS) {
    await abrir(id);
    if (id === 'finanzas') {
      for (const t of TABS_FIN) {
        const b = page.locator('main').getByRole('button', { name: t, exact: true });
        if (!(await b.count())) { filas.push({ tam, pantalla: `finanzas · ${t}`, ausente: true }); continue; }
        await b.first().click(); await page.waitForTimeout(1800);
        await registrar(`finanzas-${t.split(' ').slice(1).join('_')}`);
        if (t === '🏦 Saldos Bancos' && tam === 'tablet') {
          const r = await page.evaluate(() => { const th = [...document.querySelectorAll('th')].find(x => x.innerText.trim().toLowerCase() === 'fecha');
            if (!th) return null; const c = th.closest('table').parentElement; return { th: Math.round(th.getBoundingClientRect().right), c: Math.round(c.getBoundingClientRect().right) }; });
          check('Tablet · Saldos Bancos: la columna Fecha se ve sin desplazar la tabla (DD7)', r && r.th <= r.c + 1, JSON.stringify(r));
        }
        if (t === '📊 Dashboard') check(`${tam} · Finanzas: el CFO ve el marcador de versión (DD10)`, (await page.getByTestId('marcador-build').count()) === 1);
      }
    } else await registrar(id);
  }

  // Modal de prueba con la prioridad más baja que usan los módulos (EEFF: 199).
  if (tam === 'telefono') {
    const encima = await page.evaluate(() => {
      const d = document.createElement('div'); d.id = 'modal-prueba';
      d.style.cssText = 'position:fixed;inset:0;z-index:199;background:rgba(0,0,0,.4)';
      document.body.appendChild(d);
      const x = innerWidth / 2, y = innerHeight - 20;
      const e = document.elementFromPoint(x, y); d.remove();
      return e && e.id === 'modal-prueba';
    });
    check('Teléfono: un modal de prioridad 199 queda sobre la barra inferior', encima);
  }
  check(`${tam}: sin errores de página al recorrer los módulos`, errores.length === 0, errores.slice(0, 2).join(' | '));
  await ctx.close();
}
for (const f of filas.filter(f => !f.ausente)) {
  check(`${f.tam} · ${f.pantalla}: ningún elemento fijo del módulo bajo la barra inferior`, !f.fijos.length, f.fijos.map(x => `${x.d} z=${x.z}`).join(', '));
  check(`${f.tam} · ${f.pantalla}: el último control queda sobre la barra`, f.alcanzable, f.ultimo || '');
  if (f.pantalla.startsWith('finanzas')) check(`${f.tam} · ${f.pantalla}: sin texto bajo 11 px en Finanzas (DD8)`, !f.finanzasMenor11.length, f.finanzasMenor11.join(', '));
  if (f.dupNavTotal) check(`${f.tam} · ${f.pantalla}: «Volver/Salir» del encabezado ${f.tam === 'telefono' ? 'escondidos' : 'visibles'} (DD11)`, f.tam === 'telefono' ? f.dupNavVisibles === 0 : f.dupNavVisibles > 0, `${f.dupNavVisibles}/${f.dupNavTotal}`);
  check(`${f.tam} · ${f.pantalla}: pantalla táctil reconocida (DD9)`, f.tactil);
  check(`${f.tam} · ${f.pantalla}: ninguna cifra recortada`, !f.recortadasCifras, f.recortados.filter(x => x.cifra).map(x => x.t).join(' | '));
}
fs.writeFileSync(`${OUT}/medicion.json`, JSON.stringify(filas, null, 1));
// ── Computador (mouse, 1440 px): nada de DD8/DD9/DD11 debe aplicarse ──
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await instalarFake(ctx, Object.assign(storeDiseno(), { __dialogosApp: true }));
  await ctx.routeWebSocket(/realtime\/v1\/websocket/, () => {});
  const page = await ctx.newPage();
  await page.goto(process.env.APP_URL);
  await page.locator('input[type=email]').fill('ahuerta@grupomediterra.cl'); await page.locator('input[type=password]').fill(PIN); await page.keyboard.press('Enter');
  await page.getByTestId('inicio').waitFor({ timeout: 20000 });
  await page.getByTestId('nav-modulo-finanzas').click(); await page.waitForTimeout(4000);
  await page.locator('main').getByRole('button', { name: '💳 Créditos', exact: true }).first().click(); await page.waitForTimeout(1800);
  const d = await page.evaluate(() => ({
    tactil: matchMedia('(pointer: coarse)').matches,
    chico: [...document.querySelectorAll('.mdt-finanzas [style*="font-size: 9px"]')].filter(e => !e.closest('svg')).map(e => getComputedStyle(e).fontSize).slice(0, 3),
    dup: [...document.querySelectorAll('.mdt-dup-nav')].filter(e => e.getBoundingClientRect().height > 0).length,
  }));
  check('Computador: sin regla táctil (mouse)', !d.tactil);
  check('Computador: los textos de 9 px de Finanzas siguen en 9 px (DD8 solo ≤ 1023 px)', d.chico.length > 0 && d.chico.every(x => x === '9px'), d.chico.join(','));
  check('Computador: «Volver/Salir» del encabezado siguen visibles', d.dup > 0, String(d.dup));
  await ctx.close();
}
await browser.close();

console.log('\nPantalla | desborde px | recortados (con cifras) | texto <12px (mín) | controles <32px | elementos que desbordan');
for (const f of filas) console.log(f.ausente ? `${f.tam} · ${f.pantalla}: pestaña no encontrada`
  : `${f.tam} · ${f.pantalla} | ${f.desborde} | ${f.recortadosN} (${f.recortadasCifras}) | ${f.textoChico} (${f.textoMin ?? '-'}) | ${f.controlesChicos}/${f.controles} | ${f.anchos.join('; ')}`);
console.log(`\n${ok} correctas, ${fallos} fallas · datos ficticios · capturas en ${OUT}`);
process.exit(fallos ? 1 : 0);
