/* eslint-disable */
// src/proceso/ui/pages/Bodega.jsx — inventario de pallets: "¿qué tengo y dónde?"
// Saldos físico/reservado/bloqueado/libre desde proc_v_pallet_bodega (SoT = ledger).
import React, { useEffect, useState, useCallback } from "react";
import { useService } from "../hooks/useServiceContext";
import { cargarBodega } from "../../core/procesoF7DB";
import { traducirError, badgeDe } from "../../core/procesoF7Domain";
import {
  ProcPageHeader, ProcCard, ProcButton, ProcDataTable, ProcStatusBadge,
  ProcLoadingState, ProcErrorState, ProcEmptyState, inputStyle,
} from "../components/base";
import { C, sp } from "../estilos";

const kg = (n) => `${Number(n || 0).toLocaleString("es-CL")}`;

export default function Bodega() {
  const { empresa, planta, ir } = useService();
  const [rows, setRows] = useState([]);
  const [estado, setEstado] = useState("idle"); const [error, setError] = useState(null);
  const [fTexto, setFTexto] = useState(""); const [fEstado, setFEstado] = useState("");

  const cargar = useCallback(async () => {
    if (!empresa) { setEstado("idle"); return; }
    setEstado("loading"); setError(null);
    try {
      let extra = "";
      if (planta) extra += `&planta_id=eq.${planta}`;
      if (fEstado) extra += `&estado=eq.${fEstado}`;
      setRows(await cargarBodega(empresa, extra)); setEstado("ok");
    } catch (e) { setError(traducirError(e)); setEstado("error"); }
  }, [empresa, planta, fEstado]);
  useEffect(() => { cargar(); }, [cargar]);

  const filtradas = rows.filter((p) => !fTexto ||
    [p.codigo, p.cliente, p.especie_codigo, p.ubicacion].join(" ").toLowerCase().includes(fTexto.toLowerCase()));

  const columnas = [
    { titulo: "Pallet", render: (p) => <b>{p.codigo}</b> },
    { titulo: "Especie", campo: "especie_codigo" },
    { titulo: "Cliente", campo: "cliente" },
    { titulo: "Formato", campo: "formato" },
    { titulo: "Ubicación", campo: "ubicacion" },
    { titulo: "Cajas", align: "right", campo: "cajas" },
    { titulo: "Físico", align: "right", render: (p) => kg(p.kg_fisico) },
    { titulo: "Reserv.", align: "right", render: (p) => kg(p.reservado) },
    { titulo: "Bloq.", align: "right", render: (p) => kg(p.bloqueado) },
    { titulo: "Libre", align: "right", render: (p) => <b>{kg(p.disponible)}</b> },
    { titulo: "Estado", render: (p) => <ProcStatusBadge estado={p.estado} /> },
    { titulo: "", align: "right", render: (p) => <ProcButton kind="ghost" small onClick={() => ir("pallet_detalle", { id: p.pallet_id })}>Ver</ProcButton> },
  ];

  if (!empresa) return <div><ProcPageHeader titulo="Bodega / Inventario" /><ProcCard style={{ padding: sp.lg }}><ProcEmptyState icono="🏬" titulo="Seleccioná un tenant" /></ProcCard></div>;

  return (
    <div>
      <ProcPageHeader titulo="Bodega / Inventario" subtitulo="Pallets físicos y su ubicación"
        acciones={<ProcButton kind="ghost" onClick={() => ir("repaletizaje")}>Repaletizaje →</ProcButton>} />
      <ProcCard style={{ padding: sp.md, marginBottom: sp.md }}>
        <div style={{ display: "flex", gap: sp.sm, flexWrap: "wrap" }}>
          <input style={{ ...inputStyle, width: 240 }} placeholder="Buscar código/cliente/ubicación…" value={fTexto} onChange={(e) => setFTexto(e.target.value)} />
          <select style={{ ...inputStyle, width: 190 }} value={fEstado} onChange={(e) => setFEstado(e.target.value)}>
            <option value="">Todos los estados</option>
            {["armando", "disponible", "reservado", "parcialmente_consumido", "agotado", "anulado"].map((s) => <option key={s} value={s}>{badgeDe(s).label}</option>)}
          </select>
        </div>
      </ProcCard>
      {estado === "loading" ? <ProcLoadingState /> :
       estado === "error" ? <ProcErrorState error={error} onRetry={cargar} /> :
       <ProcDataTable columnas={columnas} filas={filtradas} rowKey="pallet_id"
         vacio={<ProcEmptyState icono="🏬" titulo="Sin pallets" detalle="Palletizá producto terminado para poblar la bodega." />} />}
    </div>
  );
}
