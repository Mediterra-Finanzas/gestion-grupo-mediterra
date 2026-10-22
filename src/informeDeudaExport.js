// Contenido del Excel y del PDF del informe de deuda — puro (sin React ni librerías).
// Lee el MISMO objeto `informeDeuda(...)` y la MISMA agrupación (`agruparInforme`) que la
// pantalla, así que los tres muestran las mismas cifras. Probado en
// src/__tests__/informeDeudaUI.test.js.
import { agruparInforme, etiquetaCredito, textoConteo, textosExcluidos, ESTADOS_CUOTA, ESTADOS_CREDITO, NOMBRE_BASE, fmtUSD } from './informeDeuda.js';

const r = (n) => (n == null ? '' : Math.round(n * 10000) / 10000);
const fechaCL = (iso) => (iso ? `${iso.slice(8, 10)}-${iso.slice(5, 7)}-${iso.slice(0, 4)}` : '');

// Indicadores del resumen. `parcial`: capital, intereses y saldo no son la deuda completa
// cuando hay cuotas sin desglosar, por conciliar o créditos sin TC.
export function indicadoresInforme(inf) {
  const p = inf.parcial ? ' (parcial*)' : '';
  const t = inf.total;
  const out = [
    ['capital', `Capital${p}`],
    ['devengado', `Intereses devengados${p}`],
    ...(t.cargosVencidos ? [['cargosVencidos', 'Otros cargos vencidos']] : []),
    ['saldoDeuda', `Saldo deuda${p} = capital + intereses devengados${t.cargosVencidos ? ' + cargos vencidos' : ''}`],
    ['porDevengar', 'Intereses por devengar'],
    ...(t.cargosFuturos ? [['cargosFuturos', 'Otros cargos por vencer']] : []),
    ['totalPorPagar', 'Total por pagar de cuotas con desglose'],
    ['sinDesglose', 'Cuotas sin desglosar (capital e interés no separados)'],
    ['totalIdentificado', 'Total de pagos pendientes identificados'],
    ['porConciliar', 'Por conciliar (fuera del saldo confirmado)'],
  ];
  return out.map(([k, l]) => ({ k, label: l, usd: t[k] }));
}
export const formulaTotalIdentificado = (inf) =>
  `Total de pagos pendientes identificados = total por pagar US$ ${fmtUSD(inf.total.totalPorPagar)} + cuotas sin desglosar US$ ${fmtUSD(inf.total.sinDesglose)} = US$ ${fmtUSD(inf.total.totalIdentificado)}. Cada cuota se cuenta una sola vez.`;

// Columnas del resumen por crédito (US$). Los cargos aparecen solo si existen, para que lo
// visible siempre cuadre: saldo = capital + devengado (+ cargos vencidos), etc.
export function columnasResumen(inf) {
  const t = inf.total;
  return [
    ['capital', 'Capital'], ['devengado', 'Intereses devengados'],
    ...(t.cargosVencidos ? [['cargosVencidos', 'Cargos vencidos']] : []),
    ['saldoDeuda', 'Saldo deuda'], ['porDevengar', 'Intereses por devengar'],
    ...(t.cargosFuturos ? [['cargosFuturos', 'Cargos por vencer']] : []),
    ['totalPorPagar', 'Total por pagar'], ['sinDesglose', 'Sin desglosar'], ['totalIdentificado', 'Total identificado'],
  ];
}
export const COLS_CUOTA = [
  ['fecha', 'Vencimiento'], ['estado', 'Estado'], ['capital', 'Capital'], ['interes', 'Intereses'], ['cargos', 'Otros cargos'],
  ['total', 'Cuota total'], ['pagado', 'Pagado al corte'], ['pendiente', 'Saldo pendiente'], ['devengado', 'Interés devengado al corte'], ['porDevengar', 'Interés por devengar'],
];
// Valor de una celda de cuota: si la cuota no está desglosada, capital e interés no se inventan.
export function celdaCuota(q, k) {
  if (k === 'fecha') return q.fecha;
  if (k === 'estado') return ESTADOS_CUOTA[q.estado] || q.estado;
  if ((k === 'capital' || k === 'interes') && q.sinDesglose > 0 && !(q.capital > 0) && !(q.interes > 0)) return 'sin desglose';
  return q[k];
}
export function textoDevengo(d, mon) {
  if (d.vencido) return `${d.que}: cuota vencida, devengada completa`;
  return `${d.que}: período ${fechaCL(d.inicio)} → ${fechaCL(d.fin)}, base ${NOMBRE_BASE[d.base] || d.base}: ${d.transcurrido} de ${d.periodo} días × ${mon} ${fmtUSD(d.monto)} = ${mon} ${fmtUSD(d.monto * d.frac)}`;
}
export const textoAjusteCapital = (x) => {
  const a = x.ajusteCapital;
  if (!(a.interesRenovacion > 0) && !(a.interesACapitalizar > 0)) return '';
  return `Capital al corte = capital de cuotas pendientes ${fmtUSD(a.cuotas)}${a.interesRenovacion > 0 ? ` − interés capitalizado en renovación aún no vigente ${fmtUSD(a.interesRenovacion)}` : ''}${a.interesACapitalizar > 0 ? ` − interés que se capitalizará después del corte ${fmtUSD(a.interesACapitalizar)}` : ''} = ${fmtUSD(x.capital)} (${x.moneda}).`;
};

