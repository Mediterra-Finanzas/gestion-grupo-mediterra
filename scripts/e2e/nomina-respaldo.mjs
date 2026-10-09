/* ─────────────────────────────────────────────────────────────────────────
   E2E EN NAVEGADOR — Respaldo documental por línea de la nómina, visible
   junto a la columna Crédito (hotfix 1943689). App real (build) + Supabase
   falso aislado; Storage (bucket nominas-docs) servido desde memoria con
   context.route. Cualquier otro host externo se bloquea y se cuenta.

   Datos: nómina "borrador" de Allegria Foods de la semana en curso, sección
   "Proveedores / Materiales" con 5 líneas CLP; la primera ya tiene un
   documento activo subido. Un crédito contrato de Allegria Foods con
   vencimientos pendientes (para que "Vincular" tenga opciones).

   Comprueba:
     1. 1322×900 y 1024×900: el botón Respaldo de cada línea está dentro de la
        vista y no tapado (elementFromPoint), SIN desplazar la tabla.
     2. Adjuntar una factura (PDF) por la interfaz a una línea sin crédito:
        "🟢 📎 Ver (1)", cobertura sube, nómina guardada con hash y estado
        activo, sin creditoVinculo.
     3. Ver el documento existente: URL firmada → descarga con los mismos bytes.
     4. Vincular un crédito en otra línea: creditoVinculo guardado, el diálogo
        no queda tapado por la columna fija y el botón Respaldo sigue usable.
   ───────────────────────────────────────────────────────────────────────── */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { nuevoStore, leerFila } from './fake.mjs';
import { abrirApp, login, entrarFinanzas, subTab } from './lib.mjs';

const OUT = process.env.OUT_DIR || '.';
fs.mkdirSync(OUT, { recursive: true });
let fallos = 0;
const check = (n, c, x = '') => { console.log(`${c ? '✓' : '✗ FALLA'}  ${n}${x ? '  — ' + x : ''}`); if (!c) fallos++; };
const foto = (page, n, opts = {}) => page.screenshot({ path: path.join(OUT, `${n}.png`), fullPage: false, ...opts });
const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

// Semana ISO de hoy (igual que la app)
const hoy = new Date();
const t = new Date(Date.UTC(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()));
t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
const semana = Math.ceil((((t - new Date(Date.UTC(t.getUTCFullYear(), 0, 1))) / 86400000) + 1) / 7);
const anio = t.getUTCFullYear();

// PDF mínimo válido
const pdf = (texto) => Buffer.from(`%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 144]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj
4 0 obj<</Length ${44 + texto.length}>>stream
BT /F1 18 Tf 20 70 Td (${texto}) Tj ET
endstream endobj
5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj
trailer<</Root 1 0 R>>
%%EOF
`, 'latin1');

const EMP = 'Allegria Foods';
const FILA = 'nominas_allegria_foods';
const NOM_ID = 'nomAF';
const BYTES_EXISTENTE = pdf('Factura existente 4410');
const PATH_EXISTENTE = `nominas/allegria_foods/${NOM_ID}/it1/doc_seed_factura_4410.pdf`;
const docExistente = { id: 'doc_seed', nombre: 'factura_4410.pdf', path: PATH_EXISTENTE, principal: false, mime: 'application/pdf',
  sizeKB: 1, hash: sha(BYTES_EXISTENTE), subidoPor: 'Michelle', fechaSubida: '2026-10-06T14:00:00.000Z', estado: 'activo', interno: false, voucher: null };
const linea = (id, proveedor, nDoc, concepto, monto, docs = []) => ({ id, seccion: 'proveedores', tipoDoc: 'Factura', proveedor, rut: '76.123.456-7',
  nDoc, fDoc: '2026-10-01', fVenc: '2026-10-31', semVenc: '', concepto, montoCLP: monto, montoUSD: 0, montoPEN: 0, comentario: '',
  pagado: false, anticipo: 0, estadoLinea: 'activa', historial: [], documentos: docs });
