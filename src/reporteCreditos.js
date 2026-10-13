/* eslint-disable */
// ═══════════════════════════════════════════════════════════════════
// REPORTES DE CRÉDITOS — consulta y descarga (oct-2026). Modelo puro.
//
// NO es un motor de deuda: toma el cálculo vigente de src/creditos.js y solo
// FILTRA, ORDENA y AGRUPA. Cada cifra sale de:
//   · estado del crédito y saldos ............ estadoCredito(c al corte, corte)
//   · cuotas (capital/interés/cargos/estado) . estadoCredito(…).vencimientos
//                                              (= aplicarPagos sobre vencimientosCredito)
//   · pagos registrados ...................... pagosVigentes(c), totalPago(p)
//   · conversión a USD ....................... infoTC(c, tcData, corte) (Maestros o TC declarado)
// Las reglas de renovaciones, pagos parciales y cuotas por conciliar son las del modelo.
//
// DOS FECHAS DISTINTAS:
//   · corte ......... fecha del SALDO de deuda: cuentan los pagos con fecha efectiva ≤ corte
//                     (lo pagado después aún se debía al corte; igual que posicionAlCorte) y una
//                     cuota es «vencida» si vence antes del corte. También fija el TC.
//   · desde/hasta ... rango de CONSULTA del detalle: las cuotas por su FECHA DE VENCIMIENTO y los
//                     pagos por su FECHA EFECTIVA. No cambia el saldo de los créditos.
//
// EMPRESA = DEUDOR: el modelo no tiene un campo «deudor»; la empresa del crédito es la empresa
// deudora (así la rotula el formulario de Créditos). Se ofrece un solo filtro.
// ═══════════════════════════════════════════════════════════════════
import { estadoCredito, pagosVigentes, totalPago, infoTC, esAnulado, uidCredito, hoyISO, isoValida } from './creditos.js';

export const EMPRESAS_LINEA = ['Mediterra', 'Allegria Foods', 'Allegria Service', 'Frisku Foods', 'Osiris', 'Integrity Farms'];
export const EMPRESAS_JV = ['Allpa Farms', 'Allpa Farms Perú'];
export const LOGO_EMPRESA = {
  'Mediterra': '/med.png', 'Allegria Foods': '/allegria-logo.jpg', 'Allegria Service': '/allegria-service-logo.png',
  'Frisku Foods': '/frisku.png', 'Osiris': '/osiris-logo.jpg', 'Integrity Farms': '/integrity-logo.png',
  'Allpa Farms': '/allpa-chile-logo.png', 'Allpa Farms Perú': '/allpa-peru-logo.png',
};
export const LOGO_GRUPO = '/med.png';
export const ESTADOS_CREDITO = { vigente: 'Vigente', con_vencidos: 'Con cuotas vencidas', por_conciliar: 'Por conciliar', cerrado: 'Cerrado', anulado: 'Anulado' };
export const ESTADOS_CUOTA = { pendiente: 'Pendiente', parcial: 'Pago parcial', vencida: 'Vencida', por_conciliar: 'Por conciliar', pagada: 'Pagada' };
export const TIPOS_PAGO = { pago: 'Pago', prepago: 'Prepago', refinanciamiento: 'Refinanciamiento', extincion: 'Extinción (sin caja)' };

const num = (x) => (Number.isFinite(Number(x)) ? Number(x) : 0);
const r2 = (x) => Math.round((Number(x) || 0) * 100) / 100;
const r4 = (x) => Math.round((Number(x) || 0) * 10000) / 10000;
const rMon = (m) => (m === 'UF' ? r4 : r2);
const enRango = (iso, d, h) => !!iso && (!d || iso >= d) && (!h || iso <= h);
const conjunto = (xs) => (Array.isArray(xs) && xs.length ? new Set(xs) : null);

// El crédito tal como estaba al corte: solo los pagos con fecha efectiva ≤ corte.
export const alCorte = (c, corte) => ({ ...c, pagos: (c.pagos || []).filter(p => p && p.fecha && p.fecha <= corte) });

