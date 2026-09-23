/* eslint-disable */
// ══════════════════════════════════════════════════════════════════
// Osiris · Preservación (P1–P5)
//
// Funciones puras. No leen ni escriben en Supabase, no conocen React y no
// cambian ninguna regla económica: solo conservan lo registrado, señalan lo
// incoherente y evitan atribuir dos veces la misma orden.
//
// P1 fusionarTandas            · regenerar sugerencias sin perder antecedentes
// P2 darDeBajaPlantacion       · baja que conserva el registro y su historial
// P3 puedeEditarFilaRP         · misma edición por fila, respetando permisos
// P4 detectarInconsistencia    · señalar sin cambiar estado
// P5 resolverAtribucionOC      · órdenes ambiguas visibles, nunca duplicadas
// ══════════════════════════════════════════════════════════════════

const txt = (v) => (v === undefined || v === null ? "" : String(v).trim());
const norm = (v) => txt(v).toLowerCase();
const num = (v) => {
  const n = parseFloat(v);
  return isNaN(n) ? null : n;
};

// ── Antecedentes: lo que nunca se puede perder ni sobrescribir ──────
export const CAMPOS_ANTECEDENTE = ["nFact", "fechaPago", "estadoCF", "pagado", "montoFacturado", "fechaEst"];

export function tieneAntecedentes(cuota) {
  if (!cuota) return false;
  return CAMPOS_ANTECEDENTE.some((c) => {
    const v = cuota[c];
    if (c === "pagado") return v === true;
    return txt(v) !== "";
  });
}

// ══════════════════════════════════════════════════════════════════
// P1 · Regenerar sugerencias conservando lo registrado
// ══════════════════════════════════════════════════════════════════
// Devuelve { activas, revision, resumen }.
//  · activas  = las cuotas existentes, intactas, más las sugerencias que no
//               se parecen a ninguna existente.
//  · revision = sugerencias cuya correspondencia con una cuota existente no
//               es segura. No son obligación: quedan a la espera de que una
//               persona decida. Nunca se descartan en silencio.
// Ninguna cuota existente se modifica ni se elimina, tenga o no antecedentes.
// `enRevision` son las sugerencias que ya esperan decisión de una persona: si se vuelve a pulsar
// el botón, no se repiten. Repetir la operación no duplica cuotas ni sugerencias.
export function fusionarTandas(existentes, sugeridas, enRevision) {
  const prev = Array.isArray(existentes) ? existentes.slice() : [];
  const sug = Array.isArray(sugeridas) ? sugeridas : [];
  const yaEnRevision = Array.isArray(enRevision) ? enRevision : [];
  const huella = (x) => `${txt(x.fechaEvento)}|${num(x.nPlantas)}|${txt(x.descripcion)}`;
  const huellasRevision = new Set(yaEnRevision.map(huella));
  let repetidas = 0;

  const usadas = new Set(); // ids de existentes ya emparejadas exactamente
  const nuevas = [];
  const revision = [];

  sug.forEach((s) => {
    const sFecha = txt(s.fechaEvento);
    const sPl = num(s.nPlantas);

    // 0) Ya está esperando revisión por una pasada anterior: no se repite.
    if (huellasRevision.has(huella(s))) { repetidas++; return; }

    // 1) Correspondencia exacta: misma fecha y misma cantidad. Se conserva la
    //    existente tal cual y la sugerencia no aporta nada.
    const exacta = prev.find(
      (p) => !usadas.has(p.id) && txt(p.fechaEvento) === sFecha && sFecha !== "" && num(p.nPlantas) !== null && num(p.nPlantas) === sPl
    );
    if (exacta) {
      usadas.add(exacta.id);
      return;
    }

    // 2) Parecidas: coincide la fecha o la cantidad, pero no ambas. No se
    //    puede afirmar que sean la misma cuota.
    const parecidas = prev.filter((p) => {
      if (usadas.has(p.id)) return false;
      const mismaFecha = sFecha !== "" && txt(p.fechaEvento) === sFecha;
      const mismasPlantas = sPl !== null && num(p.nPlantas) === sPl;
      return mismaFecha || mismasPlantas;
    });

    if (parecidas.length > 0) {
      revision.push({
        ...s,
        _revision: true,
        _motivo:
          parecidas.length > 1
            ? "Se parece a varias cuotas ya registradas"
            : "Se parece a una cuota ya registrada, pero no coincide del todo",
        _candidatos: parecidas.map((p) => ({
          id: p.id,
          descripcion: p.descripcion || "",
          fechaEvento: p.fechaEvento || "",
          nPlantas: p.nPlantas,
          conAntecedentes: tieneAntecedentes(p),
        })),
      });
      return;
    }

    // 3) Sin ninguna cuota parecida: es nueva y se puede activar.
    nuevas.push({ ...s });
  });

  return {
    activas: prev.concat(nuevas),
    revision,
    resumen: {
      conservadas: prev.length,
      agregadas: nuevas.length,
      enRevision: revision.length,
      yaEstabanEnRevision: repetidas,
      conAntecedentesConservados: prev.filter(tieneAntecedentes).length,
    },
  };
}

