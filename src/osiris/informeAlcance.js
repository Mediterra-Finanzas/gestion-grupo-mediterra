/* eslint-disable */
// Encabezado, alcance evaluado y variedades del informe técnico de Osiris.
//
// Mejoras pedidas por el CFO (de Nicolás Fuenzalida) sobre el informe que hoy
// vive en OsirisModule.jsx → OperacionTecnica:
//   1. Encabezado con densidad de plantación, sistema productivo y sustrato.
//   2. Varias variedades por informe (hoy es una sola: el campo `variedad`).
//   3. Alcance evaluado en hectáreas o número de plantas, SIEMPRE con la unidad.
//   4. La etiqueta "Fenología" pasa a ser "Estado fenológico predominante".
//
// Reglas que este archivo respeta:
//   - Funciones puras: sin React, sin red, sin acceso a la base.
//   - No se inventan valores por defecto: lo que falta se muestra "sin definir",
//     nunca cero ni un número sin unidad.
//   - Los informes ya emitidos se siguen leyendo igual: el campo legacy
//     `variedad` (string) y el legacy `superficie` (hectáreas) se respetan.
//   - PROHIBIDO CONVERTIR: no se calculan plantas desde hectáreas ni hectáreas
//     desde plantas, ni siquiera cuando la densidad de plantación está cargada.
//     El alcance evaluado es siempre el DECLARADO por el técnico.

export const SIN_DEFINIR = "sin definir";
export const SIN_DATO = "—";

// Unidades aceptadas para el alcance evaluado. No hay una tercera: si el
// informe trae otra cosa, el alcance queda incompleto (no se adivina).
export const UNIDADES_ALCANCE = ["ha", "plantas"];

// Texto visible de cada unidad (singular/plural resuelto en `etiquetaAlcance`).
const ETIQUETA_UNIDAD = { ha: "ha", plantas: "plantas" };

// Sinónimos que pueden venir escritos a mano o de un informe viejo.
const SINONIMOS_UNIDAD = {
  "ha": "ha", "há": "ha", "has": "ha", "hás": "ha", "hect": "ha",
  "hectarea": "ha", "hectareas": "ha", "hectárea": "ha", "hectáreas": "ha",
  "planta": "plantas", "plantas": "plantas", "n° plantas": "plantas",
  "nro plantas": "plantas", "numero de plantas": "plantas",
  "número de plantas": "plantas",
};

// Etiqueta única de la sección fenológica: la usan la pantalla y el PDF.
// OJO: solo cambia el texto visible. Las claves internas del informe
// (`fenologia`, `fenologiaEstado`, `fenologiaUniformidad`, `fenologiaObs`)
// NO se tocan, para no romper los informes guardados.
export const ETIQUETA_ESTADO_FENOLOGICO = "Estado fenológico predominante";
export const CLAVE_SECCION_FENOLOGIA = "fenologia";

export function etiquetaSeccionFenologia(prefijo) {
  const p = (prefijo || "").trim();
  return p ? p + " " + ETIQUETA_ESTADO_FENOLOGICO : ETIQUETA_ESTADO_FENOLOGICO;
}

// ---------------------------------------------------------------------------
// Campos nuevos del encabezado
// ---------------------------------------------------------------------------
// `opciones: []` + `pendienteDefinicion: true` significa que el listado todavía
// lo tiene que confirmar el CFO (ver `faltantesDefinicion`). Mientras tanto el
// campo se comporta como texto libre y nunca se rellena solo.
export const CAMPOS_ENCABEZADO = [
  {
    clave: "densidadPlantacion",
    claveUnidad: "densidadPlantacionUnidad",
    etiqueta: "Densidad de plantación",
    tipo: "numero",
    requiereUnidad: true,          // sin unidad se muestra "sin definir"
    unidadSugerida: "plantas/ha",  // sugerencia, NO valor por defecto
    opciones: [],
    pendienteDefinicion: true,     // falta confirmar la unidad oficial
  },
  {
    clave: "sistemaProductivo",
    etiqueta: "Sistema productivo",
    tipo: "opcion",
    requiereUnidad: false,
    opciones: [],
    pendienteDefinicion: true,     // falta la lista de opciones
  },
  {
    clave: "sustrato",
    etiqueta: "Sustrato",
    tipo: "opcion",
    requiereUnidad: false,
    opciones: [],
    pendienteDefinicion: true,     // falta la lista de opciones
  },
];

