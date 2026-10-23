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
const r4 = (x) => Math.round((Number(x) || 0) * 10000) / 10000;
// Precisión de los montos de un crédito en su moneda original: la UF se
// expresa con 4 decimales (0,0001 UF ≈ CLP 4); el resto, al centavo. Para
// montos que ya vienen al centavo, redondear a 4 decimales no los cambia.
export const decimalesMoneda = (moneda) => (moneda === 'UF' ? 4 : 2);
const rMon = (moneda) => (moneda === 'UF' ? r4 : r2);
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
export const TIPOS_ACREEDOR = ['Banco', 'Socio', 'Cliente', 'Empresa relacionada', 'Persona natural', 'Otro'];
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
export const esEliminado = (c) => !!(c && c.eliminado);
export const esAnulado = (c) => !!(c && (c.anulado || c.eliminado));

// Eliminación administrativa: se conserva el expediente, pero deja de operar.
export function eliminarCredito(c, { administrador = false, usuario = '', motivo = '' } = {}) {
  if (!administrador) throw new Error('Solo un administrador puede eliminar créditos.');
  if (!c || esEliminado(c)) throw new Error('El crédito no existe o ya fue eliminado.');
  const razon = String(motivo).trim();
  if (!razon) throw new Error('Indica el motivo de eliminación.');
  // Un pago confirmado desde una nómina se anula o se anota desde esa nómina; con el
  // crédito eliminado esa operación quedaría bloqueada (el guardado rechaza cambios a un
  // eliminado) y la nómina no podría anularse. Primero se resuelve en la nómina.
  const deNomina = pagosVigentes(c).filter(p => p.origen && String(p.origen.clave || '').startsWith('nomina:'));
  if (deNomina.length) throw new Error(`No se puede eliminar: tiene ${deNomina.length} pago(s) confirmado(s) desde una nómina. Anúlalos primero desde la nómina (con motivo).`);
  const ts = new Date().toISOString();
  return { ...c, eliminado: true, anulado: true, eliminadoPor: usuario, eliminadoTs: ts,
    motivoEliminacion: razon,
    historial: [...(c.historial || []), { ts, usuario, accion: 'eliminación administrativa', detalle: razon }] };
}

// Defensa del guardado: ocultar un registro no permite perderlo en el siguiente
// guardado del subset visible, ni a un editor ordinario eliminar o recuperarlo.
export function prepararGuardadoCreditos(anterior, nueva, { administrador = false, empresasPermitidas = [] } = {}) {
  const permitidas = new Set(empresasPermitidas);
  const previos = new Map((anterior || []).map(c => [uidCredito(c), c]));
  const entrantes = (Array.isArray(nueva) ? nueva : []).filter(c => permitidas.has(c?.empresa)).map(sinValorizacion);
  for (const c of entrantes) {
    const previo = previos.get(uidCredito(c));
    if ((!administrador && esEliminado(c) !== esEliminado(previo)) ||
        (esEliminado(previo) && JSON.stringify(sinValorizacion(previo)) !== JSON.stringify(c)))
      return { ok: false, motivo: 'sin_permiso' };
  }
  const ids = new Set(entrantes.map(uidCredito));
  return { ok: true, lista: [...(anterior || []).filter(c => !permitidas.has(c?.empresa) || !ids.has(uidCredito(c))), ...entrantes] };
}

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
    // Se conservan todos los campos guardados (modalidad, confirmada, venc_origen,
    // intereses, recibido, anulada, historial…); solo se completa la tasa por defecto.
    return c.renovaciones.map(r => ({
      ...r,
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
// opts.ajustarUltima: la última cuota "Capital+Interés" toma el remanente, así la
// suma amortizada es exactamente el capital (solo renovaciones nuevas; las antiguas
// conservan su redondeo histórico).
export function calcMontoRealCuota(cuotas, capital, tasaAnual, mesIngresoAnio, opts = {}) {
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
      const esUltima = opts.ajustarUltima && cuotasArr.slice(i + 1).every(x => (x.tipo || 'Solo Interés') !== 'Capital+Interés');
      amort = esUltima ? Math.round(saldo * 100) / 100 : Math.round(amortPorCuota);
      montoReal = amort + interes;
      saldo = Math.max(0, saldo - amort);
    } else montoReal = interes;
    return { ...cq, montoReal, interes, amort };
  });
}
export function calcCuotasRenovacion(ren) {
  return calcMontoRealCuota(ren.cuotas, ren.monto, ren.tasa_anual,
    ren.mes_ingreso && ren.anio_ingreso ? `${ren.mes_ingreso}-${String(ren.anio_ingreso).slice(-2)}` : '',
    { ajustarUltima: !renovacionAntigua(ren) });
}


// ── Renovaciones con modalidad (oct-2026) ───────────────────────────
// Tres formas de renovar, que se tratan distinto en caja y en deuda:
//   extension     el vencimiento original se extiende sin movimiento de caja: el
//                 capital renovado (`monto`) deja de vencer en la fecha original y
//                 pasa al calendario de la renovación. NO hay ingreso.
//   pago_y_nuevo  el crédito anterior se paga en caja (como cualquier cuota) y entra
//                 un desembolso nuevo (`monto`) = ingreso de caja. Nada se traslada.
//   parcial       se paga en caja una parte del vencimiento original y el resto
//                 (`monto`) se extiende sin movimiento de caja. NO hay ingreso.
// Una renovación NUEVA nace "propuesta" (confirmada:false) y no se proyecta: no se
// suponen renovaciones futuras. Solo confirmada entra al flujo y a la deuda.
// Un registro ANTIGUO (sin modalidad ni confirmada) conserva su comportamiento
// histórico —ingreso + cuotas— y se informa para que se le defina modalidad.
export const MODALIDADES_RENOVACION = {
  extension: 'Extensión del vencimiento (sin movimiento de caja)',
  pago_y_nuevo: 'Pago del crédito anterior y nuevo desembolso',
  parcial: 'Renovación parcial (paga parte y extiende el resto)',
};
// Intereses y cargos del vencimiento que se extiende: según el contrato. No se
// supone que se pagan siempre.
export const TRATAMIENTOS_INTERES = {
  pagados: 'Se pagan en caja en el vencimiento original',
  pendientes: 'Quedan pendientes: se pagan con la primera cuota de la renovación (sin capitalizar)',
  capitalizados: 'Se capitalizan: se suman al capital renovado',
};
export const renovacionAntigua = (ren) => !!ren && !ren.anulada && ren.modalidad == null && ren.confirmada == null;
// Cuotas utilizables de una renovación nueva: TODAS con mes y año, en orden
// cronológico estricto, y al menos una "Capital+Interés" que devuelva el capital.
// (Una cuota sin fecha se llevaba su parte del capital y esa parte desaparecía.)
export function renovacionAmortiza(ren) {
  const cs = (ren && ren.cuotas) || [];
  if (!cs.length) return false;
  let prev = '';
  for (const q of cs) {
    const m = MES_ABR_NUM[q.mes], a = parseInt(q.anio);
    if (!m || !a) return false;
    const f = aISO(a, m, 1);
    if (f <= prev) return false;
    prev = f;
  }
  return cs.some(q => (q.tipo || 'Solo Interés') === 'Capital+Interés');
}
const fechaPrimeraCuotaRen = (ren) => { const q = ((ren && ren.cuotas) || [])[0]; const m = q && MES_ABR_NUM[q.mes], a = q && parseInt(q.anio); return m && a ? aISO(a, m, 1) : ''; };
// Anulada (con motivo) = sin efecto, pero el dato queda en el historial.
// (renovacionProyecta = cumple los requisitos; si además tiene efecto lo dice el plan)
export const renovacionProyecta = (ren) => !!ren && !ren.anulada && (renovacionAntigua(ren) || (ren.confirmada === true && !!MODALIDADES_RENOVACION[ren.modalidad]
  && (ren.modalidad === 'pago_y_nuevo' ? !!fechaIngresoRen(ren) : !!TRATAMIENTOS_INTERES[ren.intereses]) && renovacionAmortiza(ren) && num(ren.monto) > 0));
export const renovacionTraslada = (ren) => renovacionProyecta(ren) && !renovacionAntigua(ren) && (ren.modalidad === 'extension' || ren.modalidad === 'parcial');
const fechaIngresoRen = (ren) => {
  const m = MES_ABR_NUM[ren.mes_ingreso], a = parseInt(ren.anio_ingreso);
  return m && a ? aISO(a, m, 1) : '';
};

// ═══ PLAN DE RENOVACIONES — cálculo ÚNICO ═════════════════════════════
// Recorre las renovaciones EN ORDEN. Cada una que extiende capital toma de un
// vencimiento ya existente —del crédito o de una renovación anterior (renovación
// de una renovación)— lo que QUEDA disponible después de las anteriores, así dos
// renovaciones nunca toman el mismo capital. De aquí salen: lo que deja de vencer
// en el vencimiento de origen (aplicarPagos) y las cuotas de la renovación.
// Una renovación que no se puede aplicar NO se proyecta y dice por qué (`motivo`):
//   sin_origen · origen_con_pagos · origen_sin_desglose · cuotas_antes_del_origen
const _planes = new WeakMap();
export function planRenovaciones(c) {
  const vacio = { cuotas: [], porRen: [], traslados: {}, candidatos: [] };
  if (!c || esAnulado(c)) return vacio;
  if (_planes.has(c)) return _planes.get(c);
  const uid = uidCredito(c), r2m = rMon(c.moneda);
  const base = vencimientosBase(c, false);
  const todos = [...base];
  // Pagos vigentes por vencimiento (el plan mira TODOS, aunque una vista al corte filtre).
  const pagosDe = {};
  (Array.isArray(c._pagosPlan) ? c._pagosPlan : (c.pagos || [])).filter(p => p && !p.anulado && p.vencKey)
    .forEach(p => { (pagosDe[p.vencKey] = pagosDe[p.vencKey] || []).push(p); });
  const legacyPagadoPlan = c.pagado === true && !esContrato(c);
  // Lo ya pagado de un vencimiento se descuenta de lo disponible para renovar, con el
  // mismo orden de imputación que aplicarPagos (sin desglose → cargos → interés → capital).
  // Así, pagar en caja el interés (o la parte no renovada) NO anula la renovación.
  const descontarPagos = (key, d) => {
    const ps = pagosDe[key] || [];
    let sd = 0;
    ps.forEach(p => { ['capital', 'interes', 'cargos'].forEach(k => { d[k] = Math.max(0, d[k] - num(p[k])); }); sd += num(p.sinDesglose); });
    ['sinDesglose', 'cargos', 'interes', 'capital'].forEach(k => { const q = Math.min(d[k], sd); d[k] -= q; sd -= q; });
  };
  const disp = new Map(base.map(v => {
    const d = { capital: v.capital, interes: v.interes, cargos: v.cargos, sinDesglose: v.sinDesglose };
    if (legacyPagadoPlan && v.origen === 'cuota') { d.capital = 0; d.interes = 0; d.cargos = 0; d.sinDesglose = 0; }   // pagado sin registro
    return [v.key, d];
  }));
  base.forEach(v => descontarPagos(v.key, disp.get(v.key)));
  const out = { cuotas: [], porRen: [], traslados: {}, candidatos: [] };
  (c.renovable ? getRenovaciones(c) : []).forEach((ren, ri) => {
    out.candidatos[ri] = todos.map(v => ({ key: v.key, fecha: v.fecha, total: v.total, origen: v.origen, renovacion: v.renovacion,
      capitalDisponible: r2m((disp.get(v.key) || {}).capital || 0) }));
    out.porRen[ri] = null;
    if (!renovacionProyecta(ren)) return;
    let t = null, origenRen = null;
    if (renovacionTraslada(ren)) {
      const porDefecto = todos.length ? todos.reduce((a, v) => (v.fecha >= a.fecha ? v : a)) : null;
      // Por clave; si la clave no existe (p. ej. se generó antes de fijar el uid), por fecha.
      const porFecha = isoValida(ren.venc_origen) ? [...todos].reverse().find(v => v.fecha === ren.venc_origen) : null;
      const origen = (ren.venc_origen_key && todos.find(v => v.key === ren.venc_origen_key)) || porFecha
        || (!ren.venc_origen_key && !isoValida(ren.venc_origen) ? porDefecto : null);
      const no = (motivo, extra = {}) => { out.porRen[ri] = { aplicada: false, motivo, fecha: (origen && origen.fecha) || ren.venc_origen || '', ...extra }; };
      if (!origen) return no('sin_origen');
      const d = disp.get(origen.key);
      // Sin desglose capital/interés no se sabe cuánto es capital: no se supone.
      if (d.sinDesglose > EPS) return no('origen_sin_desglose', { key: origen.key });
      if (fechaPrimeraCuotaRen(ren).slice(0, 7) <= origen.fecha.slice(0, 7)) return no('cuotas_antes_del_origen', { key: origen.key });
      const capital = r2m(Math.min(Math.max(0, d.capital), num(ren.monto)));
      // Nada de capital disponible (ya pagado o ya renovado por otra): no se aplica
      // (no se generan cuotas en cero ni se crea deuda).
      if (capital <= EPS) return no(d.interes + d.cargos <= EPS && (pagosDe[origen.key] || []).length ? 'origen_con_pagos' : 'sin_capital_disponible', { key: origen.key });
      const exceso = r2m(num(ren.monto) - capital);
      const extra = { interes: 0, cargos: 0, sinDesglose: 0 };
      if (ren.intereses === 'pendientes' || ren.intereses === 'capitalizados') { extra.interes = r2m(Math.max(0, d.interes)); extra.cargos = r2m(Math.max(0, d.cargos)); }
      d.capital = r2m(d.capital - capital); d.interes = r2m(d.interes - extra.interes); d.cargos = r2m(d.cargos - extra.cargos);
      origenRen = origen;
      t = { aplicada: true, fecha: origen.fecha, key: origen.key, tomado: { capital, sinDesglose: 0 }, renovado: capital, exceso,
        extra, extraTotal: r2m(extra.interes + extra.cargos), tratamiento: ren.intereses, ri };
      (out.traslados[origen.key] = out.traslados[origen.key] || []).push(t);
    }
    // Capital de la renovación: lo efectivamente extendido (+ lo capitalizado). Un
    // monto mayor a lo que vencía NO crea deuda: se informa como exceso.
    const capitaliza = t && t.tratamiento === 'capitalizados' ? t.extraTotal : 0;
    const capitalRen = t ? r2m(t.renovado + capitaliza) : num(ren.monto);
    if (t) t.capitalRenovacion = capitalRen;
    const pendExtra = t && t.tratamiento === 'pendientes' ? t.extra : null;
    // En extensión y parcial el interés corre desde el vencimiento que se renueva (no
    // desde un "mes de ingreso", que no existe: no hay desembolso).
    const baseInteres = t ? { mes_ingreso: Object.keys(MES_ABR_NUM).find(k => MES_ABR_NUM[k] === parseInt(t.fecha.slice(5, 7))), anio_ingreso: t.fecha.slice(0, 4) } : {};
    // Interés capitalizado que viene del vencimiento de origen (renovación encadenada):
    // viaja con el capital renovado y conserva su propia fecha de capitalización.
    const heredadas = t && origenRen && origenRen.capitalizaciones && origenRen.capital > 0
      ? origenRen.capitalizaciones.map(k => ({ monto: r2m(k.monto * t.renovado / origenRen.capital), desde: k.desde })).filter(k => k.monto > 0) : [];
    calcCuotasRenovacion({ ...ren, ...baseInteres, monto: capitalRen }).forEach((cq, ci) => {
      const mes = MES_ABR_NUM[cq.mes], anio = parseInt(cq.anio);
      if (!mes || !anio) return;
      const fecha = aISO(anio, mes, Math.min(28, diasMes(anio, mes)));
      const amort = num(cq.amort), interes = num(cq.interes);
      const total = num(cq.montoReal) || num(cq.monto);
      const comp = { capital: amort, interes, cargos: 0, sinDesglose: Math.max(0, total - amort - interes) };
      if (pendExtra && ci === 0) { comp.interes += pendExtra.interes; comp.cargos += pendExtra.cargos; }
      // Parte de la amortización que viene de intereses capitalizados: hasta la fecha
      // de origen sigue siendo interés (el banco aún no la capitalizó).
      const capitalizadoEnCuota = capitaliza > 0 && capitalRen > 0 ? r2m(amort * capitaliza / capitalRen) : 0;
      const capitalizaciones = [
        ...heredadas.map(k => ({ monto: r2m(amort * k.monto / capitalRen), desde: k.desde })),
        ...(capitalizadoEnCuota > 0 ? [{ monto: capitalizadoEnCuota, desde: t.fecha, propia: true }] : []),
      ].filter(k => k.monto > 0);
      const v = V(c, `${uid}@R${ri}@${ci}`, fecha, comp, { origen: 'renovacion', renovacion: ri,
        ...(pendExtra && ci === 0 ? { interesesTrasladados: t.extraTotal } : {}),
        ...(capitalizadoEnCuota > 0 ? { capitalizadoEnCuota, capitalizaDesde: t.fecha } : {}),
        ...(capitalizaciones.length ? { capitalizaciones } : {}) });
      out.cuotas.push(v); todos.push(v);
      const dv = { capital: v.capital, interes: v.interes, cargos: v.cargos, sinDesglose: v.sinDesglose };
      descontarPagos(v.key, dv);
      disp.set(v.key, dv);
    });
    out.porRen[ri] = t || { aplicada: true };
  });
  _planes.set(c, out);
  return out;
}
// Vencimiento que se renueva por defecto: el último existente (del crédito o de una
// renovación anterior). Devuelve { key, fecha } o null.
export function vencOrigenRenovacion(c, ri) {
  const cand = (planRenovaciones(c).candidatos[ri] || []);
  const ren = getRenovaciones(c)[ri] || {};
  if (ren.venc_origen_key) { const x = cand.find(v => v.key === ren.venc_origen_key); if (x) return { key: x.key, fecha: x.fecha }; }
  if (isoValida(ren.venc_origen)) { const x = [...cand].reverse().find(v => v.fecha === ren.venc_origen); return x ? { key: x.key, fecha: x.fecha } : { key: null, fecha: ren.venc_origen }; }
  if (!cand.length) return null;
  const x = cand.reduce((a, v) => (v.fecha >= a.fecha ? v : a));
  return { key: x.key, fecha: x.fecha };
}
export const trasladoRenovacion = (c, ri) => planRenovaciones(c).porRen[ri] || null;
const MOTIVO_NO_APLICA = {
  sin_origen: 'no existe el vencimiento que se renueva',
  origen_con_pagos: 'el vencimiento que se renueva ya está pagado',
  sin_capital_disponible: 'el vencimiento que se renueva no tiene capital disponible (ya pagado o ya renovado por otra renovación)',
  origen_sin_desglose: 'el vencimiento que se renueva no tiene desglose capital/interés (cárgalo con su respaldo)',
  cuotas_antes_del_origen: 'las cuotas de la renovación deben ser posteriores al vencimiento que se renueva',
};

