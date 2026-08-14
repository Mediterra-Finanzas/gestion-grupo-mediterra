/* eslint-disable */
// src/proceso/ui/pages/LoteDetalle.jsx — primera pantalla real de trazabilidad:
// Recepción origen → Lote → Ubicación/saldos → Movimientos → QC/elegibilidad →
// (futuras órdenes de proceso). Saldos/elegibilidad desde backend, no React.
import React, { useEffect, useState, useCallback } from "react";
import { useService } from "../hooks/useServiceContext";
import { cargarLotePorId, cargarMovimientosObjeto, loteElegible } from "../../core/procesoF7DB";
import { traducirError } from "../../core/procesoF7Domain";
import {
  ProcPageHeader, ProcCard, ProcButton, ProcStatusBadge, ProcKpiCard, ProcDataTable,
  ProcLoadingState, ProcErrorState, ProcEmptyState,
} from "../components/base";
import { C, sp } from "../estilos";
import { formatKg, formatNum, formatFecha, formatFechaHora } from "../format";

const kg = (n) => formatKg(n);
function Dato({ l, v }) { return <div><div style={{ fontSize: 11, color: C.muted, fontWeight: 600 }}>{l}</div><div style={{ fontSize: 14, color: C.text }}>{v ?? "—"}</div></div>; }
function Seccion({ titulo, children }) {
  return <ProcCard style={{ padding: sp.lg, marginBottom: sp.md }}>
    <div style={{ fontSize: 15, fontWeight: 800, color: C.text, marginBottom: sp.md }}>{titulo}</div>{children}</ProcCard>;
}

export default function LoteDetalle() {
  const { empresa, ir, vista } = useService();
  const id = vista?.params?.id;
  const [l, setL] = useState(null);
  const [movs, setMovs] = useState([]);
  const [eleg, setEleg] = useState(null);
  const [estado, setEstado] = useState("loading");
  const [error, setError] = useState(null);

  const cargar = useCallback(async () => {
    if (!empresa || !id) return;
    setEstado("loading"); setError(null);
    try {
      const [lote, ms, el] = await Promise.all([
        cargarLotePorId(empresa, id), cargarMovimientosObjeto(empresa, id), loteElegible(empresa, id),
      ]);
      setL((lote && lote[0]) || null); setMovs(ms || []); setEleg(el); setEstado("ok");
    } catch (e) { setError(traducirError(e)); setEstado("error"); }
  }, [empresa, id]);
  useEffect(() => { cargar(); }, [cargar]);

  if (estado === "loading") return <ProcLoadingState />;
  if (estado === "error") return <ProcErrorState error={error} onRetry={cargar} />;
  if (!l) return <ProcEmptyState titulo="Lote no encontrado" />;

  const elegible = eleg && (Array.isArray(eleg) ? eleg[0] : eleg);
  const esEleg = elegible && (elegible.elegible === true || elegible.elegible === "true");

  return (
    <div>
      <ProcPageHeader titulo={`Lote ${l.codigo}`} subtitulo="Trazabilidad de lote"
        acciones={<ProcButton kind="ghost" onClick={() => ir("lotes")}>← Lotes</ProcButton>} />

      <Seccion titulo="Origen y datos">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(160px,1fr))", gap: sp.md }}>
          <Dato l="Código lote" v={l.codigo} />
          <Dato l="Recepción origen" v={<ProcButton kind="ghost" small onClick={() => ir("recepcion_detalle", { id: l.recepcion_id })}>{l.recepcion_folio} →</ProcButton>} />
          <Dato l="Cliente" v={l.cliente} /><Dato l="Productor" v={l.productor} /><Dato l="Dueño fruta" v={l.dueno_fruta} />
          <Dato l="Especie / variedad" v={`${l.especie_codigo || "—"} ${l.variedad_codigo || ""}`} />
          <Dato l="Ubicación" v={l.ubicacion} /><Dato l="Estado" v={<ProcStatusBadge estado={l.estado} />} />
          <Dato l="QC" v={l.qc_resultado ? <ProcStatusBadge estado={l.qc_resultado} /> : "sin QC"} />
        </div>
      </Seccion>

      <Seccion titulo="Saldos físicos (ledger = SoT)">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(160px,1fr))", gap: sp.md }}>
          <ProcKpiCard label="Físico (on hand)" valor={kg(l.on_hand)} tono="success" />
          <ProcKpiCard label="Reservado" valor={kg(l.reservado)} tono="warning" />
          <ProcKpiCard label="Bloqueado" valor={kg(l.bloqueado)} tono="danger" />
          <ProcKpiCard label="Libre" valor={kg(l.disponible)} tono="primary" />
        </div>
      </Seccion>

      <Seccion titulo="Elegibilidad para proceso (gate QC)">
        {esEleg
          ? <div style={{ color: C.success, fontWeight: 700 }}>✓ Habilitado para consumo en proceso</div>
          : <div style={{ color: C.danger, fontWeight: 700 }}>⛔ No habilitado — {elegible?.motivo || "QC"}. La fruta existe físicamente, pero no puede consumirse hasta resolver el QC.</div>}
      </Seccion>

      <Seccion titulo={`Movimientos (${movs.length})`}>
        <ProcDataTable
          columnas={[
            { titulo: "Fecha", render: (m) => formatFechaHora(m.fecha || m.created_at) },
            { titulo: "Tipo", campo: "tipo_movimiento" },
            { titulo: "Naturaleza", render: (m) => <ProcStatusBadge texto={m.naturaleza} tono={m.naturaleza === "entrada" ? "success" : m.naturaleza === "salida" ? "danger" : "neutral"} /> },
            { titulo: "Cantidad", align: "right", render: (m) => kg(m.cantidad) },
            { titulo: "Ref", campo: "ref_tipo" },
          ]}
          filas={movs} rowKey="id" vacio={<ProcEmptyState titulo="Sin movimientos" />} />
      </Seccion>

      <Seccion titulo="Órdenes de proceso">
        <ProcEmptyState icono="🧭" titulo="Ejecución de proceso llega en F7.3"
          detalle="Cuando este lote se consuma en órdenes, la genealogía aparecerá acá." />
      </Seccion>
    </div>
  );
}