// Campos nuevos del alcance y de las variedades (los que se agregan al objeto
// informe, además de los tres del encabezado).
export const CAMPOS_ALCANCE = [
  { clave: "alcanceValor", etiqueta: "Alcance evaluado", tipo: "numero" },
  { clave: "alcanceUnidad", etiqueta: "Unidad del alcance", tipo: "opcion", opciones: UNIDADES_ALCANCE },
  { clave: "variedades", etiqueta: "Variedades evaluadas", tipo: "lista" },
];

// ---------------------------------------------------------------------------
// Utilidades de formato (chileno: miles con punto, decimales con coma)
// ---------------------------------------------------------------------------
export function parsearNumero(v) {
  if (typeof v === "number") return isFinite(v) ? v : null;
  if (typeof v !== "string") return null;
  let s = v.trim().replace(/\s/g, "");
  if (!s) return null;
  if (s.indexOf(",") >= 0) {
    s = s.replace(/\./g, "").replace(",", ".");          // 12.500,75 → 12500.75
  } else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) {
    s = s.replace(/\./g, "");                             // 8.400 → 8400
  }
  const n = Number(s);
  return isFinite(n) ? n : null;
}

export function formatearNumero(n, maxDecimales) {
  const dec = typeof maxDecimales === "number" ? maxDecimales : 2;
  if (typeof n !== "number" || !isFinite(n)) return "";
  const negativo = n < 0;
  const partes = Math.abs(n).toFixed(dec).split(".");
  const entera = partes[0].replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const decimal = (partes[1] || "").replace(/0+$/, "");
  return (negativo ? "-" : "") + entera + (decimal ? "," + decimal : "");
}

export function normalizarUnidadAlcance(u) {
  if (typeof u !== "string") return "";
  const s = u.trim().toLowerCase().replace(/\.$/, "");
  if (!s) return "";
  return SINONIMOS_UNIDAD[s] || "";
}

// ---------------------------------------------------------------------------
// Alcance evaluado
// ---------------------------------------------------------------------------
// Devuelve { valor, unidad, etiqueta, completo, fuente }.
//   - `etiqueta` es el texto listo para pintar y SIEMPRE lleva la unidad.
//   - Si falta el valor o la unidad: completo=false y etiqueta="sin definir".
//     Nunca se muestra un cero ni un número pelado.
//   - `fuente`: "declarado" (campos nuevos), "superficie" (informe histórico,
//     donde el campo se llamaba "Superficie evaluada (há)") o "" si no hay dato.
//
// No convierte NADA: si el informe declara plantas, el alcance es en plantas
// aunque venga la densidad cargada, y viceversa.
export function alcanceEvaluado(informe) {
  const inf = informe || {};
  let valor = parsearNumero(inf.alcanceValor);
  let unidad = normalizarUnidadAlcance(inf.alcanceUnidad);
  let fuente = valor !== null || unidad ? "declarado" : "";

  // Histórico: antes solo existía `superficie`, rotulada en hectáreas.
  if (valor === null && !unidad) {
    const legacy = parsearNumero(inf.superficie);
    if (legacy !== null) { valor = legacy; unidad = "ha"; fuente = "superficie"; }
  }

  const completo = valor !== null && valor > 0 && unidad !== "";
  return {
    valor: valor,
    unidad: unidad,
    etiqueta: completo ? formatearNumero(valor) + " " + ETIQUETA_UNIDAD[unidad] : SIN_DEFINIR,
    completo: completo,
    fuente: completo ? fuente : "",
  };
}

