/* eslint-disable */
// ═══════════════════════════════════════════════════════════════════
// EXPEDIENTE DIGITAL DE NÓMINAS — helpers (Fase 1)
// Lógica pura de respaldo documental por línea + documento interno
// intercompañía. Sin React. Reutiliza el Storage privado de friskuHelpers.
// ═══════════════════════════════════════════════════════════════════
import { dbLoadGeneric, dbSaveGeneric } from "./friskuHelpers";

// Secciones del módulo de nóminas que representan movimientos entre
// empresas relacionadas (préstamos / traspasos intercompañía).
const SECCIONES_RELACIONADAS = ["emp_rel_clp", "emp_rel_usd"];

// ¿La línea corresponde a una empresa relacionada? Detección por sección
// (dato estructural ya presente en el item), no por texto.
export function esLineaRelacionada(item) {
  return !!item && SECCIONES_RELACIONADAS.includes(item.seccion);
}

// SHA-256 hex del archivo (integridad silenciosa). Sin dependencias:
// usa Web Crypto. Devuelve null si el entorno no lo soporta.
export async function hashArchivo(file) {
  try {
    if (!file || !crypto?.subtle) return null;
    const buf = await file.arrayBuffer();
    const digest = await crypto.subtle.digest("SHA-256", buf);
    return Array.from(new Uint8Array(digest))
      .map(b => b.toString(16).padStart(2, "0")).join("");
  } catch {
    return null;
  }
}

// Documentos activos de una línea (excluye los soft-deleted).
export function docsActivos(item) {
  return (item?.documentos || []).filter(d => (d?.estado || "activo") === "activo");
}

// Semáforo binario: ¿la línea tiene al menos un respaldo activo?
export function tieneRespaldo(item) {
  return docsActivos(item).length > 0;
}

// Slug de empresa (mismo criterio que slugEmpresaNom de FinanzasModule).
function slugEmpresa(empresa) {
  return String(empresa || "").toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
}

// Sanea el nombre de archivo para la ruta de Storage.
function saneaNombre(nombre) {
  return String(nombre || "archivo")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
}

// Ruta del documento en el bucket privado nominas-docs.
export function pathDocNomina(empresa, nominaId, itemId, docId, filename) {
  return `nominas/${slugEmpresa(empresa)}/${nominaId}/${itemId}/${docId}_${saneaNombre(filename)}`;
}

// Cobertura documental de la nómina.
// Denominador = líneas ACTIVAS con monto distinto de 0 (decisión Angelo:
// las filas sin monto no entran). pct=100 cuando no hay líneas computables.
export function coberturaNomina(nom) {
  const items = Array.isArray(nom?.items) ? nom.items : [];
  const computables = items.filter(it =>
    (it?.estadoLinea || "activa") === "activa" &&
    (Number(it?.montoCLP) || Number(it?.montoUSD) || Number(it?.montoPEN))
  );
  const total = computables.length;
  const conRespaldo = computables.filter(tieneRespaldo).length;
  const sinRespaldo = total - conRespaldo;
  const pct = total ? Math.round((conRespaldo / total) * 100) : 100;
  return { total, conRespaldo, sinRespaldo, pct };
}

// ─── Documento interno intercompañía: correlativo ──────────────────
// Código corto por empresa para el correlativo (DI-{COD}-{AAAA}-{NNNNN}).
const COD_EMPRESA = {
  "Allegria Foods": "ALG", "Allegria Service": "ALS",
  "Frisku Foods": "FRK", "Frisku Foods Perú": "FRP",
  "Allpa Farms": "APA", "Allpa Farms Perú": "APP",
  "Mediterra": "MED", "Integrity Farms": "INT", "Osiris": "OSI",
};
export function codEmpresa(empresa) {
  return COD_EMPRESA[empresa] || (slugEmpresa(empresa).slice(0, 3).toUpperCase() || "GEN");
}

// Asigna el siguiente correlativo interno para (empresa, año), de forma
// atómica best-effort sobre la fila calendario_data id="nominas_correlativos".
// Si la carga del store falla (red/HTTP), la excepción PROPAGA: el caller
// debe abortar la generación del voucher (no inventar un número incorrecto).
export async function siguienteCorrelativo(empresa, año) {
  const store = (await dbLoadGeneric("nominas_correlativos")) || {};
  const key = `DI-${codEmpresa(empresa)}-${año}`;
  const next = (Number(store[key]) || 0) + 1;
  store[key] = next;
  await dbSaveGeneric("nominas_correlativos", store);
  return `${key}-${String(next).padStart(5, "0")}`;
}
