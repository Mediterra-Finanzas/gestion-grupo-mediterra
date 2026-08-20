/* eslint-disable */
// src/proceso/ui/pages/Lotes.jsx — "¿qué fruta tengo disponible antes del proceso?"
// Saldos + origen (nivel lote) + QC por lote leídos de proc_v_lote_listado (SoT = ledger).
// Filtros server-side (PostgREST) acumulativos: cliente/productor/predio/cuartel/especie/
// variedad/estado/QC. NO se carga toda la historia para simular filtros.
import React, { useEffect, useState, useCallback, useMemo } from "react";
import { useService } from "../hooks/useServiceContext";
import { cargarLoteListado, cargarVinculosPorRol, cargarPredios, cargarCuarteles, cargarEspecies, cargarVariedades } from "../../core/procesoF7DB";
import { traducirError, badgeDe } from "../../core/procesoF7Domain";
import {
  ProcPageHeader, ProcCard, ProcButton, ProcDataTable, ProcStatusBadge,
  ProcLoadingState, ProcErrorState, ProcEmptyState, ProcFilters,
} from "../components/base";
import { C, sp } from "../estilos";
import { formatNum, normalizarNombre } from "../format";

const kg = (n) => formatNum(n || 0, 1);
const LOTE_ESTADOS = ["activo", "en_proceso", "consumido", "despachado", "anulado"];

