/* Evidencia de preservacion de la fuente unica de Fee Entrada sobre DATOS REALES.
 * Staging: lectura. Produccion: lectura (GET). Todo cambio es en memoria; nada se
 * escribe en ninguna base. Identificadores enmascarados. */
import { readFileSync } from "node:fs";
import crypto from "node:crypto";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { Client } = require(process.env.SP + "/pgclient/node_modules/pg");
const RAIZ = "C:/Users/angel/Documents/Proyectos/gestion-grupo-mediterra";
const WF = RAIZ + "/.claude/worktrees/wt-fee-fuente-unica";
const M = await import("file:///" + WF + "/src/data/feeEntradaCanonica.js");
const h = (s) => "…" + crypto.createHash("sha256").update(String(s)).digest("hex").slice(0, 5);
const clon = (x) => JSON.parse(JSON.stringify(x));

async function blobStaging() {
  const t = readFileSync(RAIZ + "/.env.osiris-staging.local", "utf8");
  const dsn = t.match(/^OSIRIS_STAGING_DATABASE_URL=(.*)$/m)[1].trim();
  if (dsn.includes("bywovqayuzodbzwsriet")) throw new Error("ABORT");
  const c = new Client({ connectionString: dsn, ssl: { rejectUnauthorized: false } }); await c.connect();
  const { rows: [r] } = await c.query("select value from public.calendario_data where id='osiris'"); await c.end();
  return r.value;
}
async function blobProduccion() {
  const t = readFileSync(RAIZ + "/.env.osiris-prod-readonly.local", "utf8");
  const G = (k) => t.match(new RegExp("^" + k + "=(.*)$", "m"))[1].trim();
  const r = await fetch(`${G("OSIRIS_PROD_SUPABASE_URL")}/rest/v1/calendario_data?id=eq.osiris&select=value`,
    { headers: { apikey: G("OSIRIS_PROD_SUPABASE_ANON_KEY_LEGACY"), Authorization: "Bearer " + G("OSIRIS_PROD_SUPABASE_ANON_KEY_LEGACY") } });
  return (await r.json())[0].value;
}

let fallas = 0;
const chk = (e, ok, d) => { if (!ok) fallas++; console.log("   " + (ok ? "PASS " : "FALLA") + " " + e.padEnd(60) + (d || "")); };

for (const [nombre, cargar] of [["STAGING", blobStaging], ["PRODUCCION (en memoria)", blobProduccion]]) {
  const original = await cargar();
  const antes = clon(original);
  console.log("\n== " + nombre + " ==");
  const v = M.derivarFeeEntrada(antes.contratos, antes.feeEntrada);
  const bloqueados = v.filas.filter((x) => x.bloqueado);
  console.log("   contratos=" + antes.contratos.length + " · filas con fee=" + v.filas.length + " · historicos persistidos=" + (antes.feeEntrada || []).length +
              " · con discrepancia=" + bloqueados.length + " (" + bloqueados.map((x) => h(x.ctId) + ":" + x.discrepancias.map((d) => d.campo).join("+")).join(", ") + ")");
  chk("la derivacion no modifica el blob", JSON.stringify(antes) === JSON.stringify(original));
  const historicosVistos = v.filas.filter((x) => x.historico).length + v.historicosSinContratoConFee.length + v.manuales.length;
  chk("todo registro historico queda visible", historicosVistos === (antes.feeEntrada || []).length, historicosVistos + " de " + (antes.feeEntrada || []).length);

  // Edicion representativa sobre un contrato SIN discrepancia, aplicada a una version vigente
  // en la que el equipo escribio algo mientras tanto.
  const objetivo = v.filas.find((x) => !x.bloqueado && !x.nFact) || v.filas.find((x) => !x.bloqueado);
  const vigente = clon(antes);
  const otro = vigente.contratos.find((c) => String(c.id) !== String(objetivo.ctId));
  otro.notas = (otro.notas || "") + " [escritura concurrente simulada]";
  const vigenteAntes = clon(vigente);
  const r = M.aplicarSobreVersionVigente(vigente, { ctId: objetivo.ctId, campo: "nFact", valor: "PRUEBA-EN-MEMORIA" });
  chk("edicion en contrato sin discrepancia aceptada", r.ok, h(objetivo.ctId));
  const p = M.verificarPreservacion(vigenteAntes, r.blob, r.cambios);
  const cu = p.cuenta;
  console.log("   registros " + cu.registrosPreservados + "/" + cu.registros + " · campos iguales " + cu.camposIguales + "/" + cu.campos +
              " · cambiados declarados " + cu.camposCambiadosDeclarados + " · relaciones ctId " + cu.relacionesPreservadas + "/" + cu.relaciones +
              " · colecciones " + cu.colecciones + " · valores no tabulares " + cu.valoresNoColeccion);
  chk("cero violaciones de preservacion", p.ok, p.violaciones.slice(0, 3).map((x) => x.tipo + ":" + x.coleccion + ":" + (x.campo || "")).join(" · "));
  chk("todos los registros preservados", cu.registrosPreservados === cu.registros);
  chk("todas las relaciones preservadas", cu.relacionesPreservadas === cu.relaciones);
  chk("feeEntrada historico intacto, campo por campo", JSON.stringify(r.blob.feeEntrada) === JSON.stringify(vigenteAntes.feeEntrada));
  chk("la escritura concurrente del equipo sobrevive", r.blob.contratos.find((c) => c.id === otro.id).notas === otro.notas);
  chk("solo cambio el campo declarado del contrato objetivo", r.cambios.length === 1 && r.cambios[0].campo === "contractFeeNFact", JSON.stringify(r.cambios.map((x) => x.campo)));

  for (const b of bloqueados) {
    const rr = M.aplicarEdicion({ contratos: antes.contratos, persistidos: antes.feeEntrada, ctId: b.ctId, campo: "estadoCF", valor: "porCobrar" });
    chk("contrato con discrepancia " + h(b.ctId) + " no se puede editar", !rr.ok, rr.motivo);
  }
  // contraprueba: el verificador SI detecta una perdida sobre estos mismos datos
  const roto = clon(r.blob); if (roto.feeEntrada && roto.feeEntrada.length) roto.feeEntrada[0] = { id: roto.feeEntrada[0].id, ctId: roto.feeEntrada[0].ctId };
  const pr = M.verificarPreservacion(vigenteAntes, roto, r.cambios);
  chk("contraprueba: vaciar campos de un historico se detecta", !pr.ok || !(antes.feeEntrada || []).length, pr.violaciones.length + " violaciones");
}
console.log();
console.log("PRESERVACION: " + (fallas === 0 ? "PASS" : "FALLA · " + fallas) + " · nada se escribio en ninguna base");
