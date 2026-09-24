/* eslint-disable */
// ══════════════════════════════════════════════════════════════════
// Osiris · Fenología y manejos culturales (arándanos)
//
// Funciones puras. No conocen React, no leen ni escriben en Supabase y no
// tocan la base de datos. Solo describen el catálogo y preservan lo ya
// registrado.
//
// ORIGEN DE LOS DATOS
// El Excel de Nicolás Fuenzalida trae dos hojas:
//   · "Manejos por estado" — 9 estados × 6 labores, lista simple, sin opciones.
//   · "Hoja1"              — 8 estados, cada labor con su juego de desplegables.
// Se modela "Hoja1" como CATÁLOGO OPERATIVO porque es la única que trae las
// opciones de respuesta. La diferencia entre ambas hojas NO se resuelve acá:
// queda registrada en faltantesDefinicion() para que la zanje el CFO.
//
// TIPOS DE RESPUESTA (cinco, deliberadamente pocos)
//   "opcion_unica"              Una alternativa excluyente de labor.opciones.
//                               Cubre Bajo/Adecuado/Excesivo, Presencia/Ausencia,
//                               Baja/Adecuada/Óptima, Realizado/Pendiente/No aplica,
//                               Sanas/Deficientes, Sí/No y Buena/Regular/Deficiente.
//   "numero"                    Valor numérico libre (CE, frecuencia de pasadas,
//                               número de tocones). El Excel NO trae unidad:
//                               labor.unidad es null y eso es "sin definir",
//                               nunca cero ni un default.
//   "macronutrientes"           Cuadro con un valor por nutriente. labor.campos
//                               trae N/P/K/Ca/Mg solo donde el Excel los lista;
//                               en el resto campos es [] y camposSinDefinir true.
//   "observacion_recomendacion" Dos textos libres: Observación y Recomendación.
//   "comentario"                Solo comentario libre.
//
// ESTRUCTURA
//   estado = { codigo, nombre, etiquetaExcel, orden, labores:[...] }
//   labor  = { n, nombre, tipoRespuesta, opciones:[], pideFecha, pideComentario,
//              campos:[], unidad, camposSinDefinir, notaExcel }
//
// REGLA TRANSVERSAL: PRESERVAR. Nada de lo ya guardado se borra ni se renombra
// en silencio. Los valores del catálogo legacy de OsirisModule.jsx que no
// existen acá sobreviven marcados { origen: "legacy" }.
// ══════════════════════════════════════════════════════════════════

// ── utilidades internas ───────────────────────────────────────────

const txt = (v) => (v === undefined || v === null ? "" : String(v).trim());

// Normaliza para comparar: sin tildes, minúsculas, sin el prefijo numérico que
// usa la Hoja1 ("1. ", "2- ", "8- "), espacios colapsados.
function norm(v) {
  return txt(v)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/^\d+\s*[.\-–)]\s*/, "")
    .replace(/\s*\/\s*/g, " / ")
    .replace(/\s+/g, " ")
    .trim();
}

// Quita el prefijo numérico dejando el nombre legible, conservando tildes.
function sinPrefijo(v) {
  return txt(v).replace(/^\d+\s*[.\-–)]\s*/, "").trim();
}

function esNumeroFinito(v) {
  if (typeof v === "number") return isFinite(v);
  const s = txt(v);
  if (s === "") return false;
  const n = Number(s.replace(",", "."));
  return !isNaN(n) && isFinite(n);
}

// ── constructores de labor (una por tipo de respuesta) ────────────

function laborBase(n, nombre, tipoRespuesta, extra) {
  return Object.assign(
    {
      n,
      nombre,
      tipoRespuesta,
      opciones: [],
      pideFecha: false,
      pideComentario: false,
      campos: [],
      unidad: null,
      camposSinDefinir: false,
      notaExcel: "",
    },
    extra || {}
  );
}

// Opciones excluyentes. pideComentario/pideFecha salen de lo que trae el Excel.
const opcion = (n, nombre, opciones, pideComentario, pideFecha) =>
  laborBase(n, nombre, "opcion_unica", {
    opciones: opciones.slice(),
    pideComentario: !!pideComentario,
    pideFecha: !!pideFecha,
  });

// Valor numérico libre. El Excel no declara unidad en ningún caso.
const numero = (n, nombre, pideComentario) =>
  laborBase(n, nombre, "numero", { pideComentario: !!pideComentario, unidad: null });

