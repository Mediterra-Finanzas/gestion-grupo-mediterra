/* ─────────────────────────────────────────────────────────────────────────
   Impacto del cambio de renovaciones sobre un RESPALDO (solo lectura, local).

     node scripts/impacto/renovaciones.mjs <backup_mediterra_AAAA-MM-DD.json> [salida_dir]
       BASE=origin/main   código anterior (lo que corre hoy en producción)
       HOY=2026-10-15     fecha de corte del cálculo

   No se conecta a ninguna base ni escribe en el respaldo. Compara, crédito por
   crédito, el cálculo del código BASE con el del árbol actual:
     · cuotas de cada renovación (fecha, capital, interés);
     · líneas del flujo que tocan Créditos: "Pago Préstamos - Total",
       "Renovaciones", "Ingreso Renovación" e "Ingresos Financiamiento", mes a mes.
   Lista SOLO las renovaciones (y créditos) cuyo cálculo cambia, con la diferencia.
   El "Ingreso Renovación" se arma igual que cada versión de FinanzasModule
   (calcIngresoRenovacionEmpresa); el resto sale directo de creditos.js.
   ───────────────────────────────────────────────────────────────────────── */
import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import { execFileSync } from 'child_process';
import { fileURLToPath, pathToFileURL } from 'url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, '../..');
const [archivo, salidaDir] = process.argv.slice(2);
if (!archivo) { console.error('Uso: node scripts/impacto/renovaciones.mjs <respaldo.json> [salida_dir]'); process.exit(2); }
const BASE = process.env.BASE || 'origin/main';
const HOY = process.env.HOY || new Date().toISOString().slice(0, 10);

// ── Respaldo ───────────────────────────────────────────────────────────
const texto = fs.readFileSync(archivo, 'utf8');
const sha = crypto.createHash('sha256').update(texto).digest('hex');
const resp = JSON.parse(texto);
const filaFin = resp.tablas ? resp.tablas.finanzas : resp.finanzas;
let blob = filaFin && (filaFin.data !== undefined ? filaFin.data : filaFin.value !== undefined ? filaFin.value : filaFin);
if (typeof blob === 'string') blob = JSON.parse(blob);
const creditos = (blob && Array.isArray(blob.creditos_data)) ? blob.creditos_data : null;
if (!creditos) { console.error('El respaldo no trae finanzas.creditos_data.'); process.exit(2); }

// ── Las dos versiones del modelo ───────────────────────────────────────
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'impacto-ren-'));
const dirBase = path.join(tmp, 'base'); fs.mkdirSync(dirBase);
for (const f of ['creditos.js', 'creditoSocio.js'])
  fs.writeFileSync(path.join(dirBase, f.replace('.js', '.mjs')),
    execFileSync('git', ['show', `${BASE}:src/${f}`], { cwd: RAIZ, encoding: 'utf8' }).replace("'./creditoSocio.js'", "'./creditoSocio.mjs'"));
const dirNuevo = path.join(tmp, 'nuevo'); fs.mkdirSync(dirNuevo);
for (const f of ['creditos.js', 'creditoSocio.js'])
  fs.writeFileSync(path.join(dirNuevo, f.replace('.js', '.mjs')),
    fs.readFileSync(path.join(RAIZ, 'src', f), 'utf8').replace("'./creditoSocio.js'", "'./creditoSocio.mjs'"));
const shaBase = execFileSync('git', ['rev-parse', '--short', BASE], { cwd: RAIZ, encoding: 'utf8' }).trim();
const shaNuevo = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: RAIZ, encoding: 'utf8' }).trim();
const sucio = execFileSync('git', ['status', '--porcelain', 'src/creditos.js', 'src/creditoSocio.js'], { cwd: RAIZ, encoding: 'utf8' }).trim();
const A = await import(pathToFileURL(path.join(dirBase, 'creditos.mjs')));
const N = await import(pathToFileURL(path.join(dirNuevo, 'creditos.mjs')));

