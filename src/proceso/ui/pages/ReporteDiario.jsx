/* eslint-disable */
// src/proceso/ui/pages/ReporteDiario.jsx — Configuración → Reportes Automáticos →
// Informe Diario de Operación. Config + destinatarios + Preview + Enviar ahora +
// Historial. Preview y envío usan el MISMO motor backend (proc_fn_*). Kg desde el
// ledger (snapshot); nunca se recalcula en React. Scheduler automático = server-side (GAP).
import React, { useEffect, useState, useCallback, useMemo } from "react";
import { useService } from "../hooks/useServiceContext";
import {
  cargarReporteConfigs, crearReporteConfig, actualizarReporteConfig, desactivarReporteConfig,
  cargarReporteDestinatarios, crearReporteDestinatario, desactivarReporteDestinatario,
  previewInformeDiario, generarEjecucionReporte, marcarEnviadoReporte, marcarErrorReporte, reintentarReporte,
  cargarEjecucionesReporte, cargarClientesServicio,
} from "../../core/procesoF7DB";
import { cargarPlantas } from "../../core/procesoDB";
import { traducirError, fechaCalendarioTz, TZ_OPERACIONAL } from "../../core/procesoF7Domain";
import { construirEmailInformeDiario, filasInformeDiario, totalesInformeDiario } from "../../core/reportingEmail";
import { enviarEmail } from "../../../emailHelper";
import {
  ProcPageHeader, ProcCard, ProcButton, ProcField, inputStyle, ProcStatusBadge,
  ProcDataTable, ProcFilters, ProcLoadingState, ProcErrorState, ProcEmptyState, ProcModal,
} from "../components/base";
import { C, sp } from "../estilos";
import { normalizarNombre, formatNum, formatFecha, formatFechaHora } from "../format";

const TZS = ["America/Santiago", "America/Lima", "UTC"];
// FOP-12: fecha preview/default en la tz operacional configurada (no UTC del navegador).
// El backend sigue siendo autoridad del dataset (agrupa por AT TIME ZONE America/Santiago).
const hoyISO = () => fechaCalendarioTz();
const uno = (r) => (Array.isArray(r) ? r[0] : r);

function Metrica({ t, v, tono }) {
  return <div style={{ padding: "8px 12px", background: C.cardAlt, borderRadius: 8 }}>
    <div style={{ fontSize: 11, color: C.muted, textTransform: "uppercase", letterSpacing: .3 }}>{t}</div>
    <div style={{ fontSize: 15, fontWeight: 800, color: tono || C.text }}>{v}</div></div>;
}

