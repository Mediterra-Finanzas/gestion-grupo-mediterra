// ═══════════════════════════════════════════════════════════════════
// CIRCUITO DE APROBACIÓN — pasos para mostrar, a partir del registro tal
// como ya existe. Solo presentación: no decide permisos ni cambia estados.
// Mismo patrón para Rendiciones y Nóminas (y, después, Osiris, Frisku y
// Service): cada paso dice quién y cuándo, cuál está en curso y si hubo
// devolución.
//   estado de un paso: "hecho" | "actual" | "pendiente" | "devuelto"
// ═══════════════════════════════════════════════════════════════════

const fechaCorta = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d)) return "";
  return d.toLocaleDateString("es-CL", { day: "2-digit", month: "short" });
};

export function pasosRendicion(r) {
  if (!r) return [];
  const est = r.estado || "borrador";
  const enviada = !!r.enviadoEn || ["enviada", "aprobada", "pagada"].includes(est);
  const cadena = Array.isArray(r.cadena) ? r.cadena : [];
  const aprob = Array.isArray(r.aprobaciones) ? r.aprobaciones : [];
  const pasos = [];
  pasos.push({ id: "prep", rotulo: "Preparación", quien: r.creadaPor || r.trabajador || "", estado: est === "borrador" && !r.devuelta ? "actual" : "hecho" });
  pasos.push({ id: "envio", rotulo: "Envío", quien: r.trabajador || "", cuando: fechaCorta(r.enviadoEn),
    estado: enviada ? "hecho" : est === "rechazada" ? "devuelto" : "pendiente" });
  const niveles = cadena.length ? cadena : [{ nombre: "Administración / CFO" }];
  niveles.forEach((c, i) => {
    const a = aprob.find(x => (x.nivel ?? 0) === i) || (est === "aprobada" || est === "pagada" ? aprob[aprob.length - 1] : null);
    let e = "pendiente";
    if (a && (est === "aprobada" || est === "pagada" || i < (r.nivelActual || 0))) e = "hecho";
    else if (est === "enviada" && (r.nivelActual || 0) === i) e = "actual";
    pasos.push({ id: `aprob${i}`, rotulo: niveles.length > 1 ? `Aprobación ${i + 1}` : "Aprobación",
      quien: a?.nombre || c.nombre || "", cuando: fechaCorta(a?.fecha), estado: e });
  });
  pasos.push({ id: "pago", rotulo: "Pago", quien: r.pagadoPor || "", cuando: fechaCorta(r.pagadoEn),
    estado: est === "pagada" ? "hecho" : est === "aprobada" ? "actual" : "pendiente" });
  if (est === "rechazada") {
    // La devolución se informa en el paso de envío, que es el que el trabajador debe repetir.
    const p = pasos.find(x => x.id === "envio");
    p.estado = "devuelto"; p.nota = r.comentarioRevisor || ""; p.quien = r.revisadoPor ? `Devuelta por ${r.revisadoPor}` : p.quien;
    p.cuando = fechaCorta(r.revisadoEn);
    pasos[0].estado = "actual";
  }
  return pasos;
}

const FLUJO_NOM = [
  { id: "preparada", rotulo: "Preparación", campo: "preparadoPor" },
  { id: "revision", rotulo: "Revisión", campo: "revisadoPor" },
  { id: "aprobada1", rotulo: "V°B°", campo: "aprobado1Por", fecha: "fechaAprobacion1" },
  { id: "aprobada", rotulo: "Aprobación CFO", campo: "aprobadoPor", fecha: "fechaAprobacion" },
];
const ORDEN_NOM = ["borrador", "preparada", "revision", "aprobada1", "aprobada"];

export function pasosNomina(n) {
  if (!n) return [];
  const idx = ORDEN_NOM.indexOf(n.estado || "borrador");
  const pasos = FLUJO_NOM.map((p) => {
    const k = ORDEN_NOM.indexOf(p.id);
    return { id: p.id, rotulo: p.rotulo, quien: n[p.campo] || "", cuando: p.fecha ? fechaCorta(n[p.fecha]) : "",
      estado: k <= idx ? "hecho" : k === idx + 1 ? "actual" : "pendiente" };
  });
  const dev = n.ultimaDevolucion;
  if (dev && dev.desdeEstado && n.estado !== "aprobada") {
    const p = pasos.find(x => x.id === dev.desdeEstado);
    const actual = pasos.find(x => x.estado === "actual");
    if (actual) { actual.nota = `Devuelta por ${dev.por || "—"}: ${dev.motivo || ""}`.trim(); actual.devolucion = true; }
    else if (p) p.nota = dev.motivo;
  }
  return pasos;
}