// filtros = { empresas[], acreedores[], estadosCredito[], estadosCuota[], desde, hasta }
// opciones = { corte, tcData, empresasPermitidas (null = todas) }
export function construirReporte(creditos, filtros = {}, { corte = hoyISO(), tcData = null, empresasPermitidas = null } = {}) {
  const errores = [];
  if (!isoValida(corte)) errores.push('Fecha de corte inválida.');
  if (filtros.desde && !isoValida(filtros.desde)) errores.push('Fecha «desde» inválida.');
  if (filtros.hasta && !isoValida(filtros.hasta)) errores.push('Fecha «hasta» inválida.');
  if (filtros.desde && filtros.hasta && filtros.desde > filtros.hasta) errores.push('El rango de fechas está invertido (desde > hasta).');
  const permitidas = conjunto(empresasPermitidas);
  const fEmp = conjunto(filtros.empresas), fAcr = conjunto(filtros.acreedores);
  const fEstC = conjunto(filtros.estadosCredito), fEstQ = conjunto(filtros.estadosCuota), fTipoP = conjunto(filtros.tiposPago);
  const { desde = '', hasta = '' } = filtros;

  const filasCreditos = [], filasCuotas = [], filasPagos = [];
  if (!errores.length) (creditos || []).forEach(c0 => {
    if (!c0 || typeof c0 !== 'object') return;
    if (permitidas && !permitidas.has(c0.empresa)) return;           // permisos: también en descargas
    if (fEmp && !fEmp.has(c0.empresa)) return;
    if (fAcr && !fAcr.has(c0.acreedor)) return;
    const anulado = esAnulado(c0);
    const e = estadoCredito(alCorte(c0, corte), corte);
    const estado = anulado ? 'anulado' : e.estado;
    if (fEstC ? !fEstC.has(estado) : anulado) return;               // por defecto, sin anulados
    const uid = uidCredito(c0), moneda = c0.moneda || 'USD', R = rMon(moneda);
    const tc = infoTC(c0, tcData, corte);
    const f = tc ? tc.factor : null;
    const aUSD = (x) => (f === null ? null : r2(num(x) * f));
    // Cuotas del rango (por fecha de vencimiento) y del estado elegido.
    const cuotas = e.vencimientos.filter(v => enRango(v.fecha, desde, hasta) && (!fEstQ || fEstQ.has(v.estado)));
    cuotas.forEach(v => filasCuotas.push({
      creditoId: uid, cuotaId: v.key, n: c0.n, empresa: c0.empresa, acreedor: c0.acreedor || '', moneda,
      fecha: v.fecha, origen: v.origen === 'renovacion' ? `Renovación ${num(v.renovacion) + 1}` : 'Cuota',
      capital: R(v.capital), interes: R(v.interes), cargos: R(v.cargos), sinDesglose: R(v.sinDesglose),
      total: R(num(v.capital) + num(v.interes) + num(v.cargos) + num(v.sinDesglose)),
      pagadoAlCorte: R(v.pagadoTotal), pendienteAlCorte: R(v.pendienteTotal), pendienteCapital: R(v.pendiente.capital),
      estado: v.estado, porConciliar: !!v.porConciliar, nPagos: (v.pagos || []).length,
    }));
    // Pagos vigentes del rango (por fecha efectiva). Los posteriores al corte se listan, marcados.
    const pagos = pagosVigentes(c0).filter(p => enRango(p.fecha, desde, hasta) && (!fTipoP || fTipoP.has(p.tipo || 'pago')));
    pagos.forEach(p => filasPagos.push({
      creditoId: uid, pagoId: p.id || '', cuotaId: p.vencKey || '', n: c0.n, empresa: c0.empresa, acreedor: c0.acreedor || '', moneda,
      fecha: p.fecha, tipo: p.tipo || 'pago', capital: R(p.capital), interes: R(p.interes), cargos: R(p.cargos), sinDesglose: R(p.sinDesglose),
      total: R(totalPago(p)), posteriorAlCorte: p.fecha > corte, sinCaja: p.tipo === 'extincion', nota: p.nota || '',
    }));
    filasCreditos.push({
      creditoId: uid, n: c0.n, empresa: c0.empresa, acreedor: c0.acreedor || '', tipoAcreedor: c0.tipo_acreedor || c0.tipo_inst || '',
      tipo: c0.tipo_cr || (c0.tipo_credito === 'contrato' ? 'Contrato' : c0.tipo_credito === 'socio' ? 'Crédito de socio' : ''),
      moneda, montoOriginal: num(c0.monto) > 0 ? R(c0.monto) : null,
      desembolso: c0.fecha_desembolso || c0.f_inicio || '', vencimientoFinal: e.vencimientoFinal || '',
      capitalPendiente: anulado ? 0 : e.saldoCapital, sinDesglosePendiente: anulado ? 0 : e.sinDesglosePend,
      interesPendiente: anulado ? 0 : e.interesPend, cargosPendiente: anulado ? 0 : e.cargosPend,
      pendienteTotal: anulado ? 0 : e.pendienteTotal, vencidoTotal: anulado ? 0 : e.vencidoTotal,
      porConciliarTotal: anulado ? 0 : e.porConciliarTotal, porConciliarCapital: anulado ? 0 : e.porConciliarCapital,
      pagadoCapital: e.pagadoCapital, pagadoTotal: e.pagadoTotal,
      nPagos: pagosVigentes(alCorte(c0, corte)).length, nCuotas: e.vencimientos.length,
      nCuotasEnRango: cuotas.length, nPagosEnRango: pagos.length,
      estado, tc: tc ? { valor: tc.tc, fecha: tc.fecha, fuente: tc.fuente, par: tc.par || 'USD', estimado: !!tc.estimado } : null,
      usd: {
        capitalPendiente: anulado ? 0 : aUSD(e.saldoCapital), pendienteTotal: anulado ? 0 : aUSD(e.pendienteTotal),
        interesPendiente: anulado ? 0 : aUSD(e.interesPend), porConciliarTotal: anulado ? 0 : aUSD(e.porConciliarTotal),
        montoOriginal: num(c0.monto) > 0 ? aUSD(c0.monto) : null,
      },
    });
  });
  const orden = (a, b) => (a.empresa || '').localeCompare(b.empresa || '') || (a.acreedor || '').localeCompare(b.acreedor || '')
    || String(a.creditoId).localeCompare(String(b.creditoId)) || (a.fecha || '').localeCompare(b.fecha || '');
  filasCreditos.sort(orden); filasCuotas.sort(orden); filasPagos.sort(orden);
  return { errores, corte, filtros: { ...filtros }, creditos: filasCreditos, cuotas: filasCuotas, pagos: filasPagos,
    resumen: resumir(filasCreditos, filasCuotas, filasPagos) };
}

