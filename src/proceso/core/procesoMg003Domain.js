/* eslint-disable */
// src/proceso/core/procesoMg003Domain.js
// MG-003 — Pesajes de recepción. LÓGICA PURA (sin red). Espeja las invariantes del
// schema_proc_v11_mg003_pesajes.sql para testear offline y reutilizar en DB/UI.
//
// INVARIANTE DURA:  PESADA ≠ BIN ≠ LOTE.
//   · Una PESADA contiene 1..N BINS (nunca 1 pesada = 1 bin).
//   · NUNCA hay reparto automático de kilos entre bins (nada de 50/50). El kg del bin
//     es null hasta que se mide o se reparte EXPLÍCITAMENTE (repartirBins con método).
//   · La masa física de la pesada (peso_neto) es autoridad a nivel de pesada.
//   · Mass balance = comparar Σ bins medidos contra el neto de la pesada, SIN fabricar kg.

// Redondeo a 3 decimales (kg) evitando ruido de float (mismo criterio que procesoDomain.kg3).
export function kg3(n) {
  return Math.round((Number(n) || 0) * 1000) / 1000;
}

// Métodos de reparto (decisión funcional abierta (a); default NO reparte).
export const METODOS_REPARTO = ["sin_reparto", "manual", "prorrateo_tara", "prorrateo_capacidad"];
export const REPARTO_DEFAULT = "sin_reparto";

// neto del EVENTO de pesada: bruto − tara (derivación; la DB es la autoridad final).
export function netoPesada({ peso_bruto, tara } = {}) {
  const b = Number(peso_bruto) || 0, t = Number(tara) || 0;
  return kg3(b - t);
}

// Validación de la pesada. `confirmar=true` exige neto físico > 0 (espejo del trigger).
export function validarPesada(p = {}, { confirmar = false } = {}) {
  const err = [];
  const b = p.peso_bruto, t = p.tara, n = p.peso_neto;
  const bn = Number(b), tn = Number(t), nn = Number(n);
  if (b != null && b !== "" && (Number.isNaN(bn) || bn < 0)) err.push("Peso bruto inválido.");
  if (t != null && t !== "" && (Number.isNaN(tn) || tn < 0)) err.push("Tara inválida.");
  if (n != null && n !== "" && (Number.isNaN(nn) || nn < 0)) err.push("Peso neto inválido.");
  // neto no puede exceder el bruto físico.
  if (b != null && b !== "" && n != null && n !== "" && !Number.isNaN(bn) && !Number.isNaN(nn) && nn > bn) {
    err.push("El peso neto no puede exceder el bruto.");
  }
  // consistencia neto = bruto − tara cuando los tres están presentes (captura bruto_tara).
  if ((p.captura == null || p.captura === "bruto_tara") &&
      b != null && b !== "" && t != null && t !== "" && n != null && n !== "" &&
      !Number.isNaN(bn) && !Number.isNaN(tn) && !Number.isNaN(nn)) {
    if (Math.abs(kg3(bn - tn) - nn) > 0.001) err.push("El neto no cuadra con bruto − tara.");
  }
  const netoEfectivo = (n != null && n !== "" && !Number.isNaN(nn)) ? nn : netoPesada({ peso_bruto: b, tara: t });
  if (confirmar && !(netoEfectivo > 0)) err.push("No se puede confirmar una pesada sin peso neto > 0.");
  return { ok: err.length === 0, errores: err, neto: kg3(netoEfectivo) };
}

// neto individual de un bin (derivación; null si falta bruto).
export function netoBin({ peso_bruto, tara_envase } = {}) {
  if (peso_bruto == null || peso_bruto === "") return null;
  const b = Number(peso_bruto) || 0, t = Number(tara_envase) || 0;
  return kg3(b - t);
}

// Validación de los bins de una pesada. INVARIANTE 1..N: exige al menos 1 bin.
export function validarBins(bins = []) {
  const err = [];
  const arr = Array.isArray(bins) ? bins : [];
  if (arr.length < 1) err.push("La pesada debe tener al menos 1 bin.");
  arr.forEach((b, i) => {
    const ne = Number(b.n_envases == null ? 1 : b.n_envases);
    if (!(ne > 0)) err.push(`Bin ${i + 1}: n_envases debe ser > 0.`);
    const pb = b.peso_bruto, pn = b.peso_neto;
    if (pb != null && pb !== "" && Number(pb) < 0) err.push(`Bin ${i + 1}: bruto inválido.`);
    if (pn != null && pn !== "" && Number(pn) < 0) err.push(`Bin ${i + 1}: neto inválido.`);
    if (pb != null && pb !== "" && pn != null && pn !== "" && Number(pn) > Number(pb)) {
      err.push(`Bin ${i + 1}: el neto no puede exceder el bruto.`);
    }
  });
  return { ok: err.length === 0, errores: err, n: arr.length };
}

// Un bin se considera "medido" si tiene peso_neto informado (no null/"").
export function binMedido(b = {}) {
  return b.peso_neto != null && b.peso_neto !== "" && !Number.isNaN(Number(b.peso_neto));
}

