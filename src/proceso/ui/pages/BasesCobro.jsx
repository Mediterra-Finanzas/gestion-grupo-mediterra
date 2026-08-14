/* eslint-disable */
// src/proceso/ui/pages/BasesCobro.jsx — bandeja de Bases de Cobro (motor F6).
// Base = agrupación de servicios valorizados por cliente/moneda. AÚN NO es factura.
// Una base aprobada es inmutable (backend). Multimoneda: una base = una moneda.
import React, { useEffect, useState, useCallback } from "react";
import { useService } from "../hooks/useServiceContext";
import { cargarBasesCobro, crearBaseCobro, cargarVinculosPorRol, siguienteCorrelativo } from "../../core/procesoF7DB";
import { traducirError, badgeDe } from "../../core/procesoF7Domain";
import {
  ProcPageHeader, ProcButton, ProcCard, ProcDataTable, ProcStatusBadge, ProcModal, ProcField, inputStyle,
  ProcLoadingState, ProcErrorState, ProcEmptyState, ProcFilters,
} from "../components/base";
import { C, sp } from "../estilos";
import { formatMoneda, formatFecha, normalizarNombre } from "../format";

const MONEDAS = ["USD", "CLP", "EUR", "PEN"];
const ESTADOS = ["borrador", "en_revision", "aprobada", "enviada_a_facturacion", "cerrada", "anulada"];

