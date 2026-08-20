/* eslint-disable */
// src/proceso/ui/pages/Tarifario.jsx — Tarifario del servicio (motor F6).
// Muestra tarifa general vs específica, vigente/futura/vencida, y explica POR QUÉ
// una tarifa gana (especificidad + prioridad). La resolución determinística vive
// en el backend (proc_fn_resolver_tarifa); "Resolver tarifa" solo la previsualiza.
import React, { useEffect, useState, useCallback } from "react";
import { useService } from "../hooks/useServiceContext";
import {
  cargarTarifas, crearTarifa, cambiarEstadoTarifa, cargarTipoServicio,
  resolverTarifaDetalle, cargarVinculosPorRol,
} from "../../core/procesoF7DB";
import { traducirError, badgeDe, especificidadTarifa } from "../../core/procesoF7Domain";
import {
  ProcPageHeader, ProcButton, ProcCard, ProcDataTable, ProcStatusBadge, ProcModal, ProcField, inputStyle,
  ProcLoadingState, ProcErrorState, ProcEmptyState, ProcFilters,
} from "../components/base";
import { C, sp } from "../estilos";
import { formatTarifa, formatFecha, normalizarNombre } from "../format";

const UNIDADES = ["kg_procesado", "caja", "pallet", "evento", "dia", "pallet_dia", "kg_dia", "camara_dia", "hora", "unidad", "monto_fijo"];
const MONEDAS = ["USD", "CLP", "EUR", "PEN"];
const TONO_VIG = { vigente: "success", futura: "info", vencida: "neutral", cerrada: "neutral", anulada: "danger" };

