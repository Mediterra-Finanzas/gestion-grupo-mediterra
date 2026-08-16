/* eslint-disable */
// src/proceso/ui/pages/Clientes.jsx — Clientes Service (dimensión comercial).
// Listado ejecutivo desde proc_v_cliente_servicio: identidad + estado contractual
// (backend autoridad) + contrato vigente. Cliente = quien contrata/paga; NUNCA el
// productor (origen agrícola es otra dimensión). Filtros ProcFilters acumulativos.
import React, { useEffect, useState, useMemo, useCallback } from "react";
import { useService } from "../hooks/useServiceContext";
import { cargarClientesServicio } from "../../core/procesoF7DB";
import { traducirError, tonoNivelContractual } from "../../core/procesoF7Domain";
import {
  ProcPageHeader, ProcCard, ProcButton, ProcStatusBadge, ProcDataTable,
  ProcFilters, ProcLoadingState, ProcErrorState, ProcEmptyState,
} from "../components/base";
import { C, sp } from "../estilos";
import { normalizarNombre, formatFecha } from "../format";

const POLITICAS = [
  { v: "", l: "Toda política" }, { v: "no_requerido", l: "No requerido" },
  { v: "informativo", l: "Informativo" }, { v: "advertencia", l: "Advertencia" }, { v: "bloqueante", l: "Bloqueante" },
];
const NIVELES = [
  { v: "", l: "Todo estado contractual" }, { v: "ok", l: "Vigente" },
  { v: "advertencia", l: "Sin contrato (advertencia)" }, { v: "bloqueante", l: "Sin contrato (bloqueante)" },
  { v: "informativo", l: "Sin contrato (informativo)" }, { v: "info", l: "Sin requisito" },
];

export default function Clientes() {
  const { empresa, ir } = useService();
  const [rows, setRows] = useState([]);
  const [estado, setEstado] = useState("loading");
  const [error, setError] = useState(null);
  const [q, setQ] = useState("");
  const [fNivel, setFNivel] = useState("");
  const [fPol, setFPol] = useState("");
  const [fFicha, setFFicha] = useState("");

  const cargar = useCallback(async () => {
    if (!empresa) { setEstado("ok"); setRows([]); return; }
    setEstado("loading"); setError(null);
    try { setRows(await cargarClientesServicio(empresa) || []); setEstado("ok"); }
    catch (e) { setError(traducirError(e)); setEstado("error"); }
  }, [empresa]);
  useEffect(() => { cargar(); }, [cargar]);

  const filtradas = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (rows || []).filter((r) => {
      if (t && !(`${r.cliente || ""} ${r.rut || ""} ${r.responsable_comercial || ""}`.toLowerCase().includes(t))) return false;
      if (fNivel && r.nivel_contractual !== fNivel) return false;
      if (fPol && r.politica_contrato !== fPol) return false;
      if (fFicha === "si" && !r.tiene_ficha) return false;
      if (fFicha === "no" && r.tiene_ficha) return false;
      return true;
    });
  }, [rows, q, fNivel, fPol, fFicha]);

  if (!empresa) return <div><ProcPageHeader titulo="Clientes Service" /><ProcCard style={{ padding: sp.lg }}><ProcEmptyState icono="🤝" titulo="Seleccioná un tenant" /></ProcCard></div>;
  if (estado === "loading") return <ProcLoadingState />;
  if (estado === "error") return <ProcErrorState error={error} onRetry={cargar} />;

  const conAlerta = filtradas.filter((r) => r.nivel_contractual === "bloqueante" || r.nivel_contractual === "advertencia").length;

  return (
    <div>
      <ProcPageHeader titulo="Clientes Service" subtitulo="Ficha comercial, estado contractual y trazabilidad del cliente que contrata el servicio"
        acciones={conAlerta > 0 && <ProcStatusBadge texto={`${conAlerta} con situación contractual`} tono="warning" />} />
      <ProcCard style={{ padding: sp.lg }}>
        <ProcFilters
          busqueda={q} onBusqueda={setQ} placeholder="Buscar cliente / RUT / responsable…"
          filtros={[
            { key: "nivel", label: "Estado contractual", valor: fNivel, onChange: setFNivel, opciones: NIVELES },
            { key: "pol", label: "Política", valor: fPol, onChange: setFPol, opciones: POLITICAS },
            { key: "ficha", label: "Ficha", valor: fFicha, onChange: setFFicha, opciones: [{ v: "", l: "Con y sin ficha" }, { v: "si", l: "Con ficha" }, { v: "no", l: "Sin ficha" }] },
          ]}
          onReset={() => { setQ(""); setFNivel(""); setFPol(""); setFFicha(""); }} />

        <ProcDataTable
          columnas={[
            { titulo: "Cliente", render: (r) => <b>{normalizarNombre(r.cliente) || "—"}</b> },
            { titulo: "RUT", render: (r) => r.rut || "—" },
            { titulo: "Estado contractual", render: (r) => <ProcStatusBadge texto={r.estado_contractual_display || "—"} tono={tonoNivelContractual(r.nivel_contractual)} /> },
            { titulo: "Contrato vigente", render: (r) => r.tiene_contrato_vigente ? `${r.contrato_vigente_codigo || "—"} v${r.contrato_vigente_version || 1}${r.contrato_vigente_hasta ? ` · hasta ${formatFecha(r.contrato_vigente_hasta)}` : ""}` : "—" },
            { titulo: "Política", render: (r) => r.politica_contrato || "—" },
            { titulo: "Responsable", render: (r) => normalizarNombre(r.responsable_comercial) || "—" },
            { titulo: "Ficha", render: (r) => r.tiene_ficha ? <ProcStatusBadge texto="Con ficha" tono="success" /> : <ProcStatusBadge texto="Sin ficha" tono="neutral" /> },
            { titulo: "", align: "right", render: (r) => <ProcButton kind="ghost" small onClick={() => ir("cliente_ficha", { id: r.cliente_vinculo_id })}>Ficha →</ProcButton> },
          ]}
          filas={filtradas} rowKey="cliente_vinculo_id"
          vacio={<ProcEmptyState icono="🤝" titulo="Sin clientes" detalle="Los clientes del servicio se dan de alta como vínculos rol 'cliente_servicio' en Configuración." />} />
      </ProcCard>
    </div>
  );
}