// ── Excel ───────────────────────────────────────────────────────────
// Devuelve [{ nombre, aoa, cols, niveles }] — `niveles[i]` es el nivel de esquema de la fila i
// (0 = empresa/crédito, 1 = cuota) para poder contraer las cuotas en Excel.
export function hojasExcelInforme(inf, { notas = [] } = {}) {
  const g = agruparInforme(inf);
  const cols = columnasResumen(inf);
  const tit = [`Informe de deuda al ${fechaCL(inf.corte)} · montos en US$ salvo que se indique otra moneda`];
  // Resumen
  const res = [tit, [textoConteo(inf)], [],
    ['Indicador', 'US$'], ...indicadoresInforme(inf).map(i => [i.label, i.usd]), [],
    [formulaTotalIdentificado(inf)], ['Excluido del total identificado:'], ...textosExcluidos(inf).map(t => [`· ${t}`])];
  if (inf.parcial) res.push([], ['* Cifras parciales porque hay:'], ...inf.motivosParcial.map(m => [`· ${m}`]));
  res.push([], ['Por empresa', 'Créditos', ...cols.map(c => `${c[1]} (US$)`), 'Por conciliar (US$)']);
  g.grupos.forEach(e => res.push([e.empresa, e.sub.creditos, ...cols.map(([k]) => e.sub[k]), e.sub.porConciliar]));
  res.push(['TOTAL', g.total.creditos, ...cols.map(([k]) => g.total[k]), g.total.porConciliar]);
  // Créditos y cuotas (misma estructura que la pantalla: empresa → crédito → cuotas)
  const head = ['Empresa', 'Crédito / contrato', 'Moneda', 'Vence', 'Estado', ...cols.map(c => `${c[1]} (US$)`), 'Por conciliar (US$)',
    ...COLS_CUOTA.map(c => `Cuota · ${c[1]} (moneda del crédito)`), 'Detalle'];
  const det = [tit, [], head], niv = [0, 0, 0];
  const vacioRes = cols.length + 1;
  g.grupos.forEach(e => {
    det.push([e.empresa, `Subtotal ${e.empresa} (${e.sub.creditos} crédito(s) en US$)`, 'US$', '', '', ...cols.map(([k]) => e.sub[k]), e.sub.porConciliar,
      ...COLS_CUOTA.map(() => ''), '']); niv.push(0);
    e.filas.forEach(x => {
      const notas = [x.usd ? (x.moneda === 'USD' ? '' : `TC ${x.tc ? `${x.tc.tc} ${x.moneda}/US$ · ${x.tc.fecha || 's/f'} · ${x.tc.fuente}` : ''}`) : 'SIN TC: fuera de los totales en US$',
        textoAjusteCapital(x), ...x.avisos].filter(Boolean).join(' | ');
      det.push([x.empresa, etiquetaCredito(x), x.moneda, x.vencimientoFinal, ESTADOS_CREDITO[x.estadoCredito] || '',
        ...cols.map(([k]) => (x.usd ? x.usd[k] : 'sin TC')), x.usd ? x.usd.porConciliar : 'sin TC', ...COLS_CUOTA.map(() => ''), notas]); niv.push(0);
      x.cuotas.forEach(q => {
        det.push(['', '', x.moneda, '', '', ...Array(vacioRes).fill(''), ...COLS_CUOTA.map(([k]) => { const v = celdaCuota(q, k); return typeof v === 'number' ? r(v) : v; }),
          [...q.devengo.filter(d => !d.vencido && d.transcurrido > 0).map(d => textoDevengo(d, x.moneda)), ...q.notas].join(' | ')]); niv.push(1);
      });
    });
  });
  det.push(['TOTAL', `${g.total.creditos} crédito(s) en US$`, 'US$', '', '', ...cols.map(([k]) => g.total[k]), g.total.porConciliar, ...COLS_CUOTA.map(() => ''), '']); niv.push(0);
  // Por conciliar
  const pc = [tit, [], ['Empresa', 'Crédito / contrato', 'Moneda', 'Por conciliar (moneda del crédito)', 'Por conciliar (US$)']];
  inf.filas.filter(x => x.porConciliar > 0).forEach(x => pc.push([x.empresa, etiquetaCredito(x), x.moneda, x.porConciliar, x.usd ? x.usd.porConciliar : 'sin TC']));
  pc.push(['TOTAL', '', 'US$', '', inf.total.porConciliar]);
  // Garantías
  const gar = [tit, [], ['Empresa', 'Crédito / contrato', 'Tipo de garantía', 'Otorgante', 'Bien / descripción', 'Moneda', 'Monto / valor', 'Fecha']];
  inf.filas.forEach(x => {
    x.garantias.forEach(gg => gar.push([x.empresa, etiquetaCredito(x), gg.tipo || '', gg.otorgante || '', gg.bien || '', gg.moneda || 'USD', gg.monto === '' || gg.monto == null ? '' : Number(gg.monto), gg.fecha || '']));
    if (!x.garantias.length) gar.push([x.empresa, etiquetaCredito(x), x.garantiasTexto ? '(solo texto)' : '(sin garantía registrada)', '', x.garantiasTexto, '', '', '']);
  });
  // Datos técnicos (moneda original y US$ por crédito)
  const tec = [tit, [], ['Empresa', 'Crédito / contrato', 'Clasificación', 'Modalidad', 'Moneda', 'Tasa', 'Base', 'Vence', 'Capital', 'Intereses devengados', 'Cargos vencidos', 'Saldo deuda',
    'Intereses por devengar', 'Cargos por vencer', 'Total por pagar', 'Sin desglosar', 'Total identificado', 'Por conciliar', 'TC usado', 'Avisos']];
  inf.filas.forEach(x => tec.push([x.empresa, etiquetaCredito(x), `${x.clasificacion || 'Sin clasificar'}${x.clasificacionOrigen === 'sugerida' ? ' (sugerida)' : ''}`, x.modalidad, x.moneda,
    x.tasa == null ? '' : `${x.tasa}%${x.tasaVariable ? ' variable' : ''}`, NOMBRE_BASE[x.base] || x.base, x.vencimientoFinal,
    ...['capital', 'devengado', 'cargosVencidos', 'saldoDeuda', 'porDevengar', 'cargosFuturos', 'totalPorPagar', 'sinDesglose', 'totalIdentificado', 'porConciliar'].map(k => x[k]),
    x.moneda === 'USD' ? '' : (x.tc ? `${x.tc.tc} ${x.moneda}/US$ · ${x.tc.fecha || 's/f'} · ${x.tc.fuente}` : 'sin TC'), x.avisos.join('; ')]));
  return [
    { nombre: 'Resumen', aoa: res, cols: [{ wch: 60 }, { wch: 16 }, ...cols.map(() => ({ wch: 16 })), { wch: 16 }] },
    { nombre: 'Créditos y cuotas', aoa: det, niveles: niv, cols: [{ wch: 16 }, { wch: 34 }, { wch: 7 }, { wch: 11 }, { wch: 20 }, ...Array(vacioRes).fill({ wch: 15 }), { wch: 11 }, { wch: 22 }, ...Array(COLS_CUOTA.length - 2).fill({ wch: 14 }), { wch: 70 }] },
    { nombre: 'Por conciliar', aoa: pc, cols: [{ wch: 16 }, { wch: 34 }, { wch: 7 }, { wch: 20 }, { wch: 16 }] },
    { nombre: 'Garantías', aoa: gar, cols: [{ wch: 16 }, { wch: 34 }, { wch: 16 }, { wch: 22 }, { wch: 32 }, { wch: 7 }, { wch: 14 }, { wch: 11 }] },
    { nombre: 'Datos técnicos', aoa: tec, cols: [{ wch: 16 }, { wch: 34 }, { wch: 18 }, { wch: 22 }, { wch: 7 }, { wch: 9 }, { wch: 12 }, { wch: 11 }, ...Array(10).fill({ wch: 14 }), { wch: 26 }, { wch: 40 }] },
    { nombre: 'Notas', aoa: [tit, [], ...notas.map(n => [n])], cols: [{ wch: 120 }] },
  ];
}