export default function Lotes() {
  const { empresa, planta, ir } = useService();
  const [rows, setRows] = useState([]);
  const [estado, setEstado] = useState("idle");
  const [error, setError] = useState(null);
  // opciones de filtro (maestros)
  const [opts, setOpts] = useState({ clientes: [], productores: [], predios: [], cuarteles: [], especies: [], variedades: [] });
  // valores de filtro
  const [fTexto, setFTexto] = useState("");
  const [f, setF] = useState({ cliente: "", productor: "", predio: "", cuartel: "", especie: "", variedad: "", estado: "", qc: "" });
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));

  // cargar opciones de filtro una vez por tenant
  useEffect(() => {
    if (!empresa) return;
    Promise.all([
      cargarVinculosPorRol(empresa, "cliente_servicio"), cargarVinculosPorRol(empresa, "productor"),
      cargarPredios(empresa), cargarCuarteles(empresa), cargarEspecies(empresa), cargarVariedades(empresa),
    ]).then(([cl, pr, pre, cu, es, va]) =>
      setOpts({ clientes: cl || [], productores: pr || [], predios: pre || [], cuarteles: cu || [], especies: es || [], variedades: va || [] })
    ).catch(() => {});
  }, [empresa]);

  const cargar = useCallback(async () => {
    if (!empresa) { setEstado("idle"); return; }
    setEstado("loading"); setError(null);
    try {
      let extra = "&limit=400&order=codigo";
      if (planta) extra += `&planta_id=eq.${planta}`;
      if (f.cliente) extra += `&cliente_vinculo_id=eq.${f.cliente}`;
      if (f.productor) extra += `&productor_vinculo_id=eq.${f.productor}`;
      if (f.predio) extra += `&predio_id=eq.${f.predio}`;
      if (f.cuartel) extra += `&cuartel_id=eq.${f.cuartel}`;
      if (f.especie) extra += `&especie_codigo=eq.${f.especie}`;
      if (f.variedad) extra += `&variedad_codigo=eq.${f.variedad}`;
      if (f.estado) extra += `&estado=eq.${f.estado}`;
      if (f.qc) extra += `&qc_resultado=eq.${f.qc}`;
      setRows(await cargarLoteListado(empresa, extra)); setEstado("ok");
    } catch (e) { setError(traducirError(e)); setEstado("error"); }
  }, [empresa, planta, f]);
  useEffect(() => { cargar(); }, [cargar]);

  const filtradas = useMemo(() => {
    const t = fTexto.trim().toLowerCase();
    if (!t) return rows;
    return rows.filter((l) => [l.codigo, l.cliente, l.productor, l.predio, l.cuartel, l.especie_codigo].join(" ").toLowerCase().includes(t));
  }, [rows, fTexto]);

  const opt = (arr, val, lab) => [{ v: "", l: "Todos" }, ...arr.map((x) => ({ v: x[val], l: lab(x) }))];
  const variedadOpts = f.especie ? opts.variedades.filter((v) => v.especie_codigo === f.especie) : opts.variedades;

  const columnas = [
    { titulo: "Código", render: (l) => <b>{l.codigo}</b> },
    { titulo: "Recepción", campo: "recepcion_folio" },
    { titulo: "Cliente", render: (l) => normalizarNombre(l.cliente) || "—" },
    { titulo: "Productor", render: (l) => normalizarNombre(l.productor) || "—" },
    { titulo: "Predio", render: (l) => normalizarNombre(l.predio) || "—" },
    { titulo: "Cuartel", render: (l) => l.cuartel || "—" },
    { titulo: "Especie", render: (l) => `${l.especie_codigo || "—"}${l.variedad_codigo ? " · " + l.variedad_codigo : ""}` },
    { titulo: "Ubicación", campo: "ubicacion" },
    { titulo: "Físico", align: "right", render: (l) => kg(l.on_hand) },
    { titulo: "Libre", align: "right", render: (l) => <b>{kg(l.disponible)}</b> },
    { titulo: "QC", render: (l) => (l.qc_resultado ? <ProcStatusBadge estado={l.qc_resultado} /> : <span style={{ color: C.muted2, fontSize: 12 }}>sin QC</span>) },
    { titulo: "Estado", render: (l) => <ProcStatusBadge estado={l.estado} /> },
    { titulo: "", align: "right", render: (l) => <ProcButton kind="ghost" small onClick={() => ir("lote_detalle", { id: l.id })}>Ver</ProcButton> },
  ];

  if (!empresa) return <div><ProcPageHeader titulo="Lotes / Materia Prima" /><ProcCard style={{ padding: sp.lg }}><ProcEmptyState icono="📦" titulo="Seleccioná un tenant" /></ProcCard></div>;

  return (
    <div>
      <ProcPageHeader titulo="Lotes / Materia Prima" subtitulo="Fruta disponible antes del proceso · origen agrícola por lote" />
      <ProcCard style={{ padding: sp.md, marginBottom: sp.md }}>
        <ProcFilters
          busqueda={fTexto} onBusqueda={setFTexto} placeholder="Buscar código/origen…"
          filtros={[
            { key: "cliente", label: "Cliente", valor: f.cliente, onChange: (v) => set("cliente", v), opciones: opt(opts.clientes, "id", (x) => normalizarNombre(x.nombre_provisional)) },
            { key: "productor", label: "Productor", valor: f.productor, onChange: (v) => set("productor", v), opciones: opt(opts.productores, "id", (x) => normalizarNombre(x.nombre_provisional)) },
            { key: "predio", label: "Predio", valor: f.predio, onChange: (v) => set("predio", v), opciones: opt(opts.predios, "id", (x) => normalizarNombre(x.nombre)) },
            { key: "cuartel", label: "Cuartel", valor: f.cuartel, onChange: (v) => set("cuartel", v), opciones: opt(opts.cuarteles, "id", (x) => x.codigo) },
            { key: "especie", label: "Especie", valor: f.especie, onChange: (v) => { set("especie", v); set("variedad", ""); }, opciones: opt(opts.especies, "codigo", (x) => x.nombre || x.codigo) },
            { key: "variedad", label: "Variedad", valor: f.variedad, onChange: (v) => set("variedad", v), opciones: opt(variedadOpts, "codigo", (x) => x.nombre || x.codigo) },
            { key: "estado", label: "Estado", valor: f.estado, onChange: (v) => set("estado", v), opciones: [{ v: "", l: "Todos" }, ...LOTE_ESTADOS.map((s) => ({ v: s, l: badgeDe(s).label }))] },
            { key: "qc", label: "QC", valor: f.qc, onChange: (v) => set("qc", v), opciones: [{ v: "", l: "Todo QC" }, ...["aprobado", "condicional", "rechazado"].map((s) => ({ v: s, l: badgeDe(s).label }))] },
          ]}
          onReset={() => { setFTexto(""); setF({ cliente: "", productor: "", predio: "", cuartel: "", especie: "", variedad: "", estado: "", qc: "" }); }} />
      </ProcCard>
      {estado === "loading" ? <ProcLoadingState /> :
       estado === "error" ? <ProcErrorState error={error} onRetry={cargar} /> :
       <ProcDataTable columnas={columnas} filas={filtradas} rowKey="id"
         vacio={<ProcEmptyState icono="📦" titulo="Sin lotes" detalle="Ajustá los filtros o ingresá fruta desde una recepción." />} />}
    </div>
  );
}