const items = [
  linea('it1', 'Ferretería Los Andes', '4410', 'Materiales packing', 1250000, [docExistente]),
  { ...linea('it2', 'Cartones del Maule', '8812', 'Cajas cartón 5kg', 3480000), pagado: true }, // fila pagada (✓, opacidad 0,6)
  linea('it3', 'Transportes Rapel', '221', 'Flete fruta', 890000),
  linea('it4', 'Etiquetas Curicó', '1093', 'Etiquetas exportación', 412500),
  linea('it5', 'Plásticos del Sur', '5567', 'Bolsas y film', 655000),
];
const nomina = { id: NOM_ID, empresa: EMP, semana, año: anio, numero: 1, fecha: hoy.toISOString().slice(0, 10), tc: 950, estado: 'borrador',
  preparadoPor: 'Michelle', revisadoPor: '', aprobadoPor: '', aprobado1Por: '', fechaAprobacion: '', fechaAprobacion1: '',
  items, bancos: {}, notas: '', seccionesExtra: [], estadoNomina: 'activa', historial: [] };
const cred = { uid: 'cr-e2e-af', n: 991, tipo_credito: 'contrato', empresa: EMP, acreedor: 'Banco Respaldo', moneda: 'USD',
  monto: 300000, fecha_desembolso: '2026-06-15', primer_venc: '2026-12-15', vencimiento_final: '2027-06-15',
  periodicidad: 6, modalidad: 'lineal', tasa_tipo: 'fija', tasa_anual: 7, base: 'act360', control_desde: '2026-06-15', pagos: [] };

const store = nuevoStore();
store.finanzas.value.creditos_data = [cred];
store.nominas_v2_done = { value: JSON.stringify({ migrado: true }), updated_at: new Date(Date.now() - 40000).toISOString() };
store[FILA] = { value: JSON.stringify({ empresa: EMP, nominas: [nomina] }), updated_at: new Date(Date.now() - 39000).toISOString() };
const nomServidor = () => leerFila(store, FILA).nominas.find(n => n.id === NOM_ID);

// ── Storage en memoria + bloqueo de hosts externos ─────────────────────
const objetos = new Map([[PATH_EXISTENTE, { bytes: BYTES_EXISTENTE, tipo: 'application/pdf' }]]);
const storageLog = [];
const escapados = [];
const { browser, ctx, page } = await abrirApp(store, { ctxOpts: { viewport: { width: 1322, height: 900 } } });
const SB = 'https://bywovqayuzodbzwsriet.supabase.co/storage/v1';
await ctx.route('**/*', async (route) => {
  const req = route.request();
  const u = new URL(req.url());
  if (u.hostname === '127.0.0.1' || u.protocol === 'data:' || u.protocol === 'blob:') return route.fallback();
  if (u.hostname === 'bywovqayuzodbzwsriet.supabase.co' && u.pathname.startsWith('/storage/v1/')) {
    const cors = { 'access-control-allow-origin': '*' };
    const p = decodeURIComponent(u.pathname.slice('/storage/v1'.length));
    const m = req.method();
    let mm;
    if (m === 'POST' && (mm = p.match(/^\/object\/sign\/nominas-docs\/(.+)$/))) {
      const key = mm[1];
      storageLog.push({ op: 'sign', key, body: req.postData() });
      if (!objetos.has(key)) return route.fulfill({ status: 400, headers: cors, contentType: 'application/json', body: '{"message":"Object not found"}' });
      return route.fulfill({ status: 200, headers: cors, contentType: 'application/json',
        body: JSON.stringify({ signedURL: `/object/sign/nominas-docs/${encodeURI(key)}?token=tok-e2e` }) });
    }
    if (m === 'GET' && (mm = p.match(/^\/object\/sign\/nominas-docs\/(.+)$/))) {
      const key = mm[1]; const o = objetos.get(key);
      storageLog.push({ op: 'get', key, token: u.searchParams.get('token') });
      if (!o || u.searchParams.get('token') !== 'tok-e2e') return route.fulfill({ status: 400, headers: cors, body: 'bad' });
      return route.fulfill({ status: 200, headers: { ...cors, 'content-type': o.tipo }, body: o.bytes });
    }
    if (m === 'POST' && (mm = p.match(/^\/object\/nominas-docs\/(.+)$/))) {
      const key = mm[1]; const bytes = req.postDataBuffer() || Buffer.alloc(0);
      storageLog.push({ op: 'upload', key, size: bytes.length, tipo: req.headers()['content-type'], upsert: req.headers()['x-upsert'] });
      objetos.set(key, { bytes, tipo: req.headers()['content-type'] || 'application/octet-stream' });
      return route.fulfill({ status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify({ Key: `nominas-docs/${key}` }) });
    }
    storageLog.push({ op: 'otro', m, p });
    return route.fulfill({ status: 404, headers: cors, contentType: 'application/json', body: '{"message":"no implementado en la prueba"}' });
  }
  if (u.hostname === 'bywovqayuzodbzwsriet.supabase.co') return route.fallback(); // fake.mjs (PostgREST)
  escapados.push(`${req.method()} ${u.host}${u.pathname}`);
  return route.abort('blockedbyclient');
});

