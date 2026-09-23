/* eslint-disable */
// ════════════════════════════════════════════════════════════════════════════
// friskuSharePointMatcher.js — Motor PURO de candidatos SharePoint (S5A).
//
// Recibe (1) una referencia documental legacy YA analizada y (2) una lista de
// candidatos SIMULADOS (forma Graph driveItem), y devuelve candidatos ordenados
// con señales explicables y clasificación de confianza. NO busca, NO llama APIs,
// NO lee SharePoint, NO escribe, NO confirma vinculaciones, NO decide una
// vinculación definitiva. `requiereConfirmacion` es SIEMPRE true.
//
// PUREZA TOTAL: sin fetch, sin Supabase, sin Graph, sin env, sin localStorage,
// sin React, sin timers, sin Date/hora dinámica, sin aleatoriedad, sin efectos.
// Determinista e independiente del orden de entrada. No muta referencia ni
// candidatos. No filtra rutas locales, usernames ni secretos en las señales.
// ════════════════════════════════════════════════════════════════════════════

// ── Pesos heurísticos (PUNTAJE, no probabilidad ni % de certeza) ──
export const PESOS = {
  CONTENEDOR: 50, OE: 40, TEMPORADA: 30,   // señales fuertes (identidad)
  EXPORTADORA: 12, CLIENTE: 12, CARPETA: 10, // señales medias
  ESPECIE: 5, NOMBRE: 5, EXT: 3,            // señales débiles
};
export const PENAL = {
  CONTENEDOR: 100, OE: 80, TEMPORADA: 60,   // contradicción fuerte (bloquea "exacto")
  EXT: 15, TIPO_ENTIDAD: 20,                // contradicción media
};
const UMBRAL_ALTA = 60;     // puntaje mínimo para confianza alta (además ≥2 señales fuertes)
const UMBRAL_MEDIA = 20;    // puntaje mínimo para confianza media
const MARGEN_EMPATE = 12;   // si el 2º candidato está a menos de esto → empate → revisión

