/* eslint-disable */
// src/proceso/ui/pages/InformeDetalle.jsx — Resultado de Proceso: versiones,
// snapshot inmutable, emisión, PDF (desde snapshot, NO CURRENT), destinatarios,
// envíos. Una versión emitida no cambia; corrección = nueva versión.
import React, { useEffect, useState, useCallback } from "react";
import { useService } from "../hooks/useServiceContext";
import {
  cargarInformePorId, cargarInformeRaw, cargarVersiones, cargarFuentes, cargarDestinatarios, cargarEnvios,
  generarVersion, agregarDestinatario, emitirVersion, registrarEnvio, cargarOrdenesInformables,
  cargarVinculosPorRol, cargarCategorias, cargarCalibresEspecie, cargarColoresEspecie,
} from "../../core/procesoF7DB";
import { traducirError } from "../../core/procesoF7Domain";
import { buildResultadoPdfData, generarResultadoPdf, descargarBlob } from "../procesoPdf";
import {
  ProcPageHeader, ProcCard, ProcButton, ProcStatusBadge, ProcKpiCard, ProcDataTable, ProcModal, ProcField, inputStyle,
  ProcLoadingState, ProcErrorState, ProcEmptyState, ProcAuditInfo,
} from "../components/base";
import { C, sp } from "../estilos";
import { formatKg, formatNum, formatFecha, formatFechaHora, formatPct, normalizarNombre } from "../format";

const kg = (n) => formatKg(n);
const pctv = (n) => formatPct(n);
function Seccion({ titulo, extra, children }) {
  return <ProcCard style={{ padding: sp.lg, marginBottom: sp.md }}>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: sp.md, flexWrap: "wrap", gap: sp.sm }}>
      <div style={{ fontSize: 15, fontWeight: 800, color: C.text }}>{titulo}</div>{extra}</div>{children}</ProcCard>;
}

