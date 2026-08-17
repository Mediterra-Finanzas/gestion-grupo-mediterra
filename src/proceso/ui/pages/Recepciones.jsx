/* eslint-disable */
// src/proceso/ui/pages/Recepciones.jsx — listado operacional de recepciones.
// Filtros server-side (PostgREST sobre proc_v_recepcion_listado): cliente, estado,
// situación contractual, conciliación de masa, QC. No carga toda la historia.
import React, { useEffect, useState, useCallback, useMemo } from "react";
import { useService } from "../hooks/useServiceContext";
import { cargarRecepcionListado, cargarVinculosPorRol } from "../../core/procesoF7DB";
import { traducirError, badgeDe, tonoNivelContractual } from "../../core/procesoF7Domain";
import {
  ProcPageHeader, ProcButton, ProcCard, ProcDataTable, ProcStatusBadge,
  ProcLoadingState, ProcErrorState, ProcEmptyState, ProcFilters,
} from "../components/base";
import { C, sp } from "../estilos";
import { formatKg, formatFecha, normalizarNombre } from "../format";

const NIVELES = [
  { v: "", l: "Toda situación" }, { v: "ok", l: "Contrato vigente" },
  { v: "bloqueante", l: "Sin contrato (bloqueante)" }, { v: "advertencia", l: "Sin contrato (advertencia)" },
  { v: "informativo", l: "Sin contrato (informativo)" },
];

