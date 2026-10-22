// Informe de deuda al corte — modelo puro (sin React), probado con
//   node src/informeDeuda.test.mjs
//
// Lee los MISMOS vencimientos y pagos que el resto de Créditos
// (vencimientosCredito + aplicarPagos de creditos.js); no recalcula calendarios.
//
// Definiciones (decisión del CFO, 22-10-2026):
//   saldo deuda        = capital pendiente + intereses DEVENGADOS no pagados
//                        + cargos vencidos impagos            (lo que se debe al corte)
//   por devengar       = intereses de cuotas futuras aún no devengados al corte
//   total por pagar    = saldo deuda + por devengar + cargos futuros (compromiso de caja)
//   sin desglose       = cuotas antiguas que no separan capital de interés: van APARTE,
//                        no se suman a ninguna de las cifras anteriores (no se inventa la división).
//   por conciliar      = cuotas históricas no confirmadas: fuera de todo, se informan aparte.
//
// Devengo: el interés de cada cuota se reparte en proporción al tiempo
// transcurrido entre el inicio de su período (vencimiento anterior del mismo
// crédito o, si es la primera, la fecha de desembolso) y su vencimiento, medido
// con la BASE del contrato (30/360, Actual/360, Actual/365). Registros por
// vencimiento y créditos de socio: por días (Actual/365). Lo ya pagado de esa
// cuota se descuenta primero de lo devengado. Una cuota vencida e impaga está
// devengada completa. Sin fecha de inicio no se puede devengar: se declara.
import {
  vencimientosCredito, aplicarPagos, esAnulado, esContrato, esSocio, factorVencimiento,
  capitalizadoNoVigenteAl, fraccionAnio, isoValida, tasaCredito, uidCredito, fechaDesembolsoCredito,
  MODALIDADES,
} from './creditos.js';

const r2 = (x) => Math.round((Number(x) || 0) * 100) / 100;
const num = (x) => { const n = parseFloat(String(x ?? '').replace(',', '.')); return isFinite(n) ? n : 0; };
const EPS = 0.005;

// ── Clasificación ───────────────────────────────────────────────────
export const CLASIFICACIONES = ['Estructurado', 'No estructurado', 'Socios', 'Otros'];
// Tipo de crédito (campo "Tipo de crédito") → clasificación sugerida.
export const CLASIF_POR_TIPO = {
  'Leasing': 'Estructurado', 'Crédito Hipotecario': 'Estructurado', 'Inversión': 'Estructurado', 'Cuotas Mensuales': 'Estructurado',
  'PAE': 'No estructurado', 'Capital de trabajo': 'No estructurado', 'Bullet': 'No estructurado',
};
const ACREEDOR_OTROS = ['Cliente', 'Empresa relacionada', 'Persona natural', 'Otro', 'Privado'];

// Devuelve { valor, origen: 'manual'|'sugerida'|'sin_dato', motivo }.
export function clasificacionSugerida(c) {
  if (!c) return { valor: null, origen: 'sin_dato', motivo: 'sin crédito' };
  const acreedor = c.tipo_acreedor || c.tipo_inst || '';
  if (esSocio(c) || acreedor === 'Socio') return { valor: 'Socios', origen: 'sugerida', motivo: 'crédito de socio' };
  if (ACREEDOR_OTROS.includes(acreedor)) return { valor: 'Otros', origen: 'sugerida', motivo: `acreedor: ${acreedor}` };
  if (CLASIF_POR_TIPO[c.tipo_cr]) return { valor: CLASIF_POR_TIPO[c.tipo_cr], origen: 'sugerida', motivo: `tipo de crédito: ${c.tipo_cr}` };
  if (esContrato(c)) {
    if (c.modalidad === 'bullet_int' || c.modalidad === 'bullet_total') return { valor: 'No estructurado', origen: 'sugerida', motivo: `modalidad: ${MODALIDADES[c.modalidad]}` };
    if (MODALIDADES[c.modalidad]) return { valor: 'Estructurado', origen: 'sugerida', motivo: `modalidad: ${MODALIDADES[c.modalidad]}` };
  }
  return { valor: null, origen: 'sin_dato', motivo: 'falta el tipo de crédito' };
}
export function clasificacionCredito(c) {
  if (c && CLASIFICACIONES.includes(c.clasificacion)) return { valor: c.clasificacion, origen: 'manual', motivo: 'elegida en el crédito' };
  return clasificacionSugerida(c);
}

