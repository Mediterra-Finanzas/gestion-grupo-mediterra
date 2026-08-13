/* eslint-disable */
// src/proceso/ui/pages/Lotes.jsx — "¿qué fruta tengo disponible antes del proceso?"
// Saldos leídos de proc_v_lote_listado (SoT = ledger); no se calcula en React.
import React, { useEffect, useState, useCallback } from "react";
import { useService } from "../hooks/useServiceContext";
import { cargarLoteListado } from "../../core/procesoF7DB";
import { traducirError, badgeDe } from "../../core/procesoF7Domain";
import {
  ProcPageHeader, ProcCard, ProcButton, ProcDataTable, ProcStatusBadge,
  ProcLoadingState, ProcErrorState, ProcEmptyState, inputStyle,
} from "../components/base";
import { C, sp } from "../estilos";

const kg = (n) => `${Number(n || 0).toLocaleString("es-CL")}`;

export default function Lotes() {
  const { empresa, planta, ir } = useService();
  const [rows, setRows] = useState([]);
  const [estado, setEstado] = useState("idle");
  const [error, setError] = useState(null);
  const [fTexto, setFTexto] = useState("");
  const [fQc, setFQc] = useState("");

  const cargar = useCallback(async () => {
    if (!empresa) { setEstado("idle"); return; }
    setEstado("loading"); setError(null);
    try {
      let extra = "&limit=300";
      if (planta) extra += `&planta_id=eq.${planta}`;
      if (fQc) extra += `&qc_resultado=eq.${fQc}`;
      setRows(await cargarLoteListado(empresa, extra)); setEstado("ok");
    } catch (e) { setError(traducirError(e)); setEstado("error"); }
  }, [empresa, planta, fQc]);
  useEffect(() => { cargar(); }, [cargar]);

  const filtradas = rows.filter((l) => !fTexto ||
    [l.codigo, l.cliente, l.productor, l.especie_codigo].join(" ").toLowerCase().includes(fTexto.toLowerCase()));

  const columnas = [
    { titulo: "Código", render: (l) => <b>{l.codigo}</b> },
    { titulo: "Recepción", campo: "recepcion_folio" },
    { titulo: "Cliente", campo: "cliente" },
    { titulo: "Productor", campo: "productor" },
    { titulo: "Especie", campo: "especie_codigo" },
    { titulo: "Ubicación", campo: "ubicacion" },
    { titulo: "Físico", align: "right", render: (l) => kg(l.on_hand) },
    { titulo: "Reserv.", align: "right", render: (l) => kg(l.reservado) },
    { titulo: "Bloq.", align: "right", render: (l) => kg(l.bloqueado) },
    { titulo: "Libre", align: "right", render: (l) => <b>{kg(l.disponible)}</b> },
    { titulo: "QC", render: (l) => (l.qc_resultado ? <ProcStatusBadge estado={l.qc_resultado} /> : <span style={{ color: C.muted2, fontSize: 12 }}>sin QC</span>) },
    { titulo: "", align: "right", render: (l) => <ProcButton kind="ghost" small onClick={() => ir("lote_detalle", { id: l.id })}>Ver</ProcButton> },
  ];

  if (!empresa) return <div><ProcPageHeader titulo="Lotes / Materia Prima" /><ProcCard style={{ padding: sp.lg }}><ProcEmptyState icono="📦" titulo="Seleccioná un tenant" /></ProcCard></div>;

  return (
    <div>
      <ProcPageHeader titulo="Lotes / Materia Prima" subtitulo="Fruta disponible antes del proceso" />
      <ProcCard style={{ padding: sp.md, marginBottom: sp.md }}>
        <div style={{ display: "flex", gap: sp.sm, flexWrap: "wrap" }}>
          <input style={{ ...inputStyle, width: 240 }} placeholder="Buscar código/cliente/productor…" value={fTexto} onChange={(e) => setFTexto(e.target.value)} />
          <select style={{ ...inputStyle, width: 170 }} value={fQc} onChange={(e) => setFQc(e.target.value)}>
            <option value="">Todo QC</option>
            {["aprobado", "condicional", "rechazado"].map((s) => <option key={s} value={s}>{badgeDe(s).label}</option>)}
          </select>
        </div>
      </ProcCard>
      {estado === "loading" ? <ProcLoadingState /> :
       estado === "error" ? <ProcErrorState error={error} onRetry={cargar} /> :
       <ProcDataTable columnas={columnas} filas={filtradas} rowKey="id"
         vacio={<ProcEmptyState icono="📦" titulo="Sin lotes" detalle="Ingresá fruta desde una recepción para generar lotes." />} />}
    </div>
  );
}
