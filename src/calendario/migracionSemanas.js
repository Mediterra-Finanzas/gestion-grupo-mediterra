/* eslint-disable */
// ═══════════════════════════════════════════════════════════════════
// PROPUESTA de migración de las claves semanales de "Datos reales por semana"
// (realData[empresa][mes][claveSemana]) para los 11 meses cuya etiqueta está
// desfasada una semana (ver scripts/calendario/diagnostico.mjs).
//
// NO se ejecuta en la app: es una función pura con su inversa, para revisar el
// plan con datos reales (copia) antes de decidir.
//   · Preserva importes: mueve el objeto completo de una clave a la nueva.
//   · No duplica: el cambio de claves es una biyección dentro de cada mes y se
//     arma de una sola vez (no hay escritura encadenada S22→S23→S24).
//   · Reversible: revertir(aplicar(x)) === x; el registro guarda el mapa usado.
//   · Lo que no calza (clave fuera del mapa o destino ya ocupado por otra clave
//     que no se mueve) queda como CONFLICTO y no se toca.
// Los valores semanales del flujo (vals "mes_semana", _semN) se guardan por
// POSICIÓN (S1..S4), no por etiqueta: no se migran.
// ═══════════════════════════════════════════════════════════════════

export const MAPA_SEMANAS = {
  "Jun-26": { S22: "S23", S23: "S24", S24: "S25", S25: "S26" },
  "Nov-26": { S44: "S45", S45: "S46", S46: "S47", S47: "S48" },
  "Dec-26": { S48: "S49", S49: "S50", S50: "S51", S51: "S52" },
  "Feb-27": { S05: "S06", S06: "S07", S07: "S08", S08: "S09" },
  "Mar-27": { S09: "S10", S10: "S11", S11: "S12", S12: "S13" },
  "Apr-27": { S13: "S14", S14: "S15", S15: "S16", S16: "S17" },
  "May-27": { S17: "S18", S18: "S19", S19: "S20", S20: "S21" },
  "Jun-27": { S21: "S23", S22: "S24", S23: "S25", S24: "S26" },
  "Aug-27": { S31: "S32", S32: "S33", S33: "S34", S34: "S35" },
  "Nov-27": { S44: "S45", S45: "S46", S46: "S47", S47: "S48" },
  "Dec-27": { S48: "S49", S49: "S50", S50: "S51", S51: "S52" },
};

const esSemana = (v) => v && typeof v === "object" && !Array.isArray(v);
const total = (sd) => Object.values(sd || {}).reduce((a, sv) => a + (esSemana(sv) ? Object.values(sv).reduce((b, x) => b + (Number(x) || 0), 0) : 0), 0);

// Plan sin escribir nada: qué clave se mueve a cuál, por empresa y mes.
export function planMigracionSemanas(realData, mapa = MAPA_SEMANAS) {
  const movimientos = [], conflictos = [];
  Object.entries(realData || {}).forEach(([emp, porMes]) => {
    if (!porMes || typeof porMes !== "object") return;
    Object.entries(mapa).forEach(([mes, m]) => {
      const sd = porMes[mes]; if (!sd || typeof sd !== "object") return;
      const origenes = Object.keys(sd).filter(k => esSemana(sd[k]) && m[k]);
      origenes.forEach(k => {
        const destino = m[k];
        // destino ocupado por una clave que NO se mueve → conflicto
        if (sd[destino] !== undefined && !m[destino]) conflictos.push({ empresa: emp, mes, de: k, a: destino, motivo: "destino ocupado por una clave que no se mueve" });
        else movimientos.push({ empresa: emp, mes, de: k, a: destino, lineas: Object.keys(sd[k]).length, monto: total({ x: sd[k] }) });
      });
      // clave que no estaba en la tabla original del mes: no se mueve y se informa
      Object.keys(sd).filter(k => esSemana(sd[k]) && !m[k])
        .forEach(k => conflictos.push({ empresa: emp, mes, de: k, a: null, motivo: "clave fuera del mapa: se deja igual" }));
    });
  });
  return { movimientos, conflictos };
}

function moverMes(sd, m) {
  const out = {};
  Object.entries(sd).forEach(([k, v]) => { if (!(esSemana(v) && m[k])) out[k] = v; });       // lo que no se mueve
  Object.entries(sd).forEach(([k, v]) => { if (esSemana(v) && m[k]) {
    const d = m[k]; if (out[d] !== undefined) throw new Error(`conflicto en ${d}`); out[d] = v; } });
  return out;
}

// Devuelve una COPIA migrada + registro (para guardar junto al dato y poder revertir).
export function aplicarMigracionSemanas(realData, mapa = MAPA_SEMANAS, { usuario = "", ahora = new Date() } = {}) {
  const plan = planMigracionSemanas(realData, mapa);
  if (plan.conflictos.some(c => c.a)) throw new Error("Hay conflictos: revisar el plan antes de aplicar");
  // Claves fuera del mapa se conservan tal cual; si alguna coincide con un destino, moverMes lo detecta.
  const copia = JSON.parse(JSON.stringify(realData || {}));
  Object.entries(copia).forEach(([emp, porMes]) => {
    if (!porMes || typeof porMes !== "object") return;
    Object.entries(mapa).forEach(([mes, m]) => { if (porMes[mes] && typeof porMes[mes] === "object") porMes[mes] = moverMes(porMes[mes], m); });
  });
  return { realData: copia, registro: { tipo: "migracion_semanas_v1", mapa, movimientos: plan.movimientos, usuario, ts: ahora.toISOString() } };
}

export function revertirMigracionSemanas(realData, registro) {
  const inverso = Object.fromEntries(Object.entries(registro.mapa).map(([mes, m]) => [mes, Object.fromEntries(Object.entries(m).map(([a, b]) => [b, a]))]));
  return aplicarMigracionSemanas(realData, inverso).realData;
}

export const totalRealMes = (realData, emp, mes) => total(realData?.[emp]?.[mes]);