// Conciliación PESADA ↔ BINS (mass balance a nivel de pesada). NO fabrica kg.
//   · sumNetoBins  = Σ neto de los bins MEDIDOS (los sin peso no suman)
//   · binsSinPeso  = cuántos bins no tienen kg (esperado con metodo 'sin_reparto')
//   · diferencia   = neto de la pesada − Σ bins medidos
//   · conteoOk     = n_bins_declarado (si se informó) coincide con el nº real de bins
//   · estado       = 'cuadra' | 'descuadra' | 'parcial' (parcial = hay bins sin peso)
export function conciliarPesadaBins(pesada = {}, bins = [], toleranciaPct = 0.5) {
  const arr = (Array.isArray(bins) ? bins : []).filter((b) => (b.estado || "recibido") !== "anulado");
  const medidos = arr.filter(binMedido);
  const sumNetoBins = kg3(medidos.reduce((a, b) => a + (Number(b.peso_neto) || 0), 0));
  const netoP = pesada.peso_neto != null && pesada.peso_neto !== ""
    ? kg3(Number(pesada.peso_neto)) : netoPesada(pesada);
  const diferencia = kg3(netoP - sumNetoBins);
  const tolerancia = kg3((netoP * (Number(toleranciaPct) || 0)) / 100);
  const binsSinPeso = arr.length - medidos.length;
  const conteoOk = pesada.n_bins_declarado == null || pesada.n_bins_declarado === ""
    ? true : Number(pesada.n_bins_declarado) === arr.length;
  let estado;
  if (binsSinPeso > 0) estado = "parcial";
  else estado = Math.abs(diferencia) <= tolerancia ? "cuadra" : "descuadra";
  return {
    netoPesada: netoP, sumNetoBins, binsTotal: arr.length, binsMedidos: medidos.length,
    binsSinPeso, diferencia, tolerancia, conteoOk, estado,
    ok: estado === "cuadra" && conteoOk,
  };
}

// Reparto EXPLÍCITO de kilos entre bins (decisión (a)). NUNCA se llama solo: la UI/DB lo
// invoca a pedido del operador. Con 'sin_reparto' devuelve los bins TAL CUAL (no toca kg).
// Devuelve una copia; marca origen_peso='repartido' en los bins afectados.
export function repartirBins(pesada = {}, bins = [], metodo = REPARTO_DEFAULT) {
  const arr = (Array.isArray(bins) ? bins : []).map((b) => ({ ...b }));
  if (metodo === "sin_reparto" || !metodo) return arr;               // NO auto-split
  if (!METODOS_REPARTO.includes(metodo)) throw new Error(`método de reparto desconocido: ${metodo}`);
  const activos = arr.filter((b) => (b.estado || "recibido") !== "anulado");
  const netoP = pesada.peso_neto != null && pesada.peso_neto !== ""
    ? kg3(Number(pesada.peso_neto)) : netoPesada(pesada);
  if (!(netoP > 0) || activos.length === 0) return arr;

  let pesos;
  if (metodo === "prorrateo_tara") {
    const taras = activos.map((b) => Number(b.tara_envase) || 0);
    const tot = taras.reduce((a, x) => a + x, 0);
    pesos = tot > 0 ? taras.map((x) => x / tot) : activos.map(() => 1 / activos.length);
  } else if (metodo === "prorrateo_capacidad") {
    const caps = activos.map((b) => Number(b.n_envases) || 1);
    const tot = caps.reduce((a, x) => a + x, 0);
    pesos = caps.map((x) => x / tot);
  } else { // 'manual' → base equitativa como punto de partida editable
    pesos = activos.map(() => 1 / activos.length);
  }
  // Reparto con cuadre exacto: el último bin absorbe el residuo de redondeo.
  let acumulado = 0;
  activos.forEach((b, i) => {
    let kg;
    if (i < activos.length - 1) { kg = kg3(netoP * pesos[i]); acumulado = kg3(acumulado + kg); }
    else { kg = kg3(netoP - acumulado); }
    b.peso_neto = kg;
    b.origen_peso = "repartido";
  });
  return arr;
}

// Mass balance a nivel de RECEPCIÓN: Σ neto de pesadas vs kg_neto de cabecera.
export function massBalanceRecepcion(kgNetoCabecera, pesadas = [], toleranciaPct = 0.5) {
  const arr = (Array.isArray(pesadas) ? pesadas : []).filter((p) => (p.estado || "borrador") !== "anulada");
  const sumNetoPesadas = kg3(arr.reduce((a, p) => {
    const n = p.peso_neto != null && p.peso_neto !== "" ? Number(p.peso_neto) : netoPesada(p);
    return a + (Number(n) || 0);
  }, 0));
  const neto = Number(kgNetoCabecera) || 0;
  const diferencia = kg3(neto - sumNetoPesadas);
  const tolerancia = kg3((neto * (Number(toleranciaPct) || 0)) / 100);
  return {
    kgNetoCabecera: kg3(neto), sumNetoPesadas, pesadas: arr.length, diferencia, tolerancia,
    ok: neto > 0 ? Math.abs(diferencia) <= tolerancia : sumNetoPesadas === 0,
  };
}

// Resumen de bins por propiedad de envase / condición (para KPIs de devolución de totes).
export function resumenBins(bins = []) {
  const arr = (Array.isArray(bins) ? bins : []).filter((b) => (b.estado || "recibido") !== "anulado");
  const cuenta = (fn) => arr.filter(fn).length;
  return {
    total: arr.length,
    propios: cuenta((b) => (b.envase_propiedad || "propio") === "propio"),
    terceros: cuenta((b) => b.envase_propiedad === "terceros"),
    cliente: cuenta((b) => b.envase_propiedad === "cliente"),
    dañados: cuenta((b) => b.condicion === "dañado"),
    asignadosLote: cuenta((b) => !!b.lote_id),
    sinPeso: cuenta((b) => !binMedido(b)),
    kgNeto: kg3(arr.reduce((a, b) => a + (Number(b.peso_neto) || 0), 0)),
  };
}