// ── Garantías (lista estructurada; el texto antiguo se conserva) ────
export const TIPOS_GARANTIA = ['Aval', 'Hipoteca', 'Prenda', 'Fianza', 'Warrant', 'Otra'];
export function garantiasCredito(c) {
  return (c && Array.isArray(c.garantias_lista) ? c.garantias_lista : []).filter(g => g && !g.anulada && (g.tipo || g.otorgante || g.bien));
}
export function textoGarantia(g) {
  const partes = [g.tipo || 'Garantía', g.otorgante && `otorga ${g.otorgante}`, g.bien, num(g.monto) > 0 && `${g.moneda || 'USD'} ${num(g.monto).toLocaleString('es-CL')}`];
  return partes.filter(Boolean).join(' · ');
}

// ── Informe ─────────────────────────────────────────────────────────
// creditos: ya valorizados (valorizarCreditos) si se quieren TC de Maestros.
export function informeDeuda(creditos, corte) {
  const filas = [], cuotasSinDesglose = [], sinTC = [];
  (creditos || []).filter(c => c && !esAnulado(c)).forEach(c => {
    // Solo los pagos con fecha ≤ corte: lo pagado después aún se debía al corte.
    const cc = { ...c, pagos: (c.pagos || []).filter(p => p && p.fecha && p.fecha <= corte) };
    const vencs = aplicarPagos(cc, vencimientosCredito(c), corte).vencimientos;
    const t = tasaCredito(c);
    const f = { capital: 0, devengado: 0, cargosVencidos: 0, porDevengar: 0, cargosFuturos: 0, sinDesglose: 0, porConciliar: 0 };
    const avisos = [];
    let sinInicio = false, cuotasSD = 0;
    const desembolso = fechaDesembolsoCredito(c);
    const base = esContrato(c) && ['30360', 'act360', 'act365'].includes(c.base) ? c.base : 'act365';
    vencs.forEach((v, i) => {
      if (!(v.pendienteTotal > 0)) return;
      if (v.porConciliar) { f.porConciliar += v.pendienteTotal; return; }
      const noVig = capitalizadoNoVigenteAl(v, corte);
      f.capital += v.pendiente.capital - noVig;
      const intPend = v.pendiente.interes + noVig;
      if (v.fecha <= corte) {
        f.devengado += intPend; f.cargosVencidos += v.pendiente.cargos;
      } else {
        f.cargosFuturos += v.pendiente.cargos;
        if (intPend > EPS) {
          const prev = vencs.slice(0, i).reverse().find(x => x.fecha < v.fecha);
          const inicio = prev ? prev.fecha : (isoValida(desembolso) ? desembolso : null);
          if (!inicio || inicio >= v.fecha) { sinInicio = true; f.porDevengar += intPend; }
          else {
            const frac = Math.min(1, Math.max(0, fraccionAnio(base, inicio, corte) / fraccionAnio(base, inicio, v.fecha)));
            const intCuota = intPend + (v.pagado ? v.pagado.interes : 0);
            const dev = Math.min(intPend, Math.max(0, intCuota * frac - (v.pagado ? v.pagado.interes : 0)));
            f.devengado += dev; f.porDevengar += intPend - dev;
          }
        }
      }
      if (v.pendiente.sinDesglose > EPS) {
        f.sinDesglose += v.pendiente.sinDesglose; cuotasSD++;
        cuotasSinDesglose.push({ uid: uidCredito(c), empresa: c.empresa, acreedor: c.acreedor, identificador: c.identificador || '',
          tipo_cr: c.tipo_cr || '', moneda: c.moneda || 'USD', fecha: v.fecha, vencida: v.fecha <= corte, monto: r2(v.pendiente.sinDesglose),
          usd: null, _c: c });
      }
    });
    if (sinInicio) avisos.push('sin fecha de desembolso: intereses del primer período sin devengar');
    if (t.variable) avisos.push('tasa variable: intereses proyectados con hipótesis');
    if (f.sinDesglose > EPS) avisos.push(`${cuotasSD} cuota(s) sin desglosar: intereses no calculables`);
    if (f.porConciliar > EPS) avisos.push('tiene cuotas por conciliar (fuera del saldo)');
    Object.keys(f).forEach(k => { f[k] = r2(f[k]); });
    const saldoDeuda = r2(f.capital + f.devengado + f.cargosVencidos);
    const totalPorPagar = r2(saldoDeuda + f.porDevengar + f.cargosFuturos);
    if (saldoDeuda + totalPorPagar + f.sinDesglose + f.porConciliar <= EPS) return;  // crédito cerrado al corte
    const fx = factorVencimiento(c, corte);
    const cl = clasificacionCredito(c);
    const usd = fx === null ? null : Object.fromEntries(
      Object.entries({ ...f, saldoDeuda, totalPorPagar }).map(([k, x]) => [k, r2(x * fx)]));
    if (fx === null) sinTC.push({ empresa: c.empresa, acreedor: c.acreedor, moneda: c.moneda || 'USD' });
    const vencFinal = vencs.length ? vencs[vencs.length - 1].fecha : (c.f_venc || '');
    filas.push({
      uid: uidCredito(c), empresa: c.empresa || '', acreedor: c.acreedor || '', identificador: c.identificador || '',
      tipoCredito: c.tipo_cr || (esSocio(c) ? 'Socio' : ''), modalidad: esContrato(c) ? (MODALIDADES[c.modalidad] || '') : (esSocio(c) ? 'Crédito de socio' : 'Registro por vencimiento'),
      clasificacion: cl.valor, clasificacionOrigen: cl.origen, clasificacionMotivo: cl.motivo,
      moneda: c.moneda || 'USD', tasa: t.tasa, tasaVariable: !!t.variable, vencimientoFinal: vencFinal,
      ...f, saldoDeuda, totalPorPagar, usd, tc: c._tc || null,
      garantias: garantiasCredito(c), garantiasTexto: String(c.garantias || '').trim(), avisos,
    });
  });
  cuotasSinDesglose.forEach(q => { const fx = factorVencimiento(q._c, corte); q.usd = fx === null ? null : r2(q.monto * fx); delete q._c; });
  cuotasSinDesglose.sort((a, b) => a.fecha.localeCompare(b.fecha) || a.empresa.localeCompare(b.empresa));

  const CAMPOS = ['capital', 'devengado', 'cargosVencidos', 'saldoDeuda', 'porDevengar', 'cargosFuturos', 'totalPorPagar', 'sinDesglose', 'porConciliar'];
  const cero = () => Object.fromEntries(CAMPOS.map(k => [k, 0]).concat([['creditos', 0]]));
  const total = cero(), porClasificacion = {}, porEmpresa = {};
  filas.forEach(x => {
    if (!x.usd) return;
    const k = x.clasificacion || 'Sin clasificar';
    const a = porClasificacion[k] || (porClasificacion[k] = cero());
    const e = porEmpresa[x.empresa] || (porEmpresa[x.empresa] = cero());
    [total, a, e].forEach(o => { CAMPOS.forEach(cmp => { o[cmp] += x.usd[cmp]; }); o.creditos++; });
  });
  [total, ...Object.values(porClasificacion), ...Object.values(porEmpresa)].forEach(o => CAMPOS.forEach(k => { o[k] = r2(o[k]); }));

  // Garantías: conteo por tipo y monto por moneda (el monto es el valor declarado de la garantía).
  const garantias = {};
  filas.forEach(x => x.garantias.forEach(g => {
    const k = g.tipo || 'Otra';
    const o = garantias[k] || (garantias[k] = { tipo: k, cantidad: 0, montos: {}, creditos: [] });
    o.cantidad++;
    if (num(g.monto) > 0) o.montos[g.moneda || 'USD'] = r2((o.montos[g.moneda || 'USD'] || 0) + num(g.monto));
    o.creditos.push(`${x.empresa} · ${x.acreedor}`);
  }));
  const sinGarantia = filas.filter(x => !x.garantias.length && !x.garantiasTexto).length;
  const soloTexto = filas.filter(x => !x.garantias.length && x.garantiasTexto).length;

  return { corte, filas, total, porClasificacion, porEmpresa, cuotasSinDesglose, sinTC, garantias, sinGarantia, soloTexto,
    sinClasificar: filas.filter(x => !x.clasificacion).length, incompleto: sinTC.length > 0 };
}
