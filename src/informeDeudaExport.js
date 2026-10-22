// Contenido del Excel y del PDF del informe de deuda — puro (sin React ni librerías).
// Lee el MISMO objeto `informeDeuda(...)` y la MISMA agrupación (`agruparInforme`) que la
// pantalla, así que los tres muestran las mismas cifras. Probado en
// src/__tests__/informeDeudaUI.test.js.
import { agruparInforme, etiquetaCredito, textoConteo, textosExcluidos, ESTADOS_CUOTA, ESTADOS_CREDITO, NOMBRE_BASE, NATURALEZAS, fmtUSD, fmtMon, textoAval, textoGarantia } from './informeDeuda.js';

const r = (n) => (n == null ? '' : Math.round(n * 10000) / 10000);
const fechaCL = (iso) => (iso ? `${iso.slice(8, 10)}-${iso.slice(5, 7)}-${iso.slice(0, 4)}` : '');

// Textos del informe: los mismos en pantalla, Excel y PDF. Cortos y en lenguaje de
// finanzas; las explicaciones de método van solo en «Cómo se calcula».
export const NOTAS_METODO = [
  'Saldo de la deuda: capital pendiente más intereses devengados y no pagados a la fecha de corte (y otros cargos vencidos, si los hay).',
  'Intereses devengados: la parte del interés de cada cuota que corresponde al tiempo ya transcurrido de su período, según la base del contrato (30/360 cuenta meses de 30 días; Actual/360 y Actual/365, días reales). Una cuota vencida e impaga se cuenta completa.',
  'Cuotas sin desglosar: registros antiguos que no separan capital de interés. No se reparten en capital e interés; se suman al total de pagos pendientes. Se completan con «Desglosar cuota» en el crédito.',
  'Por conciliar: cuotas antiguas sin pago registrado ni confirmación. No se incluyen en ningún total hasta conciliarlas.',
  'Anticipos de clientes: se marcan en cada crédito («Naturaleza de la obligación»). Se muestran aparte y suman al total de obligaciones.',
  'Conversión a US$ con el tipo de cambio de Maestros a la fecha de corte. Si Maestros no lo tiene, se usa el tipo de cambio declarado en el crédito, como estimación; sin ninguno, el crédito queda fuera de los totales. Montos al centavo (UF, 4 decimales); los totales son la suma de las filas.',
  'Renovaciones: solo cuenta la deuda vigente al corte. Una renovación que aún no rige se muestra como proyección (capital nuevo e intereses) y no cambia el vencimiento vigente; cuando rige, reemplaza el capital que renueva, sin sumar ambos.',
  'Pagos con fecha posterior al corte no se descuentan. Lo ya pagado de una cuota se descuenta primero del interés devengado. El interés que se sumará al capital después del corte (gracia, renovaciones) se informa como interés.',
];
export const avisoParcial = (inf) => (inf.parcial ? `Capital, intereses y saldo son parciales: no incluyen ${inf.motivosParcial.join(', ')}.` : '');

// Indicadores del resumen. `(parcial*)` cuando hay cuotas sin desglosar, por conciliar o sin TC.
export function indicadoresInforme(inf) {
  const p = inf.parcial ? ' (parcial*)' : '';
  const t = inf.total;
  const out = [
    ['capital', `Capital${p}`],
    ['devengado', `Intereses devengados${p}`],
    ...(t.cargosVencidos ? [['cargosVencidos', 'Otros cargos vencidos']] : []),
    ['saldoDeuda', `Saldo de la deuda${p}`],
    ['porDevengar', 'Intereses por devengar'],
    ...(t.cargosFuturos ? [['cargosFuturos', 'Otros cargos por vencer']] : []),
    ['totalPorPagar', 'Total por pagar (cuotas con desglose)'],
    ['sinDesglose', 'Cuotas sin desglosar'],
    ['totalIdentificado', 'Total de pagos pendientes identificados (deuda financiera)'],
  ];
  return [...out.map(([k, l]) => ({ k, label: l, usd: t[k] })),
    { k: 'anticipos', label: `Anticipos de clientes${inf.conteo.anticipos ? '' : ' (ninguno marcado)'}`, usd: inf.anticipos.totalIdentificado },
    { k: 'obligaciones', label: 'Total de obligaciones identificadas', usd: inf.obligaciones.totalIdentificado },
    { k: 'porConciliar', label: 'Por conciliar (no incluido)', usd: inf.obligaciones.porConciliar },
    ...(inf.proyeccionRenovaciones && inf.proyeccionRenovaciones.usd > 0 ? [{ k: 'renovacionesFuturas', label: 'Renovaciones que aún no rigen (proyección, no incluida)', usd: inf.proyeccionRenovaciones.usd }] : [])];
}
export const formulaTotalIdentificado = (inf) =>
  `Total de obligaciones identificadas: deuda financiera US$ ${fmtUSD(inf.total.totalIdentificado)} + anticipos de clientes US$ ${fmtUSD(inf.anticipos.totalIdentificado)} = US$ ${fmtUSD(inf.obligaciones.totalIdentificado)}.`;
