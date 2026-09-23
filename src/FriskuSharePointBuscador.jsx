/* eslint-disable */
// src/FriskuSharePointBuscador.jsx — Buscador read-only de documentos en SharePoint (S5B).
// ------------------------------------------------------------------------------
// Control DISCRETO dentro de Documentos/COMEX. NO persiste vínculos (solo busca, sugiere y
// abre por webUrl). NO reutiliza el login global: si no hay sesión backend, pide email/PIN en
// un modal exclusivo; el PIN vive solo en estado y se limpia de inmediato tras enviarlo.
// Descarta respuestas obsoletas (AbortController + reqId) al cambiar de embarque/vista.
// No toca documentos, embarques ni blobs. No autosave. No localStorage.

import React, { useState, useRef, useEffect, useCallback } from "react";
import * as clienteReal from "./friskuSharePointClient.js";

const box = { marginTop: 8, padding: "8px 10px", borderRadius: 8, border: "1px solid #cbd5e1", background: "#f8fafc" };
const btn = (dis) => ({ padding: "4px 10px", fontSize: 11, borderRadius: 6, border: "1px solid #0ea5e9", background: dis ? "#e2e8f0" : "#0ea5e9", color: dis ? "#94a3b8" : "#fff", cursor: dis ? "not-allowed" : "pointer", fontWeight: 600 });
const inp = { padding: "5px 7px", fontSize: 12, borderRadius: 6, border: "1px solid #cbd5e1", width: "100%", boxSizing: "border-box" };
const CONF_LABEL = { alta: "Alta", media: "Media", baja: "Baja" };
const MSG = {
  sin_acceso: "No tienes acceso a esta función de Frisku.",
  rate_limit: "Demasiados intentos. Espera unos minutos.",
  graph: "SharePoint no está disponible por ahora. Intenta más tarde.",
  no_disponible: "Servicio no disponible por ahora.",
  solicitud_invalida: "No se pudo procesar la búsqueda.",
  error: "No se pudo completar la búsqueda.",
  credenciales: "Correo o PIN incorrectos.",
};