const errores = [];
page.on('pageerror', e => errores.push(String(e)));
page.on('dialog', d => d.accept().catch(() => {}));

await login(page);
await entrarFinanzas(page);
await subTab(page, /Nóminas/);
await page.waitForTimeout(1500);
const abrir = async (textoFila) => {
  const btns = page.getByRole('button', { name: /Editar|Ver/ });
  const n = await btns.count();
  for (let i = 0; i < n; i++) {
    const fila = btns.nth(i).locator('xpath=ancestor::tr[1]');
    if ((await fila.innerText().catch(() => '')).includes(textoFila)) { await btns.nth(i).click(); await page.waitForTimeout(1500); return true; }
  }
  return false;
};
check('Abre la nómina borrador de Allegria Foods', await abrir('Borrador'));
await page.locator('[data-boton-respaldo]').first().waitFor({ timeout: 10000 });

// ── 1. Visibilidad sin desplazar la tabla ───────────────────────────────
const medir = (resetear = true) => page.evaluate(async (resetear) => {
  const out = [];
  if (resetear) document.querySelectorAll('[data-boton-respaldo]').forEach(b => { b.closest('table').parentElement.scrollLeft = 0; });
  const btns = [...document.querySelectorAll('[data-boton-respaldo]')];
  for (const b of btns) {
    const tr = b.closest('tr');
    const prov = [...tr.querySelectorAll('input')].map(i => i.value).find(v => v && /[A-Za-zÁÉÍÓÚáéíóú]{4}/.test(v) && !/Factura/.test(v)) || '';
    // solo desplazamiento VERTICAL de la página; la tabla no se toca
    const r0 = b.getBoundingClientRect();
    window.scrollBy(0, r0.top - window.innerHeight / 2);
    await new Promise(r => setTimeout(r, 50));
    const r = b.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const el = document.elementFromPoint(cx, cy);
    const cont = b.closest('table').parentElement;
    const cr = cont.getBoundingClientRect();
    out.push({ prov, texto: b.innerText.trim(), left: Math.round(r.left), right: Math.round(r.right), top: Math.round(r.top),
      vw: window.innerWidth, vh: window.innerHeight, contLeft: Math.round(cr.left), contRight: Math.round(cr.right),
      scrollLeft: cont.scrollLeft, scrollW: cont.scrollWidth, clientW: cont.clientWidth,
      docOverflow: document.documentElement.scrollWidth - window.innerWidth,
      encima: el ? (b === el || b.contains(el)) : false, encimaDe: el ? `${el.tagName}.${(el.innerText || '').slice(0, 30)}` : null });
  }
  window.scrollTo(0, 0);
  return out;
}, resetear);
const evaluarVista = async (ancho) => {
  await page.setViewportSize({ width: ancho, height: 900 });
  await page.waitForTimeout(600);
  const m = await medir();
  console.log(`  [${ancho}px]`, JSON.stringify(m.map(x => ({ prov: x.prov, texto: x.texto, left: x.left, right: x.right, scrollLeft: x.scrollLeft, scrollW: x.scrollW, clientW: x.clientW, docOverflow: x.docOverflow, encima: x.encima, encimaDe: x.encimaDe }))));
  check(`[${ancho}px] hay 5 botones Respaldo`, m.length === 5, `${m.length}`);
  check(`[${ancho}px] la tabla es más ancha que su contenedor (la columna Crédito sigue presente)`, m.every(x => x.scrollW > x.clientW), `scrollW ${m[0]?.scrollW} > clientW ${m[0]?.clientW}`);
  check(`[${ancho}px] tabla SIN desplazar (scrollLeft = 0)`, m.every(x => x.scrollLeft === 0));
  check(`[${ancho}px] cada botón dentro del viewport y del contenedor`, m.every(x => x.left >= 0 && x.right <= x.vw && x.left >= x.contLeft && x.right <= x.contRight),
    m.map(x => `${x.left}-${x.right}/${x.vw}`).join(' '));
  check(`[${ancho}px] ningún botón tapado (elementFromPoint en su centro)`, m.every(x => x.encima), m.filter(x => !x.encima).map(x => x.encimaDe).join(' | '));
  check(`[${ancho}px] la página no tiene desplazamiento horizontal`, m.every(x => x.docOverflow <= 0), `${m[0]?.docOverflow}px`);
  return m;
};
const m1322 = await evaluarVista(1322);
check('Rótulos iniciales: 1 "🟢 📎 Ver (1)" + 4 "🔴 📎 Adjuntar"',
  m1322.filter(x => x.texto === '🟢 📎 Ver (1)').length === 1 && m1322.filter(x => x.texto === '🔴 📎 Adjuntar').length === 4, m1322.map(x => x.texto).join(' | '));
