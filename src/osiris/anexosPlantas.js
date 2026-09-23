/* eslint-disable */
// ══════════════════════════════════════════════════════════════════
// Osiris · Pedidos de Nicolás (correo del 24-ago)
//
// 1. Anexo de eliminación de plantas, vinculado a las plantaciones.
// 2. Tipo de contrato "Pruebas".
// 3. Asignación explícita de una orden a un contrato.
//
// Funciones puras. NO cambian ningún royalty ni ninguna condición económica:
// registran documentos y vínculos, y conservan lo que ya estaba.
// ══════════════════════════════════════════════════════════════════

const txt = (v) => (v === undefined || v === null ? "" : String(v).trim());
const num = (v) => { const n = parseFloat(v); return isNaN(n) ? 0 : n; };

// ── 1 · Anexo de eliminación de plantas ─────────────────────────────
export const TIPO_ANEXO_ELIMINACION = "Eliminación de plantas";

export const AVISO_ANEXO_SIN_EFECTO =
  "El anexo deja constancia de la eliminación y de las plantaciones afectadas. No cambia el royalty: el efecto económico está pendiente de definición contractual.";

// El catálogo de tipos vive en los datos (`tiposAnexo`). Este tipo se agrega
// siempre desde el código, sin tocar esos datos, para que exista aunque el
// catálogo guardado sea anterior.
export function catalogoConEliminacion(lista) {
  const base = Array.isArray(lista) ? lista.filter((x) => txt(x) !== "") : [];
  return base.includes(TIPO_ANEXO_ELIMINACION) ? base : base.concat([TIPO_ANEXO_ELIMINACION]);
}

export function esAnexoEliminacion(anx) {
  return !!anx && txt(anx.tipo) === TIPO_ANEXO_ELIMINACION;
}

export function crearAnexoEliminacion(datos) {
  const d = datos || {};
  const evento = {
    accion: "alta",
    usuario: txt(d.usuario),
    fecha: txt(d.fecha) || new Date().toISOString(),
  };
  return {
    id: txt(d.id) || `anx_${Date.now()}`,
    tipo: TIPO_ANEXO_ELIMINACION,
    activo: true,
    link: txt(d.link),
    firmadoOsiris: !!d.firmadoOsiris,
    firmadoLicenciado: !!d.firmadoLicenciado,
    fechaEfecto: txt(d.fechaEfecto),
    plantasDeclaradas: d.plantasDeclaradas === undefined || d.plantasDeclaradas === "" ? "" : num(d.plantasDeclaradas),
    plantacionIds: Array.isArray(d.plantacionIds) ? d.plantacionIds.slice() : [],
    observacion: txt(d.observacion),
    historial: [evento],
  };
}

// Vincular o desvincular plantaciones NUNCA borra el anexo ni sus documentos.
export function vincularPlantaciones(anexo, ids, datos) {
  if (!anexo) return anexo;
  const d = datos || {};
  const nuevos = Array.isArray(ids) ? ids.filter((x) => txt(x) !== "") : [];
  const antes = Array.isArray(anexo.plantacionIds) ? anexo.plantacionIds : [];
  if (antes.length === nuevos.length && antes.every((x) => nuevos.includes(x))) return anexo;
  return {
    ...anexo,
    plantacionIds: nuevos,
    historial: (anexo.historial || []).concat([{
      accion: "vinculo",
      usuario: txt(d.usuario),
      fecha: txt(d.fecha) || new Date().toISOString(),
      antes: antes.slice(),
      despues: nuevos.slice(),
    }]),
  };
}

// Retirar un anexo no lo borra: queda inactivo, con su documento y su historial.
export function retirarAnexo(anexo, datos) {
  if (!anexo) return anexo;
  const d = datos || {};
  return {
    ...anexo,
    activo: false,
    estadoRegistro: "retirado",
    historial: (anexo.historial || []).concat([{
      accion: "retiro",
      motivo: txt(d.motivo),
      usuario: txt(d.usuario),
      fecha: txt(d.fecha) || new Date().toISOString(),
    }]),
  };
}

export function tieneRespaldo(anexo) {
  if (!anexo) return false;
  return txt(anexo.link) !== "" || (Array.isArray(anexo.plantacionIds) && anexo.plantacionIds.length > 0);
}

export function anexosDeLaPlantacion(plantacionId, anexos) {
  const id = txt(plantacionId);
  return (Array.isArray(anexos) ? anexos : []).filter(
    (a) => esAnexoEliminacion(a) && (a.plantacionIds || []).some((x) => txt(x) === id)
  );
}

// Una baja está RESPALDADA solo si un anexo **activo y con documento** la vincula.
// Un vínculo por sí solo no es respaldo: sin documento, o con el anexo retirado,
// la baja sigue sin documentar.
//
// Qué significa y qué NO significa "respaldada": significa únicamente que existe un
// anexo activo, con documento adjunto, que menciona esa plantación. NO significa que
// alguien haya validado el contenido del documento, ni que la eliminación de las
// plantas se haya hecho efectivamente en el campo. Son tres cosas distintas y el
// sistema solo comprueba la primera.
export function respaldaBaja(anexo) {
  return esAnexoEliminacion(anexo) && anexo.activo !== false && txt(anexo.link) !== "";
}

