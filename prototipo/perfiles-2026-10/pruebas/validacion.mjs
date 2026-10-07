/* Validación del prototipo por perfil. EMULADA: Chromium con tamaño de pantalla, toque y
   escala de cada equipo. No es un dispositivo real ni Safari/Firefox (no están instalados).
   Uso: node prototipo/perfiles-2026-10/pruebas/validacion.mjs [carpeta-capturas]          */
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { chromium } from '../../../node_modules/playwright/index.mjs';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const PAGINA = 'file://' + path.join(AQUI, '..', 'index.html');
const OUT = process.argv[2] || null;
if (OUT) fs.mkdirSync(OUT, { recursive: true });
let ok = 0, fallos = 0;
const chk = (n, c, x = '') => { c ? ok++ : fallos++; if (!c) console.log(`✗ ${n}${x ? '  — ' + x : ''}`); };

const EQUIPOS = [
  ['Escritorio Windows 1920', { width: 1920, height: 1080 }, false, 1],
  ['Laptop Mac 1440', { width: 1440, height: 900 }, false, 2],
  ['Laptop Windows 1366', { width: 1366, height: 768 }, false, 1],
  ['iPad vertical', { width: 820, height: 1180 }, true, 2],
  ['iPad horizontal', { width: 1180, height: 820 }, true, 2],
  ['Tablet Android vertical', { width: 800, height: 1280 }, true, 2],
  ['Tablet Android horizontal', { width: 1280, height: 800 }, true, 2],
  ['iPhone 13 vertical', { width: 390, height: 844 }, true, 3],
  ['iPhone 13 horizontal', { width: 844, height: 390 }, true, 3],
  ['Android Pixel 7 vertical', { width: 412, height: 915 }, true, 2.6],
  ['Teléfono 320 (zoom 400%)', { width: 320, height: 640 }, true, 2],
];
const PERSONAS = ['angelo', 'carol', 'michelle', 'milagros', 'personal', 'consulta'];

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
for (const [nom, vp, touch, dpr] of EQUIPOS) {
  const ctx = await b.newContext({ viewport: vp, hasTouch: touch, isMobile: touch && vp.width < 600, deviceScaleFactor: dpr });
  const p = await ctx.newPage();
  const errores = []; p.on('pageerror', e => errores.push(String(e)));
  for (const alt of ['A', 'B']) for (const per of PERSONAS) for (const vista of [alt === 'A' ? 'inicio' : 'bandeja', 'flujo', 'rendiciones']) {
    await p.goto(`${PAGINA}#/${alt}/${per}/${vista}`); await p.waitForTimeout(60);
    await p.evaluate(() => window.dispatchEvent(new HashChangeEvent('hashchange')));
    const r = await p.evaluate((touch) => {
      const de = document.documentElement;
      const desborde = de.scrollWidth - innerWidth;
      const vis = (e) => { const s = getComputedStyle(e), q = e.getBoundingClientRect(); return s.visibility !== 'hidden' && s.display !== 'none' && q.width > 0 && q.height > 0 && q.left >= -1 && !e.closest('.skip'); };
      const chicos = [];
      document.querySelectorAll('a, button, select, input:not([type=file]), [role=button]').forEach(e => {
        if (!vis(e)) return; const q = e.getBoundingClientRect();
        const enTexto = e.tagName === 'A' && e.closest('p') && !e.classList.contains('btn');
        const min = enTexto ? 24 : (touch ? 44 : 24);
        if (q.width < min - 0.5 || q.height < min - 0.5) chicos.push(`${e.tagName}:${(e.textContent || e.getAttribute('aria-label') || '').trim().slice(0, 20)} ${Math.round(q.width)}x${Math.round(q.height)}`);
      });
      const fs = Math.min(...[...document.querySelectorAll('main *')].filter(e => e.childElementCount === 0 && e.textContent.trim() && vis(e)).map(e => parseFloat(getComputedStyle(e).fontSize)));
      return { desborde, chicos, fs };
    }, touch);
    const k = `${nom} · ${alt} · ${per} · ${vista}`;
    chk(`${k}: sin desborde horizontal de página`, r.desborde <= 0, `${r.desborde}px`);
    chk(`${k}: controles ≥ ${touch ? 44 : 24}px`, r.chicos.length === 0, r.chicos.slice(0, 4).join(' | '));
    chk(`${k}: texto ≥ 12px`, r.fs >= 12, `${r.fs}px`);
  }
  // Solapamiento: tabla completa en varias posiciones de desplazamiento
  await p.goto(`${PAGINA}#/A/angelo/flujo`); await p.waitForTimeout(80);
  if (vp.width < 600) { await p.getByRole('button', { name: 'Tabla completa' }).click(); await p.waitForTimeout(80); }
  for (const x of [0, 37, 150, 333, 700, 5000]) {
    const r = await p.evaluate(async (x) => {
      const w = document.querySelector('.tabla-wrap'); w.scrollLeft = x; await new Promise(r => setTimeout(r, 400));
      const c0 = w.querySelector('thead .c0').getBoundingClientRect(), tot = w.querySelector('thead .tot');
      const totSticky = getComputedStyle(tot).position === 'sticky';
      const der = totSticky ? tot.getBoundingClientRect().left : w.getBoundingClientRect().left + w.clientWidth;
      const malos = [];
      w.querySelectorAll('thead th.mes').forEach(th => {
        const q = th.getBoundingClientRect();
        const visible = Math.min(q.right, der) - Math.max(q.left, c0.right);
        if (visible > 1.5 && visible < q.width - 1.5) malos.push(`${th.textContent} ${Math.round(visible)}/${Math.round(q.width)}`);
      });
      const enteras = [...w.querySelectorAll('thead th.mes')].filter(th => { const q = th.getBoundingClientRect(); return q.left >= c0.right - 1.5 && q.right <= der + 1.5; }).length;
      return { malos, enteras, scroll: w.scrollLeft };
    }, x);
    chk(`${nom}: flujo desplazado a ${x}px, ninguna columna cortada`, r.malos.length === 0, r.malos.join(' | '));
    chk(`${nom}: flujo desplazado a ${x}px, al menos 1 mes entero visible`, r.enteras >= 1, String(r.enteras));
  }
  if (OUT) {
    for (const [alt, per, vista, sel] of [['A', 'angelo', 'inicio'], ['B', 'angelo', 'bandeja', 'n40'], ['B', 'carol', 'bandeja'], ['A', 'milagros', 'inicio'], ['A', 'angelo', 'flujo'], ['A', 'personal', 'rendiciones']]) {
      await p.goto(`${PAGINA}#/${alt}/${per}/${vista}${sel ? '/' + sel : ''}`); await p.waitForTimeout(150);
      await p.screenshot({ path: path.join(OUT, `${nom.replace(/[^\w]+/g, '-')}_${alt}_${per}_${vista}${sel ? '_' + sel : ''}.png`), fullPage: false });
    }
  }
  chk(`${nom}: sin errores de página`, errores.length === 0, errores.join(' | '));
  await ctx.close();
}

