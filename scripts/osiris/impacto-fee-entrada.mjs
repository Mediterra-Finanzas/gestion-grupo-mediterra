/* Impacto de la fuente única de Fee Entrada en los cálculos que consumen feData,
 * medido sobre PRODUCCIÓN en memoria (solo GET). Se evalúa el código REAL de los
 * consumidores, extraído de OsirisModule.jsx, no una réplica escrita a mano.
 * Nada se escribe. Identificadores enmascarados. */
import { readFileSync } from "node:fs";
import crypto from "node:crypto";
const RAIZ = "C:/Users/angel/Documents/Proyectos/gestion-grupo-mediterra";
const WF = RAIZ + "/.claude/worktrees/wt-fee-fuente-unica";
const M = await import("file:///" + WF + "/src/data/feeEntradaCanonica.js");
const src = readFileSync("C:/Users/angel/AppData/Local/Temp/claude/C--Users-angel-Documents-Proyectos-gestion-grupo-mediterra/a7dd1e35-02c6-41bc-b9ee-0b112bf89fe7/scratchpad/OsirisModule-main.jsx", "utf8"); // version de main, sin el parche
const h = (s) => "…" + crypto.createHash("sha256").update(String(s)).digest("hex").slice(0, 5);
const usd = (n) => "USD " + Math.round(n).toLocaleString("es-CL");

function bloque(inicio) {
  const i = src.indexOf(inicio);
  if (i < 0) throw new Error("no encontrado: " + inicio);
  let j = src.indexOf("{", i), prof = 0;
  for (let k = j; k < src.length; k++) {
    if (src[k] === "{") prof++;
    else if (src[k] === "}") { prof--; if (prof === 0) return src.slice(i, k + 1); }
  }
  throw new Error("bloque sin cierre: " + inicio);
}
const codigo = [
  bloque("const ESTADOS_CF = {") + ";",
  bloque("function resolveEstadoCF("),
  bloque("function ingresoMatchRegla("),
  bloque("function calcMontoObtentor("),
  bloque("function calcularDeudaObtentor("),
  "return { ESTADOS_CF, resolveEstadoCF, calcularDeudaObtentor };",
].join("\n");
const REAL = new Function(codigo)();

const t = readFileSync(RAIZ + "/.env.osiris-prod-readonly.local", "utf8");
const G = (k) => t.match(new RegExp("^" + k + "=(.*)$", "m"))[1].trim();
const [fila] = await (await fetch(`${G("OSIRIS_PROD_SUPABASE_URL")}/rest/v1/calendario_data?id=eq.osiris&select=value,updated_at`,
  { headers: { apikey: G("OSIRIS_PROD_SUPABASE_ANON_KEY_LEGACY"), Authorization: "Bearer " + G("OSIRIS_PROD_SUPABASE_ANON_KEY_LEGACY") } })).json();
const v = fila.value;
const ctData = v.contratos || [];

// feData VIGENTE: copia literal de la derivación de main (lee la fila persistida, no el contrato)
function feDataVigente() {
  const raw = v.feeEntrada || [];
  const edits = {};
  raw.forEach((r) => { if (r.ctId) edits[r.ctId] = r; edits[r.id] = r; });
  const fromContracts = ctData.filter((ct) => ct.tipoContractFee && ct.tipoContractFee !== "Sin Contract Fee").map((ct) => {
    const saved = edits[ct.id] || edits[`fe_${ct.id}`] || {};
    return { id: saved.id || `fe_${ct.id}`, ctId: ct.id, cliente: saved.cliente || ct.razonSocial, pais: saved.pais || ct.pais,
      montoUSD: saved.montoUSD != null ? saved.montoUSD : (ct.montoContractFee || 30000), detalle: saved.detalle || ct.tipoContractFee || "",
      nFact: saved.nFact ?? "", pagado: saved.pagado ?? false, fechaPago: saved.fechaPago ?? "", _fromContract: true };
  });
  return [...fromContracts, ...raw.filter((r) => !r.ctId && !r._fromContract)];
}
const antes = feDataVigente();
const despues = M.filasParaConsumo(M.derivarFeeEntrada(ctData, v.feeEntrada || []));

