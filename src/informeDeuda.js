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
// Renovaciones (regla del CFO, 23-10-2026): solo cuenta la deuda VIGENTE al corte.
//   · Una renovación rige desde su fecha efectiva: extensión/parcial, el vencimiento que
//     extiende; pago y nuevo desembolso, el desembolso recibido (o el mes de ingreso);
//     renovación antigua (sin modalidad), su mes de ingreso. Una renovación de otra
//     renovación rige solo si la anterior ya rige.
//   · Antes de esa fecha, las cuotas de la renovación son PROYECCIÓN: no suman capital ni
//     intereses (en extensión/parcial el capital es el mismo del crédito vigente y sí cuenta,
//     con vencimiento en la fecha que se extiende; sus intereses nuevos son proyección).
//   · Desde esa fecha, una renovación con desembolso (antigua o pago y nuevo) REEMPLAZA el
//     capital del vencimiento que renueva hasta su monto: no se suman ambos; si renueva
//     menos, queda el remanente.
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
  MODALIDADES, planRenovaciones, getRenovaciones, renovacionProyecta, renovacionTraslada, renovacionAntigua, fechaIngresoAntigua,
} from './creditos.js';
import { calcularAmortizacionSocio } from './creditoSocio.js';

const r2 = (x) => Math.round((Number(x) || 0) * 100) / 100;
const MES_REN = { Ene: 1, Feb: 2, Mar: 3, Abr: 4, May: 5, Jun: 6, Jul: 7, Ago: 8, Sep: 9, Oct: 10, Nov: 11, Dic: 12 };
const fechaIngresoRen = (ren) => { const m = MES_REN[ren.mes_ingreso], a = parseInt(ren.anio_ingreso); return m && a ? `${a}-${String(m).padStart(2, '0')}-01` : ''; };
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
// Los avales viven en la misma lista (`garantias_lista`, tipo 'Aval'): así los ya cargados
// aparecen solos en «Avales» sin migrar datos. Un aval identifica al avalista (`otorgante`) y,
// si se conoce, el monto (`monto` + `moneda`) o el porcentaje (`porcentaje`) que garantiza.
export const TIPOS_GARANTIA = ['Hipoteca', 'Prenda', 'Fianza', 'Warrant', 'Otra'];
const vigentesGL = (c) => (c && Array.isArray(c.garantias_lista) ? c.garantias_lista : []).filter(g => g && !g.anulada && (g.tipo || g.otorgante || g.bien));
export function garantiasCredito(c) { return vigentesGL(c).filter(g => g.tipo !== 'Aval'); }
export function avalesCredito(c) { return vigentesGL(c).filter(g => g.tipo === 'Aval'); }
export function textoAval(a) {
  const partes = [a.otorgante || 'Avalista sin nombre', num(a.monto) > 0 && `${a.moneda || 'USD'} ${num(a.monto).toLocaleString('es-CL')}`,
    num(a.porcentaje) > 0 && `${num(a.porcentaje)}% de la deuda`, a.bien, a.fecha && `desde ${a.fecha}`, a.nota];
  return partes.filter(Boolean).join(' · ');
}
export function textoGarantia(g) {
  const partes = [g.tipo || 'Garantía', g.otorgante && `otorga ${g.otorgante}`, g.bien, num(g.monto) > 0 && `${g.moneda || 'USD'} ${num(g.monto).toLocaleString('es-CL')}`];
  return partes.filter(Boolean).join(' · ');
}

// ── Naturaleza de la obligación (decisión del CFO, 22-10-2026) ──────
// Un anticipo de cliente registrado en Créditos se muestra SEPARADO de la deuda financiera,
// pero entra al total de obligaciones identificadas. Se marca a mano en cada crédito: no se
// deduce del tipo de acreedor («Otros» también tiene otros acreedores).
export const NATURALEZAS = { financiera: 'Deuda financiera', anticipo_cliente: 'Anticipo de cliente' };
export const naturalezaCredito = (c) => (c && c.naturaleza === 'anticipo_cliente' ? 'anticipo_cliente' : 'financiera');

// ── Informe ─────────────────────────────────────────────────────────
export const CAMPOS = ['capital', 'devengado', 'cargosVencidos', 'saldoDeuda', 'porDevengar', 'cargosFuturos', 'totalPorPagar', 'sinDesglose', 'totalIdentificado', 'porConciliar'];
// Estado de una cuota al corte (rótulo único para pantalla, Excel y PDF).
export const ESTADOS_CUOTA = { pagada: 'Pagada', renovada: 'Renovada', vencida: 'Vencida', vencida_parcial: 'Vencida (pago parcial)',
  parcial: 'Por vencer (pago parcial)', por_vencer: 'Por vencer', renovacion_futura: 'Renovación aún no vigente', vence_corte: 'Vence en la fecha de corte', vence_corte_parcial: 'Vence en la fecha de corte (pago parcial)', por_conciliar: 'Por conciliar', capitaliza: 'Se capitaliza (sin pago)' };