export default function InformeDetalle() {
  const { empresa, ir, vista, puedeEditar, notificar } = useService();
  const id = vista?.params?.id;
  const [inf, setInf] = useState(null); const [raw, setRaw] = useState(null); const [versiones, setVersiones] = useState([]);
  const [selVer, setSelVer] = useState(null);
  const [fuentes, setFuentes] = useState([]); const [dests, setDests] = useState([]); const [envios, setEnvios] = useState([]);
  const [maestros, setMaestros] = useState({ cat: {}, cal: {}, col: {} });
  const [estado, setEstado] = useState("loading"); const [error, setError] = useState(null);
  const [nuevaVer, setNuevaVer] = useState(null); const [addDest, setAddDest] = useState(null); const [envForm, setEnvForm] = useState(null);
  const editable = puedeEditar("informes") || puedeEditar("centro");

  const cargarBase = useCallback(async () => {
    if (!empresa || !id) return;
    setEstado("loading"); setError(null);
    try {
      const [i, rw, vs] = await Promise.all([cargarInformePorId(empresa, id), cargarInformeRaw(empresa, id), cargarVersiones(empresa, id)]);
      setInf((i && i[0]) || null); setRaw((rw && rw[0]) || null); setVersiones(vs || []);
      const vsel = (vs || []).find((v) => v.estado === "emitida") || (vs || [])[0] || null;
      setSelVer(vsel); setEstado("ok");
    } catch (e) { setError(traducirError(e)); setEstado("error"); }
  }, [empresa, id]);
  useEffect(() => { cargarBase(); }, [cargarBase]);

  const cargarVer = useCallback(async (v) => {
    if (!v) return;
    const [fu, de, en, cats] = await Promise.all([
      cargarFuentes(empresa, v.id), cargarDestinatarios(empresa, v.id), cargarEnvios(empresa, v.id), cargarCategorias(empresa),
    ]);
    setFuentes(fu || []); setDests(de || []); setEnvios(en || []);
    const esp = (v.snapshot && v.snapshot.identificacion && (v.snapshot.identificacion.especie)) || "CHE";
    const [cals, cols] = await Promise.all([cargarCalibresEspecie(empresa, esp), cargarColoresEspecie(empresa, esp)]);
    const idx = (arr) => Object.fromEntries((arr || []).map((x) => [x.id, x.nombre]));
    setMaestros({ cat: idx(cats), cal: idx(cals), col: idx(cols) });
  }, [empresa]);
  useEffect(() => { if (selVer) cargarVer(selVer); }, [selVer, cargarVer]);

  if (estado === "loading") return <ProcLoadingState />;
  if (estado === "error") return <ProcErrorState error={error} onRetry={cargarBase} />;
  if (!inf) return <ProcEmptyState titulo="Informe no encontrado" />;

  const snap = (selVer && selVer.snapshot) || {};
  const resumen = snap.resumen || {};
  const detalleLabeled = (snap.detalle || []).map((d) => ({
    categoria: maestros.cat[d.categoria] || d.categoria, calibre: maestros.cal[d.calibre] || d.calibre,
    color: maestros.col[d.color] || d.color, kg: d.kg,
  }));
  const emitida = selVer && selVer.estado === "emitida";

  const emitir = async () => { try { await emitirVersion({ empresaId: empresa, versionId: selVer.id, pdfPath: `/informes/${inf.folio}-v${selVer.version}.pdf` }); notificar("Versión emitida ✓"); cargarBase(); } catch (e) { notificar(traducirError(e), "error"); } };
  const descargarPdf = async () => {
    try {
      const meta = {
        folio: inf.folio, version: selVer.version, temporada: inf.temporada_codigo, emitido_at: selVer.emitido_at,
        identificacion: { cliente: inf.destinatario, ...(snap.identificacion || {}) }, detalleLabeled, responsable: "—",
      };
      const data = buildResultadoPdfData(snap, meta);
      const blob = await generarResultadoPdf(data);
      descargarBlob(blob, `${inf.folio}-v${selVer.version}.pdf`);
      notificar("PDF generado desde el snapshot");
    } catch (e) { notificar(traducirError(e), "error"); }
  };
  const crearNuevaVer = async () => {
    if (!nuevaVer.ordenes.length) return notificar("Seleccioná órdenes", "error");
    if (!nuevaVer.motivo) return notificar("Indicá el motivo de la nueva versión", "error");
    try { await generarVersion({ empresaId: empresa, informeId: id, ordenIds: nuevaVer.ordenes, observaciones: nuevaVer.observaciones || null, motivo: nuevaVer.motivo });
      notificar("Nueva versión generada"); setNuevaVer(null); cargarBase();
    } catch (e) { notificar(traducirError(e), "error"); }
  };
  const doAddDest = async (vinc) => { try { await agregarDestinatario({ empresaId: empresa, versionId: selVer.id, vinculoId: vinc }); notificar("Destinatario agregado"); setAddDest(null); cargarVer(selVer); } catch (e) { notificar(traducirError(e), "error"); } };
  const doEnvio = async () => { try { await registrarEnvio({ empresaId: empresa, versionId: selVer.id, destinatarioId: envForm.destinatarioId || null, canal: envForm.canal, destinoEmail: envForm.email || null }); notificar("Envío registrado"); setEnvForm(null); cargarVer(selVer); } catch (e) { notificar(traducirError(e), "error"); } };

  return (
    <div>
      <ProcPageHeader titulo={`Resultado de Proceso ${inf.folio}`} subtitulo="Versionamiento · snapshot inmutable"
        acciones={<>
          <ProcButton kind="ghost" onClick={() => ir("informes")}>← Informes</ProcButton>
          {editable && <ProcButton onClick={async () => { const inf2 = await cargarOrdenesInformables(empresa); setNuevaVer({ ordenes: [], motivo: "", observaciones: "", opciones: inf2 || [] }); }}>Nueva versión</ProcButton>}
        </>} />

      <Seccion titulo="Informe" extra={<ProcStatusBadge estado={inf.estado} />}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(150px,1fr))", gap: sp.md }}>
          <div><div style={{ fontSize: 11, color: C.muted, fontWeight: 600 }}>Folio</div><div>{inf.folio}</div></div>
          <div><div style={{ fontSize: 11, color: C.muted, fontWeight: 600 }}>Destinatario principal</div><div>{inf.destinatario || "—"}</div></div>
          <div><div style={{ fontSize: 11, color: C.muted, fontWeight: 600 }}>Versión vigente</div><div>{inf.version_actual}</div></div>
        </div>
      </Seccion>

      <Seccion titulo={`Versiones (${versiones.length})`}>
        <ProcDataTable
          columnas={[
            { titulo: "Versión", render: (v) => <b>v{v.version}</b> },
            { titulo: "Estado", render: (v) => <ProcStatusBadge estado={v.estado} /> },
            { titulo: "Packout", align: "right", render: (v) => pctv(v.packout) },
            { titulo: "Generada", render: (v) => formatFechaHora(v.generado_at || v.created_at) },
            { titulo: "Emitida", render: (v) => (v.emitido_at ? formatFechaHora(v.emitido_at) : "—") },
            { titulo: "Motivo", campo: "motivo" },
            { titulo: "", align: "right", render: (v) => <ProcButton kind="ghost" small onClick={() => setSelVer(v)}>{selVer?.id === v.id ? "● Viendo" : "Ver"}</ProcButton> },
          ]}
          filas={versiones} rowKey="id" vacio={<ProcEmptyState titulo="Sin versiones" />} />
      </Seccion>

      {selVer && (
        <>
          <Seccion titulo={`Versión v${selVer.version} · ${emitida ? "SNAPSHOT congelado" : "aún editable (regenerable)"}`}
            extra={<div style={{ display: "flex", gap: sp.sm }}>
              {editable && ["generada", "aprobada"].includes(selVer.estado) && <ProcButton kind="success" onClick={emitir}>Emitir</ProcButton>}
              <ProcButton onClick={descargarPdf}>Descargar PDF</ProcButton>
            </div>}>
            <div style={{ fontSize: 12, color: emitida ? C.success : C.warning, marginBottom: sp.md, fontWeight: 600 }}>
              {emitida ? `Emitida ${selVer.emitido_at ? formatFechaHora(selVer.emitido_at) : ""} — la historia no cambia; el PDF nace de este snapshot.` : "CURRENT: esta versión aún puede regenerarse; al emitir queda congelada."}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(150px,1fr))", gap: sp.md }}>
              <ProcKpiCard label="Kg procesados" valor={kg(resumen.kg_procesados)} tono="info" />
              <ProcKpiCard label="Kg comerciales" valor={kg(resumen.kg_comerciales)} tono="success" />
              <ProcKpiCard label="Packout" valor={pctv(resumen.packout)} tono="primary" />
              <ProcKpiCard label="Descarte" valor={kg(resumen.kg_descarte)} tono="warning" />
              <ProcKpiCard label="Merma" valor={kg(resumen.kg_merma)} tono="neutral" />
            </div>
            <div style={{ marginTop: sp.md }}>
              <ProcDataTable
                columnas={[{ titulo: "Categoría", render: (d) => d.categoria }, { titulo: "Calibre", render: (d) => d.calibre }, { titulo: "Color", render: (d) => d.color }, { titulo: "Kg", align: "right", render: (d) => kg(d.kg) }]}
                filas={detalleLabeled} rowKey="categoria" vacio={<ProcEmptyState titulo="Sin detalle por dimensión" />} />
            </div>
            {snap.adicional?.observaciones && <div style={{ marginTop: sp.md, fontSize: 13, color: C.text }}><b>Observaciones:</b> {snap.adicional.observaciones}</div>}
          </Seccion>

          <Seccion titulo={`Fuentes (${fuentes.length})`}>
            <ProcDataTable columnas={[{ titulo: "Tipo", campo: "tipo_fuente" }, { titulo: "Referencia", render: (f) => f.tipo_fuente === "orden" ? <ProcButton kind="ghost" small onClick={() => ir("orden", { id: f.ref_id })}>Ver orden →</ProcButton> : "—" }]}
              filas={fuentes} rowKey="id" vacio={<ProcEmptyState titulo="Sin fuentes" />} />
          </Seccion>

          <Seccion titulo={`Destinatarios (${dests.length})`} extra={editable ? <ProcButton kind="ghost" small onClick={async () => setAddDest({ opciones: await cargarVinculosPorRol(empresa, "cliente_servicio").then((a) => a || []) })}>+ Destinatario</ProcButton> : null}>
            <ProcDataTable columnas={[{ titulo: "Nombre (snapshot)", campo: "nombre_snapshot" }, { titulo: "Email (snapshot)", campo: "email_snapshot" }, { titulo: "Rol", campo: "rol" }]}
              filas={dests} rowKey="id" vacio={<ProcEmptyState titulo="Sin destinatarios" detalle="El contacto se congela al agregarlo (no sigue al maestro)." />} />
          </Seccion>

          <Seccion titulo={`Envíos (${envios.length})`} extra={editable ? <ProcButton kind="ghost" small onClick={() => setEnvForm({ canal: "descarga", destinatarioId: "", email: "" })}>+ Registrar envío</ProcButton> : null}>
            <ProcDataTable columnas={[{ titulo: "Canal", campo: "canal" }, { titulo: "Destino", campo: "destino_email" }, { titulo: "Estado", render: (e) => <ProcStatusBadge estado={e.estado} texto={e.estado} /> }, { titulo: "Fecha", render: (e) => formatFechaHora(e.created_at) }]}
              filas={envios} rowKey="id" vacio={<ProcEmptyState titulo="Sin envíos" detalle="Generar/descargar el PDF no marca 'enviado'; el envío es una acción explícita." />} />
          </Seccion>
        </>
      )}

      <Seccion titulo="Auditoría"><ProcAuditInfo registro={raw} /></Seccion>

      {nuevaVer && (
        <ProcModal titulo="Nueva versión" onClose={() => setNuevaVer(null)} ancho={620}
          acciones={<><ProcButton kind="ghost" onClick={() => setNuevaVer(null)}>Cancelar</ProcButton><ProcButton onClick={crearNuevaVer}>Generar versión</ProcButton></>}>
          <div style={{ fontSize: 12.5, color: C.muted, marginBottom: sp.sm }}>La versión anterior permanece; esta será una nueva versión con su propio snapshot.</div>
          <ProcField label="Órdenes fuente (cerradas/conciliadas)">
            <div style={{ maxHeight: 200, overflowY: "auto", border: `1px solid ${C.border}`, borderRadius: 8 }}>
              {nuevaVer.opciones.map((o) => (
                <label key={o.orden_id} style={{ display: "flex", gap: 8, padding: "6px 10px", borderBottom: `1px solid ${C.border}`, fontSize: 13, cursor: "pointer" }}>
                  <input type="checkbox" checked={nuevaVer.ordenes.includes(o.orden_id)} onChange={() => setNuevaVer((x) => ({ ...x, ordenes: x.ordenes.includes(o.orden_id) ? x.ordenes.filter((y) => y !== o.orden_id) : [...x.ordenes, o.orden_id] }))} />
                  <b>{o.folio}</b> <span style={{ color: C.muted }}>· {o.cliente || "—"} · {kg(o.kg_procesados)} · {pctv(o.packout)}</span>
                </label>
              ))}
            </div>
          </ProcField>
          <ProcField label="Motivo" requerido><input style={inputStyle} value={nuevaVer.motivo} onChange={(e) => setNuevaVer((x) => ({ ...x, motivo: e.target.value }))} placeholder="corrección de dato / observación / nueva consolidación…" /></ProcField>
          <ProcField label="Observaciones"><textarea style={{ ...inputStyle, minHeight: 50 }} value={nuevaVer.observaciones} onChange={(e) => setNuevaVer((x) => ({ ...x, observaciones: e.target.value }))} /></ProcField>
        </ProcModal>
      )}
      {addDest && (
        <ProcModal titulo="Agregar destinatario" onClose={() => setAddDest(null)}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {addDest.opciones.map((v) => <ProcButton key={v.id} kind="ghost" onClick={() => doAddDest(v.id)}>{normalizarNombre(v.nombre_provisional)}</ProcButton>)}
          </div>
        </ProcModal>
      )}
      {envForm && (
        <ProcModal titulo="Registrar envío" onClose={() => setEnvForm(null)}
          acciones={<><ProcButton kind="ghost" onClick={() => setEnvForm(null)}>Cancelar</ProcButton><ProcButton onClick={doEnvio}>Registrar</ProcButton></>}>
          <ProcField label="Canal"><select style={inputStyle} value={envForm.canal} onChange={(e) => setEnvForm((x) => ({ ...x, canal: e.target.value }))}><option value="descarga">Descarga</option><option value="email">Email</option></select></ProcField>
          {envForm.canal === "email" && <ProcField label="Email destino"><input style={inputStyle} value={envForm.email} onChange={(e) => setEnvForm((x) => ({ ...x, email: e.target.value }))} /></ProcField>}
          <div style={{ fontSize: 11.5, color: C.muted2 }}>El envío por email real depende de configuración; se registra el estado (pendiente/enviado/error).</div>
        </ProcModal>
      )}
    </div>
  );
}
