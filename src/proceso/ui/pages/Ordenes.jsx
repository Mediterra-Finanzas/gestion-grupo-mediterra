/* eslint-disable */
// src/proceso/ui/pages/Ordenes.jsx — listado de órdenes de proceso con conciliación.
import React, { useEffect, useState, useCallback } from "react";
import { useService } from "../hooks/useServiceContext";
import { cargarOrdenListado, crearOrden, siguienteCorrelativo } from "../../core/procesoF7DB";
import { traducirError, badgeDe, estadoConciliacion } from "../../core/procesoF7Domain";
import {
  ProcPageHeader, ProcButton, ProcCard, ProcDataTable, ProcStatusBadge, ProcModal, ProcField, inputStyle,
  ProcLoadingState, ProcErrorState, ProcEmptyState, ProcFilters,
} from "../components/base";
import { C, sp } from "../estilos";
import { formatNum, formatFecha, normalizarNombre } from "../format";

const kg = (n) => (n == null ? "—" : formatNum(n));

export default function Ordenes() {
  const { empresa, planta, temporada, ir, puedeEditar, notificar, vista } = useService();
  const [rows, setRows] = useState([]);
  const [estado, setEstado] = useState("idle");
  const [error, setError] = useState(null);
  const [fEstado, setFEstado] = useState(vista?.params?.filtroEstado || "");
  const [nueva, setNueva] = useState(null);
  // P2 nav contextual: "Órdenes" y "Conciliaciones" comparten page="ordenes"; al navegar entre ellas
  // el componente no re-monta, por eso sincronizamos el filtro de estado con el param de la vista.
  useEffect(() => { setFEstado(vista?.params?.filtroEstado || ""); }, [vista?.params?.filtroEstado]);

  const cargar = useCallback(async () => {
    if (!empresa) { setEstado("idle"); return; }
    setEstado("loading"); setError(null);
    try {
      let extra = "&limit=300";
      if (planta) extra += `&planta_id=eq.${planta}`;
      if (fEstado) extra += `&estado=eq.${fEstado}`;
      setRows(await cargarOrdenListado(empresa, extra)); setEstado("ok");
    } catch (e) { setError(traducirError(e)); setEstado("error"); }
  }, [empresa, planta, fEstado]);
  useEffect(() => { cargar(); }, [cargar]);

  const crear = async () => {
    if (!nueva.especie_codigo) return notificar("Falta especie", "error");
    try {
      const folio = await siguienteCorrelativo({ empresaId: empresa, temporada: temporada || "s-t", tipo: "ORD" });
      const o = await crearOrden({
        empresa_id: empresa, folio, planta_id: planta || null, estado: "en_proceso",
        especie_codigo: nueva.especie_codigo, variedad_codigo: nueva.variedad_codigo || null, turno: nueva.turno || null,
      });
      setNueva(null); notificar(`Orden ${folio} creada`); ir("orden", { id: o.id });
    } catch (e) { notificar(traducirError(e), "error"); }
  };

  const columnas = [
    { titulo: "Folio", render: (o) => <b>{o.folio}</b> },
    { titulo: "Fecha", render: (o) => formatFecha(o.fecha) },
    { titulo: "Cliente", render: (o) => normalizarNombre(o.cliente) },
    { titulo: "Especie", campo: "especie_codigo" },
    { titulo: "Entrada", align: "right", render: (o) => kg(o.kg_entrada) },
    { titulo: "Conciliación", render: (o) => (o.estado === "borrador" ? "—" :
        <ProcStatusBadge texto={estadoConciliacion(o.diff, o.tolerancia) === "cuadra" ? "cuadra" : `dif ${kg(o.diff)}`}
          tono={estadoConciliacion(o.diff, o.tolerancia) === "cuadra" ? "success" : "warning"} />) },
    { titulo: "Estado", render: (o) => <ProcStatusBadge estado={o.estado} /> },
    { titulo: "", align: "right", render: (o) => <ProcButton kind="ghost" small onClick={() => ir("orden", { id: o.id })}>Abrir</ProcButton> },
  ];

  if (!empresa) return <div><ProcPageHeader titulo="Órdenes de Proceso" /><ProcCard style={{ padding: sp.lg }}><ProcEmptyState icono="🏭" titulo="Seleccioná un tenant" /></ProcCard></div>;

  return (
    <div>
      <ProcPageHeader titulo="Órdenes de Proceso" subtitulo="Ejecución de proceso por corrida"
        acciones={puedeEditar("ordenes") || puedeEditar("centro") ? <ProcButton onClick={() => setNueva({ especie_codigo: "", variedad_codigo: "", turno: "" })}>+ Nueva orden</ProcButton> : null} />
      <ProcCard style={{ padding: sp.md, marginBottom: sp.md }}>
        <ProcFilters
          filtros={[{ key: "estado", label: "Estado", valor: fEstado, onChange: setFEstado, opciones: [{ v: "", l: "Todos los estados" }, ...["borrador", "en_proceso", "pendiente_conciliacion", "conciliado", "cerrado", "anulado"].map((s) => ({ v: s, l: badgeDe(s).label }))] }]}
          onReset={() => setFEstado("")} />
      </ProcCard>
      {estado === "loading" ? <ProcLoadingState /> :
       estado === "error" ? <ProcErrorState error={error} onRetry={cargar} /> :
       <ProcDataTable columnas={columnas} filas={rows} rowKey="id"
         vacio={<ProcEmptyState icono="🏭" titulo="Sin órdenes" detalle="Creá una orden para ejecutar una corrida de proceso." />} />}

      {nueva && (
        <ProcModal titulo="Nueva orden de proceso" onClose={() => setNueva(null)}
          acciones={<><ProcButton kind="ghost" onClick={() => setNueva(null)}>Cancelar</ProcButton><ProcButton onClick={crear}>Crear</ProcButton></>}>
          <ProcField label="Especie" requerido><input style={inputStyle} value={nueva.especie_codigo} onChange={(e) => setNueva((x) => ({ ...x, especie_codigo: e.target.value.toUpperCase() }))} placeholder="CHE, PLU…" /></ProcField>
          <ProcField label="Variedad"><input style={inputStyle} value={nueva.variedad_codigo} onChange={(e) => setNueva((x) => ({ ...x, variedad_codigo: e.target.value }))} /></ProcField>
          <ProcField label="Turno"><input style={inputStyle} value={nueva.turno} onChange={(e) => setNueva((x) => ({ ...x, turno: e.target.value }))} placeholder="Día / Noche…" /></ProcField>
        </ProcModal>
      )}
    </div>
  );
}