// Sumas por empresa y moneda (moneda original) + USD con TC. Nunca suma monedas distintas.
const CAMPOS = ['capitalPendiente', 'sinDesglosePendiente', 'interesPendiente', 'cargosPendiente', 'pendienteTotal', 'vencidoTotal', 'porConciliarTotal', 'pagadoTotal'];
function resumir(creds, cuotas, pagos) {
  const porEmpresa = {};
  creds.forEach(c => {
    const e = porEmpresa[c.empresa] || (porEmpresa[c.empresa] = { empresa: c.empresa, monedas: {}, usd: { capitalPendiente: 0, pendienteTotal: 0, porConciliarTotal: 0 }, sinTC: [], n: 0 });
    const R = rMon(c.moneda);
    const m = e.monedas[c.moneda] || (e.monedas[c.moneda] = Object.fromEntries([...CAMPOS.map(k => [k, 0]), ['n', 0], ['usdCapital', 0], ['usdPorConciliar', 0], ['sinTC', 0]]));
    CAMPOS.forEach(k => { m[k] = R(m[k] + num(c[k])); }); m.n++; e.n++;
    if (c.tc) { m.usdCapital = r2(m.usdCapital + num(c.usd.capitalPendiente)); m.usdPorConciliar = r2(m.usdPorConciliar + num(c.usd.porConciliarTotal)); } else m.sinTC++;
    if (c.tc) { e.usd.capitalPendiente = r2(e.usd.capitalPendiente + num(c.usd.capitalPendiente)); e.usd.pendienteTotal = r2(e.usd.pendienteTotal + num(c.usd.pendienteTotal)); e.usd.porConciliarTotal = r2(e.usd.porConciliarTotal + num(c.usd.porConciliarTotal)); }
    else e.sinTC.push({ creditoId: c.creditoId, n: c.n, acreedor: c.acreedor, moneda: c.moneda });
  });
  Object.values(porEmpresa).forEach(e => { e.usdIncompleto = e.sinTC.length > 0; });
  const agregar = (empresas) => {
    const lista = empresas.map(x => porEmpresa[x]).filter(Boolean);
    const monedas = {};
    lista.forEach(e => Object.entries(e.monedas).forEach(([mon, v]) => {
      const R = rMon(mon), t = monedas[mon] || (monedas[mon] = Object.fromEntries([...CAMPOS.map(k => [k, 0]), ['n', 0], ['usdCapital', 0], ['usdPorConciliar', 0], ['sinTC', 0]]));
      CAMPOS.forEach(k => { t[k] = R(t[k] + v[k]); }); t.n += v.n;
      t.usdCapital = r2(t.usdCapital + v.usdCapital); t.usdPorConciliar = r2(t.usdPorConciliar + v.usdPorConciliar); t.sinTC += v.sinTC;
    }));
    const usd = { capitalPendiente: 0, pendienteTotal: 0, porConciliarTotal: 0 };
    lista.forEach(e => Object.keys(usd).forEach(k => { usd[k] = r2(usd[k] + e.usd[k]); }));
    const sinTC = lista.flatMap(e => e.sinTC.map(s => ({ ...s, empresa: e.empresa })));
    return { empresas: lista.map(e => e.empresa), monedas, usd, sinTC, usdIncompleto: sinTC.length > 0 };
  };
  const presentes = Object.keys(porEmpresa);
  const otras = presentes.filter(x => !EMPRESAS_LINEA.includes(x) && !EMPRESAS_JV.includes(x));
  return {
    porEmpresa,
    // Consolidado por defecto: las seis sociedades línea a línea. JV: aparte, nunca sumadas.
    consolidado: agregar(EMPRESAS_LINEA),
    jv: agregar(EMPRESAS_JV),
    otras: otras.length ? agregar(otras) : null,
    conteos: { creditos: creds.length, cuotas: cuotas.length, pagos: pagos.length },
    totalesCuotas: totalesPorMoneda(cuotas, ['capital', 'interes', 'cargos', 'sinDesglose', 'total', 'pagadoAlCorte', 'pendienteAlCorte']),
    totalesPagos: totalesPorMoneda(pagos.filter(p => !p.sinCaja), ['capital', 'interes', 'cargos', 'sinDesglose', 'total']),
  };
}
export function totalesPorMoneda(filas, campos) {
  const out = {};
  filas.forEach(f => {
    const R = rMon(f.moneda), t = out[f.moneda] || (out[f.moneda] = Object.fromEntries([...campos.map(k => [k, 0]), ['n', 0]]));
    campos.forEach(k => { t[k] = R(t[k] + num(f[k])); }); t.n++;
  });
  return out;
}

