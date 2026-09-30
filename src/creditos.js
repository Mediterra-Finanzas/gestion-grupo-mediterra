/* eslint-disable */
// ═══════════════════════════════════════════════════════════════════
// CRÉDITOS — modelo puro (sin React). Una sola fuente de verdad para:
//   · el calendario de cada crédito (capital / intereses / otros cargos),
//   · los pagos registrados (totales y parciales) y el estado de cada cuota,
//   · lo que el Flujo de Caja proyecta (solo lo PENDIENTE),
//   · el análisis de cartera y la simulación de prepago.
//
// Tipos de registro (todos conviven, sin migración forzada):
//   legacy   → la fila histórica: 1 fila = 1 vencimiento con `cuota` total
//              (o cuotas mensuales f_inicio→f_venc). Sin desglose, salvo que
//              se cargue `desglose:{capital,interes,cargos}`.
//   socio    → tipo_credito "socio" (tabla de creditoSocio.js).
//   contrato → tipo_credito "contrato": calendario generado desde las
//              condiciones (francés, lineal, bullet…) o calendario manual.
//   + renovaciones (c.renovable) → línea "Renovaciones" del flujo.
//
// Total del vencimiento = capital + intereses + otros cargos (+ sin desglose,
// solo en filas legacy que aún no se clasifican).
//
// Reglas:
//   · El saldo de capital baja SOLO por pagos de capital (y prepagos).
//   · Un pago no se borra ni se edita: se anula con motivo.
//   · Un crédito no se borra: se anula (y no se puede si tiene pagos vigentes).
//   · Un vencimiento impago NO desaparece: con fecha < hoy se arrastra al mes
//     y semana en curso del flujo, marcado como vencido.
//   · Las fechas ISO se leen como texto (AAAA-MM-DD). Nada de new Date(iso)
//     local: en Chile (UTC-3/-4) el día 1 caía en el mes anterior.
// ═══════════════════════════════════════════════════════════════════
import { calcularAmortizacionSocio } from './creditoSocio.js';

const EPS = 0.005;
const r2 = (x) => Math.round((Number(x) || 0) * 100) / 100;
const num = (x) => {
  if (x === null || x === undefined || x === '') return 0;
  if (typeof x === 'number') return isFinite(x) ? x : 0;
  const n = parseFloat(String(x).replace('%', '').replace(',', '.'));
  return isFinite(n) ? n : 0;
};
const esNum = (x) => x !== null && x !== undefined && x !== '' && isFinite(parseFloat(String(x).replace('%', '').replace(',', '.')));

