/* eslint-disable */
// ══════════════════════════════════════════════════════════════════════
// Nómina de REMUNERACIONES (fila propia `nominas_remuneraciones`).
// Se monta dentro de Nóminas SOLO para quien tiene remPreparar o remAprobar;
// la fila se pide recién acá, así no llega al navegador de nadie más desde la
// app. Esto es control de la aplicación: la base sigue abierta a la llave
// pública (docs/estado-rama-2026-10.md §4.12).
//
// Circuito: Angelo prepara (borrador → preparada) · Lucía o Cristobal aprueban
// (basta uno) o devuelven con motivo · sin V°B° · anulación con motivo.
// Persistencia: carga que lanza (Regla 9), guardado confirmado por el servidor
// (contrato único). Nada se borra: se anula o se traslada con rastro.
// ══════════════════════════════════════════════════════════════════════
import React, { useEffect, useState, useMemo } from "react";
import { persist } from "./persistencia/instancia.js";
import { uploadDocNomina, urlFirmadaNomina } from "./friskuHelpers.js";
import { hashArchivo } from "./expedienteHelpers.js";
import {
  FILA_REM, CLASES_REM, normalizarFilaRem, nominaRemVacia, lineaRemVacia, totalesRem, erroresParaEnviar,
  puedeVerRem, puedePrepararRem, puedeEditarRem, puedeAprobarRem, enviarAAprobacion, aprobarRem, devolverRem, anularRem,
  editarLineas, candidatosRemuneracion, candidatosCSV, buscarTrasladada, trasladarAFilaRem, stubTrasladada, marcarNoRemuneracion,
} from "./remuneraciones/modelo.js";

const C = { text: "#14181f", muted: "#5b6472", border: "#d6dae1", card: "#fff", alt: "#f5f7fa", primary: "#1e3a5f",
  ok: "#146c43", danger: "#b42318", warn: "#92400e" };
const btn = (fondo, claro) => ({ padding: "5px 12px", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 700,
  border: `1px solid ${claro ? C.border : fondo}`, background: claro ? "#fff" : fondo, color: claro ? C.text : "#fff" });
const inp = { padding: "4px 6px", border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 12, width: "100%", boxSizing: "border-box" };
const clp = (n) => "$" + Math.round(Number(n) || 0).toLocaleString("es-CL");
const ESTADO_LABEL = { borrador: "Borrador", preparada: "Por aprobar", aprobada: "Aprobada", anulada: "Anulada", historica: "Histórica (trasladada)" };
const slug = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
const descargar = (nombre, texto) => {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob(["﻿" + texto], { type: "text/csv;charset=utf-8" }));
  a.download = nombre; a.click();
};

