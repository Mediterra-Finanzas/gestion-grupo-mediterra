/* Osiris Fase 0 — Snapshot & Data Integrity Manifest generator (READ ONLY)
 *
 * - NO escribe en Supabase. Solo hace un GET de la fila `osiris`.
 * - Lee SUPA_URL / SUPA_KEY (anon) desde src/OsirisModule.jsx para no duplicar
 *   la key en este script ni exponerla en otro lugar del repo.
 * - Escribe:
 *     docs/osiris-fase0/snapshots/osiris-snapshot-<label>.json   (JSON completo, GITIGNORED)
 *     docs/osiris-fase0/snapshots/manifest-<label>.json          (counts + sha256 + size, COMMITEADO)
 *
 * Uso:  node scripts/osiris-fase0-snapshot.mjs before
 *       node scripts/osiris-fase0-snapshot.mjs after
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";

const label = (process.argv[2] || "before").replace(/[^a-z0-9_-]/gi, "");

// ── Leer credenciales anon desde el propio módulo (no re-hardcodear) ──
const src = readFileSync("src/OsirisModule.jsx", "utf8");
const url = src.match(/SUPA_URL\s*=\s*"([^"]+)"/)?.[1];
const key = src.match(/SUPA_KEY\s*=\s*"([^"]+)"/)?.[1];
if (!url || !key) { console.error("No pude leer SUPA_URL/SUPA_KEY de src/OsirisModule.jsx"); process.exit(1); }

const res = await fetch(`${url}/rest/v1/calendario_data?id=eq.osiris&select=value,updated_at`, {
  headers: { apikey: key, Authorization: `Bearer ${key}` },
});
const rows = await res.json();
if (!rows?.[0]) { console.error("Fila `osiris` no encontrada."); process.exit(1); }

const value = typeof rows[0].value === "string" ? JSON.parse(rows[0].value) : rows[0].value;
// Serialización canónica (claves ordenadas) para que el hash sea estable/reproducible.
const canonical = JSON.stringify(sortDeep(value));
const sha256 = createHash("sha256").update(canonical).digest("hex");
const bytes = Buffer.byteLength(canonical, "utf8");

// ── Conteos: arrays de nivel superior + estructuras anidadas relevantes ──
const counts = {};
for (const k of Object.keys(value).sort()) {
  const v = value[k];
  counts[k] = Array.isArray(v) ? v.length : (v && typeof v === "object" ? `object(${Object.keys(v).length})` : v);
}
const ct = value.contratos || [];
const nested = {
  plantaciones: sum(ct, c => (c.plantaciones || []).length),
  oc_cliente: sum(ct, c => (c.ordenesCompra || []).length),
  facturasRP_contrato: sum(ct, c => (c.ordenesCompra || []).reduce((a, o) => a + (o.facturasRP || []).length, 0)),
  facturasRP_contrato_top: sum(ct, c => (c.facturasRP || []).length),
  rpPlantaCuotas: sum(ct, c => (c.rpPlantaCuotas || []).length),
  rcCohortes: sum(ct, c => (c.rcCohortes || []).length),
  sublicenciatarios: sum(ct, c => (c.sublicenciatarios || []).length),
};
const obt = value.obtentores || [];
Object.assign(nested, {
  obt_especies: sum(obt, o => (o.especies || []).length),
  obt_pbr: sum(obt, o => (o.pbr || []).length),
  obt_anexos: sum(obt, o => (o.anexos || []).length),
  obt_participacionIngresos: sum(obt, o => (o.participacionIngresos || []).length),
  obt_dhe: sum(obt, o => (o.especies || []).reduce((a, e) => a + (e.dhe || []).length, 0)),
});
const viv = value.viveros || [];
Object.assign(nested, {
  viv_variedades: sum(viv, v => (v.variedades || []).length),
  viv_oc: sum(viv, v => (v.ordenesCompra || []).length),
  viv_despachos: sum(viv, v => (v.ordenesCompra || []).reduce((a, o) => a + (o.despachos || []).length, 0)),
  viv_cuotas: sum(viv, v => (v.ordenesCompra || []).reduce((a, o) => a + (o.cuotas || []).length, 0)),
  viv_anexos: sum(viv, v => (v.anexos || []).length),
});
const op = value.opTecnica || {};
const opCounts = {};
for (const k of Object.keys(op)) opCounts[k] = Array.isArray(op[k]) ? op[k].length : typeof op[k];

let commit = "";
try { commit = execSync("git rev-parse HEAD").toString().trim(); } catch {}

const manifest = {
  label,
  generatedAt: new Date().toISOString(),
  supabaseUpdatedAt: rows[0].updated_at,
  repoCommit: commit,
  bytes,
  sizeKB: Math.round(bytes / 1024),
  sha256,
  topLevelCounts: counts,
  nestedCounts: nested,
  opTecnicaCounts: opCounts,
};

const base = "docs/osiris-fase0/snapshots";
writeFileSync(`${base}/osiris-snapshot-${label}.json`, canonical);
writeFileSync(`${base}/manifest-${label}.json`, JSON.stringify(manifest, null, 2));
console.log(JSON.stringify(manifest, null, 2));

function sum(arr, fn) { return (arr || []).reduce((a, x) => a + fn(x), 0); }
function sortDeep(x) {
  if (Array.isArray(x)) return x.map(sortDeep);
  if (x && typeof x === "object") {
    const o = {};
    for (const k of Object.keys(x).sort()) o[k] = sortDeep(x[k]);
    return o;
  }
  return x;
}