// Suma de plantas de las cuotas activas. Sirve para comprobar que una
// regeneración no duplicó importes.
export function totalPlantas(cuotas) {
  return (cuotas || []).reduce((s, c) => s + (num(c.nPlantas) || 0), 0);
}

// ══════════════════════════════════════════════════════════════════
// P2 · Baja de plantas que conserva el registro
// ══════════════════════════════════════════════════════════════════
// La baja NO elimina la fila y NO altera ningún importe por sí sola: su
// efecto económico depende de una decisión contractual que todavía no está
// tomada. La pantalla debe decirlo.
export const AVISO_BAJA_SIN_EFECTO =
  "La baja conserva el registro para respaldo. No suspende el cálculo del royalty: su efecto económico está pendiente de definición contractual.";

export function darDeBajaPlantacion(pl, datos) {
  if (!pl) return pl;
  const d = datos || {};
  const evento = {
    accion: "baja",
    motivo: txt(d.motivo),
    usuario: txt(d.usuario),
    fecha: txt(d.fecha) || new Date().toISOString(),
    documento: txt(d.documento),
  };
  return {
    ...pl,
    estadoRegistro: "baja",
    baja: evento,
    historial: (pl.historial || []).concat([evento]),
  };
}

export function revertirBajaPlantacion(pl, datos) {
  if (!pl) return pl;
  const d = datos || {};
  const evento = {
    accion: "reactivacion",
    motivo: txt(d.motivo),
    usuario: txt(d.usuario),
    fecha: txt(d.fecha) || new Date().toISOString(),
  };
  const copia = { ...pl, estadoRegistro: "vigente", historial: (pl.historial || []).concat([evento]) };
  delete copia.baja;
  return copia;
}

export function esBaja(pl) {
  return !!pl && pl.estadoRegistro === "baja";
}

// Las plantaciones dadas de baja siguen en la lista y siguen contando igual
// que antes. Esta función existe para que la UI las pueda distinguir, no para
// excluirlas de ningún cálculo.
export function separarPorRegistro(plantaciones) {
  const todas = Array.isArray(plantaciones) ? plantaciones : [];
  return { todas, vigentes: todas.filter((p) => !esBaja(p)), dadasDeBaja: todas.filter(esBaja) };
}

// ══════════════════════════════════════════════════════════════════
// P3 · Edición por fila
// ══════════════════════════════════════════════════════════════════
// Mismo permiso que el resto del módulo. Editar una fila no toca las demás y
// no marca pagos por su cuenta.
export function puedeEditarFilaRP(permiso) {
  return permiso === true || permiso === "editar";
}

// Aplica un cambio a UNA fila identificada por su clave, dentro de un mapa de
// antecedentes por fila (una sola fuente por dato). Devuelve un mapa nuevo.
export function aplicarCambioFila(mapa, clave, cambios) {
  const base = mapa && typeof mapa === "object" ? mapa : {};
  const k = txt(clave);
  if (!k) return base;
  const anterior = base[k] || {};
  const siguiente = { ...anterior };
  Object.keys(cambios || {}).forEach((campo) => {
    siguiente[campo] = cambios[campo];
  });
  return { ...base, [k]: siguiente };
}

// ══════════════════════════════════════════════════════════════════
// P4 · Señalar incoherencias sin resolverlas
// ══════════════════════════════════════════════════════════════════
// Una fecha de pago no convierte una cuota en pagada. Solo se señala.
export function detectarInconsistencia(fila) {
  if (!fila) return null;
  const conFecha = txt(fila.fechaPago) !== "";
  const estado = txt(fila.estadoCF) || (fila.pagado ? "pagado" : "porCobrar");
  if (conFecha && estado !== "pagado") {
    return {
      tipo: "fechaPagoSinEstadoPagado",
      mensaje: "Tiene fecha de pago registrada y sigue como " + (estado === "porCobrar" ? "por cobrar" : estado) + ". Requiere confirmación.",
      fechaPago: txt(fila.fechaPago),
      estado,
    };
  }
  if (!conFecha && estado === "pagado" && txt(fila.nFact) === "") {
    return {
      tipo: "pagadoSinRespaldo",
      mensaje: "Marcada como pagada sin número de factura ni fecha de pago.",
      estado,
    };
  }
  return null;
}

