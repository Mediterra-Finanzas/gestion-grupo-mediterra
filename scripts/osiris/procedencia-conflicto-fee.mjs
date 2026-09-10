/* Procedencia del conflicto, acotada a los campos del contract fee. Solo lectura.
 * Enmascara actores, numeros de factura y el identificador del contrato. */
import { readFileSync } from "node:fs";
import crypto from "node:crypto";
const RAIZ = "C:/Users/angel/Documents/Proyectos/gestion-grupo-mediterra";
const t = readFileSync(RAIZ + "/.env.osiris-prod-readonly.local", "utf8");
const G = (k) => t.match(new RegExp("^" + k + "=(.*)$", "m"))[1].trim();
const U = G("OSIRIS_PROD_SUPABASE_URL"), K = G("OSIRIS_PROD_SUPABASE_ANON_KEY_LEGACY");
const H = { apikey: K, Authorization: "Bearer " + K };
const leer = async (id) => (await (await fetch(`${U}/rest/v1/calendario_data?id=eq.${id}&select=value,updated_at`, { headers: H })).json())[0];
const h6 = (s) => crypto.createHash("sha256").update(String(s)).digest("hex").slice(0, 6);
const mask = (s) => (s ? "…" + h6(s) : "vacio");

const os = await leer("osiris"), au = await leer("audit_log");
const v = os.value, ev = au.value.eventos;
const fe = v.feeEntrada[0];
const ct = v.contratos.find((c) => String(c.id) === String(fe.ctId));
const inicioBitacora = ev.map((e) => e.timestamp).sort()[0];

console.log("== ESTADO ACTUAL ==");
console.log("contrato " + mask(ct.id) + " · tipoContractFee=" + (ct.tipoContractFee || "—") + " · monto=" + ct.montoContractFee);
console.log("  CONTRATO   estado=" + ct.contractFeeEstado + " pagado=" + ct.contractFeePagado + " nFact=" + mask(ct.contractFeeNFact) +
            " (largo " + String(ct.contractFeeNFact || "").length + ") fechaPago=" + (ct.contractFeeFechaPago || "vacio") +
            " fechaContrato=" + ct.fechaContrato);
console.log("  REGISTRO   id-prefijo=" + String(fe.id).split("_")[0] + "_ · estadoCF=" + fe.estadoCF + " pagado=" + fe.pagado +
            " nFact=" + mask(fe.nFact) + " fechaPago=" + (fe.fechaPago || "vacio") + " montoUSD=" + fe.montoUSD + " detalle=" + fe.detalle);
console.log("  derivacion actual del codigo genera id-prefijo=cf_ (derivarContractFeeDesdeContratos)");
console.log();

const FEE = /^(contractFee|montoContractFee|tipoContractFee|estadoCF|pagado|nFact|fechaPago|fechaContrato)/;
const del = ev.filter((e) => {
  const rid = String(e.registroId || "");
  const esContrato = rid === ct.id && FEE.test(String(e.campo || ""));
  const esRegistro = rid === fe.id || rid === "cf_" + ct.id || (String(e.seccion) === "Fee Entrada" && String(e.descripcion || "").toLowerCase().includes("agroextiende"));
  return esContrato || esRegistro;
}).sort((a, b) => String(a.timestamp).localeCompare(String(b.timestamp)));

console.log("== ORDEN DE CAMBIOS EN LA BITACORA (desde " + String(inicioBitacora).slice(0, 10) + ") ==");
console.log("eventos del contract fee: " + del.length);
const sens = (c) => /nFact/i.test(String(c));
for (const e of del) {
  const fmt = (x) => (sens(e.campo) ? mask(x) : String(x === "" ? "vacio" : x));
  console.log("  " + String(e.timestamp).slice(0, 19) + " · " + String(e.seccion).padEnd(12) + " · registro=" + String(e.registroId || "").split("_")[0] + "_ · " +
              String(e.campo).padEnd(22) + " " + fmt(e.valorAnterior) + " -> " + fmt(e.valorNuevo) + " · actor " + mask(e.email || e.usuario) + " (" + e.rol + ")");
}
if (!del.length) console.log("  ninguno: los dos estados son ANTERIORES al inicio de la bitacora");
console.log();

// ¿alguna vez se toco el registro fe_ o se creo?
const tocaFe = ev.filter((e) => String(e.registroId || "") === fe.id || String(e.descripcion || "").includes(fe.id));
console.log("eventos sobre el registro persistido " + String(fe.id).split("_")[0] + "_: " + tocaFe.length);
const tocaCf = ev.filter((e) => String(e.registroId || "") === "cf_" + ct.id);
console.log("eventos sobre el registro derivado cf_: " + tocaCf.length);
console.log();

// documentos disponibles en el sistema para este contrato
const docs = [];
if (ct.linkContrato) docs.push("linkContrato (" + new URL(ct.linkContrato).hostname + ")");
for (const k of ["anexo1", "anexo2", "anexo3"]) if (ct[k] && ct[k].link) docs.push(k + " · " + (ct[k].tipo || "—") + " (" + new URL(ct[k].link).hostname + ")");
for (const a of ct.anexosExtra || []) if (a.link) docs.push("anexoExtra · " + (a.tipo || "—") + " (" + new URL(a.link).hostname + ")");
console.log("== DOCUMENTOS VINCULADOS AL CONTRATO ==");
for (const d of docs) console.log("  " + d);
const campoDocFactura = Object.keys(ct).filter((k) => /factura|invoice|comprobante|pago.*(link|doc|adjunto)/i.test(k));
console.log("  campos de documento de factura o comprobante de pago en el contrato: " + (campoDocFactura.length ? campoDocFactura.join(", ") : "ninguno"));
const feDoc = Object.keys(fe).filter((k) => /link|doc|adjunto|archivo/i.test(k));
console.log("  campos de documento en el registro fee: " + (feDoc.length ? feDoc.join(", ") : "ninguno"));
console.log();
console.log("== OBSERVACIONES SIN DECIDIR ==");
console.log("  fechaPago del contrato " + ct.contractFeeFechaPago + " vs fechaContrato " + ct.fechaContrato +
            " -> pago " + (ct.contractFeeFechaPago < ct.fechaContrato ? "ANTERIOR" : "posterior") + " a la fecha del contrato");
