/* Conciliacion de la bandeja contra los contratos de produccion, en solo lectura.
 * Identificadores enmascarados: no se imprimen ids completos ni razones sociales
 * enteras. El objetivo es explicar de donde sale cada fila, no listar clientes. */
import { readFileSync, writeFileSync } from "node:fs";
import crypto from "node:crypto";
const RAIZ = "C:/Users/angel/Documents/Proyectos/gestion-grupo-mediterra";
const W = RAIZ + "/.claude/worktrees/wt-respaldo-prod";
const t = readFileSync(RAIZ + "/.env.osiris-prod-readonly.local", "utf8");
const G = (k) => t.match(new RegExp("^" + k + "=(.*)$", "m"))[1].trim();
const U = G("OSIRIS_PROD_SUPABASE_URL"), K = G("OSIRIS_PROD_SUPABASE_ANON_KEY_LEGACY");
const [fila] = await (await fetch(`${U}/rest/v1/calendario_data?id=eq.osiris&select=value`,
  { headers: { apikey: K, Authorization: "Bearer " + K } })).json();
const v = fila.value;
const M = await import("file:///" + W + "/src/ux/cobranza.js");

const mask = (s) => {
  const x = String(s || "");
  if (!x) return "—";
  const h = crypto.createHash("sha256").update(x).digest("hex").slice(0, 6);
  return x.slice(0, 3) + "…" + h;
};
const filas = M.filasCobranza(v, new Date());
const contratos = new Map((v.contratos || []).map((c) => [String(c.id), c]));

console.log("== CONCILIACION · bandeja vs contrato fuente (produccion, solo lectura) ==");
console.log("   contratos en la fila `osiris` : " + (v.contratos || []).length);
console.log("   hechos de ingreso generados   : feeEntrada=" + (v.feeEntrada || []).length +
            " royaltyPlanta=" + (v.royaltyPlanta || []).length +
            " royaltyComercial=" + (v.royaltyComercial || []).length +
            " feeViveros=" + (v.feeViveros || []).length);
console.log("   filas en la bandeja           : " + filas.length);
console.log();

for (const f of filas) {
  const ct = contratos.get(f.contratoId) || {};
  console.log(`── ${f.concepto} · cliente ${mask(f.cliente)} · contrato ${mask(f.contratoId)}`);
  console.log(`   estado      : ${f.estado}   (${f.motivo})`);
  console.log(`   monto/saldo : total=${f.total}  cobrado=${f.cobrado}  ajustes=${f.ajustes}  saldo=${f.saldo}  parciales=${f.pagosParciales}`);
  console.log(`   vencimiento : ${f.vencimiento || "—"}  origen=${f.origenVencimiento}  (${f.detalleVencimiento})`);
  // campos fuente que decidieron el estado
  if (f.flujo === "feeEntrada" || f.concepto === "Contract Fee") {
    console.log(`   fuente      : contrato.fechaContrato=${ct.fechaContrato || "—"} · montoContractFee=${ct.montoContractFee ?? "—"}` +
                ` · contractFeeEstado=${ct.contractFeeEstado || "—"} · contractFeeNFact=${ct.contractFeeNFact ? mask(ct.contractFeeNFact) : "vacio"}` +
                ` · contractFeePagado=${ct.contractFeePagado ?? "—"}`);
    const he = (v.feeEntrada || []).find((x) => String(x.id) === f.id) || {};
    console.log(`                 hecho.montoUSD=${he.montoUSD ?? "—"} · hecho.nFact=${he.nFact ? mask(he.nFact) : "vacio"}` +
                ` · hecho.pagado=${he.pagado} · hecho.estadoCF=${he.estadoCF || "—"} · hecho.fechaPago=${he.fechaPago || "vacio"}`);
  }
  if (f.concepto === "Royalty Planta") {
    const h = (v.royaltyPlanta || []).find((x) => String(x.id) === f.id) || {};
    const cuota = (ct.rpPlantaCuotas || []).find((q) => String(q.id) === String(h.cuotaId)) || {};
    console.log(`   fuente      : cuota=${mask(h.cuotaId)} descripcion="${cuota.descripcion || "—"}"` +
                ` · fechaEvento=${cuota.fechaEvento || "VACIA"} · fechaPago=${cuota.fechaPago || "vacio"}` +
                ` · nFact=${cuota.nFact ? mask(cuota.nFact) : "vacio"} · nPlantas=${cuota.nPlantas ?? "—"}`);
    console.log(`                 hecho.montoFacturado=${JSON.stringify(h.montoFacturado)} · valorRoyaltyPlanta=${ct.valorRoyaltyPlanta ?? "—"}`);
  }
  if (f.concepto === "Royalty Comercial") {
    const h = (v.royaltyComercial || []).find((x) => String(x.id) === f.id) || {};
    console.log(`   fuente      : añoCobro=${h.añoCobro ?? "—"} trimCobro=${h.trimCobro ?? "—"}` +
                ` · rcMesCobro=${ct.rcMesCobro ?? "VACIO"} · mesFacuracionRC=${ct.mesFacuracionRC ?? "VACIO"}` +
                ` · valorRoyaltyComercial=${ct.valorRoyaltyComercial ?? "—"} · rcPagos=${(ct.rcPagos || []).length}`);
  }
  console.log();
}

// ¿Se solapan los tableros?
const porId = new Map();
for (const f of filas) { if (!porId.has(f.id)) porId.set(f.id, []); porId.get(f.id).push(f.estado); }
const duplicados = [...porId.entries()].filter(([, e]) => e.length > 1);
const estados = new Set(filas.map((f) => f.estado));
console.log("== SOLAPAMIENTO ==");
console.log("   filas unicas por id: " + porId.size + " de " + filas.length);
console.log("   filas en mas de un tablero: " + duplicados.length);
console.log("   cada fila tiene exactamente un estado: " + filas.every((f) => typeof f.estado === "string"));
console.log("   estados presentes: " + [...estados].join(", "));

// Contratos que NO generaron ningun hecho
const conHecho = new Set(filas.map((f) => f.contratoId));
const sinHecho = (v.contratos || []).filter((c) => !conHecho.has(String(c.id)));
console.log();
console.log("== CONTRATOS SIN NINGUN HECHO DE INGRESO ==");
console.log("   " + sinHecho.length + " de " + (v.contratos || []).length + " contratos no aparecen en la bandeja");
let conFee = 0, conCuotas = 0, conMesRC = 0;
for (const c of sinHecho) {
  if (Number(c.montoContractFee) > 0 && !c.contractFeePagado) conFee++;
  if ((c.rpPlantaCuotas || []).length) conCuotas++;
  if (Number(c.rcMesCobro) >= 1) conMesRC++;
}
console.log(`   de esos: ${conFee} con contract fee > 0 y sin pagar · ${conCuotas} con cuotas de royalty planta · ${conMesRC} con mes de cobro RC`);
console.log(`   monto de contract fee no representado en la bandeja: USD ` +
  sinHecho.reduce((s, c) => s + (c.contractFeePagado ? 0 : Number(c.montoContractFee) || 0), 0).toLocaleString("es-CL"));
writeFileSync(process.env.SP + "/conciliacion.json", JSON.stringify({ filas, sinHecho: sinHecho.length }, null, 1));