// Cuadro de macronutrientes. campos solo donde el Excel los enumera.
const macro = (n, nombre, campos, pideComentario) =>
  laborBase(n, nombre, "macronutrientes", {
    campos: (campos || []).slice(),
    camposSinDefinir: !campos || campos.length === 0,
    pideComentario: !!pideComentario,
  });

// Observación + Recomendación, ambos texto libre. El Excel no agrega
// "Comentarios" en estas labores.
const obsRec = (n, nombre) =>
  laborBase(n, nombre, "observacion_recomendacion", {
    campos: ["Observación", "Recomendación"],
  });

// Solo comentario.
const comentario = (n, nombre, notaExcel) =>
  laborBase(n, nombre, "comentario", { pideComentario: true, notaExcel: txt(notaExcel) });

// Juegos de opciones tal como vienen del Excel (literales, sin retoques).
const OPC_RIEGO = ["Bajo", "Adecuado", "Excesivo"];
const OPC_PRESENCIA = ["Presencia", "Ausencia"];
const OPC_NIVEL = ["Baja", "Adecuada", "Óptima"];
const OPC_EJECUCION = ["Realizado", "Pendiente", "No aplica"];
const OPC_RAICES = ["Sanas", "Deficientes"];
const OPC_SI_NO = ["Si", "No"]; // literal del Excel, sin tilde. Ver faltante FEN-09.
const OPC_LIMPIEZA = ["Buena", "Regular", "Deficiente"];
const MACRONUTRIENTES = ["N", "P", "K", "Ca", "Mg"];

function estado(codigo, etiquetaExcel, orden, labores) {
  return { codigo, nombre: sinPrefijo(etiquetaExcel), etiquetaExcel, orden, labores };
}

// ── catálogo operativo (hoja "Hoja1") ─────────────────────────────

export const ESTADOS_FENOLOGICOS = [
  estado("EST-01", "1. Establecimiento", 1, [
    comentario(1, "Uniformidad establecimiento", "Segregación de plantas por vigor"),
    opcion(2, "Riego de establecimiento", OPC_RIEGO, true),
    opcion(3, "Control de malezas", OPC_PRESENCIA, true),
    opcion(4, "Monitoreo de plagas", OPC_PRESENCIA, true),
    opcion(5, "Revisión emisión de raíces", OPC_NIVEL, true),
    opcion(6, "Revisión emisión de brotes", OPC_NIVEL, true),
    opcion(7, "Revisión % de humedad del sustrato", OPC_NIVEL, true),
    macro(8, "Fertilización", MACRONUTRIENTES, true),
    numero(9, "CE", true),
  ]),
  estado("EST-02", "2- Crecimiento Vegetativo", 2, [
    opcion(1, "Pinchado", OPC_EJECUCION, true, true),
    opcion(2, "Desflore", OPC_EJECUCION, true, true),
    opcion(3, "Poda limpieza de brotes débiles", OPC_EJECUCION, true, true),
    opcion(4, "Revisión emisión de raíces", OPC_NIVEL, true),
    opcion(5, "Revisión emisión de brotes", OPC_NIVEL, true),
    opcion(6, "Revisión % de humedad del sustrato", OPC_NIVEL, true),
    macro(7, "Fertilización", [], true),
    opcion(8, "Control de malezas", OPC_PRESENCIA, true),
    opcion(9, "Monitoreo de plagas", OPC_PRESENCIA, true),
    numero(10, "CE", true),
    comentario(11, "Biometría"),
  ]),
  estado("EST-03", "3- Inducción de yemas", 3, [
    opcion(1, "Pinchado", OPC_EJECUCION, true, true),
    opcion(2, "Revisión estado de raíces", OPC_RAICES, true),
    opcion(3, "Revisión % de humedad del sustrato", OPC_NIVEL, true),
    macro(4, "Fertilización", [], true),
    comentario(5, "Ajustes mediante aplicaciones foliares"),
    opcion(6, "Control de malezas", OPC_PRESENCIA, true),
    opcion(7, "Monitoreo de plagas", OPC_PRESENCIA, true),
    numero(8, "CE", true),
    comentario(9, "Biometría"),
  ]),
  estado("EST-04", "4- Floración y cuajado", 4, [
    // El Excel pone acá el cuadro de macronutrientes; parece copiado de
    // Fertilización. No se corrige por cuenta propia: faltante FEN-02.
    macro(1, "Polinización / colmenas", [], true),
    opcion(2, "Revisión estado de raíces", OPC_RAICES, true),
    opcion(3, "Revisión % de humedad del sustrato", OPC_NIVEL, true),
    macro(4, "Fertilización", [], true),
    comentario(5, "Ajustes mediante aplicaciones foliares"),
    opcion(6, "Control de malezas", OPC_PRESENCIA, true),
    opcion(7, "Monitoreo de plagas", OPC_PRESENCIA, true),
    numero(8, "CE", true),
    comentario(9, "Biometría"),
  ]),
  estado("EST-05", "5- Crecimiento y Llenado del Fruto", 5, [
    macro(1, "Polinización / colmenas", [], true), // ídem faltante FEN-02
    opcion(2, "Revisión estado de raíces", OPC_RAICES, true),
    opcion(3, "Revisión % de humedad del sustrato", OPC_NIVEL, true),
    macro(4, "Fertilización", [], true),
    opcion(5, "Monitoreo de plagas", OPC_PRESENCIA, true),
    opcion(6, "Control de malezas", OPC_PRESENCIA, true),
    numero(7, "CE", true),
  ]),
  estado("EST-06", "6- Cosecha", 6, [
    numero(1, "Frecuencia de pasadas", true),
    obsRec(2, "Cadena de frío en campo"),
    obsRec(3, "Revisión firmeza, calibres y ajustes nutricionales"),
    numero(4, "CE", true),
  ]),
  estado("EST-07", "7- Post-Cosecha y Acumulación de Reservas", 7, [
    obsRec(1, "Revisión estado de las plantas"),
    macro(2, "Ajuste fase nutricional", [], true),
    numero(3, "CE", true),
    opcion(4, "Revisión estado de raíces", OPC_RAICES, true),
  ]),
  estado("EST-08", "8- Poda", 8, [
    opcion(1, "Poda", OPC_EJECUCION, true, true),
    numero(2, "Número de tocones", true),
    comentario(3, "Segregación de plantas"),
    opcion(4, "Uso de tirasavia", OPC_SI_NO, true),
    opcion(5, "Limpieza de cuartel", OPC_LIMPIEZA, true),
    opcion(6, "Control de malezas", OPC_PRESENCIA, true),
    numero(7, "CE", true),
  ]),
];

