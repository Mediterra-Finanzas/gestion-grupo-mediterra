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

// Busca en SharePoint y evalúa candidatos con el matcher S5A. Devuelve el resultado del matcher
// + un índice itemId→{webUrl,name} para poder abrir (webUrl NO lo produce el matcher).
export async function buscarCandidatos(oe, ctx = {}, opts = {}) {
  const ref = construirReferencia(oe, ctx);
  const q = String(ref.tokens.contenedor || ref.tokens.numeroOE || "").trim();
  const r = q
    ? await postSp({ op: "search", q }, opts)
    : await postSp({ op: "list" }, opts);
  if (!r.ok) return { ok: false, motivo: r.motivo };
  const items = Array.isArray(r.body.items) ? r.body.items : [];
  const resultado = evaluarCandidatosSharePoint(ref, items);
  const porId = {};
  for (const it of items) {
    if (it && it.itemId != null) porId[String(it.itemId)] = { webUrl: it.webUrl || "", name: it.name || "" };
  }
  return { ok: true, resultado, porId, truncated: !!r.body.truncated };
}

export const _interno = { motivoDe, postSp };