// ── PDF ─────────────────────────────────────────────────────────────
// Bloques que el generador dibuja en orden. Resumido para socios; `detalle` agrega las
// cuotas de cada crédito. Los montos van con 2 decimales (igual que pantalla y Excel).
export function bloquesPdfInforme(inf, { detalle = false, notas = [] } = {}) {
  const g = agruparInforme(inf);
  const cols = columnasResumen(inf);
  const B = [];
  B.push({ tipo: 'titulo', texto: `Informe de deuda al ${fechaCL(inf.corte)}` });
  B.push({ tipo: 'texto', texto: `Montos en US$. ${textoConteo(inf)}.` });
  B.push({ tipo: 'tabla', head: ['Indicador', 'US$'], body: indicadoresInforme(inf).map(i => [i.label, fmtUSD(i.usd)]), derecha: [1], destacar: ['totalIdentificado', 'porConciliar'].map(k => indicadoresInforme(inf).findIndex(i => i.k === k)) });
  B.push({ tipo: 'texto', texto: formulaTotalIdentificado(inf) });
  B.push({ tipo: 'texto', texto: `Excluido: ${textosExcluidos(inf).join(' ')}` });
  if (inf.parcial) B.push({ tipo: 'aviso', texto: `* Cifras parciales: ${inf.motivosParcial.join('; ')}.` });
  const body = [], estilos = [];
  g.grupos.forEach(e => {
    body.push([`${e.empresa}`, '', '', ...cols.map(([k]) => fmtUSD(e.sub[k]))]); estilos.push('empresa');
    e.filas.forEach(x => { body.push([`   ${etiquetaCredito(x)}`, x.moneda, fechaCL(x.vencimientoFinal), ...cols.map(([k]) => (x.usd ? fmtUSD(x.usd[k]) : 'sin TC'))]); estilos.push('credito'); });
  });
  body.push(['TOTAL', '', '', ...cols.map(([k]) => fmtUSD(g.total[k]))]); estilos.push('total');
  B.push({ tipo: 'tabla', titulo: 'Deuda por empresa y crédito (US$)', head: ['Empresa / crédito', 'Mon.', 'Vence', ...cols.map(c => c[1])], body, estilos, derecha: cols.map((_, i) => i + 3) });
  const pcs = inf.filas.filter(x => x.porConciliar > 0);
  if (pcs.length) B.push({ tipo: 'tabla', titulo: 'Por conciliar: fuera del saldo confirmado', head: ['Empresa', 'Crédito / contrato', 'Moneda del crédito', 'US$'],
    body: [...pcs.map(x => [x.empresa, etiquetaCredito(x), `${x.moneda} ${fmtUSD(x.porConciliar)}`, x.usd ? fmtUSD(x.usd.porConciliar) : 'sin TC']), ['TOTAL', '', '', fmtUSD(inf.total.porConciliar)]], derecha: [3] });
  const gl = Object.values(inf.garantias);
  B.push({ tipo: 'tabla', titulo: 'Avales, hipotecas y garantías', head: ['Tipo', 'Cantidad', 'Montos declarados', 'Créditos'],
    body: gl.length ? gl.map(x => [x.tipo, String(x.cantidad), Object.entries(x.montos).map(([m, v]) => `${m} ${fmtUSD(v)}`).join(' · ') || '—', x.creditos.join('; ')])
      : [['—', '0', '—', `Sin garantías cargadas (${inf.sinGarantia} crédito(s) sin garantía registrada)`]] });
  if (detalle) g.grupos.forEach(e => e.filas.forEach(x => {
    B.push({ tipo: 'tabla', titulo: `${e.empresa} · ${etiquetaCredito(x)} — cuotas en ${x.moneda}`, head: COLS_CUOTA.map(c => c[1]),
      body: x.cuotas.map(q => COLS_CUOTA.map(([k]) => { const v = celdaCuota(q, k); return k === 'fecha' ? fechaCL(v) : (typeof v === 'number' ? fmtUSD(v) : v); })),
      derecha: [2, 3, 4, 5, 6, 7, 8, 9] });
    const extra = [textoAjusteCapital(x), ...x.cuotas.flatMap(q => q.devengo.filter(d => !d.vencido && d.transcurrido > 0).map(d => `${fechaCL(q.fecha)} · ${textoDevengo(d, x.moneda)}`)), ...x.avisos].filter(Boolean);
    if (extra.length) B.push({ tipo: 'texto', texto: extra.join(' · ') });
  }));
  B.push({ tipo: 'notas', textos: notas });
  return B.map(b => limpiarPdf(b));
}
// Las fuentes estándar del PDF (WinAnsi) no tienen →, ×, − ni ≤: se reemplazan para que
// el texto no salga desarmado.
export const textoPdf = (t) => String(t).replace(/\s*→\s*/g, ' a ').replace(/×/g, 'x').replace(/−/g, '-').replace(/≤/g, '<=').replace(/≥/g, '>=');
function limpiarPdf(v) {
  if (typeof v === 'string') return textoPdf(v);
  if (Array.isArray(v)) return v.map(limpiarPdf);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, limpiarPdf(x)]));
  return v;
}