await evaluarVista(1024);
await page.setViewportSize({ width: 1322, height: 900 });
await page.waitForTimeout(500);
// captura de la tabla a 1322
const tabla = page.locator('[data-boton-respaldo]').first().locator('xpath=ancestor::table[1]/..');
await tabla.evaluate(el => window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 220));
await page.waitForTimeout(300);
await foto(page, 'r01-tabla-1322');
await tabla.screenshot({ path: path.join(OUT, 'r01b-tabla-1322-recorte.png') });

const cobertura = async () => {
  const txt = await page.locator('text=RESPALDO DOCUMENTAL').first().locator('xpath=..').innerText();
  const g = (re) => Number((txt.match(re) || [])[1]);
  return { con: g(/(\d+) con respaldo/), sin: g(/(\d+) sin respaldo/), pct: g(/(\d+)% cobertura/), txt: txt.replace(/\s+/g, ' ') };
};
const cob0 = await cobertura();
check('Cobertura inicial 1 con / 4 sin / 20%', cob0.con === 1 && cob0.sin === 4 && cob0.pct === 20, cob0.txt);

// cerrar el modal de documentos con un clic en el fondo (onClick=onClose); el "×"
// de las filas inactivaría una línea, así que no se usa un selector por texto.
const cerrarModal = async () => { await page.mouse.click(4, 450); await page.waitForTimeout(400);
  check('Modal de documentos cerrado', await page.getByText('Documentos de respaldo').count() === 0); };
const botonDe = (prov) => page.locator('tr', { has: page.locator(`input[value="${prov}"]`) }).locator('[data-boton-respaldo]');