// Informe con el alcance declarado. Valida la unidad contra UNIDADES_ALCANCE;
// si no la reconoce la deja vacía para que el alcance salga "sin definir".
export function conAlcance(informe, valor, unidad) {
  const inf = informe || {};
  const u = normalizarUnidadAlcance(unidad);
  return { ...inf, alcanceValor: valor, alcanceUnidad: u };
}

// ---------------------------------------------------------------------------
// Densidad de plantación (dato del encabezado, NO insumo de conversión)
// ---------------------------------------------------------------------------
export function densidadDeclarada(informe) {
  const inf = informe || {};
  const valor = parsearNumero(inf.densidadPlantacion);
  const unidad = typeof inf.densidadPlantacionUnidad === "string"
    ? inf.densidadPlantacionUnidad.trim() : "";
  const completo = valor !== null && valor > 0 && unidad !== "";
  return {
    valor: valor,
    unidad: unidad,
    etiqueta: completo ? formatearNumero(valor) + " " + unidad : SIN_DEFINIR,
    completo: completo,
  };
}

// ---------------------------------------------------------------------------
// Variedades (varias por informe, sin perder el histórico de una sola)
// ---------------------------------------------------------------------------
function normalizarLista(lista) {
  if (!Array.isArray(lista)) return [];
  const vistas = [];
  for (const item of lista) {
    const v = typeof item === "string" ? item.trim()
      : (item && typeof item.variedad === "string" ? item.variedad.trim() : "");
    if (v && vistas.indexOf(v) === -1) vistas.push(v);
  }
  return vistas;
}

// Lee las variedades del informe. Acepta el campo nuevo `variedades` (array) y
// el legacy `variedad` (string, una sola). Si solo hay `variedad`, devuelve
// [variedad]: los informes antiguos se siguen leyendo igual.
export function variedadesDe(informe) {
  const inf = informe || {};
  const nuevas = normalizarLista(inf.variedades);
  if (nuevas.length) return nuevas;
  const legacy = typeof inf.variedad === "string" ? inf.variedad.trim() : "";
  return legacy ? [legacy] : [];
}

// Escribe la lista y CONSERVA `variedad` con la primera, para que el PDF viejo,
// los informes ya emitidos y cualquier lectura antigua sigan funcionando.
export function conVariedades(informe, lista) {
  const inf = informe || {};
  const norm = normalizarLista(lista);
  return { ...inf, variedades: norm, variedad: norm.length ? norm[0] : "" };
}

export function etiquetaVariedades(informe) {
  const lista = variedadesDe(informe);
  return lista.length ? lista.join(", ") : SIN_DATO;
}

// ---------------------------------------------------------------------------
// Encabezado listo para pintar
// ---------------------------------------------------------------------------
// Devuelve los campos del encabezado con el texto ya resuelto ("sin definir"
// donde falte) más `campos`, un array en el orden de despliegue.
export function resumenEncabezado(informe) {
  const inf = informe || {};
  const densidad = densidadDeclarada(inf);
  const alcance = alcanceEvaluado(inf);
  const lista = variedadesDe(inf);

  const texto = (v) => {
    const s = typeof v === "string" ? v.trim() : (v == null ? "" : String(v).trim());
    return s || SIN_DEFINIR;
  };

  const campos = [
    { clave: "densidadPlantacion", etiqueta: "Densidad de plantación", texto: densidad.etiqueta, completo: densidad.completo },
    { clave: "sistemaProductivo", etiqueta: "Sistema productivo", texto: texto(inf.sistemaProductivo), completo: texto(inf.sistemaProductivo) !== SIN_DEFINIR },
    { clave: "sustrato", etiqueta: "Sustrato", texto: texto(inf.sustrato), completo: texto(inf.sustrato) !== SIN_DEFINIR },
    { clave: "alcanceEvaluado", etiqueta: "Alcance evaluado", texto: alcance.etiqueta, completo: alcance.completo },
    { clave: "variedades", etiqueta: lista.length > 1 ? "Variedades" : "Variedad", texto: etiquetaVariedades(inf), completo: lista.length > 0 },
  ];

  return {
    densidadPlantacion: campos[0],
    sistemaProductivo: campos[1],
    sustrato: campos[2],
    alcanceEvaluado: { ...campos[3], valor: alcance.valor, unidad: alcance.unidad, fuente: alcance.fuente },
    variedades: { ...campos[4], lista: lista },
    campos: campos,
    incompletos: campos.filter(c => !c.completo).map(c => c.clave),
  };
}

