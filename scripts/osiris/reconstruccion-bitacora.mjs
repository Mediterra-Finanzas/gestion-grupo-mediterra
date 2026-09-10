/* RECONSTRUCCION AISLADA desde la bitacora, en memoria. Nada se escribe en ninguna base.
 *
 * Pregunta: con el estado ACTUAL de produccion y los eventos de la bitacora, ¿se
 * puede reconstruir el estado de los contratos de Osiris en el instante T de un
 * snapshot independiente, y volver desde T hasta hoy sin perder los cambios
 * posteriores?
 *
 * Tres comprobaciones, y ninguna se declara PASS si no se mide:
 *   INTEGRIDAD  cadena por (contrato, campo): el valor actual coincide con el
 *               valorNuevo del ultimo evento, y cada valorAnterior coincide con el
 *               valorNuevo del evento previo. Una rotura es un cambio no registrado
 *               o un valor cortado.
 *   COBERTURA   estado reconstruido en T vs snapshot real en T, campo por campo.
 *   CONSERVACION desde el estado en T, aplicar los eventos posteriores y comparar
 *               con el estado actual.
 * La bitacora serializa con String() y corta a 200 caracteres: la comparacion
 * usa esa misma serializacion, y un valor cortado cuenta como NO reconstruible. */
import { readFileSync } from "node:fs";
const RAIZ = "C:/Users/angel/Documents/Proyectos/gestion-grupo-mediterra";
const t = readFileSync(RAIZ + "/.env.osiris-prod-readonly.local", "utf8");
const G = (k) => t.match(new RegExp("^" + k + "=(.*)$", "m"))[1].trim();
const U = G("OSIRIS_PROD_SUPABASE_URL"), K = G("OSIRIS_PROD_SUPABASE_ANON_KEY_LEGACY");
const H = { apikey: K, Authorization: "Bearer " + K };
const leer = async (id) => (await (await fetch(`${U}/rest/v1/calendario_data?id=eq.${id}&select=value,updated_at`, { headers: H })).json())[0];

const cargarSnapshot = (ruta) => {
  const j = JSON.parse(readFileSync(ruta, "utf8"));
  const fila = Array.isArray(j) ? j.find((x) => x.id === "osiris") : j.id === "osiris" ? j : null;
  const value = fila ? fila.value : j.value || j;
  const updated = fila ? fila.updated_at : j.updated_at;
  return { value, updated_at: updated };
};
const etiqueta = process.argv[2] || "after";
const snap = cargarSnapshot(`${RAIZ}/docs/osiris-fase0/snapshots/osiris-snapshot-${etiqueta}.json`);
const manifest = JSON.parse(readFileSync(`${RAIZ}/docs/osiris-fase0/snapshots/manifest-${etiqueta}.json`, "utf8"));
// El snapshot se tomo el 2026-08-12 (generatedAt), pero la fila no cambiaba desde
// supabaseUpdatedAt. El estado vale para todo ese intervalo; T es el instante de toma.
const T = manifest.generatedAt;
const T0 = manifest.supabaseUpdatedAt;

const actual = await leer("osiris");
const ev = (await leer("audit_log")).value.eventos
  .filter((e) => e.modulo === "osiris" && e.seccion === "Contratos" && e.accion === "editar" && e.registroId && e.campo)
  .map((e, i) => ({ ...e, _i: i }))
  .sort((a, b) => String(a.timestamp).localeCompare(String(b.timestamp)) || a._i - b._i);

const ser = (x) => (x !== null && typeof x === "object" ? JSON.stringify(x) : String(x || ""));
const cortado = (s) => String(s).length === 200;
const porCt = (v) => new Map((v.contratos || []).map((c) => [String(c.id), c]));
const ahora = porCt(actual.value), enT = porCt(snap.value);

console.log("== RECONSTRUCCION AISLADA · osiris / Contratos ==");
console.log("snapshot independiente: " + etiqueta + " · instante T = " + T);
console.log("la fila no habia cambiado desde " + T0 + " (supabaseUpdatedAt del manifiesto)");
console.log("sha256 del snapshot segun manifiesto: " + String(manifest.sha256).slice(0, 12) + "…");
console.log("estado actual: fila osiris " + String(actual.updated_at).slice(0, 19));
const enIntervalo = ev.filter((e) => String(e.timestamp) > String(T0) && String(e.timestamp) <= String(T));
console.log("eventos de contratos DENTRO del intervalo sin cambios [" + String(T0).slice(0, 10) + ", " + String(T).slice(0, 10) + "]: " + enIntervalo.length +
            (enIntervalo.length ? "  <- contradice que la fila no cambio: bitacora o snapshot inconsistentes" : "  (coherente)"));
const posteriores = ev.filter((e) => String(e.timestamp) > String(T));
console.log("eventos de edicion de contratos: " + ev.length + " · posteriores a T: " + posteriores.length);
console.log();