export default function FriskuSharePointBuscador({ oe, clienteNombre, exportadorNombre, especieNombre, cliente }) {
  const C = cliente || clienteReal;                 // inyectable para tests
  const [fase, setFase] = useState("idle");          // idle | buscando | resultados | error
  const [resultado, setResultado] = useState(null);
  const [porId, setPorId] = useState({});
  const [aviso, setAviso] = useState(null);
  const [modal, setModal] = useState(false);
  const [email, setEmail] = useState("");
  const [pin, setPin] = useState("");
  const reqIdRef = useRef(0);
  const abortRef = useRef(null);

  // Cambia el embarque/vista → cancelar en vuelo y descartar todo lo anterior.
  useEffect(() => {
    reqIdRef.current++;
    if (abortRef.current) { try { abortRef.current.abort(); } catch (e) {} }
    setFase("idle"); setResultado(null); setPorId({}); setAviso(null); setModal(false); setPin("");
  }, [oe && oe.id]);

  const ctx = { clienteNombre, exportadorNombre, especieNombre };

  const buscar = useCallback(async () => {
    const id = ++reqIdRef.current;
    if (abortRef.current) { try { abortRef.current.abort(); } catch (e) {} }
    const ac = typeof AbortController === "function" ? new AbortController() : null;
    abortRef.current = ac;
    setFase("buscando"); setAviso(null);
    let r;
    try { r = await C.buscarCandidatos(oe, ctx, { signal: ac && ac.signal }); }
    catch (e) { if (e && e.name === "AbortError") return; r = { ok: false, motivo: "error" }; }
    if (id !== reqIdRef.current) return;              // respuesta obsoleta → ignorar
    if (!r.ok) {
      if (r.motivo === "sin_sesion") { setModal(true); setFase("idle"); return; }
      setAviso(MSG[r.motivo] || MSG.error); setFase("error"); return;
    }
    setResultado(r.resultado); setPorId(r.porId || {}); setFase("resultados");
  }, [oe, clienteNombre, exportadorNombre, especieNombre, C]);

  const enviarLogin = useCallback(async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    const em = email, pn = pin;
    setPin("");                                       // limpiar PIN de inmediato (no se retiene)
    const r = await C.iniciarSesionSp(em, pn);
    if (r.ok) { setModal(false); setEmail(""); buscar(); }
    else { setAviso(MSG[r.motivo] || MSG.credenciales); }
  }, [email, pin, C, buscar]);

  const cerrarModal = useCallback(() => { setModal(false); setPin(""); setAviso(null); }, []);

  const abrible = (itemId) => {
    const w = porId[itemId] && porId[itemId].webUrl;
    return C.esWebUrlSharePoint && C.esWebUrlSharePoint(w) ? w : null;
  };

  return (
    <div style={box} data-testid="sp-buscador">
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: "#0369a1" }}>🔗 Documentos en SharePoint</span>
        <button type="button" style={btn(fase === "buscando")} disabled={fase === "buscando"} onClick={buscar}>
          {fase === "buscando" ? "Buscando…" : "Buscar en SharePoint"}
        </button>
      </div>

      {aviso && <div role="status" style={{ fontSize: 11, color: "#b45309", marginTop: 6 }}>{aviso}</div>}

      {fase === "resultados" && resultado && (
        <div style={{ marginTop: 6 }}>
          {resultado.estado === "not_found" && <div style={{ fontSize: 11, color: "#64748b" }}>Sin coincidencias en SharePoint. Las referencias existentes se mantienen.</div>}
          {resultado.estado === "invalid_input" && <div style={{ fontSize: 11, color: "#64748b" }}>No hay datos suficientes del embarque para buscar.</div>}
          {resultado.candidatos && resultado.candidatos.length > 0 && (
            <>
              <div style={{ fontSize: 10, color: "#64748b", marginBottom: 4 }}>
                Sugerencias (revisa y confirma manualmente — nada se guarda automáticamente):
              </div>
              {resultado.candidatos.map((c) => {
                const url = abrible(c.itemId);
                const nombre = (porId[c.itemId] && porId[c.itemId].name) || "documento";
                return (
                  <div key={`${c.driveId}:${c.itemId}`} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", padding: "4px 0", borderTop: "1px solid #e2e8f0" }}>
                    <span style={{ fontSize: 11, fontWeight: 600 }}>{nombre}</span>
                    <span style={{ fontSize: 9, padding: "1px 6px", borderRadius: 4, background: "#e0f2fe", color: "#0369a1" }}>Confianza: {CONF_LABEL[c.confianza] || c.confianza}</span>
                    <span style={{ fontSize: 9, color: "#64748b" }}>{(c.señales || []).filter(s => s.resultado === "match").map(s => s.tipo).join(", ")}</span>
                    {url
                      ? <a href={url} target="_blank" rel="noreferrer noopener" style={{ fontSize: 10, color: "#0ea5e9", fontWeight: 600 }}>Abrir en SharePoint</a>
                      : <span style={{ fontSize: 10, color: "#94a3b8" }}>enlace no disponible</span>}
                  </div>
                );
              })}
            </>
          )}
        </div>
      )}

      {modal && (
        <div role="dialog" aria-label="Acceso a SharePoint Frisku" style={{ marginTop: 8, padding: 10, borderRadius: 8, border: "1px solid #0ea5e9", background: "#fff" }}>
          <div style={{ fontSize: 11, color: "#334155", marginBottom: 6 }}>Ingresa tu correo y PIN de Frisku para buscar en SharePoint (sesión temporal, solo para esta función).</div>
          <form onSubmit={enviarLogin}>
            <input style={{ ...inp, marginBottom: 6 }} type="email" placeholder="correo" value={email} onChange={(e) => setEmail(e.target.value)} aria-label="correo" autoComplete="off" />
            <input style={inp} type="password" placeholder="PIN" value={pin} onChange={(e) => setPin(e.target.value)} aria-label="PIN" autoComplete="off" />
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <button type="submit" style={btn(false)}>Entrar</button>
              <button type="button" style={{ ...btn(false), background: "#fff", color: "#0ea5e9" }} onClick={cerrarModal}>Cancelar</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