// Horizonte del flujo: Apr-26 = índice 0, 63 meses (igual que FinanzasModule).
const NM = 63;
const MESES = Array.from({ length: NM }, (_, i) => { const y = 2026 + Math.floor((i + 3) / 12), m = (i + 3) % 12 + 1; return `${y}-${String(m).padStart(2, '0')}`; });
const ubicar = (iso) => { const [y, m, d] = String(iso).split('-').map(Number); const idx = (y - 2026) * 12 + (m - 4); return { idx: idx >= 0 && idx < NM ? idx : -1, semIdx: Math.min(3, Math.floor((d - 1) / 7)) }; };
const MES_ABR_NUM = { Ene: 1, Feb: 2, Mar: 3, Abr: 4, May: 5, Jun: 6, Jul: 7, Ago: 8, Sep: 9, Oct: 10, Nov: 11, Dic: 12 };
const Z = () => Array(NM).fill(0);
const r2 = (x) => Math.round((Number(x) || 0) * 100) / 100;
const $ = (x) => (Number(x) || 0).toLocaleString('es-CL', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

// "Ingreso Renovación" tal como lo arma cada versión de FinanzasModule.
function ingresoBase(emp, cs) {           // main: c.renovable, monto bruto (sin TC), sin mirar anulados
  const arr = Z();
  cs.filter(c => c && c.empresa === emp && c.renovable).forEach(c => A.getRenovaciones(c).forEach(ren => {
    if (!ren.monto || !ren.mes_ingreso || !ren.anio_ingreso) return;
    const i = ubicar(`${ren.anio_ingreso}-${String(MES_ABR_NUM[ren.mes_ingreso] || 0).padStart(2, '0')}-01`).idx;
    if (i >= 0) arr[i] += Number(ren.monto) || 0;
  }));
  return arr;
}
function ingresoNuevo(emp, cs) {
  const arr = Z();
  cs.filter(c => c && c.empresa === emp).forEach(c => {
    (N.ingresosRenovacionFlujo ? N.ingresosRenovacionFlujo(c) : N.ingresosRenovacion(c).map(x => ({ ...x, usd: x.monto * (N.factorUSD(c) || 0) })))
      .forEach(x => { const i = ubicar(x.fecha).idx; if (i >= 0) arr[i] += x.usd; });
  });
  return arr;
}

const empresas = [...new Set(creditos.map(c => c && c.empresa).filter(Boolean))].sort();
const lineas = (M, emp, cs, ingreso) => {
  const f = M.flujoCreditosEmpresa(emp, cs, { hoy: HOY, ubicar, nMeses: NM });
  return { 'Pago Préstamos - Total': f.prestamos.total, 'Renovaciones': f.renovaciones.total,
    'Ingreso Renovación': ingreso(emp, cs), 'Ingresos Financiamiento': f.ingresos.total };
};
const difMeses = (a, b) => a.map((x, i) => ({ mes: MESES[i], antes: r2(x), despues: r2(b[i]), dif: r2(b[i] - x) })).filter(d => Math.abs(d.dif) > 0.005);

// ── Por crédito: aislar su efecto ──────────────────────────────────────
const uidDe = (c, i) => (c && c.uid) || `n${c && c.n}#${i}`;
const filasRen = [], creditosConCambio = [];
creditos.forEach((c, i) => {
  if (!c || !c.empresa) return;
  const solo = [c];
  const LA = lineas(A, c.empresa, solo, ingresoBase), LN = lineas(N, c.empresa, solo, ingresoNuevo);
  const efecto = {};
  Object.keys(LA).forEach(k => { const d = difMeses(LA[k], LN[k]); if (d.length) efecto[k] = d; });
  const rensA = c.renovable ? A.getRenovaciones(c) : [], rensN = c.renovable ? N.getRenovaciones(c) : [];
  let vA = [], vN = [];
  try { vA = A.vencimientosCredito(c); } catch (e) { vA = []; }
  try { vN = N.vencimientosCredito(c); } catch (e) { vN = []; }
  rensN.forEach((ren, ri) => {
    const qa = vA.filter(v => v.origen === 'renovacion' && v.renovacion === ri), qn = vN.filter(v => v.origen === 'renovacion' && v.renovacion === ri);
    const s = (q, k) => r2(q.reduce((a, v) => a + (Number(v[k]) || 0), 0));
    const cambia = qa.length !== qn.length || qa.some((v, j) => !qn[j] || v.fecha !== qn[j].fecha || Math.abs(v.total - qn[j].total) > 0.005 || Math.abs(v.capital - qn[j].capital) > 0.005);
    const clase = N.renovacionAntigua(ren) ? 'antigua (sin modalidad)' : ren.anulada ? 'anulada' : `${ren.modalidad || '—'} · ${ren.confirmada === true ? 'confirmada' : 'propuesta'}${ren.intereses ? ' · intereses ' + ren.intereses : ''}`;
    if (cambia || Object.keys(efecto).length) filasRen.push({
      empresa: c.empresa, credito: `${c.acreedor || '—'} (${uidDe(c, i)})`, moneda: c.moneda || 'USD', renovacion: ri + 1, clase,
      venc_original: c.f_venc || c.vencimiento_final || '', mes_ingreso: ren.mes_ingreso && ren.anio_ingreso ? `${ren.mes_ingreso}-${ren.anio_ingreso}` : '',
      cuotas: qn.map(v => v.fecha).join(' · ') || (rensA[ri] ? '(sin cuotas)' : ''),
      capital_antes: s(qa, 'capital'), capital_despues: s(qn, 'capital'),
      interes_antes: s(qa, 'interes'), interes_despues: s(qn, 'interes'), dif_interes: r2(s(qn, 'interes') - s(qa, 'interes')),
      cuotas_cambian: cambia,
    });
  });
  if (Object.keys(efecto).length) creditosConCambio.push({ empresa: c.empresa, credito: `${c.acreedor || '—'} (${uidDe(c, i)})`, moneda: c.moneda || 'USD',
    renovable: !!c.renovable, tipo: c.tipo_credito || 'banco', anulado: !!c.anulado, efecto });
});

// ── Antiguas conservadas con un defecto conocido del cálculo anterior ─────
// (se informan: NO cambian hasta clasificarlas; al clasificar, la pantalla muestra la
// diferencia y pide confirmación).
const antiguasObs = [];
creditos.forEach((c, i) => { if (!c || !c.renovable) return; N.getRenovaciones(c).forEach((r, ri) => {
  if (!N.renovacionAntigua(r) || !r.monto || !r.mes_ingreso || !r.anio_ingreso) return;
  const obs = [];
  if ((c.moneda || 'USD') !== 'USD') obs.push(`ingreso en ${c.moneda} sumado sin convertir a US$ (${$(r.monto)} ${c.moneda}${N.factorUSD(c) ? ` ≈ US$ ${$(r.monto * N.factorUSD(c))}` : ', sin TC'})`);
  if (c.anulado) obs.push('el crédito está anulado y su ingreso de renovación sigue proyectado');
  if (obs.length) antiguasObs.push({ empresa: c.empresa, credito: `${c.acreedor || '—'} (${uidDe(c, i)})`, renovacion: ri + 1, mes_ingreso: `${r.mes_ingreso}-${r.anio_ingreso}`, obs });
}); });

// ── Control global por empresa (todos los créditos juntos) ─────────────
const global = empresas.map(emp => {
  const LA = lineas(A, emp, creditos, ingresoBase), LN = lineas(N, emp, creditos, ingresoNuevo);
  const d = {}; Object.keys(LA).forEach(k => { const x = difMeses(LA[k], LN[k]); if (x.length) d[k] = x; });
  return { emp, dif: d };
});

// ── Conteo de renovaciones por clase ───────────────────────────────────
const conteo = {}; let nRen = 0;
creditos.forEach(c => { if (!c || !c.renovable) return; N.getRenovaciones(c).forEach(r => { nRen++; const k = N.renovacionAntigua(r) ? 'antigua' : (r.modalidad || 'sin modalidad'); conteo[k] = (conteo[k] || 0) + 1; }); });

// ── Informe ────────────────────────────────────────────────────────────
const L = [];
L.push(`# Impacto del cambio de renovaciones sobre el respaldo`, '');
L.push(`- Respaldo: \`${path.basename(archivo)}\` · fecha del respaldo ${resp.fecha || '—'} · SHA-256 \`${sha}\``);
L.push(`- Fila finanzas: actualizada ${filaFin.updated_at || '—'} · ${creditos.length} créditos · ${nRen} renovaciones (${Object.entries(conteo).map(([k, v]) => `${k}: ${v}`).join(', ') || 'ninguna'})`);
L.push(`- Código anterior: \`${BASE}\` (${shaBase}) · código nuevo: HEAD ${shaNuevo}${sucio ? ' + cambios sin commit en src/creditos.js' : ''} · corte ${HOY}`);
L.push(`- Solo lectura: no se conecta a ninguna base; el respaldo no se modifica.`, '');
L.push(`## Renovaciones cuyo cálculo cambia`, '');
if (!filasRen.length) L.push('**Ninguna.** Ninguna renovación existente cambia sus cuotas ni su efecto en el flujo.', '');
else {
  L.push('| Empresa | Crédito | Mon. | Ren. | Clase | Venc. original | Mes ingreso | Cuotas | Capital antes → después | Interés antes → después | Diferencia interés |');
  L.push('|---|---|---|---|---|---|---|---|---|---|---|');
  filasRen.forEach(r => L.push(`| ${r.empresa} | ${r.credito} | ${r.moneda} | ${r.renovacion} | ${r.clase} | ${r.venc_original} | ${r.mes_ingreso} | ${r.cuotas} | ${$(r.capital_antes)} → ${$(r.capital_despues)} | ${$(r.interes_antes)} → ${$(r.interes_despues)} | ${$(r.dif_interes)} |`));
  L.push('');
}
L.push(`## Efecto mensual en el flujo (US$), por crédito`, '');
if (!creditosConCambio.length) L.push('**Sin diferencias** en Pago Préstamos - Total, Renovaciones, Ingreso Renovación ni Ingresos Financiamiento.', '');
creditosConCambio.forEach(c => {
  L.push(`### ${c.empresa} · ${c.credito} · ${c.moneda}${c.anulado ? ' · ANULADO' : ''}`, '');
  L.push('| Línea | Mes | Antes | Después | Diferencia |', '|---|---|---|---|---|');
  Object.entries(c.efecto).forEach(([k, ds]) => ds.forEach(d => L.push(`| ${k} | ${d.mes} | ${$(d.antes)} | ${$(d.despues)} | ${$(d.dif)} |`)));
  L.push('');
});
L.push(`## Renovaciones antiguas conservadas con observación`, '');
L.push('Sin modalidad: conservan el cálculo anterior hasta clasificarlas. Al clasificarlas, la pantalla muestra la diferencia mes a mes y pide confirmación.', '');
if (!antiguasObs.length) L.push('Ninguna con observación.', '');
antiguasObs.forEach(a => L.push(`- ${a.empresa} · ${a.credito} · ren. ${a.renovacion} · ingreso ${a.mes_ingreso}: ${a.obs.join('; ')}`));
if (antiguasObs.length) L.push('');
L.push(`## Control por empresa (todos los créditos juntos)`, '');
global.forEach(g => L.push(`- ${g.emp}: ${Object.keys(g.dif).length ? Object.entries(g.dif).map(([k, d]) => `${k} ${d.length} mes(es), neto ${$(d.reduce((a, x) => a + x.dif, 0))}`).join('; ') : 'sin diferencias'}`));
L.push('');
// Por defecto FUERA del repositorio: el informe lleva datos reales y no debe commitearse.
const out = salidaDir || path.join(os.tmpdir(), 'impacto-renovaciones');
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'impacto-renovaciones.md'), L.join('\n'));
fs.writeFileSync(path.join(out, 'impacto-renovaciones.json'), JSON.stringify({ respaldo: { archivo: path.basename(archivo), sha256: sha, fecha: resp.fecha }, base: shaBase, nuevo: shaNuevo, hoy: HOY, renovaciones: filasRen, creditos: creditosConCambio, antiguasConObservacion: antiguasObs, global }, null, 2));
console.log(L.join('\n'));
console.error(`\nInforme: ${path.join(out, 'impacto-renovaciones.md')} (y .json)`);
fs.rmSync(tmp, { recursive: true, force: true });
process.exit(0);
