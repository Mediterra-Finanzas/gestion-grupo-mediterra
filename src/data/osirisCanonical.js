/* eslint-disable */
// src/data/osirisCanonical.js — T3.5
// Utilidades puras para comparación canónica + motor económico congelado (Fase 0).
// Sin dependencias de DB. Deterministas. Usadas por shadow-compare y por los tests.

// Orden estable de claves (para hash independiente del orden de propiedades).
export function sortKeys(o) {
  return Array.isArray(o) ? o.map(sortKeys)
    : (o && typeof o === "object"
        ? Object.fromEntries(Object.keys(o).sort().map(k => [k, sortKeys(o[k])]))
        : o);
}

export function canonicalJSON(o) { return JSON.stringify(sortKeys(o)); }

// Hash determinista sync (cyrb53) — suficiente para detectar igualdad/mismatch canónico.
export function canonicalHash(o) {
  const str = canonicalJSON(o);
  let h1 = 0xdeadbeef ^ 0, h2 = 0x41c6ce57 ^ 0;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const n = 4294967296 * (2097151 & h2) + (h1 >>> 0);
  return n.toString(16).padStart(14, "0");
}

// Conteos de negocio del blob.
export function blobCounts(o) {
  const b = o || {};
  const contratos = b.contratos || [];
  return {
    clientes: (b.clientes || []).length,
    especies: (b.especies || []).length,
    variedades: (b.variedades || []).length,
    obtentores: (b.obtentores || []).length,
    viveros: (b.viveros || []).length,
    contratos: contratos.length,
    plantaciones: contratos.reduce((a, c) => a + (c.plantaciones || []).length, 0),
    ocCliente: contratos.reduce((a, c) => a + (c.ordenesCompra || []).length, 0),
    pbr: (b.obtentores || []).reduce((a, ob) => a + (ob.pbr || []).length, 0),
  };
}

// Motor económico congelado (reglas Fase 0): RP / RC / Fee Entrada / IQ (participación).
export function econ4(o) {
  const b = o || {};
  const pct = p => /chile/i.test(p || "") ? 1 : 0.85;
  let RP = 0, RC = 0, FE = 0, IQ = 0;
  for (const c of (b.contratos || [])) {
    if (c.tipoContractFee && c.tipoContractFee !== "Sin Contract Fee") FE += Number(c.montoContractFee) || 0;
    const vpp = Number(c.valorRoyaltyPlanta) || 0, vph = Number(c.valorRoyaltyComercial) || 0;
    for (const p of (c.plantaciones || [])) {
      RP += (Number(p.nPlantas) || 0) * vpp;
      if ((p.tipoPlantacion || "Comercial") !== "Prueba") RC += (Number(p.hectareas) || 0) * vph;
    }
  }
  for (const ob of (b.obtentores || [])) for (const r of (ob.participacionIngresos || [])) IQ += Number(r.valor) || 0;
  const r2 = n => Math.round(n * 100) / 100;
  return { RP: r2(RP), RC: r2(RC), FE: r2(FE), IQ: r2(IQ) };
}

// Comparación económica: devuelve deltas y si todos son 0.
export function econDelta(a, b) {
  const ea = econ4(a), eb = econ4(b);
  const d = { RP: +(eb.RP - ea.RP).toFixed(2), RC: +(eb.RC - ea.RC).toFixed(2), FE: +(eb.FE - ea.FE).toFixed(2), IQ: +(eb.IQ - ea.IQ).toFixed(2) };
  d.allZero = d.RP === 0 && d.RC === 0 && d.FE === 0 && d.IQ === 0;
  return d;
}