// Ingresos de caja por renovación: solo pago_y_nuevo confirmada (o el registro
// antiguo, como siempre), y nunca si los fondos ya se marcaron recibidos.
export function ingresosRenovacion(c) {
  if (!c || esAnulado(c) || !c.renovable) return [];
  const out = [];
  getRenovaciones(c).forEach((ren, ri) => {
    if (!renovacionProyecta(ren)) return;
    if (!renovacionAntigua(ren) && ren.modalidad !== 'pago_y_nuevo') return;
    if (ren.recibido && ren.recibido.fecha) return;
    const fecha = fechaIngresoRen(ren), monto = num(ren.monto);
    if (!fecha || !(monto > 0)) return;
    out.push({ ri, fecha, monto, antigua: renovacionAntigua(ren), acreedor: c.acreedor || '—' });
  });
  return out;
}
// Ingreso de renovación tal como entra al FLUJO (US$), una sola fuente para la línea
// "Ingreso Renovación", su desglose y Saldo por Mes.
//  · Renovación ANTIGUA (sin modalidad): se conserva EXACTAMENTE el cálculo anterior
//    (crédito renovable, monto del registro en el mes de ingreso, sin convertir moneda
//    y sin mirar si el crédito está anulado) hasta que se clasifique. Ese cálculo tiene
//    defectos conocidos (moneda ≠ US$, crédito anulado) que el informe de impacto
//    (scripts/impacto/renovaciones.mjs) lista; se corrigen al clasificarla.
//  · Renovación con modalidad: ingresosRenovacion × tipo de cambio del flujo.
// Mes de ingreso de una antigua leído EXACTAMENTE como main (etiqueta "Aug-26"):
// mes en español o inglés abreviado; año = String(año).slice(2), de dos dígitos.
const MES_ES_A_EN = { Ene: 'Jan', Feb: 'Feb', Mar: 'Mar', Abr: 'Apr', May: 'May', Jun: 'Jun', Jul: 'Jul', Ago: 'Aug', Sep: 'Sep', Oct: 'Oct', Nov: 'Nov', Dic: 'Dec' };
const MESES_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function fechaIngresoAntigua(ren) {
  const m = MESES_EN.indexOf(MES_ES_A_EN[ren.mes_ingreso] || ren.mes_ingreso) + 1;
  const yy = String(ren.anio_ingreso).slice(2);
  return m && /^\d{2}$/.test(yy) ? aISO(2000 + Number(yy), m, 1) : '';
}
export function ingresosRenovacionFlujo(c) {
  if (!c || esEliminado(c)) return [];
  const out = [];
  if (c.renovable) getRenovaciones(c).forEach((ren, ri) => {
    if (!renovacionAntigua(ren) || !ren.monto || !ren.mes_ingreso || !ren.anio_ingreso) return;
    const fecha = fechaIngresoAntigua(ren); if (!fecha) return;
    out.push({ ri, fecha, monto: num(ren.monto), usd: num(ren.monto), antigua: true, acreedor: c.acreedor || '—' });
  });
  const f = factorUSD(c);
  if (f !== null) ingresosRenovacion(c).filter(x => !x.antigua).forEach(x => out.push({ ...x, usd: x.monto * f }));
  return out;
}
// Lo que hay que mirar en las renovaciones de un crédito (no cambia nada).
export function avisosRenovacion(c, hoy = hoyISO()) {
  const av = { antiguas: [], propuestas: [], incompletas: [], excesos: [], ingresosVencidos: [], anuladoConIngreso: [] };
  // Crédito anulado: sus renovaciones antiguas siguen proyectando ingreso (como en main).
  // No se cambia solo: se avisa para decidirlo.
  if (c && esAnulado(c)) { av.anuladoConIngreso = ingresosRenovacionFlujo(c).filter(x => x.antigua)
    .map(x => ({ ri: x.ri, acreedor: c.acreedor, empresa: c.empresa, fecha: x.fecha, monto: x.monto, usd: x.usd })); return av; }
  if (!c || !c.renovable) return av;
  // Ingreso de un "pago y nuevo" con mes ya pasado y sin registrar como recibido: queda
  // en su mes original (antes del saldo inicial). No se da por recibido ni se arrastra solo.
  // Un registro antiguo se avisa solo si su ingreso es posterior al inicio del control en la app.
  ingresosRenovacionFlujo(c).forEach(x => { if (x.fecha.slice(0, 7) < String(hoy).slice(0, 7) && (!x.antigua || x.fecha >= controlDesde(c)))
    av.ingresosVencidos.push({ ri: x.ri, acreedor: c.acreedor, empresa: c.empresa, fecha: x.fecha, monto: x.monto, usd: x.usd, antigua: !!x.antigua }); });
  const plan = planRenovaciones(c);
  getRenovaciones(c).forEach((ren, ri) => {
    if (ren.anulada) return;
    const r = { ri, acreedor: c.acreedor, empresa: c.empresa, monto: num(ren.monto) };
    if (renovacionAntigua(ren)) av.antiguas.push(r);
    else if (ren.confirmada !== true) av.propuestas.push(r);
    else if (!MODALIDADES_RENOVACION[ren.modalidad]) av.incompletas.push({ ...r, falta: 'modalidad' });
    else if (ren.modalidad !== 'pago_y_nuevo' && !TRATAMIENTOS_INTERES[ren.intereses]) av.incompletas.push({ ...r, falta: 'tratamiento de intereses y cargos' });
    else if (ren.modalidad === 'pago_y_nuevo' && !fechaIngresoRen(ren)) av.incompletas.push({ ...r, falta: 'mes y año de ingreso del nuevo desembolso' });
    else if (!(num(ren.monto) > 0)) av.incompletas.push({ ...r, falta: 'monto' });
    else if (!renovacionAmortiza(ren)) av.incompletas.push({ ...r, falta: 'cuotas con mes y año, en orden, y al menos una "Capital+Interés" que devuelva el capital' });
    else {
      const t = plan.porRen[ri];
      if (t && t.aplicada === false) av.incompletas.push({ ...r, falta: `${MOTIVO_NO_APLICA[t.motivo] || t.motivo}${t.fecha ? ' (' + t.fecha + ')' : ''}: no se proyecta` });
      else if (t && t.exceso > 0) av.excesos.push({ ...r, exceso: t.exceso });
    }
  });
  return av;
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
  const R = rMon(c && c.moneda);
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
      return { ...r, capital: R(r.capital), interes: R(r.interes), cargos: R(r.cargos), saldoInicial: R(si), saldoFinal: R(saldo) };
    }).filter(r => r.capital > EPS || r.interes > EPS || r.cargos > EPS);
    const capTot = man.reduce((s, r) => s + r.capital, 0) + prepagos.reduce((s, p) => s + num(p.capital), 0);
    if (Math.abs(capTot - C0) > 0.01) avisos.push(`El capital del calendario manual (${R(capTot)}) no suma el capital original (${R(C0)}).`);
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
      capital = esUltima ? R(saldo) : R(capital);
      saldo = R(saldo - capital);
      filas.push({ fecha: f, dias, capital: R(capital), interes: R(intPagado), cargos: R(cargosPer), capitalizado: R(capitalizado),
        saldoInicial: R(si), saldoFinal: R(saldo) });
      prev = f;
    }
  }
  // Cargos únicos (comisión de apertura, notaría, etc.): van en el vencimiento
  // de esa fecha o en uno propio.
  (c.cargos_unicos || []).filter(x => isoValida(x.fecha) && num(x.monto)).forEach(x => {
    const f = filas.find(r => r.fecha === x.fecha);
    if (f) f.cargos = R(f.cargos + num(x.monto));
    else filas.push({ fecha: x.fecha, capital: 0, interes: 0, cargos: R(num(x.monto)), soloCargo: true, concepto: x.concepto || 'Cargo' });
  });
  filas.sort((a, b) => a.fecha.localeCompare(b.fecha));
  return { filas, faltantes: [], avisos };
}