// ── Normalización conservadora (solo para comparar; el dato original no se toca) ──
function quitarTildes(s) { return String(s).normalize("NFD").replace(/[̀-ͯ]/g, ""); }
// Texto laxo: minúsculas, sin tildes, separadores _-/ y espacios colapsados, sin puntuación.
function normTexto(s) {
  return quitarTildes(String(s == null ? "" : s))
    .toLowerCase()
    .replace(/[._\-\/\\]+/g, " ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
// Identificador estricto: solo alfanumérico en mayúscula (para contenedor/OE/temporada).
function normId(s) { return quitarTildes(String(s == null ? "" : s)).toUpperCase().replace(/[^A-Z0-9]/g, ""); }
// Match por PALABRA/FRASE completa (no subcadena): evita que un acrónimo corto como "GT"
// coincida dentro de "Logistica". Compara con límites de token usando espacios de guarda.
// `hayNorm` y `needleNorm` deben venir de normTexto (tokens separados por un espacio).
function contienePalabra(hayNorm, needleNorm) {
  if (!needleNorm) return false;
  return (" " + hayNorm + " ").includes(" " + needleNorm + " ");
}
// Temporada canónica AAAA-AAAA si aplica; si no, normId.
function normTemporada(s) {
  const m = String(s == null ? "" : s).match(/(\d{4})\D+(\d{4})/);
  return m ? `${m[1]}-${m[2]}` : normId(s);
}
function extDe(nombre) {
  const m = String(nombre == null ? "" : nombre).match(/\.([a-z0-9]{1,6})$/i);
  return m ? m[1].toLowerCase() : "";
}
function tieneValor(v) { return v != null && String(v).trim() !== ""; }

// Extrae del texto CRUDO del candidato (name + parentPath) los identificadores
// reconocibles, para poder detectar CONTRADICCIÓN (no solo ausencia de match).
function extraerIdentificadores(texto) {
  const up = quitarTildes(String(texto == null ? "" : texto)).toUpperCase();
  const contenedores = (up.match(/(?<![A-Z0-9])[A-Z]{4}\d{7}(?![A-Z0-9])/g) || []);
  const temporadas = (up.match(/(\d{4})\D{1,3}(\d{4})/g) || []).map(normTemporada);
  const oes = ((up.match(/OE[\s._-]?[A-Z0-9]{2,}/g) || []).map(x => normId(x)));  // "OE-1234" → "OE1234"
  return {
    contenedores: Array.from(new Set(contenedores)),
    temporadas: Array.from(new Set(temporadas)),
    oes: Array.from(new Set(oes)),
  };
}

function esObjeto(x) { return x != null && typeof x === "object" && !Array.isArray(x); }
function tieneIdentidad(c) { return esObjeto(c) && tieneValor(c.driveId) && tieneValor(c.itemId); }
function claveIdentidad(c) { return `${String(c.driveId)}::${String(c.itemId)}`; }

// Evalúa un candidato individual contra la referencia. Devuelve señales, advertencias,
// score, si hay contradicción fuerte y cuántas señales fuertes coincidieron.
function evaluarUno(ref, cand) {
  const t = ref.tokens || {};
  const señales = [];
  const advertencias = [];
  let score = 0;
  let fuertesMatch = 0;      // contenedor/OE/temporada coincidentes
  let mediasMatch = 0;
  let contradiccionFuerte = false;

  const texto = `${cand.name || ""} ${cand.parentPath || ""}`;
  const textoNorm = normTexto(texto);
  const ids = extraerIdentificadores(texto);

  // ── Señales fuertes: match exacto tras normalización estricta / contradicción ──
  function fuerte(kind, refVal, candList, normFn, pesoK, penK) {
    if (!tieneValor(refVal)) return;
    const r = normFn(refVal);
    const lista = candList.map(normFn);
    if (lista.includes(r)) {
      score += PESOS[pesoK]; fuertesMatch++;
      señales.push({ tipo: kind, resultado: "match", valor: r, peso: PESOS[pesoK] });
    } else if (lista.length > 0) {
      score -= PENAL[penK]; contradiccionFuerte = true;
      señales.push({ tipo: kind, resultado: "contradiccion", valor: r, peso: -PENAL[penK] });
      advertencias.push(`${kind}_incompatible`);
    } else {
      señales.push({ tipo: kind, resultado: "ausente" });
    }
  }
  fuerte("contenedor", t.contenedor, ids.contenedores, normId, "CONTENEDOR", "CONTENEDOR");
  fuerte("numeroOE", t.numeroOE, ids.oes, normId, "OE", "OE");
  fuerte("temporada", t.temporada, ids.temporadas, normTemporada, "TEMPORADA", "TEMPORADA");

  // ── Señales medias: presencia textual (nombre + carpeta relativa del candidato) ──
  function media(kind, refVal, pesoK) {
    if (!tieneValor(refVal)) return;
    const r = normTexto(refVal);
    if (contienePalabra(textoNorm, r)) {   // palabra/frase completa, no subcadena
      score += PESOS[pesoK]; mediasMatch++;
      señales.push({ tipo: kind, resultado: "match", valor: r, peso: PESOS[pesoK] });
    } else {
      señales.push({ tipo: kind, resultado: "ausente" });
    }
  }
  media("exportadora", t.exportadora, "EXPORTADORA");
  media("cliente", t.cliente, "CLIENTE");

  // carpetaRelativa: fracción de segmentos presentes en el parentPath del candidato.
  const carpeta = Array.isArray(t.carpetaRelativa) ? t.carpetaRelativa
    : (tieneValor(t.carpetaRelativa) ? String(t.carpetaRelativa).split(/[\/\\]+/) : []);
  const segs = carpeta.map(normTexto).filter(Boolean);
  if (segs.length) {
    const parentNorm = normTexto(cand.parentPath || "");
    const hit = segs.filter(s => contienePalabra(parentNorm, s)).length;
    if (hit > 0 && hit >= Math.ceil(segs.length / 2)) {
      score += PESOS.CARPETA; mediasMatch++;
      señales.push({ tipo: "carpetaRelativa", resultado: "match", valor: `${hit}/${segs.length}`, peso: PESOS.CARPETA });
    } else {
      señales.push({ tipo: "carpetaRelativa", resultado: "parcial", valor: `${hit}/${segs.length}` });
    }
  }

  // ── Señales débiles: especie, nombre de archivo, extensión ──
  if (tieneValor(t.especie)) {
    const e = normTexto(t.especie);
    if (contienePalabra(textoNorm, e)) { score += PESOS.ESPECIE; señales.push({ tipo: "especie", resultado: "match", valor: e, peso: PESOS.ESPECIE }); }
  }
  const refNombre = tieneValor(t.nombreArchivo) ? t.nombreArchivo : ref.nombre;
  if (tieneValor(refNombre)) {
    const baseRef = normTexto(String(refNombre).replace(/\.[a-z0-9]{1,6}$/i, ""));
    const baseCand = normTexto(String(cand.name || "").replace(/\.[a-z0-9]{1,6}$/i, ""));
    const tokRef = new Set(baseRef.split(" ").filter(x => x.length >= 3));
    const comunes = baseCand.split(" ").filter(x => x.length >= 3 && tokRef.has(x));
    if (comunes.length > 0) { score += PESOS.NOMBRE; señales.push({ tipo: "nombreArchivo", resultado: "match", valor: `${comunes.length} token(s)`, peso: PESOS.NOMBRE }); }
  }
  // Extensión / MIME
  const refExt = extDe(refNombre);
  const candExt = extDe(cand.name);
  if (refExt && candExt) {
    if (refExt === candExt) { score += PESOS.EXT; señales.push({ tipo: "extension", resultado: "match", valor: candExt, peso: PESOS.EXT }); }
    else { score -= PENAL.EXT; señales.push({ tipo: "extension", resultado: "contradiccion", valor: `${refExt}≠${candExt}`, peso: -PENAL.EXT }); advertencias.push("extension_incompatible"); }
  }

  // ── Archivo vs carpeta ──
  const candEsCarpeta = !candExt && !(tieneValor(cand.mimeType) && String(cand.mimeType).toLowerCase() !== "folder");
  const esperaArchivo = !!refExt;
  if (esperaArchivo && candEsCarpeta) {
    score -= PENAL.TIPO_ENTIDAD;
    señales.push({ tipo: "tipoEntidad", resultado: "contradiccion", valor: "esperaArchivo/esCarpeta", peso: -PENAL.TIPO_ENTIDAD });
    advertencias.push("tipo_entidad_incompatible");
  }

  // ── Confianza (heurística explicable) ──
  let confianza;
  if (contradiccionFuerte) confianza = "baja";                 // una contradicción fuerte nunca es "exacto"
  else if (fuertesMatch >= 2 && score >= UMBRAL_ALTA) confianza = "alta";
  else if (score >= UMBRAL_MEDIA && (fuertesMatch >= 1 || mediasMatch >= 2)) confianza = "media";
  else confianza = "baja";

  if (señales.filter(s => s.resultado === "contradiccion").length && señales.filter(s => s.resultado === "match").length) {
    advertencias.push("señales_contradictorias");
  }

  return {
    driveId: String(cand.driveId), itemId: String(cand.itemId), // salida siempre string (determinismo)
    score, confianza,
    señales,
    advertencias: Array.from(new Set(advertencias)),
    _fuertesMatch: fuertesMatch, _contradiccionFuerte: contradiccionFuerte,
  };
}

/**
 * Motor puro de candidatos SharePoint. NO confirma vinculaciones.
 * @param referencia { docId, tipo, nombre, referenciaLegacy?, tokens:{...} }
 * @param candidatos [ { driveId, itemId, name, webUrl, parentPath, size, mimeType, lastModifiedAt } ]
 *   Precondición: driveId+itemId es la identidad estable (Graph los entrega como strings).
 *   El motor valida que existan (no vacíos) y normaliza ambos a string en la salida, así el
 *   orden/dedupe y el resultado son deterministas aunque un fixture pase tipos distintos.
 * @param opciones   { margenEmpate? } única opción soportada: margen (pts) bajo el cual el 2º
 *                   candidato fuerza revisión (multiple_candidates). Los umbrales de confianza
 *                   NO son configurables todavía (no hay muestras reales calibradas). Se ignora
 *                   cualquier otra clave y un margenEmpate inválido cae al default seguro.
 * @returns { estado, candidatos:[{driveId,itemId,score,confianza,señales,advertencias}], recomendacion, requiereConfirmacion:true, descartados? }
 *   estado ∈ exact_candidate | multiple_candidates | low_confidence | not_found | invalid_input
 */
export function evaluarCandidatosSharePoint(referencia, candidatos, opciones = {}) {
  const opt = esObjeto(opciones) ? opciones : {};
  const margen = (Number.isFinite(opt.margenEmpate) && opt.margenEmpate >= 0) ? opt.margenEmpate : MARGEN_EMPATE;

  // Validación de entrada → invalid_input (jamás lanza).
  if (!esObjeto(referencia) || !esObjeto(referencia.tokens) || !Array.isArray(candidatos)) {
    return { estado: "invalid_input", candidatos: [], recomendacion: "entrada_invalida", requiereConfirmacion: true };
  }

  // Rechazar candidatos sin identidad estable (driveId+itemId) → no vinculables.
  const descartados = [];
  const vinculables = [];
  for (const c of candidatos) {
    if (tieneIdentidad(c)) vinculables.push(c);
    else descartados.push({ motivo: "sin_identidad_estable" });
  }

  // Agrupar por identidad estable (driveId+itemId). Determinista e independiente del orden.
  const grupos = new Map();
  for (const c of vinculables) {
    const k = claveIdentidad(c);
    if (!grupos.has(k)) grupos.set(k, []);
    grupos.get(k).push(c);
  }

  if (grupos.size === 0) {
    return {
      estado: "not_found", candidatos: [],
      recomendacion: descartados.length ? "sin_candidatos_vinculables" : "sin_candidatos",
      requiereConfirmacion: true,
      ...(descartados.length ? { descartados } : {}),
    };
  }

  // Tupla de campos relevantes para decidir si dos entradas con la MISMA identidad son
  // materialmente equivalentes. No se exponen estos valores en la salida.
  const tuplaRelevante = (c) => JSON.stringify(
    ["name", "parentPath", "mimeType", "size", "lastModifiedAt", "webUrl"].map(k => c[k] == null ? null : String(c[k]))
  );

  // Evaluar cada identidad. Orden de identidades determinista (claves ordenadas) para que
  // el resultado no dependa del orden de entrada.
  const claves = Array.from(grupos.keys()).sort();
  const evaluados = claves.map((k) => {
    const grupo = grupos.get(k);
    if (grupo.length === 1) return evaluarUno(referencia, grupo[0]);
    // Duplicados con la misma identidad:
    const base = tuplaRelevante(grupo[0]);
    const equivalentes = grupo.every(c => tuplaRelevante(c) === base);
    if (equivalentes) {
      // Todos iguales en campos relevantes → una representación canónica (mismo resultado
      // para cualquiera). Se avisa que había duplicados idénticos.
      const r = evaluarUno(referencia, grupo[0]);
      r.advertencias = Array.from(new Set([...r.advertencias, "habia_duplicados"]));
      return r;
    }
    // Conflicto: misma identidad con metadatos distintos. NO se elige silenciosamente uno.
    // Resultado conservador y determinista: score mínimo del grupo (conmutativo → indep. del
    // orden), confianza baja (nunca exacto), sin señales (no expone name/path/url), advertencia.
    const scores = grupo.map(c => evaluarUno(referencia, c).score);
    const minScore = scores.reduce((m, s) => (s < m ? s : m), scores[0]);
    return {
      driveId: String(grupo[0].driveId), itemId: String(grupo[0].itemId), // salida siempre string
      score: minScore, confianza: "baja",
      señales: [],
      advertencias: ["duplicated_identity_conflict"],
      _fuertesMatch: 0, _contradiccionFuerte: false, _conflicto: true,
    };
  }).sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const ia = String(a.itemId), ib = String(b.itemId);
    if (ia !== ib) return ia < ib ? -1 : 1;
    const da = String(a.driveId), db = String(b.driveId);
    return da < db ? -1 : da > db ? 1 : 0;
  });

  const top = evaluados[0];
  const segundo = evaluados[1];
  const empate = !!segundo && segundo.score > 0 && (top.score - segundo.score) < margen;
  const exactoPosible = top.confianza === "alta" && !top._contradiccionFuerte;

  let estado, recomendacion;
  if (empate) {
    estado = "multiple_candidates";
    recomendacion = "revisar_multiples_candidatos";
  } else if (exactoPosible) {
    estado = "exact_candidate";
    recomendacion = "sugerir_candidato_top_requiere_confirmacion";
  } else {
    estado = "low_confidence";
    recomendacion = "revision_humana_requerida";
  }

  // Limpiar campos internos antes de devolver (no filtrar rutas/usernames: las señales
  // solo contienen tipo + token normalizado corto, nunca parentPath ni rutas locales).
  const salida = evaluados.map(({ _fuertesMatch, _contradiccionFuerte, _conflicto, ...pub }) => pub);

  return {
    estado,
    candidatos: salida,
    recomendacion,
    requiereConfirmacion: true,
    ...(descartados.length ? { descartados } : {}),
  };
}