// ── Fechas (texto ISO, sin zona horaria) ────────────────────────────
export function partesISO(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  if (!m) return null;
  return { y: +m[1], m: +m[2], d: +m[3] };
}
const diasMes = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate(); // m: 1-12
const aISO = (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
export function isoValida(iso) { const p = partesISO(iso); return !!p && p.m >= 1 && p.m <= 12 && p.d >= 1 && p.d <= diasMes(p.y, p.m); }

// Suma meses conservando el día; si el mes no lo tiene, usa el último día
// (31-ene + 1 mes = 28/29-feb; no se desborda a marzo).
export function sumarMeses(iso, n) {
  const p = partesISO(iso);
  if (!p) return '';
  let tot = p.y * 12 + (p.m - 1) + (Number(n) || 0);
  const y = Math.floor(tot / 12), m = (tot % 12) + 1;
  return aISO(y, m, Math.min(p.d, diasMes(y, m)));
}
const utc = (iso) => { const p = partesISO(iso); return p ? Date.UTC(p.y, p.m - 1, p.d) : NaN; };
export function diasEntre(a, b) {
  const x = utc(a), y = utc(b);
  if (isNaN(x) || isNaN(y)) return 0;
  return Math.round((y - x) / 86400000);
}
export function hoyISO() {
  // Fecha local del usuario (no UTC): a las 22:00 en Chile ya es "mañana" en UTC.
  const d = new Date();
  return aISO(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

// ── Base de cálculo de intereses ────────────────────────────────────
export const BASES = { act360: 'Actual/360', act365: 'Actual/365', '30360': '30/360' };
export function fraccionAnio(base, desde, hasta) {
  if (!desde || !hasta) return 0;
  if (base === '30360') {
    const a = partesISO(desde), b = partesISO(hasta);
    if (!a || !b) return 0;
    const d1 = Math.min(a.d, 30);
    const d2 = (d1 === 30) ? Math.min(b.d, 30) : b.d;
    return ((b.y - a.y) * 360 + (b.m - a.m) * 30 + (d2 - d1)) / 360;
  }
  const dias = diasEntre(desde, hasta);
  return dias / (base === 'act365' ? 365 : 360);
}

// ── Catálogos ───────────────────────────────────────────────────────
export const TIPOS_ACREEDOR = ['Banco', 'Socio', 'Empresa relacionada', 'Persona natural', 'Otro'];
export const TIPOS_CREDITO = ['Capital de trabajo', 'Leasing', 'PAE', 'Bullet', 'Cuotas Mensuales',
  'Crédito Hipotecario', 'Inversión', 'Otro'];
export const MONEDAS = ['USD', 'CLP', 'UF', 'PEN', 'EUR'];
export const MODALIDADES = {
  frances: 'Cuota fija (capital + interés)',
  lineal: 'Amortización de capital constante',
  bullet_int: 'Bullet: intereses periódicos, capital al vencimiento',
  bullet_total: 'Bullet: capital + intereses al vencimiento',
  manual: 'Calendario contractual manual',
};

// ── Identidad ───────────────────────────────────────────────────────
// Los datos históricos traen `n` repetidos (p. ej. 30–37 en Osiris y Allpa):
// editar, marcar o borrar "por n" tocaba dos créditos a la vez. Cada registro
// recibe un `uid` estable la primera vez que se carga.
export function uidCredito(c) { return c && c.uid ? c.uid : `n${c && c.n}`; }
export function asegurarUids(lista) {
  const vistos = new Set();
  let cambio = false;
  const out = (Array.isArray(lista) ? lista : []).map((c, i) => {
    if (!c || typeof c !== 'object') return c;
    let uid = c.uid;
    if (!uid || vistos.has(uid)) { uid = `cr-${c.n != null ? c.n : 'x'}-${i}`; cambio = true; }
    let k = 0; const base = uid;
    while (vistos.has(uid)) uid = `${base}-${++k}`;
    vistos.add(uid);
    return uid === c.uid ? c : { ...c, uid };
  });
  return { lista: out, cambio };
}
export const esContrato = (c) => c && c.tipo_credito === 'contrato';
export const esSocio = (c) => c && c.tipo_credito === 'socio';
export const esAnulado = (c) => !!(c && c.anulado);

// ── Tasa del crédito (con su origen, para declarar hipótesis) ───────
export function tasaCredito(c) {
  if (!c) return { tasa: null, variable: false, origen: 'sin dato' };
  if (esContrato(c)) {
    if (c.tasa_tipo === 'variable') {
      const ok = esNum(c.tasa_ref_hipotesis) && esNum(c.margen);
      return {
        tasa: ok ? num(c.tasa_ref_hipotesis) + num(c.margen) : null,
        variable: true,
        origen: ok ? `${c.tasa_ref_nombre || 'referencia'} ${num(c.tasa_ref_hipotesis)}% (hipótesis) + margen ${num(c.margen)}%` : 'variable sin hipótesis de referencia',
      };
    }
    return { tasa: esNum(c.tasa_anual) ? num(c.tasa_anual) : null, variable: false, origen: esNum(c.tasa_anual) ? 'contrato' : 'sin dato' };
  }
  if (esSocio(c)) return { tasa: esNum(c.tasa_efectiva_anual) ? num(c.tasa_efectiva_anual) : null, variable: false, efectiva: true, origen: 'tasa efectiva anual del registro' };
  if (c.tasa_tipo === 'variable') return { tasa: esNum(c.tasa) ? num(c.tasa) : null, variable: true, origen: 'registro (variable)' };
  return { tasa: esNum(c.tasa) ? num(c.tasa) : null, variable: false, origen: esNum(c.tasa) ? 'registro' : 'sin dato' };
}

// ── Renovaciones (formato nuevo en array + legacy en campos planos) ─
const MES_ABR_NUM = { Ene: 1, Feb: 2, Mar: 3, Abr: 4, May: 5, Jun: 6, Jul: 7, Ago: 8, Sep: 9, Oct: 10, Nov: 11, Dic: 12 };
export function getRenovaciones(c) {
  if (Array.isArray(c.renovaciones) && c.renovaciones.length) {
    return c.renovaciones.map(r => ({
      monto: r.monto, mes_ingreso: r.mes_ingreso, anio_ingreso: r.anio_ingreso,
      tasa_anual: (r.tasa_anual != null && r.tasa_anual !== '') ? r.tasa_anual : c.tasa_anual,
      cuotas: r.cuotas || [],
    }));
  }
  if (c.monto_renovacion || (c.cuotas_renovacion || []).length) {
    return [{ monto: c.monto_renovacion, mes_ingreso: c.mes_ingreso_renovacion, anio_ingreso: c.anio_ingreso_renovacion,
      tasa_anual: c.tasa_anual, cuotas: c.cuotas_renovacion || [] }];
  }
  return [];
}
// "Solo Interés": interés sobre saldo (capital no baja). "Capital+Interés":
// amortización equitativa + interés sobre saldo. Interés mensual simple.
export function calcMontoRealCuota(cuotas, capital, tasaAnual, mesIngresoAnio) {
  const cuotasArr = cuotas || [];
  if (cuotasArr.length === 0) return [];
  const tasaMensual = (Number(tasaAnual) || 0) / 100 / 12;
  const nCapital = cuotasArr.filter(cq => (cq.tipo || 'Solo Interés') === 'Capital+Interés').length;
  const amortPorCuota = nCapital > 0 ? (Number(capital) || 0) / nCapital : 0;
  let saldo = Number(capital) || 0;
  let fechaBase = null;
  if (mesIngresoAnio) {
    const parts = String(mesIngresoAnio).split('-');
    if (parts.length === 2) {
      const anioS = parts[1];
      fechaBase = { y: anioS.length === 2 ? 2000 + parseInt(anioS) : parseInt(anioS), m: MES_ABR_NUM[parts[0]] || 1 };
    }
  }
  return cuotasArr.map((cq, i) => {
    const tipo = cq.tipo || 'Solo Interés';
    let interes = 0;
    if (tasaMensual > 0 && cq.mes && cq.anio) {
      const mesN = MES_ABR_NUM[cq.mes] || 1;
      const anioN = parseInt(cq.anio) || 2026;
      let mesesTransc = 1;
      if (fechaBase) {
        const pc = i === 0 ? null : cuotasArr[i - 1];
        const prev = i === 0 ? fechaBase : (pc && pc.mes && pc.anio ? { y: parseInt(pc.anio) || 2026, m: MES_ABR_NUM[pc.mes] || 1 } : fechaBase);
        mesesTransc = (anioN - prev.y) * 12 + (mesN - prev.m);
      }
      mesesTransc = Math.max(1, mesesTransc);
      interes = Math.round(saldo * tasaMensual * mesesTransc);
    }
    let montoReal, amort = 0;
    if (tipo === 'Capital+Interés') {
      amort = Math.round(amortPorCuota);
      montoReal = amort + interes;
      saldo = Math.max(0, saldo - amort);
    } else montoReal = interes;
    return { ...cq, montoReal, interes, amort };
  });
}
export function calcCuotasRenovacion(ren) {
  return calcMontoRealCuota(ren.cuotas, ren.monto, ren.tasa_anual,
    ren.mes_ingreso && ren.anio_ingreso ? `${ren.mes_ingreso}-${String(ren.anio_ingreso).slice(-2)}` : '');
}

// ═══════════════════════════════════════════════════════════════════
// CALENDARIO CONTRACTUAL (tipo "contrato")
// ═══════════════════════════════════════════════════════════════════
// Fechas de vencimiento: primer_venc, +periodicidad… hasta vencimiento_final
// (si el final no calza con el paso, igual es el último vencimiento).
export function fechasContrato(c) {
  const p = Math.max(1, parseInt(c.periodicidad) || 1);
  const fin = c.vencimiento_final;
  if (c.modalidad === 'bullet_total') return isoValida(fin) ? [fin] : [];
  const f1 = isoValida(c.primer_venc) ? c.primer_venc : (isoValida(c.fecha_desembolso) ? sumarMeses(c.fecha_desembolso, p) : '');
  if (!f1 || !isoValida(fin) || f1 > fin) return f1 && isoValida(fin) && f1 > fin ? [] : (f1 && !fin ? [f1] : []);
  const out = [];
  for (let k = 0; k < 1200; k++) {
    const f = sumarMeses(f1, k * p);
    if (f > fin) break;
    out.push(f);
  }
  if (out[out.length - 1] !== fin) out.push(fin);
  return out;
}

// Datos que faltan para poder generar el calendario automático.
export function datosFaltantesContrato(c) {
  const f = [];
  if (!(num(c.monto) > 0)) f.push('capital original');
  if (!isoValida(c.fecha_desembolso)) f.push('fecha de desembolso');
  if (c.modalidad === 'manual') {
    if (!(c.calendario_manual || []).some(r => isoValida(r.fecha))) f.push('calendario manual (al menos un vencimiento con fecha)');
    return f;
  }
  if (!MODALIDADES[c.modalidad]) f.push('modalidad de pago');
  if (!isoValida(c.vencimiento_final)) f.push('vencimiento final');
  const t = tasaCredito(c);
  if (t.tasa === null) f.push(c.tasa_tipo === 'variable' ? 'tasa de referencia (hipótesis) y margen' : 'tasa de interés');
  if (!BASES[c.base]) f.push('base de cálculo de intereses');
  return f;
}

// Prepagos vigentes ordenados.
const prepagosVigentes = (c, extra) => [...(c.prepagos || []), ...(extra ? [extra] : [])]
  .filter(p => p && !p.anulado && isoValida(p.fecha) && num(p.capital) > 0)
  .sort((a, b) => a.fecha.localeCompare(b.fecha));

// Genera las filas {fecha, capital, interes, cargos, saldoInicial, saldoFinal,
// capitalizado, dias}. `prepagoExtra` permite simular sin tocar el crédito.
export function calendarioContrato(c, prepagoExtra = null) {
  const falt = datosFaltantesContrato(c);
  const avisos = [];
  if (falt.length) return { filas: [], faltantes: falt, avisos };
  const C0 = num(c.monto);
  const cargosPer = (c.cargos_periodicos || []).reduce((s, x) => s + num(x.monto), 0);
  const prepagos = prepagosVigentes(c, prepagoExtra);
  let filas = [];

  if (c.modalidad === 'manual') {
    const man = (c.calendario_manual || []).filter(r => isoValida(r.fecha))
      .map(r => ({ fecha: r.fecha, capital: num(r.capital), interes: num(r.interes), cargos: num(r.cargos), nota: r.nota || '' }))
      .sort((a, b) => a.fecha.localeCompare(b.fecha));
    // Prepagos sobre un calendario manual: el capital se descuenta de las
    // cuotas posteriores (plazo: desde la última hacia atrás; cuota: a
    // prorrata). Los intereses posteriores se ajustan en proporción al saldo:
    // es una ESTIMACIÓN (el calendario manual no trae su regla de interés).
    prepagos.forEach(pp => {
      const post = man.filter(r => r.fecha > pp.fecha);
      const capPost = post.reduce((s, r) => s + r.capital, 0);
      if (capPost <= EPS) return;
      const x = Math.min(num(pp.capital), capPost);
      const ratio = (capPost - x) / capPost;
      if (pp.modo === 'cuota') post.forEach(r => { r.capital = r.capital * ratio; });
      else { let rest = x; for (let i = post.length - 1; i >= 0 && rest > EPS; i--) { const q = Math.min(post[i].capital, rest); post[i].capital -= q; rest -= q; } }
      post.forEach(r => { r.interes = r.interes * ratio; r.estimado = true; });
      avisos.push(`Prepago ${pp.fecha}: intereses posteriores del calendario manual ajustados en proporción al saldo (estimación).`);
    });
    let saldo = C0, j = 0;
    filas = man.map(r => {
      while (j < prepagos.length && prepagos[j].fecha < r.fecha) saldo -= num(prepagos[j++].capital);
      const si = saldo; saldo = saldo - r.capital;
      return { ...r, capital: r2(r.capital), interes: r2(r.interes), cargos: r2(r.cargos), saldoInicial: r2(si), saldoFinal: r2(saldo) };
    }).filter(r => r.capital > EPS || r.interes > EPS || r.cargos > EPS);
    const capTot = man.reduce((s, r) => s + r.capital, 0) + prepagos.reduce((s, p) => s + num(p.capital), 0);
    if (Math.abs(capTot - C0) > 0.01) avisos.push(`El capital del calendario manual (${r2(capTot)}) no suma el capital original (${r2(C0)}).`);
  } else {
    const t = tasaCredito(c).tasa / 100;
    const base = c.base;
    const p = Math.max(1, parseInt(c.periodicidad) || 1);
    const fechas = fechasContrato(c);
    const N = fechas.length;
    const g = c.modalidad === 'bullet_total' ? 0 : Math.min(Math.max(0, parseInt(c.gracia_periodos) || 0), Math.max(0, N - 1));
    const graciaTotal = c.gracia_tipo === 'total';
    let saldo = C0, prev = c.fecha_desembolso, cuotaFija = null, amortFija = null;
    let pi = 0;
    for (let k = 0; k < N && saldo > EPS; k++) {
      const f = fechas[k];
      // Prepagos dentro del período: bajan el saldo antes del interés. El
      // interés devengado del capital prepagado se paga en el prepago; el
      // capital que queda devenga el período completo.
      let recalcular = false;
      while (pi < prepagos.length && prepagos[pi].fecha < f) {
        if (prepagos[pi].fecha >= prev || k === 0) {
          saldo = Math.max(0, saldo - num(prepagos[pi].capital));
          if (prepagos[pi].modo === 'cuota') recalcular = true;
        }
        pi++;
      }
      if (saldo <= EPS) break;
      const dias = diasEntre(prev, f);
      const interes = saldo * t * fraccionAnio(base, prev, f);
      const si = saldo;
      let capital = 0, intPagado = interes, capitalizado = 0;
      const esUltima = k === N - 1;
      if (k < g) {
        if (graciaTotal) { capitalizado = interes; intPagado = 0; saldo += interes; }
      } else if (c.modalidad === 'bullet_int' || c.modalidad === 'bullet_total') {
        capital = esUltima ? saldo : 0;
      } else if (c.modalidad === 'lineal') {
        const restantes = N - k;
        if (amortFija === null || recalcular) amortFija = saldo / restantes;
        capital = esUltima ? saldo : Math.min(amortFija, saldo);
      } else { // frances
        const restantes = N - k;
        const r = t * p / 12;
        if (cuotaFija === null || recalcular) cuotaFija = r > 0 ? saldo * r / (1 - Math.pow(1 + r, -restantes)) : saldo / restantes;
        capital = esUltima ? saldo : Math.max(0, Math.min(cuotaFija - interes, saldo));
      }
      // Montos redondeados al centavo ANTES de bajar el saldo: Σ capital de
      // las cuotas = capital original exacto (la última absorbe la diferencia).
      capital = esUltima ? r2(saldo) : r2(capital);
      saldo = r2(saldo - capital);
      filas.push({ fecha: f, dias, capital: r2(capital), interes: r2(intPagado), cargos: r2(cargosPer), capitalizado: r2(capitalizado),
        saldoInicial: r2(si), saldoFinal: r2(saldo) });
      prev = f;
    }
  }
  // Cargos únicos (comisión de apertura, notaría, etc.): van en el vencimiento
  // de esa fecha o en uno propio.
  (c.cargos_unicos || []).filter(x => isoValida(x.fecha) && num(x.monto)).forEach(x => {
    const f = filas.find(r => r.fecha === x.fecha);
    if (f) f.cargos = r2(f.cargos + num(x.monto));
    else filas.push({ fecha: x.fecha, capital: 0, interes: 0, cargos: r2(num(x.monto)), soloCargo: true, concepto: x.concepto || 'Cargo' });
  });
  filas.sort((a, b) => a.fecha.localeCompare(b.fecha));
  return { filas, faltantes: [], avisos };
}

// ═══════════════════════════════════════════════════════════════════
// VENCIMIENTOS (antes de pagos) — cualquier tipo de registro
// ═══════════════════════════════════════════════════════════════════
const V = (c, key, fecha, comp, extra = {}) => {
  const capital = r2(comp.capital), interes = r2(comp.interes), cargos = r2(comp.cargos), sinDesglose = r2(comp.sinDesglose);
  return {
    key, uid: uidCredito(c), n: c.n, empresa: c.empresa, acreedor: c.acreedor || '', moneda: c.moneda || 'USD',
    tipo_cr: c.tipo_cr || '', fecha, capital, interes, cargos, sinDesglose,
    total: r2(capital + interes + cargos + sinDesglose), origen: 'cuota', ...extra,
  };
};

// Desglose opcional de una fila legacy: si la suma no calza con la cuota, lo
// que falta queda "sin desglose" (nunca se inventa la división).
function compLegacy(c, cuota) {
  const d = c.desglose;
  if (!d || (d.capital === '' && d.interes === '' && d.cargos === '')) return { capital: 0, interes: 0, cargos: 0, sinDesglose: cuota };
  const capital = num(d.capital), interes = num(d.interes), cargos = num(d.cargos);
  return { capital, interes, cargos, sinDesglose: Math.max(0, cuota - capital - interes - cargos) };
}

export function vencimientosCredito(c) {
  if (!c || esAnulado(c)) return [];
  const uid = uidCredito(c);
  const out = [];
  const conClave = (fecha) => { let k = `${uid}@${fecha}`, i = 0; while (out.some(v => v.key === k)) k = `${uid}@${fecha}~${++i}`; return k; };
  if (esContrato(c)) {
    const { filas } = calendarioContrato(c);
    filas.forEach(f => out.push(V(c, conClave(f.fecha), f.fecha, f, { estimado: !!f.estimado, capitalizado: f.capitalizado || 0 })));
  } else if (esSocio(c)) {
    const { filas } = calcularAmortizacionSocio(c.monto, c.tasa_efectiva_anual, c.fecha_desembolso, c.cuotas_socio);
    filas.forEach(f => {
      if (!(f.cuota_total > 0) || !isoValida(f.fecha)) return;
      out.push(V(c, conClave(f.fecha), f.fecha, { capital: f.amortizacion, interes: f.interes, cargos: 0, sinDesglose: 0 }));
    });
  } else {
    const cuota = num(c.cuota);
    if (isoValida(c.f_venc) && cuota) {
      if (c.tipo_cr === 'Cuotas Mensuales' && isoValida(c.f_inicio)) {
        for (let k = 1; k < 1200; k++) {
          const f = sumarMeses(c.f_inicio, k);
          if (f > c.f_venc) break;
          out.push(V(c, conClave(f), f, compLegacy(c, cuota)));
        }
      } else out.push(V(c, conClave(c.f_venc), c.f_venc, compLegacy(c, cuota)));
    }
  }
  if (c.renovable) {
    getRenovaciones(c).forEach((ren, ri) => {
      calcCuotasRenovacion(ren).forEach((cq, ci) => {
        const mes = MES_ABR_NUM[cq.mes];
        const anio = parseInt(cq.anio);
        if (!mes || !anio) return;
        const fecha = aISO(anio, mes, Math.min(28, diasMes(anio, mes)));
        const amort = num(cq.amort), interes = num(cq.interes);
        const total = num(cq.montoReal) || num(cq.monto);
        out.push(V(c, `${uid}@R${ri}@${ci}`, fecha,
          { capital: amort, interes, cargos: 0, sinDesglose: Math.max(0, total - amort - interes) }, { origen: 'renovacion', renovacion: ri }));
      });
    });
  }
  return out.sort((a, b) => a.fecha.localeCompare(b.fecha));
}

// ═══════════════════════════════════════════════════════════════════
// PAGOS
// ═══════════════════════════════════════════════════════════════════
// pago = { id, vencKey, fecha, capital, interes, cargos, sinDesglose, tipo:"pago"|"prepago"|"refinanciamiento",
//          nota, usuario, ts, anulado?, motivoAnulacion?, anuladoPor?, anuladoTs? }
export const pagosVigentes = (c) => (c && Array.isArray(c.pagos) ? c.pagos : []).filter(p => p && !p.anulado);
export const totalPago = (p) => r2(num(p.capital) + num(p.interes) + num(p.cargos) + num(p.sinDesglose));

const COMP = ['capital', 'interes', 'cargos', 'sinDesglose'];

// Aplica los pagos vigentes a los vencimientos. Un pago "sin desglose" se
// imputa primero a lo sin desglose y luego a cargos → intereses → capital
// (orden de imputación del art. 1595 del Código Civil). Vencimientos con
// fecha < hoy y saldo por pagar quedan como vencidos.
export function aplicarPagos(c, vencs, hoy = hoyISO()) {
  const pagos = pagosVigentes(c);
  const porVenc = {};
  pagos.forEach(p => { if (p.vencKey) (porVenc[p.vencKey] = porVenc[p.vencKey] || []).push(p); });
  const legacyPagado = c && c.pagado === true && !esContrato(c);
  const claves = new Set(vencs.map(v => v.key));
  const res = vencs.map(v => {
    const due = { capital: v.capital, interes: v.interes, cargos: v.cargos, sinDesglose: v.sinDesglose };
    const pag = { capital: 0, interes: 0, cargos: 0, sinDesglose: 0 };
    const ps = porVenc[v.key] || [];
    let sd = 0;
    ps.forEach(p => { pag.capital += num(p.capital); pag.interes += num(p.interes); pag.cargos += num(p.cargos); sd += num(p.sinDesglose); });
    // imputación del monto sin desglose
    ['sinDesglose', 'cargos', 'interes', 'capital'].forEach(k => {
      if (sd <= EPS) return;
      const falta = Math.max(0, due[k] - pag[k]);
      const q = Math.min(falta, sd); pag[k] += q; sd -= q;
    });
    const exceso = r2(sd);
    const pagadoTotal = r2(COMP.reduce((s, k) => s + pag[k], 0));
    let pend = {};
    const legacyOrigen = legacyPagado && v.origen === 'cuota';
    COMP.forEach(k => {
      pend[k] = legacyOrigen ? 0 : (due[k] >= 0 ? Math.max(0, due[k] - pag[k]) : 0);
    });
    let pendienteTotal = r2(COMP.reduce((s, k) => s + pend[k], 0));
    if (pendienteTotal <= EPS) { pendienteTotal = 0; COMP.forEach(k => { pend[k] = 0; }); }
    COMP.forEach(k => { pend[k] = r2(pend[k]); pag[k] = r2(pag[k]); });
    const vencida = pendienteTotal > 0 && v.fecha < hoy;
    const parcial = pendienteTotal > 0 && pagadoTotal > EPS;
    const estado = pendienteTotal === 0 ? 'pagada' : (vencida ? 'vencida' : (parcial ? 'parcial' : 'pendiente'));
    return { ...v, pagado: pag, pagadoTotal, pendiente: pend, pendienteTotal, exceso, vencida, parcial, estado,
      pagadoSinRegistro: legacyOrigen && pagadoTotal <= EPS, pagos: ps };
  });
  const huerfanos = pagos.filter(p => p.vencKey && !claves.has(p.vencKey) && (p.tipo || 'pago') === 'pago');
  return { vencimientos: res, huerfanos };
}

// Estado completo de un crédito.
export function estadoCredito(c, hoy = hoyISO()) {
  const vencs = vencimientosCredito(c);
  const { vencimientos, huerfanos } = aplicarPagos(c, vencs, hoy);
  const suma = (arr, f) => r2(arr.reduce((s, v) => s + f(v), 0));
  const saldoCapital = suma(vencimientos, v => v.pendiente.capital);
  const sinDesglosePend = suma(vencimientos, v => v.pendiente.sinDesglose);
  const pendienteTotal = suma(vencimientos, v => v.pendienteTotal);
  const vencidoTotal = suma(vencimientos.filter(v => v.vencida), v => v.pendienteTotal);
  // "extincion" = capital/interés que se extinguen por un prepago sin ser un
  // movimiento de caja propio (la caja está en el registro "prepago").
  const pagosTot = pagosVigentes(c).filter(p => p.tipo !== 'extincion');
  const ultimo = vencimientos.length ? vencimientos[vencimientos.length - 1].fecha : (c.f_venc || '');
  let estado = 'vigente';
  if (esAnulado(c)) estado = 'anulado';
  else if (vencimientos.length && pendienteTotal === 0) estado = 'cerrado';
  else if (vencidoTotal > 0) estado = 'con_vencidos';
  const t = tasaCredito(c);
  const faltantes = esContrato(c) ? datosFaltantesContrato(c) : [];
  return {
    c, uid: uidCredito(c), vencimientos, huerfanos, saldoCapital, sinDesglosePend, pendienteTotal, vencidoTotal,
    interesPend: suma(vencimientos, v => v.pendiente.interes), cargosPend: suma(vencimientos, v => v.pendiente.cargos),
    pagadoCapital: r2(pagosTot.reduce((s, p) => s + num(p.capital), 0)),
    pagadoTotal: r2(pagosTot.reduce((s, p) => s + totalPago(p), 0)),
    vencimientoFinal: ultimo, estado, tasa: t, faltantes,
    proximo: vencimientos.find(v => v.pendienteTotal > 0 && !v.vencida) || null,
  };
}

// Registrar / anular pagos (devuelven un crédito NUEVO; no mutan).
export function registrarPago(c, pago, usuario = '') {
  const comp = {};
  COMP.forEach(k => { comp[k] = r2(num(pago[k])); if (comp[k] < 0) comp[k] = 0; });
  const tot = COMP.reduce((s, k) => s + comp[k], 0);
  if (!(tot > 0)) throw new Error('El pago debe tener un monto mayor a cero.');
  if (!isoValida(pago.fecha)) throw new Error('El pago necesita fecha efectiva (AAAA-MM-DD).');
  const ts = new Date().toISOString();
  const nuevo = { id: `pg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`, vencKey: pago.vencKey || null,
    fecha: pago.fecha, ...comp, tipo: pago.tipo || 'pago', nota: pago.nota || '', usuario, ts, ...(pago.extra || {}) };
  return { ...c, pagos: [...(c.pagos || []), nuevo],
    historial: [...(c.historial || []), { ts, usuario, accion: nuevo.tipo === 'prepago' ? 'prepago' : 'pago', detalle: `${nuevo.fecha} · ${r2(tot)} ${c.moneda || 'USD'}${pago.vencKey ? ' · ' + pago.vencKey : ''}` }] };
}
export function anularPago(c, pagoId, motivo, usuario = '') {
  if (!motivo || !String(motivo).trim()) throw new Error('Anular un pago requiere motivo.');
  const ts = new Date().toISOString();
  let encontrado = null;
  const pagos = (c.pagos || []).map(p => {
    if (p.anulado) return p;
    if (p.id === pagoId) encontrado = p;
    else if (!(p.grupo && p.grupo === pagoId)) return p;   // extinciones del mismo prepago
    return { ...p, anulado: true, motivoAnulacion: String(motivo).trim(), anuladoPor: usuario, anuladoTs: ts };
  });
  if (!encontrado) throw new Error('Pago no encontrado o ya anulado.');
  // Un pago de prepago también retira su evento de capital del calendario.
  const prepagos = (c.prepagos || []).map(pp => pp.pagoId === pagoId && !pp.anulado ? { ...pp, anulado: true, motivoAnulacion: String(motivo).trim() } : pp);
  return { ...c, pagos, prepagos, historial: [...(c.historial || []), { ts, usuario, accion: 'anula_pago', detalle: `${encontrado.fecha} · ${totalPago(encontrado)} · ${motivo}` }] };
}
export const puedeAnularCredito = (c) => pagosVigentes(c).length === 0 && c.pagado !== true;

// ═══════════════════════════════════════════════════════════════════
// FLUJO DE CAJA — lo pendiente, por empresa, mes y semana (en USD)
// ═══════════════════════════════════════════════════════════════════
// Conversión a USD: `tc_flujo` = unidades de la moneda por 1 US$ (CLP 950,
// PEN 3,75, UF 0,025…). Sin TC no se puede sumar a un flujo en USD: el
// crédito se informa como "sin TC" y NO se mezcla en otra moneda.
export function factorUSD(c) {
  const mon = (c && c.moneda) || 'USD';
  if (mon === 'USD') return 1;
  const tc = num(c.tc_flujo);
  return tc > 0 ? 1 / tc : null;
}

// opts: { hoy, nMeses, ubicar(iso) → {idx, semIdx} (idx −1 fuera de horizonte) }
export function flujoCreditosEmpresa(empresa, creditos, opts = {}) {
  const hoy = opts.hoy || hoyISO();
  const n = opts.nMeses || 63;
  const ubicar = opts.ubicar;
  const Z = () => Array(n).fill(0);
  const bloque = () => ({ total: Z(), capital: Z(), interes: Z(), cargos: Z(), sinDesglose: Z(), sem: {}, porAcreedor: {},
    semComp: { capital: {}, interes: {}, cargos: {}, sinDesglose: {} } });
  const out = { prestamos: bloque(), renovaciones: bloque(), ingresos: { total: Z(), porAcreedor: {} },
    arrastrados: [], sinTC: [], antesHorizonte: [] };
  const hoyPos = ubicar ? ubicar(hoy) : { idx: -1, semIdx: 0 };
  (creditos || []).filter(c => c && c.empresa === empresa && !esAnulado(c)).forEach(c => {
    const f = factorUSD(c);
    if (f === null) { out.sinTC.push(c); return; }
    const { vencimientos } = aplicarPagos(c, vencimientosCredito(c), hoy);
    vencimientos.forEach(v => {
      if (!(v.pendienteTotal > 0)) return;
      let pos = ubicar ? ubicar(v.fecha) : { idx: -1, semIdx: 0 };
      // Impago con fecha pasada: se arrastra al mes/semana en curso (no se pierde).
      if (v.fecha < hoy && hoyPos.idx >= 0) { pos = hoyPos; out.arrastrados.push({ ...v, usd: r2(v.pendienteTotal * f) }); }
      if (pos.idx < 0) { if (v.fecha < hoy) out.antesHorizonte.push(v); return; }
      const b = v.origen === 'renovacion' ? out.renovaciones : out.prestamos;
      const add = (arr, x) => { arr[pos.idx] += x; };
      const tot = v.pendienteTotal * f;
      add(b.total, tot); add(b.capital, v.pendiente.capital * f); add(b.interes, v.pendiente.interes * f);
      add(b.cargos, v.pendiente.cargos * f); add(b.sinDesglose, v.pendiente.sinDesglose * f);
      const si = Math.min(3, Math.max(0, pos.semIdx || 0));
      const s = b.sem[pos.idx] || (b.sem[pos.idx] = [0, 0, 0, 0]);
      s[si] += tot;
      ['capital', 'interes', 'cargos', 'sinDesglose'].forEach(k => {
        const sc = b.semComp[k][pos.idx] || (b.semComp[k][pos.idx] = [0, 0, 0, 0]);
        sc[si] += v.pendiente[k] * f;
      });
      const acr = v.origen === 'renovacion' ? `${c.acreedor} (Ren.)` : (c.acreedor || '—');
      const a = b.porAcreedor[acr] || (b.porAcreedor[acr] = { mes: Z(), sem: {} });
      a.mes[pos.idx] += tot;
      const as = a.sem[pos.idx] || (a.sem[pos.idx] = [0, 0, 0, 0]);
      as[Math.min(3, Math.max(0, pos.semIdx || 0))] += tot;
    });
    // Ingreso del financiamiento (desembolso). Legacy/socio: comportamiento
    // histórico (fecha de inicio/desembolso, si no está marcado pagado).
    // Contrato: en la fecha de desembolso, salvo que no mueva caja
    // (refinanciamiento con el mismo banco).
    let fIng = null;
    if (esContrato(c)) fIng = c.desembolso_en_flujo === false ? null : c.fecha_desembolso;
    else if (!c.pagado) fIng = esSocio(c) ? c.fecha_desembolso : c.f_inicio;
    const monto = num(c.monto) * f;
    if (fIng && isoValida(fIng) && monto && ubicar) {
      const p = ubicar(fIng);
      if (p.idx >= 0) {
        out.ingresos.total[p.idx] += monto;
        const a = out.ingresos.porAcreedor[c.acreedor || '—'] || (out.ingresos.porAcreedor[c.acreedor || '—'] = Z());
        a[p.idx] += monto;
      }
    }
  });
  return out;
}

// ═══════════════════════════════════════════════════════════════════
// ANÁLISIS DE CARTERA (USD)
// ═══════════════════════════════════════════════════════════════════
export function analisisCartera(creditos, hoy = hoyISO()) {
  const estados = (creditos || []).filter(c => c && !esAnulado(c)).map(c => ({ ...estadoCredito(c, hoy), f: factorUSD(c) }));
  const agrupar = (clave) => {
    const g = {};
    estados.forEach(e => {
      if (e.f === null) return;
      const k = clave(e.c) || '—';
      const x = g[k] || (g[k] = { saldoCapital: 0, sinDesglose: 0, pendiente: 0, vencido: 0, n: 0 });
      x.saldoCapital += e.saldoCapital * e.f; x.sinDesglose += e.sinDesglosePend * e.f;
      x.pendiente += e.pendienteTotal * e.f; x.vencido += e.vencidoTotal * e.f; if (e.pendienteTotal > 0) x.n++;
    });
    Object.values(g).forEach(x => { ['saldoCapital', 'sinDesglose', 'pendiente', 'vencido'].forEach(k => { x[k] = r2(x[k]); }); });
    return g;
  };
  const tipoAcr = (c) => c.tipo_acreedor || (esSocio(c) ? 'Socio' : (c.tipo_inst === 'Banco' ? 'Banco' : (c.tipo_inst || 'Sin clasificar')));
  // Tasas: exposición y costo (solo créditos con saldo de capital y tasa conocida)
  let capFija = 0, capVar = 0, capSinTasa = 0, sumTasaCap = 0, capConTasa = 0, costoAnual = 0;
  const sinTasa = [], variables = [];
  estados.forEach(e => {
    if (e.f === null) return;
    const cap = (e.saldoCapital + e.sinDesglosePend) * e.f;
    if (cap <= EPS) return;
    if (e.tasa.tasa === null) { capSinTasa += cap; sinTasa.push(e); return; }
    if (e.tasa.variable) { capVar += cap; variables.push(e); } else capFija += cap;
    sumTasaCap += e.tasa.tasa * cap; capConTasa += cap; costoAnual += cap * e.tasa.tasa / 100;
  });
  return {
    estados,
    porEmpresa: agrupar(c => c.empresa), porAcreedor: agrupar(c => c.acreedor), porMoneda: agrupar(c => c.moneda || 'USD'),
    porTipo: agrupar(c => c.tipo_cr || 'Sin tipo'), porTipoAcreedor: agrupar(tipoAcr),
    tasas: { capFija: r2(capFija), capVar: r2(capVar), capSinTasa: r2(capSinTasa), tasaPromedio: capConTasa > 0 ? sumTasaCap / capConTasa : null,
      costoAnualEstimado: r2(costoAnual), sensibilidad100pb: r2(capVar * 0.01), sinTasa, variables },
    sinTC: estados.filter(e => e.f === null),
  };
}

// Servicio de deuda pendiente por mes (clave AAAA-MM), en USD.
export function servicioDeudaPorMes(creditos, hoy = hoyISO(), { arrastrar = true } = {}) {
  const out = {};
  (creditos || []).filter(c => c && !esAnulado(c)).forEach(c => {
    const f = factorUSD(c); if (f === null) return;
    aplicarPagos(c, vencimientosCredito(c), hoy).vencimientos.forEach(v => {
      if (!(v.pendienteTotal > 0)) return;
      const k = (arrastrar && v.fecha < hoy) ? hoy.slice(0, 7) : v.fecha.slice(0, 7);
      const x = out[k] || (out[k] = { capital: 0, interes: 0, cargos: 0, sinDesglose: 0, total: 0, vencido: 0 });
      x.capital += v.pendiente.capital * f; x.interes += v.pendiente.interes * f; x.cargos += v.pendiente.cargos * f;
      x.sinDesglose += v.pendiente.sinDesglose * f; x.total += v.pendienteTotal * f; if (v.vencida) x.vencido += v.pendienteTotal * f;
    });
  });
  Object.values(out).forEach(x => Object.keys(x).forEach(k => { x[k] = r2(x[k]); }));
  return out;
}

// Saldo de capital (USD) al cierre de una fecha, suponiendo que lo que vence
// hasta esa fecha se paga: capital de vencimientos pendientes con fecha > corte
// (+ lo "sin desglose" en otra columna, porque no se sabe cuánto es capital).
export function saldoCapitalAl(creditos, corteISO, hoy = hoyISO()) {
  let capital = 0, sinDesglose = 0;
  (creditos || []).filter(c => c && !esAnulado(c)).forEach(c => {
    const f = factorUSD(c); if (f === null) return;
    aplicarPagos(c, vencimientosCredito(c), hoy).vencimientos.forEach(v => {
      if (v.fecha > corteISO) { capital += v.pendiente.capital * f; sinDesglose += v.pendiente.sinDesglose * f; }
    });
  });
  return { capital: r2(capital), sinDesglose: r2(sinDesglose) };
}

// ═══════════════════════════════════════════════════════════════════
// SIMULACIÓN DE PREPAGO (no modifica nada)
// ═══════════════════════════════════════════════════════════════════
// sim = { fecha, total:bool, capital (si parcial), modo:"plazo"|"cuota",
//         tasaHipotesis?, baseHipotesis?, comisionTipo?:"pct"|"meses_interes"|"monto"|"ninguna", comisionValor? }
// Cálculo:
//   capital a prepagar  = saldo de capital (total) o el monto indicado (parcial)
//   interés devengado   = capital prepagado × tasa × fracción(base, último vencimiento o desembolso → fecha)
//                         (total: sobre todo el saldo; parcial: sobre lo prepagado; lo demás sigue devengando)
//   comisión            = % sobre capital prepagado | N meses de interés sobre capital prepagado | monto fijo
//   desembolso          = capital + interés devengado + comisión + vencidos impagos a regularizar
//   intereses evitados  = intereses futuros originales − (devengado + intereses futuros del escenario)
//   ahorro neto         = intereses evitados − comisión (sin descontar costo de oportunidad de la caja)
export function simularPrepago(c, sim, hoy = hoyISO()) {
  const faltantes = [], hipotesis = [], avisos = [];
  const fecha = sim.fecha;
  if (!isoValida(fecha)) return { error: 'Fecha de prepago inválida.' };
  const vencs = aplicarPagos(c, vencimientosCredito(c), hoy).vencimientos.filter(v => v.origen === 'cuota');
  const vencidosImpagos = r2(vencs.filter(v => v.fecha <= fecha && v.pendienteTotal > 0).reduce((s, v) => s + v.pendienteTotal, 0));
  const futuros = vencs.filter(v => v.fecha > fecha);
  const saldoCap = r2(futuros.reduce((s, v) => s + v.pendiente.capital, 0));
  const sinDesgFut = r2(futuros.reduce((s, v) => s + v.pendiente.sinDesglose, 0));
  if (sinDesgFut > EPS) faltantes.push(`desglose capital/interés de ${futuros.filter(v => v.pendiente.sinDesglose > 0).length} cuota(s) (${r2(sinDesgFut)} ${c.moneda || 'USD'} sin desglose)`);
  if (saldoCap <= EPS) return { error: sinDesgFut > EPS ? 'Las cuotas futuras no tienen desglose de capital: no se puede determinar el saldo a prepagar. Cárgalo en la cuota (capital / interés / cargos).' : 'No hay saldo de capital posterior a esa fecha.', faltantes };
  const capital = sim.total ? saldoCap : Math.min(num(sim.capital), saldoCap);
  if (!(capital > 0)) return { error: 'Indica el capital a prepagar.' };
  if (!sim.total && capital >= saldoCap - EPS) { /* parcial que cubre todo = total */ }
  const esTotal = sim.total || capital >= saldoCap - EPS;
  // Tasa y base
  const tc = tasaCredito(c);
  let tasa = tc.tasa;
  if (tasa === null) {
    if (esNum(sim.tasaHipotesis)) { tasa = num(sim.tasaHipotesis); hipotesis.push(`Tasa ${tasa}% ingresada como hipótesis (el crédito no la tiene registrada).`); }
    else faltantes.push('tasa de interés');
  } else if (tc.origen !== 'contrato') hipotesis.push(`Tasa ${tasa}% tomada de: ${tc.origen}.`);
  if (tc.variable) hipotesis.push(`Tasa variable: se usa ${tc.origen}.`);
  let base = esContrato(c) ? c.base : c.base;
  if (esSocio(c)) base = 'efectiva365';
  if (!BASES[base] && base !== 'efectiva365') {
    if (BASES[sim.baseHipotesis]) { base = sim.baseHipotesis; hipotesis.push(`Base ${BASES[base]} elegida como hipótesis (no está registrada).`); }
    else faltantes.push('base de cálculo de intereses');
  }
  // Último vencimiento ≤ fecha (o desembolso)
  const previos = vencs.filter(v => v.fecha <= fecha).map(v => v.fecha);
  const desde = previos.length ? previos[previos.length - 1] : (c.fecha_desembolso || c.f_inicio || '');
  if (!isoValida(desde)) faltantes.push('fecha de desembolso o del último vencimiento (inicio del devengo)');
  let devengado = null;
  if (tasa !== null && isoValida(desde) && (BASES[base] || base === 'efectiva365')) {
    const baseDev = esTotal ? saldoCap : capital;
    devengado = base === 'efectiva365'
      ? baseDev * (Math.pow(1 + tasa / 100, diasEntre(desde, fecha) / 365) - 1)
      : baseDev * tasa / 100 * fraccionAnio(base, desde, fecha);
    devengado = r2(devengado);
  }
  // Comisión / penalidad
  let comTipo = sim.comisionTipo || c.prepago_comision_tipo || '';
  let comVal = esNum(sim.comisionValor) ? num(sim.comisionValor) : (esNum(c.prepago_comision_valor) ? num(c.prepago_comision_valor) : null);
  const comDelContrato = !sim.comisionTipo && !!c.prepago_comision_tipo;
  let comision = null;
  if (comTipo === 'ninguna') comision = 0;
  else if (comTipo === 'pct' && comVal !== null) comision = r2(capital * comVal / 100);
  else if (comTipo === 'monto' && comVal !== null) comision = r2(comVal);
  else if (comTipo === 'meses_interes' && comVal !== null && tasa !== null) comision = r2(capital * tasa / 100 * comVal / 12);
  if (comision === null) faltantes.push('condición de comisión/penalidad de prepago');
  else if (!comDelContrato && comTipo !== '') hipotesis.push('Comisión de prepago ingresada en la simulación (no viene del registro del crédito).');
  // Escenario
  const origFut = futuros.map(v => ({ fecha: v.fecha, capital: v.pendiente.capital, interes: v.pendiente.interes, cargos: v.pendiente.cargos, sinDesglose: v.pendiente.sinDesglose, total: v.pendienteTotal }));
  const I0 = r2(origFut.reduce((s, v) => s + v.interes, 0));
  const C0f = r2(origFut.reduce((s, v) => s + v.cargos, 0));
  let nuevoFut = [], exacto = false;
  if (esContrato(c) && c.modalidad !== 'manual') {
    const cc = { ...c };
    const { filas } = calendarioContrato(cc, { fecha, capital, modo: sim.modo || 'plazo' });
    nuevoFut = filas.filter(f => f.fecha > fecha).map(f => ({ fecha: f.fecha, capital: f.capital, interes: f.interes, cargos: f.cargos, sinDesglose: 0, total: r2(f.capital + f.interes + f.cargos) }));
    exacto = true;
  } else {
    // Sin regla de cálculo registrada: capital descontado según el modo e
    // intereses futuros en proporción al saldo que queda. ESTIMACIÓN.
    const ratio = esTotal ? 0 : (saldoCap - capital) / saldoCap;
    const caps = origFut.map(v => v.capital);
    if (!esTotal) {
      if (sim.modo === 'cuota') caps.forEach((x, i) => { caps[i] = x * ratio; });
      else { let rest = capital; for (let i = caps.length - 1; i >= 0 && rest > EPS; i--) { const q = Math.min(caps[i], rest); caps[i] -= q; rest -= q; } }
    }
    nuevoFut = esTotal ? [] : origFut.map((v, i) => {
      const cap = r2(caps[i]), int = r2(v.interes * ratio), car = v.cargos;
      return { fecha: v.fecha, capital: cap, interes: int, cargos: car, sinDesglose: r2(v.sinDesglose * ratio), total: r2(cap + int + car + v.sinDesglose * ratio) };
    }).filter(v => v.total > EPS);
    avisos.push('Intereses futuros del escenario estimados en proporción al saldo (el crédito no tiene condiciones que permitan recalcular su calendario).');
    if (esSocio(c)) avisos.push('Crédito de socio: su interés es efectivo compuesto sobre cuotas definidas a mano; el recálculo exacto requiere redefinir las cuotas.');
  }
  if (esTotal && !(esContrato(c) && c.modalidad !== 'manual')) nuevoFut = [];
  const I1 = r2(nuevoFut.reduce((s, v) => s + v.interes, 0));
  const C1f = r2(nuevoFut.reduce((s, v) => s + v.cargos, 0));
  const interesesEvitados = devengado === null ? null : r2(I0 - I1 - devengado);
  const cargosEvitados = r2(C0f - C1f);
  const ahorroNeto = (interesesEvitados === null || comision === null) ? null : r2(interesesEvitados - comision);
  const desembolso = (devengado === null || comision === null) ? null : r2(capital + devengado + comision + vencidosImpagos);
  return {
    fecha, esTotal, capital: r2(capital), saldoCapital: saldoCap, devengado, desde, comision, vencidosImpagos,
    desembolso, original: origFut, escenario: nuevoFut, interesesFuturosOriginal: I0, interesesFuturosEscenario: I1,
    cargosEvitados, interesesEvitados, ahorroNeto, exacto, estimacion: !exacto || faltantes.length > 0 || hipotesis.length > 0,
    faltantes, hipotesis, avisos, modo: sim.modo || 'plazo', tasa, base,
    aplicable: faltantes.length === 0 && (esTotal || (esContrato(c))),
  };
}

// Aplica un prepago simulado: registra el pago (capital + devengado + comisión
// como cargo) y, en contratos, el evento de capital que recalcula el
// calendario. En un prepago TOTAL de un registro legacy/socio, las cuotas
// futuras quedan pagadas con ese mismo pago (no se duplican ni se pierden).
export function aplicarPrepago(c, sim, usuario = '', nota = '') {
  if (!sim || sim.error) throw new Error('Simulación inválida.');
  if (!sim.aplicable) throw new Error('La simulación tiene datos faltantes o no se puede aplicar a este tipo de crédito.');
  const pagoId = `pg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  const ts = new Date().toISOString();
  let nuevo = { ...c };
  const notaTxt = nota || `Prepago ${sim.esTotal ? 'total' : 'parcial'} (${sim.modo === 'cuota' ? 'reduce cuota' : 'reduce plazo'})`;
  if (esContrato(c) && c.modalidad !== 'manual') {
    nuevo.prepagos = [...(c.prepagos || []), { id: `pp-${pagoId}`, pagoId, fecha: sim.fecha, capital: sim.capital, modo: sim.modo, usuario, ts }];
    nuevo.pagos = [...(c.pagos || []), { id: pagoId, vencKey: null, fecha: sim.fecha, capital: sim.capital, interes: sim.devengado, cargos: sim.comision,
      sinDesglose: 0, tipo: 'prepago', nota: notaTxt, usuario, ts }];
  } else if (esContrato(c)) { // calendario manual
    nuevo.prepagos = [...(c.prepagos || []), { id: `pp-${pagoId}`, pagoId, fecha: sim.fecha, capital: sim.capital, modo: sim.modo, usuario, ts }];
    nuevo.pagos = [...(c.pagos || []), { id: pagoId, vencKey: null, fecha: sim.fecha, capital: sim.capital, interes: sim.devengado, cargos: sim.comision,
      sinDesglose: 0, tipo: 'prepago', nota: notaTxt, usuario, ts }];
  } else {
    // legacy / socio: solo prepago total. Un registro "prepago" lleva la caja
    // real (capital + devengado + comisión); cada cuota futura recibe una
    // "extincion" vinculada (sin caja) para que deje de proyectarse. El
    // interés futuro no se paga: se reemplaza por el devengado.
    if (!sim.esTotal) throw new Error('En este tipo de registro solo se puede aplicar un prepago total.');
    const vencs = aplicarPagos(c, vencimientosCredito(c)).vencimientos.filter(v => v.origen === 'cuota' && v.fecha > sim.fecha && v.pendienteTotal > 0);
    const pagos = [...(c.pagos || []), { id: pagoId, vencKey: null, fecha: sim.fecha, capital: sim.capital, interes: sim.devengado,
      cargos: sim.comision, sinDesglose: 0, tipo: 'prepago', nota: notaTxt, usuario, ts }];
    vencs.forEach((v, i) => pagos.push({ id: `${pagoId}-x${i}`, vencKey: v.key, fecha: sim.fecha, capital: v.pendiente.capital,
      interes: v.pendiente.interes, cargos: v.pendiente.cargos, sinDesglose: v.pendiente.sinDesglose, tipo: 'extincion', grupo: pagoId,
      nota: `Cuota ${v.fecha} extinguida por el prepago (sin movimiento de caja propio)`, usuario, ts }));
    nuevo.pagos = pagos;
  }
  nuevo.historial = [...(c.historial || []), { ts, usuario, accion: 'prepago',
    detalle: `${sim.fecha} · capital ${sim.capital} + devengado ${sim.devengado} + comisión ${sim.comision} = ${r2(sim.capital + sim.devengado + sim.comision)} ${c.moneda || 'USD'}` }];
  return nuevo;
}
