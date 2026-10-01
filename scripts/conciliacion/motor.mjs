/* ─────────────────────────────────────────────────────────────────────────
   Motor para aplicar la conciliación de Créditos exportada desde la vista
   previa local (conciliacion_creditos_<fecha>.json) sobre el estado VIGENTE
   de una base PostgREST/Supabase, operación por operación.

   No sabe de red: recibe las filas leídas ({ id: { existe, valor, enc,
   updated_at } }) y devuelve clasificación, valores nuevos y verificación.
   La escritura atómica la hace aplicar.mjs con el transporte.

   Clases de una operación (ensayo):
     aplicable            el dato está como en el respaldo → se puede aplicar
     ya_aplicada          producción ya tiene exactamente ese resultado
     conflicto            el dato cambió en producción después del respaldo
     posible_duplicado    en producción hay algo posterior que puede ser lo mismo:
                          requiere decisión individual (aplicar u omitir) con motivo
     no_encontrada        no se ubica el crédito / pago / línea / fila
     no_aplicable         QUITADO_* / modificar_* / tipo desconocido: solo alerta
     bloqueada            depende de una operación que no se aplica (se dice cuál)
   En la aplicación además:
     pendiente_decision   posible duplicado sin decisión → no se aplica
     omitida              posible duplicado con decisión "omitir"
     no_aprobada          aplicable que no está en la lista aprobada
   ───────────────────────────────────────────────────────────────────────── */
import crypto from 'crypto';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const VPDiff = require('../vista-previa/diff.js');

export const UMBRAL_DIAS_RESPALDO = 7;
export const FORMATO_RESULTADO = 'mediterra-conciliacion-creditos-v1';
export const FORMATO_DECISIONES = 'mediterra-conciliacion-decisiones-v1';

const OK_DEP = new Set(['aplicable', 'ya_aplicada', 'aprobada']);   // estados que no bloquean a sus dependientes

// ── utilidades ─────────────────────────────────────────────────────────
export const sha256 = (txt) => crypto.createHash('sha256').update(txt).digest('hex');
const canon = (x) => JSON.stringify(x, (k, v) => (v && typeof v === 'object' && !Array.isArray(v)
  ? Object.keys(v).sort().reduce((o, kk) => { o[kk] = v[kk]; return o; }, {}) : v));
const igual = (a, b) => canon(a) === canon(b);
const clon = (x) => (x === undefined ? undefined : JSON.parse(JSON.stringify(x)));
const vigente = (x) => x && !x.anulado;
const totalPago = (p) => Math.round(((+p.capital || 0) + (+p.interes || 0) + (+p.cargos || 0) + (+p.sinDesglose || 0)) * 1e4) / 1e4;

export function decodificarFila(fila) {
  if (!fila) return { existe: false, valor: undefined, enc: 'objeto', updated_at: null };
  let v = fila.value, enc = typeof v === 'string' ? 'texto' : 'objeto';
  while (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { break; } }
  return { existe: true, valor: v, enc, updated_at: fila.updated_at || null };
}
export function codificarValor(valor, enc) { return enc === 'texto' ? JSON.stringify(valor) : valor; }

// Fila afectada por cada operación.
export function filaDeOp(o) {
  if (o.op === 'vincular_linea_nomina' || o.op === 'desvincular_linea_nomina') return o.fila;
  if (o.op === 'agregar_tc' || o.op === 'cambiar_tc') return 'maestro_tc';
  return 'finanzas';
}

// Clave estable y legible de cada operación (única dentro del archivo).
export function clavesOps(ops) {
  const usadas = {};
  return ops.map((o) => {
    const sujeto = o.credito || (o.empresa ? 'emp:' + o.empresa : '') || o.fila || o.par || '';
    let obj = o.id || o.campo || (o.clave ? o.clave + '@' + o.mes : '') || (o.nomina ? o.nomina + '/' + o.linea : '') || o.fecha || '';
    if (o.op === 'agregar_historial' || o.op === 'agregar_resolucion_credito') obj = (o.registro && o.registro.id) || sha256(canon(o.registro)).slice(0, 12);
    let k = [o.op, sujeto, obj].filter(Boolean).join('|');
    if (usadas[k]) k += '#' + (++usadas[k]); else usadas[k] = 1;
    return k;
  });
}

