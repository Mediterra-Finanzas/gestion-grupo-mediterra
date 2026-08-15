/* eslint-disable */
// src/proceso/ui/pages/RecepcionDetalle.jsx — trazabilidad de una recepción
// (no solo formulario): cabecera, participantes, pesos, QC, lotes generados,
// movimientos iniciales, auditoría. Lee de vistas/loaders; no recalcula.
import React, { useEffect, useState, useCallback } from "react";
import { useService } from "../hooks/useServiceContext";
import { cargarRecepcionListado, cargarRecepcionPorId, cargarLotesDeRecepcion, cargarMovimientosRef, cargarLoteOrigen, estadoContractualCliente } from "../../core/procesoF7DB";
import { traducirError, tonoContractual } from "../../core/procesoF7Domain";
import {
  ProcPageHeader, ProcCard, ProcButton, ProcStatusBadge, ProcDataTable, ProcAuditInfo,
  ProcLoadingState, ProcErrorState, ProcEmptyState,
} from "../components/base";
import QcPanel from "../components/QcPanel";
import { C, sp } from "../estilos";
import { formatKg, formatNum, formatFecha, formatFechaHora, normalizarNombre } from "../format";

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
  const [contract, setContract] = useState(null);
  const [estado, setEstado] = useState("loading");
  const [error, setError] = useState(null);

  const cargar = useCallback(async () => {
    if (!empresa || !id) return;
    setEstado("loading"); setError(null);
    try {
      const [lista, rw, ls, org, ms] = await Promise.all([
        cargarRecepcionListado(empresa, `&id=eq.${id}`),
        cargarRecepcionPorId(empresa, id),
        cargarLotesDeRecepcion(empresa, id),
        cargarLoteOrigen(empresa, `&recepcion_id=eq.${id}`),
        cargarMovimientosRef(empresa, id),
      ]);
      // merge: origen (productor/predio/cuartel) + raw (estado/ubicación) por id de lote
      const orgById = Object.fromEntries((org || []).map((o) => [o.id, o]));
      const merged = (ls || []).map((x) => ({ ...x, ...(orgById[x.id] || {}) }));
      setR((lista && lista[0]) || null); setRaw((rw && rw[0]) || null);
      setLotes(merged); setMovs(ms || []); setEstado("ok");
      const cli = (rw && rw[0] && rw[0].cliente_servicio_vinculo_id) || null;
      if (cli) estadoContractualCliente({ empresaId: empresa, clienteId: cli }).then((c) => setContract(Array.isArray(c) ? c[0] : c)).catch(() => {});
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

      <Seccion titulo="Cabecera · comercial / logística" extra={<ProcStatusBadge estado={r.estado} />}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(150px,1fr))", gap: sp.md }}>
          <Dato l="Folio" v={r.folio} /><Dato l="Cliente" v={normalizarNombre(r.cliente)} /><Dato l="Fecha" v={r.fecha ? formatFechaHora(r.fecha) : "—"} />
          <Dato l="QC (especie principal)" v={r.qc_resultado ? <ProcStatusBadge estado={r.qc_resultado} /> : "sin QC"} />
        </div>
        {contract && (
          <div style={{ display: "flex", alignItems: "center", gap: sp.md, flexWrap: "wrap", marginTop: sp.md, padding: "8px 12px", borderRadius: 8,
            background: contract.nivel === "bloqueante" ? C.dangerBg : contract.nivel === "advertencia" ? C.warningBg : contract.nivel === "informativo" ? C.infoBg : C.successBg }}>
            <ProcStatusBadge texto={contract.estado_display || "—"} tono={tonoContractual(contract.nivel)} />
            <span style={{ fontSize: 12.5, color: C.text }}>Estado contractual del cliente. La recepción física ya está registrada; el avance a proceso depende de la política contractual.</span>
          </div>
        )}
      </Seccion>

      <Seccion titulo="Participantes (Core vía proc_vinculo)">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(180px,1fr))", gap: sp.md }}>
          <Dato l="Cliente / mandante" v={normalizarNombre(r.cliente)} /><Dato l="Productor" v={normalizarNombre(r.productor)} />
          <Dato l="Dueño de la fruta" v={normalizarNombre(r.dueno_fruta)} /><Dato l="Exportadora" v={normalizarNombre(r.exportadora)} />
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

      <Seccion titulo={`Lotes / orígenes (${lotes.length})`}>
        <div style={{ fontSize: 12, color: C.muted, marginBottom: sp.sm }}>Una recepción física puede generar varios lotes de distinto origen agrícola.</div>
        <ProcDataTable
          columnas={[
            { titulo: "Código", render: (l) => <b>{l.codigo}</b> },
            { titulo: "Productor", render: (l) => normalizarNombre(l.productor) || "—" },
            { titulo: "Predio", render: (l) => normalizarNombre(l.predio) || "—" },
            { titulo: "Cuartel", render: (l) => l.cuartel || "—" },
            { titulo: "Especie", render: (l) => l.especie_codigo || "—" },
            { titulo: "Variedad", render: (l) => l.variedad_codigo || "—" },
            { titulo: "Ubicación", render: (l) => l.ubicacion || "—" },
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