// Catálogos legacy que hoy viven en OsirisModule.jsx (~línea 5758). Se copian
// acá solo como referencia de lectura para reconocer valores históricos; el
// archivo original no se toca.
export const ESTADOS_FENOL_LEGACY = [
  "Brotación",
  "Floración",
  "Cuaja",
  "Desarrollo de fruto",
  "Cosecha",
  "Postcosecha",
  "Receso",
];

export const LABORES_CULT_LEGACY = [
  "Poda",
  "Amarra / conducción",
  "Raleo",
  "Manejo de brotes",
  "Control de malezas",
  "Manejo de mulch",
  "Manejo de camellones / sustrato",
  "Limpieza de entrehilera",
  "Despunte",
  "Cosecha",
];

// Labores de la hoja "Manejos por estado" que no aparecen en Hoja1. Se dejan
// listadas para el faltante FEN-01; no entran al catálogo operativo.
export const LABORES_SOLO_HOJA_MANEJOS = [
  "Segregación de plantas por vigor",
  "Amarre / tutoreo",
  "Limpieza de maceta",
  "Pinchado / despunte",
  "Limpieza de cañas basales",
  "Ajuste de carga",
  "Deshoje",
  "Control de Botrytis",
  "Limpieza de cañas",
  "Raleo de fruto",
  "Malla / sombreo",
  "Personal de cosecha",
  "Limpieza de plantas",
  "Descarte en campo",
  "Poda post-cosecha",
  "Manejo evergreen",
  "Riego post-cosecha",
  "Limpieza de cuartel",
  "Compensadores de frío",
  "Preparación de riego",
];

// ── 2. catálogo combinado: nuevo + todo lo ya guardado ────────────

function copiaLabor(l, origen) {
  return Object.assign({}, l, { opciones: l.opciones.slice(), campos: l.campos.slice(), origen });
}