// ── Ubicar el crédito en el estado de trabajo ─────────────────────────
// Por uid; si no, por huella entre los créditos sin uid (debe ser única).
function ubicarCredito(lista, o) {
  const i = lista.findIndex((c) => c && c.uid === o.credito);
  if (i >= 0) return { i };
  if (!o.huella) return { error: 'no_encontrada', motivo: `No existe un crédito con uid ${o.credito}.` };
  const cand = [];
  lista.forEach((c, j) => { if (c && igual(VPDiff.huella(c), o.huella)) cand.push(j); });
  const sinUid = cand.filter((j) => !lista[j].uid);
  if (sinUid.length === 1) return { i: sinUid[0], fijarUid: true };
  if (sinUid.length > 1) return { error: 'no_encontrada', motivo: `La huella calza con ${sinUid.length} créditos sin uid: no es única.` };
  if (cand.length) return { error: 'conflicto', motivo: `El crédito existe en producción con otro uid (${cand.map((j) => lista[j].uid).join(', ')}); las claves de cuota no coincidirían.` };
  return { error: 'no_encontrada', motivo: 'No se encontró el crédito ni por uid ni por huella.' };
}

// Créditos de la referencia exportada (respaldo + cambios de la vista previa), por uid.
function referenciaPorUid(resultado) {
  const m = {};
  VPDiff.conUids((resultado.referencia && resultado.referencia.creditos_data) || []).forEach((x) => { if (x) m[x.uid] = x.c; });
  return m;
}
const idsDe = (arr) => new Set((arr || []).filter(Boolean).map((x) => x.id));

// ── Dependencias y grupos ─────────────────────────────────────────────
export function dependencias(ops, claves) {
  const dep = ops.map(() => new Set());
  const grupo = ops.map(() => null);
  const idx = (pred) => ops.map((o, i) => (pred(o) ? i : -1)).filter((i) => i >= 0);
  ops.forEach((o, i) => {
    const mismoCredito = (p) => p.credito && p.credito === o.credito;
    // todo lo de un crédito nuevo depende de su alta
    if (o.credito && o.op !== 'agregar_credito') idx((p) => p.op === 'agregar_credito' && p.credito === o.credito).forEach((j) => dep[i].add(j));
    if (o.op === 'anular_pago') idx((p) => p.op === 'agregar_pago' && mismoCredito(p) && p.id === o.id).forEach((j) => dep[i].add(j));
    if (o.op === 'agregar_pago' || o.op === 'anular_pago') {
      const reg = o.registro || o.despues || {};
      if (reg.grupo && reg.grupo !== o.id) idx((p) => /^(agregar|anular)_pago$/.test(p.op) && mismoCredito(p) && p.id === reg.grupo && p.op === o.op).forEach((j) => dep[i].add(j));
      const clave = reg.origen && reg.origen.clave;
      const m = clave && /^nomina:([^:]+):(.+)$/.exec(clave);
      if (m) idx((p) => p.op === 'vincular_linea_nomina' && p.nomina === m[1] && String(p.linea) === m[2]).forEach((j) => dep[i].add(j));
    }
    if (o.op === 'agregar_prepago' || o.op === 'anular_prepago') {
      const pagoId = (o.registro || o.despues || {}).pagoId;
      const tipoPago = o.op === 'agregar_prepago' ? 'agregar_pago' : 'anular_pago';
      idx((p) => p.op === tipoPago && mismoCredito(p) && p.id === pagoId).forEach((j) => dep[i].add(j));
    }
    if (o.op === 'anular_conciliacion') idx((p) => p.op === 'agregar_conciliacion' && mismoCredito(p) && p.id === o.id).forEach((j) => dep[i].add(j));
    if (o.op === 'anular_saldo_informado') idx((p) => p.op === 'agregar_saldo_informado' && p.id === o.id).forEach((j) => dep[i].add(j));
    if (o.op === 'agregar_cobertura' && o.registro) idx((p) => p.op === 'anular_cobertura' && p.empresa === o.empresa && p.despues && p.despues.linea === o.registro.linea && p.despues.idx === o.registro.idx).forEach((j) => dep[i].add(j));
    if (o.op === 'anular_cobertura') idx((p) => p.op === 'agregar_cobertura' && p.empresa === o.empresa && p.id === o.id).forEach((j) => dep[i].add(j));
    // anular el crédito exige que sus pagos ya estén anulados
    if (o.op === 'cambiar_campo' && o.campo === 'anulado' && o.despues) idx((p) => p.op === 'anular_pago' && mismoCredito(p)).forEach((j) => dep[i].add(j));
    // vínculo de nómina: depende de que el crédito exista/se ubique
    if (/^(vincular|desvincular)_linea_nomina$/.test(o.op)) {
      const uid = (o.despues || o.antes || {}).uid;
      idx((p) => p.op === 'agregar_credito' && p.credito === uid).forEach((j) => dep[i].add(j));
    }
    // historial: depende de la operación que describe (o, si no se reconoce, de todas las de su crédito)
    if (o.op === 'agregar_historial') {
      const h = o.registro || {}; const det = String(h.detalle || '');
      const delCredito = idx((p) => mismoCredito(p) && p.op !== 'agregar_historial');
      let esp = [];
      if (h.accion === 'pago' || h.accion === 'prepago') esp = delCredito.filter((j) => ops[j].op === 'agregar_pago' && ops[j].registro && det.startsWith(`${ops[j].registro.fecha} · `));
      else if (h.accion === 'anula_pago') esp = delCredito.filter((j) => ops[j].op === 'anular_pago' && ops[j].despues && det.startsWith(`${ops[j].despues.fecha} · `) && det.endsWith(` · ${ops[j].motivo}`));
      else if (h.accion === 'conciliación') esp = delCredito.filter((j) => ops[j].op === 'agregar_conciliacion' && ops[j].registro && det.startsWith(ops[j].registro.vencKey + ' '));
      else if (h.accion === 'anula_conciliación') esp = delCredito.filter((j) => ops[j].op === 'anular_conciliacion' && det.startsWith(ops[j].id + ' '));
      (esp.length ? esp : delCredito).forEach((j) => dep[i].add(j));
    }
    // grupos que se guardan juntos en la app (todo o nada)
    if (o.op === 'agregar_resolucion_credito' && o.registro) grupo[i] = `rv|${o.empresa}|${o.registro.idx}`;
    if (o.op === 'cambiar_valor_manual' || o.op === 'retirar_valor_manual') grupo[i] = `rv|${o.empresa}|${o.mes}`;
    if (o.op === 'agregar_cobertura' && o.registro) grupo[i] = `cb|${o.empresa}|${o.registro.linea}|${o.registro.idx}`;
    if (o.op === 'anular_cobertura' && o.despues && o.despues.motivoAnulacion === 'reemplazada') grupo[i] = `cb|${o.empresa}|${o.despues.linea}|${o.despues.idx}`;
  });
  return { dep, grupo };
}

