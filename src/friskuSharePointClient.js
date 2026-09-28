/* eslint-disable */
// src/friskuSharePointClient.js — Cliente FRONTEND del proxy read-only /api/frisku-sp (S5B).
// ------------------------------------------------------------------------------
// SOLO habla con nuestro backend (mismo origen) vía POST con credentials:"include".
// NUNCA guarda PIN/cookie/token (el PIN solo viaja en la llamada de login y se descarta
// en el componente). NUNCA registra PIN/email/respuestas. NUNCA acepta URLs arbitrarias.
// Traduce estados a motivos GENÉRICOS para la UI (sin exponer detalles internos).
//
// No persiste vínculos: solo búsqueda + sugerencia (matcher S5A) + apertura por webUrl.

import { evaluarCandidatosSharePoint } from "./friskuSharePointMatcher.js";

const BASE = "/api/frisku-sp";
const MAX_RESULTADOS_SP = 10;   // tope de candidatos mostrados
const MARGEN_EMPATE_SP = 12;    // mismo default que el matcher para re-derivar estado tras filtrar

// Mapea el estado HTTP a un motivo genérico de UI (no filtra cuerpos/errores internos).
function motivoDe(status) {
  if (status === 401) return "sin_sesion";
  if (status === 403) return "sin_acceso";
  if (status === 429) return "rate_limit";
  if (status === 502) return "graph";
  if (status === 503) return "no_disponible";
  if (status === 400 || status === 413 || status === 415) return "solicitud_invalida";
  return "error";
}

async function postSp(cuerpo, opts = {}) {
  const f = opts.fetchImpl || (typeof fetch === "function" ? fetch : null);
  if (!f) throw new Error("sin_fetch");
  let r;
  try {
    r = await f(BASE, {
      method: "POST",
      credentials: "include",                 // la cookie httpOnly viaja SOLO a nuestro backend
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cuerpo),
      signal: opts.signal,
    });
  } catch (e) {
    if (e && e.name === "AbortError") throw e;  // request obsoleta: se propaga para ignorarla
    return { ok: false, status: 0, motivo: "no_disponible" };
  }
  let body = {};
  try { body = await r.json(); } catch (e) { body = {}; }
  return { ok: r.ok, status: r.status, body, motivo: r.ok ? null : motivoDe(r.status) };
}

// Inicia la sesión exclusiva. El PIN NO se guarda aquí; lo pasa el componente y lo limpia.
export async function iniciarSesionSp(email, pin, opts = {}) {
  const r = await postSp({ op: "login", email, pin }, opts);
  return r.ok ? { ok: true } : { ok: false, motivo: r.motivo };
}
export async function cerrarSesionSp(opts = {}) { try { await postSp({ op: "logout" }, opts); } catch (e) {} }

// Construye la referencia (tokens) del embarque para el matcher. Sin PII: solo datos del OE.
export function construirReferencia(oe, ctx = {}) {
  const o = oe || {};
  return {
    docId: o.id, tipo: "embarque", nombre: "",
    tokens: {
      contenedor: o.numeroContenedor || o.contenedor || "",
      numeroOE: o.numero || o.numeroOE || "",
      temporada: o.temporada || "",
      exportadora: ctx.exportadorNombre || "",
      cliente: ctx.clienteNombre || "",
      especie: ctx.especieNombre || "",
    },
  };
}

// ¿Es un webUrl seguro para abrir? Solo https a *.sharepoint.com (rechaza URLs arbitrarias).
export function esWebUrlSharePoint(u) {
  try {
    const url = new URL(String(u));
    return url.protocol === "https:" && /(^|\.)sharepoint\.com$/i.test(url.hostname);
  } catch (e) { return false; }
}

// Filtro de RELEVANCIA sobre la salida del matcher (puro; no muta las entradas):
//  - deja SOLO archivos con match EXACTO de contenedor u OE (señal fuerte "match");
//  - excluye carpetas (esCarpeta / mimeType "folder") y accesos directos .lnk;
//  - descarta candidatos sostenidos solo por temporada/cliente/exportadora/especie/nombre;
//  - limita a `max` resultados y re-deriva el estado sobre el conjunto filtrado.
export function filtrarCandidatosRelevantes(resultado, items, max = MAX_RESULTADOS_SP) {
  if (!resultado || !Array.isArray(resultado.candidatos)) return resultado;
  const porIdent = new Map();
  for (const it of (Array.isArray(items) ? items : [])) {
    if (it && it.itemId != null) porIdent.set(`${it.driveId}::${it.itemId}`, it);
  }
  const relevante = (c) => {
    const matchFuerte = Array.isArray(c.señales) && c.señales.some(
      (s) => (s.tipo === "contenedor" || s.tipo === "numeroOE") && s.resultado === "match");
    if (!matchFuerte) return false;                 // solo contenedor/OE exactos
    const it = porIdent.get(`${c.driveId}::${c.itemId}`);
    if (it) {
      if (it.esCarpeta === true) return false;       // sin carpetas
      if (String(it.mimeType || "").toLowerCase() === "folder") return false;
      if (/\.lnk$/i.test(String(it.name || ""))) return false;  // sin accesos directos
    }
    return true;
  };
  const filtrados = resultado.candidatos.filter(relevante);
  const limitado = filtrados.length > max;
  const candidatos = filtrados.slice(0, max);

  let estado, recomendacion;
  if (candidatos.length === 0) {
    estado = "not_found"; recomendacion = "sin_candidatos_relevantes";
  } else {
    const top = candidatos[0], seg = candidatos[1];
    const empate = !!seg && seg.score > 0 && (top.score - seg.score) < MARGEN_EMPATE_SP;
    if (empate) { estado = "multiple_candidates"; recomendacion = "revisar_multiples_candidatos"; }
    else if (top.confianza === "alta") { estado = "exact_candidate"; recomendacion = "sugerir_candidato_top_requiere_confirmacion"; }
    else { estado = "low_confidence"; recomendacion = "revision_humana_requerida"; }
  }
  return { ...resultado, estado, recomendacion, candidatos, ...(limitado ? { limitado: true } : {}) };
}

// Busca en SharePoint y evalúa candidatos con el matcher S5A. Devuelve el resultado del matcher
// (ya filtrado por relevancia) + un índice itemId→{webUrl,name} para abrir (webUrl NO lo produce el matcher).
export async function buscarCandidatos(oe, ctx = {}, opts = {}) {
  const ref = construirReferencia(oe, ctx);
  const q = String(ref.tokens.contenedor || ref.tokens.numeroOE || "").trim();
  const r = q
    ? await postSp({ op: "search", q }, opts)
    : await postSp({ op: "list" }, opts);
  if (!r.ok) return { ok: false, motivo: r.motivo };
  const items = Array.isArray(r.body.items) ? r.body.items : [];
  const resultado = filtrarCandidatosRelevantes(evaluarCandidatosSharePoint(ref, items), items);
  const porId = {};
  for (const it of items) {
    if (it && it.itemId != null) porId[String(it.itemId)] = { webUrl: it.webUrl || "", name: it.name || "" };
  }
  return { ok: true, resultado, porId, truncated: !!r.body.truncated };
}

export const _interno = { motivoDe, postSp };