// Texto de los filtros, IGUAL en pantalla, Excel y PDF (una sola fuente).
export function describirFiltros(rep, { alcance } = {}) {
  const f = rep.filtros || {};
  const fmt = (iso) => (iso ? iso.split('-').reverse().join('-') : '');
  const lista = (xs, nombres) => (Array.isArray(xs) && xs.length ? xs.map(x => (nombres && nombres[x]) || x).join(', ') : 'todos');
  return [
    ['Alcance', alcance || 'Créditos visibles'],
    ['Saldo de deuda al corte', `${fmt(rep.corte)} · pagos con fecha efectiva hasta esa fecha; TC a esa fecha`],
    ['Rango del detalle', (f.desde || f.hasta) ? `${f.desde ? fmt(f.desde) : 'inicio'} a ${f.hasta ? fmt(f.hasta) : 'sin límite'} · cuotas por fecha de vencimiento; pagos por fecha efectiva` : 'sin rango · todas las cuotas y pagos'],
    ['Empresa (deudora)', lista(f.empresas)],
    ['Acreedor', lista(f.acreedores)],
    ['Estado del crédito', Array.isArray(f.estadosCredito) && f.estadosCredito.length ? lista(f.estadosCredito, ESTADOS_CREDITO) : 'todos salvo anulados'],
    ['Estado de la cuota', lista(f.estadosCuota, ESTADOS_CUOTA) + (Array.isArray(f.estadosCuota) && f.estadosCuota.length ? ' · filtra el detalle de cuotas; no cambia la lista de créditos ni su saldo' : '')],
    ['Tipo de pago', lista(f.tiposPago, TIPOS_PAGO) + ' · solo pagos vigentes (los anulados no se listan)' + (Array.isArray(f.tiposPago) && f.tiposPago.length ? '; filtra el detalle de pagos, no el saldo' : '')],
  ];
}