// ── Clasificar y aplicar UNA operación sobre el estado de trabajo ──────
// est = { finanzas, maestro_tc, nominas_*: valores decodificados (se mutan al aplicar) }
// Devuelve { clase, motivo, detalle?, aplicar?: () => void }
function evaluar(o, est, ctx) {
  const F = est.finanzas;
  const clase = (c, motivo, extra) => Object.assign({ clase: c, motivo }, extra || {});
  if (/^(QUITADO_|modificar_)/.test(o.op)) return clase('no_aplicable', o.alerta || 'Cambio no expresable como operación segura: revisar a mano.');

  // ── créditos ──
  if (o.credito) {
    if (!F || !Array.isArray(F.creditos_data)) return clase('no_encontrada', 'La fila finanzas no tiene creditos_data.');
    const lista = F.creditos_data;
    if (o.op === 'agregar_credito') {
      const ex = lista.find((c) => c && c.uid === o.credito);
      if (ex) return igual(ex, o.registro) ? clase('ya_aplicada', 'El crédito ya existe igual.') : clase('conflicto', 'Ya existe un crédito con ese uid y distinto contenido.', { produccion: ex });
      const h = VPDiff.huella(o.registro);
      const parecidos = lista.filter((c) => c && igual(VPDiff.huella(c), h));
      if (parecidos.length) return clase('posible_duplicado', `Hay ${parecidos.length} crédito(s) en producción con la misma huella.`, { produccion: parecidos });
      return clase('aplicable', 'Crédito nuevo.', { aplicar: () => lista.push(clon(o.registro)) });
    }
    const u = ubicarCredito(lista, o);
    if (u.error) return clase(u.error, u.motivo);
    const c = lista[u.i];
    const conUid = (fn) => () => { if (u.fijarUid) c.uid = o.credito; fn(); };
    const extraUid = u.fijarUid ? { fijaUid: o.credito } : {};
    const ref = ctx.ref[o.credito] || {};
    const posteriores = (campo) => (c[campo] || []).filter((x) => vigente(x) && !idsDe(ref[campo]).has(x.id) && !ctx.aplicadosAhora.has(campo + ':' + x.id));

    if (o.op === 'agregar_pago' || o.op === 'agregar_prepago' || o.op === 'agregar_conciliacion') {
      const campo = { agregar_pago: 'pagos', agregar_prepago: 'prepagos', agregar_conciliacion: 'conciliaciones' }[o.op];
      const arr = c[campo] || [];
      const ex = arr.find((x) => x && x.id === o.id);
      if (ex) return igual(ex, o.registro) ? clase('ya_aplicada', 'Ya existe con el mismo id y contenido.', extraUid) : clase('conflicto', 'Existe un registro con el mismo id y distinto contenido.', { produccion: ex });
      if (c.anulado && !o.registro.anulado) return clase('conflicto', 'El crédito está anulado en producción.');
      const reg = o.registro;
      const add = conUid(() => { c[campo] = [...(c[campo] || []), clon(reg)]; ctx.aplicadosAhora.add(campo + ':' + reg.id); });
      if (o.op === 'agregar_pago') {
        const clave = reg.origen && reg.origen.clave;
        if (clave) {
          const mismo = (c.pagos || []).filter((p) => vigente(p) && p.origen && p.origen.clave === clave);
          if (mismo.length) return clase('conflicto', `Ya hay un pago vigente con el mismo origen (${clave}): la app no admite dos.`, { produccion: mismo });
        }
        if (!reg.anulado) {
          const pos = posteriores('pagos').filter((p) => (reg.vencKey && p.vencKey === reg.vencKey) || (p.fecha === reg.fecha && totalPago(p) === totalPago(reg)));
          if (pos.length) return clase('posible_duplicado', `En producción se registró después del respaldo ${pos.length} pago(s) vigente(s) en la misma cuota o con la misma fecha y monto.`, { produccion: pos, aplicar: add, ...extraUid });
          if (reg.vencKey) {
            const imp = posteriores('conciliaciones').filter((x) => x.vencKey === reg.vencKey);
            if (imp.length) return clase('conflicto', 'En producción esa cuota se confirmó impaga después del respaldo.', { produccion: imp });
          }
        }
      }
      if (o.op === 'agregar_prepago' && !(c.pagos || []).some((p) => p && p.id === reg.pagoId)) return clase('no_encontrada', `No existe el pago ${reg.pagoId} del prepago.`);
      if (o.op === 'agregar_conciliacion' && !reg.anulado) {
        const pagos = (c.pagos || []).filter((p) => vigente(p) && p.vencKey === reg.vencKey);
        if (pagos.length) return clase('conflicto', 'En producción hay un pago vigente para esa cuota.', { produccion: pagos });
        const otra = (c.conciliaciones || []).filter((x) => vigente(x) && x.vencKey === reg.vencKey);
        if (otra.length) return clase('posible_duplicado', 'En producción esa cuota ya está confirmada impaga con otro registro.', { produccion: otra, aplicar: add, ...extraUid });
      }
      return clase('aplicable', '', { aplicar: add, ...extraUid });
    }
    if (o.op === 'anular_pago' || o.op === 'anular_prepago' || o.op === 'anular_conciliacion') {
      const campo = { anular_pago: 'pagos', anular_prepago: 'prepagos', anular_conciliacion: 'conciliaciones' }[o.op];
      const arr = c[campo] || [];
      const k = arr.findIndex((x) => x && x.id === o.id);
      if (k < 0) return clase('no_encontrada', `No existe ${o.id} en producción.`);
      const act = arr[k];
      if (igual(act, o.despues)) return clase('ya_aplicada', 'Ya está anulado con el mismo motivo.', extraUid);
      if (act.anulado) return clase('ya_aplicada', `Ya estaba anulado en producción (motivo: "${act.motivoAnulacion || ''}"); no se reescribe.`, { observacion: true, produccion: act });
      if (!igual(act, o.antes)) return clase('conflicto', 'El registro cambió en producción después del respaldo.', { produccion: act });
      return clase('aplicable', '', { aplicar: conUid(() => { c[campo] = arr.map((x, j) => (j === k ? clon(o.despues) : x)); }), ...extraUid });
    }
    if (o.op === 'agregar_historial') {
      if ((c.historial || []).some((h) => igual(h, o.registro))) return clase('ya_aplicada', 'La entrada ya está en la bitácora.');
      return clase('aplicable', '', { aplicar: conUid(() => { c.historial = [...(c.historial || []), clon(o.registro)]; }), ...extraUid });
    }
    if (o.op === 'cambiar_campo') {
      if (igual(c[o.campo], o.despues)) return clase('ya_aplicada', `${o.campo} ya tiene el valor nuevo.`, extraUid);
      if (!igual(c[o.campo], o.antes)) return clase('conflicto', `${o.campo} cambió en producción después del respaldo.`, { produccion: c[o.campo] });
      if (o.campo === 'anulado' && o.despues && (c.pagos || []).some(vigente)) return clase('conflicto', 'No se puede anular un crédito con pagos vigentes.');
      return clase('aplicable', '', { aplicar: conUid(() => { if (o.despues === undefined) delete c[o.campo]; else c[o.campo] = clon(o.despues); }), ...extraUid });
    }
    return clase('no_aplicable', `Operación ${o.op} no soportada.`);
  }

  // ── saldos informados / configuración ──
  if (o.op === 'agregar_saldo_informado' || o.op === 'anular_saldo_informado') {
    if (!F) return clase('no_encontrada', 'No existe la fila finanzas.');
    const arr = F.creditos_saldos_informados || [];
    const k = arr.findIndex((x) => x && x.id === o.id);
    if (o.op === 'agregar_saldo_informado') {
      if (k >= 0) return igual(arr[k], o.registro) ? clase('ya_aplicada', 'Ya existe igual.') : clase('conflicto', 'Existe con el mismo id y distinto contenido.', { produccion: arr[k] });
      const add = () => { F.creditos_saldos_informados = [...(F.creditos_saldos_informados || []), clon(o.registro)]; ctx.aplicadosAhora.add('si:' + o.id); };
      const r = o.registro, refIds = idsDe(ctx.resultado.referencia && ctx.resultado.referencia.creditos_saldos_informados);
      const pos = arr.filter((x) => vigente(x) && !refIds.has(x.id) && !ctx.aplicadosAhora.has('si:' + x.id) && x.empresa === r.empresa && x.acreedor === r.acreedor && (x.moneda || 'USD') === (r.moneda || 'USD') && x.fecha === r.fecha);
      if (pos.length) return clase('posible_duplicado', 'En producción se cargó después del respaldo un saldo informado del mismo acreedor, moneda y fecha.', { produccion: pos, aplicar: add });
      return clase('aplicable', '', { aplicar: add });
    }
    if (k < 0) return clase('no_encontrada', `No existe el saldo informado ${o.id}.`);
    if (igual(arr[k], o.despues)) return clase('ya_aplicada', 'Ya está anulado igual.');
    if (arr[k].anulado) return clase('ya_aplicada', 'Ya estaba anulado en producción con otro motivo.', { observacion: true, produccion: arr[k] });
    if (!igual(arr[k], o.antes)) return clase('conflicto', 'Cambió en producción después del respaldo.', { produccion: arr[k] });
    return clase('aplicable', '', { aplicar: () => { F.creditos_saldos_informados = arr.map((x, j) => (j === k ? clon(o.despues) : x)); } });
  }
  if (o.op === 'cambiar_config_creditos') {
    if (!F) return clase('no_encontrada', 'No existe la fila finanzas.');
    if (igual(F.creditos_config, o.despues)) return clase('ya_aplicada', 'La configuración ya es la nueva.');
    if (!igual(F.creditos_config, o.antes)) return clase('conflicto', 'La configuración cambió en producción después del respaldo.', { produccion: F.creditos_config });
    return clase('aplicable', '', { aplicar: () => { F.creditos_config = clon(o.despues); } });
  }

  // ── finanzas_real: coberturas, resoluciones y valores manuales ──
  if (o.empresa && /cobertura|resolucion_credito|valor_manual/.test(o.op)) {
    if (!F) return clase('no_encontrada', 'No existe la fila finanzas.');
    const R = (F.finanzas_real = F.finanzas_real || {});
    const E = R[o.empresa] || {};
    const fijarE = () => { R[o.empresa] = R[o.empresa] || E; return R[o.empresa]; };
    if (o.op === 'agregar_cobertura' || o.op === 'anular_cobertura') {
      const arr = E._coberturasManual || [];
      const k = arr.findIndex((x) => x && x.id === o.id);
      if (o.op === 'agregar_cobertura') {
        if (k >= 0) return igual(arr[k], o.registro) ? clase('ya_aplicada', 'Ya existe igual.') : clase('conflicto', 'Existe con el mismo id y distinto contenido.', { produccion: arr[k] });
        const otra = arr.filter((x) => vigente(x) && x.linea === o.registro.linea && x.idx === o.registro.idx);
        if (otra.length) return clase('conflicto', 'Ya hay una cobertura vigente para esa línea y mes en producción.', { produccion: otra });
        return clase('aplicable', '', { aplicar: () => { const e = fijarE(); e._coberturasManual = [...(e._coberturasManual || []), clon(o.registro)]; } });
      }
      if (k < 0) return clase('no_encontrada', `No existe la cobertura ${o.id}.`);
      if (igual(arr[k], o.despues)) return clase('ya_aplicada', 'Ya está anulada igual.');
      if (arr[k].anulado) return clase('ya_aplicada', 'Ya estaba anulada en producción.', { observacion: true, produccion: arr[k] });
      if (!igual(arr[k], o.antes)) return clase('conflicto', 'Cambió en producción después del respaldo.', { produccion: arr[k] });
      return clase('aplicable', '', { aplicar: () => { const e = fijarE(); e._coberturasManual = arr.map((x, j) => (j === k ? clon(o.despues) : x)); } });
    }
    if (o.op === 'agregar_resolucion_credito') {
      const arr = E._resolucionesCreditos || [];
      if (arr.some((x) => igual(x, o.registro))) return clase('ya_aplicada', 'La decisión ya está registrada.');
      // "otra decisión posterior": registrada después del respaldo (por su ts) para la misma línea y mes
      const fResp = (ctx.resultado.respaldo && ctx.resultado.respaldo.fecha) || '';
      const otra = arr.filter((x) => x && x.linea === o.registro.linea && x.idx === o.registro.idx && (!fResp || String(x.ts || '') > fResp) && !ctx.aplicadosAhora.has('rc:' + x.id));
      if (otra.length) return clase('conflicto', 'En producción se registró otra decisión para esa línea y mes.', { produccion: otra });
      return clase('aplicable', '', { aplicar: () => { const e = fijarE(); e._resolucionesCreditos = [...(e._resolucionesCreditos || []), clon(o.registro)]; ctx.aplicadosAhora.add('rc:' + o.registro.id); } });
    }
    const ov = (E._proyOverrides || {})[o.clave] || {};
    const act = ov[o.mes];
    if (igual(act, o.despues)) return clase('ya_aplicada', 'El valor manual ya es el nuevo.');
    if (!igual(act, o.antes)) return clase('conflicto', 'El valor manual cambió en producción después del respaldo.', { produccion: act });
    return clase('aplicable', '', { aplicar: () => {
      const e = fijarE(); const ovs = (e._proyOverrides = e._proyOverrides || {}); const linea = (ovs[o.clave] = ovs[o.clave] || {});
      if (o.despues === undefined) { delete linea[o.mes]; if (!Object.keys(linea).length) delete ovs[o.clave]; } else linea[o.mes] = clon(o.despues);
    } });
  }

  // ── nóminas ──
  if (/^(vincular|desvincular)_linea_nomina$/.test(o.op)) {
    const N = est[o.fila];
    if (!N) return clase('no_encontrada', `No existe la fila ${o.fila}.`);
    const nom = (N.nominas || []).find((n) => n && n.id === o.nomina);
    const it = nom && (nom.items || []).find((x) => x && String(x.id) === String(o.linea));
    if (!it) return clase('no_encontrada', `No existe la línea ${o.linea} de la nómina ${o.nomina}.`);
    if (igual(it.creditoVinculo, o.despues)) return clase('ya_aplicada', 'El vínculo ya es el nuevo.');
    if (!igual(it.creditoVinculo, o.antes)) return clase('conflicto', 'El vínculo de la línea cambió en producción después del respaldo.', { produccion: it.creditoVinculo });
    if (nom.estadoNomina === 'inactiva' || it.estadoLinea === 'inactiva') return clase('conflicto', 'La nómina o la línea está inactiva en producción.');
    if (o.despues && o.despues.uid) {
      const lista = (F && F.creditos_data) || [];
      if (!lista.some((c) => c && c.uid === o.despues.uid) && !ctx.creditosUbicables.has(o.despues.uid)) return clase('no_encontrada', `El crédito ${o.despues.uid} del vínculo no se ubica en producción.`);
    }
    return clase('aplicable', '', { aplicar: () => { if (o.despues === undefined) delete it.creditoVinculo; else it.creditoVinculo = clon(o.despues); } });
  }

  // ── tipo de cambio ──
  if (o.op === 'agregar_tc' || o.op === 'cambiar_tc') {
    const T = est.maestro_tc;
    if (!T) return clase('no_encontrada', 'No existe la fila maestro_tc.');
    const arr = T[o.par] || [];
    const k = arr.findIndex((e) => e && e.fecha === o.fecha);
    const act = k >= 0 ? arr[k] : undefined;
    if (igual(act, o.despues)) return clase('ya_aplicada', 'El valor ya está.');
    if (!igual(act, o.antes)) return clase('conflicto', act && act.fuente === 'manual' ? 'En producción hay un valor MANUAL para ese par y fecha (prevalece).' : 'El valor de ese par y fecha cambió en producción.', { produccion: act });
    return clase('aplicable', '', { aplicar: () => { T[o.par] = k >= 0 ? arr.map((e, j) => (j === k ? clon(o.despues) : e)) : [...arr, clon(o.despues)]; } });
  }
  return clase('no_aplicable', `Operación ${o.op} no soportada.`);
}