// ═══════════════════════════════════════════════════════════════════
// VENCIMIENTOS (antes de pagos) — cualquier tipo de registro
// ═══════════════════════════════════════════════════════════════════
const V = (c, key, fecha, comp, extra = {}) => {
  const r2 = rMon(c && c.moneda);
  const capital = r2(comp.capital), interes = r2(comp.interes), cargos = r2(comp.cargos), sinDesglose = r2(comp.sinDesglose);
  return {
    key, uid: uidCredito(c), n: c.n, empresa: c.empresa, acreedor: c.acreedor || '', moneda: c.moneda || 'USD',
    tipo_cr: c.tipo_cr || '', fecha, capital, interes, cargos, sinDesglose,
    total: r2(capital + interes + cargos + sinDesglose), origen: 'cuota',
    // Interés de tasa variable = proyección con la referencia supuesta constante.
    tasaVariable: tasaCredito(c).variable === true, ...extra,
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

export function vencimientosCredito(c) { return vencimientosBase(c, true); }
function vencimientosBase(c, conRenovaciones = false) {
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
  if (conRenovaciones && c.renovable) out.push(...planRenovaciones(c).cuotas);
  return out.sort((a, b) => a.fecha.localeCompare(b.fecha));
}

// ═══════════════════════════════════════════════════════════════════
// PAGOS
// ═══════════════════════════════════════════════════════════════════
// pago = { id, vencKey, fecha, capital, interes, cargos, sinDesglose, tipo:"pago"|"prepago"|"refinanciamiento",
//          nota, usuario, ts, anulado?, motivoAnulacion?, anuladoPor?, anuladoTs? }
export const pagosVigentes = (c) => (c && Array.isArray(c.pagos) ? c.pagos : []).filter(p => p && !p.anulado);
export const totalPago = (p) => r4(num(p.capital) + num(p.interes) + num(p.cargos) + num(p.sinDesglose));

const COMP = ['capital', 'interes', 'cargos', 'sinDesglose'];
// Intereses capitalizados en una renovación: al MEDIR un saldo a una fecha anterior al
// vencimiento de origen siguen siendo INTERÉS (el acreedor aún no los capitalizó).
// No cambia el flujo ni el servicio de deuda (cada cuota vence después del origen).
// En renovaciones encadenadas la cuota lleva también lo capitalizado que heredó de su
// origen, cada parte con su propia fecha (`capitalizaciones`).
export const capitalizadoNoVigenteAl = (v, fecha) => {
  if (!v) return 0;
  const ks = v.capitalizaciones || (v.capitalizadoEnCuota > 0 && v.capitalizaDesde ? [{ monto: v.capitalizadoEnCuota, desde: v.capitalizaDesde }] : []);
  const noVig = ks.filter(k => fecha < k.desde).reduce((a, k) => a + k.monto, 0);
  if (!(noVig > 0) || !(v.capital > 0)) return 0;
  // Proporcional al capital que sigue en esta cuota (lo pagado o renovado se lleva su parte).
  const cap = v.pendiente ? v.pendiente.capital : v.capital;
  return r2(Math.min(cap, noVig * cap / v.capital));
};

// Aplica los pagos vigentes a los vencimientos. Un pago "sin desglose" se
// imputa primero a lo sin desglose y luego a cargos → intereses → capital
// (orden de imputación del art. 1595 del Código Civil). Vencimientos con
// fecha < hoy y saldo por pagar quedan como vencidos.
export function aplicarPagos(c, vencs, hoy = hoyISO()) {
  const r2 = rMon(c && c.moneda);
  const pagos = pagosVigentes(c);
  const confirmadas = new Set(conciliacionesVigentes(c).filter(x => x.resultado === 'impaga').map(x => x.vencKey));
  const ctrl = controlDesde(c);
  const porVenc = {};
  pagos.forEach(p => { if (p.vencKey) (porVenc[p.vencKey] = porVenc[p.vencKey] || []).push(p); });
  const legacyPagado = c && c.pagado === true && !esContrato(c);
  const claves = new Set(vencs.map(v => v.key));
  // Renovación confirmada con extensión (total o parcial): el capital renovado deja
  // de vencer en la fecha original SIN movimiento de caja (no es un pago). Se
  // descuenta primero del capital y, si la cuota no está desglosada, de lo sin
  // desglose. Va a la primera cuota propia con esa fecha.
  const traslados = planRenovaciones(c).traslados;
  const res = vencs.map(v => {
    const due = { capital: v.capital, interes: v.interes, cargos: v.cargos, sinDesglose: v.sinDesglose };
    let renovado = 0, renovadoExceso = 0, interesesTrasladados = 0, renovadoCapital = 0;
    (traslados[v.key] || []).forEach(t => {
      ['capital', 'sinDesglose'].forEach(k => { due[k] = Math.max(0, due[k] - t.tomado[k]); });
      ['interes', 'cargos', 'sinDesglose'].forEach(k => { due[k] = Math.max(0, due[k] - t.extra[k]); });
      renovado += t.renovado; renovadoExceso += t.exceso; interesesTrasladados += t.extraTotal; renovadoCapital += t.tomado.capital;
    });
    renovado = r2(renovado);
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
    // Una cuota vencida ANTES de que el crédito se controlara en la app, sin
    // ningún pago registrado, no prueba que siga impaga: queda "por conciliar"
    // (fuera de la deuda confirmada y del flujo) hasta confirmarla o pagarla.
    const porConciliar = vencida && pagadoTotal <= EPS && !confirmadas.has(v.key) && (!ctrl || v.fecha < ctrl);
    const vencidaConfirmada = vencida && !porConciliar;
    const estado = pendienteTotal === 0 ? (renovado > 0 && pagadoTotal <= EPS ? 'renovada' : 'pagada') : (porConciliar ? 'por_conciliar' : (vencida ? 'vencida' : (parcial ? 'parcial' : 'pendiente')));
    return { ...v, pagado: pag, pagadoTotal, pendiente: pend, pendienteTotal, exceso, vencida: vencidaConfirmada, porConciliar,
      ...(renovado > 0 || renovadoExceso > 0 ? { renovado, renovadoExceso: r2(renovadoExceso), interesesTrasladados: r2(interesesTrasladados), renovadoCapital: r2(renovadoCapital) } : {}),
      impagaConfirmada: confirmadas.has(v.key), parcial, estado,
      pagadoSinRegistro: legacyOrigen && pagadoTotal <= EPS, pagos: ps };
  });
  const huerfanos = pagos.filter(p => p.vencKey && !claves.has(p.vencKey) && (p.tipo || 'pago') === 'pago');
  return { vencimientos: res, huerfanos };
}

// Estado completo de un crédito.
export function estadoCredito(c, hoy = hoyISO()) {
  const r2 = rMon(c && c.moneda);
  const vencs = vencimientosCredito(c);
  const { vencimientos, huerfanos } = aplicarPagos(c, vencs, hoy);
  const suma = (arr, f) => r2(arr.reduce((s, v) => s + f(v), 0));
  // Cifras CONFIRMADAS: excluyen lo por conciliar (se informa aparte).
  const conf = vencimientos.filter(v => !v.porConciliar);
  const pc = vencimientos.filter(v => v.porConciliar);
  const capNoVig = suma(conf, v => capitalizadoNoVigenteAl(v, hoy));
  const saldoCapital = r2(suma(conf, v => v.pendiente.capital) - capNoVig);
  const sinDesglosePend = suma(conf, v => v.pendiente.sinDesglose);
  const pendienteTotal = suma(conf, v => v.pendienteTotal);
  const vencidoTotal = suma(conf.filter(v => v.vencida), v => v.pendienteTotal);
  const porConciliarTotal = suma(pc, v => v.pendienteTotal);
  const porConciliarCapital = suma(pc, v => v.pendiente.capital);
  const porConciliarSinDesglose = suma(pc, v => v.pendiente.sinDesglose);
  // "extincion" = capital/interés que se extinguen por un prepago sin ser un
  // movimiento de caja propio (la caja está en el registro "prepago").
  const pagosTot = pagosVigentes(c).filter(p => p.tipo !== 'extincion');
  const ultimo = vencimientos.length ? vencimientos[vencimientos.length - 1].fecha : (c.f_venc || '');
  let estado = 'vigente';
  if (esAnulado(c)) estado = 'anulado';
  else if (vencidoTotal > 0) estado = 'con_vencidos';
  else if (porConciliarTotal > 0) estado = 'por_conciliar';
  else if (vencimientos.length && pendienteTotal === 0) estado = 'cerrado';
  const t = tasaCredito(c);
  const faltantes = esContrato(c) ? datosFaltantesContrato(c) : [];
  return {
    c, uid: uidCredito(c), vencimientos, huerfanos, saldoCapital, sinDesglosePend, pendienteTotal, vencidoTotal,
    porConciliarTotal, porConciliarCapital, porConciliarSinDesglose,
    interesPend: r2(suma(conf, v => v.pendiente.interes) + capNoVig), cargosPend: suma(conf, v => v.pendiente.cargos),
    pagadoCapital: r2(pagosTot.reduce((s, p) => s + num(p.capital), 0)),
    pagadoTotal: r2(pagosTot.reduce((s, p) => s + totalPago(p), 0)),
    vencimientoFinal: ultimo, estado, tasa: t, faltantes,
    proximo: vencimientos.find(v => v.pendienteTotal > 0 && !v.vencida && !v.porConciliar) || null,
  };
}

// ═══════════════════════════════════════════════════════════════════
// DEUDA VIGENTE AL CORTE — fuente ÚNICA de los saldos al corte con renovaciones
// (informe de deuda, KPI y lista de Créditos, Análisis CFO, Saldo por Mes y la
// conciliación con el acreedor). Reglas del CFO (23-10-2026):
//  · Una renovación rige desde su fecha efectiva:
//      extensión / parcial → el vencimiento que extiende (si ese vencimiento es de otra
//        renovación, además tiene que regir la anterior);
//      pago y nuevo → la fecha del desembolso recibido; si no está registrada, el fin del
//        mes de ingreso (se avisa: no se usa un día supuesto dentro del mes);
//      antigua (sin modalidad) → SIEMPRE señalada para revisión. Con mes de ingreso rige
//        desde el fin de ese mes (se avisa); sin mes de ingreso NO rige: sus cuotas quedan
//        aparte, «por revisar», y el capital anterior sigue vigente.
//  · Antes de regir, sus cuotas son PROYECCIÓN (no suman capital ni intereses). En
//    extensión/parcial el capital es el mismo del crédito vigente y sí cuenta; solo sus
//    intereses nuevos son proyección.
//  · Desde que rige, una renovación con desembolso (pago y nuevo o antigua) reemplaza el
//    capital que refinancia HASTA SU MONTO, sin duplicarlo. Lo que no cubre sigue como
//    deuda (y se avisa en pago y nuevo). Nunca se registra un pago ni se mueve caja.
//  · Los intereses pendientes siguen como deuda (salvo pago o capitalización registrados):
//    el interés de una cuota vencida renovada se mantiene, y el de una cuota posterior
//    refinanciada se mantiene hasta la fecha de la renovación; solo deja de deberse el
//    interés FUTURO del capital refinanciado (lo reemplaza el interés de la renovación).
// vencs = salida de aplicarPagos al corte. Devuelve, por clave de vencimiento, la parte
// vigente (`vig`), la proyección (`proy`), lo por revisar (`revisar`), lo reemplazado y
// las notas; y por crédito: avisos, vencimiento vigente y totales de proyección/revisión.
const finDeMes = (iso) => { const p = partesISO(iso); return p ? aISO(p.y, p.m, diasMes(p.y, p.m)) : ''; };
const ceroComp = () => ({ capital: 0, interes: 0, cargos: 0, sinDesglose: 0 });
export const ESTADO_RENOVACION = { vigente: 'vigente', futura: 'aún no rige', revisar: 'por revisar' };
// opts.supuestoPagadoHasta (corte futuro de Saldo por Mes): las cuotas que vencen hasta esa
// fecha se suponen pagadas, así que no hay capital que refinanciar en ellas.
export function deudaVigenteAlCorte(c, vencs, corte, { supuestoPagadoHasta = '' } = {}) {
  const r2m = rMon(c && c.moneda);
  const plan = planRenovaciones(c);
  const rens = c && c.renovable ? getRenovaciones(c) : [];
  const avisos = [];
  const dmy = (iso) => (iso ? `${iso.slice(8, 10)}-${iso.slice(5, 7)}-${iso.slice(0, 4)}` : '');
  // ── Fecha efectiva de cada renovación ──
  const vig = {};
  rens.forEach((ren, ri) => {
    const pr = plan.porRen[ri];
    if (!pr || pr.aplicada === false || !renovacionProyecta(ren)) return;
    const traslada = renovacionTraslada(ren), antigua = renovacionAntigua(ren);
    const recibida = ren.recibido && isoValida(ren.recibido.fecha) ? ren.recibido.fecha : '';
    let fecha = '', revisar = '', finMes = false;
    if (traslada) fecha = pr.fecha;
    else {
      const ing = antigua ? fechaIngresoAntigua(ren) : fechaIngresoRen(ren);
      if (recibida) fecha = recibida; else if (ing) { fecha = finDeMes(ing); finMes = true; }
      if (antigua) revisar = fecha ? 'sin_modalidad' : 'sin_fecha';
    }
    vig[ri] = { ri, fecha, traslada, antigua, pagoYNuevo: ren.modalidad === 'pago_y_nuevo', monto: num(ren.monto), revisar, finMes, origenKey: traslada ? pr.key : null };
  });
  const riDeKey = (key) => { const m = /@R(\d+)@/.exec(key || ''); return m ? Number(m[1]) : null; };
  const estadoRen = (ri, d = 0) => {
    const o = vig[ri]; if (!o) return 'vigente';
    if (o.revisar === 'sin_fecha') return 'revisar';
    if (o.traslada) { const p = riDeKey(o.origenKey); const ep = p === null || d > 50 ? 'vigente' : estadoRen(p, d + 1); if (ep !== 'vigente') return ep; }
    return o.fecha && o.fecha <= corte ? 'vigente' : 'futura';
  };
  // El capital de una cuota de renovación que no rige es NUEVO (no es el del crédito
  // vigente) si trae desembolso, o si extiende una renovación con desembolso que no rige.
  const capitalNuevo = (ri, d = 0) => {
    const o = vig[ri]; if (!o) return false;
    if (!o.traslada) return true;
    const p = riDeKey(o.origenKey);
    return p !== null && d < 50 && estadoRen(p) !== 'vigente' && capitalNuevo(p, d + 1);
  };
  const estadoV = (v) => (v.origen === 'renovacion' && vig[v.renovacion] ? estadoRen(v.renovacion) : 'vigente');
  const noVigenteNuevo = (v) => estadoV(v) !== 'vigente' && capitalNuevo(v.renovacion);
  const pendDe = Object.fromEntries(vencs.map(v => [v.key, supuestoPagadoHasta && v.fecha <= supuestoPagadoHasta ? 0 : v.pendiente.capital + v.pendiente.sinDesglose]));
  const fuenteDe = (v) => (v.origen === 'renovacion' ? v.renovacion : null);
  // ── Qué refinancia cada renovación con desembolso ──
  // Primero lo vencido hasta su fecha efectiva (del más reciente al más antiguo) y después
  // las cuotas posteriores (de la más próxima a la más lejana). Pago y nuevo: de todo lo
  // anterior (crédito y renovaciones previas); antigua: del mismo crédito o renovación.
  Object.entries(vig).forEach(([ri, o]) => {
    if (o.traslada) return;
    const n = Number(ri);
    const propias = vencs.filter(v => v.origen === 'renovacion' && v.renovacion === n);
    const primera = propias.map(v => v.fecha).sort()[0] || '';
    // Monto que refinancia = capital de sus propias cuotas (ya redondeado como se cobra); así
    // el capital anterior reemplazado y el nuevo suman exactamente lo mismo (UF incluida).
    const capPropio = r2m(propias.reduce((a, v) => a + v.capital + v.sinDesglose, 0));
    if (capPropio > EPS) o.monto = capPropio;
    const previo = (v) => (v.origen !== 'renovacion' || v.renovacion < n) && !noVigenteNuevo(v) && pendDe[v.key] > EPS;
    const hasta = (v) => (o.fecha ? v.fecha <= o.fecha : v.fecha < primera);
    const cand = vencs.filter(v => previo(v) && hasta(v));
    const post = vencs.filter(v => previo(v) && !hasta(v));
    const fuente = cand.length ? fuenteDe(cand[cand.length - 1]) : (post.length ? fuenteDe(post[0]) : null);
    const mismo = (v) => o.pagoYNuevo || fuenteDe(v) === fuente;
    o.origenes = [...cand.filter(mismo).reverse(), ...post.filter(mismo)].map(v => v.key);
  });
  // Reemplazo: el monto de la renovación vigente cubre lo que refinancia hasta agotarse.
  const reemplazo = {};   // key → { monto, desde }
  Object.entries(vig).forEach(([ri, o]) => {
    if (o.traslada || !o.origenes || estadoRen(Number(ri)) !== 'vigente') return;
    let x = o.monto;
    o.origenes.forEach(k => {
      const r = reemplazo[k] || { monto: 0, desde: o.fecha };
      const t = Math.min(x, Math.max(0, pendDe[k] - r.monto)); if (!(t > EPS)) return;
      r.monto += t; if (o.fecha < r.desde) r.desde = o.fecha; reemplazo[k] = r; x -= t;
    });
    // Cuotas de solo interés posteriores de un crédito o renovación refinanciado: su interés
    // futuro deja de deberse en la proporción del capital refinanciado de esa fuente.
    const fuentes = {};
    o.origenes.forEach(k => { const v = vencs.find(z => z.key === k); const f = String(fuenteDe(v)); const z = fuentes[f] || (fuentes[f] = { cap: 0, ref: 0 });
      z.cap += pendDe[k]; z.ref += Math.min(pendDe[k], (reemplazo[k] || {}).monto || 0); });
    vencs.forEach(v => {
      const z = fuentes[String(fuenteDe(v))];
      if (!z || !(z.ref > EPS) || reemplazo[v.key] || pendDe[v.key] > EPS || !(v.pendiente.interes > EPS) || v.fecha <= o.fecha || noVigenteNuevo(v)) return;
      if (v.origen === 'renovacion' && v.renovacion >= Number(ri)) return;
      reemplazo[v.key] = { monto: 0, desde: o.fecha, pInteres: Math.min(1, z.ref / z.cap) };
    });
  });
  // Pago y nuevo que no cubre todo: capital ANTERIOR (del crédito o de extensiones, no la
  // deuda nueva de otra renovación con desembolso) que sigue sin refinanciar DESPUÉS de todas
  // las renovaciones vigentes. Un solo aviso por crédito, así no se suma dos veces.
  const pyns = Object.entries(vig).filter(([ri, o]) => o.pagoYNuevo && o.origenes && estadoRen(Number(ri)) === 'vigente');
  if (pyns.length) {
    const nueva = (k) => { const v = vencs.find(z => z.key === k); return v && v.origen === 'renovacion' && vig[v.renovacion] && !vig[v.renovacion].traslada; };
    // Deuda nueva de otra renovación: cuenta (todas sus cuotas) solo si una renovación vigente
    // refinancia alguna parte de ella; si nadie la toca, es deuda nueva, no capital no cubierto.
    const renDe = (k) => { const v = vencs.find(z => z.key === k); return v ? v.renovacion : null; };
    const tocadas = new Set(Object.keys(reemplazo).filter(k => nueva(k) && reemplazo[k].monto > EPS).map(renDe));
    const claves = [...new Set(pyns.flatMap(([, o]) => o.origenes))].filter(k => !nueva(k) || tocadas.has(renDe(k)));
    const resto = r2m(claves.reduce((a, k) => a + Math.max(0, pendDe[k] - ((reemplazo[k] || {}).monto || 0)), 0));
    if (resto > EPS) avisos.push(`El pago y nuevo no cubre todo el capital anterior: quedan ${resto} (${c.moneda || 'USD'}) como deuda vigente. Si se pagó, registra el pago.`);
  }
  // Proyección encadenada: una renovación que no rige y renueva capital nuevo de otra que
  // tampoco rige lo reemplaza en la proyección (no se proyectan ambos).
  const reemplazoProy = {};
  Object.entries(vig).forEach(([ri, o]) => {
    if (o.traslada || estadoRen(Number(ri)) !== 'futura') return;
    let x = o.monto;
    const n = Number(ri);
    vencs.filter(v => v.origen === 'renovacion' && v.renovacion < n && estadoV(v) === 'futura' && capitalNuevo(v.renovacion) && v.fecha <= o.fecha)
      .reverse().concat(vencs.filter(v => v.origen === 'renovacion' && v.renovacion < n && estadoV(v) === 'futura' && capitalNuevo(v.renovacion) && v.fecha > o.fecha))
      .forEach(v => { const t = Math.min(x, Math.max(0, v.pendiente.capital - (reemplazoProy[v.key] || 0))); if (t > EPS) { reemplazoProy[v.key] = (reemplazoProy[v.key] || 0) + t; x -= t; } });
  });
  // Fracción del interés de una cuota devengada a una fecha (período desde el vencimiento
  // anterior o el desembolso). Sin inicio conocido: 0 (se avisa en la nota).
  const base = esContrato(c) && ['30360', 'act360', 'act365'].includes(c.base) ? c.base : 'act365';
  const fechas = [...new Set(vencs.filter(v => v.capital + v.interes + v.sinDesglose > EPS).map(v => v.fecha))].sort();
  const desembolso = fechaDesembolsoCredito(c);
  const fracAl = (fin, d) => {
    const inicio = fechas.filter(x => x < fin).pop() || (isoValida(desembolso) ? desembolso : null);
    if (!inicio || inicio >= fin) return null;
    if (d <= inicio) return 0;
    return Math.min(1, Math.max(0, fraccionAnio(base, inicio, d) / fraccionAnio(base, inicio, fin)));
  };
  const porKey = {};
  vencs.forEach(v => {
    const pend = { ...v.pendiente };
    const aj = { estado: null, vig: pend, proy: ceroComp(), revisar: ceroComp(), reemplazado: ceroComp(), interesHasta: null, notas: [] };
    porKey[v.key] = aj;
    if (!(v.pendienteTotal > 0)) return;
    const rem = reemplazo[v.key];
    if (rem) {
      const base0 = pend.capital + pend.sinDesglose;
      const tc = Math.min(pend.capital, rem.monto), ts = Math.min(pend.sinDesglose, rem.monto - tc);
      pend.capital -= tc; pend.sinDesglose -= ts;
      aj.reemplazado.capital = tc; aj.reemplazado.sinDesglose = ts;
      const p = base0 > EPS ? Math.min(1, (tc + ts) / base0) : (rem.pInteres || 0);
      if (v.fecha > rem.desde && p > EPS) {
        // Cuota posterior refinanciada: el interés devengado hasta la renovación se sigue
        // debiendo; el interés futuro del capital refinanciado deja de deberse.
        const fd = fracAl(v.fecha, rem.desde);
        const I = v.interes, pagI = v.pagado ? v.pagado.interes : 0;
        const dev = I * (fd === null ? 0 : fd);
        const futuro = (I - dev) * (1 - p);
        const nuevo = Math.min(pend.interes, Math.max(0, dev - pagI) + Math.max(0, futuro - Math.max(0, pagI - dev)));
        aj.reemplazado.interes = pend.interes - nuevo; pend.interes = nuevo;
        aj.reemplazado.cargos = pend.cargos * p; pend.cargos -= aj.reemplazado.cargos;
        aj.interesHasta = { fecha: rem.desde, fd: fd === null ? 0 : fd, devengado: Math.min(nuevo, Math.max(0, dev - pagI)), sinInicio: fd === null };
        if (fd === null) aj.notas.push('sin fecha de inicio del período: no se conoce el interés devengado hasta la renovación');
      }
      const rr = r2m(tc + ts);
      if (rr > EPS) aj.notas.push(`renovado: ${rr} de capital reemplazado por la renovación`);
      else if (aj.reemplazado.interes > EPS) aj.notas.push('cuota de interés de un capital refinanciado: se mantiene solo el interés devengado hasta la renovación');
      if (v.fecha <= corte && !(v.pagadoTotal > EPS)) aj.notas.push('sin pago registrado del vencimiento renovado: su capital se considera refinanciado; los intereses siguen como deuda');
      if (pend.capital + pend.interes + pend.cargos + pend.sinDesglose <= EPS) aj.estado = 'renovada';
    }
    const st = estadoV(v);
    if (st !== 'vigente') {
      const b = st === 'futura' ? aj.proy : aj.revisar;
      aj.estado = st === 'futura' ? 'renovacion_futura' : 'renovacion_por_revisar';
      if (capitalNuevo(v.renovacion)) {
        b.capital = Math.max(0, pend.capital - (reemplazoProy[v.key] || 0)); b.interes = pend.interes; b.cargos = pend.cargos; b.sinDesglose = pend.sinDesglose;
        aj.notas.push(st === 'futura' ? 'renovación que aún no rige: proyección' : 'renovación por revisar: no se suma a la deuda');
        aj.vig = ceroComp(); return;
      }
      // Extensión que aún no rige: el capital es el del crédito vigente; los intereses y
      // cargos del vencimiento que se extiende (trasladados a su 1ª cuota) siguen vigentes.
      const tr0 = v.interesesTrasladados ? (plan.porRen[v.renovacion] || null) : null;
      const e0 = tr0 && tr0.extra ? Math.min(tr0.extra.interes, pend.interes) : 0;
      const eC0 = tr0 && tr0.extra ? Math.min(tr0.extra.cargos || 0, pend.cargos) : 0;
      b.interes = pend.interes - e0; b.cargos = pend.cargos - eC0; pend.interes = e0; pend.cargos = eC0;
      aj.notas.push(st === 'futura' ? 'renovación que aún no rige: el capital es el del crédito vigente; los intereses nuevos son proyección' : 'renovación por revisar: el capital es el del crédito vigente; los intereses nuevos no se suman');
    }
  });
  // ── Avisos y totales por crédito ──
  Object.values(vig).forEach(o => {
    const st = estadoRen(o.ri);
    if (o.revisar === 'sin_fecha') avisos.push(`Renovación ${o.ri + 1} registrada sin modalidad ni mes de ingreso: por revisar. No se considera vigente; sus cuotas quedan aparte y el capital anterior sigue como deuda.`);
    else if (o.revisar) { const de = o.finMes ? 'fin del mes de ingreso registrado' : 'fecha del desembolso registrado';
      avisos.push(`Renovación ${o.ri + 1} registrada sin modalidad: por revisar. ${st === 'vigente' ? `Se considera vigente desde el ${dmy(o.fecha)} (${de}).` : `Rige desde el ${dmy(o.fecha)} (${de}).`}`); }
    else if (o.finMes && o.pagoYNuevo) avisos.push(`Pago y nuevo sin fecha de desembolso registrada: se considera vigente desde el ${dmy(o.fecha)}, fin del mes de ingreso. Registra la fecha real del desembolso.`);
  });
  const suma = (k) => { const z = ceroComp(); Object.values(porKey).forEach(a => { Object.keys(z).forEach(x => { z[x] += a[k][x]; }); }); Object.keys(z).forEach(x => { z[x] = r2m(z[x]); }); z.total = r2m(z.capital + z.interes + z.cargos + z.sinDesglose); return z; };
  const futuras = vencs.filter(v => estadoV(v) === 'futura');
  const proyeccion = { ...suma('proy'), desde: futuras.length ? Object.values(vig).filter(o => estadoRen(o.ri) === 'futura').map(o => o.fecha).filter(Boolean).sort()[0] || '' : '', hasta: futuras.length ? futuras[futuras.length - 1].fecha : '' };
  const porRevisar = suma('revisar');
  const vigentes = vencs.filter(v => estadoV(v) === 'vigente');
  return { porKey, avisos, proyeccion, porRevisar, vencimientoVigente: vigentes.length ? vigentes[vigentes.length - 1].fecha : '',
    vencimientoRenovacion: proyeccion.hasta, renovaciones: Object.values(vig).map(o => ({ ri: o.ri, fecha: o.fecha, estado: estadoRen(o.ri), revisar: o.revisar })) };
}

// Estado del crédito AL CORTE con la deuda vigente (deudaVigenteAlCorte): misma forma que
// estadoCredito, pero cada vencimiento trae su pendiente VIGENTE (sin lo reemplazado, sin
// lo que es proyección o está por revisar). Corte pasado: pagos con fecha ≤ corte (sin fecha =
// pagado). Corte de hoy o futuro: todos los pagos registrados, como el flujo (un pago fechado
// en el futuro ya cuenta).
// `vencimientosCalendario` conserva el calendario completo (para vistas de calendario).
// Corte FUTURO (Saldo por Mes, cierres): los pagos y vencidos son los de `hoy`, y la regla de
// renovaciones se aplica a la fecha del corte (rige o no rige en ese mes).
export function estadoCreditoAlCorte(c, corte = hoyISO(), hoy = corte) {
  const r2m = rMon(c && c.moneda);
  const ref = corte > hoy ? hoy : corte;
  const cc = { ...c, _pagosPlan: (c && (c._pagosPlan || c.pagos)) || [], pagos: ((c && c.pagos) || []).filter(p => p && (corte >= hoy || !p.fecha || p.fecha <= corte)) };
  const ap = aplicarPagos(cc, vencimientosCredito(c), ref);
  const dv = deudaVigenteAlCorte(c, ap.vencimientos, corte, { supuestoPagadoHasta: corte > hoy ? corte : '' });
  const vencimientos = ap.vencimientos.map(v => {
    const a = dv.porKey[v.key];
    if (!a || (!a.estado && !(a.reemplazado.capital + a.reemplazado.sinDesglose + a.reemplazado.interes + a.reemplazado.cargos > EPS))) return v;
    const pend = {}; COMP.forEach(k => { pend[k] = r2m(Math.max(0, a.vig[k])); });
    const tot = r2m(COMP.reduce((s, k) => s + pend[k], 0));
    return { ...v, pendiente: pend, pendienteTotal: tot, vencida: v.vencida && tot > EPS, porConciliar: v.porConciliar && tot > EPS,
      estado: a.estado || (tot > EPS ? v.estado : 'renovada'), estadoVigente: a.estado, proyeccion: a.proy, porRevisar: a.revisar, reemplazado: a.reemplazado, notasVigencia: a.notas };
  });
  const suma = (arr, f) => r2m(arr.reduce((s, v) => s + f(v), 0));
  const conf = vencimientos.filter(v => !v.porConciliar), pc = vencimientos.filter(v => v.porConciliar);
  const capNoVig = suma(conf, v => capitalizadoNoVigenteAl(v, corte));
  const pendienteTotal = suma(conf, v => v.pendienteTotal), vencidoTotal = suma(conf.filter(v => v.vencida), v => v.pendienteTotal);
  const porConciliarTotal = suma(pc, v => v.pendienteTotal);
  const pagosTot = pagosVigentes(c).filter(p => p.tipo !== 'extincion');
  let estado = 'vigente';
  if (esAnulado(c)) estado = 'anulado';
  else if (vencidoTotal > 0) estado = 'con_vencidos';
  else if (porConciliarTotal > 0) estado = 'por_conciliar';
  else if (vencimientos.length && pendienteTotal === 0 && !(dv.proyeccion.total > EPS) && !(dv.porRevisar.total > EPS)) estado = 'cerrado';
  return {
    c, uid: uidCredito(c), corte, vencimientos, vencimientosCalendario: ap.vencimientos, huerfanos: ap.huerfanos,
    saldoCapital: r2m(suma(conf, v => v.pendiente.capital) - capNoVig), sinDesglosePend: suma(conf, v => v.pendiente.sinDesglose), pendienteTotal, vencidoTotal,
    porConciliarTotal, porConciliarCapital: suma(pc, v => v.pendiente.capital), porConciliarSinDesglose: suma(pc, v => v.pendiente.sinDesglose),
    interesPend: r2m(suma(conf, v => v.pendiente.interes) + capNoVig), cargosPend: suma(conf, v => v.pendiente.cargos),
    pagadoCapital: r2m(pagosTot.reduce((s, p) => s + num(p.capital), 0)), pagadoTotal: r2m(pagosTot.reduce((s, p) => s + totalPago(p), 0)),
    vencimientoFinal: dv.vencimientoVigente || (ap.vencimientos.length ? ap.vencimientos[ap.vencimientos.length - 1].fecha : (c.f_venc || '')),
    vencimientoRenovacion: dv.vencimientoRenovacion, proyeccion: dv.proyeccion, porRevisar: dv.porRevisar, avisosVigencia: dv.avisos, renovaciones: dv.renovaciones,
    estado, tasa: tasaCredito(c), faltantes: esContrato(c) ? datosFaltantesContrato(c) : [],
    proximo: vencimientos.find(v => v.pendienteTotal > 0 && !v.vencida && !v.porConciliar) || null,
  };
}

// Registrar / anular pagos (devuelven un crédito NUEVO; no mutan).
export function registrarPago(c, pago, usuario = '') {
  const r2 = rMon(c && c.moneda);
  const comp = {};
  COMP.forEach(k => { comp[k] = r2(num(pago[k])); if (comp[k] < 0) comp[k] = 0; });
  const tot = COMP.reduce((s, k) => s + comp[k], 0);
  if (!(tot > 0)) throw new Error('El pago debe tener un monto mayor a cero.');
  if (!isoValida(pago.fecha)) throw new Error('El pago necesita fecha efectiva (AAAA-MM-DD).');
  const ts = new Date().toISOString();
  const nuevo = { id: `pg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`, vencKey: pago.vencKey || null,
    fecha: pago.fecha, ...comp, tipo: pago.tipo || 'pago', nota: pago.nota || '', usuario, ts,
    ...(pago.origen ? { origen: pago.origen } : {}), ...(pago.extra || {}) };
  return { ...c, pagos: [...(c.pagos || []), nuevo],
    historial: [...(c.historial || []), { ts, usuario, accion: nuevo.tipo === 'prepago' ? 'prepago' : 'pago', detalle: `${nuevo.fecha} · ${r2(tot)} ${c.moneda || 'USD'}${pago.vencKey ? ' · ' + pago.vencKey : ''}` }] };
}
// Pago con origen externo (p. ej. una línea de nómina): la clave del origen
// hace que reintentar NO duplique. Si ya hay un pago vigente con esa clave,
// se devuelve ese mismo (duplicado:true) sin tocar el crédito.
export function pagoPorOrigen(c, clave) {
  return pagosVigentes(c).find(p => p.origen && p.origen.clave === clave) || null;
}
export function registrarPagoIdempotente(c, pago, usuario = '') {
  const clave = pago && pago.origen && pago.origen.clave;
  if (!clave) throw new Error('Falta la clave de origen del pago.');
  const ex = pagoPorOrigen(c, clave);
  if (ex) return { credito: c, pagoId: ex.id, duplicado: true };
  if (pago.vencKey && !vencimientosCredito(c).some(v => v.key === pago.vencKey)) throw new Error('El vencimiento vinculado ya no existe en el calendario del crédito.');
  const nuevo = registrarPago(c, pago, usuario);
  return { credito: nuevo, pagoId: nuevo.pagos[nuevo.pagos.length - 1].id, duplicado: false };
}

// ── Conciliación de cuotas históricas ────────────────────────────────
// c.control_desde: fecha desde la cual el crédito se controla en la app (se
// fija al darlo de alta). Los registros anteriores no la tienen. Antes, para
// ellos TODA cuota vencida sin pago quedaba "por conciliar" y salía del flujo
// al vencer: una obligación pendiente desaparecía sin ninguna acción. Regla
// (CFO, 13-10-2026): una cuota no sale del flujo por vencer. Para esos
// registros el control rige desde CONTROL_DESDE_REGISTROS_ANTIGUOS: lo que
// venció ANTES sigue por conciliar (como hasta ahora, sin cambiar ninguna
// cifra), y lo que vence desde esa fecha, impago, es vencida confirmada y se
// arrastra al mes en curso. No se escribe en el registro: es la lectura del
// mismo campo cuando falta.
export const CONTROL_DESDE_REGISTROS_ANTIGUOS = '2026-10-13';
export function controlDesde(c) {
  if (!c) return null;
  return isoValida(c.control_desde) ? c.control_desde : CONTROL_DESDE_REGISTROS_ANTIGUOS;
}
export const controlDesdePorRegla = (c) => !!c && !isoValida(c.control_desde);

// ── Fecha estimada de pago de una cuota ──────────────────────────────
// Proyecta el pago pendiente de UNA cuota en otra fecha SIN tocar el
// vencimiento contractual (que sigue mandando para "vencida", el análisis y
// la conciliación). No paga, no renueva ni cancela nada.
// c.fechas_estimadas: [{ id, vencKey, fecha, motivo, usuario, ts,
//                        anulada?, motivoAnulacion?, anuladaPor?, anuladaTs? }]
// Nunca se borra: reemplazarla o quitarla la anula con motivo.
export const fechasEstimadasVigentes = (c) => (c && Array.isArray(c.fechas_estimadas) ? c.fechas_estimadas : []).filter(x => x && !x.anulada);
export function fechaEstimadaVigente(c, vencKey) {
  const xs = fechasEstimadasVigentes(c).filter(x => x.vencKey === vencKey);
  return xs.length ? xs[xs.length - 1] : null;
}
export function registrarFechaEstimada(c, vencKey, fecha, motivo, usuario = '', hoy = hoyISO()) {
  if (!isoValida(fecha)) throw new Error('La fecha estimada de pago debe ser una fecha válida (AAAA-MM-DD).');
  if (fecha < hoy) throw new Error('La fecha estimada de pago no puede ser anterior a hoy.');
  if (!motivo || !String(motivo).trim()) throw new Error('Indica el motivo de la fecha estimada (quién la informó y cuándo).');
  const v = aplicarPagos(c, vencimientosCredito(c), hoy).vencimientos.find(x => x.key === vencKey);
  if (!v) throw new Error('Vencimiento no encontrado.');
  if (!(v.pendienteTotal > 0)) throw new Error('La cuota no tiene saldo pendiente.');
  if (v.porConciliar) throw new Error('Primero concilia la cuota: registra el pago si se pagó, o confírmala impaga con su respaldo.');
  const ts = new Date().toISOString();
  const previa = fechaEstimadaVigente(c, vencKey);
  const lista = (c.fechas_estimadas || []).map(x => x === previa
    ? { ...x, anulada: true, motivoAnulacion: `reemplazada por ${fecha}`, anuladaPor: usuario, anuladaTs: ts } : x);
  const nueva = { id: `fe-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`, vencKey, fecha,
    motivo: String(motivo).trim(), usuario, ts };
  return { ...c, fechas_estimadas: [...lista, nueva],
    historial: [...(c.historial || []), { ts, usuario, accion: 'fecha estimada',
      detalle: `${vencKey}: pago estimado ${fecha} (vencimiento contractual ${v.fecha}) · ${nueva.motivo}` }] };
}
export function quitarFechaEstimada(c, vencKey, motivo, usuario = '') {
  const previa = fechaEstimadaVigente(c, vencKey);
  if (!previa) throw new Error('La cuota no tiene fecha estimada vigente.');
  if (!motivo || !String(motivo).trim()) throw new Error('Quitar la fecha estimada requiere motivo.');
  const ts = new Date().toISOString();
  return { ...c,
    fechas_estimadas: c.fechas_estimadas.map(x => x === previa
      ? { ...x, anulada: true, motivoAnulacion: String(motivo).trim(), anuladaPor: usuario, anuladaTs: ts } : x),
    historial: [...(c.historial || []), { ts, usuario, accion: 'fecha estimada quitada',
      detalle: `${vencKey}: vuelve al vencimiento contractual · ${String(motivo).trim()}` }] };
}
// Dónde se proyecta el pendiente de una cuota (NO por conciliar):
//   'estimada'  → fecha estimada vigente, hoy o posterior;
//   'arrastre'  → vencida (contractual < hoy) sin estimada vigente futura: hoy;
//   'contractual' → su vencimiento.
export function fechaProyeccion(c, v, hoy = hoyISO()) {
  const est = fechaEstimadaVigente(c, v.key);
  if (est && est.fecha >= hoy) return { fecha: est.fecha, tipo: 'estimada', estimada: est };
  if (v.fecha < hoy) return { fecha: hoy, tipo: 'arrastre', estimadaVencida: est || null };
  return { fecha: v.fecha, tipo: 'contractual' };
}
export const conciliacionesVigentes = (c) => (c && Array.isArray(c.conciliaciones) ? c.conciliaciones : []).filter(x => x && !x.anulado);
export function confirmarImpaga(c, vencKey, nota, usuario = '') {
  if (!vencimientosCredito(c).some(v => v.key === vencKey)) throw new Error('Vencimiento no encontrado.');
  if (conciliacionesVigentes(c).some(x => x.vencKey === vencKey)) return c;
  if (!nota || !String(nota).trim()) throw new Error('Indica el respaldo de la confirmación (cartola, certificado de deuda, correo del acreedor…).');
  const ts = new Date().toISOString();
  return { ...c,
    conciliaciones: [...(c.conciliaciones || []), { id: `cc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      vencKey, resultado: 'impaga', nota: String(nota).trim(), usuario, ts }],
    historial: [...(c.historial || []), { ts, usuario, accion: 'conciliación', detalle: `${vencKey} confirmada impaga · ${String(nota).trim()}` }] };
}
export function anularConciliacion(c, id, motivo, usuario = '') {
  if (!motivo || !String(motivo).trim()) throw new Error('Anular una conciliación requiere motivo.');
  const ts = new Date().toISOString();
  let ok = false;
  const conciliaciones = (c.conciliaciones || []).map(x => {
    if (x.id !== id || x.anulado) return x;
    ok = true; return { ...x, anulado: true, motivoAnulacion: String(motivo).trim(), anuladoPor: usuario, anuladoTs: ts };
  });
  if (!ok) throw new Error('Conciliación no encontrada o ya anulada.');
  return { ...c, conciliaciones, historial: [...(c.historial || []), { ts, usuario, accion: 'anula_conciliación', detalle: `${id} · ${motivo}` }] };
}
// Todas las cuotas por conciliar de una cartera (USD cuando hay TC).
export function porConciliarCartera(creditos, hoy = hoyISO()) {
  const out = [];
  (creditos || []).filter(c => c && !esAnulado(c)).forEach(c => {
    const f = factorUSD(c);
    aplicarPagos(c, vencimientosCredito(c), hoy).vencimientos.forEach(v => {
      if (v.porConciliar) out.push({ ...v, credito: c, usd: f === null ? null : r2(v.pendienteTotal * f) });
    });
  });
  return out.sort((a, b) => a.empresa.localeCompare(b.empresa) || a.fecha.localeCompare(b.fecha));
}

// Anotación sobre un pago vigente (no cambia montos ni fecha): deja constancia,
// p. ej., de que se CONSERVA aunque se anuló la nómina que lo originó.
export function anotarPago(c, pagoId, texto, usuario = '') {
  if (!texto || !String(texto).trim()) throw new Error('La anotación requiere texto.');
  const ts = new Date().toISOString();
  let ok = false;
  const pagos = (c.pagos || []).map(p => {
    if (p.id !== pagoId || p.anulado) return p;
    ok = true; return { ...p, anotaciones: [...(p.anotaciones || []), { ts, usuario, texto: String(texto).trim() }] };
  });
  if (!ok) throw new Error('Pago no encontrado o anulado.');
  return { ...c, pagos, historial: [...(c.historial || []), { ts, usuario, accion: 'anotación de pago', detalle: `${pagoId} · ${String(texto).trim()}` }] };
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
// DESEMBOLSO: PENDIENTE O YA RECIBIDO (oct-2026)
// ═══════════════════════════════════════════════════════════════════
// Registrar que los fondos ya se recibieron SOLO retira el ingreso proyectado del
// desembolso (ya está en la caja/bancos). No marca cuotas como pagadas, no toca el
// capital pendiente ni el calendario, y no escribe en el flujo real. No se borra:
// se anula con motivo. `monto` es lo efectivamente recibido en caja; `retenido` es lo
// que el acreedor descontó del giro (gastos, comisiones, impuestos), con su concepto.
// Lo retenido CUENTA como desembolsado (no queda pendiente ni reduce el capital, que
// sigue siendo el contractual `c.monto`) y no es caja. Ej.: 998.500 recibidos +
// 1.500 retenidos por gastos = 1.000.000 desembolsados.
export const registrosDesembolso = (c) => (c && Array.isArray(c.desembolso_registros) ? c.desembolso_registros : []);
export const recibosDesembolsoVigentes = (c) => registrosDesembolso(c).filter(r => r && !r.anulado);
// Último registro vigente (para mostrar).
export const desembolsoRecibido = (c) => { const v = recibosDesembolsoVigentes(c); return v.length ? v[v.length - 1] : null; };
export const fechaDesembolsoCredito = (c) => (esContrato(c) || esSocio(c) ? c.fecha_desembolso : c.f_inicio) || '';
// Desembolso por tramos: cada registro es "parcial" o "total". Un registro total cierra
// el desembolso y exige que recibido + retenido = capital (sin explicación de la
// diferencia, lo recibido es una recepción PARCIAL). Si solo hay parciales, lo que
// falta SIGUE proyectado en la fecha contractual.
export const desembolsadoRegistro = (r) => num(r && r.monto) + num(r && r.retenido);
export function desembolsoPendiente(c) {
  const v = recibosDesembolsoVigentes(c);
  if (v.some(r => r.tipo !== 'parcial')) return 0;
  return rMon(c && c.moneda)(Math.max(0, num(c && c.monto) - v.reduce((s, r) => s + desembolsadoRegistro(r), 0)));
}
export function estadoDesembolso(c, hoy = hoyISO()) {
  const vig = recibosDesembolsoVigentes(c);
  const fecha = fechaDesembolsoCredito(c);
  const monto = num(c && c.monto);
  const recibidoTotal = rMon(c && c.moneda)(vig.reduce((s, r) => s + num(r.monto), 0));
  const retenidoTotal = rMon(c && c.moneda)(vig.reduce((s, r) => s + num(r.retenido), 0));
  const pendiente = vig.length ? desembolsoPendiente(c) : monto;
  let estado;
  if (vig.length && pendiente <= EPS) estado = 'recibido';
  else if (vig.length) estado = 'parcial';
  else if (esContrato(c) && c.desembolso_en_flujo === false) estado = 'sin_caja';
  else if (!esContrato(c) && c && c.pagado === true) estado = 'cerrado_antiguo';
  else if (!isoValida(fecha)) estado = 'sin_fecha';
  // Fecha anterior al control en la app: dato histórico, sin aviso (no se puede saber).
  else estado = fecha >= hoy ? 'pendiente' : (fecha >= (controlDesde(c) || '') ? 'pendiente_vencido' : 'historico');
  const total = vig.find(r => r.tipo !== 'parcial');
  return { estado, fecha, monto, recibidos: vig, recibidoTotal, retenidoTotal, pendiente, recibido: vig.length ? vig[vig.length - 1] : null,
    diferencia: total ? rMon(c.moneda)(recibidoTotal + retenidoTotal - monto) : 0 };
}
export function registrarDesembolsoRecibido(c, { fecha, monto, nota, tipo, retenido, concepto_retenido } = {}, usuario = '', hoy = hoyISO()) {
  if (!isoValida(fecha)) throw new Error('Indica la fecha en que se recibieron los fondos (AAAA-MM-DD).');
  if (fecha > hoy) throw new Error('La fecha de recepción no puede ser futura: registra los fondos cuando lleguen.');
  if (!(num(monto) > 0)) throw new Error('Indica el monto recibido.');
  const t = tipo === 'parcial' ? 'parcial' : 'total';
  if (recibosDesembolsoVigentes(c).some(r => r.tipo !== 'parcial')) throw new Error('El desembolso ya está registrado como recibido en su totalidad. Para corregirlo, anula ese registro con motivo.');
  const r2 = rMon(c && c.moneda);
  const ret = r2(num(retenido));
  if (ret < 0) throw new Error('El monto retenido no puede ser negativo.');
  if (ret > 0 && !String(concepto_retenido || '').trim()) throw new Error('Indica el concepto de lo retenido por el acreedor (gastos, comisión, impuesto…).');
  const previo = recibosDesembolsoVigentes(c).reduce((a, r) => a + desembolsadoRegistro(r), 0);
  const tol = toleranciaDe((c && c.moneda) || 'USD');
  if (t === 'parcial' && previo + num(monto) + ret > num(c && c.monto) + tol)
    throw new Error('Los tramos parciales superarían el capital del crédito. Si con este se completa el desembolso, regístralo como "total".');
  // Total = cierra el desembolso: lo recibido más lo retenido tiene que ser el capital.
  // Si no cuadra y no hay explicación, es una recepción PARCIAL (lo que falta sigue pendiente).
  if (t === 'total') {
    const dif = r2(num(c && c.monto) - previo - num(monto) - ret);
    if (Math.abs(dif) > tol) throw new Error(dif > 0
      ? `Recibido ${r2(num(monto))}${ret ? ' + retenido ' + ret : ''} no completa el capital (faltan ${dif}). Si el acreedor retuvo gastos, indica el monto retenido y su concepto; si no, regístralo como recepción parcial.`
      : `Recibido ${r2(num(monto))}${ret ? ' + retenido ' + ret : ''} supera el capital del crédito en ${-dif}. Revisa los montos.`);
  }
  const ts = new Date().toISOString();
  const reg = { id: `ds-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`, fecha, monto: r2(num(monto)), tipo: t,
    ...(ret > 0 ? { retenido: ret, concepto_retenido: String(concepto_retenido).trim() } : {}),
    nota: String(nota || '').trim(), usuario, ts };
  return { ...c, desembolso_registros: [...registrosDesembolso(c), reg],
    historial: [...(c.historial || []), { ts, usuario, accion: 'desembolso_recibido', detalle: `${t} · ${fecha} · ${reg.monto} ${c.moneda || 'USD'}${ret > 0 ? ` · retenido ${ret} (${reg.concepto_retenido})` : ''}${reg.nota ? ' · ' + reg.nota : ''}` }] };
}
export function anularDesembolsoRecibido(c, id, motivo, usuario = '') {
  if (!motivo || !String(motivo).trim()) throw new Error('Anular el registro del desembolso requiere motivo.');
  const ts = new Date().toISOString();
  const obj = registrosDesembolso(c).find(r => r.id === id && !r.anulado);
  if (obj && obj.tipo === 'parcial' && registrosDesembolso(c).some(r => !r.anulado && r.tipo !== 'parcial'))
    throw new Error('Hay un registro de desembolso TOTAL vigente: anúlalo primero (con motivo) y después el tramo parcial.');
  let ok = null;
  const regs = registrosDesembolso(c).map(r => {
    if (r.id !== id || r.anulado) return r;
    ok = r; return { ...r, anulado: true, motivoAnulacion: String(motivo).trim(), anuladoPor: usuario, anuladoTs: ts };
  });
  if (!ok) throw new Error('Registro de desembolso no encontrado o ya anulado.');
  return { ...c, desembolso_registros: regs,
    historial: [...(c.historial || []), { ts, usuario, accion: 'anula_desembolso_recibido', detalle: `${ok.fecha} · ${ok.monto} · ${String(motivo).trim()}` }] };
}

// ═══════════════════════════════════════════════════════════════════
// FLUJO DE CAJA — lo pendiente, por empresa, mes y semana (en USD)
// ═══════════════════════════════════════════════════════════════════
// Conversión a USD: `tc_flujo` = unidades de la moneda por 1 US$ (CLP 950,
// PEN 3,75, UF 0,025…). Sin TC no se puede sumar a un flujo en USD: el
// crédito se informa como "sin TC" y NO se mezcla en otra moneda.
export function factorUSD(c) {
  // Crédito ya valorizado (valorizarCreditos): usa ese TC (Maestros o declarado).
  if (c && Object.prototype.hasOwnProperty.call(c, '_tc')) return c._tc ? c._tc.factor : null;
  const mon = (c && c.moneda) || 'USD';
  if (mon === 'USD') return 1;
  const tc = num(c.tc_flujo);
  return tc > 0 ? 1 / tc : null;
}

// ── Tipo de cambio desde el histórico de Maestros (maestro_tc) ───────
// tcData = { "USD-CLP":[{fecha,valor,fuente}], ... } donde valor = unidades de
// la 2ª moneda por 1 de la 1ª. Se toma el último dato con fecha ≤ corte. En
// Maestros un dato "manual" no lo pisa la API (mergeTCSerie), así que el valor
// manual del CFO es el que se usa. Devuelve { tc (moneda por 1 US$), fecha,
// fuente, par } o null. Triangula vía CLP si no hay par con USD.
function ultimoDato(serie, corte) {
  if (!Array.isArray(serie)) return null;
  const v = serie.filter(p => p && p.fecha && p.fecha <= corte && Number(p.valor) > 0)
    .sort((a, b) => b.fecha.localeCompare(a.fecha));
  return v.length ? v[0] : null;
}
export function tcDesdeTabla(moneda, corte, tcData) {
  if (!moneda || moneda === 'USD') return { tc: 1, fecha: null, fuente: 'USD', par: 'USD' };
  if (!tcData || typeof tcData !== 'object') return null;
  const d = ultimoDato(tcData[`USD-${moneda}`], corte);
  if (d) return { tc: Number(d.valor), fecha: d.fecha, fuente: d.fuente || 's/f', par: `USD-${moneda}` };
  const i = ultimoDato(tcData[`${moneda}-USD`], corte);
  if (i) return { tc: 1 / Number(i.valor), fecha: i.fecha, fuente: i.fuente || 's/f', par: `${moneda}-USD (inverso)` };
  const a = ultimoDato(tcData['USD-CLP'], corte), b = moneda === 'CLP' ? null : ultimoDato(tcData[`${moneda}-CLP`], corte);
  if (a && b) return { tc: Number(a.valor) / Number(b.valor), fecha: a.fecha < b.fecha ? a.fecha : b.fecha,
    fuente: `${a.fuente || 's/f'} / ${b.fuente || 's/f'}`, par: `USD-CLP ÷ ${moneda}-CLP (triangulado)` };
  return null;
}
// TC con el que se valoriza un crédito a la fecha de corte:
//   1) histórico de Maestros; 2) TC declarado en el crédito (hipótesis); 3) sin TC.
// Antigüedad sobre la cual se avisa en proyecciones.
export const TC_ANTIGUEDAD_AVISO_DIAS = 7;
export function infoTC(c, tcData, corte) {
  const mon = (c && c.moneda) || 'USD';
  if (mon === 'USD') return { factor: 1, tc: 1, fecha: null, fuente: 'USD', origen: 'usd', moneda: 'USD', estimado: false };
  const m = tcDesdeTabla(mon, corte, tcData);
  if (m && m.tc > 0) {
    const ant = m.fecha ? diasEntre(m.fecha, corte) : null;
    const info = { factor: 1 / m.tc, tc: r2x(m.tc), fecha: m.fecha, fuente: `Maestros · ${m.fuente}`, par: m.par, origen: 'maestros', moneda: mon,
      antiguedadDias: ant, desactualizado: ant != null && ant > TC_ANTIGUEDAD_AVISO_DIAS, estimado: false, corte };
    if (mon === 'UF') info.porFecha = ufPorFecha(tcData, corte);
    return info;
  }
  const t = num(c.tc_flujo);
  if (t > 0) {
    const f = isoValida(c.tc_flujo_fecha) ? c.tc_flujo_fecha : null;
    // Un TC declarado con fecha POSTERIOR al corte no sirve para valorizar ese corte.
    if (f && f > corte) return null;
    return { factor: 1 / t, tc: t, fecha: f, fuente: 'TC declarado en el crédito (hipótesis)', origen: 'credito', moneda: mon,
      antiguedadDias: f ? diasEntre(f, corte) : null, desactualizado: !f || diasEntre(f, corte) > TC_ANTIGUEDAD_AVISO_DIAS, estimado: true, corte };
  }
  return null;
}

// ── UF ─────────────────────────────────────────────────────────────
// Fuente oficial: Banco Central de Chile (Diario Oficial). Publica a más
// tardar el día 9 los valores diarios del 10 de ese mes al 9 del siguiente.
// En Maestros se guarda como par "UF-CLP" (CLP por 1 UF; mindicador.cl la
// toma del Banco Central). Para cada fecha:
//   · si existe el valor publicado de ESE día → exacto;
//   · fecha ≤ corte sin valor del día → último publicado ≤ esa fecha;
//   · fecha futura sin valor publicado → último ≤ corte = HIPÓTESIS de
//     proyección (no se proyecta el reajuste por IPC).
// El USD-CLP de una fecha futura siempre es el último ≤ corte (hipótesis).
export function ufPorFecha(tcData, corte) {
  const serieUF = (tcData && tcData['UF-CLP']) || [];
  const serieUSD = (tcData && tcData['USD-CLP']) || [];
  return (iso) => {
    const exacto = serieUF.find(p => p && p.fecha === iso && Number(p.valor) > 0);
    let uf, tipo;
    if (exacto) { uf = exacto; tipo = 'publicado'; }
    else if (iso <= corte) { uf = ultimoDato(serieUF, iso); tipo = 'ultimo_publicado'; }
    else { uf = ultimoDato(serieUF, corte); tipo = 'hipotesis'; }
    const usd = ultimoDato(serieUSD, iso <= corte ? iso : corte);
    if (!uf || !usd) return null;
    const tcUFporUSD = Number(usd.valor) / Number(uf.valor);   // UF por 1 US$
    return { factor: 1 / tcUFporUSD, ufCLP: Number(uf.valor), ufFecha: uf.fecha, ufFuente: uf.fuente || 's/f',
      usdCLP: Number(usd.valor), usdFecha: usd.fecha, usdFuente: usd.fuente || 's/f',
      // La UF es hipótesis SOLO si no existe el valor publicado de esa fecha.
      // El USD-CLP de una fecha futura sí es siempre el último conocido.
      hipotesis: tipo === 'hipotesis', usdHipotesis: iso > corte, tipo };
  };
}
// Factor USD de un vencimiento: UF usa el valor de su fecha (o hipótesis);
// las demás monedas, el TC del crédito al corte.
export function factorVencimiento(c, fecha) {
  const t = c && c._tc;
  if (t && typeof t.porFecha === 'function') { const x = t.porFecha(fecha); if (x) return x.factor; }
  return factorUSD(c);
}
const r2x = (x) => Math.round(x * 1e6) / 1e6;
// Copias valorizadas (NO se guardan: `_tc` se retira al persistir).
export function valorizarCreditos(creditos, tcData, corte = hoyISO()) {
  return (creditos || []).map(c => (c && typeof c === 'object' ? { ...c, _tc: infoTC(c, tcData, corte) } : c));
}
export const sinValorizacion = (c) => { if (!c || typeof c !== 'object') return c; const { _tc, ...resto } = c; return resto; };

// opts: { hoy, nMeses, ubicar(iso) → {idx, semIdx} (idx −1 fuera de horizonte) }
export function flujoCreditosEmpresa(empresa, creditos, opts = {}) {
  const hoy = opts.hoy || hoyISO();
  const n = opts.nMeses || 63;
  const ubicar = opts.ubicar;
  const Z = () => Array(n).fill(0);
  const bloque = () => ({ total: Z(), capital: Z(), interes: Z(), cargos: Z(), sinDesglose: Z(), sem: {}, porAcreedor: {},
    semComp: { capital: {}, interes: {}, cargos: {}, sinDesglose: {} } });
  const out = { prestamos: bloque(), renovaciones: bloque(), ingresos: { total: Z(), porAcreedor: {}, sem: {} },
    arrastrados: [], porConciliar: [], sinTC: [], antesHorizonte: [], valorizacion: [], estimados: [], fueraHorizonte: [],
    desembolsosPendientesVencidos: [] };
  const hoyPos = ubicar ? ubicar(hoy) : { idx: -1, semIdx: 0 };
  (creditos || []).filter(c => c && c.empresa === empresa && !esAnulado(c)).forEach(c => {
    const f = factorUSD(c);
    if (f === null) { const e = estadoCredito(c, hoy); out.sinTC.push({ ...c, _pendienteOriginal: e.pendienteTotal, _porConciliarOriginal: e.porConciliarTotal }); return; }
    if (c._tc && c._tc.origen !== 'usd') out.valorizacion.push({ acreedor: c.acreedor, moneda: c.moneda, ...c._tc });
    const { vencimientos } = aplicarPagos(c, vencimientosCredito(c), hoy);
    vencimientos.forEach(v0 => {
      const v = v0;
      if (!(v.pendienteTotal > 0)) return;
      // UF: el valor de la fecha del vencimiento (publicado) o hipótesis.
      const f = factorVencimiento(c, v.fecha < hoy ? hoy : v.fecha);
      // Por conciliar: NO entra al flujo; se informa con su impacto potencial.
      if (v.porConciliar) { out.porConciliar.push({ ...v, usd: r2(v.pendienteTotal * f) }); return; }
      const fp = fechaProyeccion(c, v, hoy);
      let pos = ubicar ? ubicar(v.fecha) : { idx: -1, semIdx: 0 };
      if (fp.tipo === 'estimada') {
        // Fecha estimada de pago: se proyecta ahí; el vencimiento contractual se conserva.
        pos = ubicar ? ubicar(fp.fecha) : { idx: -1, semIdx: 0 };
        const reg = { ...v, acreedor: c.acreedor, usd: r2(v.pendienteTotal * f), fechaEstimada: fp.fecha,
          motivoEstimada: fp.estimada.motivo, vencidaContractual: v.fecha < hoy };
        out.estimados.push(reg);
        if (pos.idx < 0) { out.fueraHorizonte.push(reg); return; }
      } else if (fp.tipo === 'arrastre' && hoyPos.idx >= 0) {
        // Impago con fecha pasada: se arrastra al mes/semana en curso (no se pierde).
        pos = hoyPos;
        out.arrastrados.push({ ...v, usd: r2(v.pendienteTotal * f), ...(fp.estimadaVencida ? { fechaEstimadaVencida: fp.estimadaVencida.fecha } : {}) });
      }
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
    // Fondos ya recibidos: lo recibido NO se proyecta (ya está en la caja). Con tramos
    // parciales, solo lo que falta recibir sigue en la fecha contractual. Nada más cambia.
    const monto = (recibosDesembolsoVigentes(c).length ? desembolsoPendiente(c) : num(c.monto)) * f;
    // Pendiente con fecha pasada (desde que el crédito se controla en la app): no se
    // mueve ni se da por recibido; se informa para confirmarlo.
    if (fIng && isoValida(fIng) && fIng < hoy && fIng >= (controlDesde(c) || '') && monto) out.desembolsosPendientesVencidos.push({ uid: uidCredito(c), acreedor: c.acreedor, fecha: fIng, usd: r2(monto) });
    if (fIng && isoValida(fIng) && monto && ubicar) {
      const p = ubicar(fIng);
      if (p.idx >= 0) {
        out.ingresos.total[p.idx] += monto;
        const si = out.ingresos.sem[p.idx] || (out.ingresos.sem[p.idx] = [0, 0, 0, 0]);
        si[p.semIdx || 0] += monto;
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
  // Deuda VIGENTE al corte (misma fuente que el informe de deuda): renovaciones que no
  // rigen van aparte como proyección; las antiguas sin fecha, por revisar.
  const estados = (creditos || []).filter(c => c && !esAnulado(c)).map(c => ({ ...estadoCreditoAlCorte(c, hoy), f: factorUSD(c) }));
  const agrupar = (clave) => {
    const g = {};
    estados.forEach(e => {
      if (e.f === null) return;
      const k = clave(e.c) || '—';
      const x = g[k] || (g[k] = { saldoCapital: 0, sinDesglose: 0, pendiente: 0, vencido: 0, porConciliar: 0, n: 0 });
      x.saldoCapital += e.saldoCapital * e.f; x.sinDesglose += e.sinDesglosePend * e.f;
      x.pendiente += e.pendienteTotal * e.f; x.vencido += e.vencidoTotal * e.f; x.porConciliar += e.porConciliarTotal * e.f;
      if (e.pendienteTotal > 0 || e.porConciliarTotal > 0) x.n++;
    });
    Object.values(g).forEach(x => { ['saldoCapital', 'sinDesglose', 'pendiente', 'vencido', 'porConciliar'].forEach(k => { x[k] = r2(x[k]); }); });
    return g;
  };
  const tipoAcr = (c) => c.tipo_acreedor || (esSocio(c) ? 'Socio' : (c.tipo_inst === 'Banco' ? 'Banco' : (c.tipo_inst || 'Sin clasificar')));
  // Tasas: exposición y costo (solo créditos con saldo de capital y tasa conocida)
  // Costo: solo sobre capital identificado (lo "sin desglose" puede traer
  // intereses dentro); aparte, el costo si todo lo sin desglose fuera capital.
  let capFija = 0, capVar = 0, capSinTasa = 0, sumTasaCap = 0, capConTasa = 0, costoAnual = 0, costoConSD = 0, sdConTasa = 0;
  const sinTasa = [], variables = [];
  estados.forEach(e => {
    if (e.f === null) return;
    const cap = (e.saldoCapital + e.sinDesglosePend) * e.f;
    if (cap <= EPS) return;
    if (e.tasa.tasa === null) { capSinTasa += cap; sinTasa.push(e); return; }
    if (e.tasa.variable) { capVar += cap; variables.push(e); } else capFija += cap;
    sumTasaCap += e.tasa.tasa * cap; capConTasa += cap;
    costoAnual += e.saldoCapital * e.f * e.tasa.tasa / 100;
    costoConSD += cap * e.tasa.tasa / 100; sdConTasa += e.sinDesglosePend * e.f;
  });
  // Capital de renovaciones que no rigen / por revisar (mismo criterio que saldosAlCorte).
  const fuera = (k) => r2(estados.reduce((a, e) => a + (e.f === null ? 0 : e[k].capital * e.f), 0));
  return {
    estados, proyeccionRenovaciones: fuera('proyeccion'), renovacionesPorRevisar: fuera('porRevisar'),
    avisosVigencia: estados.flatMap(e => (e.avisosVigencia || []).map(a => `${e.c.empresa} · ${e.c.acreedor}: ${a}`)),
    porEmpresa: agrupar(c => c.empresa), porAcreedor: agrupar(c => c.acreedor), porMoneda: agrupar(c => c.moneda || 'USD'),
    porTipo: agrupar(c => c.tipo_cr || 'Sin tipo'), porTipoAcreedor: agrupar(tipoAcr),
    tasas: { capFija: r2(capFija), capVar: r2(capVar), capSinTasa: r2(capSinTasa), tasaPromedio: capConTasa > 0 ? sumTasaCap / capConTasa : null,
      costoAnualEstimado: r2(costoAnual), costoAnualSiSinDesgloseFueraCapital: r2(costoConSD), sinDesgloseConTasa: r2(sdConTasa),
      sensibilidad100pb: r2(capVar * 0.01), sinTasa, variables },
    sinTC: estados.filter(e => e.f === null),
  };
}

// Servicio de deuda pendiente por mes (clave AAAA-MM), en USD.
export function servicioDeudaPorMes(creditos, hoy = hoyISO(), { arrastrar = true } = {}) {
  const out = {};
  (creditos || []).filter(c => c && !esAnulado(c)).forEach(c => {
    if (factorUSD(c) === null) return;
    aplicarPagos(c, vencimientosCredito(c), hoy).vencimientos.forEach(v => {
      if (!(v.pendienteTotal > 0)) return;
      const f = factorVencimiento(c, v.fecha < hoy ? hoy : v.fecha);
      // Misma ubicación que el flujo: fecha estimada vigente o arrastre al mes en curso.
      const fp = v.porConciliar ? null : fechaProyeccion(c, v, hoy);
      const k = (fp && fp.tipo === 'estimada') ? fp.fecha.slice(0, 7)
        : (arrastrar && v.fecha < hoy) ? hoy.slice(0, 7) : v.fecha.slice(0, 7);
      const x = out[k] || (out[k] = { capital: 0, interes: 0, cargos: 0, sinDesglose: 0, total: 0, vencido: 0, porConciliar: 0, interesVariable: 0 });
      // Por conciliar: columna aparte, fuera del total (impacto potencial).
      if (v.porConciliar) { x.porConciliar += v.pendienteTotal * f; return; }
      x.capital += v.pendiente.capital * f; x.interes += v.pendiente.interes * f; x.cargos += v.pendiente.cargos * f;
      if (v.tasaVariable) x.interesVariable += v.pendiente.interes * f;
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
    estadoCreditoAlCorte(c, corteISO, hoy).vencimientos.forEach(v => {
      if (v.fecha > corteISO && !v.porConciliar) { capital += (v.pendiente.capital - capitalizadoNoVigenteAl(v, corteISO)) * f; sinDesglose += v.pendiente.sinDesglose * f; }
    });
  });
  return { capital: r2(capital), sinDesglose: r2(sinDesglose) };
}

// ═══════════════════════════════════════════════════════════════════
// CONCILIACIÓN CON EL ACREEDOR (en la moneda original, sin convertir)
// ═══════════════════════════════════════════════════════════════════
// Se compara SOLO capital con capital: el capital pendiente identificado en la
// app a la fecha de corte vs el capital insoluto que informa el acreedor. Las
// cuotas sin desglose pueden traer intereses y cargos: NO se suman al capital
// para "cuadrar"; si existen, la conciliación queda INCOMPLETA. Igual si hay
// cuotas por conciliar o pagos antiguos marcados sin registro (sin fecha).
// informados: [{ id, empresa, acreedor, moneda, fecha, capital, intereses?, cargos?, respaldo, usuario, ts, anulado? }]
export const claveAcreedor = (empresa, acreedor, moneda) => `${empresa}|${acreedor}|${moneda || 'USD'}`;
export function informadoVigente(informados, clave) {
  return (informados || []).filter(x => x && !x.anulado && claveAcreedor(x.empresa, x.acreedor, x.moneda) === clave)
    .sort((a, b) => (b.fecha || '').localeCompare(a.fecha || '') || (b.ts || '').localeCompare(a.ts || ''))[0] || null;
}
export function posicionAlCorte(creditosGrupo, corte) {
  const r2 = rMon(creditosGrupo[0] && creditosGrupo[0].moneda);
  const z = { capital: 0, interesVencido: 0, cargosVencidos: 0, interesFuturo: 0, cargosFuturos: 0, sinClasificar: 0, sinClasificarCuotas: 0,
    porConciliar: 0, porConciliarCuotas: 0, pagadoSinRegistro: 0, creditos: 0, proyeccion: 0, porRevisar: 0 };
  creditosGrupo.forEach(c => {
    z.creditos++;
    // Solo los pagos con fecha ≤ corte (lo pagado después aún se debía al corte).
    // Deuda vigente al corte (fuente única). Aquí un pago SIN fecha no cuenta (no se puede
    // ubicar antes del corte): se conserva el criterio de la conciliación.
    const cc = { ...c, _pagosPlan: c.pagos || [], pagos: (c.pagos || []).filter(p => p && p.fecha && p.fecha <= corte) };
    const ev = estadoCreditoAlCorte(cc, corte);
    z.proyeccion += ev.proyeccion.capital; z.porRevisar += ev.porRevisar.total;
    ev.vencimientos.forEach(v => {
      if (v.pagadoSinRegistro) z.pagadoSinRegistro++;
      if (!(v.pendienteTotal > 0)) return;
      if (v.porConciliar) { z.porConciliar += v.pendienteTotal; z.porConciliarCuotas++; return; }
      const noVig = capitalizadoNoVigenteAl(v, corte);
      z.capital += v.pendiente.capital - noVig;
      if (v.fecha <= corte) { z.interesVencido += v.pendiente.interes; z.cargosVencidos += v.pendiente.cargos; }
      else { z.interesFuturo += v.pendiente.interes + noVig; z.cargosFuturos += v.pendiente.cargos; }
      if (v.pendiente.sinDesglose > 0) { z.sinClasificar += v.pendiente.sinDesglose; z.sinClasificarCuotas++; }
    });
  });
  Object.keys(z).forEach(k => { if (!/Cuotas|creditos|pagadoSinRegistro/.test(k)) z[k] = r2(z[k]); });
  return z;
}
// Tolerancia de REDONDEO por moneda (configurable). Nunca reemplaza datos
// faltantes: con cualquier motivo pendiente el estado es "incompleta".
export const TOLERANCIAS_DEFAULT = { CLP: 1, USD: 0.01, EUR: 0.01, PEN: 0.01, UF: 0.0001 };
export const toleranciaDe = (moneda, tolerancias) => {
  const t = tolerancias && tolerancias[moneda];
  if (t !== undefined && t !== null && t !== '' && isFinite(Number(t)) && Number(t) >= 0) return Number(t);
  return TOLERANCIAS_DEFAULT[moneda] !== undefined ? TOLERANCIAS_DEFAULT[moneda] : 0.01;
};
// Explica el capital de la app al corte, movimiento por movimiento:
//   capital en calendario (Σ capital de las cuotas; ya neto de prepagos de contrato)
//   − capital pagado en cuotas (pagos vigentes con fecha ≤ corte, incluye extinciones)
//   − capital de cuotas por conciliar (excluido, no confirmado)
//   = capital app.  Los intereses y cargos pagados NO tocan el capital; se listan aparte.
export function movimientosCapitalAlCorte(creditosGrupo, corte) {
  const r2 = rMon(creditosGrupo[0] && creditosGrupo[0].moneda);
  const movs = [];
  let original = 0, prepCap = 0, capCal = 0, capPag = 0, capSinReg = 0, capPC = 0, exceso = 0, intPag = 0, carPag = 0, capRen = 0, capReemp = 0, capFuera = 0;
  creditosGrupo.forEach(c => {
    original += num(c.monto);
    (c.prepagos || []).filter(p => !p.anulado && p.fecha <= corte).forEach(p => { prepCap += num(p.capital);
      movs.push({ fecha: p.fecha, tipo: 'prepago de capital (ya descontado del calendario)', capital: num(p.capital), interes: 0, cargos: 0, sinDesglose: 0, cuenta: false }); });
    const vencs = vencimientosCredito(c);
    const cc = { ...c, _pagosPlan: c.pagos || [], pagos: (c.pagos || []).filter(p => p && p.fecha && p.fecha <= corte) };
    const capitalizadoVisto = new Set();
    // Renovaciones al corte (fuente única): capital refinanciado por una renovación vigente y
    // capital de renovaciones que no rigen o están por revisar, fuera del saldo.
    const ev = estadoCreditoAlCorte({ ...c, _pagosPlan: c.pagos || [], pagos: (c.pagos || []).filter(p => p && p.fecha && p.fecha <= corte) }, corte);
    const adj = Object.fromEntries(ev.vencimientos.map(v => [v.key, v]));
    aplicarPagos(cc, vencs, corte).vencimientos.forEach(v => {
      const a = adj[v.key];
      if (a && a !== v) {
        const neto = (x) => (x.porConciliar ? 0 : x.pendiente.capital - capitalizadoNoVigenteAl(x, corte));
        const rc = v.porConciliar ? 0 : ((a.reemplazado && a.reemplazado.capital) || 0);
        const fuera = neto(v) - neto(a) - rc;
        if (rc > EPS) { capReemp += rc; movs.push({ fecha: v.fecha, tipo: 'capital refinanciado por una renovación vigente (sin caja)', capital: r2(rc), interes: 0, cargos: 0, sinDesglose: 0, cuenta: true }); }
        if (Math.abs(fuera) > EPS) { capFuera += fuera; movs.push({ fecha: v.fecha, tipo: a.estadoVigente === 'renovacion_por_revisar' ? 'capital de una renovación por revisar (fuera del saldo)' : 'capital de una renovación que aún no rige (proyección, fuera del saldo)', capital: r2(fuera), interes: 0, cargos: 0, sinDesglose: 0, cuenta: true }); }
      }
      capCal += v.capital - capitalizadoNoVigenteAl(v, corte);
      if (v.capitalizadoEnCuota > 0 && corte >= v.capitalizaDesde && !capitalizadoVisto.has(v.renovacion)) {
        capitalizadoVisto.add(v.renovacion);
        const tot = vencs.filter(x => x.renovacion === v.renovacion).reduce((s, x) => s + (x.capitalizadoEnCuota || 0), 0);
        movs.push({ fecha: v.capitalizaDesde, tipo: 'interés capitalizado en la renovación (pasa a capital)', capital: r2(tot), interes: 0, cargos: 0, sinDesglose: 0, cuenta: true });
      }
      // Capital extendido por una renovación: sale de este vencimiento sin caja y
      // vuelve en las cuotas de la renovación (que ya están en el calendario).
      if (v.renovadoCapital > 0) { capRen += v.renovadoCapital; movs.push({ fecha: v.fecha, tipo: 'capital renovado sin caja (pasa a la renovación)', capital: v.renovadoCapital, interes: 0, cargos: 0, sinDesglose: 0, cuenta: true }); }
      if (v.pagadoSinRegistro) { capSinReg += v.capital; movs.push({ fecha: v.fecha, tipo: 'cuota marcada pagada SIN registro (sin fecha ni monto)', capital: v.capital, interes: v.interes, cargos: v.cargos, sinDesglose: v.sinDesglose, cuenta: true }); return; }
      capPag += v.pagado.capital; exceso += Math.max(0, v.pagado.capital - v.capital);
      intPag += v.pagado.interes; carPag += v.pagado.cargos;
      if (v.porConciliar) capPC += v.pendiente.capital;
    });
    (c.pagos || []).forEach(p => {
      const cuenta = !p.anulado && p.fecha && p.fecha <= corte && !!p.vencKey;
      movs.push({ fecha: p.fecha, tipo: p.anulado ? `pago ANULADO — no cuenta (${p.motivoAnulacion || ''})` : (p.fecha > corte ? 'pago POSTERIOR al corte — no cuenta'
        : (p.tipo === 'extincion' ? 'extinción por prepago' : (p.vencKey ? 'pago de cuota' : 'pago de prepago (caja; el capital ya bajó en el calendario)'))),
        capital: num(p.capital), interes: num(p.interes), cargos: num(p.cargos), sinDesglose: num(p.sinDesglose), cuenta });
    });
  });
  movs.sort((x, y) => (x.fecha || '').localeCompare(y.fecha || ''));
  const app = posicionAlCorte(creditosGrupo, corte).capital;
  // capital app = calendario − capital imputado a cuotas (+ exceso, que no reduce
  // más allá de la cuota) − cuotas pagadas sin registro − capital por conciliar
  const calculado = r2(capCal - capRen - (capPag - exceso) - capSinReg - capPC - capReemp - capFuera);
  return { original: r2(original), prepagosCapital: r2(prepCap), capitalRenovado: r2(capRen), capitalRefinanciado: r2(capReemp), capitalRenovacionesFuera: r2(capFuera), capitalCalendario: r2(capCal), capitalPagado: r2(capPag), excesoCapital: r2(exceso),
    capitalSinRegistro: r2(capSinReg), capitalPorConciliar: r2(capPC), interesPagado: r2(intPag), cargosPagados: r2(carPag),
    capitalApp: app, calculado, cuadra: Math.abs(calculado - app) <= (creditosGrupo[0] && creditosGrupo[0].moneda === 'UF' ? 0.0001 : 0.01), movimientos: movs };
}

export function conciliacionAcreedores(creditos, informados, hoy = hoyISO(), opciones = {}) {
  const { tolerancias = null, tcData = null } = (typeof opciones === 'object' && opciones) || {};
  const grupos = {};
  (creditos || []).filter(c => c && !esAnulado(c)).forEach(c => {
    const k = claveAcreedor(c.empresa, c.acreedor, c.moneda);
    (grupos[k] = grupos[k] || { empresa: c.empresa, acreedor: c.acreedor, moneda: c.moneda || 'USD', creditos: [] }).creditos.push(c);
  });
  (informados || []).filter(x => x && !x.anulado).forEach(x => {
    const k = claveAcreedor(x.empresa, x.acreedor, x.moneda);
    if (!grupos[k]) grupos[k] = { empresa: x.empresa, acreedor: x.acreedor, moneda: x.moneda || 'USD', creditos: [] };
  });
  return Object.entries(grupos).map(([clave, g]) => {
    const inf = informadoVigente(informados, clave);
    const corte = inf && isoValida(inf.fecha) ? inf.fecha : hoy;
    const app = posicionAlCorte(g.creditos, corte);
    const motivos = [];
    if (!inf) motivos.push('falta el capital informado por el acreedor');
    if (app.sinClasificar > EPS) motivos.push(`${app.sinClasificarCuotas} cuota(s) sin desglosar (${app.sinClasificar} ${g.moneda}) pueden incluir intereses y cargos`);
    if (app.porConciliar > EPS) motivos.push(`${app.porConciliarCuotas} cuota(s) por conciliar (${app.porConciliar} ${g.moneda})`);
    if (app.porRevisar > EPS) motivos.push(`renovación registrada sin modalidad ni mes de ingreso (${app.porRevisar} ${g.moneda} por revisar)`);
    if (app.pagadoSinRegistro > 0) motivos.push(`${app.pagadoSinRegistro} cuota(s) marcadas pagadas sin fecha ni monto`);
    if (inf && !(inf.respaldo || '').trim()) motivos.push('el saldo informado no tiene respaldo');
    const falt = g.creditos.filter(c => esContrato(c) && datosFaltantesContrato(c).length);
    if (falt.length) motivos.push(`${falt.length} crédito(s) con condiciones incompletas: ${falt.map(c => datosFaltantesContrato(c).join(', ')).join(' / ')}`);
    const huerf = g.creditos.reduce((a, c) => a + aplicarPagos(c, vencimientosCredito(c), corte).huerfanos.length, 0);
    if (huerf) motivos.push(`${huerf} pago(s) sin vencimiento asociado`);
    const capInf = inf ? num(inf.capital) : null;
    const difExacta = inf ? capInf - app.capital : null;          // sin redondear
    const dif = inf ? rMon(g.moneda)(difExacta) : null;
    const tol = toleranciaDe(g.moneda, tolerancias);
    let estado;
    if (!inf) estado = 'sin_dato';
    else if (motivos.length) estado = 'incompleta';
    else estado = Math.abs(difExacta) <= tol + 1e-9 ? 'cuadra' : 'diferencia';
    // Equivalente en USD con el TC DE LA FECHA DE CORTE (nunca uno posterior).
    const tcCorte = g.moneda === 'USD' ? { factor: 1, tc: 1, origen: 'usd', estimado: false }
      : infoTC({ moneda: g.moneda, tc_flujo: (g.creditos[0] || {}).tc_flujo, tc_flujo_fecha: (g.creditos[0] || {}).tc_flujo_fecha }, tcData, corte);
    return { clave, ...g, corte, informado: inf, app, capitalInformado: capInf, diferencia: dif, diferenciaExacta: difExacta, tolerancia: tol,
      estado, motivos, tcCorte, capitalUSD: tcCorte ? r2(app.capital * tcCorte.factor) : null };
  }).sort((a, b) => a.empresa.localeCompare(b.empresa) || a.acreedor.localeCompare(b.acreedor));
}

// ═══════════════════════════════════════════════════════════════════
// SALDOS AL CORTE — misma regla para Análisis CFO, Saldo por Mes y cierres
// ═══════════════════════════════════════════════════════════════════
// corte = hoy  → toda la deuda confirmada pendiente (incluye vencidas impagas).
// corte > hoy  → proyección: cuotas con fecha > corte (supone que lo que vence
//                hasta el corte se paga, como el flujo).
// Capital identificado y cuotas sin clasificar SIEMPRE por separado. Por
// conciliar aparte. Sin TC: se lista en su moneda y el total es incompleto.
// USD con el TC de cada crédito (_tc); si alguno usa TC declarado → estimado.
export function saldosAlCorte(creditos, corte, hoy = hoyISO()) {
  const porEmpresa = {}; const sinTC = []; const valorizacion = {};
  let estimado = false, desactualizado = false, ufHipotesis = false;
  (creditos || []).filter(c => c && !esAnulado(c)).forEach(c => {
    const e = porEmpresa[c.empresa] || (porEmpresa[c.empresa] = { capital: 0, sinClasificar: 0, porConciliar: 0, proyeccion: 0, porRevisar: 0 });
    const fBase = factorUSD(c);
    let cap = 0, sd = 0, pc = 0, capUSD = 0, sdUSD = 0, pcUSD = 0;
    // Deuda vigente al corte (fuente única con el informe): la regla de renovaciones se aplica
    // a la fecha de ESTE corte; lo que no rige o está por revisar va aparte (solo capital).
    estadoCreditoAlCorte(c, corte, hoy).vencimientos.forEach(v => {
      if (fBase !== null && (v.proyeccion || v.porRevisar) && !(corte > hoy && v.fecha <= corte)) {
        const fv = factorVencimiento(c, v.fecha < hoy ? hoy : v.fecha);
        if (fv !== null) { e.proyeccion += ((v.proyeccion && v.proyeccion.capital) || 0) * fv; e.porRevisar += ((v.porRevisar && v.porRevisar.capital) || 0) * fv; }
      }
      if (!(v.pendienteTotal > 0)) return;
      if (v.porConciliar) { pc += v.pendienteTotal; if (fBase !== null) pcUSD += v.pendienteTotal * factorVencimiento(c, hoy); return; }
      if (corte > hoy && v.fecha <= corte) return;
      const f = fBase === null ? null : factorVencimiento(c, v.fecha < hoy ? hoy : v.fecha);
      // Interés capitalizado en una renovación: antes de su fecha sigue siendo interés, no capital.
      const capV = v.pendiente.capital - capitalizadoNoVigenteAl(v, corte);
      cap += capV; sd += v.pendiente.sinDesglose;
      if (f !== null) { capUSD += capV * f; sdUSD += v.pendiente.sinDesglose * f;
        if (c._tc && c._tc.porFecha && v.fecha > hoy) { const u = c._tc.porFecha(v.fecha); if (!u || u.hipotesis) ufHipotesis = true; } }
    });
    if (fBase === null) { if (cap + sd + pc > EPS) sinTC.push({ empresa: c.empresa, acreedor: c.acreedor, moneda: c.moneda || 'USD', capital: r2(cap), sinClasificar: r2(sd), porConciliar: r2(pc) }); return; }
    e.capital += capUSD; e.sinClasificar += sdUSD; e.porConciliar += pcUSD;
    if (c._tc && c._tc.origen !== 'usd' && (capUSD + sdUSD + pcUSD) > EPS) {
      if (c._tc.estimado) estimado = true;
      if (c._tc.desactualizado) desactualizado = true;
      const uf = typeof c._tc.porFecha === 'function' ? c._tc.porFecha(c._tc.corte || hoy) : null;
      valorizacion[`${c.moneda}|${c._tc.tc}|${c._tc.fecha}|${c._tc.fuente}`] = { moneda: c.moneda, tc: c._tc.tc, fecha: c._tc.fecha, fuente: c._tc.fuente,
        estimado: !!c._tc.estimado, desactualizado: !!c._tc.desactualizado, antiguedadDias: c._tc.antiguedadDias,
        ...(uf ? { ufCLP: uf.ufCLP, ufFecha: uf.ufFecha, ufFuente: uf.ufFuente, usdCLP: uf.usdCLP } : {}) };
    }
  });
  const K = ['capital', 'sinClasificar', 'porConciliar', 'proyeccion', 'porRevisar'];
  Object.values(porEmpresa).forEach(x => { K.forEach(k => { x[k] = r2(x[k]); }); });
  const tot = Object.fromEntries(K.map(k => [k, r2(Object.values(porEmpresa).reduce((a, x) => a + x[k], 0))]));
  return { corte, porEmpresa, total: tot,
    sinTC, incompleto: sinTC.length > 0, estimado, desactualizado, ufHipotesis, valorizacion: Object.values(valorizacion) };
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
  // Con una renovación que extiende capital, el saldo está repartido entre el
  // vencimiento original y las cuotas de la renovación: el simulador no lo cubre.
  if (c && c.renovable && planRenovaciones(c).porRen.some(t => t && t.aplicada && t.renovado > 0)) {
    return { error: 'Este crédito tiene una renovación confirmada que extiende capital: el simulador de prepago no la cubre. Registra el pago anticipado como pago de las cuotas que correspondan.' };
  }
  const vencs = aplicarPagos(c, vencimientosCredito(c), hoy).vencimientos.filter(v => v.origen === 'cuota');
  // Cuotas con vencimiento hasta la fecha del prepago aún impagas: se
  // regularizan junto con el prepago. Las "por conciliar" se informan aparte
  // (no se suman al desembolso porque no está probado que se deban).
  const previasImpagas = vencs.filter(v => v.fecha <= fecha && v.pendienteTotal > 0);
  const vencidosImpagos = r2(previasImpagas.filter(v => !v.porConciliar).reduce((s, v) => s + v.pendienteTotal, 0));
  const porConciliarPrevio = r2(previasImpagas.filter(v => v.porConciliar).reduce((s, v) => s + v.pendienteTotal, 0));
  if (porConciliarPrevio > EPS) avisos.push(`Hay ${porConciliarPrevio} ${c.moneda || 'USD'} en cuotas anteriores por conciliar: no se suman al desembolso hasta confirmar si están impagas.`);
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
  if (tc.variable) hipotesis.push(`Tasa variable: devengado e intereses futuros son una PROYECCIÓN con ${tc.origen}, supuesta constante hasta el vencimiento.`);
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
    fecha, esTotal, capital: r2(capital), saldoCapital: saldoCap, devengado, desde, comision, vencidosImpagos, porConciliarPrevio,
    diasDevengados: isoValida(desde) ? diasEntre(desde, fecha) : null, comisionTipo: comTipo, comisionValor: comVal,
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