function copiaEstado(e, origen) {
  return {
    codigo: e.codigo,
    nombre: e.nombre,
    etiquetaExcel: e.etiquetaExcel,
    orden: e.orden,
    origen,
    labores: e.labores.map((l) => copiaLabor(l, origen)),
  };
}

// Acepta strings sueltos o formas guardadas { codigo, nombre, estado, valor,
// label }. Devuelve siempre { etiqueta, estado } con texto plano.
function normalizarEntrada(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === "string" || typeof v === "number") {
    const s = txt(v);
    return s === "" ? null : { etiqueta: s, estado: "" };
  }
  if (typeof v === "object") {
    const etiqueta = txt(v.nombre || v.etiqueta || v.label || v.valor || v.codigo);
    if (etiqueta === "") return null;
    return { etiqueta, estado: txt(v.estado || v.estadoFenologico || v.fenologiaEstado) };
  }
  return null;
}

function buscarEstado(lista, etiqueta) {
  const clave = norm(etiqueta);
  if (clave === "") return null;
  for (let i = 0; i < lista.length; i++) {
    const e = lista[i];
    if (norm(e.codigo) === clave || norm(e.nombre) === clave || norm(e.etiquetaExcel) === clave) return e;
  }
  return null;
}

function buscarLabor(estadoObj, etiqueta) {
  const clave = norm(etiqueta);
  if (clave === "" || !estadoObj) return null;
  const ls = estadoObj.labores || [];
  for (let i = 0; i < ls.length; i++) if (norm(ls[i].nombre) === clave) return ls[i];
  return null;
}

function laborExisteEnCatalogo(lista, etiqueta) {
  for (let i = 0; i < lista.length; i++) if (buscarLabor(lista[i], etiqueta)) return true;
  return false;
}

/**
 * Catálogo nuevo MÁS todo estado o labor legacy / ya guardado que no esté en él.
 * Nada se descarta y nada se renombra: lo del Excel queda { origen: "excel" } y
 * lo rescatado queda { origen: "legacy" }.
 *
 * Devuelve { estados, laboresLegacy }:
 *   · estados       — los 8 del Excel más los estados guardados desconocidos,
 *                     estos últimos con labores: [] (el Excel no los define).
 *   · laboresLegacy — labores guardadas sin estado reconocible, para que la UI
 *                     igual las pueda mostrar.
 */
export function catalogoFenologicoCombinado(estadosGuardados, laboresGuardadas) {
  const estados = ESTADOS_FENOLOGICOS.map((e) => copiaEstado(e, "excel"));
  const laboresLegacy = [];
  let ordenSig = estados.length;

  const entradasEstado = (Array.isArray(estadosGuardados) ? estadosGuardados : [])
    .map(normalizarEntrada)
    .filter(Boolean);

  entradasEstado.forEach((ent) => {
    if (buscarEstado(estados, ent.etiqueta)) return; // ya cubierto por el Excel
    ordenSig += 1;
    estados.push({
      codigo: "LEG-" + norm(ent.etiqueta).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
      nombre: ent.etiqueta,
      etiquetaExcel: "",
      orden: ordenSig,
      origen: "legacy",
      labores: [],
    });
  });

  const entradasLabor = (Array.isArray(laboresGuardadas) ? laboresGuardadas : [])
    .map(normalizarEntrada)
    .filter(Boolean);

  entradasLabor.forEach((ent) => {
    const destino = ent.estado ? buscarEstado(estados, ent.estado) : null;
    if (destino) {
      if (buscarLabor(destino, ent.etiqueta)) return;
      destino.labores.push(
        Object.assign(
          laborBase(destino.labores.length + 1, ent.etiqueta, "comentario", { pideComentario: true }),
          { origen: "legacy" }
        )
      );
      return;
    }
    if (ent.estado) {
      // Estado nombrado pero desconocido: se conserva la labor igual, suelta.
      if (!laboresLegacy.some((l) => norm(l.nombre) === norm(ent.etiqueta) && norm(l.estado) === norm(ent.estado)))
        laboresLegacy.push({ nombre: ent.etiqueta, estado: ent.estado, origen: "legacy" });
      return;
    }
    if (laboresLegacy.some((l) => norm(l.nombre) === norm(ent.etiqueta) && !l.estado)) return;
    if (laborExisteEnCatalogo(estados, ent.etiqueta)) return; // ya existe en algún estado del Excel
    laboresLegacy.push({ nombre: ent.etiqueta, estado: "", origen: "legacy" });
  });

  return { estados, laboresLegacy };
}