// ── Ensayo / plan ─────────────────────────────────────────────────────
// modo 'ensayo': supone aprobadas todas las aplicables (para ver qué pasaría).
// modo 'aplicar': solo las aprobadas en `decisiones`; los posibles duplicados
// se aplican únicamente con decisión individual "aplicar".
export function planificar(resultado, filas, { decisiones = null, modo = 'ensayo', ahora = new Date() } = {}) {
  if (!resultado || resultado.formato !== FORMATO_RESULTADO) throw new Error('El archivo no es un resultado de conciliación de Créditos (formato desconocido).');
  const ops = resultado.operaciones || [];
  const claves = clavesOps(ops);
  const { dep, grupo } = dependencias(ops, claves);
  const aprobadas = new Set((decisiones && decisiones.aprobadas) || []);
  const decDup = (decisiones && decisiones.duplicados) || {};
  const ref = referenciaPorUid(resultado);
  const bloqueadas = new Map();   // i -> motivo
  // Orden topológico (estable): una operación se evalúa después de aquellas de
  // las que depende. Un ciclo (no debería existir) bloquea a sus miembros.
  const orden = [], pend = ops.map((_, i) => new Set(dep[i])), hecho = new Set();
  while (orden.length < ops.length) {
    const sig = ops.findIndex((_, i) => !hecho.has(i) && [...pend[i]].every((j) => hecho.has(j)));
    if (sig < 0) { ops.forEach((_, i) => { if (!hecho.has(i)) { bloqueadas.set(i, 'Dependencia circular.'); orden.push(i); hecho.add(i); } }); break; }
    orden.push(sig); hecho.add(sig);
  }
  let items, est;

  // Itera hasta un punto fijo: lo bloqueado no se aplica en la simulación, lo
  // que cambia la clasificación de lo que viene después.
  for (let vuelta = 0; vuelta < ops.length + 2; vuelta++) {
    est = {};
    Object.keys(filas).forEach((id) => { if (filas[id].existe) est[id] = clon(filas[id].valor); });
    const ctx = { ref, resultado, aplicadosAhora: new Set(), creditosUbicables: new Set() };
    ops.forEach((o) => { if (o.credito && est.finanzas && Array.isArray(est.finanzas.creditos_data) && !ubicarCredito(est.finanzas.creditos_data, o).error) ctx.creditosUbicables.add(o.credito); });
    items = ops.map((o, i) => ({ i, clave: claves[i], op: o.op, fila: filaDeOp(o), etiqueta: o.etiqueta || o.empresa || o.par || o.fila || '', depende: [...dep[i]].map((j) => claves[j]), grupo: grupo[i] }));
    orden.forEach((i) => {
      const o = ops[i], it = items[i];
      if (bloqueadas.has(i)) { it.clase = 'bloqueada'; it.motivo = bloqueadas.get(i); it.estado = 'bloqueada'; return; }
      const malDep = [...dep[i]].find((j) => !OK_DEP.has(items[j].estado));
      if (malDep !== undefined) { it.clase = 'bloqueada'; it.motivo = `Depende de ${claves[malDep]} (${items[malDep].estado}).`; it.estado = 'bloqueada'; return; }
      const r = evaluar(o, est, ctx);
      it.clase = r.clase; it.motivo = r.motivo;
      if (r.produccion !== undefined) it.produccion = r.produccion;
      if (r.observacion) it.observacion = true;
      if (r.fijaUid) it.fijaUid = r.fijaUid;
      // estado efectivo (lo que pasa con la operación en este modo)
      let estado = r.clase;
      if (r.clase === 'aplicable' && modo === 'aplicar' && !aprobadas.has(it.clave)) estado = 'no_aprobada';
      if (r.clase === 'posible_duplicado') {
        const d = decDup[it.clave];
        if (d && d.decision === 'aplicar' && String(d.motivo || '').trim()) estado = 'aprobada';
        else if (d && d.decision === 'omitir' && String(d.motivo || '').trim()) estado = 'omitida';
        else estado = 'pendiente_decision';
        if (d) it.decision = d;
        if (estado === 'aprobada' && modo === 'aplicar' && !aprobadas.has(it.clave)) estado = 'no_aprobada';
      }
      it.estado = estado;
      if ((estado === 'aplicable' || estado === 'aprobada') && r.aplicar) { r.aplicar(); it.seAplica = true; }
    });
    // grupos: si un miembro no queda bien, se bloquean los demás
    let cambio = false;
    const porGrupo = {};
    items.forEach((it) => { if (it.grupo) (porGrupo[it.grupo] = porGrupo[it.grupo] || []).push(it); });
    Object.values(porGrupo).forEach((g) => {
      const malo = g.find((it) => !OK_DEP.has(it.estado));
      if (malo) g.forEach((it) => { if (it !== malo && OK_DEP.has(it.estado) && it.estado !== 'ya_aplicada' && !bloqueadas.has(it.i)) { bloqueadas.set(it.i, `Se guarda junto con ${malo.clave} (${malo.estado}).`); cambio = true; } });
    });
    if (!cambio) break;
  }
  items.forEach((it) => { if (it.clase === 'bloqueada') it.estado = 'bloqueada'; });

  // valores nuevos por fila (solo filas que cambian)
  const escrituras = [];
  Object.keys(est).forEach((id) => {
    if (!igual(est[id], filas[id].valor)) escrituras.push({ id, version: filas[id].updated_at, enc: filas[id].enc, valorNuevo: est[id],
      ops: items.filter((it) => it.seAplica && it.fila === id).map((it) => it.clave) });
  });
  // orden: finanzas primero (pagos), luego TC y nóminas (vínculos)
  const ordenFila = (id) => (id === 'finanzas' ? 0 : id === 'maestro_tc' ? 1 : 2);
  escrituras.sort((a, b) => ordenFila(a.id) - ordenFila(b.id) || a.id.localeCompare(b.id));

  const resumen = {};
  items.forEach((it) => { resumen[it.estado] = (resumen[it.estado] || 0) + 1; });
  const fechaResp = resultado.respaldo && resultado.respaldo.fecha;
  const dias = fechaResp ? Math.floor((ahora - new Date(fechaResp)) / 86400000) : null;
  const advertencias = [];
  if (dias === null) advertencias.push('El resultado no trae la fecha del respaldo.');
  else if (dias > UMBRAL_DIAS_RESPALDO) advertencias.push(`El respaldo tiene ${dias} días (umbral de advertencia: ${UMBRAL_DIAS_RESPALDO}). Crecen los conflictos; considera descargar un respaldo nuevo y repetir la conciliación. Igual se comprobó cada operación contra el estado actual.`);
  const filasCambiadas = Object.keys((resultado.respaldo && resultado.respaldo.versionesFilas) || {}).filter((id) => filas[id] && filas[id].existe && filas[id].updated_at !== resultado.respaldo.versionesFilas[id]);
  // cambios registrados en producción después del respaldo en los créditos afectados
  const posteriores = [];
  const F0 = filas.finanzas && filas.finanzas.valor;
  if (F0 && Array.isArray(F0.creditos_data)) {
    const afectados = new Set(ops.filter((o) => o.credito).map((o) => o.credito));
    afectados.forEach((uid) => {
      const o = ops.find((x) => x.credito === uid);
      const u = ubicarCredito(F0.creditos_data, o);
      if (u.error) return;
      const c = F0.creditos_data[u.i], r = ref[uid] || {};
      ['pagos', 'prepagos', 'conciliaciones'].forEach((campo) => (c[campo] || []).forEach((x) => {
        if (x && !idsDe(r[campo]).has(x.id)) posteriores.push({ credito: uid, etiqueta: o.etiqueta, tipo: campo, registro: x });
      }));
    });
  }
  return { items, escrituras, resumen, advertencias, diasRespaldo: dias, filasCambiadasDesdeRespaldo: filasCambiadas, posterioresAlRespaldo: posteriores };
}