export default function Recepciones() {
  const { empresa, planta, ir, puedeEditar, vista } = useService();
  const [rows, setRows] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [estado, setEstado] = useState("idle");
  const [error, setError] = useState(null);
  const [f, setF] = useState({ estado: "", qc: vista?.params?.filtroQc || "", cliente: "", nivel: "", masa: "" });
  const [fTexto, setFTexto] = useState("");
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));

  useEffect(() => { if (empresa) cargarVinculosPorRol(empresa, "cliente_servicio").then(setClientes).catch(() => {}); }, [empresa]);

  const cargar = useCallback(async () => {
    if (!empresa) { setEstado("idle"); return; }
    setEstado("loading"); setError(null);
    try {
      let extra = "&limit=200";
      if (planta) extra += `&planta_id=eq.${planta}`;
      if (f.estado) extra += `&estado=eq.${f.estado}`;
      if (f.qc) extra += `&qc_resultado=eq.${f.qc}`;
      if (f.cliente) extra += `&cliente_servicio_vinculo_id=eq.${f.cliente}`;
      if (f.nivel) extra += `&nivel_contractual=eq.${f.nivel}`;
      if (f.masa) extra += `&masa_dentro_tolerancia=eq.${f.masa}`;
      setRows(await cargarRecepcionListado(empresa, extra));
      setEstado("ok");
    } catch (e) { setError(traducirError(e)); setEstado("error"); }
  }, [empresa, planta, f]);
  useEffect(() => { cargar(); }, [cargar]);

  const filtradas = useMemo(() => {
    const t = fTexto.trim().toLowerCase();
    if (!t) return rows;
    return rows.filter((r) => [r.folio, r.cliente, r.productor, r.especie_codigo].join(" ").toLowerCase().includes(t));
  }, [rows, fTexto]);

  const columnas = [
    { titulo: "Folio", render: (r) => <b>{r.folio}</b> },
    { titulo: "Fecha", render: (r) => formatFecha(r.fecha) },
    { titulo: "Cliente", render: (r) => normalizarNombre(r.cliente) || "—" },
    { titulo: "Especie", campo: "especie_codigo" },
    { titulo: "Kg neto", align: "right", render: (r) => formatKg(r.kg_neto) },
    { titulo: "Lotes", align: "right", campo: "lotes" },
    { titulo: "QC lotes", render: (r) => <QcResumen r={r} /> },
    { titulo: "Masa", render: (r) => r.masa_dentro_tolerancia == null ? "—" : r.masa_dentro_tolerancia ? <ProcStatusBadge texto="Cuadra" tono="success" /> : <ProcStatusBadge texto="Descuadre" tono="danger" /> },
    { titulo: "Contrato", render: (r) => (r.nivel_contractual && r.nivel_contractual !== "ok" && r.nivel_contractual !== "info") ? <ProcStatusBadge texto={r.nivel_contractual} tono={tonoNivelContractual(r.nivel_contractual)} /> : <span style={{ color: C.muted2, fontSize: 12 }}>—</span> },
    { titulo: "Estado", render: (r) => <ProcStatusBadge estado={r.estado} /> },
    { titulo: "", align: "right", render: (r) => <ProcButton kind="ghost" small onClick={() => ir("recepcion_detalle", { id: r.id })}>Ver</ProcButton> },
  ];

  if (!empresa) return <div><ProcPageHeader titulo="Recepciones" /><ProcCard style={{ padding: sp.lg }}><ProcEmptyState icono="🚛" titulo="Seleccioná un tenant" detalle="Elegí empresa (tenant) en la barra superior." /></ProcCard></div>;

  return (
    <div>
      <ProcPageHeader titulo="Recepciones" subtitulo="Llegada de fruta a planta"
        acciones={puedeEditar("recepciones") || puedeEditar("centro") ? <ProcButton onClick={() => ir("recepcion_nueva")}>+ Nueva recepción</ProcButton> : null} />
      <ProcCard style={{ padding: sp.md, marginBottom: sp.md }}>
        <ProcFilters
          busqueda={fTexto} onBusqueda={setFTexto} placeholder="Buscar folio/cliente/productor…"
          filtros={[
            { key: "cliente", label: "Cliente", valor: f.cliente, onChange: (v) => set("cliente", v), opciones: [{ v: "", l: "Todos los clientes" }, ...clientes.map((c) => ({ v: c.id, l: normalizarNombre(c.nombre_provisional) }))] },
            { key: "estado", label: "Estado", valor: f.estado, onChange: (v) => set("estado", v), opciones: [{ v: "", l: "Todos los estados" }, ...["borrador", "recibida", "en_proceso", "procesada", "despachada", "anulada"].map((s) => ({ v: s, l: badgeDe(s).label }))] },
            { key: "nivel", label: "Situación contractual", valor: f.nivel, onChange: (v) => set("nivel", v), opciones: NIVELES },
            { key: "masa", label: "Conciliación masa", valor: f.masa, onChange: (v) => set("masa", v), opciones: [{ v: "", l: "Toda conciliación" }, { v: "true", l: "Cuadra" }, { v: "false", l: "Descuadre" }] },
            { key: "qc", label: "QC", valor: f.qc, onChange: (v) => set("qc", v), opciones: [{ v: "", l: "Todo QC" }, ...["aprobado", "condicional", "rechazado"].map((s) => ({ v: s, l: badgeDe(s).label }))] },
          ]}
          onReset={() => { setFTexto(""); setF({ estado: "", qc: "", cliente: "", nivel: "", masa: "" }); }} />
      </ProcCard>
      {estado === "loading" ? <ProcLoadingState /> :
       estado === "error" ? <ProcErrorState error={error} onRetry={cargar} /> :
       <ProcDataTable columnas={columnas} filas={filtradas} rowKey="id"
         vacio={<ProcEmptyState icono="🚛" titulo="Sin recepciones" detalle="Registrá la primera recepción de fruta con “+ Nueva recepción”." />} />}
    </div>
  );
}

// Resumen QC por lote de la recepción (conteos = hechos; sin veredicto global inventado).
function QcResumen({ r }) {
  const a = r.qc_aprobados || 0, x = r.qc_rechazados || 0, c = r.qc_condicional || 0, con = r.qc_con_qc || 0;
  if (con === 0) return <span style={{ color: C.muted2, fontSize: 12 }}>sin QC</span>;
  return (
    <span style={{ display: "inline-flex", gap: 8, alignItems: "center", fontSize: 12.5, fontWeight: 700 }}>
      {a > 0 && <span style={{ color: C.success }}>✓{a}</span>}
      {c > 0 && <span style={{ color: C.warning }}>~{c}</span>}
      {x > 0 && <span style={{ color: C.danger }}>✕{x}</span>}
      {r.qc_mixto && <ProcStatusBadge texto="mixto" tono="warning" />}
    </span>
  );
}