// Totales de Resumen, con las mismas expresiones del componente
const resumen = (fd) => ({
  conFactura: fd.filter((r) => r.nFact && String(r.nFact).trim() !== "").reduce((s, r) => s + (r.montoUSD || 0), 0),
  pendFacturar: fd.filter((r) => !r.nFact || String(r.nFact).trim() === "").reduce((s, r) => s + (r.montoUSD || 0), 0),
  porCobrar: fd.filter((r) => !r.pagado).reduce((s, r) => s + (r.montoUSD || 0), 0),
  cobrado: fd.filter((r) => r.pagado).reduce((s, r) => s + (r.montoUSD || 0), 0),
});
const ra = resumen(antes), rd = resumen(despues);
console.log("== IMPACTO DE LA FUENTE ÚNICA · producción en memoria · fila osiris " + String(fila.updated_at).slice(0, 16) + " ==");
console.log("filas de fee: hoy " + antes.length + " · con fuente única " + despues.length);
console.log();
console.log("RESUMEN · Fee Entrada                  hoy (main)          fuente única          diferencia");
for (const k of Object.keys(ra))
  console.log("  " + k.padEnd(34) + usd(ra[k]).padStart(14) + usd(rd[k]).padStart(21) + usd(rd[k] - ra[k]).padStart(20));
console.log("  cuadre hoy: " + usd(ra.porCobrar) + " + " + usd(ra.cobrado) + " = " + usd(ra.porCobrar + ra.cobrado) +
            " · fuente única: " + usd(rd.porCobrar) + " + " + usd(rd.cobrado) + " = " + usd(rd.porCobrar + rd.cobrado));
console.log();

// Contratos cuyo estado de cobro cambia para los cálculos
const porCt = (fd) => new Map(fd.filter((r) => r.ctId).map((r) => [String(r.ctId), r]));
const A = porCt(antes), D = porCt(despues);
const cambian = [...D.keys()].filter((k) => REAL.resolveEstadoCF(A.get(k) || {}) !== REAL.resolveEstadoCF(D.get(k)));
console.log("contratos cuyo estado de cobro cambia en los cálculos: " + cambian.length);
for (const k of cambian) console.log("  " + h(k) + " · " + REAL.resolveEstadoCF(A.get(k) || {}) + " -> " + REAL.resolveEstadoCF(D.get(k)) +
                                    " · " + usd(D.get(k).montoUSD) + (D.get(k).enConciliacion ? " · EN CONCILIACIÓN" : ""));
const enConc = despues.filter((r) => r.enConciliacion);
console.log("en conciliación (se entrega sin cobro, igual que hoy): " + enConc.length + " · " + enConc.map((r) => h(r.ctId) + " " + REAL.resolveEstadoCF(A.get(String(r.ctId)) || {}) + "→" + REAL.resolveEstadoCF(r)).join(", "));
console.log();

// Deuda con obtentores por contract fee, con la función real
const obts = (v.obtentores || []);
let totA = 0, totD = 0;
console.log("DEUDA CON OBTENTORES · solo contract fee (calcularDeudaObtentor real)");
for (const o of obts) {
  const reglas = (o.participacionIngresos || []).filter((r) => r.tipoIngreso === "contract_fee");
  const a = REAL.calcularDeudaObtentor(o, ctData, antes, [], []);
  const d = REAL.calcularDeudaObtentor(o, ctData, despues, [], []);
  totA += a.deudaBruta; totD += d.deudaBruta;
  console.log("  obtentor " + h(o.id || o.obtentor).padEnd(8) + " reglas contract fee=" + reglas.length +
              " · deuda bruta hoy " + usd(a.deudaBruta) + " · fuente única " + usd(d.deudaBruta) + " · neto a pagar " + usd(a.netoAPagar) + " -> " + usd(d.netoAPagar) +
              " · ítems " + a.items.length + " -> " + d.items.length);
}
console.log("  TOTAL deuda bruta por contract fee: hoy " + usd(totA) + " · fuente única " + usd(totD) + " · diferencia " + usd(totD - totA));
console.log();
console.log("otros consumidores de feData en el módulo: ReconciliacionIQ, DashboardAnalitico, ReportesOsiris (mismo cambio de estado de cobro)");