// ── 3. resolución de un estado guardado ───────────────────────────

/**
 * Resuelve un valor guardado (legacy o nuevo) sin perderlo nunca.
 * Devuelve { valor, existeEnCatalogoNuevo, origen } donde origen es
 * "excel", "legacy" o "vacio". Si había algo guardado, valor lo conserva
 * tal como se guardó salvo que corresponda a un estado del Excel, en cuyo
 * caso valor toma el nombre canónico y se informa el código.
 */
export function estadoFenologicoVigente(valorGuardado) {
  const ent = normalizarEntrada(valorGuardado);
  if (!ent) return { valor: null, existeEnCatalogoNuevo: false, origen: "vacio", codigo: null, guardado: null };
  const e = buscarEstado(ESTADOS_FENOLOGICOS, ent.etiqueta);
  if (e)
    return {
      valor: e.nombre,
      existeEnCatalogoNuevo: true,
      origen: "excel",
      codigo: e.codigo,
      guardado: ent.etiqueta,
    };
  return {
    valor: ent.etiqueta,
    existeEnCatalogoNuevo: false,
    origen: "legacy",
    codigo: null,
    guardado: ent.etiqueta,
  };
}

// ── 4. labores de un estado ───────────────────────────────────────

/**
 * Labores de un estado, por código o etiqueta. Tolera estados legacy y
 * desconocidos: devuelve lista vacía, nunca lanza.
 * Devuelve { labores, origen, estado } con origen "excel" | "legacy" | "desconocido".
 */
export function laboresDeEstado(codigoOEtiqueta, catalogo) {
  let lista = ESTADOS_FENOLOGICOS;
  if (Array.isArray(catalogo)) lista = catalogo;
  else if (catalogo && Array.isArray(catalogo.estados)) lista = catalogo.estados;

  const e = buscarEstado(lista, codigoOEtiqueta);
  if (!e) return { labores: [], origen: "desconocido", estado: null };
  const origen = e.origen || (buscarEstado(ESTADOS_FENOLOGICOS, e.codigo || e.nombre) ? "excel" : "legacy");
  return { labores: (e.labores || []).slice(), origen, estado: e };
}

// ── 5. validación de una respuesta ────────────────────────────────

// Acepta la respuesta como objeto o como atajo (string / número = valor).
function normalizarRespuesta(r) {
  if (r === null || r === undefined) return null;
  if (typeof r === "object" && !Array.isArray(r)) return r;
  return { valor: r };
}

/**
 * Comprueba que una respuesta calce con el tipo de la labor.
 * Devuelve { ok, motivo }. No inventa valores por defecto: una respuesta
 * ausente es ausente, no es cero ni la primera opción.
 * Cuando el Excel dejó algo sin definir (campos de macronutrientes, unidad),
 * se agrega la marca `pendiente` con el código del faltante.
 */