// ═══════════════════════════════════════════════════════════════════
// TABLAS — una sola definición para pantalla, Excel y PDF
// ═══════════════════════════════════════════════════════════════════
// Cada tabla: { titulo, columnas:[{t, k, tipo:'texto'|'monto'|'usd'|'fecha'|'entero'}], filas:[{tipo, celdas:{k:valor}, moneda}] }
// tipo de fila: 'dato' | 'subtotal' | 'total' | 'seccion'. Los subtotales van INMEDIATAMENTE
// después de las filas que resumen. Ningún total suma monedas distintas: hay un total por moneda
// y un total en USD que solo incluye lo que tiene TC (y dice INCOMPLETO si falta alguno).
export const ALCANCES = { empresa: 'Reporte por empresa', consolidado: 'Consolidado (6 sociedades línea a línea; JV aparte)' };
const perimetro = (emp) => (EMPRESAS_LINEA.includes(emp) ? 'Línea a línea' : EMPRESAS_JV.includes(emp) ? 'JV (aparte, no sumada)' : 'Fuera del perímetro');
const rangoPerimetro = (emp) => (EMPRESAS_LINEA.includes(emp) ? 0 : EMPRESAS_JV.includes(emp) ? 1 : 2);
const fmtF = (iso) => (iso ? iso.split('-').reverse().join('-') : '');

function agrupar(filas, clave) {
  const g = new Map(); filas.forEach(f => { const k = clave(f); if (!g.has(k)) g.set(k, []); g.get(k).push(f); }); return g;
}
// Filas de detalle agrupadas por empresa y, dentro de ella, por moneda: cada subtotal va
// INMEDIATAMENTE después de las filas que suma (nunca suma monedas distintas).
function filasConSubtotales(filas, campos, etiqueta, datosFila) {
  const out = [];
  const ord = [...filas].sort((a, b) => rangoPerimetro(a.empresa) - rangoPerimetro(b.empresa) || (a.empresa || '').localeCompare(b.empresa || '')
    || (a.moneda || '').localeCompare(b.moneda || ''));
  agrupar(ord, f => `${f.empresa}\u0000${f.moneda}`).forEach((lista) => {
    const emp = lista[0].empresa, mon = lista[0].moneda;
    lista.forEach(f => out.push({ tipo: 'dato', moneda: f.moneda, celdas: datosFila(f) }));
    const t = totalesPorMoneda(lista, campos)[mon];
    out.push({ tipo: 'subtotal', moneda: mon, celdas: { empresa: `${etiqueta} ${emp} · ${mon}`, moneda: mon, ...Object.fromEntries(campos.map(k => [k, t[k]])), _n: t.n } });
  });
  return out;
}