export default function ReporteDiario() {
  const { empresa, ir, notificar, puedeEditar } = useService();
  const editable = puedeEditar ? (puedeEditar("config") || puedeEditar("centro")) : true;
  const [configs, setConfigs] = useState([]);
  const [sel, setSel] = useState(null);          // config seleccionada
  const [dests, setDests] = useState([]);
  const [plantas, setPlantas] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [estado, setEstado] = useState("loading");
  const [error, setError] = useState(null);
  // preview
  const [fecha, setFecha] = useState(hoyISO());
  const [preview, setPreview] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [enviando, setEnviando] = useState(false);
  // historial
  const [hist, setHist] = useState([]);
  const [fEstado, setFEstado] = useState("");
  const [fFecha, setFFecha] = useState("");
  const [modalDest, setModalDest] = useState(false);

  const plantaNombre = (id) => (plantas.find((p) => p.id === id) || {}).nombre || null;

  const cargar = useCallback(async () => {
    if (!empresa) { setEstado("ok"); setConfigs([]); return; }
    setEstado("loading"); setError(null);
    try {
      const [cfgs, pls, clis, ejs] = await Promise.all([
        cargarReporteConfigs(empresa), cargarPlantas(empresa), cargarClientesServicio(empresa), cargarEjecucionesReporte(empresa),
      ]);
      setConfigs(cfgs || []); setPlantas(pls || []); setClientes(clis || []); setHist(ejs || []);
      setSel((prev) => (prev ? (cfgs || []).find((c) => c.id === prev.id) || (cfgs || [])[0] || null : (cfgs || [])[0] || null));
      setEstado("ok");
    } catch (e) { setError(traducirError(e)); setEstado("error"); }
  }, [empresa]);
  useEffect(() => { cargar(); }, [cargar]);

  useEffect(() => {
    if (!empresa || !sel) { setDests([]); return; }
    cargarReporteDestinatarios(empresa, sel.id).then(setDests).catch(() => setDests([]));
  }, [empresa, sel]);

  const crearConfig = async () => {
    try {
      const r = uno(await crearReporteConfig({ empresa_id: empresa, nombre: "Informe diario", timezone: "America/Santiago", alcance: "general" }));
      notificar("Configuración creada"); await cargar(); setSel(r);
    } catch (e) { notificar(traducirError(e), "error"); }
  };
  const guardarConfig = async (patch) => {
    if (!sel) return;
    try { await actualizarReporteConfig(sel.id, empresa, patch); setSel((s) => ({ ...s, ...patch })); await cargar(); }
    catch (e) { notificar(traducirError(e), "error"); }
  };

  const correrPreview = async () => {
    if (!sel) return;
    setPreviewLoading(true); setPreview(null);
    try {
      const rows = await previewInformeDiario({
        empresaId: empresa, fecha, plantaId: sel.planta_id,
        clienteId: sel.alcance === "cliente" ? sel.alcance_cliente_vinculo_id : null, timezone: sel.timezone,
      });
      // el preview usa el MISMO motor read-only; se arma el snapshot equivalente para mostrar
      const clientes = (rows || []).map((x) => ({ ...x }));
      const snap = { fecha, planta_id: sel.planta_id, timezone: sel.timezone, alcance: sel.alcance, clientes,
        total_kg_recibido: clientes.reduce((a, c) => a + Number(c.kg_recibido || 0), 0),
        total_kg_procesado: clientes.reduce((a, c) => a + Number(c.kg_procesado || 0), 0) };
      setPreview(snap);
    } catch (e) { notificar(traducirError(e), "error"); }
    finally { setPreviewLoading(false); }
  };

  // Enviar ahora: MISMO motor que el scheduler (generar_ejecucion idempotente) + envío real.
  const enviarAhora = async () => {
    if (!sel) return;
    setEnviando(true);
    try {
      const ej = uno(await generarEjecucionReporte({ empresaId: empresa, configId: sel.id, fecha }));
      if (ej.estado === "omitido") { notificar("Sin movimiento operacional: informe omitido por política.", "error"); await cargar(); return; }
      if (ej.estado === "enviado") { notificar(`El informe del ${formatFecha(ej.fecha_operacional)} ya fue enviado (idempotente). No se reenvía.`, "error"); await cargar(); return; }
      const dest = (ej.destinatarios_snapshot || []).map((d) => d.email).filter(Boolean).join(",");
      if (!dest) { notificar("La configuración no tiene destinatarios activos.", "error"); await cargar(); return; }
      const { asunto, html, texto } = construirEmailInformeDiario(ej, { plantaNombre: plantaNombre(ej.planta_id) });
      try {
        const r = await enviarEmail({ to: dest, subject: asunto, html, message: texto, modulo: "allegria" });
        if (r && r.success) {
          await marcarEnviadoReporte({ empresaId: empresa, ejecucionId: ej.id, proveedor: r.method || "smtp", messageId: r.messageId || r.id || "ok" });
          notificar(`Informe enviado a ${dest}`);
        } else {
          await marcarErrorReporte({ empresaId: empresa, ejecucionId: ej.id, error: (r && r.error) || "proveedor de correo no disponible" });
          notificar(`No se pudo enviar el correo: ${(r && r.error) || "proveedor no disponible"}. Queda en error, reintentable.`, "error");
        }
      } catch (e) {
        await marcarErrorReporte({ empresaId: empresa, ejecucionId: ej.id, error: e.message || "error de envío" });
        notificar("No se pudo enviar el correo (proveedor server-side no disponible). Queda en error, reintentable.", "error");
      }
      await cargar();
    } catch (e) { notificar(traducirError(e), "error"); }
    finally { setEnviando(false); }
  };

  const reintentar = async (ej) => {
    try {
      await reintentarReporte({ empresaId: empresa, ejecucionId: ej.id });
      const dest = (ej.destinatarios_snapshot || []).map((d) => d.email).filter(Boolean).join(",");
      const { asunto, html, texto } = construirEmailInformeDiario(ej, { plantaNombre: plantaNombre(ej.planta_id) });
      try {
        const r = await enviarEmail({ to: dest, subject: asunto, html, message: texto, modulo: "allegria" });
        if (r && r.success) await marcarEnviadoReporte({ empresaId: empresa, ejecucionId: ej.id, proveedor: r.method || "smtp", messageId: r.messageId || r.id || "ok" });
        else await marcarErrorReporte({ empresaId: empresa, ejecucionId: ej.id, error: (r && r.error) || "proveedor no disponible" });
      } catch (e) { await marcarErrorReporte({ empresaId: empresa, ejecucionId: ej.id, error: e.message || "error de envío" }); }
      notificar("Reintento ejecutado"); await cargar();
    } catch (e) { notificar(traducirError(e), "error"); }
  };

  const histFiltrado = useMemo(() => (hist || []).filter((h) => {
    if (fEstado && h.estado !== fEstado) return false;
    if (fFecha && h.fecha_operacional !== fFecha) return false;
    return true;
  }), [hist, fEstado, fFecha]);

  if (!empresa) return <div><ProcPageHeader titulo="Informe Diario de Operación" /><ProcCard style={{ padding: sp.lg }}><ProcEmptyState icono="📧" titulo="Seleccioná un tenant" /></ProcCard></div>;
  if (estado === "loading") return <ProcLoadingState />;
  if (estado === "error") return <ProcErrorState error={error} onRetry={cargar} />;

  const totPrev = preview ? totalesInformeDiario(preview) : null;

  return (
    <div>
      <ProcPageHeader titulo="Reportes Automáticos · Informe Diario de Operación"
        subtitulo="Resumen operacional por cliente (kg recibidos / procesados) desde el ledger. El scheduler automático es server-side."
        acciones={<ProcButton kind="ghost" onClick={() => ir("centro")}>← Centro</ProcButton>} />

      {/* Selector de configuración */}
      <ProcCard style={{ padding: sp.lg, marginBottom: sp.md }}>
        <div style={{ display: "flex", gap: sp.sm, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>Configuración:</span>
          <select style={{ ...inputStyle, width: "auto", minWidth: 220 }} value={sel?.id || ""} onChange={(e) => setSel(configs.find((c) => c.id === e.target.value) || null)}>
            {configs.length === 0 && <option value="">— sin configuraciones —</option>}
            {configs.map((c) => <option key={c.id} value={c.id}>{normalizarNombre(c.nombre) || "Informe diario"}{c.activo ? "" : " (inactiva)"}</option>)}
          </select>
          {editable && <ProcButton kind="ghost" small onClick={crearConfig}>+ Nueva configuración</ProcButton>}
        </div>
      </ProcCard>

      {!sel ? (
        <ProcCard style={{ padding: sp.lg }}><ProcEmptyState icono="📧" titulo="Sin configuración" detalle="Creá una configuración para definir planta, timezone, hora, destinatarios y política." /></ProcCard>
      ) : (
        <>
          {/* Configuración */}
          <ProcCard style={{ padding: sp.lg, marginBottom: sp.md }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: C.text, marginBottom: sp.md }}>Parámetros</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(200px,1fr))", gap: sp.md }}>
              <ProcField label="Nombre"><input style={inputStyle} defaultValue={sel.nombre || ""} disabled={!editable} onBlur={(e) => guardarConfig({ nombre: e.target.value })} /></ProcField>
              <ProcField label="Activo"><select style={inputStyle} value={sel.activo ? "si" : "no"} disabled={!editable} onChange={(e) => guardarConfig({ activo: e.target.value === "si" })}><option value="si">Activo</option><option value="no">Inactivo</option></select></ProcField>
              <ProcField label="Planta"><select style={inputStyle} value={sel.planta_id || ""} disabled={!editable} onChange={(e) => guardarConfig({ planta_id: e.target.value || null })}><option value="">Todas</option>{plantas.map((p) => <option key={p.id} value={p.id}>{p.nombre || p.codigo}</option>)}</select></ProcField>
              <ProcField label="Timezone" hint="Corte diario determinístico"><select style={inputStyle} value={sel.timezone} disabled={!editable} onChange={(e) => guardarConfig({ timezone: e.target.value })}>{TZS.map((t) => <option key={t} value={t}>{t}</option>)}</select></ProcField>
              <ProcField label="Hora de envío"><input style={inputStyle} type="time" defaultValue={(sel.hora_envio || "18:00").slice(0, 5)} disabled={!editable} onBlur={(e) => guardarConfig({ hora_envio: e.target.value })} /></ProcField>
              <ProcField label="Si no hubo movimiento"><select style={inputStyle} value={sel.enviar_sin_movimiento ? "enviar" : "omitir"} disabled={!editable} onChange={(e) => guardarConfig({ enviar_sin_movimiento: e.target.value === "enviar" })}><option value="omitir">No enviar (omitir)</option><option value="enviar">Enviar igual (cero)</option></select></ProcField>
              <ProcField label="Incluir alertas"><select style={inputStyle} value={sel.incluir_alertas ? "si" : "no"} disabled={!editable} onChange={(e) => guardarConfig({ incluir_alertas: e.target.value === "si" })}><option value="no">No</option><option value="si">Sí</option></select></ProcField>
              <ProcField label="Alcance"><select style={inputStyle} value={sel.alcance} disabled={!editable} onChange={(e) => guardarConfig({ alcance: e.target.value, alcance_cliente_vinculo_id: e.target.value === "general" ? null : sel.alcance_cliente_vinculo_id })}><option value="general">General (todos los clientes)</option><option value="cliente">Un cliente específico</option></select></ProcField>
              {sel.alcance === "cliente" && (
                <ProcField label="Cliente reportado"><select style={inputStyle} value={sel.alcance_cliente_vinculo_id || ""} disabled={!editable} onChange={(e) => guardarConfig({ alcance_cliente_vinculo_id: e.target.value || null })}><option value="">—</option>{clientes.map((c) => <option key={c.cliente_vinculo_id} value={c.cliente_vinculo_id}>{normalizarNombre(c.cliente)}</option>)}</select></ProcField>
              )}
            </div>
            <div style={{ marginTop: sp.sm, fontSize: 11.5, color: C.muted }}>El <b>cliente reportado</b> (qué datos salen) es distinto del <b>destinatario</b> (a quién se envía). Un destinatario externo atado a un alcance por cliente sólo recibe ese cliente.</div>
          </ProcCard>

          {/* Destinatarios */}
          <ProcCard style={{ padding: sp.lg, marginBottom: sp.md }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: sp.md }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: C.text }}>Destinatarios del email</div>
              {editable && <ProcButton small onClick={() => setModalDest(true)}>+ Agregar destinatario</ProcButton>}
            </div>
            <ProcDataTable
              columnas={[
                { titulo: "Nombre", render: (d) => normalizarNombre(d.nombre) || "—" },
                { titulo: "Email", render: (d) => d.email },
                { titulo: "Tipo", render: (d) => <ProcStatusBadge texto={d.tipo} tono={d.tipo === "externo" ? "warning" : "info"} /> },
                { titulo: "Estado", render: (d) => <ProcStatusBadge texto={d.activo ? "Activo" : "Inactivo"} tono={d.activo ? "success" : "neutral"} /> },
                ...(editable ? [{ titulo: "", align: "right", render: (d) => d.activo ? <ProcButton kind="ghost" small onClick={async () => { await desactivarReporteDestinatario(d.id, empresa); cargarReporteDestinatarios(empresa, sel.id).then(setDests); }}>Quitar</ProcButton> : null }] : []),
              ]}
              filas={dests} rowKey="id"
              vacio={<ProcEmptyState icono="📇" titulo="Sin destinatarios" detalle="Agregá al menos un email para poder enviar." />} />
          </ProcCard>

          {/* Preview + Enviar ahora */}
          <ProcCard style={{ padding: sp.lg, marginBottom: sp.md }}>
            <div style={{ display: "flex", gap: sp.sm, alignItems: "end", flexWrap: "wrap", marginBottom: sp.md }}>
              <ProcField label="Fecha operacional"><input style={inputStyle} type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} /></ProcField>
              <ProcButton kind="ghost" onClick={correrPreview} disabled={previewLoading}>{previewLoading ? "Calculando…" : "Previsualizar"}</ProcButton>
              {editable && <ProcButton onClick={enviarAhora} disabled={enviando}>{enviando ? "Enviando…" : "Enviar ahora"}</ProcButton>}
            </div>
            {preview && (
              <>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(150px,1fr))", gap: sp.sm, marginBottom: sp.md }}>
                  <Metrica t="Fecha" v={formatFecha(fecha)} />
                  <Metrica t="Planta" v={sel.planta_id ? plantaNombre(sel.planta_id) : "Todas"} />
                  <Metrica t="Kg recibidos" v={formatNum(totPrev.kg_recibido, 1)} tono={C.info} />
                  <Metrica t="Kg procesados" v={formatNum(totPrev.kg_procesado, 1)} tono={C.primary} />
                  <Metrica t="Clientes" v={totPrev.cantidad_clientes} />
                </div>
                <ProcDataTable
                  columnas={[
                    { titulo: "Cliente", render: (f) => <b>{normalizarNombre(f.cliente)}</b> },
                    { titulo: "Kg recibidos", align: "right", render: (f) => formatNum(f.kg_recibido, 1) },
                    { titulo: "Kg procesados", align: "right", render: (f) => formatNum(f.kg_procesado, 1) },
                    { titulo: "Recepciones", align: "right", render: (f) => f.recepciones },
                    { titulo: "Órdenes", align: "right", render: (f) => f.ordenes },
                  ]}
                  filas={filasInformeDiario(preview)} rowKey="cliente"
                  vacio={<ProcEmptyState icono="🗓️" titulo="Sin movimiento" detalle="No hubo recepciones ni proceso en la fecha (según la política, el envío se omite)." />} />
                <div style={{ marginTop: sp.sm, fontSize: 11.5, color: C.muted }}>El preview usa el mismo motor read-only del envío; las cifras vienen del ledger.</div>
              </>
            )}
          </ProcCard>

          {/* Historial */}
          <ProcCard style={{ padding: sp.lg }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: C.text, marginBottom: sp.md }}>Historial de ejecuciones</div>
            <ProcFilters
              filtros={[
                { key: "estado", label: "Estado", valor: fEstado, onChange: setFEstado, opciones: [{ v: "", l: "Todos los estados" }, ...["pendiente", "procesando", "enviado", "error", "omitido"].map((s) => ({ v: s, l: s }))] },
                { key: "fecha", label: "Fecha", valor: fFecha, onChange: setFFecha, opciones: [{ v: "", l: "Toda fecha" }, ...Array.from(new Set((hist || []).map((h) => h.fecha_operacional))).map((f) => ({ v: f, l: formatFecha(f) }))] },
              ]}
              onReset={() => { setFEstado(""); setFFecha(""); }} />
            <ProcDataTable
              columnas={[
                { titulo: "Fecha operacional", render: (h) => formatFecha(h.fecha_operacional) },
                { titulo: "Config", render: (h) => normalizarNombre(h.config_nombre) || "—" },
                { titulo: "Planta", render: (h) => h.planta_nombre || "Todas" },
                { titulo: "Alcance", render: (h) => h.alcance === "cliente" ? `Cliente: ${normalizarNombre(h.alcance_cliente_nombre) || "—"}` : "General" },
                { titulo: "Kg recib.", align: "right", render: (h) => formatNum(h.total_kg_recibido, 1) },
                { titulo: "Kg proc.", align: "right", render: (h) => formatNum(h.total_kg_procesado, 1) },
                { titulo: "Destin.", align: "right", render: (h) => (h.destinatarios_snapshot || []).length },
                { titulo: "Estado", render: (h) => <ProcStatusBadge texto={h.estado} tono={h.estado === "enviado" ? "success" : h.estado === "error" ? "danger" : h.estado === "omitido" ? "neutral" : "warning"} /> },
                { titulo: "Intentos", align: "right", render: (h) => h.intentos },
                { titulo: "Ejecutado", render: (h) => formatFechaHora(h.generado_en) },
                ...(editable ? [{ titulo: "", align: "right", render: (h) => h.estado === "error" ? <ProcButton kind="ghost" small onClick={() => reintentar(h)}>Reintentar</ProcButton> : null }] : []),
              ]}
              filas={histFiltrado} rowKey="id"
              vacio={<ProcEmptyState icono="🗂️" titulo="Sin ejecuciones" detalle="Usá Enviar ahora o esperá al scheduler (server-side)." />} />
            {histFiltrado.some((h) => h.error) && (
              <div style={{ marginTop: sp.sm, fontSize: 12, color: C.danger }}>
                Errores: {histFiltrado.filter((h) => h.error).map((h) => `${formatFecha(h.fecha_operacional)}: ${h.error}`).slice(0, 3).join(" · ")}
              </div>
            )}
          </ProcCard>
        </>
      )}

      {modalDest && <ModalDestinatario empresa={empresa} configId={sel.id} onClose={() => setModalDest(false)}
        onSaved={() => { setModalDest(false); cargarReporteDestinatarios(empresa, sel.id).then(setDests); }} notificar={notificar} />}
    </div>
  );
}