// Resumen para la pantalla. `sinEfectoEconomico` es siempre true: es un registro
// documental, no un cálculo.
export function resumenEliminaciones(contrato) {
  const c = contrato || {};
  const anexos = (Array.isArray(c.anexosExtra) ? c.anexosExtra : []).filter(esAnexoEliminacion);
  const activos = anexos.filter((a) => a.activo !== false);
  const conRespaldo = anexos.filter(respaldaBaja);
  const vinculadas = new Set();   // mencionadas por un anexo activo, con o sin documento
  activos.forEach((a) => (a.plantacionIds || []).forEach((x) => vinculadas.add(txt(x))));
  const respaldadas = new Set();  // mencionadas por un anexo activo CON documento
  conRespaldo.forEach((a) => (a.plantacionIds || []).forEach((x) => respaldadas.add(txt(x))));
  const plantaciones = Array.isArray(c.plantaciones) ? c.plantaciones : [];
  const deBaja = plantaciones.filter((p) => p.estadoRegistro === "baja");
  // El conteo recorre TODAS las plantaciones dadas de baja del contrato, una por una.
  // Las plantaciones vinculadas que no están dadas de baja se informan aparte: el anexo
  // puede mencionarlas, pero no son bajas y no entran en este conteo.
  const idsBaja = new Set(deBaja.map((p) => txt(p.id)));
  return {
    anexos: anexos.length,
    anexosActivos: activos.length,
    anexosRetirados: anexos.length - activos.length,
    anexosConDocumento: conRespaldo.length,
    bajasTotales: deBaja.length,
    bajasRespaldadas: deBaja.filter((p) => respaldadas.has(txt(p.id))).length,
    vinculadasQueNoSonBaja: [...vinculadas].filter((id) => !idsBaja.has(id)).length,
    plantacionesVinculadas: vinculadas.size,
    plantacionesRespaldadas: respaldadas.size,
    plantasDeclaradas: conRespaldo.reduce((s, a) => s + num(a.plantasDeclaradas), 0),
    // Bajas sin respaldo: no basta con estar vinculadas, hace falta anexo activo con documento.
    bajasSinAnexo: deBaja.filter((p) => !respaldadas.has(txt(p.id))).map((p) => p.id),
    // Vinculadas pero sin documento: el caso que no se puede dar por respaldado.
    bajasVinculadasSinDocumento: deBaja.filter((p) => vinculadas.has(txt(p.id)) && !respaldadas.has(txt(p.id))).map((p) => p.id),
    sinEfectoEconomico: true,
  };
}

// ── 2 · Tipo de contrato "Pruebas" ──────────────────────────────────
export const TIPO_CONTRATO_PRUEBAS = "Pruebas";

export const AVISO_TIPO_PRUEBAS =
  "Contrato de pruebas. Sus condiciones económicas no están confirmadas: el sistema no aplica ninguna exención ni cambia ningún cálculo por este tipo.";

export function catalogoConPruebas(lista) {
  const base = Array.isArray(lista) ? lista.filter((x) => txt(x) !== "") : [];
  return base.includes(TIPO_CONTRATO_PRUEBAS) ? base : base.concat([TIPO_CONTRATO_PRUEBAS]);
}

export function esContratoDePruebas(ct) {
  return !!ct && txt(ct.tipoContrato) === TIPO_CONTRATO_PRUEBAS;
}

// ── 3 · Asignación explícita de una orden a un contrato ─────────────
// Solo por decisión de una persona. Nada se reasigna solo, y todo lo demás de
// la orden (despachos, facturas, cuotas) se conserva tal cual.
export function asignarOrdenAContrato(oc, contratoId, datos) {
  if (!oc) return oc;
  const d = datos || {};
  const destino = txt(contratoId);
  if (!destino) return oc;
  if (txt(oc.contrato_id) === destino) return oc;
  return {
    ...oc,
    contrato_id: destino,
    historialAsignacion: (oc.historialAsignacion || []).concat([{
      accion: "asignacion",
      desde: txt(oc.contrato_id),
      hacia: destino,
      usuario: txt(d.usuario),
      fecha: txt(d.fecha) || new Date().toISOString(),
    }]),
  };
}

// Quitar la asignación devuelve la orden a "pendiente", sin perder el historial.
export function desasignarOrden(oc, datos) {
  if (!oc || txt(oc.contrato_id) === "") return oc;
  const d = datos || {};
  const copia = {
    ...oc,
    historialAsignacion: (oc.historialAsignacion || []).concat([{
      accion: "desasignacion",
      desde: txt(oc.contrato_id),
      hacia: "",
      usuario: txt(d.usuario),
      fecha: txt(d.fecha) || new Date().toISOString(),
    }]),
  };
  delete copia.contrato_id;
  return copia;
}

// Aplica la asignación dentro de la estructura de viveros, sin tocar nada más.
export function aplicarAsignacionEnViveros(viveros, ocId, contratoId, datos) {
  const lista = Array.isArray(viveros) ? viveros : [];
  const id = txt(ocId);
  return lista.map((v) => {
    const ocs = Array.isArray(v.ordenesCompra) ? v.ordenesCompra : null;
    if (!ocs || !ocs.some((o) => txt(o.id) === id)) return v;
    return {
      ...v,
      ordenesCompra: ocs.map((o) =>
        txt(o.id) === id
          ? (txt(contratoId) === "" ? desasignarOrden(o, datos) : asignarOrdenAContrato(o, contratoId, datos))
          : o
      ),
    };
  });
}