export default function Tarifario() {
  const { empresa, fecha, ir, puedeEditar, notificar } = useService();
  const [rows, setRows] = useState([]);
  const [tipos, setTipos] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [estado, setEstado] = useState("idle");
  const [error, setError] = useState(null);
  const [fServicio, setFServicio] = useState("");
  const [fMoneda, setFMoneda] = useState("");
  const [fVig, setFVig] = useState("");
  const [fTexto, setFTexto] = useState("");
  const [nueva, setNueva] = useState(null);
  const [preview, setPreview] = useState(null); // {form, res, buscando}

  const editable = puedeEditar("tarifario") || puedeEditar("config") || puedeEditar("centro");

  const cargar = useCallback(async () => {
    if (!empresa) { setEstado("idle"); return; }
    setEstado("loading"); setError(null);
    try {
      let extra = "";
      if (fServicio) extra += `&tipo_servicio_id=eq.${fServicio}`;
      if (fMoneda) extra += `&moneda=eq.${fMoneda}`;
      if (fVig) extra += `&vigencia_estado=eq.${fVig}`;
      const [t, ts, cli] = await Promise.all([
        cargarTarifas(empresa, extra), cargarTipoServicio(empresa), cargarVinculosPorRol(empresa, "cliente_servicio"),
      ]);
      setRows(t); setTipos(ts); setClientes(cli); setEstado("ok");
    } catch (e) { setError(traducirError(e)); setEstado("error"); }
  }, [empresa, fServicio, fMoneda, fVig]);
  useEffect(() => { cargar(); }, [cargar]);

  const filtradas = rows.filter((t) => !fTexto ||
    [t.servicio_nombre, t.cliente, t.especie_codigo, t.temporada_codigo].join(" ").toLowerCase().includes(fTexto.toLowerCase()));

  const crear = async () => {
    if (!nueva.tipo_servicio_id) return notificar("Falta el tipo de servicio", "error");
    if (!nueva.unidad) return notificar("Falta la unidad de cobro", "error");
    if (nueva.tarifa === "" || Number(nueva.tarifa) < 0) return notificar("Tarifa inválida", "error");
    if (!nueva.vigencia_desde) return notificar("Falta vigencia desde", "error");
    try {
      await crearTarifa({
        empresa_id: empresa, tipo_servicio_id: nueva.tipo_servicio_id,
        cliente_vinculo_id: nueva.cliente_vinculo_id || null,
        temporada_codigo: nueva.temporada_codigo || null, especie_codigo: nueva.especie_codigo || null,
        unidad: nueva.unidad, tarifa: Number(nueva.tarifa), moneda: nueva.moneda || "USD",
        vigencia_desde: nueva.vigencia_desde, vigencia_hasta: nueva.vigencia_hasta || null,
        prioridad: Number(nueva.prioridad) || 0, observaciones: nueva.observaciones || null,
      });
      setNueva(null); notificar("Tarifa creada"); cargar();
    } catch (e) { notificar(traducirError(e), "error"); }
  };

  const cambiarEstado = async (t, nuevoEstado) => {
    if (!window.confirm(`¿${nuevoEstado === "anulada" ? "Anular" : "Cerrar"} la tarifa de ${t.servicio_nombre}? No se aplicará a nuevos servicios.`)) return;
    try { await cambiarEstadoTarifa(t.id, empresa, nuevoEstado); notificar("Tarifa actualizada"); cargar(); }
    catch (e) { notificar(traducirError(e), "error"); }
  };

  const resolver = async () => {
    if (!preview.form.tipo_servicio_id) return notificar("Elegí el servicio a resolver", "error");
    setPreview((p) => ({ ...p, buscando: true, res: null }));
    try {
      const r = await resolverTarifaDetalle({
        empresaId: empresa, tipoServicioId: preview.form.tipo_servicio_id, clienteId: preview.form.cliente_vinculo_id || null,
        temporada: preview.form.temporada_codigo || null, especie: preview.form.especie_codigo || null, fecha: preview.form.fecha || fecha,
      });
      setPreview((p) => ({ ...p, buscando: false, res: (Array.isArray(r) ? r[0] : r) || "vacio" }));
    } catch (e) { setPreview((p) => ({ ...p, buscando: false })); notificar(traducirError(e), "error"); }
  };

  const columnas = [
    { titulo: "Servicio", render: (t) => <b>{t.servicio_nombre}</b> },
    { titulo: "Aplica a", render: (t) => t.es_general
        ? <span style={{ color: C.muted }}>General</span>
        : <span title="Especificidad">{normalizarNombre(t.cliente) || "—"}{(t.especie_codigo || t.temporada_codigo) ? <span style={{ color: C.muted2, fontSize: 11.5 }}> · {[t.especie_codigo, t.temporada_codigo].filter(Boolean).join(" · ")}</span> : null}</span> },
    { titulo: "Unidad", campo: "unidad" },
    { titulo: "Tarifa", align: "right", render: (t) => <b>{formatTarifa(t.tarifa, t.moneda)}</b> },
    { titulo: "Vigencia", render: (t) => <span style={{ fontSize: 12 }}>{formatFecha(t.vigencia_desde)} → {t.vigencia_hasta ? formatFecha(t.vigencia_hasta) : "∞"}</span> },
    { titulo: "Prioridad", align: "right", campo: "prioridad" },
    { titulo: "Especificidad", render: (t) => <ProcStatusBadge texto={especificidadTarifa({ cliente_vinculo_id: t.cliente_vinculo_id, temporada_codigo: t.temporada_codigo, especie_codigo: t.especie_codigo })} tono={t.especificidad >= 2 ? "primary" : t.especificidad === 1 ? "info" : "neutral"} /> },
    { titulo: "Estado", render: (t) => <ProcStatusBadge texto={badgeDe(t.vigencia_estado).label} tono={TONO_VIG[t.vigencia_estado] || "neutral"} /> },
    { titulo: "", align: "right", render: (t) => (editable && t.estado === "vigente"
        ? <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
            <ProcButton kind="ghost" small onClick={() => cambiarEstado(t, "cerrada")}>Cerrar</ProcButton>
            <ProcButton kind="ghost" small onClick={() => cambiarEstado(t, "anulada")}>Anular</ProcButton>
          </div> : null) },
  ];

  if (!empresa) return <div><ProcPageHeader titulo="Tarifario" /><ProcCard style={{ padding: sp.lg }}><ProcEmptyState icono="💲" titulo="Seleccioná un tenant" detalle="Elegí empresa (tenant) en la barra superior." /></ProcCard></div>;

  const nombreServicio = (id) => tipos.find((t) => t.id === id)?.nombre || "—";

  return (
    <div>
      <ProcPageHeader titulo="Tarifario" subtitulo="Reglas de cobro por servicio (vigencia + especificidad)"
        acciones={<div style={{ display: "flex", gap: sp.sm }}>
          <ProcButton kind="ghost" onClick={() => setPreview({ form: { fecha }, res: null, buscando: false })}>Resolver tarifa</ProcButton>
          {editable && <ProcButton onClick={() => setNueva({ moneda: "USD", unidad: "kg_procesado", prioridad: 0, vigencia_desde: fecha })}>+ Nueva tarifa</ProcButton>}
        </div>} />
      <ProcCard style={{ padding: sp.md, marginBottom: sp.md }}>
        <ProcFilters
          busqueda={fTexto} onBusqueda={setFTexto} placeholder="Buscar servicio/cliente/especie…"
          filtros={[
            { key: "servicio", label: "Servicio", valor: fServicio, onChange: setFServicio, opciones: [{ v: "", l: "Todos los servicios" }, ...tipos.map((t) => ({ v: t.id, l: t.nombre }))] },
            { key: "vig", label: "Vigencia", valor: fVig, onChange: setFVig, opciones: [{ v: "", l: "Toda vigencia" }, ...["vigente", "futura", "vencida", "cerrada", "anulada"].map((s) => ({ v: s, l: badgeDe(s).label }))] },
            { key: "moneda", label: "Moneda", valor: fMoneda, onChange: setFMoneda, opciones: [{ v: "", l: "Toda moneda" }, ...MONEDAS.map((m) => ({ v: m, l: m }))] },
          ]}
          onReset={() => { setFTexto(""); setFServicio(""); setFVig(""); setFMoneda(""); }} />
      </ProcCard>
      {estado === "loading" ? <ProcLoadingState /> :
       estado === "error" ? <ProcErrorState error={error} onRetry={cargar} /> :
       <ProcDataTable columnas={columnas} filas={filtradas} rowKey="id"
         vacio={<ProcEmptyState icono="💲" titulo="Sin tarifas" detalle={tipos.length ? "Creá una tarifa con “+ Nueva tarifa”." : "Primero definí un Tipo de Servicio en Configuración."} />} />}

      {nueva && (
        <ProcModal titulo="Nueva tarifa" onClose={() => setNueva(null)} ancho={620}
          acciones={<><ProcButton kind="ghost" onClick={() => setNueva(null)}>Cancelar</ProcButton><ProcButton onClick={crear}>Crear tarifa</ProcButton></>}>
          <ProcField label="Servicio" requerido>
            <select style={inputStyle} value={nueva.tipo_servicio_id || ""} onChange={(e) => setNueva((x) => ({ ...x, tipo_servicio_id: e.target.value }))}>
              <option value="">Elegí un servicio…</option>
              {tipos.map((t) => <option key={t.id} value={t.id}>{t.nombre} ({t.codigo})</option>)}
            </select>
          </ProcField>
          <ProcField label="Cliente" hint="Vacío = tarifa general (aplica a todos)">
            <select style={inputStyle} value={nueva.cliente_vinculo_id || ""} onChange={(e) => setNueva((x) => ({ ...x, cliente_vinculo_id: e.target.value }))}>
              <option value="">General (sin cliente)</option>
              {clientes.map((c) => <option key={c.id} value={c.id}>{normalizarNombre(c.nombre_provisional)}</option>)}
            </select>
          </ProcField>
          <div style={{ display: "flex", gap: sp.sm }}>
            <div style={{ flex: 1 }}><ProcField label="Especie" hint="Vacío = cualquiera"><input style={inputStyle} value={nueva.especie_codigo || ""} onChange={(e) => setNueva((x) => ({ ...x, especie_codigo: e.target.value.toUpperCase() }))} placeholder="CHE, PLU…" /></ProcField></div>
            <div style={{ flex: 1 }}><ProcField label="Temporada" hint="Vacío = cualquiera"><input style={inputStyle} value={nueva.temporada_codigo || ""} onChange={(e) => setNueva((x) => ({ ...x, temporada_codigo: e.target.value }))} placeholder="2026/2027" /></ProcField></div>
          </div>
          <div style={{ display: "flex", gap: sp.sm }}>
            <div style={{ flex: 1 }}><ProcField label="Unidad" requerido>
              <select style={inputStyle} value={nueva.unidad} onChange={(e) => setNueva((x) => ({ ...x, unidad: e.target.value }))}>{UNIDADES.map((u) => <option key={u} value={u}>{u}</option>)}</select>
            </ProcField></div>
            <div style={{ flex: 1 }}><ProcField label="Tarifa" requerido><input type="number" step="0.0001" style={inputStyle} value={nueva.tarifa ?? ""} onChange={(e) => setNueva((x) => ({ ...x, tarifa: e.target.value }))} placeholder="0,30" /></ProcField></div>
            <div style={{ width: 110 }}><ProcField label="Moneda"><select style={inputStyle} value={nueva.moneda} onChange={(e) => setNueva((x) => ({ ...x, moneda: e.target.value }))}>{MONEDAS.map((m) => <option key={m} value={m}>{m}</option>)}</select></ProcField></div>
          </div>
          <div style={{ display: "flex", gap: sp.sm }}>
            <div style={{ flex: 1 }}><ProcField label="Vigencia desde" requerido><input type="date" style={inputStyle} value={nueva.vigencia_desde || ""} onChange={(e) => setNueva((x) => ({ ...x, vigencia_desde: e.target.value }))} /></ProcField></div>
            <div style={{ flex: 1 }}><ProcField label="Vigencia hasta" hint="Vacío = sin término"><input type="date" style={inputStyle} value={nueva.vigencia_hasta || ""} onChange={(e) => setNueva((x) => ({ ...x, vigencia_hasta: e.target.value }))} /></ProcField></div>
            <div style={{ width: 110 }}><ProcField label="Prioridad"><input type="number" style={inputStyle} value={nueva.prioridad} onChange={(e) => setNueva((x) => ({ ...x, prioridad: e.target.value }))} /></ProcField></div>
          </div>
        </ProcModal>
      )}

      {preview && (
        <ProcModal titulo="Resolver tarifa (preview)" onClose={() => setPreview(null)} ancho={560}
          acciones={<><ProcButton kind="ghost" onClick={() => setPreview(null)}>Cerrar</ProcButton><ProcButton onClick={resolver}>Resolver</ProcButton></>}>
          <div style={{ fontSize: 12.5, color: C.muted, marginBottom: sp.sm }}>Muestra qué tarifa ganaría para esta combinación (la regla la resuelve el backend, no la UI).</div>
          <ProcField label="Servicio" requerido>
            <select style={inputStyle} value={preview.form.tipo_servicio_id || ""} onChange={(e) => setPreview((p) => ({ ...p, form: { ...p.form, tipo_servicio_id: e.target.value } }))}>
              <option value="">Elegí un servicio…</option>
              {tipos.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
            </select>
          </ProcField>
          <ProcField label="Cliente">
            <select style={inputStyle} value={preview.form.cliente_vinculo_id || ""} onChange={(e) => setPreview((p) => ({ ...p, form: { ...p.form, cliente_vinculo_id: e.target.value } }))}>
              <option value="">Cualquiera (general)</option>
              {clientes.map((c) => <option key={c.id} value={c.id}>{normalizarNombre(c.nombre_provisional)}</option>)}
            </select>
          </ProcField>
          <div style={{ display: "flex", gap: sp.sm }}>
            <div style={{ flex: 1 }}><ProcField label="Especie"><input style={inputStyle} value={preview.form.especie_codigo || ""} onChange={(e) => setPreview((p) => ({ ...p, form: { ...p.form, especie_codigo: e.target.value.toUpperCase() } }))} placeholder="CHE…" /></ProcField></div>
            <div style={{ flex: 1 }}><ProcField label="Temporada"><input style={inputStyle} value={preview.form.temporada_codigo || ""} onChange={(e) => setPreview((p) => ({ ...p, form: { ...p.form, temporada_codigo: e.target.value } }))} placeholder="2026/2027" /></ProcField></div>
            <div style={{ flex: 1 }}><ProcField label="Fecha"><input type="date" style={inputStyle} value={preview.form.fecha || ""} onChange={(e) => setPreview((p) => ({ ...p, form: { ...p.form, fecha: e.target.value } }))} /></ProcField></div>
          </div>
          {preview.buscando && <div style={{ fontSize: 13, color: C.muted }}>Resolviendo…</div>}
          {preview.res === "vacio" && <div style={{ padding: sp.md, borderRadius: 8, background: C.warningBg, color: C.warning, fontSize: 13, fontWeight: 600 }}>No hay tarifa vigente para esa combinación. Un hecho con estos datos quedaría <b>pendiente de tarifa</b> (no $0).</div>}
          {preview.res && preview.res !== "vacio" && (
            <div style={{ padding: sp.md, borderRadius: 8, background: C.successBg, border: `1px solid ${C.success}33` }}>
              <div style={{ fontWeight: 800, fontSize: 16, color: C.text }}>{formatTarifa(preview.res.tarifa, preview.res.moneda)} <span style={{ fontSize: 12.5, color: C.muted, fontWeight: 600 }}>/ {preview.res.unidad}</span></div>
              <div style={{ fontSize: 12.5, color: C.muted, marginTop: 4 }}>
                {preview.res.es_general ? "Tarifa general" : "Tarifa específica"} · especificidad {preview.res.especificidad} · prioridad {preview.res.prioridad} · vigente desde {formatFecha(preview.res.vigencia_desde)}
              </div>
            </div>
          )}
        </ProcModal>
      )}
    </div>
  );
}
