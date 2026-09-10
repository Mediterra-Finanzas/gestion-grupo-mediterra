/* eslint-disable */
// ═══════════════════════════════════════════════════════════════════
// OSIRIS · RESUMEN DIARIO DE FACTURACIÓN Y COBRANZA
// ═══════════════════════════════════════════════════════════════════
//
// Compone los correos; no los envía. El envío usa el canal ya operativo
// (api/send-email.js) y, mientras dure la prueba, solo a destinatarios
// sintéticos: `modoPrueba` rechaza cualquier dominio que no sea de prueba.
//
// Reglas:
//  - Lo que está en CONFLICTO no entra en ningún correo de facturación o cobranza
//    hasta resolverse. El consolidado del CFO dice cuántos se excluyeron, sin
//    detalle, para que la exclusión no sea silenciosa.
//  - Un correo por responsable, con sus contratos. Sin responsable no hay a quién
//    escribirle: esas filas van al consolidado como TAREA DE CONFIGURACIÓN.
//  - Sin duplicados: una línea aparece una sola vez por destinatario y por día.
//    La clave de envío es (fecha civil, destinatario, contrato, concepto, clase);
//    el historial la guarda y un segundo intento el mismo día no reenvía.
//  - Cierre: una línea que ayer se avisó y hoy aparece cerrada genera un aviso de
//    cierre, una sola vez.
//  - Los importes van rotulados como contractuales. No se escribe "deuda".

import { CLASE, ETIQUETA } from "./coberturaContratos.js";

export const DOMINIOS_PRUEBA = ["ejemplo.invalid", "example.com", "example.org", "test.invalid"];