// Bloques de la tabla agrupada: deuda financiera y, aparte, anticipos de clientes.
export const BLOQUES_NATURALEZA = [
  { naturaleza: 'financiera', titulo: 'Deuda financiera (US$)', total: 'TOTAL DEUDA FINANCIERA' },
  { naturaleza: 'anticipo_cliente', titulo: 'Anticipos de clientes (US$)', total: 'TOTAL ANTICIPOS DE CLIENTES' },
];

// Columnas del resumen por crédito (US$). Los cargos aparecen solo si existen, para que lo
// visible siempre cuadre: saldo = capital + devengado (+ cargos vencidos), etc.
export function columnasResumen(inf) {
  const t = { cargosVencidos: inf.total.cargosVencidos + inf.anticipos.cargosVencidos, cargosFuturos: inf.total.cargosFuturos + inf.anticipos.cargosFuturos };
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
  ['total', 'Cuota'], ['pagado', 'Pagado'], ['pendiente', 'Saldo pendiente'], ['devengado', 'Interés devengado'], ['porDevengar', 'Interés por devengar'],
];
// Valor de una celda de cuota: si la cuota no está desglosada, capital e interés no se inventan.
export function celdaCuota(q, k) {
  if (k === 'fecha') return q.fecha;
  if (k === 'estado') return ESTADOS_CUOTA[q.estado] || q.estado;
  if ((k === 'capital' || k === 'interes') && q.sinDesglose > 0 && !(q.capital > 0) && !(q.interes > 0)) return 'sin desglose';
  return q[k];
}
const QUE = { 'interés de la cuota': 'Interés devengado', 'interés a capitalizar': 'Interés que se sumará al capital', 'interés capitalizado en la renovación': 'Interés capitalizado en la renovación', 'interés del período de origen (renovación)': 'Interés del período anterior a la renovación' };
export function textoDevengo(d, mon) {
  const que = QUE[d.que] || d.que;
  if (d.vencido) return `${que}: cuota vencida, completo`;
  return `${que}: ${d.transcurrido} de ${d.periodo} días (${fechaCL(d.inicio)} al ${fechaCL(d.fin)}, base ${NOMBRE_BASE[d.base] || d.base}) = ${mon} ${fmtMon(d.monto * d.frac, mon)}`;
}
export const textoAjusteCapital = (x) => {
  const a = x.ajusteCapital;
  if (!(a.interesRenovacion > 0) && !(a.interesACapitalizar > 0)) return '';
  const menos = a.interesRenovacion + a.interesACapitalizar;
  return `Capital al corte: ${x.moneda} ${fmtMon(a.cuotas, x.moneda)} de cuotas pendientes, menos ${x.moneda} ${fmtMon(menos, x.moneda)} de interés que todavía no se suma al capital = ${x.moneda} ${fmtMon(x.capital, x.moneda)}.`;
};
export const textoClasificacion = (x) => (x.clasificacion ? `${x.clasificacion}${x.clasificacionOrigen === 'sugerida' ? ' (sugerida)' : ''}` : 'Sin clasificar');
export const textoAvales = (x) => (x.avales.length ? x.avales.map(textoAval).join(' | ') : 'Sin avales');
export const textoGarantias = (x) => (x.garantias.length ? x.garantias.map(textoGarantia).join(' | ') : (x.garantiasTexto ? `Nota: ${x.garantiasTexto}` : 'Sin garantías'));
// Título con el alcance del archivo: todas las empresas o una sola.
export const tituloInforme = (inf, alcance = 'Todas las empresas') => `Informe de deuda · ${alcance} · al ${fechaCL(inf.corte)}`;
const tcTexto = (x) => (x.moneda === 'USD' ? '' : (x.tc ? `Tipo de cambio ${x.tc.tc} ${x.moneda}/US$ (${fechaCL(x.tc.fecha) || 's/f'})${x.tc.estimado ? ', declarado en el crédito: estimación' : ''}.` : 'Sin tipo de cambio: fuera de los totales.'));

