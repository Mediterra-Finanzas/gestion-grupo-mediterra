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
  MODALIDADES, planRenovaciones,
} from './creditos.js';
import { calcularAmortizacionSocio } from './creditoSocio.js';

const r2 = (x) => Math.round((Number(x) || 0) * 100) / 100;
const r4 = (x) => Math.round((Number(x) || 0) * 10000) / 10000;   // UF: 4 decimales
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
  const filas = [], cuotasSinDesglose = [], sinTC = [], noDesembolsados = [];
  (creditos || []).filter(c => c && !esAnulado(c)).forEach(c => {
    const desembolso = fechaDesembolsoCredito(c);
    // Al corte el crédito todavía no existía: no es deuda.
    if (isoValida(desembolso) && corte < desembolso) { noDesembolsados.push({ empresa: c.empresa, acreedor: c.acreedor, desembolso }); return; }
    const rM = c.moneda === 'UF' ? r4 : r2;
    // Prepagos con fecha posterior al corte todavía no ocurrían: el calendario al corte no los aplica.
    const cBase = Array.isArray(c.prepagos) && c.prepagos.some(p => p && p.fecha > corte)
      ? { ...c, prepagos: c.prepagos.filter(p => !(p && p.fecha > corte)) } : c;
    // Solo los pagos con fecha ≤ corte: lo pagado después aún se debía al corte. Un pago
    // sin fecha cuenta como pagado (igual que saldosAlCorte) y se avisa. El plan de
    // renovaciones mira TODOS los pagos (_pagosPlan), como posicionAlCorte.
    const pagosSinFecha = (c.pagos || []).filter(p => p && !p.anulado && !p.fecha).length;
    const cc = { ...cBase, _pagosPlan: cBase.pagos || [], pagos: (cBase.pagos || []).filter(p => p && (!p.fecha || p.fecha <= corte)) };
    const vencs = aplicarPagos(cc, vencimientosCredito(cBase), corte).vencimientos;
    const plan = planRenovaciones(cc);
    const t = tasaCredito(c);
    const f = { capital: 0, devengado: 0, cargosVencidos: 0, porDevengar: 0, cargosFuturos: 0, sinDesglose: 0, porConciliar: 0 };
    const avisos = [];
    let sinInicio = false, cuotasSD = 0;
    const base = esContrato(c) && ['30360', 'act360', 'act365'].includes(c.base) ? c.base : 'act365';
    // Fracción devengada al corte del período que termina en `fin` (empieza en el
    // vencimiento anterior del crédito o, si no hay, en el desembolso). null = sin inicio.
    const fechas = [...new Set(vencs.map(v => v.fecha))].sort();
    const fracHasta = (fin) => {
      if (fin <= corte) return 1;
      const ant = fechas.filter(x => x < fin).pop();
      const inicio = ant || (isoValida(desembolso) ? desembolso : null);
      if (!inicio || inicio >= fin) return null;
      return Math.min(1, Math.max(0, fraccionAnio(base, inicio, corte) / fraccionAnio(base, inicio, fin)));
    };
    // Reparte un interés futuro en devengado / por devengar.
    const devengar = (monto, frac) => {
      if (!(monto > EPS)) return;
      if (frac === null) { sinInicio = true; f.porDevengar += monto; return; }
      f.devengado += monto * frac; f.porDevengar += monto * (1 - frac);
    };
    // Interés que se CAPITALIZARÁ después del corte (gracia total de un contrato, cuota de
    // socio menor al interés): está dentro del capital de cuotas futuras, pero al corte
    // todavía es interés del período en que se genera.
    let capFuturo = 0;
    vencs.forEach(v => { if (v.fecha > corte && v.capitalizado > EPS) { capFuturo += v.capitalizado; devengar(v.capitalizado, fracHasta(v.fecha)); } });
    if (esSocio(c)) {
      const { filas: fs } = calcularAmortizacionSocio(c.monto, c.tasa_efectiva_anual, c.fecha_desembolso, c.cuotas_socio);
      fs.forEach(x => { if (!(x.cuota_total > 0) && x.amortizacion < 0 && isoValida(x.fecha) && x.fecha > corte) { capFuturo += -x.amortizacion; devengar(-x.amortizacion, fracHasta(x.fecha)); } });
    }
    vencs.forEach(v => {
      if (!(v.pendienteTotal > 0)) return;
      if (v.porConciliar) { f.porConciliar += v.pendienteTotal; return; }
      // Interés capitalizado en una renovación: antes de la fecha de origen sigue siendo
      // interés de ESE período (no del período de la renovación).
      const noVig = capitalizadoNoVigenteAl(v, corte);
      f.capital += v.pendiente.capital - noVig;
      if (noVig > EPS) {
        const ks = v.capitalizaciones || (v.capitalizaDesde ? [{ monto: v.capitalizadoEnCuota, desde: v.capitalizaDesde }] : []);
        const tot = ks.filter(k => corte < k.desde).reduce((a, k) => a + k.monto, 0) || 1;
        ks.filter(k => corte < k.desde).forEach(k => devengar(noVig * k.monto / tot, fracHasta(k.desde)));
      }
      if (v.fecha <= corte) {
        f.devengado += v.pendiente.interes; f.cargosVencidos += v.pendiente.cargos;
      } else {
        f.cargosFuturos += v.pendiente.cargos;
        const pagInt = v.pagado ? v.pagado.interes : 0;
        // Interés del período de origen trasladado a la 1ª cuota de una renovación
        // ("pendientes"): se devenga en el período de origen, no en el de la renovación.
        const tr = v.origen === 'renovacion' && v.interesesTrasladados ? (plan.porRen[v.renovacion] || null) : null;
        const extra = tr && tr.extra ? Math.min(tr.extra.interes, v.pendiente.interes + pagInt) : 0;
        const fPropia = fracHasta(v.fecha), fExtra = tr ? fracHasta(tr.fecha) : 1;
        if (v.pendiente.interes > EPS) {
          if (fPropia === null || (extra > EPS && fExtra === null)) { sinInicio = true; f.porDevengar += v.pendiente.interes; }
          else {
            // Lo ya pagado de la cuota se descuenta primero de lo devengado.
            const bruto = (v.pendiente.interes + pagInt - extra) * fPropia + extra * fExtra;
            const dev = Math.min(v.pendiente.interes, Math.max(0, bruto - pagInt));
            f.devengado += dev; f.porDevengar += v.pendiente.interes - dev;
          }
        }
      }
      if (v.pendiente.sinDesglose > EPS) {
        f.sinDesglose += v.pendiente.sinDesglose; cuotasSD++;
        cuotasSinDesglose.push({ uid: uidCredito(c), empresa: c.empresa, acreedor: c.acreedor, identificador: c.identificador || '',
          tipo_cr: c.tipo_cr || '', moneda: c.moneda || 'USD', fecha: v.fecha, vencida: v.fecha <= corte, monto: rM(v.pendiente.sinDesglose),
          usd: null, _c: c });
      }
    });
    f.capital = Math.max(0, f.capital - capFuturo);
    if (sinInicio) avisos.push('sin fecha de desembolso: intereses del primer período sin devengar');
    if (t.variable) avisos.push('tasa variable: intereses proyectados con hipótesis');
    if (f.sinDesglose > EPS) avisos.push(`${cuotasSD} cuota(s) sin desglosar: intereses no calculables`);
    if (f.porConciliar > EPS) avisos.push('tiene cuotas por conciliar (fuera del saldo)');
    if (pagosSinFecha) avisos.push(`${pagosSinFecha} pago(s) sin fecha: se cuentan como pagados antes del corte`);
    if (c.pagado === true && !esContrato(c)) avisos.push('marcado "pagado" sin registro de fecha: a cualquier corte figura pagado');
    Object.keys(f).forEach(k => { f[k] = rM(f[k]); });
    const saldoDeuda = rM(f.capital + f.devengado + f.cargosVencidos);
    const totalPorPagar = rM(saldoDeuda + f.porDevengar + f.cargosFuturos);
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

  return { corte, filas, total, noDesembolsados, porClasificacion, porEmpresa, cuotasSinDesglose, sinTC, garantias, sinGarantia, soloTexto,
    sinClasificar: filas.filter(x => !x.clasificacion).length, incompleto: sinTC.length > 0 };
}
