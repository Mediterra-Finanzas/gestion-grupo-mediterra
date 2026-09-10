/* Los 23 contratos de PRODUCCION evaluados en lectura. Identificadores enmascarados. */
import { readFileSync, writeFileSync } from "node:fs";
import crypto from "node:crypto";
const RAIZ = "C:/Users/angel/Documents/Proyectos/gestion-grupo-mediterra";
const W = RAIZ + "/.claude/worktrees/wt-respaldo-prod";
const t = readFileSync(RAIZ + "/.env.osiris-prod-readonly.local", "utf8");
const G = (k) => t.match(new RegExp("^" + k + "=(.*)$", "m"))[1].trim();
const U = G("OSIRIS_PROD_SUPABASE_URL"), K = G("OSIRIS_PROD_SUPABASE_ANON_KEY_LEGACY");
const [fila] = await (await fetch(`${U}/rest/v1/calendario_data?id=eq.osiris&select=value,updated_at`,
  { headers: { apikey: K, Authorization: "Bearer " + K } })).json();
const M = await import("file:///" + W + "/src/ux/coberturaContratos.js");
const r = M.evaluarContratos(fila.value);
const h = (s) => "…" + crypto.createHash("sha256").update(String(s)).digest("hex").slice(0, 5);
const E = { pendiente_confirmado: "PEND-CONF", cerrado_con_evidencia: "CERRADO", no_aplicable: "N/A", informacion_pendiente: "INFO-PEND", conflicto: "CONFLICTO" };

console.log("== COBERTURA DE CONTRATOS · PRODUCCION (lectura, fila osiris actualizada " + String(fila.updated_at).slice(0, 16) + ") ==");
console.log("contrato  firmado  RESUMEN     | Contract Fee        | Royalty Planta (cuotas)      | Royalty Comercial");
for (const c of r.contratos) {
  const [cf, rp, rc] = c.conceptos;
  console.log(h(c.contratoId) + "   " + (c.firmado ? "si" : "no").padEnd(7) + "  " + E[c.clase].padEnd(10) + "  | " +
    E[cf.clase].padEnd(10) + String(cf.importe || "").padStart(7) + "  | " +
    E[rp.clase].padEnd(10) + ("(" + (rp.cuotas || 0) + ")").padEnd(5) + String(rp.motivo || "").slice(0, 14).padEnd(14) + " | " +
    E[rc.clase].padEnd(10) + " " + String(rc.motivo || "").slice(0, 40));
}
console.log();
console.log("CONTEOS (no se mezclan):");
for (const [k, v] of Object.entries(r.conteos)) console.log("  " + k.padEnd(22) + v);
console.log();
console.log("CONTRATOS POR CLASE (resumen por precedencia):");
let s = 0;
for (const [k, v] of Object.entries(r.porClase)) { console.log("  " + (M.ETIQUETA[k] || k).padEnd(24) + v); s += v; }
console.log("  " + "suma".padEnd(24) + s);
console.log();
console.log("LINEAS POR CONCEPTO:");
for (const [k, v] of Object.entries(r.porConcepto)) console.log("  " + k.padEnd(18) + Object.entries(v).map(([c, n]) => E[c] + "=" + n).join("  "));
console.log();
console.log("CONTRACT FEE · importes contractuales (no son deuda confirmada):");
for (const [k, v] of Object.entries(r.contractFee)) console.log("  " + k.padEnd(26) + (typeof v === "number" && k !== "noAplicable" ? "USD " + v.toLocaleString("es-CL") : v));
const tot = r.contractFee.pendienteConfirmado + r.contractFee.pendienteDeConciliacion + r.contractFee.cerradoConEvidencia + r.contractFee.enConflicto;
const bruto = fila.value.contratos.reduce((a, c) => a + (Number(c.montoContractFee) || 0), 0);
console.log("  cuadre: " + [r.contractFee.pendienteConfirmado, r.contractFee.pendienteDeConciliacion, r.contractFee.cerradoConEvidencia, r.contractFee.enConflicto]
  .map((x) => x.toLocaleString("es-CL")).join(" + ") + " = " + tot.toLocaleString("es-CL") + " · suma bruta de montoContractFee = " + bruto.toLocaleString("es-CL") +
  " · " + (tot === bruto ? "CUADRA" : "NO CUADRA"));
const cfCerrados = r.contratos.map((c) => c.conceptos[0]).filter((l) => l.clase === "cerrado_con_evidencia");
console.log("  cerrados con fecha de pago: " + cfCerrados.filter((l) => l.evidencia.fechaPago).length + " de " + cfCerrados.length);
writeFileSync(process.env.SP + "/cobertura23.json", JSON.stringify(r, null, 1));