// ── 2. Adjuntar factura a una línea normal, sin crédito ─────────────────
const PDF_NUEVO = pdf('Factura 8812 Cartones del Maule');
await botonDe('Cartones del Maule').click();
await page.getByText('Documentos de respaldo').waitFor({ timeout: 5000 });
await foto(page, 'r02-modal-adjuntar');
await page.locator('input[type=file]').setInputFiles({ name: 'factura_8812.pdf', mimeType: 'application/pdf', buffer: PDF_NUEVO });
await page.getByText('🟢 Con respaldo (1)').waitFor({ timeout: 8000 });
await foto(page, 'r03-modal-subido');
await cerrarModal();
await page.waitForTimeout(3500); // debounce del guardado
await foto(page, 'r04-tras-adjuntar');
const up = storageLog.find(s => s.op === 'upload');
check('Subida al bucket nominas-docs (POST /object/nominas-docs/…)', !!up && up.key.startsWith(`nominas/allegria_foods/${NOM_ID}/it2/`) && up.size === PDF_NUEVO.length,
  up ? `${up.key} · ${up.size} B · ${up.tipo} · x-upsert ${up.upsert}` : 'sin subida');
check('La línea muestra "🟢 📎 Ver (1)"', (await botonDe('Cartones del Maule').innerText()).trim() === '🟢 📎 Ver (1)', await botonDe('Cartones del Maule').innerText());
const cob1 = await cobertura();
check('Cobertura sube a 2 con / 3 sin / 40%', cob1.con === 2 && cob1.sin === 3 && cob1.pct === 40, cob1.txt);
const l2 = nomServidor().items.find(i => i.id === 'it2');
const d2 = (l2.documentos || [])[0];
check('Guardado en el store: documento con hash SHA-256 correcto y estado activo', !!d2 && d2.estado === 'activo' && d2.hash === sha(PDF_NUEVO) && d2.path === up?.key,
  d2 ? `hash ${d2.hash?.slice(0, 16)}… estado ${d2.estado} path ${d2.path}` : 'sin documento');
check('Guardado: la línea NO tiene creditoVinculo', l2.creditoVinculo == null);
check('Historial de la línea registra doc_adjuntado', (l2.historial || []).some(h => h.accion === 'doc_adjuntado' && h.detalle === 'factura_8812.pdf'));

// ── 3. Ver / descargar el documento existente ───────────────────────────
await botonDe('Ferretería Los Andes').click();
await page.getByText('Documentos de respaldo').waitFor({ timeout: 5000 });
const popupP = ctx.waitForEvent('page', { timeout: 10000 }).catch(() => null);
await page.getByRole('button', { name: 'Ver', exact: true }).first().click();
const popup = await popupP;
await page.waitForTimeout(1500);
const firma = storageLog.find(s => s.op === 'sign');
check('Pide URL firmada del documento (POST /object/sign/nominas-docs/…)', !!firma && firma.key === PATH_EXISTENTE && /expiresIn/.test(firma.body || ''),
  firma ? `${firma.key} · ${firma.body}` : 'sin firma');
const urlPopup = popup ? popup.url() : '';
check('Abre la URL firmada en una pestaña nueva', /\/storage\/v1\/object\/sign\/nominas-docs\/.+\?token=tok-e2e/.test(urlPopup), urlPopup);
const get = storageLog.find(s => s.op === 'get');
check('La pestaña descarga el objeto con el token', !!get && get.key === PATH_EXISTENTE, get ? JSON.stringify(get) : 'sin GET');
const bajados = urlPopup ? await page.evaluate(async (u) => Array.from(new Uint8Array(await (await fetch(u)).arrayBuffer())), urlPopup) : [];
check('Bytes descargados = bytes del documento existente (SHA-256)', sha(Buffer.from(bajados)) === docExistente.hash, `${bajados.length} B`);
if (popup) await popup.close().catch(() => {});
await cerrarModal();

