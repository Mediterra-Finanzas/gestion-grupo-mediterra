/* eslint-disable */
// src/proceso/ui/pages/RecepcionDetalle.jsx — trazabilidad de una recepción
// (no solo formulario): cabecera, participantes, pesos, QC, lotes generados,
// movimientos iniciales, auditoría. Lee de vistas/loaders; no recalcula.
import React, { useEffect, useState, useCallback } from "react";
import { useService } from "../hooks/useServiceContext";
import { cargarRecepcionListado, cargarRecepcionPorId, cargarLotesDeRecepcion, cargarMovimientosRef, cargarLoteOrigen, estadoContractualCliente, conciliacionRecepcion, cerrarRecepcion, cargarQcLotesDeRecepcion } from "../../core/procesoF7DB";
import { traducirError, tonoContractual, qcPorLote, resumenQcRecepcion, loteSinOrigen } from "../../core/procesoF7Domain";
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
  const { empresa, ir, vista, puedeEditar, notificar } = useService();
  const id = vista?.params?.id;
  const [r, setR] = useState(null);
  const [raw, setRaw] = useState(null);
  const [lotes, setLotes] = useState([]);
  const [movs, setMovs] = useState([]);
  const [contract, setContract] = useState(null);
  const [concil, setConcil] = useState(null);
  const [cerrando, setCerrando] = useState(false);
  const [qcRows, setQcRows] = useState([]);
  const [selLoteQc, setSelLoteQc] = useState("");
  const [estado, setEstado] = useState("loading");
  const [error, setError] = useState(null);

  const cargar = useCallback(async () => {
    if (!empresa || !id) return;
    setEstado("loading"); setError(null);
    try {
      const [lista, rw, ls, org, ms, qc] = await Promise.all([
        cargarRecepcionListado(empresa, `&id=eq.${id}`),
        cargarRecepcionPorId(empresa, id),
        cargarLotesDeRecepcion(empresa, id),
        cargarLoteOrigen(empresa, `&recepcion_id=eq.${id}`),
        cargarMovimientosRef(empresa, id),
        cargarQcLotesDeRecepcion(empresa, id),
      ]);
      setQcRows(qc || []);
      // merge: origen (productor/predio/cuartel) + raw (estado/ubicación) por id de lote
      const orgById = Object.fromEntries((org || []).map((o) => [o.id, o]));
      const merged = (ls || []).map((x) => ({ ...x, ...(orgById[x.id] || {}) }));
      setR((lista && lista[0]) || null); setRaw((rw && rw[0]) || null);
      setLotes(merged); setMovs(ms || []); setEstado("ok");
      const cli = (rw && rw[0] && rw[0].cliente_servicio_vinculo_id) || null;
      if (cli) estadoContractualCliente({ empresaId: empresa, clienteId: cli }).then((c) => setContract(Array.isArray(c) ? c[0] : c)).catch(() => {});
      conciliacionRecepcion(empresa, id).then((rows) => setConcil((rows && rows[0]) || null)).catch(() => setConcil(null));
    } catch (e) { setError(traducirError(e)); setEstado("error"); }
  }, [empresa, id]);
  useEffect(() => { cargar(); }, [cargar]);

  const finalizar = async () => {
    setCerrando(true);
    try {
      const res = await cerrarRecepcion({ empresaId: empresa, recepcionId: id });
      notificar && notificar(`Recepción finalizada (${formatNum(res.kg_lotes, 1)} kg conciliados)`);
      cargar();
    } catch (e) { notificar && notificar(traducirError(e), "error"); cargar(); }
    finally { setCerrando(false); }
  };

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

      {raw?.estado === "borrador" && (() => {
        const cc = concil;
        const neto = cc ? Number(cc.kg_neto) : Number(r.kg_neto);
        const lotesKg = cc ? Number(cc.kg_lotes) : 0;
        const dif = cc ? Number(cc.diferencia) : (neto - lotesKg);
        const tolAbs = cc ? Number(cc.tolerancia_abs) : null;
        const tolPct = cc ? Number(cc.tolerancia_pct) : null;
        const dentro = cc ? cc.dentro_tolerancia : false;
        const sinLotes = lotesKg <= 0;
        const puede = puedeEditar("recepciones") || puedeEditar("centro");
        const M = ({ l, v, tono }) => <div style={{ padding: "8px 12px", background: C.cardAlt, borderRadius: 8 }}>
          <div style={{ fontSize: 11, color: C.muted, textTransform: "uppercase", letterSpacing: .3 }}>{l}</div>
          <div style={{ fontSize: 15, fontWeight: 800, color: tono || C.text }}>{v}</div></div>;
        return (
          <Seccion titulo="Conciliación de masa · recepción en borrador" extra={<ProcStatusBadge estado="borrador" />}>
            <div style={{ fontSize: 12.5, color: C.muted, marginBottom: sp.md }}>
              Finalizá la recepción cuando los kilos de los lotes cuadren con el peso neto (dentro de la tolerancia). El backend valida y es la autoridad del cierre.
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(150px,1fr))", gap: sp.sm, marginBottom: sp.md }}>
              <M l="Peso neto" v={`${formatNum(neto, 1)} kg`} />
              <M l="Kg en lotes (ledger)" v={`${formatNum(lotesKg, 1)} kg`} />
              <M l="Diferencia" v={`${dif > 0 ? "+" : ""}${formatNum(dif, 1)} kg`} tono={dentro ? C.success : C.danger} />
              <M l="Tolerancia" v={tolAbs != null ? `${formatNum(tolAbs, 1)} kg (${formatNum(tolPct, 2)}%)` : "—"} />
              <M l="Estado" v={dentro ? "Cuadra" : "Descuadre"} tono={dentro ? C.success : C.danger} />
            </div>
            {!dentro && !sinLotes && <div style={{ color: C.danger, fontSize: 12.5, marginBottom: sp.sm }}>Los kilos de los lotes no cuadran con el peso neto. Corregí o ajustá los lotes antes de finalizar.</div>}
            {sinLotes && <div style={{ color: C.warning, fontSize: 12.5, marginBottom: sp.sm }}>Esta recepción todavía no tiene lotes: agregá al menos uno para poder finalizar.</div>}
            {puede && <div style={{ display: "flex", gap: sp.sm, justifyContent: "flex-end", flexWrap: "wrap" }}>
              {/* NR-05: reanudar el borrador para agregar lotes pendientes (lotes ya persistidos se cargan read-only) */}
              <ProcButton kind="ghost" onClick={() => ir("recepcion_nueva", { recepcion_id: id })}>Continuar (agregar lotes)</ProcButton>
              <ProcButton onClick={finalizar} disabled={cerrando || sinLotes}>{cerrando ? "Finalizando…" : "Finalizar recepción"}</ProcButton>
            </div>}
          </Seccion>
        );
      })()}

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
        {lotes.length > 0 && (() => {
          const rq = resumenQcRecepcion(lotes, qcRows);
          const Item = ({ n, l, tono }) => <span style={{ fontSize: 13, fontWeight: 700, color: tono || C.text }}>{l}: {n}</span>;
          return (
            <div style={{ display: "flex", gap: sp.lg, flexWrap: "wrap", alignItems: "center", padding: "8px 12px", background: C.cardAlt, borderRadius: 8, marginBottom: sp.md }}>
              <span style={{ fontSize: 12, fontWeight: 800, color: C.muted, textTransform: "uppercase", letterSpacing: .3 }}>QC recepción</span>
              <Item l="Lotes" n={rq.total} />
              <Item l="✓ aprobados" n={rq.aprobados} tono={C.success} />
              {rq.condicional > 0 && <Item l="~ condicional" n={rq.condicional} tono={C.warning} />}
              <Item l="✕ rechazados" n={rq.rechazados} tono={rq.rechazados > 0 ? C.danger : C.text} />
              <Item l="pendientes" n={rq.pendientes} tono={rq.pendientes > 0 ? C.warning : C.text} />
              {rq.mixto && <ProcStatusBadge texto="QC mixto" tono="warning" />}
            </div>
          );
        })()}
        {lotes.length > 0 ? (() => {
          const qcEst = qcPorLote(lotes, qcRows);
          const editableQc = puedeEditar("recepciones") || puedeEditar("centro");
          const sel = lotes.find((l) => l.id === selLoteQc) || null;
          return (
            <>
              <div style={{ fontSize: 12, color: C.muted, marginBottom: sp.sm }}>Cada lote tiene su propio QC (por especie del lote). Si un lote no tiene QC propio, aplica el QC general de la recepción (fallback).</div>
              <ProcDataTable
                columnas={[
                  { titulo: "Lote", render: (x) => <b>{x.lote.codigo}</b> },
                  { titulo: "Especie", render: (x) => x.lote.especie_codigo || "—" },
                  { titulo: "QC", render: (x) => x.resultado ? <ProcStatusBadge estado={x.resultado} /> : <ProcStatusBadge texto="sin QC" tono="neutral" /> },
                  { titulo: "Origen QC", render: (x) => x.esHeader ? "recepción (fallback)" : x.tieneQc ? "lote" : "—" },
                  ...(editableQc ? [{ titulo: "", align: "right", render: (x) => <ProcButton kind="ghost" small onClick={() => setSelLoteQc(x.lote.id === selLoteQc ? "" : x.lote.id)}>{x.lote.id === selLoteQc ? "Cerrar" : "Registrar QC"}</ProcButton> }] : []),
                ]}
                filas={qcEst} rowKey="id" />
              {sel && (
                <div style={{ marginTop: sp.md, padding: sp.md, border: `1px solid ${C.border}`, borderRadius: 8 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: sp.sm }}>QC del lote {sel.codigo} · {sel.especie_codigo || "—"}</div>
                  <QcPanel especie={sel.especie_codigo} recepcionId={id} loteId={sel.id} editable={editableQc} onGuardado={() => cargar()} />
                </div>
              )}
              <details style={{ marginTop: sp.md }}>
                <summary style={{ cursor: "pointer", fontSize: 12.5, color: C.muted }}>QC general de la recepción (fallback header)</summary>
                <div style={{ marginTop: sp.sm }}>
                  <QcPanel especie={r.especie_codigo} recepcionId={id} editable={editableQc} onGuardado={() => cargar()} />
                </div>
              </details>
            </>
          );
        })() : (
          <QcPanel especie={r.especie_codigo} recepcionId={id} editable={puedeEditar("recepciones") || puedeEditar("centro")} onGuardado={cargar} />
        )}
      </Seccion>

      <Seccion titulo={`Lotes / orígenes (${lotes.length})`}>
        <div style={{ fontSize: 12, color: C.muted, marginBottom: sp.sm }}>Una recepción física puede generar varios lotes de distinto origen agrícola.</div>
        <ProcDataTable
          columnas={[
            { titulo: "Código", render: (l) => <b>{l.codigo}</b> },
            { titulo: "Productor", render: (l) => loteSinOrigen(l) ? <span style={{ color: C.muted2, fontStyle: "italic" }}>Origen no informado</span> : (normalizarNombre(l.productor) || "—") },
            { titulo: "Predio", render: (l) => loteSinOrigen(l) ? "" : (normalizarNombre(l.predio) || "—") },
            { titulo: "Cuartel", render: (l) => loteSinOrigen(l) ? "" : (l.cuartel || "—") },
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