// 1 · INTEGRIDAD de la cadena, sobre los eventos posteriores a T
const grupos = new Map();
for (const e of posteriores) { const k = e.registroId + "|" + e.campo; if (!grupos.has(k)) grupos.set(k, []); grupos.get(k).push(e); }
let enlacesOk = 0, enlacesRotos = 0, porCorte = 0, extremoOk = 0, extremoRoto = 0, contratoBorrado = 0;
const rotos = [];
for (const [k, lista] of grupos) {
  const [rid, campo] = k.split("|");
  for (let i = 1; i < lista.length; i++) {
    const a = lista[i - 1].valorNuevo, b = lista[i].valorAnterior;
    if (cortado(a) || cortado(b)) { porCorte++; continue; }
    if (a === b) enlacesOk++; else { enlacesRotos++; if (rotos.length < 6) rotos.push(campo + " (enlace interno)"); }
  }
  const ct = ahora.get(rid);
  if (!ct) { contratoBorrado++; continue; }
  const ult = lista[lista.length - 1].valorNuevo;
  if (cortado(ult)) { porCorte++; continue; }
  if (ser(ct[campo]).slice(0, 200) === ult) extremoOk++; else { extremoRoto++; if (rotos.length < 12) rotos.push(campo + " (actual != ultimo valorNuevo)"); }
}
console.log("INTEGRIDAD (cadena despues de T)");
console.log("  enlaces entre eventos consecutivos: ok=" + enlacesOk + " rotos=" + enlacesRotos);
console.log("  ultimo evento vs valor actual:      ok=" + extremoOk + " rotos=" + extremoRoto);
console.log("  no verificables por corte a 200:    " + porCorte);
console.log("  grupos sobre contratos ya borrados: " + contratoBorrado);
if (rotos.length) console.log("  muestra de roturas: " + rotos.join(" · "));
console.log();

// 2 · RETROCESO: estado actual -> T, aplicando valorAnterior del primer evento posterior a T
const reconst = new Map([...ahora].map(([id, c]) => [id, JSON.parse(JSON.stringify(c))]));
let aplicados = 0, noReconst = 0;
const tocados = new Set();
for (const [k, lista] of grupos) {
  const [rid, campo] = k.split("|");
  const ct = reconst.get(rid);
  if (!ct) continue;
  const primero = lista[0];
  tocados.add(k);
  if (cortado(primero.valorAnterior)) { noReconst++; ct[campo] = { __noReconstruible: true }; continue; }
  ct[campo] = primero.valorAnterior; aplicados++;
}

// 3 · COBERTURA: reconstruido vs snapshot real en T, campo por campo
let iguales = 0, distintos = 0, noRec = 0, noEnSnap = 0;
const diffs = {};
for (const [id, ctT] of enT) {
  const r = reconst.get(id);
  if (!r) { noEnSnap++; continue; }
  for (const campo of new Set([...Object.keys(ctT), ...Object.keys(r)])) {
    const vr = r[campo];
    if (vr && vr.__noReconstruible) { noRec++; continue; }
    const esperado = ser(ctT[campo]).slice(0, 200);
    const obtenido = tocados.has(id + "|" + campo) ? String(vr) : ser(vr).slice(0, 200);
    if (esperado === obtenido) iguales++;
    else { distintos++; diffs[campo] = (diffs[campo] || 0) + 1; }
  }
}
const contratosT = enT.size, contratosHoy = ahora.size;
console.log("COBERTURA (reconstruido en T vs snapshot real en T)");
console.log("  contratos en T: " + contratosT + " · hoy: " + contratosHoy + " · presentes en T y ausentes hoy: " + noEnSnap);
console.log("  campos iguales: " + iguales + " · distintos: " + distintos + " · no reconstruibles por corte: " + noRec);
if (distintos) console.log("  campos que no cuadran: " + Object.entries(diffs).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([c, n]) => c + "=" + n).join(", "));
console.log();

// 4 · CONSERVACION: desde el estado en T, aplicar los eventos posteriores y comparar con hoy
let conservados = 0, perdidos = 0, cortadosFwd = 0;
for (const [k, lista] of grupos) {
  const [rid, campo] = k.split("|");
  if (!ahora.get(rid)) continue;
  const final = lista[lista.length - 1].valorNuevo;
  if (cortado(final)) { cortadosFwd++; continue; }
  if (ser(ahora.get(rid)[campo]).slice(0, 200) === final) conservados++; else perdidos++;
}
console.log("CONSERVACION DE CAMBIOS POSTERIORES (replay T -> hoy)");
console.log("  campos que vuelven exactamente al valor de hoy: " + conservados + " · no vuelven: " + perdidos + " · no verificables por corte: " + cortadosFwd);
console.log();
const probada = enlacesRotos === 0 && extremoRoto === 0 && distintos === 0 && noRec === 0 && perdidos === 0 && porCorte === 0 && cortadosFwd === 0;
console.log("VEREDICTO: " + (probada ? "RECUPERACION PROBADA para osiris/Contratos entre T y hoy"
  : "RECUPERACION NO PROBADA · la bitacora queda como EVIDENCIA DISPONIBLE, con los limites medidos arriba"));
