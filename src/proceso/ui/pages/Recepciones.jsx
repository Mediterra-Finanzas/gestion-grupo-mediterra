/* eslint-disable */
// src/proceso/ui/pages/Recepciones.jsx — listado operacional de recepciones.
// Filtros server-side (PostgREST sobre proc_v_recepcion_listado). No carga
// toda la historia al navegador.
import React, { useEffect, useState, useCallback } from "react";
import { useService } from "../hooks/useServiceContext";
import { cargarRecepcionListado } from "../../core/procesoF7DB";
import { traducirError, badgeDe } from "../../core/procesoF7Domain";
import {
  ProcPageHeader, ProcButton, ProcCard, ProcDataTable, ProcStatusBadge,
  ProcLoadingState, ProcErrorState, ProcEmptyState, ProcFilters,
} from "../components/base";
import { C, sp } from "../estilos";
import { formatKg, formatFecha, normalizarNombre } from "../format";

export default function Recepciones() {
  const { empresa, planta, ir, puedeEditar, vista } = useService();
  const [rows, setRows] = useState([]);
  const [estado, setEstado] = useState("idle");
  const [error, setError] = useState(null);
  const [fEstado, setFEstado] = useState("");
  const [fQc, setFQc] = useState(vista?.params?.filtroQc || "");
  const [fTexto, setFTexto] = useState("");

  const cargar = useCallback(async () => {
    if (!empresa) { setEstado("idle"); return; }
    setEstado("loading"); setError(null);
    try {
      let extra = "&limit=200";
      if (planta) extra += `&planta_id=eq.${planta}`;
      if (fEstado) extra += `&estado=eq.${fEstado}`;
      if (fQc) extra += `&qc_resultado=eq.${fQc}`;
      setRows(await cargarRecepcionListado(empresa, extra));
      setEstado("ok");
    } catch (e) { setError(traducirError(e)); setEstado("error"); }
  }, [empresa, planta, fEstado, fQc]);
  useEffect(() => { cargar(); }, [cargar]);

  const filtradas = rows.filter((r) => !fTexto ||
    [r.folio, r.cliente, r.productor, r.especie_codigo].join(" ").toLowerCase().includes(fTexto.toLowerCase()));

  const columnas = [
    { titulo: "Folio", campo: "folio", render: (r) => <b>{r.folio}</b> },
    { titulo: "Fecha", render: (r) => formatFecha(r.fecha) },
    { titulo: "Cliente", render: (r) => normalizarNombre(r.cliente) },
    { titulo: "Productor", render: (r) => normalizarNombre(r.productor) },
    { titulo: "Especie", campo: "especie_codigo" },
    { titulo: "Kg neto", align: "right", render: (r) => formatKg(r.kg_neto) },
    { titulo: "QC", render: (r) => (r.qc_resultado ? <ProcStatusBadge estado={r.qc_resultado} /> : <span style={{ color: C.muted2, fontSize: 12 }}>sin QC</span>) },
    { titulo: "Estado", render: (r) => <ProcStatusBadge estado={r.estado} /> },
    { titulo: "Lotes", align: "right", campo: "lotes" },
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
            { key: "estado", label: "Estado", valor: fEstado, onChange: setFEstado, opciones: [{ v: "", l: "Todos los estados" }, ...["borrador", "recibida", "en_proceso", "procesada", "despachada", "anulada"].map((s) => ({ v: s, l: badgeDe(s).label }))] },
            { key: "qc", label: "QC", valor: fQc, onChange: setFQc, opciones: [{ v: "", l: "Todo QC" }, ...["aprobado", "condicional", "rechazado"].map((s) => ({ v: s, l: badgeDe(s).label }))] },
          ]}
          onReset={() => { setFTexto(""); setFEstado(""); setFQc(""); }} />
      </ProcCard>
      {estado === "loading" ? <ProcLoadingState /> :
       estado === "error" ? <ProcErrorState error={error} onRetry={cargar} /> :
       <ProcDataTable columnas={columnas} filas={filtradas} rowKey="id"
         vacio={<ProcEmptyState icono="🚛" titulo="Sin recepciones" detalle="Registrá la primera recepción de fruta con “+ Nueva recepción”." />} />}
    </div>
  );
}