// ── 4a. Fila pagada: el diálogo Vincular no queda tapado ─────────────────
const filaP = page.locator('tr', { has: page.locator('input[value="Cartones del Maule"]') });
check('La fila Cartones del Maule está marcada pagada (✓)', (await filaP.getByRole('button', { name: '✓' }).count()) === 1);
await filaP.getByRole('button', { name: /🏦 Vincular/ }).click();
await page.waitForTimeout(400);
const dlgP = await page.evaluate(() => {
  const s = [...document.querySelectorAll('select')].find(x => /elegir vencimiento pendiente/.test(x.innerText));
  if (!s) return null;
  const dlg = s.parentElement; const r = dlg.getBoundingClientRect();
  const en = (el) => { const q = el.getBoundingClientRect(); const e = document.elementFromPoint(q.left + q.width / 2, q.top + q.height / 2); return { ok: e === el || el.contains(e), de: e ? `${e.tagName}${e.closest('[data-col-respaldo]') ? '[celda Respaldo]' : ''}.${(e.innerText || '').slice(0, 25)}` : null }; };
  const btns = [...dlg.querySelectorAll('button')];
  const pts = [[r.left + 5, r.top + 5], [r.right - 5, r.top + 5], [r.right - 5, r.bottom - 5], [r.left + 5, r.bottom - 5], [r.left + r.width / 2, r.top + r.height / 2]];
  return { dentroDeTabla: !!s.closest('table'), visible: r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth,
    esquinasTapadas: pts.filter(([x, y]) => { const e = document.elementFromPoint(x, y); return !(e && dlg.contains(e)); }).length,
    // con el diálogo abierto, el fondo oscuro debe cubrir TODA la página: ninguna celda fija
    // Respaldo puede quedar por encima del overlay (y ser clicable detrás del diálogo)
    respaldoPorEncima: [...document.querySelectorAll('[data-boton-respaldo]')].filter(b => { const q = b.getBoundingClientRect();
      if (q.bottom < 0 || q.top > innerHeight) return false; const e = document.elementFromPoint(q.left + q.width / 2, q.top + q.height / 2); return !!(e && e.closest('[data-col-respaldo]')); }).length,
    cancelar: en(btns.find(b => b.innerText.trim() === 'Cancelar')), vincular: en(btns.find(b => b.innerText.trim() === 'Vincular')), select: en(s) };
});
console.log('  [fila pagada · diálogo]', JSON.stringify(dlgP));
await foto(page, 'r05a-vincular-fila-pagada');
check('Fila pagada: el diálogo Vincular se abre fuera de la tabla (portal)', dlgP && !dlgP.dentroDeTabla);
check('Fila pagada: diálogo entero dentro de la vista y sin esquinas tapadas', dlgP && dlgP.visible && dlgP.esquinasTapadas === 0, dlgP && `${dlgP.esquinasTapadas} tapadas`);
check('Fila pagada: elementFromPoint en "Cancelar", "Vincular" y el selector devuelve el propio control', dlgP && dlgP.cancelar.ok && dlgP.vincular.ok && dlgP.select.ok,
  dlgP && `${dlgP.cancelar.de} / ${dlgP.vincular.de} / ${dlgP.select.de}`);
check('Fila pagada: el fondo del diálogo cubre las celdas fijas Respaldo (ninguna queda encima ni clicable)', dlgP && dlgP.respaldoPorEncima === 0, dlgP && `${dlgP.respaldoPorEncima} celdas por encima`);
await page.getByRole('button', { name: /^Cancelar$/ }).click();
await page.waitForTimeout(400);
check('Fila pagada: Cancelar cierra el diálogo sin vincular', (await page.locator('select').filter({ hasText: 'elegir vencimiento pendiente' }).count()) === 0);

// ── 4b. Con la tabla desplazada a la derecha, la columna fija sigue encima
await page.evaluate(() => { const c = document.querySelector('[data-boton-respaldo]').closest('table').parentElement; c.scrollLeft = c.scrollWidth; });
await page.waitForTimeout(300);
const mS = await medir(false);
check('Tabla desplazada al final: los 5 botones Respaldo siguen visibles y no tapados', mS.length === 5 && mS.every(x => x.encima && x.right <= x.contRight && x.scrollLeft > 0),
  mS.map(x => `${x.prov}:${x.scrollLeft}:${x.encima}`).join(' '));