const txt = (v) => (v == null ? "" : String(v)).trim();
const esc = (s) => txt(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const miles = (n) => Number(n || 0).toLocaleString("es-CL", { maximumFractionDigits: 0 });

export function esDestinatarioDePrueba(correo) {
  const d = txt(correo).toLowerCase().split("@")[1] || "";
  return DOMINIOS_PRUEBA.some((x) => d === x || d.endsWith("." + x));
}

/* Líneas accionables de un contrato: todo lo que no está cerrado ni es no aplicable. */
function lineasAccionables(c) {
  return c.conceptos
    .filter((l) => l.clase !== CLASE.CERRADO_CON_EVIDENCIA && l.clase !== CLASE.NO_APLICABLE)
    .map((l) => ({ contratoId: c.contratoId, cliente: c.cliente, moneda: c.moneda, concepto: l.concepto,
                   clase: l.clase, motivo: l.motivo, importe: l.importe || 0 }));
}

export const claveEnvio = (fecha, destinatario, l) =>
  [fecha, txt(destinatario).toLowerCase(), l.contratoId, l.concepto, l.clase].join("|");

/* evaluacion : salida de evaluarContratos()
 * directorio : { [responsableInterno]: correo }   solo destinatarios aprobados
 * cfo        : correo del consolidado
 * historial  : Set de claves ya enviadas (y de avisos de cierre)
 * previas    : Map contrato|concepto -> clase del último envío, para detectar cierres */
export function planificarEnvios({ evaluacion, directorio = {}, cfo, fecha, historial = new Set(), previas = new Map(), modoPrueba = true }) {
  const errores = [];
  const destinos = [cfo, ...Object.values(directorio)].filter(Boolean);
  if (modoPrueba) for (const d of destinos) if (!esDestinatarioDePrueba(d)) errores.push("destinatario no sintético en modo prueba: " + d);
  if (errores.length) return { ok: false, errores, correos: [] };

  // Un contrato con CUALQUIER linea en conflicto sale entero de los correos: sus
  // otras lineas de facturacion descansan sobre registros que se contradicen, y
  // avisarlas invita a actuar sobre un contrato que nadie concilio todavia.
  const enConflicto = new Set(evaluacion.contratos
    .filter((c) => c.conceptos.some((l) => l.clase === CLASE.CONFLICTO)).map((c) => c.contratoId));
  const todas = evaluacion.contratos.flatMap((c) => lineasAccionables(c).map((l) => ({ ...l, responsable: c.responsable })));
  const conflictos = todas.filter((l) => enConflicto.has(l.contratoId));
  const operables = todas.filter((l) => !enConflicto.has(l.contratoId));
  const sinResponsable = operables.filter((l) => !l.responsable || !directorio[l.responsable]);
  const conResponsable = operables.filter((l) => l.responsable && directorio[l.responsable]);

  const correos = [];
  const nuevas = [];
  const filtrar = (dest, lineas) => lineas.filter((l) => {
    const k = claveEnvio(fecha, dest, l);
    if (historial.has(k)) return false;
    nuevas.push(k);
    return true;
  });

  // Uno por responsable
  const porResp = new Map();
  for (const l of conResponsable) { if (!porResp.has(l.responsable)) porResp.set(l.responsable, []); porResp.get(l.responsable).push(l); }
  for (const [resp, lineas] of porResp) {
    const dest = directorio[resp];
    const pendientes = filtrar(dest, lineas);
    if (pendientes.length) correos.push(componer({ tipo: "responsable", para: dest, fecha, lineas: pendientes }));
  }

  // Consolidado CFO
  const cierres = [];
  for (const c of evaluacion.contratos) for (const l of c.conceptos) {
    const k = c.contratoId + "|" + l.concepto;
    const antes = previas.get(k);
    if (antes && antes !== CLASE.CERRADO_CON_EVIDENCIA && l.clase === CLASE.CERRADO_CON_EVIDENCIA) {
      const kc = [fecha, "cierre", k].join("|");
      if (!historial.has(kc)) { cierres.push({ contratoId: c.contratoId, cliente: c.cliente, concepto: l.concepto, antes }); nuevas.push(kc); }
    }
  }
  const consolidadoLineas = filtrar(cfo, conResponsable);
  const configuracion = filtrar(cfo, sinResponsable);
  if (cfo && (consolidadoLineas.length || configuracion.length || conflictos.length || cierres.length))
    correos.push(componer({ tipo: "consolidado", para: cfo, fecha, lineas: consolidadoLineas, configuracion,
                            conflictosExcluidos: conflictos.length, cierres, conteos: evaluacion.conteos }));

  return { ok: true, correos, clavesNuevas: nuevas, excluidosPorConflicto: conflictos.length,
           contratosExcluidos: enConflicto.size, tareasConfiguracion: sinResponsable.length };
}

function tabla(lineas) {
  return `<table style="border-collapse:collapse;width:100%;font-size:12px"><thead><tr style="background:#f3f4f6">
    <th style="text-align:left;padding:5px 8px">Cliente</th><th style="text-align:left;padding:5px 8px">Concepto</th>
    <th style="text-align:left;padding:5px 8px">Estado</th><th style="text-align:right;padding:5px 8px">Importe contractual</th>
    <th style="text-align:left;padding:5px 8px">Detalle</th></tr></thead><tbody>${lineas.map((l) =>
    `<tr><td style="padding:5px 8px;border-top:1px solid #eee">${esc(l.cliente)}</td><td style="padding:5px 8px;border-top:1px solid #eee">${esc(l.concepto)}</td>
     <td style="padding:5px 8px;border-top:1px solid #eee">${esc(ETIQUETA[l.clase])}</td>
     <td style="padding:5px 8px;border-top:1px solid #eee;text-align:right">${l.importe ? esc(l.moneda) + " " + miles(l.importe) : "—"}</td>
     <td style="padding:5px 8px;border-top:1px solid #eee">${esc(l.motivo)}</td></tr>`).join("")}</tbody></table>`;
}

export function componer({ tipo, para, fecha, lineas = [], configuracion = [], conflictosExcluidos = 0, cierres = [], conteos }) {
  const asunto = tipo === "responsable"
    ? `Osiris · pendientes de facturación y cobranza · ${fecha}`
    : `Osiris · consolidado de facturación y cobranza · ${fecha}`;
  const partes = [`<div style="font-family:Arial,Helvetica,sans-serif;color:#222;max-width:760px">`,
    `<h2 style="margin:0 0 6px;font-size:17px">${esc(asunto)}</h2>`,
    `<p style="margin:0 0 12px;font-size:12px;color:#555">Los importes son contractuales. No representan deuda confirmada ni facturación exigible.</p>`];
  if (lineas.length) partes.push(`<h3 style="font-size:14px;margin:14px 0 6px">Pendientes</h3>`, tabla(lineas));
  if (configuracion.length) partes.push(`<h3 style="font-size:14px;margin:14px 0 6px">Tareas de configuración · sin responsable asignado</h3>`, tabla(configuracion));
  if (cierres.length) partes.push(`<h3 style="font-size:14px;margin:14px 0 6px">Cerrados desde el último aviso</h3>`,
    `<ul style="font-size:12px">${cierres.map((c) => `<li>${esc(c.cliente)} · ${esc(c.concepto)} · antes ${esc(ETIQUETA[c.antes])}</li>`).join("")}</ul>`);
  if (conflictosExcluidos) partes.push(`<p style="font-size:12px;color:#8c2318;margin-top:14px">${conflictosExcluidos} línea(s) de contratos en conflicto excluidas de este correo hasta que se concilien.</p>`);
  if (conteos) partes.push(`<p style="font-size:11px;color:#888;margin-top:14px">Contratos evaluados: ${conteos.contratosEvaluados} · líneas de concepto: ${conteos.lineasDeConcepto} · cuotas de royalty planta: ${conteos.cuotasRoyaltyPlanta} · hechos persistidos: ${conteos.hechosPersistidos}</p>`);
  partes.push(`</div>`);
  const texto = [asunto, "Importes contractuales, no deuda confirmada.",
    ...lineas.map((l) => `- ${l.cliente} · ${l.concepto} · ${ETIQUETA[l.clase]} · ${l.motivo}`),
    ...(configuracion.length ? ["", "Tareas de configuración (sin responsable):", ...configuracion.map((l) => `- ${l.cliente} · ${l.concepto}`)] : []),
    ...(conflictosExcluidos ? ["", `${conflictosExcluidos} línea(s) en conflicto excluidas.`] : [])].join("\n");
  return { para, asunto, html: partes.join(""), texto, modulo: "osiris",
           lineas: lineas.length, configuracion: configuracion.length, cierres: cierres.length };
}