export function tablasReporte(rep, { alcance = 'consolidado', empresa = '' } = {}) {
  const R = rep.resumen;
  const avisos = [];
  const columnasResumen = [
    { t: 'Empresa', k: 'empresa', tipo: 'texto' }, { t: 'Perímetro', k: 'perimetro', tipo: 'texto' }, { t: 'Moneda', k: 'moneda', tipo: 'texto' },
    { t: 'Créditos', k: 'n', tipo: 'entero' }, { t: 'Capital pendiente (confirmado)', k: 'capitalPendiente', tipo: 'monto' },
    { t: 'Sin desglose pendiente', k: 'sinDesglosePendiente', tipo: 'monto' }, { t: 'Intereses pendientes', k: 'interesPendiente', tipo: 'monto' },
    { t: 'Cargos pendientes', k: 'cargosPendiente', tipo: 'monto' }, { t: 'Pendiente total', k: 'pendienteTotal', tipo: 'monto' },
    { t: 'Vencido', k: 'vencidoTotal', tipo: 'monto' }, { t: 'Por conciliar (no confirmado)', k: 'porConciliarTotal', tipo: 'monto' },
    { t: 'Pagado al corte', k: 'pagadoTotal', tipo: 'monto' },
    { t: 'Capital pendiente USD', k: 'usdCapital', tipo: 'usd' }, { t: 'Por conciliar USD', k: 'usdPorConciliar', tipo: 'usd' },
  ];
  const filasResumen = [];
  const bloque = (titulo, empresas, totalEtiqueta, sumaAlTotal) => {
    const presentes = empresas.filter(e => R.porEmpresa[e]);
    if (!presentes.length) return;
    filasResumen.push({ tipo: 'seccion', celdas: { empresa: titulo } });
    presentes.forEach(emp => {
      const e = R.porEmpresa[emp];
      Object.entries(e.monedas).forEach(([mon, v]) => filasResumen.push({ tipo: 'dato', moneda: mon, celdas: { empresa: emp, perimetro: perimetro(emp), moneda: mon, ...v,
        usdCapital: v.sinTC ? (v.sinTC === v.n ? null : v.usdCapital) : v.usdCapital, usdPorConciliar: v.sinTC === v.n ? null : v.usdPorConciliar } }));
      const todoSinTC = e.sinTC.length === e.n;
      if (presentes.length > 1) filasResumen.push({ tipo: 'subtotal', moneda: 'USD', celdas: { empresa: `Total ${emp} en USD${e.usdIncompleto ? ' (INCOMPLETO: falta TC)' : ''}`, moneda: 'USD',
        usdCapital: todoSinTC ? null : e.usd.capitalPendiente, usdPorConciliar: todoSinTC ? null : e.usd.porConciliarTotal } });
    });
    const ag = { monedas: {}, usd: { capitalPendiente: 0, porConciliarTotal: 0 }, sinTC: [] };
    presentes.forEach(emp => { const e = R.porEmpresa[emp];
      Object.entries(e.monedas).forEach(([mon, v]) => { const t = ag.monedas[mon] || (ag.monedas[mon] = { n: 0, ...Object.fromEntries(CAMPOS.map(k => [k, 0])) }); CAMPOS.forEach(k => { t[k] = rMon(mon)(t[k] + v[k]); }); t.n += v.n; });
      ag.usd.capitalPendiente = r2(ag.usd.capitalPendiente + e.usd.capitalPendiente); ag.usd.porConciliarTotal = r2(ag.usd.porConciliarTotal + e.usd.porConciliarTotal); ag.sinTC.push(...e.sinTC); });
    Object.entries(ag.monedas).forEach(([mon, t]) => filasResumen.push({ tipo: 'total', moneda: mon, celdas: { empresa: `${totalEtiqueta} · ${mon}`, moneda: mon, ...t } }));
    filasResumen.push({ tipo: 'total', moneda: 'USD', celdas: { empresa: `${totalEtiqueta} en USD${ag.sinTC.length ? ' (INCOMPLETO: falta TC)' : ''}${sumaAlTotal ? '' : ' · no se suma al consolidado'}`,
      moneda: 'USD', ...(ag.sinTC.length === presentes.reduce((n, emp) => n + R.porEmpresa[emp].n, 0)
        ? { usdCapital: null, usdPorConciliar: null } : { usdCapital: ag.usd.capitalPendiente, usdPorConciliar: ag.usd.porConciliarTotal }) } });
  };
  const presentes = Object.keys(R.porEmpresa);
  if (alcance === 'empresa') bloque(empresa || presentes[0] || 'Empresa', [empresa || presentes[0]].filter(Boolean), `Total ${empresa}`, true);
  else {
    bloque('Consolidado · sociedades línea a línea', EMPRESAS_LINEA, 'TOTAL GENERAL', true);
    bloque('JV · método de participación (se muestran aparte, NO se suman)', EMPRESAS_JV, 'Total JV', false);
    const otras = presentes.filter(x => !EMPRESAS_LINEA.includes(x) && !EMPRESAS_JV.includes(x));
    if (otras.length) bloque('Otras empresas (fuera del perímetro)', otras, 'Total otras', false);
  }
  const sinTC = rep.creditos.filter(c => !c.tc);
  if (sinTC.length) avisos.push(`Sin tipo de cambio a la fecha de corte (los totales en USD están INCOMPLETOS; estos importes siguen en su moneda original): ${sinTC.map(c => `crédito ${c.creditoId}${c.n != null ? ` (N° ${c.n})` : ''} · ${c.empresa} · ${c.acreedor} · ${c.moneda}`).join('; ')}.`);
  const estimados = rep.creditos.filter(c => c.tc && c.tc.estimado);
  if (estimados.length) avisos.push(`TC declarado en el crédito (hipótesis, no de Maestros): ${estimados.map(c => `${c.creditoId} ${c.moneda} ${c.tc.valor}${c.tc.fecha ? ` al ${fmtF(c.tc.fecha)}` : ''}`).join('; ')}.`);
  if (rep.creditos.some(c => c.porConciliarTotal > 0)) avisos.push('«Por conciliar»: cuotas vencidas antes del control en la app y sin pago registrado. No se suman al capital confirmado; se informan aparte.');
  if (rep.pagos.some(p => p.posteriorAlCorte)) avisos.push('Hay pagos con fecha posterior al corte dentro del rango: se listan, pero no reducen el saldo al corte.');
  // Tipos de cambio usados (uno por moneda, par, fecha y fuente)
  const tcUsados = [];
  const vistos = new Set();
  rep.creditos.forEach(c => { if (!c.tc || c.moneda === 'USD') return; const k = `${c.moneda}|${c.tc.valor}|${c.tc.fecha}|${c.tc.fuente}`; if (vistos.has(k)) return; vistos.add(k);
    tcUsados.push({ moneda: c.moneda, tc: c.tc.valor, fecha: c.tc.fecha ? fmtF(c.tc.fecha) : 's/f', fuente: c.tc.fuente, par: c.tc.par }); });

  const colCred = [
    { t: 'ID crédito', k: 'creditoId', tipo: 'texto' }, { t: 'N°', k: 'n', tipo: 'entero' }, { t: 'Empresa (deudora)', k: 'empresa', tipo: 'texto' },
    { t: 'Perímetro', k: 'perimetro', tipo: 'texto' }, { t: 'Acreedor', k: 'acreedor', tipo: 'texto' }, { t: 'Tipo', k: 'tipo', tipo: 'texto' },
    { t: 'Moneda', k: 'moneda', tipo: 'texto' }, { t: 'Monto original', k: 'montoOriginal', tipo: 'monto' },
    { t: 'Desembolso', k: 'desembolso', tipo: 'fecha' }, { t: 'Vencimiento final', k: 'vencimientoFinal', tipo: 'fecha' },
    { t: 'Capital pendiente (confirmado)', k: 'capitalPendiente', tipo: 'monto' }, { t: 'Sin desglose', k: 'sinDesglosePendiente', tipo: 'monto' },
    { t: 'Intereses pendientes', k: 'interesPendiente', tipo: 'monto' }, { t: 'Pendiente total', k: 'pendienteTotal', tipo: 'monto' },
    { t: 'Vencido', k: 'vencidoTotal', tipo: 'monto' }, { t: 'Por conciliar', k: 'porConciliarTotal', tipo: 'monto' },
    { t: 'Pagado al corte', k: 'pagadoTotal', tipo: 'monto' }, { t: 'Pagos al corte', k: 'nPagos', tipo: 'entero' },
    { t: 'Cuotas en rango', k: 'nCuotasEnRango', tipo: 'entero' }, { t: 'Estado', k: 'estadoTxt', tipo: 'texto' },
    { t: 'TC (moneda por US$)', k: 'tcTxt', tipo: 'texto' }, { t: 'Capital pendiente USD', k: 'usdCapital', tipo: 'usd' },
  ];
  const credFilas = filasConSubtotales(rep.creditos,
    ['montoOriginal', 'capitalPendiente', 'sinDesglosePendiente', 'interesPendiente', 'pendienteTotal', 'vencidoTotal', 'porConciliarTotal', 'pagadoTotal'], 'Subtotal',
    (c) => ({ ...c, perimetro: perimetro(c.empresa), estadoTxt: ESTADOS_CREDITO[c.estado] || c.estado,
      tcTxt: c.moneda === 'USD' ? '—' : c.tc ? `${c.tc.valor} · ${c.tc.fecha ? fmtF(c.tc.fecha) : 's/f'} · ${c.tc.fuente}` : 'SIN TC', usdCapital: c.usd.capitalPendiente }));
  const colCuo = [
    { t: 'ID crédito', k: 'creditoId', tipo: 'texto' }, { t: 'ID cuota', k: 'cuotaId', tipo: 'texto' }, { t: 'Empresa', k: 'empresa', tipo: 'texto' },
    { t: 'Acreedor', k: 'acreedor', tipo: 'texto' }, { t: 'Moneda', k: 'moneda', tipo: 'texto' }, { t: 'Vencimiento', k: 'fecha', tipo: 'fecha' },
    { t: 'Origen', k: 'origen', tipo: 'texto' }, { t: 'Capital', k: 'capital', tipo: 'monto' }, { t: 'Interés', k: 'interes', tipo: 'monto' },
    { t: 'Cargos', k: 'cargos', tipo: 'monto' }, { t: 'Sin desglose', k: 'sinDesglose', tipo: 'monto' }, { t: 'Total cuota', k: 'total', tipo: 'monto' },
    { t: 'Pagado al corte', k: 'pagadoAlCorte', tipo: 'monto' }, { t: 'Pendiente al corte', k: 'pendienteAlCorte', tipo: 'monto' },
    { t: 'Estado al corte', k: 'estadoTxt', tipo: 'texto' },
  ];
  const cuoFilas = filasConSubtotales(rep.cuotas, ['capital', 'interes', 'cargos', 'sinDesglose', 'total', 'pagadoAlCorte', 'pendienteAlCorte'], 'Subtotal',
    (q) => ({ ...q, estadoTxt: ESTADOS_CUOTA[q.estado] || q.estado }));
  const colPag = [
    { t: 'ID crédito', k: 'creditoId', tipo: 'texto' }, { t: 'ID pago', k: 'pagoId', tipo: 'texto' }, { t: 'ID cuota', k: 'cuotaId', tipo: 'texto' },
    { t: 'Empresa', k: 'empresa', tipo: 'texto' }, { t: 'Acreedor', k: 'acreedor', tipo: 'texto' }, { t: 'Moneda', k: 'moneda', tipo: 'texto' },
    { t: 'Fecha efectiva', k: 'fecha', tipo: 'fecha' }, { t: 'Tipo', k: 'tipoTxt', tipo: 'texto' }, { t: 'Capital', k: 'capital', tipo: 'monto' },
    { t: 'Interés', k: 'interes', tipo: 'monto' }, { t: 'Cargos', k: 'cargos', tipo: 'monto' }, { t: 'Sin desglose', k: 'sinDesglose', tipo: 'monto' },
    { t: 'Total', k: 'total', tipo: 'monto' }, { t: 'Respecto del corte', k: 'corteTxt', tipo: 'texto' },
  ];
  // Las extinciones (sin caja) se listan, pero no entran a los subtotales de pagos.
  const pagFilas = filasConSubtotales(rep.pagos.filter(p => !p.sinCaja), ['capital', 'interes', 'cargos', 'sinDesglose', 'total'], 'Subtotal',
    (p) => ({ ...p, tipoTxt: TIPOS_PAGO[p.tipo] || p.tipo, corteTxt: p.posteriorAlCorte ? 'Posterior al corte' : 'Hasta el corte' }));
  rep.pagos.filter(p => p.sinCaja).forEach(p => pagFilas.push({ tipo: 'dato', moneda: p.moneda,
    celdas: { ...p, tipoTxt: TIPOS_PAGO[p.tipo], corteTxt: (p.posteriorAlCorte ? 'Posterior al corte' : 'Hasta el corte') + ' · fuera de subtotales' } }));
  const titulo = alcance === 'empresa' ? `Créditos · ${empresa}` : 'Créditos · Consolidado Grupo Mediterra';
  return {
    titulo, alcance, empresa, logo: alcance === 'empresa' ? (LOGO_EMPRESA[empresa] || LOGO_GRUPO) : LOGO_GRUPO,
    encabezado: describirFiltros(rep, { alcance: alcance === 'empresa' ? `${ALCANCES.empresa}: ${empresa}` : ALCANCES.consolidado }),
    tcUsados, avisos, vacio: rep.creditos.length === 0,
    resumen: { titulo: 'Resumen', columnas: columnasResumen, filas: filasResumen },
    creditos: { titulo: 'Créditos', columnas: colCred, filas: credFilas },
    cuotas: { titulo: 'Cuotas', columnas: colCuo, filas: cuoFilas },
    pagos: { titulo: 'Pagos registrados', columnas: colPag, filas: pagFilas },
  };
}

// Formato de un valor según su columna y la moneda de la fila (mismo en pantalla y PDF).
export function formatoCelda(valor, col, moneda) {
  if (valor === null || valor === undefined || valor === '') return col.tipo === 'usd' && valor === null ? 'sin TC' : '';
  if (col.tipo === 'fecha') return fmtF(valor);
  if (col.tipo === 'entero') return String(valor);
  if (col.tipo === 'monto' || col.tipo === 'usd') {
    const dec = col.tipo === 'usd' ? 2 : (moneda === 'UF' ? 4 : moneda === 'CLP' ? 0 : 2);
    return Number(valor).toLocaleString('es-CL', { minimumFractionDigits: dec, maximumFractionDigits: dec });
  }
  return String(valor);
}
