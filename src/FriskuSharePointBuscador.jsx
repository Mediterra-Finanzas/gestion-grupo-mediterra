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
import { esWebUrlSharePointFrisku } from "./friskuComexVinculo.js";

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
// Mensajes del flujo de vinculación (no dependen de la respuesta de SharePoint).
const MSG_VINC = {
  carga: "No se puede vincular: la carga del embarque no terminó. Reintenta en unos segundos.",
  sin_permiso: "No tienes permiso para editar este embarque.",
  weburl_invalida: "Este documento no tiene un enlace válido del SharePoint autorizado de Frisku; no se puede vincular.",
  reemplazo_storage_bloqueado: "Ese requisito ya tiene un archivo subido. Por ahora no se reemplaza por un vínculo (el archivo quedaría huérfano). Elige un requisito vacío o uno ya vinculado a SharePoint.",
  error: "No se pudo vincular.",
};

// Props de vinculación (opcionales): si no se pasan onVincular/requisitos, el buscador es solo lectura.
export default function FriskuSharePointBuscador({ oe, clienteNombre, exportadorNombre, especieNombre, cliente, requisitos = [], onVincular, canEdit = false }) {
  const C = cliente || clienteReal;                 // inyectable para tests
  const [fase, setFase] = useState("idle");          // idle | buscando | resultados | error
  const [resultado, setResultado] = useState(null);
  const [porId, setPorId] = useState({});
  const [aviso, setAviso] = useState(null);
  const [modal, setModal] = useState(false);
  const [email, setEmail] = useState("");
  const [pin, setPin] = useState("");
  const [vinc, setVinc] = useState(null);            // { ref, docId, paso } | null — vinculación en curso
  const [vincMsg, setVincMsg] = useState(null);      // aviso del flujo de vínculo
  const reqIdRef = useRef(0);
  const abortRef = useRef(null);

  // Cambia el embarque/vista → cancelar en vuelo y descartar todo lo anterior.
  useEffect(() => {
    reqIdRef.current++;
    if (abortRef.current) { try { abortRef.current.abort(); } catch (e) {} }
    setFase("idle"); setResultado(null); setPorId({}); setAviso(null); setModal(false); setPin("");
    setVinc(null); setVincMsg(null);
  }, [oe && oe.id]);

  const puedeVincular = !!(canEdit && typeof onVincular === "function" && requisitos.length > 0);
  const refDe = (c) => ({
    driveId: c.driveId, itemId: c.itemId,
    nombre: (porId[c.itemId] && porId[c.itemId].name) || "documento",
    webUrl: (porId[c.itemId] && porId[c.itemId].webUrl) || "",
  });
  const reqDe = (docId) => requisitos.find((r) => String(r.docId) === String(docId));
  const iniciarVinc = (c) => { setVinc({ ref: refDe(c), docId: "", paso: "elegir" }); setVincMsg(null); };
  const cancelarVinc = () => { setVinc(null); setVincMsg(null); };
  const continuarVinc = () => {
    const r = reqDe(vinc.docId); if (!r) return;
    setVinc((v) => ({ ...v, paso: r.tieneRef ? "reemplazar" : "confirmar" }));  // reemplazo → 2ª confirmación
  };
  const confirmarVinc = () => {
    const res = onVincular(vinc.ref, vinc.docId) || { ok: false, motivo: "error" };
    if (res.ok) { const t = reqDe(vinc.docId); setVinc(null); setVincMsg("Vinculado a " + (t ? t.tipo : "requisito") + "."); }
    else { setVincMsg(MSG_VINC[res.motivo] || MSG_VINC.error); }
  };

  const ctx = { clienteNombre, exportadorNombre, especieNombre };

  const buscar = useCallback(async () => {
    const id = ++reqIdRef.current;
    if (abortRef.current) { try { abortRef.current.abort(); } catch (e) {} }
    const ac = typeof AbortController === "function" ? new AbortController() : null;
    abortRef.current = ac;
    // Al iniciar una búsqueda se borran las sugerencias anteriores (nada de resultados obsoletos).
    setFase("buscando"); setAviso(null); setResultado(null); setPorId({});
    let r;
    try { r = await C.buscarCandidatos(oe, ctx, { signal: ac && ac.signal }); }
    catch (e) { if (e && e.name === "AbortError") return; r = { ok: false, motivo: "error" }; }
    if (id !== reqIdRef.current) return;              // respuesta obsoleta → ignorar
    if (!r.ok) {
      // Sesión ausente/expirada (401): limpiar sugerencias y pedir un nuevo login.
      if (r.motivo === "sin_sesion") { setResultado(null); setPorId({}); setModal(true); setFase("idle"); return; }
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
                const vinculandoEste = vinc && vinc.ref.itemId === c.itemId && vinc.ref.driveId === c.driveId;
                // Solo vinculable si el candidato tiene un enlace válido del SharePoint autorizado Frisku.
                const vinculableEste = puedeVincular && esWebUrlSharePointFrisku((porId[c.itemId] && porId[c.itemId].webUrl) || "");
                return (
                  <div key={`${c.driveId}:${c.itemId}`} style={{ padding: "4px 0", borderTop: "1px solid #e2e8f0" }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                      <span style={{ fontSize: 11, fontWeight: 600 }}>{nombre}</span>
                      <span style={{ fontSize: 9, padding: "1px 6px", borderRadius: 4, background: "#e0f2fe", color: "#0369a1" }}>Confianza: {CONF_LABEL[c.confianza] || c.confianza}</span>
                      <span style={{ fontSize: 9, color: "#64748b" }}>{(c.señales || []).filter(s => s.resultado === "match").map(s => s.tipo).join(", ")}</span>
                      {url
                        ? <a href={url} target="_blank" rel="noreferrer noopener" style={{ fontSize: 10, color: "#0ea5e9", fontWeight: 600 }}>Abrir en SharePoint</a>
                        : <span style={{ fontSize: 10, color: "#94a3b8" }}>enlace no disponible</span>}
                      {vinculableEste && !vinculandoEste && (
                        <button type="button" onClick={() => iniciarVinc(c)} style={{ ...btn(false), padding: "2px 8px", fontSize: 10 }}>Vincular</button>
                      )}
                    </div>

                    {vinculandoEste && (
                      <div role="group" aria-label="Vincular documento a requisito" style={{ marginTop: 6, padding: 8, borderRadius: 6, border: "1px solid #0ea5e9", background: "#f0f9ff" }}>
                        {vinc.paso === "elegir" && (
                          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                            <span style={{ fontSize: 10, color: "#334155" }}>Vincular «{vinc.ref.nombre}» al requisito:</span>
                            <select aria-label="requisito COMEX" value={vinc.docId} onChange={(e) => setVinc((v) => ({ ...v, docId: e.target.value }))} style={{ ...inp, width: "auto", fontSize: 11, padding: "3px 6px" }}>
                              <option value="">— elegir requisito —</option>
                              {requisitos.map((r) => (
                                <option key={r.docId} value={r.docId} disabled={r.bloqueadoStorage}>
                                  {r.tipo}{r.bloqueadoStorage ? " (archivo subido — no reemplazable)" : r.tieneRef ? " (ya tiene referencia)" : ""}
                                </option>
                              ))}
                            </select>
                            <button type="button" disabled={!vinc.docId} onClick={continuarVinc} style={{ ...btn(!vinc.docId), padding: "3px 8px", fontSize: 10 }}>Continuar</button>
                            <button type="button" onClick={cancelarVinc} style={{ ...btn(false), background: "#fff", color: "#0ea5e9", padding: "3px 8px", fontSize: 10 }}>Cancelar</button>
                          </div>
                        )}
                        {vinc.paso === "reemplazar" && (
                          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                            <span style={{ fontSize: 10, color: "#b45309", fontWeight: 600 }}>⚠ «{reqDe(vinc.docId) ? reqDe(vinc.docId).tipo : ""}» ya tiene una referencia. ¿Reemplazarla?</span>
                            <button type="button" onClick={() => setVinc((v) => ({ ...v, paso: "confirmar" }))} style={{ ...btn(false), background: "#b45309", borderColor: "#b45309", padding: "3px 8px", fontSize: 10 }}>Sí, reemplazar</button>
                            <button type="button" onClick={cancelarVinc} style={{ ...btn(false), background: "#fff", color: "#0ea5e9", padding: "3px 8px", fontSize: 10 }}>Cancelar</button>
                          </div>
                        )}
                        {vinc.paso === "confirmar" && (
                          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                            <span style={{ fontSize: 10, color: "#334155" }}>Confirmar: vincular «{vinc.ref.nombre}» → <b>{reqDe(vinc.docId) ? reqDe(vinc.docId).tipo : ""}</b> (referencia SharePoint, no se copia el archivo).</span>
                            <button type="button" onClick={confirmarVinc} style={{ ...btn(false), padding: "3px 8px", fontSize: 10 }}>Confirmar vínculo</button>
                            <button type="button" onClick={cancelarVinc} style={{ ...btn(false), background: "#fff", color: "#0ea5e9", padding: "3px 8px", fontSize: 10 }}>Cancelar</button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
              {vincMsg && <div role="status" style={{ fontSize: 10, color: "#0369a1", marginTop: 6 }}>{vincMsg}</div>}
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