export function validarRespuestaLabor(labor, respuesta) {
  if (!labor || typeof labor !== "object") return { ok: false, motivo: "Labor no reconocida." };
  const r = normalizarRespuesta(respuesta);
  if (!r) return { ok: false, motivo: "Sin respuesta registrada." };

  const tipo = labor.tipoRespuesta;

  if (labor.pideFecha && txt(r.fecha) !== "" && !/^\d{4}-\d{2}-\d{2}$/.test(txt(r.fecha)))
    return { ok: false, motivo: "La fecha de realización debe ir como AAAA-MM-DD." };

  if (tipo === "opcion_unica") {
    const v = txt(r.valor);
    if (v === "") return { ok: false, motivo: "Falta elegir una opción." };
    const calza = (labor.opciones || []).some((o) => norm(o) === norm(v));
    if (!calza)
      return { ok: false, motivo: 'La opción "' + v + '" no está en el listado: ' + (labor.opciones || []).join(" / ") + "." };
    return { ok: true, motivo: "" };
  }

  if (tipo === "numero") {
    if (r.valor === null || r.valor === undefined || txt(r.valor) === "")
      return { ok: false, motivo: "Falta el valor." };
    if (!esNumeroFinito(r.valor)) return { ok: false, motivo: "El valor debe ser numérico." };
    const base = { ok: true, motivo: "" };
    if (labor.unidad === null) base.pendiente = "FEN-04"; // el Excel no trae unidad
    return base;
  }

  if (tipo === "macronutrientes") {
    const vals = r.valores;
    if (!vals || typeof vals !== "object" || Array.isArray(vals) || Object.keys(vals).length === 0)
      return { ok: false, motivo: "Falta el cuadro de macronutrientes." };
    const claves = Object.keys(vals);
    for (let i = 0; i < claves.length; i++) {
      const k = claves[i];
      if (!esNumeroFinito(vals[k]))
        return { ok: false, motivo: 'El valor de "' + k + '" debe ser numérico.' };
    }
    if (!labor.camposSinDefinir) {
      const permitidos = (labor.campos || []).map(norm);
      for (let i = 0; i < claves.length; i++)
        if (permitidos.indexOf(norm(claves[i])) === -1)
          return { ok: false, motivo: 'El nutriente "' + claves[i] + '" no está definido para esta labor.' };
      return { ok: true, motivo: "" };
    }
    // El Excel solo enumera N/P/K/Ca/Mg en Establecimiento: acá no se restringe
    // ni se rellena, se informa como pendiente.
    return { ok: true, motivo: "", pendiente: "FEN-03" };
  }

  if (tipo === "observacion_recomendacion") {
    const o = txt(r.observacion);
    const rec = txt(r.recomendacion);
    if (o === "" && rec === "")
      return { ok: false, motivo: "Falta al menos una de las dos: observación o recomendación." };
    return { ok: true, motivo: "" };
  }

  if (tipo === "comentario") {
    if (txt(r.comentario) === "" && txt(r.valor) === "")
      return { ok: false, motivo: "Falta el comentario." };
    const base = { ok: true, motivo: "" };
    if (norm(labor.nombre) === "biometria") base.pendiente = "FEN-05"; // sin campos estructurados
    return base;
  }

  return { ok: false, motivo: 'Tipo de respuesta desconocido: "' + txt(tipo) + '".' };
}

// ── 6. lo que el Excel dejó sin definir ───────────────────────────

/**
 * Ambigüedades del Excel que NO se resolvieron por cuenta propia. Lo que está
 * acá el código lo trata como "sin definir": nunca como cero ni como default.
 */