// ---------------------------------------------------------------------------
// Definiciones que faltan (las tiene que confirmar el CFO)
// ---------------------------------------------------------------------------
// Estas NO se resuelven acá: si se eligieran opciones a dedo se estaría
// inventando el criterio agronómico. Mientras estén abiertas, los campos
// funcionan como texto libre y el alcance queda "sin definir" si falta la unidad.
export function faltantesDefinicion() {
  return [
    {
      clave: "sistemaProductivo.opciones",
      pregunta: "¿Qué opciones tiene «Sistema productivo»?",
      contexto: "El Excel recibido no trae el listado. Hoy queda como texto libre.",
      propuesta: ["suelo", "maceta", "bolsa", "hidroponía"],
      bloquea: false,
    },
    {
      clave: "sustrato.opciones",
      pregunta: "¿Qué opciones tiene «Sustrato»?",
      contexto: "Sin listado confirmado; hoy queda como texto libre.",
      propuesta: ["corteza", "fibra de coco", "turba", "mezcla"],
      bloquea: false,
    },
    {
      clave: "densidadPlantacion.unidad",
      pregunta: "¿En qué unidad se declara la densidad de plantación (plantas/ha u otra)?",
      contexto: "Sin unidad confirmada el encabezado muestra «sin definir», nunca un número solo.",
      propuesta: ["plantas/ha"],
      bloquea: true,
    },
    {
      clave: "alcanceEvaluado.granularidad",
      pregunta: "¿El alcance evaluado es por informe o por variedad?",
      contexto: "Con varias variedades en un mismo informe hay que saber si el alcance es uno solo o uno por variedad.",
      propuesta: null,
      bloquea: true,
    },
    {
      clave: "alcanceEvaluado.migracionSuperficie",
      pregunta: "¿El campo histórico «Superficie evaluada (há)» se migra a alcance en ha?",
      contexto: "Hoy se lee como hectáreas (era el rótulo del campo) y se marca fuente=\"superficie\". Si algún informe viejo cargó plantas ahí, la lectura sería incorrecta.",
      propuesta: null,
      bloquea: true,
    },
    {
      clave: "densidadPlantacion.granularidad",
      pregunta: "¿La densidad de plantación es una sola por informe o una por variedad/cuartel?",
      contexto: "Mismo problema que el alcance cuando el informe cubre varias variedades.",
      propuesta: null,
      bloquea: false,
    },
    {
      clave: "sustrato.aplicabilidad",
      pregunta: "¿El sustrato aplica siempre o solo cuando el sistema productivo no es suelo?",
      contexto: "Define si «sin definir» en sustrato es una falta real o simplemente no aplica.",
      propuesta: null,
      bloquea: false,
    },
    {
      clave: "fenologia.granularidad",
      pregunta: "Con varias variedades, ¿el estado fenológico predominante es uno solo del informe o uno por variedad?",
      contexto: "La etiqueta nueva dice «predominante», lo que sugiere uno solo; hay que confirmarlo antes de tocar la sección.",
      propuesta: null,
      bloquea: false,
    },
    {
      clave: "alcanceEvaluado.plantasDecimales",
      pregunta: "¿El alcance en plantas admite decimales o se exige un entero?",
      contexto: "Hoy se muestra tal como se declara, con hasta dos decimales.",
      propuesta: null,
      bloquea: false,
    },
    {
      clave: "informesEmitidos.reemision",
      pregunta: "¿Los informes ya emitidos se re-emiten con los campos nuevos o quedan como están?",
      contexto: "Los históricos se siguen leyendo, pero mostrarán «sin definir» en los tres campos nuevos.",
      propuesta: null,
      bloquea: false,
    },
  ];
}