export default function RemuneracionesNomina({ usuario, nominasGenerales = [], onActualizarGeneral, empresas = [] }) {
  const [fila, setFila] = useState(null);
  const [cargaOk, setCargaOk] = useState(false);
  const [errorCarga, setErrorCarga] = useState(null);
  const [estado, setEstado] = useState(null);           // {tipo, texto}
  const [vista, setVista] = useState("nominas");        // "nominas" | "revision"
  const [selId, setSelId] = useState(null);
  const [draft, setDraft] = useState(null);             // items en edición (borrador)
  const [nueva, setNueva] = useState({ empresa: empresas[0] || "", periodo: new Date().toISOString().slice(0, 7) });
  const [claseSel, setClaseSel] = useState({});         // itemId → clase elegida en la revisión

  const ver = puedeVerRem(usuario);
  const prepara = puedePrepararRem(usuario);

  useEffect(() => {
    if (!ver) return;
    let vivo = true;
    persist.load(FILA_REM)
      .then(r => { if (vivo) { setFila(normalizarFilaRem(r.existe ? r.value : null)); setCargaOk(true); } })
      .catch(e => { console.error("[Remuneraciones] carga falló — guardado deshabilitado:", e); if (vivo) setErrorCarga(String(e?.message || e)); });
    return () => { vivo = false; };
  }, [ver]);

  const candidatos = useMemo(() => candidatosRemuneracion(nominasGenerales), [nominasGenerales]);
  if (!ver) return null;   // defensa: el padre ya no lo monta sin facultad
  if (errorCarga) return <div style={{ padding: 16, color: C.danger }}>No se pudo leer la nómina de remuneraciones ({errorCarga}). No se puede guardar nada hasta recargar.</div>;
  if (!cargaOk || !fila) return <div style={{ padding: 16, color: C.muted }}>Cargando remuneraciones…</div>;

  // Guarda la fila entera con confirmación del servidor. Si no confirma, nada cambia en pantalla.
  async function guardar(nuevaFila, okTexto, auditoria) {
    setEstado({ tipo: "guardando", texto: "Guardando…" });
    const r = await persist.saveConfirmed(FILA_REM, nuevaFila, {});
    if (r && r.ok) {
      setFila(normalizarFilaRem(r.value !== undefined ? r.value : nuevaFila));
      setEstado({ tipo: "ok", texto: okTexto || "Guardado" });
      // Auditoría SIN montos ni nombres de trabajadores.
      if (auditoria && window.auditLog) window.auditLog("editar", { modulo: "finanzas", seccion: "remuneraciones", descripcion: auditoria });
      return true;
    }
    setEstado({ tipo: "error", texto: `No se guardó (${r?.motivo || "sin confirmación del servidor"}). Nada cambió.` });
    return false;
  }
  const accion = async (fn, okTexto, auditoria) => {
    let nf;
    try { nf = fn(); } catch (e) { setEstado({ tipo: "error", texto: e.message }); return false; }
    return guardar(nf, okTexto, auditoria);
  };
  const conNomina = (nom) => ({ ...fila, nominas: fila.nominas.map(n => n.id === nom.id ? nom : n) });

  const sel = fila.nominas.find(n => n.id === selId) || null;
  const items = draft ?? sel?.items ?? [];
  const editable = sel && puedeEditarRem(usuario, sel);

  // ── Acciones del circuito ──
  const crear = () => accion(() => {
    if (!prepara) throw new Error("Solo quien prepara remuneraciones crea nóminas.");
    const numero = fila.nominas.filter(n => n.empresa === nueva.empresa && n.periodo === nueva.periodo).length + 1;
    const nom = nominaRemVacia({ ...nueva, numero }, usuario);
    setSelId(nom.id); setDraft(null);
    return { ...fila, nominas: [...fila.nominas, nom] };
  }, "Nómina creada", `Creó nómina de remuneraciones ${nueva.empresa} ${nueva.periodo}`);
  const guardarBorrador = () => accion(() => conNomina(editarLineas(sel, usuario, items)), "Borrador guardado", `Editó borrador de remuneraciones ${sel.empresa} ${sel.periodo}`)
    .then(ok => ok && setDraft(null));
  const enviar = () => accion(() => conNomina(enviarAAprobacion(editarLineas(sel, usuario, items), usuario)), "Enviada a aprobación",
    `Envió a aprobación remuneraciones ${sel.empresa} ${sel.periodo}`).then(ok => ok && setDraft(null));
  const aprobar = () => accion(() => conNomina(aprobarRem(sel, usuario)), "Aprobada", `Aprobó remuneraciones ${sel.empresa} ${sel.periodo}`);
  const devolver = () => { const m = window.prompt("Motivo de la devolución:"); if (m == null) return;
    accion(() => conNomina(devolverRem(sel, usuario, m)), "Devuelta a borrador", `Devolvió remuneraciones ${sel.empresa} ${sel.periodo}`); };
  const anular = () => { const m = window.prompt("Motivo de la anulación (queda en el historial):"); if (m == null) return;
    accion(() => conNomina(anularRem(sel, usuario, m)), "Anulada", `Anuló remuneraciones ${sel.empresa} ${sel.periodo}`); };

  const updItem = (id, campo, valor) => setDraft(items.map(it => it.id === id ? { ...it, [campo]: valor } : it));
  async function subirDoc(it, file) {
    if (!file) return;
    const docId = `doc_${Date.now()}`;
    const path = `remuneraciones/${slug(sel.empresa)}/${sel.id}/${it.id}/${docId}_${slug(file.name.replace(/\.[^.]+$/, ""))}${(file.name.match(/\.[^.]+$/) || [""])[0]}`;
    const r = await uploadDocNomina(file, path);
    if (!r.ok) { setEstado({ tipo: "error", texto: `No se subió el respaldo: ${r.error}` }); return; }
    const doc = { id: docId, nombre: file.name, path, mime: file.type, sizeKB: Math.round(file.size / 1024),
      hash: await hashArchivo(file), subidoPor: usuario.nombre, fechaSubida: new Date().toISOString(), estado: "activo" };
    setDraft(items.map(x => x.id === it.id ? { ...x, documentos: [...(x.documentos || []), doc] } : x));
    setEstado({ tipo: "ok", texto: "Respaldo subido: guarda el borrador para registrarlo." });
  }
  async function verDoc(d) { const url = await urlFirmadaNomina(d.path); if (url) window.open(url, "_blank", "noopener"); else setEstado({ tipo: "error", texto: "No se pudo abrir el respaldo." }); }

  // ── Revisión de registros existentes de la nómina general ──
  async function trasladar(c) {
    const clase = claseSel[c.itemId];
    const nomG = nominasGenerales.find(n => n.id === c.nominaId);
    let res;
    try { res = trasladarAFilaRem(fila, nomG, c.itemId, clase, usuario); } catch (e) { setEstado({ tipo: "error", texto: e.message }); return; }
    // Paso 1: copia completa en la fila de remuneraciones, confirmada por el servidor.
    if (!res.yaEstaba && !(await guardar(res.fila, "Copiada a remuneraciones", `Trasladó 1 línea de ${nomG.empresa} S${nomG.semana}/${nomG.año} a remuneraciones`))) return;
    // Paso 2 (recién ahora): en la nómina general queda un registro sin montos, nombres ni documentos.
    onActualizarGeneral(stubTrasladada(nomG, c.itemId, res, usuario));
    setEstado({ tipo: "ok", texto: "Trasladada: en la nómina general queda solo el rastro, sin montos ni documentos." });
  }
  function noEsRem(c) {
    const nomG = nominasGenerales.find(n => n.id === c.nominaId);
    try { onActualizarGeneral(marcarNoRemuneracion(nomG, c.itemId, usuario)); } catch (e) { setEstado({ tipo: "error", texto: e.message }); return; }
    window.auditLog && window.auditLog("editar", { modulo: "finanzas", seccion: "remuneraciones", descripcion: `Clasificó 1 línea de ${nomG.empresa} S${nomG.semana}/${nomG.año} como no remuneración` });
    setEstado({ tipo: "ok", texto: "Clasificada como no remuneración: vuelve a la vista normal de la nómina general." });
  }

  const tot = sel ? totalesRem({ items }) : null;
  return (
    <div data-testid="rem-panel" style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, marginBottom: 16, color: C.text, fontFamily: "sans-serif" }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 10 }}>
        <b style={{ fontSize: 15 }}>Nómina de remuneraciones</b>
        <button style={btn(C.primary, vista !== "nominas")} onClick={() => setVista("nominas")}>Nóminas</button>
        <button data-testid="rem-revision" style={btn(C.primary, vista !== "revision")} onClick={() => setVista("revision")}>Revisión de registros existentes ({candidatos.length})</button>
        {estado && <span data-testid="rem-estado" style={{ fontSize: 12, color: estado.tipo === "error" ? C.danger : C.muted }}>{estado.texto}</span>}
      </div>
      <div style={{ fontSize: 11, color: C.muted, marginBottom: 10 }}>
        Detalle visible solo para quien prepara o aprueba remuneraciones. Control de la aplicación: no protege frente a acceso directo a la base.
      </div>

      {vista === "nominas" && !sel && (
        <div>
          {prepara && (
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10, flexWrap: "wrap" }}>
              <select value={nueva.empresa} onChange={e => setNueva({ ...nueva, empresa: e.target.value })} style={{ ...inp, width: 200 }}>
                {empresas.map(e => <option key={e} value={e}>{e}</option>)}
              </select>
              <input type="month" value={nueva.periodo} onChange={e => setNueva({ ...nueva, periodo: e.target.value })} style={{ ...inp, width: 150 }} />
              <button data-testid="rem-crear" style={btn(C.primary)} onClick={crear}>+ Nueva nómina de remuneraciones</button>
            </div>
          )}
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead><tr style={{ textAlign: "left", background: C.alt }}><th>Empresa</th><th>Período</th><th>N°</th><th>Estado</th><th>Líneas</th><th style={{ textAlign: "right" }}>Total</th><th></th></tr></thead>
            <tbody>
              {fila.nominas.length === 0 && <tr><td colSpan={7} style={{ padding: 10, color: C.muted }}>Sin nóminas de remuneraciones.</td></tr>}
              {fila.nominas.map(n => (
                <tr key={n.id} style={{ borderTop: `1px solid ${C.border}` }}>
                  <td>{n.empresa}</td><td>{n.periodo}</td><td>{n.numero}</td><td data-testid={`rem-estado-${n.id}`}>{ESTADO_LABEL[n.estado] || n.estado}</td>
                  <td>{(n.items || []).length}</td><td style={{ textAlign: "right" }}>{clp(totalesRem(n).total)}</td>
                  <td><button style={btn(C.primary, true)} onClick={() => { setSelId(n.id); setDraft(null); }}>Abrir</button></td>
                </tr>))}
            </tbody>
          </table>
        </div>
      )}

      {vista === "nominas" && sel && (
        <div data-testid="rem-detalle">
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}>
            <button style={btn(C.primary, true)} onClick={() => { setSelId(null); setDraft(null); }}>← Volver</button>
            <b>{sel.empresa} · {sel.periodo} · N°{sel.numero}</b>
            <span>{ESTADO_LABEL[sel.estado] || sel.estado}</span>
            {sel.preparadoPor && <span style={{ color: C.muted }}>Preparó: {sel.preparadoPor}</span>}
            {sel.aprobadoPor && <span style={{ color: C.ok }}>Aprobó: {sel.aprobadoPor}</span>}
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead><tr style={{ textAlign: "left", background: C.alt }}><th>Clasificación</th><th>Trabajador</th><th>RUT</th><th>Concepto</th><th style={{ textAlign: "right" }}>Monto CLP</th><th>Respaldos</th></tr></thead>
            <tbody>
              {items.map(it => (
                <tr key={it.id} style={{ borderTop: `1px solid ${C.border}` }}>
                  <td>{editable
                    ? <select data-testid="rem-clase" value={it.clase || ""} onChange={e => updItem(it.id, "clase", e.target.value)} style={inp}>
                        <option value="">— elegir —</option>{CLASES_REM.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}</select>
                    : (CLASES_REM.find(c => c.id === it.clase)?.label || "—")}</td>
                  <td>{editable ? <input data-testid="rem-trabajador" value={it.trabajador || ""} onChange={e => updItem(it.id, "trabajador", e.target.value)} style={inp} /> : it.trabajador}</td>
                  <td>{editable ? <input value={it.rut || ""} onChange={e => updItem(it.id, "rut", e.target.value)} style={inp} /> : it.rut}</td>
                  <td>{editable ? <input value={it.concepto || ""} onChange={e => updItem(it.id, "concepto", e.target.value)} style={inp} /> : it.concepto}</td>
                  <td style={{ textAlign: "right" }}>{editable ? <input data-testid="rem-monto" type="number" value={it.montoCLP || ""} onChange={e => updItem(it.id, "montoCLP", Number(e.target.value) || 0)} style={{ ...inp, textAlign: "right" }} /> : clp(it.montoCLP)}</td>
                  <td>
                    {(it.documentos || []).filter(d => (d.estado || "activo") === "activo").map(d => <button key={d.id} style={{ ...btn(C.primary, true), padding: "2px 6px", marginRight: 4 }} onClick={() => verDoc(d)}>{d.nombre}</button>)}
                    {editable && <input type="file" onChange={e => subirDoc(it, e.target.files?.[0])} style={{ fontSize: 11 }} />}
                  </td>
                </tr>))}
            </tbody>
          </table>
          {tot && <div style={{ marginTop: 8, fontSize: 12 }}>
            {CLASES_REM.map(c => <span key={c.id} style={{ marginRight: 12 }}>{c.label}: {clp(tot.porClase[c.id])}</span>)}
            <b data-testid="rem-total">Total a pagar: {clp(tot.total)}</b> <span style={{ color: C.muted }}>(los descuentos restan)</span></div>}
          <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
            {editable && <button data-testid="rem-agregar" style={btn(C.primary, true)} onClick={() => setDraft([...items, lineaRemVacia()])}>+ Línea</button>}
            {editable && <button data-testid="rem-guardar" style={btn(C.primary)} onClick={guardarBorrador}>Guardar borrador</button>}
            {editable && <button data-testid="rem-enviar" style={btn(C.ok)} onClick={enviar}>Enviar a aprobación</button>}
            {puedeAprobarRem(usuario, sel) && <button data-testid="rem-aprobar" style={btn(C.ok)} onClick={aprobar}>Aprobar</button>}
            {puedeAprobarRem(usuario, sel) && <button data-testid="rem-devolver" style={btn(C.danger, true)} onClick={devolver}>Devolver</button>}
            {prepara && ["borrador", "preparada"].includes(sel.estado) && <button style={btn(C.danger, true)} onClick={anular}>Anular</button>}
            <button style={btn(C.primary, true)} onClick={() => descargar(`remuneraciones-${slug(sel.empresa)}-${sel.periodo}.csv`,
              [["clasificación", "trabajador", "rut", "concepto", "monto CLP"], ...(sel.items || []).map(it => [CLASES_REM.find(c => c.id === it.clase)?.label || "", it.trabajador, it.rut, it.concepto, it.montoCLP])]
                .map(f => f.map(v => `"${String(v ?? "").replace(/"/g, '""')}"`).join(";")).join("\n"))}>Exportar CSV</button>
          </div>
          {editable && erroresParaEnviar({ items }).length > 0 && <div style={{ marginTop: 6, fontSize: 11, color: C.warn }}>Para enviar: {erroresParaEnviar({ items }).join(" ")}</div>}
          {sel.estado === "preparada" && !puedeAprobarRem(usuario, sel) && <div style={{ marginTop: 6, fontSize: 11, color: C.muted }}>Espera la aprobación de Lucía o Cristobal (basta uno).</div>}
          <details style={{ marginTop: 10, fontSize: 11 }}><summary>Historial</summary>
            {(sel.historial || []).map((h, i) => <div key={i}>{h.ts?.slice(0, 16).replace("T", " ")} · {h.usuario} · {h.accion}{h.motivo ? ` · ${h.motivo}` : ""}</div>)}
          </details>
        </div>
      )}

      {vista === "revision" && (
        <div data-testid="rem-revision-lista">
          <div style={{ fontSize: 12, marginBottom: 8 }}>
            Líneas de la nómina general que <b>podrían</b> ser remuneraciones. No se reclasifican solas: mientras no se decidan, quien no puede ver remuneraciones no las ve.
            {prepara ? " Decide cada una: trasladar (eligiendo la clasificación) o marcar como no remuneración." : " Solo quien prepara remuneraciones decide."}
          </div>
          <button style={{ ...btn(C.primary, true), marginBottom: 8 }} onClick={() => descargar("revision-remuneraciones.csv", candidatosCSV(candidatos))}>Exportar listado (CSV)</button>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11.5 }}>
            <thead><tr style={{ textAlign: "left", background: C.alt }}><th>Empresa</th><th>Semana</th><th>Sección</th><th>Proveedor / trabajador</th><th>Concepto</th><th style={{ textAlign: "right" }}>CLP</th><th>Docs</th><th>Motivos</th><th>Decisión</th></tr></thead>
            <tbody>
              {candidatos.length === 0 && <tr><td colSpan={9} style={{ padding: 10, color: C.muted }}>No quedan registros pendientes de clasificar.</td></tr>}
              {candidatos.map(c => {
                const ya = buscarTrasladada(fila, c.itemId);
                return (
                  <tr key={c.itemId} data-testid="rem-candidato" style={{ borderTop: `1px solid ${C.border}` }}>
                    <td>{c.empresa}</td><td>S{c.semana}/{c.año}{c.numero > 1 ? ` N°${c.numero}` : ""}</td><td>{c.seccion}</td>
                    <td>{c.proveedor}</td><td>{c.concepto}</td><td style={{ textAlign: "right" }}>{clp(c.montoCLP)}</td><td>{c.documentos}</td>
                    <td style={{ fontSize: 10.5, color: C.muted }}>{c.motivos.join(" · ")}</td>
                    <td>{!prepara ? "—" : ya
                      ? <button style={btn(C.primary)} onClick={() => onActualizarGeneral(stubTrasladada(nominasGenerales.find(n => n.id === c.nominaId), c.itemId, { remNominaId: ya.nom.id, remItemId: ya.it.id }, usuario))}>Completar retiro (ya copiada)</button>
                      : <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                          <select data-testid="rem-cand-clase" value={claseSel[c.itemId] || ""} onChange={e => setClaseSel({ ...claseSel, [c.itemId]: e.target.value })} style={{ ...inp, width: 130 }}>
                            <option value="">— clasificación —</option>{CLASES_REM.map(k => <option key={k.id} value={k.id}>{k.label}</option>)}</select>
                          <button data-testid="rem-cand-trasladar" disabled={!claseSel[c.itemId]} style={btn(C.primary)} onClick={() => trasladar(c)}>Trasladar</button>
                          <button data-testid="rem-cand-no" style={btn(C.primary, true)} onClick={() => noEsRem(c)}>No es remuneración</button>
                        </div>}</td>
                  </tr>);
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