export function faltantesDefinicion() {
  return [
    {
      codigo: "FEN-01",
      titulo: "Las dos hojas no coinciden: cuál gobierna",
      detalle:
        '"Manejos por estado" trae 9 estados y "Hoja1" trae 8. Hoja1 fusiona Floración con Cuaja ("4- Floración y cuajado") y Llenado con Crecimiento ("5- Crecimiento y Llenado del Fruto"). Además, ' +
        LABORES_SOLO_HOJA_MANEJOS.length +
        " labores aparecen solo en la hoja simple y quedaron fuera del catálogo operativo.",
      afecta: ["Manejos por estado", "Hoja1"],
      laboresFuera: LABORES_SOLO_HOJA_MANEJOS.slice(),
      resueltoPorClaude: false,
    },
    {
      codigo: "FEN-02",
      titulo: 'Polinización / colmenas con cuadro de macronutrientes',
      detalle:
        'En "4- Floración y cuajado" y "5- Crecimiento y Llenado del Fruto" la labor "Polinización / colmenas" trae "Cuadro de cada Macronutriente...", que parece copiado de Fertilización. Se dejó tal como está en el Excel.',
      afecta: ["EST-04", "EST-05"],
      resueltoPorClaude: false,
    },
    {
      codigo: "FEN-03",
      titulo: "Macronutrientes solo enumerados en el primer estado",
      detalle:
        "N/P/K/Ca/Mg se listan únicamente en Establecimiento. En los demás estados el cuadro existe pero sin nutrientes declarados: quedan con campos vacíos y camposSinDefinir en true. Falta confirmar si aplica el mismo juego en todos.",
      afecta: ["EST-02", "EST-03", "EST-04", "EST-05", "EST-07"],
      resueltoPorClaude: false,
    },
    {
      codigo: "FEN-04",
      titulo: "Valores numéricos sin unidad",
      detalle:
        'CE no trae unidad (¿dS/m?), "Frecuencia de pasadas" no dice por qué período y "Número de tocones" no dice si es por planta o por cuartel. unidad queda en null.',
      afecta: ["CE", "Frecuencia de pasadas", "Número de tocones"],
      resueltoPorClaude: false,
    },
    {
      codigo: "FEN-05",
      titulo: "Biometría sin campos estructurados",
      detalle:
        'La labor "Biometría" solo dice "Comentarios". No hay campos (altura, diámetro, número de cañas) definidos.',
      afecta: ["EST-02", "EST-03", "EST-04"],
      resueltoPorClaude: false,
    },
    {
      codigo: "FEN-06",
      titulo: "Uniformidad establecimiento sin opciones",
      detalle:
        'Su única entrada es "Comentarios (Segregación de plantas por vigor)". Se modeló como comentario libre con esa nota; no se sabe si debía tener opciones.',
      afecta: ["EST-01"],
      resueltoPorClaude: false,
    },
    {
      codigo: "FEN-07",
      titulo: "El catálogo legacy no mapea al nuevo",
      detalle:
        'Brotación, Desarrollo de fruto y Receso no existen en el Excel; Floración, Cuaja, Cosecha y Postcosecha tienen nombres distintos a los de Hoja1. No se hizo ningún mapeo automático: los valores históricos sobreviven marcados origen "legacy".',
      afecta: ESTADOS_FENOL_LEGACY.slice(),
      resueltoPorClaude: false,
    },
    {
      codigo: "FEN-08",
      titulo: "Las labores culturales legacy no están en el Excel",
      detalle:
        'De las 10 labores de LABORES_CULT solo "Poda" y "Control de malezas" aparecen en Hoja1. Las otras 8 no tienen equivalente y quedan como labores sueltas.',
      afecta: LABORES_CULT_LEGACY.slice(),
      resueltoPorClaude: false,
    },
    {
      codigo: "FEN-09",
      titulo: 'La opción "Si" viene sin tilde en el Excel',
      detalle:
        'En "Uso de tirasavia" el Excel escribe "Si" en lugar de "Sí". Se conservó el literal para no renombrar un valor que podría guardarse así; falta decidir si se corrige la etiqueta visible.',
      afecta: ["EST-08"],
      resueltoPorClaude: false,
    },
    {
      codigo: "FEN-10",
      titulo: '"Fecha realizacion" sin regla de obligatoriedad',
      detalle:
        'Las labores Realizado/Pendiente/No aplica traen "Fecha realizacion" (así, sin tilde), pero el Excel no dice si es obligatoria cuando se marca "Realizado". La validación la trata como opcional.',
      afecta: ["EST-02", "EST-03", "EST-08"],
      resueltoPorClaude: false,
    },
    {
      codigo: "FEN-11",
      titulo: "Observación / Recomendación sin campo de comentario",
      detalle:
        'Las labores con "Observación" y "Recomendación" no traen "Comentarios" como las demás. Falta confirmar si es omisión o si esos dos textos reemplazan al comentario.',
      afecta: ["EST-06", "EST-07"],
      resueltoPorClaude: false,
    },
    {
      codigo: "FEN-12",
      titulo: "Estados 5, 6 y 7 con menos labores que sus pares",
      detalle:
        '"5- Crecimiento y Llenado del Fruto" no incluye Biometría ni "Ajustes mediante aplicaciones foliares", que sí están en los estados 3 y 4. "6- Cosecha" tiene 4 labores y "7- Post-Cosecha" tiene 4, contra 9 a 11 de los primeros. Falta confirmar si es intencional.',
      afecta: ["EST-05", "EST-06", "EST-07"],
      resueltoPorClaude: false,
    },
    {
      codigo: "FEN-13",
      titulo: 'Columna "Reemplazar por" vacía',
      detalle:
        'La hoja "Manejos por estado" tiene una columna "Reemplazar por" sin ningún valor cargado. Se desconoce si iba a usarse para renombrar labores.',
      afecta: ["Manejos por estado"],
      resueltoPorClaude: false,
    },
  ];
}

// Conteos, útiles para pantalla y para las pruebas.
export function resumenCatalogo() {
  const labores = ESTADOS_FENOLOGICOS.reduce((s, e) => s + e.labores.length, 0);
  const tipos = {};
  ESTADOS_FENOLOGICOS.forEach((e) =>
    e.labores.forEach((l) => {
      tipos[l.tipoRespuesta] = (tipos[l.tipoRespuesta] || 0) + 1;
    })
  );
  return { estados: ESTADOS_FENOLOGICOS.length, labores, tipos, pendientes: faltantesDefinicion().length };
}