const estadoCuota = (v) => {
  if (v.estado === 'pagada' || v.estado === 'renovada' || v.estado === 'por_conciliar') return v.estado;
  if (v.estado === 'vencida') return v.pagadoTotal > EPS ? 'vencida_parcial' : 'vencida';
  if (v.estado === 'parcial') return 'parcial';
  return 'por_vencer';   // 'vence_corte' se asigna en el informe (necesita la fecha de corte)
};
// Días de la base para mostrar el período: 30/360 y Actual/360 en días de 360; Actual/365 en días reales.
const diasBase = (base, a, b) => Math.round(fraccionAnio(base, a, b) * (base === 'act365' ? 365 : 360));
export const NOMBRE_BASE = { '30360': '30/360', act360: 'Actual/360', act365: 'Actual/365 (días reales)' };

// Cifras de un crédito en una moneda (original o US$). Las identidades se arman con los
// componentes YA redondeados: así lo que se ve siempre cuadra (saldo = capital + devengado
// + cargos vencidos; total por pagar = saldo + por devengar + cargos futuros; total
// identificado = total por pagar + sin desglosar).
function cifras(f, rM, fx = 1) {
  const o = {};
  ['capital', 'devengado', 'cargosVencidos', 'porDevengar', 'cargosFuturos', 'sinDesglose', 'porConciliar'].forEach(k => { o[k] = rM(f[k] * fx); });
  o.saldoDeuda = rM(o.capital + o.devengado + o.cargosVencidos);
  o.totalPorPagar = rM(o.saldoDeuda + o.porDevengar + o.cargosFuturos);
  o.totalIdentificado = rM(o.totalPorPagar + o.sinDesglose);
  return o;
}

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
    const avisos = [];
    let sinInicio = false;
    const base = esContrato(c) && ['30360', 'act360', 'act365'].includes(c.base) ? c.base : 'act365';
    // Detalle por cuota: cada importe del crédito sale de la suma de sus cuotas.
    const nuevaQ = (v) => ({ key: v.key, fecha: v.fecha, estado: estadoCuota(v), capital: v.capital, interes: v.interes, cargos: v.cargos,
      sinDesglose: v.sinDesglose, total: v.total, pagado: v.pagadoTotal || 0, pendiente: v.pendienteTotal || 0,
      pendCapital: 0, devengado: 0, porDevengar: 0, cargosVencidos: 0, cargosFuturos: 0, sdPend: 0, porConciliar: 0,
      noVig: 0, capFuturo: 0, proyCapital: 0, proyInteres: 0, proyOtros: 0, devengo: [], notas: [] });
    const qs = vencs.map(nuevaQ);
    const qDe = new Map(vencs.map((v, i) => [v, qs[i]]));
    // ── Vigencia de las renovaciones al corte ──
    const vig = {};   // ri → { fecha, traslada, monto, origenKey }
    (c.renovable ? getRenovaciones(c) : []).forEach((ren, ri) => {
      const pr = plan.porRen[ri];
      if (!pr || pr.aplicada === false || !renovacionProyecta(ren)) return;
      const traslada = renovacionTraslada(ren);
      const fecha = traslada ? pr.fecha : (renovacionAntigua(ren) ? fechaIngresoAntigua(ren) : ((ren.recibido && ren.recibido.fecha) || fechaIngresoRen(ren)));
      // «Pago y nuevo»: el crédito anterior se paga ENTERO y entra un desembolso nuevo, así que
      // reemplaza todo el saldo anterior. Una antigua reemplaza hasta su monto.
      vig[ri] = { fecha, traslada, monto: num(ren.monto), pagoTotal: ren.modalidad === 'pago_y_nuevo', origenKey: traslada ? pr.key : null };
    });
    // Renovación con desembolso (antigua o pago y nuevo): renueva los vencimientos del crédito
    // (o de una renovación anterior) que vencen hasta el fin de su mes de ingreso. Sin mes de
    // ingreso (antigua): los que vencen antes de su primera cuota. Si el vencimiento renovado
    // cae en el mismo mes del ingreso y no hay fecha real de desembolso, rige desde ese
    // vencimiento (el día de ingreso no se conoce; se asume que renueva al vencer).
    const rens = c.renovable ? getRenovaciones(c) : [];
    Object.entries(vig).forEach(([ri, o]) => {
      if (o.traslada) return;
      const ren = rens[ri] || {};
      const primera = vencs.filter(v => v.origen === 'renovacion' && v.renovacion === Number(ri)).map(v => v.fecha).sort()[0] || '';
      const tope = o.fecha ? `${o.fecha.slice(0, 7)}-31` : primera;
      const previo = (v) => v.origen !== 'renovacion' || v.renovacion < Number(ri);
      const cand = vencs.filter(v => (o.fecha ? v.fecha <= tope : v.fecha < tope) && previo(v) && v.capital + v.sinDesglose > EPS);
      // Refinancia el SALDO de lo que renueva: primero lo vencido hasta el ingreso (del más
      // reciente al más antiguo) y después las cuotas posteriores de ese mismo crédito o
      // renovación (de la más próxima a la más lejana), hasta agotar el monto renovado.
      const fuente = cand.length ? (cand[cand.length - 1].origen === 'renovacion' ? cand[cand.length - 1].renovacion : null) : null;
      const posteriores = vencs.filter(v => !cand.includes(v) && previo(v) && v.capital + v.sinDesglose > EPS && v.fecha > (cand.length ? cand[cand.length - 1].fecha : '')
        && (fuente === null ? v.origen !== 'renovacion' : (v.origen === 'renovacion' && v.renovacion === fuente)));
      o.origenes = [...cand.map(v => v.key).reverse(), ...posteriores.map(v => v.key)];
      // «Pago y nuevo» paga entero lo anterior, venga del crédito original o de renovaciones
      // previas (extensión o antigua): renueva TODAS sus cuotas, también las de solo interés.
      if (o.pagoTotal) o.origenes = [...o.origenes, ...vencs.filter(v => previo(v) && !o.origenes.includes(v.key)).map(v => v.key)];
      o.origenKey = cand.length ? cand[cand.length - 1].key : null;
      const fo = cand.length ? cand[cand.length - 1].fecha : '';
      if (!o.fecha) { o.fecha = fo; o.sinMes = true; }
      else if (!(ren.recibido && ren.recibido.fecha) && fo && fo.slice(0, 7) === o.fecha.slice(0, 7) && fo > o.fecha) o.fecha = fo;
    });
    const riDeKey = (key) => { const m = /@R(\d+)@/.exec(key || ''); return m ? Number(m[1]) : null; };
    const efectiva = (ri, d = 0) => {
      const o = vig[ri]; if (!o || !o.fecha) return true;
      if (o.fecha > corte) return false;
      const p = riDeKey(o.origenKey); return p === null || d > 50 ? true : efectiva(p, d + 1);
    };
    // El capital de una cuota de renovación que aún no rige es NUEVO (proyección) si la
    // renovación trae desembolso, o si extiende una renovación con desembolso que tampoco rige.
    const capitalNuevo = (ri, d = 0) => {
      const o = vig[ri]; if (!o) return false;
      if (!o.traslada) return true;
      const p = riDeKey(o.origenKey);
      return p !== null && d < 50 && !efectiva(p) && capitalNuevo(p, d + 1);
    };
    // Reemplazo: el monto de la renovación vigente cubre los vencimientos renovados, del más
    // reciente al más antiguo, hasta agotarse (nunca más que lo que esos vencimientos deben).
    const reemplazo = {};   // key → { monto, fechas }
    const pendDe = Object.fromEntries(vencs.map(v => [v.key, v.pendiente.capital + v.pendiente.sinDesglose]));
    Object.entries(vig).forEach(([ri, o]) => {
      if (o.traslada || !o.origenes || !efectiva(Number(ri))) return;
      let x = o.pagoTotal ? Infinity : o.monto;
      o.origenes.forEach(k => {
        const v = vencs.find(z => z.key === k);
        // Una cuota con desembolso que todavía no rige no es saldo anterior: no se paga. Una
        // extensión futura sí lo es (su capital es el trasladado del crédito vigente).
        if (v && v.origen === 'renovacion' && vig[v.renovacion] && !efectiva(v.renovacion) && capitalNuevo(v.renovacion)) return;
        const usado = (reemplazo[k] && reemplazo[k].monto) || 0;
        const t = Math.min(x, Math.max(0, pendDe[k] - usado));
        // Pago y nuevo: la cuota posterior al ingreso deja de deberse entera (capital, interés y cargos).
        const todo = o.pagoTotal && v && v.fecha > o.fecha && v.pendienteTotal > EPS;
        if (!(t > EPS) && !todo) return;
        const r = reemplazo[k] || (reemplazo[k] = { monto: 0, fechas: [], todo: false });
        if (t > EPS) { r.monto += t; x -= t; }
        r.fechas.push(o.fecha); if (todo) r.todo = true;
      });
    });
    const esFutura = (v) => v.origen === 'renovacion' && !!vig[v.renovacion] && !efectiva(v.renovacion);
    // En la proyección, una renovación futura que renueva cuotas de otra renovación futura
    // reemplaza su capital nuevo (no se proyectan ambos).
    const reemplazoProy = {};
    Object.entries(vig).forEach(([ri, o]) => {
      if (o.traslada || !o.origenes || efectiva(Number(ri))) return;
      let x = o.monto;
      o.origenes.forEach(k => { const v = vencs.find(z => z.key === k); if (!v || !esFutura(v) || !capitalNuevo(v.renovacion)) return;
        const t = Math.min(x, Math.max(0, v.pendiente.capital - (reemplazoProy[k] || 0))); if (t > EPS) { reemplazoProy[k] = (reemplazoProy[k] || 0) + t; x -= t; } });
    });
    if (Object.values(vig).some(o => o.sinMes)) avisos.push('Renovación antigua sin mes de ingreso: se considera vigente desde el vencimiento que renueva.');
    // Período de interés: empieza en el vencimiento anterior del crédito o, si no hay, en el
    // desembolso. Un vencimiento que solo trae cargos (cargo único: notaría, comisión) no corta
    // el período; las filas de socio que no generan vencimiento (cuota 0) sí lo cortan.
    const filasSocio = esSocio(c) ? calcularAmortizacionSocio(c.monto, c.tasa_efectiva_anual, c.fecha_desembolso, c.cuotas_socio).filas.filter(x => isoValida(x.fecha)) : [];
    const fechas = [...new Set([
      ...vencs.filter(v => v.capital + v.interes + v.sinDesglose > EPS || v.capitalizado > EPS).map(v => v.fecha),
      ...filasSocio.map(x => x.fecha)])].sort();
    // Devuelve { frac, inicio, fin, transcurrido, periodo } o null si no hay inicio.
    const periodo = (fin) => {
      const ant = fechas.filter(x => x < fin).pop();
      const inicio = ant || (isoValida(desembolso) ? desembolso : null);
      if (fin <= corte) return { frac: 1, inicio, fin, vencido: true };
      if (!inicio || inicio >= fin) return null;
      const frac = Math.min(1, Math.max(0, fraccionAnio(base, inicio, corte) / fraccionAnio(base, inicio, fin)));
      return { frac, inicio, fin, transcurrido: Math.max(0, diasBase(base, inicio, corte)), periodo: diasBase(base, inicio, fin) };
    };
    // Reparte un interés futuro de la cuota q en devengado / por devengar.
    const devengar = (q, monto, p, que) => {
      if (!(monto > EPS)) return;
      if (p === null) { sinInicio = true; q.porDevengar += monto; q.notas.push(`${que}: sin fecha de inicio del período, no se devenga`); return; }
      q.devengado += monto * p.frac; q.porDevengar += monto * (1 - p.frac);
      q.devengo.push({ que, monto, base, ...p });
    };
    // Interés que se CAPITALIZARÁ después del corte (gracia total de un contrato, cuota de
    // socio menor al interés): está dentro del capital de cuotas futuras, pero al corte
    // todavía es interés del período en que se genera.
    vencs.forEach(v => { if (v.fecha > corte && v.capitalizado > EPS) { const q = qDe.get(v); q.capFuturo += v.capitalizado;
      q.notas.push('interés de gracia: se suma al capital en esta fecha'); devengar(q, v.capitalizado, periodo(v.fecha), 'interés a capitalizar'); } });
    // Socio con cuota menor al interés: lo que la cuota no cubre se capitaliza. Si la cuota
    // es 0 no hay vencimiento (fila propia en el detalle) y el interés se devenga ahí. Si es
    // parcial, el vencimiento trae el interés COMPLETO (así lo arma vencimientosCredito): la
    // parte capitalizada se saca del capital futuro (antes del corte) o del interés vencido (después).
    const capSocioParcial = {};
    filasSocio.forEach(x => {
      if (!(x.amortizacion < 0)) return;
      if (!(x.cuota_total > 0)) {
        const q = { ...nuevaQ({ key: `socio@${x.fecha}`, fecha: x.fecha, estado: 'pendiente', capital: 0, interes: x.interes, cargos: 0, sinDesglose: 0, total: 0 }), estado: 'capitaliza' };
        q.notas.push('cuota 0: el interés se suma al capital');
        if (x.fecha > corte) { q.capFuturo += -x.amortizacion; devengar(q, -x.amortizacion, periodo(x.fecha), 'interés a capitalizar'); }
        qs.push(q);
      } else capSocioParcial[x.fecha] = (capSocioParcial[x.fecha] || 0) - x.amortizacion;
    });
    if (Object.keys(capSocioParcial).length) avisos.push('Cuota de socio menor al interés: la diferencia se suma al capital.');
    // Detalle de la cuota parcial de socio: lo que la cuota no cubre no se cobra en esa fecha
    // (se capitaliza), así que no es saldo pendiente de la cuota ni la deja vencida.
    vencs.forEach(v => {
      const cp = capSocioParcial[v.fecha] || 0; if (!(cp > EPS)) return;
      const q = qDe.get(v);
      q.capital = Math.max(0, q.capital); q.total = rM(q.capital + q.interes - cp + q.cargos);
      q.pendiente = rM(Math.max(0, q.pendiente - cp)); q.capitalizaEnCuota = rM(cp);
      q.notas.push(`la cuota no cubre el interés: ${rM(cp)} se suma al capital en esta fecha`);
      if (q.pendiente <= EPS && (q.estado === 'vencida' || q.estado === 'vencida_parcial' || q.estado === 'parcial')) q.estado = 'pagada';
      else if (q.estado === 'vencida' && q.pagado > EPS) q.estado = 'vencida_parcial';
    });
    vencs.forEach(v => { const q = qDe.get(v); if ((q.estado === 'por_vencer' || q.estado === 'parcial') && v.fecha === corte && q.pendiente > EPS) q.estado = q.estado === 'parcial' ? 'vence_corte_parcial' : 'vence_corte'; });
    vencs.forEach(v => {
      const q = qDe.get(v);
      if (!(v.pendienteTotal > 0)) return;
      const pend = { ...v.pendiente };
      // Vencimiento renovado por una renovación con desembolso ya vigente: su capital (o lo sin
      // desglose) queda reemplazado por la renovación hasta el monto renovado.
      const rem = reemplazo[v.key];
      if (rem) {
        const base0 = pend.capital + pend.sinDesglose;   // capital pendiente ANTES del reemplazo
        let x = rem.monto; const tc = Math.min(pend.capital, x); pend.capital -= tc; x -= tc;
        const ts = Math.min(pend.sinDesglose, x); pend.sinDesglose -= ts;
        // Cuota posterior refinanciada: su interés y cargos futuros dejan de deberse en la misma
        // proporción que su capital pendiente (enteros si la renovación paga todo lo anterior).
        const desdeRen = rem.fechas.slice().sort()[0];
        const prop = v.fecha <= desdeRen ? 0 : (rem.todo ? 1 : (base0 > EPS ? Math.min(1, (tc + ts) / base0) : 0));
        const ti = pend.interes * prop; pend.interes -= ti;
        const tcg = pend.cargos * prop; pend.cargos -= tcg;
        q.reemplazado = tc + ts + ti + tcg; q.pendiente = rM(Math.max(0, q.pendiente - q.reemplazado));
        q.notas.push(`renovado: ${fmtMon(tc + ts, c.moneda)} reemplazado por la renovación`);
        if (q.pendiente <= EPS) q.estado = 'renovada';
        if (v.fecha <= corte && !(v.pagadoTotal > EPS)) q.notas.push('sin pago registrado del vencimiento renovado: se considera reemplazado por la renovación');
      }
      // Cuota de una renovación que aún no rige: proyección, fuera de la deuda vigente.
      if (esFutura(v)) {
        const o = vig[v.renovacion];
        q.estado = 'renovacion_futura';
        const tr0 = v.interesesTrasladados ? (plan.porRen[v.renovacion] || null) : null;
        const extra0 = tr0 && tr0.extra ? Math.min(tr0.extra.interes, pend.interes) : 0;
        const extraC0 = tr0 && tr0.extra ? Math.min(tr0.extra.cargos || 0, pend.cargos) : 0;   // cargos del vencimiento vigente
        q.proyInteres = pend.interes - extra0; q.proyOtros = pend.cargos - extraC0;
        if (!o.traslada || capitalNuevo(v.renovacion)) { q.proyCapital = Math.max(0, pend.capital - (reemplazoProy[v.key] || 0)); q.proyOtros += pend.sinDesglose; q.proyInteres = pend.interes; q.pendiente = 0;
          q.notas.push('renovación que aún no rige: proyección'); return; }
        q.notas.push('renovación que aún no rige: el capital es el del crédito vigente; los intereses nuevos son proyección');
        q.pendiente = rM(Math.max(0, q.pendiente - q.proyInteres - q.proyOtros));
        pend.interes = extra0; pend.cargos = extraC0;
      }
      // Cuota parcial de socio: lo capitalizado ya está en el capital, no es impacto por conciliar.
      if (v.porConciliar) { q.porConciliar += Math.max(0, pend.capital + pend.interes + pend.cargos + pend.sinDesglose - (capSocioParcial[v.fecha] || 0)); return; }
      // Interés capitalizado en una renovación: antes de la fecha de origen sigue siendo
      // interés de ESE período (no del período de la renovación).
      const noVig = capitalizadoNoVigenteAl(v, corte);
      q.pendCapital += pend.capital; q.noVig += noVig;
      if (noVig > EPS) {
        const ks = v.capitalizaciones || (v.capitalizaDesde ? [{ monto: v.capitalizadoEnCuota, desde: v.capitalizaDesde }] : []);
        const tot = ks.filter(k => corte < k.desde).reduce((a, k) => a + k.monto, 0) || 1;
        ks.filter(k => corte < k.desde).forEach(k => devengar(q, noVig * k.monto / tot, periodo(k.desde), 'interés capitalizado en la renovación'));
      }
      const capParcial = capSocioParcial[v.fecha] || 0;
      if (capParcial > EPS && v.fecha > corte) q.capFuturo += capParcial;
      if (v.fecha <= corte) {
        q.devengado += Math.max(0, pend.interes - capParcial); q.cargosVencidos += pend.cargos;
      } else {
        q.cargosFuturos += pend.cargos;
        const pagInt = v.pagado ? v.pagado.interes : 0;
        // Interés del período de origen trasladado a la 1ª cuota de una renovación
        // ("pendientes"): se devenga en el período de origen, no en el de la renovación.
        const tr = v.origen === 'renovacion' && v.interesesTrasladados ? (plan.porRen[v.renovacion] || null) : null;
        const extra = tr && tr.extra ? Math.min(tr.extra.interes, pend.interes + pagInt) : 0;
        const pP = periodo(v.fecha), pE = tr ? periodo(tr.fecha) : null;
        if (pend.interes > EPS) {
          if (pP === null || (extra > EPS && pE === null)) { sinInicio = true; q.porDevengar += pend.interes; q.notas.push('sin fecha de inicio del período: no se devenga'); }
          else {
            // Lo ya pagado de la cuota se descuenta primero de lo devengado.
            const bruto = (pend.interes + pagInt - extra) * pP.frac + extra * (pE ? pE.frac : 1);
            const dev = Math.min(pend.interes, Math.max(0, bruto - pagInt));
            q.devengado += dev; q.porDevengar += pend.interes - dev;
            q.devengo.push({ que: 'interés de la cuota', monto: pend.interes + pagInt - extra, base, ...pP });
            if (extra > EPS) q.devengo.push({ que: 'interés del período de origen (renovación)', monto: extra, base, ...pE });
            if (pagInt > EPS) q.notas.push(`interés ya pagado antes del corte (${rM(pagInt)}) descontado de lo devengado`);
          }
        }
      }
      if (pend.sinDesglose > EPS) {
        q.sdPend += pend.sinDesglose; q.notas.push('sin desglose: no se sabe cuánto es capital y cuánto interés');
        cuotasSinDesglose.push({ uid: uidCredito(c), empresa: c.empresa, acreedor: c.acreedor, identificador: c.identificador || '',
          tipo_cr: c.tipo_cr || '', moneda: c.moneda || 'USD', fecha: v.fecha, vencida: v.fecha <= corte, monto: rM(pend.sinDesglose),
          usd: null, _c: c });
      }
    });
    qs.sort((a, b) => a.fecha.localeCompare(b.fecha));
    // Redondeo único: cada cuota a la precisión de su moneda; el crédito = Σ cuotas redondeadas.
    const CQ = ['pendCapital', 'noVig', 'capFuturo', 'devengado', 'porDevengar', 'cargosVencidos', 'cargosFuturos', 'sdPend', 'porConciliar', 'proyCapital', 'proyInteres', 'proyOtros'];
    qs.forEach(q => {
      // devengado + por devengar se redondean como par: su suma es el interés exacto de la cuota.
      const tot = rM(q.devengado + q.porDevengar);
      CQ.forEach(k => { q[k] = rM(q[k]); });
      q.porDevengar = rM(tot - q.devengado);
    });
    const S = (k) => rM(qs.reduce((a, q) => a + q[k], 0));
    const ajusteCapital = { cuotas: S('pendCapital'), interesRenovacion: S('noVig'), interesACapitalizar: S('capFuturo') };
    const f = { capital: Math.max(0, rM(ajusteCapital.cuotas - ajusteCapital.interesRenovacion - ajusteCapital.interesACapitalizar)),
      devengado: S('devengado'), cargosVencidos: S('cargosVencidos'), porDevengar: S('porDevengar'), cargosFuturos: S('cargosFuturos'),
      sinDesglose: S('sdPend'), porConciliar: S('porConciliar') };
    const cuotasSD = qs.filter(q => q.sdPend > 0).length;
    if (sinInicio) avisos.push('Falta la fecha de desembolso: no se calcula el interés devengado del primer período.');
    if (t.variable) avisos.push('Tasa variable: los intereses futuros son una estimación.');
    if (f.sinDesglose > EPS) avisos.push(`${cuotasSD} cuota(s) sin desglosar.`);
    if (f.porConciliar > EPS) avisos.push('Tiene cuotas por conciliar.');
    if (pagosSinFecha) avisos.push(`${pagosSinFecha} pago(s) sin fecha: se consideran pagados.`);
    if (c.pagado === true && !esContrato(c)) avisos.push('Marcado como pagado, sin fecha de pago.');
    const orig = cifras(f, rM);
    if (orig.totalIdentificado + orig.porConciliar <= EPS) return;  // crédito cerrado al corte
    const fx = factorVencimiento(c, corte);
    const cl = clasificacionCredito(c);
    const usd = fx === null ? null : cifras(f, r2, fx);
    if (fx === null) sinTC.push({ uid: uidCredito(c), naturaleza: naturalezaCredito(c), empresa: c.empresa, acreedor: c.acreedor, moneda: c.moneda || 'USD', totalIdentificado: orig.totalIdentificado, porConciliar: orig.porConciliar });
    // Vencimiento VIGENTE: una renovación que aún no rige no lo adelanta a su fecha final.
    const vigentes = vencs.filter(v => !esFutura(v));
    const vencFinal = vigentes.length ? vigentes[vigentes.length - 1].fecha : (c.f_venc || '');
    const futuras = vencs.filter(esFutura);
    const proyeccion = { capital: S('proyCapital'), interes: S('proyInteres'), otros: S('proyOtros'),
      desde: futuras.length ? Object.values(vig).filter(o => o.fecha > corte).map(o => o.fecha).sort()[0] || '' : '', hasta: futuras.length ? futuras[futuras.length - 1].fecha : '' };
    proyeccion.total = rM(proyeccion.capital + proyeccion.interes + proyeccion.otros);
    const dmy = (iso) => (iso ? `${iso.slice(8, 10)}-${iso.slice(5, 7)}-${iso.slice(0, 4)}` : '');
    if (proyeccion.total > EPS) avisos.push(`Renovación que rige desde el ${dmy(proyeccion.desde)} hasta el ${dmy(proyeccion.hasta)}: ${[proyeccion.capital > 0 && `${fmtMon(proyeccion.capital, c.moneda)} de capital nuevo`, proyeccion.interes > 0 && `${fmtMon(proyeccion.interes, c.moneda)} de intereses`, proyeccion.otros > 0 && `${fmtMon(proyeccion.otros, c.moneda)} de otros cargos`].filter(Boolean).join(', ')} (${c.moneda || 'USD'}), solo como proyección: no suman a la deuda.`);
    const est = new Set(qs.map(q => q.estado));
    filas.push({
      uid: uidCredito(c), empresa: c.empresa || '', acreedor: c.acreedor || '', identificador: c.identificador || '',
      naturaleza: naturalezaCredito(c),
      tipoCredito: c.tipo_cr || (esSocio(c) ? 'Socio' : ''), modalidad: esContrato(c) ? (MODALIDADES[c.modalidad] || '') : (esSocio(c) ? 'Crédito de socio' : 'Registro por vencimiento'),
      clasificacion: cl.valor, clasificacionOrigen: cl.origen, clasificacionMotivo: cl.motivo,
      moneda: c.moneda || 'USD', tasa: t.tasa, tasaVariable: !!t.variable, base, vencimientoFinal: vencFinal,
      ...orig, usd, tc: c._tc || null, cuotas: qs, ajusteCapital,
      proyeccion, proyeccionUsd: fx === null ? null : r2(proyeccion.total * fx), vencimientoRenovacion: proyeccion.hasta,
      estadoCredito: est.has('vencida') || est.has('vencida_parcial') ? 'con_vencidas' : (est.has('parcial') || est.has('vence_corte_parcial') ? 'con_parciales' : 'al_dia'),
      tienePorConciliar: f.porConciliar > EPS,
      garantias: garantiasCredito(c), avales: avalesCredito(c), garantiasTexto: String(c.garantias || '').trim(), avisos,
    });
  });
  cuotasSinDesglose.forEach(q => { const fx = factorVencimiento(q._c, corte); q.usd = fx === null ? null : r2(q.monto * fx); delete q._c; });
  cuotasSinDesglose.sort((a, b) => a.fecha.localeCompare(b.fecha) || a.empresa.localeCompare(b.empresa));

  const cero = () => Object.fromEntries(CAMPOS.map(k => [k, 0]).concat([['creditos', 0]]));
  // `total`, por clasificación y por empresa = DEUDA FINANCIERA. Los anticipos de clientes
  // van en `anticipos`; `obligaciones` suma ambos.
  const total = cero(), anticipos = cero(), porClasificacion = {}, porEmpresa = {};
  filas.forEach(x => {
    if (!x.usd) return;
    if (x.naturaleza === 'anticipo_cliente') { CAMPOS.forEach(cmp => { anticipos[cmp] += x.usd[cmp]; }); anticipos.creditos++; return; }
    const k = x.clasificacion || 'Sin clasificar';
    const a = porClasificacion[k] || (porClasificacion[k] = cero());
    const e = porEmpresa[x.empresa] || (porEmpresa[x.empresa] = cero());
    [total, a, e].forEach(o => { CAMPOS.forEach(cmp => { o[cmp] += x.usd[cmp]; }); o.creditos++; });
  });
  [total, anticipos, ...Object.values(porClasificacion), ...Object.values(porEmpresa)].forEach(o => CAMPOS.forEach(k => { o[k] = r2(o[k]); }));
  // Renovaciones que aún no rigen: proyección informada aparte (no suma a ningún total).
  const proyeccionRenovaciones = { usd: r2(filas.reduce((a, x) => a + (x.proyeccionUsd || 0), 0)), creditos: filas.filter(x => x.proyeccion.total > 0).length };
  const obligaciones = { totalIdentificado: r2(total.totalIdentificado + anticipos.totalIdentificado), porConciliar: r2(total.porConciliar + anticipos.porConciliar) };

  // Garantías: conteo por tipo y monto por moneda (el monto es el valor declarado de la garantía).
  const garantias = {};
  filas.forEach(x => x.garantias.forEach(g => {
    const k = g.tipo || 'Otra';
    const o = garantias[k] || (garantias[k] = { tipo: k, cantidad: 0, montos: {}, creditos: [] });
    o.cantidad++;
    if (num(g.monto) > 0) o.montos[g.moneda || 'USD'] = r2((o.montos[g.moneda || 'USD'] || 0) + num(g.monto));
    o.creditos.push(`${x.empresa} · ${x.acreedor}`);
  }));
  // Avales por avalista: cuántos créditos respalda y lo declarado. No se suma deuda (un crédito
  // con varios avalistas se cuenta una sola vez en los totales).
  const avales = {};
  filas.forEach(x => x.avales.forEach(a => {
    const k = (a.otorgante || 'Avalista sin nombre').trim();
    const o = avales[k] || (avales[k] = { avalista: k, creditos: [], montos: {}, porcentajes: [] });
    o.creditos.push(`${x.empresa} · ${x.acreedor}`);
    if (num(a.monto) > 0) o.montos[a.moneda || 'USD'] = r2((o.montos[a.moneda || 'USD'] || 0) + num(a.monto));
    if (num(a.porcentaje) > 0) o.porcentajes.push(`${num(a.porcentaje)}% (${x.acreedor})`);
  }));
  const sinAval = filas.filter(x => !x.avales.length).length;
  const sinGarantia = filas.filter(x => !x.garantias.length && !x.garantiasTexto).length;
  const soloTexto = filas.filter(x => !x.garantias.length && x.garantiasTexto).length;

  // Cifras parciales: capital, intereses y saldo NO son la deuda completa si hay cuotas sin
  // desglosar (su capital e interés no se conocen), por conciliar o créditos sin TC.
  const motivosParcial = [];
  if (total.sinDesglose > 0) motivosParcial.push(`US$ ${fmtUSD(total.sinDesglose)} en cuotas sin desglosar`);
  if (total.porConciliar > 0) motivosParcial.push(`US$ ${fmtUSD(total.porConciliar)} en cuotas por conciliar`);
  const sinTCFin = sinTC.filter(z => z.naturaleza === 'financiera').length;
  if (sinTCFin) motivosParcial.push(`${sinTCFin} crédito(s) sin tipo de cambio`);
  const conteo = { listados: filas.length, incluidos: filas.filter(x => x.usd).length, sinTC: sinTC.length, noDesembolsados: noDesembolsados.length,
    anticipos: filas.filter(x => x.naturaleza === 'anticipo_cliente').length };
  return { corte, filas, total, anticipos, obligaciones, proyeccionRenovaciones, noDesembolsados, porClasificacion, porEmpresa, cuotasSinDesglose, sinTC, garantias, sinGarantia, soloTexto, avales, sinAval,
    sinClasificar: filas.filter(x => !x.clasificacion).length, incompleto: sinTC.length > 0,
    parcial: motivosParcial.length > 0, motivosParcial, conteo };
}
export const fmtMon = (n, moneda) => (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: moneda === 'UF' ? 4 : 2, maximumFractionDigits: moneda === 'UF' ? 4 : 2 });
export const fmtUSD = (n) => (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ── Presentación compartida (pantalla, Excel y PDF) ─────────────────
export const ESTADOS_CREDITO = { con_vencidas: 'Con cuotas vencidas', con_parciales: 'Con pagos parciales', al_dia: 'Al día', por_conciliar: 'Con cuotas por conciliar' };
export const etiquetaCredito = (x) => [x.acreedor, x.tipoCredito || x.modalidad, x.identificador && `N° ${x.identificador}`].filter(Boolean).join(' · ');
// Agrupa empresa → crédito/contrato (cada registro es un contrato: dos contratos del mismo
// banco son dos filas). Subtotales = suma de los créditos del grupo, en US$.
export function agruparInforme(inf, { empresa = '', acreedor = '', estado = '', naturaleza = 'financiera' } = {}) {
  const filas = inf.filas.filter(x => x.naturaleza === naturaleza && (!empresa || x.empresa === empresa) && (!acreedor || x.acreedor === acreedor)
    && (!estado || (estado === 'por_conciliar' ? x.tienePorConciliar : x.estadoCredito === estado)));
  const sum = (arr) => {
    const o = Object.fromEntries(CAMPOS.map(k => [k, 0]));
    arr.forEach(x => { if (x.usd) CAMPOS.forEach(k => { o[k] += x.usd[k]; }); });
    CAMPOS.forEach(k => { o[k] = r2(o[k]); });
    o.creditos = arr.filter(x => x.usd).length; o.listados = arr.length;
    return o;
  };
  const emps = [...new Set(filas.map(x => x.empresa))].sort((a, b) => a.localeCompare(b));
  const grupos = emps.map(e => {
    const fs = filas.filter(x => x.empresa === e)
      .sort((a, b) => ((b.usd ? b.usd.totalIdentificado : 0) - (a.usd ? a.usd.totalIdentificado : 0)) || a.acreedor.localeCompare(b.acreedor));
    return { empresa: e, filas: fs, sub: sum(fs) };
  });
  return { grupos, total: sum(filas), filtrado: !!(empresa || acreedor || estado), n: filas.length };
}
export function textoConteo(inf) {
  const c = inf.conteo;
  const sin = inf.sinTC.map(z => `${z.empresa} · ${z.acreedor} (${z.moneda})`).join('; ');
  return `${c.listados} créditos${c.anticipos ? ` (${c.listados - c.anticipos} de deuda financiera y ${c.anticipos} anticipos de clientes)` : ''}: ${c.incluidos} en los totales` + (c.sinTC ? `; ${c.sinTC} fuera por no tener tipo de cambio (${sin})` : '');
}
// Qué NO está en el «Total de pagos pendientes identificados».
export function textosExcluidos(inf) {
  const out = [];
  if (inf.obligaciones.porConciliar > 0) out.push(`Cuotas por conciliar: US$ ${fmtUSD(inf.obligaciones.porConciliar)}.`);
  inf.sinTC.forEach(z => out.push(`${z.empresa} · ${z.acreedor}, sin tipo de cambio: ${z.moneda} ${fmtMon(z.totalIdentificado, z.moneda)}${z.porConciliar ? ` (más ${z.moneda} ${fmtMon(z.porConciliar, z.moneda)} por conciliar)` : ''}.`));
  inf.noDesembolsados.forEach(z => out.push(`${z.empresa} · ${z.acreedor}, aún no desembolsado (${z.desembolso}).`));
  if (inf.proyeccionRenovaciones && inf.proyeccionRenovaciones.usd > 0) out.push(`Renovaciones que aún no rigen (proyección): US$ ${fmtUSD(inf.proyeccionRenovaciones.usd)} entre capital nuevo, intereses y cargos.`);
  out.push('Obligaciones no registradas en Créditos (proveedores, otros anticipos, garantías otorgadas).');
  return out;
}