// Teclado (escritorio): saltar contenido, abrir y cerrar detalle sin mouse, foco de vuelta
{
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  await p.goto(`${PAGINA}#/B/angelo/bandeja`); await p.waitForTimeout(100);
  await p.keyboard.press('Tab');
  chk('Teclado: primer Tab = "Saltar al contenido"', await p.evaluate(() => document.activeElement.className === 'skip'));
  const item = p.locator('[data-abrir="n40"]'); await item.focus(); await p.keyboard.press('Enter'); await p.waitForTimeout(150);
  chk('Teclado: Enter abre el detalle y lleva el foco al título', await p.evaluate(() => document.activeElement.id === 'det-h'));
  await p.keyboard.press('Escape'); await p.waitForTimeout(150);
  chk('Teclado: Esc cierra y devuelve el foco al pendiente', await p.evaluate(() => document.activeElement.dataset.abrir === 'n40'));
  await p.goto(`${PAGINA}#/A/angelo/flujo`); await p.waitForTimeout(100);
  await p.locator('.tabla-wrap').focus(); const x0 = await p.evaluate(() => document.querySelector('.tabla-wrap').scrollLeft);
  await p.keyboard.press('ArrowRight'); await p.keyboard.press('ArrowRight'); await p.waitForTimeout(500);
  chk('Teclado: la tabla se recorre con flechas', await p.evaluate((x0) => document.querySelector('.tabla-wrap').scrollLeft > x0, x0));
  // Permisos simulados: consulta no puede actuar; quien no corresponde no ve el pendiente
  await p.goto(`${PAGINA}#/B/carol/bandeja/n40`); await p.waitForTimeout(100);
  chk('Perfil: Carol no ve la aprobación final (solo admin)', await p.locator('#det-h').count() === 0);
  await p.goto(`${PAGINA}#/B/carol/bandeja/n41`); await p.waitForTimeout(100);
  chk('Perfil: Carol ve "Dar V°B°" en la nómina en revisión', await p.getByRole('button', { name: 'Dar V°B°' }).isEnabled());
  await p.goto(`${PAGINA}#/B/consulta/bandeja`); await p.waitForTimeout(100);
  chk('Perfil: consulta no tiene acciones de aprobación', await p.locator('[data-accion]').count() === 0);
  await p.close();
}

// Contraste WCAG AA (texto 4,5:1; controles 3:1) en claro y oscuro
{
  const p = await b.newPage();
  for (const tema of ['light', 'dark']) {
    await p.goto(`${PAGINA}#/A/angelo/inicio`);
    await p.evaluate((t) => document.documentElement.setAttribute('data-theme', t), tema);
    const r = await p.evaluate(() => {
      const css = getComputedStyle(document.documentElement), v = (n) => css.getPropertyValue(n).trim();
      const lum = (h) => { if (h.length === 4) h = '#' + [...h.slice(1)].map(c => c + c).join(''); const n = parseInt(h.slice(1), 16), c = [n >> 16 & 255, n >> 8 & 255, n & 255].map(x => { x /= 255; return x <= .03928 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4; }); return .2126 * c[0] + .7152 * c[1] + .0722 * c[2]; };
      const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + .05) / (y + .05); };
      const textos = ['--text', '--text-2', '--muted', '--brand', '--red', '--amber', '--green'], fondos = ['--bg', '--surface', '--surface-2', '--brand-soft'];
      const malos = [];
      for (const t of textos) for (const f of fondos) { const q = ratio(v(t), v(f)); if (q < 4.5) malos.push(`${t}/${f} ${q.toFixed(2)}`); }
      for (const [t, f] of [['--red', '--red-soft'], ['--amber', '--amber-soft'], ['--green', '--green-soft']]) { const q = ratio(v(t), v(f)); if (q < 4.5) malos.push(`${t}/${f} ${q.toFixed(2)}`); }
      for (const f of ['--surface', '--bg']) { const q = ratio(v('--border-strong'), v(f)); if (q < 3) malos.push(`borde/${f} ${q.toFixed(2)}`); }
      const q = ratio(v('--surface'), v('--brand')); if (q < 4.5) malos.push(`botón primario ${q.toFixed(2)}`);
      return malos;
    });
    chk(`Contraste AA (${tema})`, r.length === 0, r.join(' | '));
  }
  await p.close();
}
await b.close();
console.log(`\n${ok} correctas, ${fallos} fallas · emulado en Chromium (no dispositivos reales)`);
process.exit(fallos ? 1 : 0);