export default function BasesCobro() {
  const { empresa, temporada, ir, puedeEditar, notificar, vista } = useService();
  const [rows, setRows] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [estado, setEstado] = useState("idle");
  const [error, setError] = useState(null);
  const [fEstado, setFEstado] = useState(vista?.params?.filtroEstado || "");
  const [fMoneda, setFMoneda] = useState("");
  const [fTexto, setFTexto] = useState("");
  const [nueva, setNueva] = useState(null);

  const editable = puedeEditar("bases") || puedeEditar("centro");

  const cargar = useCallback(async () => {
    if (!empresa) { setEstado("idle"); return; }
    setEstado("loading"); setError(null);
    try {
      let extra = "";
      if (fEstado) extra += `&estado=eq.${fEstado}`;
      if (fMoneda) extra += `&moneda=eq.${fMoneda}`;
      const [b, cli] = await Promise.all([cargarBasesCobro(empresa, extra), cargarVinculosPorRol(empresa, "cliente_servicio")]);
      setRows(b); setClientes(cli); setEstado("ok");
    } catch (e) { setError(traducirError(e)); setEstado("error"); }
  }, [empresa, fEstado, fMoneda]);
  useEffect(() => { cargar(); }, [cargar]);

  const filtradas = rows.filter((b) => !fTexto || [b.folio, b.cliente].join(" ").toLowerCase().includes(fTexto.toLowerCase()));

  const crear = async () => {
    if (!nueva.cliente_vinculo_id) return notificar("Elegí cliente", "error");
    try {
      const folio = await siguienteCorrelativo({ empresaId: empresa, temporada: temporada || "s-t", tipo: "BCO" });
      const id = await crearBaseCobro({
        empresaId: empresa, folio, clienteId: nueva.cliente_vinculo_id, temporada: temporada || null,
        desde: nueva.desde || null, hasta: nueva.hasta || null, moneda: nueva.moneda || "USD",
      });
      const baseId = Array.isArray(id) ? id[0] : (id?.proc_fn_crear_base_cobro || id);
      setNueva(null); notificar(`Base ${folio} creada`); ir("base_cobro_detalle", { id: baseId });
    } catch (e) { notificar(traducirError(e), "error"); }
  };

  const columnas = [
    { titulo: "Folio", render: (b) => <b>{b.folio}</b> },
    { titulo: "Cliente", render: (b) => normalizarNombre(b.cliente) },
    { titulo: "Período", render: (b) => (b.periodo_desde ? `${formatFecha(b.periodo_desde)} → ${b.periodo_hasta ? formatFecha(b.periodo_hasta) : "—"}` : "—") },
    { titulo: "Moneda", campo: "moneda" },
    { titulo: "Líneas", align: "right", campo: "lineas" },
    { titulo: "Total", align: "right", render: (b) => <b>{formatMoneda(b.total, b.moneda)}</b> },
    { titulo: "Estado", render: (b) => <ProcStatusBadge estado={b.estado} /> },
    { titulo: "", align: "right", render: (b) => <ProcButton kind="ghost" small onClick={() => ir("base_cobro_detalle", { id: b.id })}>Abrir</ProcButton> },
  ];

  if (!empresa) return <div><ProcPageHeader titulo="Bases de Cobro" /><ProcCard style={{ padding: sp.lg }}><ProcEmptyState icono="📑" titulo="Seleccioná un tenant" /></ProcCard></div>;

  return (
    <div>
      <ProcPageHeader titulo="Bases de Cobro" subtitulo="Agrupación de servicios a cobrar (no es factura)"
        acciones={editable ? <ProcButton onClick={() => setNueva({ moneda: "USD" })}>+ Nueva base</ProcButton> : null} />
      <ProcCard style={{ padding: sp.md, marginBottom: sp.md }}>
        <ProcFilters
          busqueda={fTexto} onBusqueda={setFTexto} placeholder="Buscar folio/cliente…"
          filtros={[
            { key: "estado", label: "Estado", valor: fEstado, onChange: setFEstado, opciones: [{ v: "", l: "Todos los estados" }, ...ESTADOS.map((s) => ({ v: s, l: badgeDe(s).label }))] },
            { key: "moneda", label: "Moneda", valor: fMoneda, onChange: setFMoneda, opciones: [{ v: "", l: "Toda moneda" }, ...MONEDAS.map((m) => ({ v: m, l: m }))] },
          ]}
          onReset={() => { setFTexto(""); setFEstado(""); setFMoneda(""); }} />
      </ProcCard>
      {estado === "loading" ? <ProcLoadingState /> :
       estado === "error" ? <ProcErrorState error={error} onRetry={cargar} /> :
       <ProcDataTable columnas={columnas} filas={filtradas} rowKey="id"
         vacio={<ProcEmptyState icono="📑" titulo="Sin bases de cobro" detalle="Creá una base para agrupar servicios valorizados de un cliente." />} />}

      {nueva && (
        <ProcModal titulo="Nueva base de cobro" onClose={() => setNueva(null)} ancho={560}
          acciones={<><ProcButton kind="ghost" onClick={() => setNueva(null)}>Cancelar</ProcButton><ProcButton onClick={crear}>Crear</ProcButton></>}>
          <div style={{ fontSize: 12.5, color: C.muted, marginBottom: sp.sm }}>El folio se asigna automáticamente. Una base agrupa servicios de <b>una sola moneda</b>.</div>
          <ProcField label="Cliente" requerido>
            <select style={inputStyle} value={nueva.cliente_vinculo_id || ""} onChange={(e) => setNueva((x) => ({ ...x, cliente_vinculo_id: e.target.value }))}>
              <option value="">Elegí cliente…</option>
              {clientes.map((c) => <option key={c.id} value={c.id}>{normalizarNombre(c.nombre_provisional)}</option>)}
            </select>
          </ProcField>
          <div style={{ display: "flex", gap: sp.sm }}>
            <div style={{ flex: 1 }}><ProcField label="Período desde"><input type="date" style={inputStyle} value={nueva.desde || ""} onChange={(e) => setNueva((x) => ({ ...x, desde: e.target.value }))} /></ProcField></div>
            <div style={{ flex: 1 }}><ProcField label="Período hasta"><input type="date" style={inputStyle} value={nueva.hasta || ""} onChange={(e) => setNueva((x) => ({ ...x, hasta: e.target.value }))} /></ProcField></div>
            <div style={{ width: 110 }}><ProcField label="Moneda"><select style={inputStyle} value={nueva.moneda} onChange={(e) => setNueva((x) => ({ ...x, moneda: e.target.value }))}>{MONEDAS.map((m) => <option key={m} value={m}>{m}</option>)}</select></ProcField></div>
          </div>
        </ProcModal>
      )}
    </div>
  );
}
