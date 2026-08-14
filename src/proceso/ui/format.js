/* eslint-disable */
// src/proceso/ui/format.js — ÚNICA fuente canónica de normalización de nombres
// y formateo de datos visibles de Allegria Service. Idempotente, testeable,
// centralizada. NO usar text-transform:capitalize. Neutral (sin Frisku).

// ── Acrónimos / sufijos legales con casing canónico (clave = sin puntos, lower) ─
const ACRONIMOS = {
  spa: "SpA", sa: "S.A.", sac: "SAC", sas: "SAS", ltda: "Ltda.", ltd: "Ltd.",
  eirl: "E.I.R.L.", srl: "S.R.L.", gmbh: "GmbH", llc: "LLC", inc: "Inc.",
  corp: "Corp.", co: "Co.", plc: "PLC", bv: "B.V.", nv: "N.V.",
  qc: "QC", pt: "PT", iq: "IQ", iqf: "IQF", sag: "SAG", usda: "USDA",
};
// Conectores en minúscula (salvo primera palabra).
const CONECTORES = new Set(["de", "del", "la", "las", "los", "el", "y", "e", "en", "con", "a", "da", "do", "van", "von"]);

function tituloPalabra(w) {
  if (!w) return w;
  // respeta guiones y apóstrofes internos (Rio-Blanco, D'Agen)
  return w.split(/([-'])/).map((part) => {
    if (part === "-" || part === "'") return part;
    if (!part) return part;
    return part.charAt(0).toLocaleUpperCase("es") + part.slice(1).toLocaleLowerCase("es");
  }).join("");
}

// Normaliza un nombre a forma de presentación consistente. Idempotente.
// Regla: Title Case por palabra, acrónimos/sufijos canónicos, conectores en
// minúscula (no la 1ª), espacios colapsados. NO inserta/quita acentos (preserva
// lo escrito) ni corrige ortografía.
export function normalizarNombre(s) {
  if (s == null) return s;
  const limpio = String(s).replace(/\s+/g, " ").trim();
  if (!limpio) return "";
  const palabras = limpio.split(" ");
  return palabras.map((w, i) => {
    const clave = w.toLocaleLowerCase("es").replace(/\./g, "");
    if (ACRONIMOS[clave]) return ACRONIMOS[clave];
    if (i > 0 && CONECTORES.has(w.toLocaleLowerCase("es"))) return w.toLocaleLowerCase("es");
    return tituloPalabra(w);
  }).join(" ");
}

// Clave de comparación para deduplicar (case/acento/puntuación-insensible).
export function claveNormalizada(s) {
  return String(s || "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")   // quita acentos
    .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
export function sonMismaEntidad(a, b) {
  return !!a && !!b && claveNormalizada(a) === claveNormalizada(b);
}

// Distancia de edición (Levenshtein) sobre clave normalizada.
function levenshtein(a, b) {
  const m = a.length, n = b.length; if (!m) return n; if (!n) return m;
  const d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++)
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[m][n];
}
// Sugerencia conservadora "¿quisiste decir…?" — NO auto-corrige.
// Devuelve el candidato más cercano si la similitud es alta pero no idéntico.
export function sugerenciaCercana(nombre, candidatos = [], umbral = 0.82) {
  const k = claveNormalizada(nombre); if (!k) return null;
  const tk = new Set(k.split(" ").filter(Boolean));
  let best = null, bestSim = 0;
  for (const c of candidatos) {
    const ck = claveNormalizada(c && c.nombre != null ? c.nombre : c);
    if (!ck || ck === k) continue;
    const levSim = 1 - levenshtein(k, ck) / Math.max(k.length, ck.length);
    // solapamiento de tokens: tokens compartidos / mínimo (captura sufijos legales)
    const tc = new Set(ck.split(" ").filter(Boolean));
    let shared = 0; tk.forEach((t) => { if (tc.has(t)) shared++; });
    const tokSim = shared >= 2 ? shared / Math.min(tk.size, tc.size) : 0;
    const sim = Math.max(levSim, tokSim);
    if (sim > bestSim) { bestSim = sim; best = c; }
  }
  return bestSim >= umbral ? { candidato: best, similitud: Math.round(bestSim * 100) / 100 } : null;
}

// ── Formateo de datos visibles (números conservan precisión; solo presentación) ─
const nf = (min = 0, max = 0) => new Intl.NumberFormat("es-CL", { minimumFractionDigits: min, maximumFractionDigits: max });
export function formatNum(n, dec = 0) { return n == null || n === "" ? "—" : nf(dec, dec).format(Number(n)); }
export function formatKg(n) { return n == null || n === "" ? "—" : `${nf(0, 1).format(Number(n))} kg`; }
export function formatPct(fraccion, dec = 1) { return fraccion == null || fraccion === "" ? "—" : `${(Number(fraccion) * 100).toFixed(dec).replace(".", ",")}%`; }
export function formatMoneda(n, moneda = "USD") { return n == null || n === "" ? "—" : `${moneda} ${nf(0, 2).format(Number(n))}`; }

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
function toDate(d) { if (!d) return null; const x = d instanceof Date ? d : new Date(d); return isNaN(x.getTime()) ? null : x; }
const p2 = (n) => String(n).padStart(2, "0");
// Fecha corta estándar Chile: dd-mm-yyyy.
export function formatFecha(d) { const x = toDate(d); return x ? `${p2(x.getDate())}-${p2(x.getMonth() + 1)}-${x.getFullYear()}` : "—"; }
// Fecha larga: "14 ago 2026".
export function formatFechaLarga(d) { const x = toDate(d); return x ? `${x.getDate()} ${MESES[x.getMonth()]} ${x.getFullYear()}` : "—"; }
// Fecha+hora: dd-mm-yyyy HH:MM.
export function formatFechaHora(d) { const x = toDate(d); return x ? `${formatFecha(x)} ${p2(x.getHours())}:${p2(x.getMinutes())}` : "—"; }
