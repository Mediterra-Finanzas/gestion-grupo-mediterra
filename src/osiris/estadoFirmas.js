/* eslint-disable */
// Estado de firmas de un contrato Exportador-Productor y de sus anexos (oct-2026).
// Solo LEE lo que la app ya registra; no inventa un circuito de aprobación:
//   · firmas: `firmadoLicenciado` (la contraparte) y `firmadoOsiris`, las mismas casillas de
//     siempre. «Firmado completo» = las dos, igual que la etiqueta que ya existía.
//   · documento: `linkContrato` (la exportación ya lo pide como «adjuntar contrato»).
//   · anexos: los fijos 1–3 (booleano antiguo u objeto) y `anexosExtra` (Anexo 4 en adelante),
//     con su activo/retirado, sus dos firmas y su documento.
// Un anexo antiguo guardado como `true` no tiene firmas registradas: se informa así, no como
// «pendiente». Quién mueve cada estado y en qué orden NO está definido en la app; eso queda como
// decisión (DECISIONES_FIRMAS), no como regla.

const txt = (v) => (v == null ? "" : String(v).trim());

export function anexosDelContrato(r) {
  const out = [];
  [["anexo1", "Anexo 1"], ["anexo2", "Anexo 2"], ["anexo3", "Anexo 3"]].forEach(([campo, rotulo]) => {
    const v = r ? r[campo] : null;
    if (v === true) out.push({ clave: campo, rotulo, activo: true, retirado: false, firmasRegistradas: false, firmaOsiris: null, firmaContraparte: null, documento: false });
    else if (v && typeof v === "object" && (v.activo || v.estadoRegistro === "retirado"))
      out.push({ clave: campo, rotulo, activo: !!v.activo, retirado: v.estadoRegistro === "retirado", firmasRegistradas: true,
        firmaOsiris: !!v.firmadoOsiris, firmaContraparte: !!v.firmadoLicenciado, documento: txt(v.link) !== "" });
  });
  (Array.isArray(r && r.anexosExtra) ? r.anexosExtra : []).forEach((v, i) => {
    if (!v || typeof v !== "object") return;
    out.push({ clave: v.id || `extra_${i}`, rotulo: `Anexo ${4 + i}`, activo: !!v.activo, retirado: v.estadoRegistro === "retirado", firmasRegistradas: true,
      firmaOsiris: !!v.firmadoOsiris, firmaContraparte: !!v.firmadoLicenciado, documento: txt(v.link) !== "" });
  });
  return out;
}

export function estadoFirmasContrato(r) {
  const contraparte = txt(r && r.razonSocial) || "Licenciado";
  const firmas = [
    { quien: "Licenciado", nombre: contraparte, hecho: !!(r && r.firmadoLicenciado) },
    { quien: "Osiris", nombre: "Osiris Plant Management", hecho: !!(r && r.firmadoOsiris) },
  ];
  const anexos = anexosDelContrato(r);
  const activos = anexos.filter((a) => a.activo);
  const conFirmaPendiente = activos.filter((a) => a.firmasRegistradas && !(a.firmaOsiris && a.firmaContraparte));
  const resumenAnexos = {
    activos: activos.length,
    firmadosAmbos: activos.filter((a) => a.firmasRegistradas && a.firmaOsiris && a.firmaContraparte).length,
    conFirmaPendiente: conFirmaPendiente.length,
    sinFirmasRegistradas: activos.filter((a) => !a.firmasRegistradas).length,
    sinDocumento: activos.filter((a) => !a.documento).length,
    retirados: anexos.filter((a) => a.retirado).length,
  };
  const pendientes = firmas.filter((f) => !f.hecho).map((f) => f.quien);
  const observaciones = [];
  if (pendientes.length) observaciones.push(`Firma pendiente: ${pendientes.join(" y ")}.`);
  if (!txt(r && r.linkContrato)) observaciones.push("Sin documento del contrato adjunto.");
  conFirmaPendiente.forEach((a) => {
    const falta = [!a.firmaContraparte && "Licenciado", !a.firmaOsiris && "Osiris"].filter(Boolean).join(" y ");
    observaciones.push(`${a.rotulo} activo con firma pendiente de ${falta}.`);
  });
  if (resumenAnexos.sinFirmasRegistradas) observaciones.push(`${resumenAnexos.sinFirmasRegistradas} anexo(s) antiguo(s) sin firmas registradas.`);
  return { firmas, firmadoCompleto: !pendientes.length, documento: !!txt(r && r.linkContrato), anexos, resumenAnexos, observaciones };
}

// Reglas de negocio que la app NO define hoy. Se presentan para decidir, no se aplican.
export const DECISIONES_FIRMAS = [
  "¿Un anexo activo con una sola firma cuenta como vigente para el cálculo de royalties, o solo cuando firman las dos partes?",
  "¿Quién puede marcar «Firmado OSIRIS»: cualquiera con edición en Osiris, o una persona o cargo determinado?",
  "¿Debe existir el documento adjunto antes de marcar una firma?",
  "Contratos Exportador-Productor no tienen un campo de estado (Obtentores y Viveros sí: Borrador → … → Terminado). ¿Se agrega, o basta con firmas + vigencia por fecha de término?",
];
