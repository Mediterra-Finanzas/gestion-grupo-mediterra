/* eslint-disable */
// src/proceso/ui/pages/RecepcionDetalle.jsx — trazabilidad de una recepción
// (no solo formulario): cabecera, participantes, pesos, QC, lotes generados,
// movimientos iniciales, auditoría. Lee de vistas/loaders; no recalcula.
import React, { useEffect, useState, useCallback } from "react";
import { useService } from "../hooks/useServiceContext";
import { cargarRecepcionListado, cargarRecepcionPorId, cargarLotesDeRecepcion, cargarMovimientosRef } from "../../core/procesoF7DB";
import { traducirError } from "../../core/procesoF7Domain";
import {
  ProcPageHeader, ProcCard, ProcButton, ProcStatusBadge, ProcDataTable, ProcAuditInfo,
  ProcLoadingState, ProcErrorState, ProcEmptyState,
} from "../components/base";
import QcPanel from "../components/QcPanel";
import { C, sp } from "../estilos";
import { formatKg, formatNum, formatFecha, formatFechaHora } from "../format";

const kg = (n) => formatKg(n);
function Dato({ l, v }) { return <div><div style={{ fontSize: 11, color: C.muted, fontWeight: 600 }}>{l}</div><div style={{ fontSize: 14, color: C.text }}>{v ?? "—"}</div></div>; }
function Seccion({ titulo, children, extra }) {
  return <ProcCard style={{ padding: sp.lg, marginBottom: sp.md }}>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: sp.md }}>
      <div style={{ fontSize: 15, fontWeight: 800, color: C.text }}>{titulo}</div>{extra}
    </div>{children}</ProcCard>;
}

export default function RecepcionDetalle() {
  const { empresa, ir, vista, puedeEditar } = useService();
  const id = vista?.params?.id;
  const [r, setR] = useState(null);
  const [raw, setRaw] = useState(null);
  const [lotes, setLotes] = useState([]);
  const [movs, setMovs] = useState([]);
  const [estado, setEstado] = useState("loading");
  const [error, setError] = useState(null);

  const cargar = useCallback(async () => {
    if (!empresa || !id) return;
    setEstado("loading"); setError(null);
    try {
      const [lista, rw, ls, ms] = await Promise.all([
        cargarRecepcionListado(empresa, `&id=eq.${id}`),
        cargarRecepcionPorId(empresa, id),
        cargarLotesDeRecepcion(empresa, id),
        cargarMovimientosRef(empresa, id),
      ]);
      setR((lista && lista[0]) || null); setRaw((rw && rw[0]) || null);
      setLotes(ls || []); setMovs(ms || []); setEstado("ok");
    } catch (e) { setError(traducirError(e)); setEstado("error"); }
  }, [empresa, id]);
  useEffect(() => { cargar(); }, [cargar]);

  if (estado === "loading") return <ProcLoadingState />;
  if (estado === "error") return <ProcErrorState error={error} onRetry={cargar} />;
  if (!r) return <ProcEmptyState titulo="Recepción no encontrada" />;

  return (
    <div>
      <ProcPageHeader titulo={`Recepción ${r.folio}`} subtitulo="Trazabilidad de recepción"
        acciones={<ProcButton kind="ghost" onClick={() => ir("recepciones")}>← Recepciones</ProcButton>} />

      <Seccion titulo="Cabecera" extra={<ProcStatusBadge estado={r.estado} />}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(150px,1fr))", gap: sp.md }}>
          <Dato l="Folio" v={r.folio} /><Dato l="Fecha" v={r.fecha ? formatFechaHora(r.fecha) : "—"} />
          <Dato l="Especie" v={r.especie_codigo} /><Dato l="Variedad" v={r.variedad_codigo} />
          <Dato l="QC" v={r.qc_resultado ? <ProcStatusBadge estado={r.qc_resultado} /> : "sin QC"} />
        </div>
      </Seccion>

      <Seccion titulo="Participantes (Core vía proc_vinculo)">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(180px,1fr))", gap: sp.md }}>
          <Dato l="Cliente / mandante" v={r.cliente} /><Dato l="Productor" v={r.productor} />
          <Dato l="Dueño de la fruta" v={r.dueno_fruta} /><Dato l="Exportadora" v={r.exportadora} />
        </div>
      </Seccion>

      <Seccion titulo="Pesos">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(150px,1fr))", gap: sp.md }}>
          <Dato l="Kg bruto" v={kg(r.kg_bruto)} /><Dato l="Tara" v={kg(r.tara)} /><Dato l="Kg neto" v={kg(r.kg_neto)} />
          <Dato l="Guía" v={r.guia_despacho} /><Dato l="Patente" v={r.patente} />
        </div>
      </Seccion>

      <Seccion titulo="Control de Calidad">
        <QcPanel especie={r.especie_codigo} recepcionId={id} editable={puedeEditar("recepciones") || puedeEditar("centro")} onGuardado={cargar} />
      </Seccion>

      <Seccion titulo={`Lotes generados (${lotes.length})`}>
        <ProcDataTable
          columnas={[
            { titulo: "Código", render: (l) => <b>{l.codigo}</b> },
            { titulo: "Variedad", campo: "variedad_codigo" },
            { titulo: "Estado", render: (l) => <ProcStatusBadge estado={l.estado} /> },
            { titulo: "", align: "right", render: (l) => <ProcButton kind="ghost" small onClick={() => ir("lote_detalle", { id: l.id })}>Trazabilidad →</ProcButton> },
          ]}
          filas={lotes} rowKey="id"
          vacio={<ProcEmptyState icono="📦" titulo="Sin lotes" detalle="Esta recepción todavía no generó lotes." />} />
      </Seccion>

      <Seccion titulo={`Movimientos iniciales (${movs.length})`}>
        <ProcDataTable
          columnas={[
            { titulo: "Fecha", render: (m) => formatFechaHora(m.fecha || m.created_at) },
            { titulo: "Tipo", campo: "tipo_movimiento" },
            { titulo: "Naturaleza", render: (m) => <ProcStatusBadge texto={m.naturaleza} tono={m.naturaleza === "entrada" ? "success" : "neutral"} /> },
            { titulo: "Objeto", campo: "objeto_tipo" },
            { titulo: "Cantidad", align: "right", render: (m) => kg(m.cantidad) },
          ]}
          filas={movs} rowKey="id"
          vacio={<ProcEmptyState titulo="Sin movimientos" />} />
      </Seccion>

      <Seccion titulo="Auditoría"><ProcAuditInfo registro={raw} /></Seccion>
    </div>
  );
}