export function listarInconsistencias(filas) {
  return (filas || [])
    .map((f) => {
      const i = detectarInconsistencia(f);
      return i ? { clave: f.cuotaId || f.id, fila: f, inconsistencia: i } : null;
    })
    .filter(Boolean);
}

// La confirmación la hace una persona, fila por fila, y queda registrada.
export function confirmarEstadoFila(antecedentes, clave, estado, quien, cuando) {
  return aplicarCambioFila(antecedentes, clave, {
    estadoCF: estado,
    pagado: estado === "pagado",
    confirmadoPor: txt(quien),
    confirmadoEn: txt(cuando) || new Date().toISOString(),
  });
}

// ══════════════════════════════════════════════════════════════════
// P5 · Atribución de órdenes de compra sin duplicar
// ══════════════════════════════════════════════════════════════════
// Una orden pertenece a un contrato y solo a uno. Si no se puede determinar
// cuál, queda pendiente de asignación: visible, con su valor, fuera de la
// atribución. Nunca desaparece ni se muestra en cero.
export const MOTIVOS_PENDIENTE = {
  AMBIGUA: "El cliente tiene más de un contrato y la orden no declara a cuál pertenece",
  SIN_CONTRATO: "No hay contrato que corresponda a esta orden",
  CONTRATO_INEXISTENTE: "La orden declara un contrato que no existe",
};

function candidatosPorCliente(oc, contratos) {
  const ocCliente = norm(oc && oc.cliente_nombre);
  return (contratos || []).filter((ct) => {
    if (oc.cliente_id && ct.clienteId && oc.cliente_id === ct.clienteId) return true;
    if (ocCliente && (norm(ct.razonSocial) === ocCliente || norm(ct.cliente) === ocCliente)) return true;
    return false;
  });
}

export function resolverAtribucionOC(oc, contratos) {
  if (!oc) return { contratoId: null, pendiente: true, motivo: MOTIVOS_PENDIENTE.SIN_CONTRATO, candidatos: [] };
  const lista = Array.isArray(contratos) ? contratos : [];

  // 1) Contrato declarado: manda siempre, igual que hoy.
  if (oc.contrato_id) {
    const ct = lista.find((c) => c.id === oc.contrato_id);
    if (ct) return { contratoId: ct.id, pendiente: false, motivo: "", candidatos: [ct.id] };
    return { contratoId: null, pendiente: true, motivo: MOTIVOS_PENDIENTE.CONTRATO_INEXISTENTE, candidatos: [] };
  }

  // 2) Sin contrato declarado: se resuelve solo si hay exactamente uno.
  const cand = candidatosPorCliente(oc, lista);
  if (cand.length === 1) return { contratoId: cand[0].id, pendiente: false, motivo: "", candidatos: [cand[0].id] };
  if (cand.length > 1)
    return { contratoId: null, pendiente: true, motivo: MOTIVOS_PENDIENTE.AMBIGUA, candidatos: cand.map((c) => c.id) };
  return { contratoId: null, pendiente: true, motivo: MOTIVOS_PENDIENTE.SIN_CONTRATO, candidatos: [] };
}

// Reemplazo directo de la comprobación actual "¿esta OC es de este contrato?".
export function ocLigadaAContratoSinDuplicar(oc, ct, contratos) {
  if (!oc || !ct) return false;
  return resolverAtribucionOC(oc, contratos).contratoId === ct.id;
}

// Reparto completo: toda orden queda atribuida o pendiente, nunca en ambas ni
// en ninguna. La suma se conserva.
export function repartirOrdenes(ordenes, contratos) {
  const ocs = Array.isArray(ordenes) ? ordenes : [];
  const atribuidas = {};
  const pendientes = [];
  ocs.forEach((oc) => {
    const r = resolverAtribucionOC(oc, contratos);
    if (r.pendiente) pendientes.push({ oc, motivo: r.motivo, candidatos: r.candidatos });
    else (atribuidas[r.contratoId] = atribuidas[r.contratoId] || []).push(oc);
  });
  const nAtribuidas = Object.keys(atribuidas).reduce((s, k) => s + atribuidas[k].length, 0);
  return { atribuidas, pendientes, cuadra: nAtribuidas + pendientes.length === ocs.length, total: ocs.length };
}