// ── Excel ───────────────────────────────────────────────────────────
// Devuelve [{ nombre, aoa, cols, niveles, encabezados, totales, colsEnteras }]:
// `niveles[i]` = nivel de esquema de la fila i (1 = cuota, para contraerlas en Excel);
// `encabezados`/`totales` = filas a destacar. Lo dibuja `descargarExcelConLogo`.
export function hojasExcelInforme(inf, { notas = NOTAS_METODO, alcance = 'Todas las empresas' } = {}) {
  const bloques = BLOQUES_NATURALEZA.map(b => ({ ...b, g: agruparInforme(inf, { naturaleza: b.naturaleza }) }));
  const cols = columnasResumen(inf);
  const tit = [`${tituloInforme(inf, alcance)} · US$`];
  // Resumen
  const res = [tit, [textoConteo(inf)]];
  if (inf.parcial) res.push([`* ${avisoParcial(inf)}`]);
  res.push([]);
  const encR = [res.length]; res.push(['Indicador', 'US$']);
  const montosR = [];
  indicadoresInforme(inf).forEach(i => { montosR.push(res.length); res.push([i.label, i.usd]); });
  const totR = [res.length - 2];   // fila «Total de obligaciones identificadas»
  res.push([], [formulaTotalIdentificado(inf)], ['No incluye:'], ...textosExcluidos(inf).map(t => [`· ${t}`]));
  bloques.forEach(({ g, titulo, total }) => {
    res.push([], [titulo]); encR.push(res.length); res.push(['Empresa', 'Créditos', ...cols.map(c => c[1]), 'Por conciliar']);
    g.grupos.forEach(e => res.push([e.empresa, e.sub.creditos, ...cols.map(([k]) => e.sub[k]), e.sub.porConciliar]));
    totR.push(res.length); res.push([total, g.total.creditos, ...cols.map(([k]) => g.total[k]), g.total.porConciliar]);
  });
  // Créditos y cuotas (misma estructura que la pantalla: empresa → crédito → cuotas)
  const head = ['Empresa', 'Crédito / contrato', 'Clasificación', 'Moneda', 'Vence', 'Estado', ...cols.map(c => `${c[1]} (US$)`), 'Por conciliar (US$)',
    ...COLS_CUOTA.map(c => `${c[1]} (moneda del crédito)`), 'Avales', 'Garantías', 'Observaciones'];
  const det = [tit, ['Montos de cada crédito en US$; montos de las cuotas en la moneda del crédito. Las cuotas se pueden contraer con los botones [–] del margen.'], head];
  const niv = [0, 0, 0], encD = [2], totD = [], ufD = [];
  const vacioRes = cols.length + 1;
  bloques.forEach(({ g, titulo, total }) => {
    det.push([titulo]); niv.push(0);
    g.grupos.forEach(e => {
      totD.push(det.length);
      det.push([e.empresa, `Subtotal (${e.sub.creditos} créditos${e.sub.listados > e.sub.creditos ? `; ${e.sub.listados - e.sub.creditos} sin tipo de cambio, fuera del subtotal` : ''})`, '', 'US$', '', '', ...cols.map(([k]) => e.sub[k]), e.sub.porConciliar,
        ...COLS_CUOTA.map(() => ''), '', '', '']); niv.push(0);
      e.filas.forEach(x => {
        const obs = [tcTexto(x), textoAjusteCapital(x), ...x.avisos].filter(Boolean).join(' ');
        det.push([x.empresa, etiquetaCredito(x), textoClasificacion(x), x.moneda, x.vencimientoFinal, ESTADOS_CREDITO[x.estadoCredito] || '',
          ...cols.map(([k]) => (x.usd ? x.usd[k] : 'sin TC')), x.usd ? x.usd.porConciliar : 'sin TC', ...COLS_CUOTA.map(() => ''), textoAvales(x), textoGarantias(x), obs]); niv.push(0);
        x.cuotas.forEach(q => {
          if (x.moneda === 'UF') ufD.push(det.length);
          det.push(['', '', '', x.moneda, '', '', ...Array(vacioRes).fill(''), ...COLS_CUOTA.map(([k]) => { const v = celdaCuota(q, k); return typeof v === 'number' ? r(v) : v; }), '', '',
            [...q.devengo.filter(d => !d.vencido && d.transcurrido > 0).map(d => textoDevengo(d, x.moneda)), ...q.notas].join(' · ')]); niv.push(1);
        });
      });
    });
    totD.push(det.length);
    det.push([total, `${g.total.creditos} créditos`, '', 'US$', '', '', ...cols.map(([k]) => g.total[k]), g.total.porConciliar, ...COLS_CUOTA.map(() => ''), '', '', '']); niv.push(0);
    det.push([]); niv.push(0);
  });
  const iTI = cols.findIndex(c => c[0] === 'totalIdentificado');
  totD.push(det.length);
  det.push(['TOTAL OBLIGACIONES IDENTIFICADAS', 'deuda financiera + anticipos de clientes', '', 'US$', '', '', ...cols.map((c, i) => (i === iTI ? inf.obligaciones.totalIdentificado : '')), inf.obligaciones.porConciliar]); niv.push(0);
  // Por conciliar
  const pc = [tit, ['Cuotas antiguas sin pago registrado ni confirmación. No están incluidas en los totales.'], ['Empresa', 'Crédito / contrato', 'Moneda', 'Monto (moneda del crédito)', 'US$']];
  inf.filas.filter(x => x.porConciliar > 0).forEach(x => pc.push([x.empresa, etiquetaCredito(x), x.moneda, x.porConciliar, x.usd ? x.usd.porConciliar : 'sin TC']));
  const ufPC = inf.filas.filter(x => x.porConciliar > 0).map((x, i) => (x.moneda === 'UF' ? 3 + i : -1)).filter(i => i >= 0);
  const totPC = [pc.length]; pc.push(['TOTAL', '', 'US$', '', inf.obligaciones.porConciliar]);
  // Avales y garantías: una fila por aval o garantía. No lleva montos de deuda, así un
  // crédito con varios avalistas no se cuenta dos veces.
  const gar = [tit, ['Una fila por aval o garantía. Los montos son los declarados en cada aval o garantía, no la deuda.'],
    ['Empresa', 'Crédito / contrato', 'Clasificación', 'Tipo', 'Avalista u otorgante', 'Bien / descripción', 'Moneda', 'Monto declarado', '% de la deuda', 'Fecha', 'Nota']];
  const numOVacio = (v) => (v === '' || v == null || !(Number(v) > 0) ? '' : Number(v));
  inf.filas.forEach(x => {
    x.avales.forEach(a => gar.push([x.empresa, etiquetaCredito(x), textoClasificacion(x), 'Aval', a.otorgante || 'Avalista sin nombre', a.bien || '', numOVacio(a.monto) === '' ? '' : (a.moneda || 'USD'), numOVacio(a.monto), numOVacio(a.porcentaje), a.fecha || '', a.nota || '']));
    x.garantias.forEach(gg => gar.push([x.empresa, etiquetaCredito(x), textoClasificacion(x), gg.tipo || '', gg.otorgante || '', gg.bien || '', numOVacio(gg.monto) === '' ? '' : (gg.moneda || 'USD'), numOVacio(gg.monto), '', gg.fecha || '', gg.nota || '']));
    if (!x.avales.length && !x.garantias.length) gar.push([x.empresa, etiquetaCredito(x), textoClasificacion(x), x.garantiasTexto ? 'Solo nota' : 'Sin avales ni garantías', '', x.garantiasTexto, '', '', '', '', '']);
  });
  // Datos técnicos (moneda original y US$ por crédito)
  const tec = [tit, ['Montos en la moneda de cada crédito.'], ['Empresa', 'Crédito / contrato', 'Naturaleza', 'Clasificación', 'Modalidad', 'Moneda', 'Tasa', 'Base', 'Vence', 'Capital', 'Intereses devengados', 'Cargos vencidos', 'Saldo deuda',
    'Intereses por devengar', 'Cargos por vencer', 'Total por pagar', 'Sin desglosar', 'Total identificado', 'Por conciliar', 'Tipo de cambio', 'Observaciones']];
  inf.filas.forEach(x => tec.push([x.empresa, etiquetaCredito(x), NATURALEZAS[x.naturaleza], `${x.clasificacion || 'Sin clasificar'}${x.clasificacionOrigen === 'sugerida' ? ' (sugerida)' : ''}`, x.modalidad, x.moneda,
    x.tasa == null ? '' : `${x.tasa}%${x.tasaVariable ? ' variable' : ''}`, NOMBRE_BASE[x.base] || x.base, x.vencimientoFinal,
    ...['capital', 'devengado', 'cargosVencidos', 'saldoDeuda', 'porDevengar', 'cargosFuturos', 'totalPorPagar', 'sinDesglose', 'totalIdentificado', 'porConciliar'].map(k => x[k]),
    x.moneda === 'USD' ? '' : (x.tc ? `${x.tc.tc} ${x.moneda}/US$ · ${x.tc.fecha || 's/f'} · ${x.tc.fuente}` : 'sin tipo de cambio'), x.avisos.join(' ')]));
  return [
    { nombre: 'Resumen', aoa: res, encabezados: encR, totales: totR, colsEnteras: [1], filasMonto: montosR, cols: [{ wch: 58 }, { wch: 16 }, ...cols.map(() => ({ wch: 16 })), { wch: 16 }] },
    { nombre: 'Créditos y cuotas', aoa: det, ancha: true, filasUF: ufD, niveles: niv, encabezados: encD, totales: totD, cols: [{ wch: 30 }, { wch: 38 }, { wch: 24 }, { wch: 8 }, { wch: 11 }, { wch: 20 }, ...Array(vacioRes).fill({ wch: 15 }), { wch: 11 }, { wch: 22 }, ...Array(COLS_CUOTA.length - 2).fill({ wch: 14 }), { wch: 40 }, { wch: 40 }, { wch: 60 }] },
    { nombre: 'Por conciliar', aoa: pc, filasUF: ufPC, colsNoUF: [4], encabezados: [2], totales: totPC, cols: [{ wch: 16 }, { wch: 34 }, { wch: 8 }, { wch: 22 }, { wch: 16 }] },
    { nombre: 'Avales y garantías', aoa: gar, encabezados: [2], cols: [{ wch: 16 }, { wch: 34 }, { wch: 18 }, { wch: 10 }, { wch: 26 }, { wch: 30 }, { wch: 8 }, { wch: 15 }, { wch: 11 }, { wch: 11 }, { wch: 30 }] },
    { nombre: 'Datos técnicos', aoa: tec, ancha: true, filasUF: inf.filas.map((x, i) => (x.moneda === 'UF' ? 3 + i : -1)).filter(i => i >= 0), encabezados: [2], cols: [{ wch: 16 }, { wch: 34 }, { wch: 18 }, { wch: 18 }, { wch: 22 }, { wch: 8 }, { wch: 9 }, { wch: 12 }, { wch: 11 }, ...Array(10).fill({ wch: 14 }), { wch: 26 }, { wch: 40 }] },
    { nombre: 'Cómo se calcula', aoa: [tit, [], ...notas.map(n => [n])], cols: [{ wch: 130 }] },
  ];
}