// Verificación posterior: cada operación aplicada debe quedar "ya_aplicada" al
// releer, y cada fila escrita debe ser exactamente el valor que se escribió
// (si alguien escribió después, se informa: no es error del script, pero se revisa).
export function verificar(resultado, filasDespues, aplicadas, escritas) {
  const plan = planificar(resultado, filasDespues, { modo: 'ensayo' });
  const porClave = Object.fromEntries(plan.items.map((it) => [it.clave, it]));
  const fallas = [];
  aplicadas.forEach((k) => { const it = porClave[k]; if (!it || it.clase !== 'ya_aplicada') fallas.push(`${k}: al releer quedó "${it ? it.clase : 'sin dato'}"`); });
  const filas = escritas.map((e) => {
    const f = filasDespues[e.id];
    const mismaVersion = f && f.updated_at === e.versionNueva;
    const mismoValor = f && igual(f.valor, e.valorNuevo);
    if (mismaVersion && !mismoValor) fallas.push(`${e.id}: misma versión pero distinto contenido`);
    return { id: e.id, versionEscrita: e.versionNueva, versionLeida: f && f.updated_at, mismoValor, escritaDespuesPorOtro: !!f && !mismaVersion };
  });
  return { ok: fallas.length === 0, fallas, filas, resumenAlReleer: plan.resumen };
}

// Diferencias entre el valor leído y el nuevo de una fila: deben ser SOLO las
// rutas que tocan las operaciones (se usa para comprobar que nada más cambia).
export function rutasCambiadas(antes, despues) {
  const out = [];
  (function rec(a, b, ruta) {
    if (igual(a, b)) return;
    if (a && b && typeof a === 'object' && typeof b === 'object' && Array.isArray(a) === Array.isArray(b)) {
      new Set([...Object.keys(a), ...Object.keys(b)]).forEach((k) => rec(a[k], b[k], ruta ? ruta + '.' + k : k));
      return;
    }
    out.push(ruta || '(fila)');
  })(antes, despues, '');
  return out;
}