function ModalDestinatario({ empresa, configId, onClose, onSaved, notificar }) {
  const [f, setF] = useState({ nombre: "", email: "", tipo: "interno" });
  const [saving, setSaving] = useState(false);
  const guardar = async () => {
    if (!f.email.trim() || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email.trim())) return notificar("Email inválido", "error");
    setSaving(true);
    try {
      await crearReporteDestinatario({ empresa_id: empresa, config_id: configId, nombre: normalizarNombre(f.nombre) || null, email: f.email.trim(), tipo: f.tipo, activo: true });
      notificar("Destinatario agregado"); onSaved();
    } catch (e) { notificar(traducirError(e), "error"); setSaving(false); }
  };
  return (
    <ProcModal titulo="Agregar destinatario" onClose={onClose}
      acciones={<><ProcButton kind="ghost" onClick={onClose}>Cancelar</ProcButton><ProcButton onClick={guardar} disabled={saving}>{saving ? "Guardando…" : "Agregar"}</ProcButton></>}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: sp.md }}>
        <ProcField label="Nombre"><input style={inputStyle} value={f.nombre} onChange={(e) => setF((x) => ({ ...x, nombre: e.target.value }))} /></ProcField>
        <ProcField label="Tipo"><select style={inputStyle} value={f.tipo} onChange={(e) => setF((x) => ({ ...x, tipo: e.target.value }))}><option value="interno">Interno</option><option value="externo">Externo</option></select></ProcField>
        <div style={{ gridColumn: "1 / -1" }}><ProcField label="Email" requerido><input style={inputStyle} value={f.email} onChange={(e) => setF((x) => ({ ...x, email: e.target.value }))} placeholder="correo@empresa.cl" /></ProcField></div>
      </div>
    </ProcModal>
  );
}