// ── PDF ─────────────────────────────────────────────────────────────
// Bloques que el generador dibuja en orden (logo y pie de página los pone el generador).
// Resumido para socios; `detalle` agrega las cuotas de cada crédito.
export function bloquesPdfInforme(inf, { detalle = false, notas = NOTAS_METODO, alcance = 'Todas las empresas' } = {}) {
  const bloques = BLOQUES_NATURALEZA.map(b => ({ ...b, g: agruparInforme(inf, { naturaleza: b.naturaleza }) }));
  const cols = columnasResumen(inf);
  const B = [];
  B.push({ tipo: 'titulo', texto: tituloInforme(inf, alcance), sub: `Montos en US$ · ${textoConteo(inf)}.` });
  if (inf.parcial) B.push({ tipo: 'aviso', texto: `* ${avisoParcial(inf)}` });
  const ind = indicadoresInforme(inf);
  B.push({ tipo: 'tabla', titulo: 'Resumen', head: ['', 'US$'], body: ind.map(i => [i.label, fmtUSD(i.usd)]), derecha: [1], ancho: 360,
    destacar: ['saldoDeuda', 'totalIdentificado', 'obligaciones'].map(k => ind.findIndex(i => i.k === k)) });
  B.push({ tipo: 'texto', texto: `No incluye: ${textosExcluidos(inf).join(' ')}` });
  bloques.forEach(({ g, titulo, total, naturaleza }) => {
    if (naturaleza !== 'financiera' && !g.n) { B.push({ tipo: 'texto', texto: `${titulo.replace(' (US$)', '')}: ningún crédito marcado.` }); return; }
    const body = [], estilos = [];
    g.grupos.forEach(e => {
      body.push([`${e.empresa}${e.sub.listados > e.sub.creditos ? ` (${e.sub.listados - e.sub.creditos} sin tipo de cambio, fuera del subtotal)` : ''}`, '', '', '', ...cols.map(([k]) => fmtUSD(e.sub[k]))]); estilos.push('empresa');
      e.filas.forEach(x => { body.push([`   ${etiquetaCredito(x)}`, textoClasificacion(x), x.moneda, fechaCL(x.vencimientoFinal), ...cols.map(([k]) => (x.usd ? fmtUSD(x.usd[k]) : 'sin TC'))]); estilos.push('credito'); });
    });
    body.push([total, '', '', '', ...cols.map(([k]) => fmtUSD(g.total[k]))]); estilos.push('total');
    B.push({ tipo: 'tabla', titulo, head: ['Empresa / crédito', 'Clasificación', 'Mon.', 'Vence', ...cols.map(c => c[1])], body, estilos, derecha: cols.map((_, i) => i + 4) });
  });
  B.push({ tipo: 'destacado', texto: formulaTotalIdentificado(inf) });
  const pcs = inf.filas.filter(x => x.porConciliar > 0);
  if (pcs.length) B.push({ tipo: 'tabla', titulo: 'Por conciliar (no incluido en los totales)', head: ['Empresa', 'Crédito / contrato', 'Moneda del crédito', 'US$'],
    body: [...pcs.map(x => [x.empresa, etiquetaCredito(x), `${x.moneda} ${fmtMon(x.porConciliar, x.moneda)}`, x.usd ? fmtUSD(x.usd.porConciliar) : 'sin TC']), ['TOTAL', '', '', fmtUSD(inf.obligaciones.porConciliar)]], derecha: [3], estilos: [...pcs.map(() => 'credito'), 'total'] });
  // Avales y garantías de cada crédito (sin montos de deuda: varios avalistas no la duplican).
  const conAval = inf.filas.filter(x => x.avales.length);
  B.push({ tipo: 'tabla', titulo: 'Avales', head: ['Empresa', 'Crédito / contrato', 'Avalista', 'Monto declarado', '% de la deuda', 'Detalle'],
    body: conAval.length ? conAval.flatMap(x => x.avales.map(a => [x.empresa, etiquetaCredito(x), a.otorgante || 'Avalista sin nombre',
      Number(a.monto) > 0 ? `${a.moneda || 'USD'} ${fmtMon(Number(a.monto), a.moneda)}` : '—', Number(a.porcentaje) > 0 ? `${Number(a.porcentaje)}%` : '—',
      [a.bien, a.fecha && `desde ${fechaCL(a.fecha)}`, a.nota].filter(Boolean).join(' · ') || '—']))
      : [['—', `Ningún crédito tiene avales registrados.`, '', '', '', '']], derecha: [3, 4] });
  const conGar = inf.filas.filter(x => x.garantias.length || x.garantiasTexto);
  B.push({ tipo: 'tabla', titulo: 'Hipotecas, prendas y otras garantías', head: ['Empresa', 'Crédito / contrato', 'Garantías'],
    body: conGar.length ? conGar.map(x => [x.empresa, etiquetaCredito(x), textoGarantias(x)]) : [['—', 'Ningún crédito tiene garantías registradas.', '']] });
  if (detalle) bloques.forEach(({ g }) => g.grupos.forEach(e => e.filas.forEach(x => {
    B.push({ tipo: 'tabla', titulo: `${e.empresa} · ${etiquetaCredito(x)} · cuotas en ${x.moneda}`, head: COLS_CUOTA.map(c => c[1]),
      body: x.cuotas.map(q => COLS_CUOTA.map(([k]) => { const v = celdaCuota(q, k); return k === 'fecha' ? fechaCL(v) : (typeof v === 'number' ? fmtMon(v, x.moneda) : v); })),
      derecha: [2, 3, 4, 5, 6, 7, 8, 9] });
    const extra = [tcTexto(x), textoAjusteCapital(x), ...x.cuotas.flatMap(q => q.devengo.filter(d => !d.vencido && d.transcurrido > 0).map(d => `Cuota ${fechaCL(q.fecha)}: ${textoDevengo(d, x.moneda)}.`)), ...x.avisos].filter(Boolean);
    if (extra.length) B.push({ tipo: 'nota', texto: extra.join(' ') });
  })));
  B.push({ tipo: 'notas', titulo: 'Cómo se calcula', textos: notas });
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