await tabla.evaluate(el => window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 220));
await page.waitForTimeout(200);
await tabla.screenshot({ path: path.join(OUT, 'r04b-tabla-desplazada.png') });
await page.evaluate(() => { document.querySelector('[data-boton-respaldo]').closest('table').parentElement.scrollLeft = 0; });

// ── 4. Vincular un crédito en otra línea ────────────────────────────────
const filaT = page.locator('tr', { has: page.locator('input[value="Transportes Rapel"]') });
await filaT.getByRole('button', { name: /🏦 Vincular/ }).click();
await page.waitForTimeout(400);
const sel = page.locator('select').filter({ hasText: 'elegir vencimiento pendiente' }).first();
const nOpc = await sel.locator('option').count();
check('Vincular ofrece vencimientos de Allegria Foods', nOpc > 1, `${nOpc - 1} opciones`);
const tapado = await sel.evaluate(s => {
  const dlg = s.parentElement; const r = dlg.getBoundingClientRect();
  const pts = [[r.left + 5, r.top + 5], [r.right - 5, r.top + 5], [r.right - 5, r.bottom - 5], [r.left + 5, r.bottom - 5], [r.left + r.width / 2, r.top + r.height / 2]];
  return pts.filter(([x, y]) => { const e = document.elementFromPoint(x, y); return !(e && dlg.contains(e)); }).length;
});
check('El diálogo Vincular no queda tapado por la columna fija Respaldo', tapado === 0, `${tapado} esquinas tapadas`);
const vincBtn = page.getByRole('button', { name: /^Vincular$/ });
await sel.selectOption(await sel.locator('option').nth(1).getAttribute('value'));
await foto(page, 'r05-vincular-dialogo');
const vbEnc = await vincBtn.evaluate(b => { const r = b.getBoundingClientRect(); const e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return e === b || b.contains(e); });
check('Botón "Vincular" del diálogo clicable (no tapado)', vbEnc);
await vincBtn.click();
await page.waitForTimeout(3500);
await foto(page, 'r06-vinculada');
const l3 = nomServidor().items.find(i => i.id === 'it3');
check('creditoVinculo guardado en la línea', l3.creditoVinculo?.uid === cred.uid && /^cr-e2e-af@/.test(l3.creditoVinculo?.vencKey || ''), JSON.stringify(l3.creditoVinculo || null));
check('Vincular no tocó los documentos de la línea', (l3.documentos || []).length === 0);
const credG = (leerFila(store, 'finanzas').creditos_data || []).find(c => c.uid === cred.uid);
check('Vincular no registró pagos en el crédito', (credG.pagos || []).length === 0);
// Playwright desplazó la tabla para alcanzar "🏦 Vincular" (la columna Crédito queda
// a la derecha del ancho visible); se vuelve a 0 antes de medir.
const mV = (await medir()).find(x => x.prov === 'Transportes Rapel');
check('[1322px] línea vinculada: botón Respaldo visible y no tapado sin desplazar la tabla', mV && mV.encima && mV.right <= mV.vw && mV.scrollLeft === 0, JSON.stringify(mV));
await botonDe('Transportes Rapel').click();
check('Botón Respaldo de la línea vinculada abre el modal', await page.getByText('Documentos de respaldo').isVisible().catch(() => false));
await foto(page, 'r07-respaldo-linea-vinculada');
await cerrarModal();

// Todo host externo se aborta en el route: ninguno se alcanza. Se informan los intentos.
check('Ningún host externo alcanzado (intentos bloqueados en la prueba)', true, escapados.length ? `bloqueados: ${[...new Set(escapados)].join(', ')}` : 'sin intentos');
check('Sin errores de JavaScript', errores.length === 0, errores.slice(0, 2).join(' | '));
fs.writeFileSync(path.join(OUT, 'storage-log.json'), JSON.stringify({ storageLog, escapados }, null, 2));
await browser.close();
console.log(fallos ? `\n${fallos} FALLA(S)` : '\nE2E Respaldo por línea OK');
process.exit(fallos ? 1 : 0);
