/* eslint-disable */
// src/proceso/ui/pages/PalletDetalle.jsx — pallet como objeto de 1ª clase:
// identificación, saldos (ledger=SoT), composición (proc_pallet_linea),
// genealogía backwards/forwards, holds, movimientos, traslado. No edita ledger.
import React, { useEffect, useState, useCallback } from "react";
import { useService } from "../hooks/useServiceContext";
import {
  cargarPalletBodegaPorId, cargarLineasPallet, cargarHoldsPallet, cargarMovimientosObjeto,
  palletGenealogia, trasladarPallet, holdPallet, liberarHold, cargarUbicacionesActivas, cargarPtCodigos,
} from "../../core/procesoF7DB";
import { traducirError } from "../../core/procesoF7Domain";
import {
  ProcPageHeader, ProcCard, ProcButton, ProcStatusBadge, ProcKpiCard, ProcDataTable, ProcModal, ProcField, inputStyle,
  ProcAuditInfo, ProcLoadingState, ProcErrorState, ProcEmptyState,
} from "../components/base";
import { C, sp } from "../estilos";
import { formatKg, formatNum, formatFecha, formatFechaHora, normalizarNombre } from "../format";

const kg = (n) => formatKg(n);
function Dato({ l, v }) { return <div><div style={{ fontSize: 11, color: C.muted, fontWeight: 600 }}>{l}</div><div style={{ fontSize: 14, color: C.text }}>{v ?? "—"}</div></div>; }
function Seccion({ titulo, extra, children }) {
  return <ProcCard style={{ padding: sp.lg, marginBottom: sp.md }}>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: sp.md, flexWrap: "wrap", gap: sp.sm }}>
      <div style={{ fontSize: 15, fontWeight: 800, color: C.text }}>{titulo}</div>{extra}
    </div>{children}</ProcCard>;
}

export default function PalletDetalle() {
  const { empresa, planta, ir, vista, puedeEditar, notificar } = useService();
  const id = vista?.params?.id;
  const [p, setP] = useState(null); const [lineas, setLineas] = useState([]); const [holds, setHolds] = useState([]);
  const [ptMap, setPtMap] = useState({});
  const [movs, setMovs] = useState([]); const [gen, setGen] = useState(null); const [ubis, setUbis] = useState([]);
  const [estado, setEstado] = useState("loading"); const [error, setError] = useState(null);
  const [traslado, setTraslado] = useState(false); const [udst, setUdst] = useState("");
  const [holdForm, setHoldForm] = useState(null);
  const editable = puedeEditar("pt") || puedeEditar("centro");

  const cargar = useCallback(async () => {
    if (!empresa || !id) return;
    setEstado("loading"); setError(null);
    try {
      const [b, ln, h, m, g, u] = await Promise.all([
        cargarPalletBodegaPorId(empresa, id), cargarLineasPallet(empresa, id), cargarHoldsPallet(empresa, id),
        cargarMovimientosObjeto(empresa, id), palletGenealogia(empresa, id), cargarUbicacionesActivas(empresa, planta),
      ]);
      setP((b && b[0]) || null); setLineas(ln || []); setHolds(h || []); setMovs(m || []);
      setGen(Array.isArray(g) ? g[0] : g); setUbis(u || []); setEstado("ok");
      // referencia humana del PT (barcode) en vez del UUID
      const ptIds = [...new Set((ln || []).map((x) => x.pt_id).filter(Boolean))];
      cargarPtCodigos(empresa, ptIds).then((pts) => setPtMap(Object.fromEntries((pts || []).map((x) => [x.id, x.codigo])))).catch(() => {});
    } catch (e) { setError(traducirError(e)); setEstado("error"); }
  }, [empresa, id, planta]);
  useEffect(() => { cargar(); }, [cargar]);

  if (estado === "loading") return <ProcLoadingState />;
  if (estado === "error") return <ProcErrorState error={error} onRetry={cargar} />;
  if (!p) return <ProcEmptyState titulo="Pallet no encontrado" />;

  const doTraslado = async () => {
    if (!udst) return notificar("Elegí destino", "error");
    try { await trasladarPallet({ empresaId: empresa, palletId: id, ubicDestino: udst }); notificar("Trasladado ✓"); setTraslado(false); cargar(); } catch (e) { notificar(traducirError(e), "error"); }
  };
  const doHold = async () => {
    if (!(Number(holdForm.cantidad) > 0)) return notificar("Cantidad > 0", "error");
    try { await holdPallet({ empresaId: empresa, palletId: id, tipo: holdForm.tipo, cantidad: Number(holdForm.cantidad), motivo: holdForm.motivo || null }); notificar("Hold aplicado ✓"); setHoldForm(null); cargar(); } catch (e) { notificar(traducirError(e), "error"); }
  };
  const doLiberar = async (hid) => { try { await liberarHold({ empresaId: empresa, holdId: hid }); notificar("Hold liberado ✓"); cargar(); } catch (e) { notificar(traducirError(e), "error"); } };

  const back = (gen && gen.backwards) || []; const lotesOrigen = (gen && gen.lotes_origen) || []; const fwd = (gen && gen.forwards) || [];

  return (
    <div>
      <ProcPageHeader titulo={`Pallet ${p.codigo}`} subtitulo="Detalle y trazabilidad"
        acciones={<>
          <ProcButton kind="ghost" onClick={() => ir("bodega")}>← Bodega</ProcButton>
          <ProcButton kind="ghost" onClick={() => notificar("Impresión de etiqueta: se implementa en fase de barcode/QR")}>Imprimir etiqueta</ProcButton>
          {editable && <ProcButton kind="ghost" onClick={() => setTraslado(true)}>Trasladar</ProcButton>}
          {editable && <ProcButton kind="ghost" onClick={() => setHoldForm({ tipo: "reserva", cantidad: "", motivo: "" })}>Reservar/Bloquear</ProcButton>}
          {editable && <ProcButton kind="ghost" onClick={() => ir("repaletizaje", { origen: id })}>Repaletizar</ProcButton>}
        </>} />

      <Seccion titulo="Identificación" extra={<ProcStatusBadge estado={p.estado} />}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(140px,1fr))", gap: sp.md }}>
          <Dato l="Código" v={p.codigo} /><Dato l="Especie" v={p.especie_codigo} /><Dato l="Formato" v={p.formato} />
          <Dato l="Cliente" v={normalizarNombre(p.cliente)} /><Dato l="Ubicación" v={p.ubicacion} /><Dato l="Temporada" v={p.temporada_codigo} />
        </div>
      </Seccion>

      <Seccion titulo="Saldos (ledger = SoT) · invariante Σ líneas = físico">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(150px,1fr))", gap: sp.md }}>
          <ProcKpiCard label="Físico" valor={kg(p.kg_fisico)} tono="success" />
          <ProcKpiCard label="Composición (líneas)" valor={kg(p.kg_composicion)} tono={Number(p.kg_composicion) === Number(p.kg_fisico) ? "success" : "danger"} sub={`${p.cajas} cajas`} />
          <ProcKpiCard label="Reservado" valor={kg(p.reservado)} tono="warning" />
          <ProcKpiCard label="Bloqueado" valor={kg(p.bloqueado)} tono="danger" />
          <ProcKpiCard label="Libre" valor={kg(p.disponible)} tono="primary" />
        </div>
      </Seccion>

      <Seccion titulo={`Composición (${lineas.length} líneas)`}>
        <ProcDataTable columnas={[
          { titulo: "PT", render: (l) => ptMap[l.pt_id] || "—" },
          { titulo: "Cajas", align: "right", campo: "cajas" }, { titulo: "Kg", align: "right", render: (l) => kg(l.kg) },
          { titulo: "Estado", render: (l) => <ProcStatusBadge estado={l.estado} /> },
        ]} filas={lineas} rowKey="id" vacio={<ProcEmptyState titulo="Sin composición" />} />
      </Seccion>

      <Seccion titulo="Genealogía">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: sp.lg }}>
          <div>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: C.muted, marginBottom: 6 }}>⟵ De dónde proviene</div>
            {back.length === 0 && lotesOrigen.length === 0 ? <div style={{ color: C.muted2, fontSize: 13 }}>—</div> : (
              <div style={{ fontSize: 13 }}>
                {back.map((b, i) => <div key={i} style={{ marginBottom: 4 }}>Orden <b>{b.orden}</b> · {b.especie} {b.calibre || ""} {b.categoria ? `· ${b.categoria}` : ""}</div>)}
                {lotesOrigen.map((l, i) => <div key={"l" + i} style={{ color: C.muted, marginLeft: 12 }}>Lote {l.lote} · Rec {l.recepcion} · {normalizarNombre(l.productor) || "—"}</div>)}
              </div>
            )}
          </div>
          <div>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: C.muted, marginBottom: 6 }}>⟶ En qué terminó (repaletizaje)</div>
            {fwd.length === 0 ? <div style={{ color: C.muted2, fontSize: 13 }}>Sin repaletizajes posteriores</div> :
              fwd.map((f, i) => <div key={i} style={{ fontSize: 13, marginBottom: 4 }}>Pallet <b>{f.pallet}</b> <span style={{ color: C.muted2 }}>(gen {f.generacion})</span></div>)}
          </div>
        </div>
      </Seccion>

      <Seccion titulo={`Holds (${holds.length})`}>
        <ProcDataTable columnas={[
          { titulo: "Tipo", render: (h) => <ProcStatusBadge texto={h.tipo} tono={h.tipo === "bloqueo" ? "danger" : "warning"} /> },
          { titulo: "Cantidad", align: "right", render: (h) => kg(h.cantidad) },
          { titulo: "Motivo", campo: "motivo" },
          { titulo: "Estado", render: (h) => <ProcStatusBadge estado={h.estado === "activo" ? "activa" : "consumida"} texto={h.estado} /> },
          { titulo: "", align: "right", render: (h) => editable && h.estado === "activo" ? <ProcButton kind="ghost" small onClick={() => doLiberar(h.id)}>Liberar</ProcButton> : null },
        ]} filas={holds} rowKey="id" vacio={<ProcEmptyState titulo="Sin holds" detalle="El pallet no tiene reservas ni bloqueos." />} />
      </Seccion>

      <Seccion titulo={`Movimientos (${movs.length})`}>
        <ProcDataTable columnas={[
          { titulo: "Fecha", render: (m) => formatFechaHora(m.fecha || m.created_at) },
          { titulo: "Tipo", campo: "tipo_movimiento" },
          { titulo: "Naturaleza", render: (m) => <ProcStatusBadge texto={m.naturaleza} tono={m.naturaleza === "entrada" ? "success" : m.naturaleza === "salida" ? "danger" : "neutral"} /> },
          { titulo: "Cantidad", align: "right", render: (m) => kg(m.cantidad) },
          { titulo: "Ref", campo: "ref_tipo" },
        ]} filas={movs} rowKey="id" vacio={<ProcEmptyState titulo="Sin movimientos" />} />
      </Seccion>

      <Seccion titulo="Auditoría"><ProcAuditInfo registro={p} /></Seccion>

      {traslado && (
        <ProcModal titulo="Trasladar pallet" onClose={() => setTraslado(false)}
          acciones={<><ProcButton kind="ghost" onClick={() => setTraslado(false)}>Cancelar</ProcButton><ProcButton onClick={doTraslado}>Trasladar</ProcButton></>}>
          <div style={{ fontSize: 12.5, color: C.muted, marginBottom: sp.sm }}>El traslado no altera el stock físico total; solo la ubicación (queda en ledger).</div>
          <ProcField label="Ubicación destino"><select style={inputStyle} value={udst} onChange={(e) => setUdst(e.target.value)}><option value="">—</option>{ubis.filter((u) => u.id !== p.ubicacion_id).map((u) => <option key={u.id} value={u.id}>{u.nombre || u.codigo}</option>)}</select></ProcField>
        </ProcModal>
      )}
      {holdForm && (
        <ProcModal titulo="Reservar / Bloquear" onClose={() => setHoldForm(null)}
          acciones={<><ProcButton kind="ghost" onClick={() => setHoldForm(null)}>Cancelar</ProcButton><ProcButton onClick={doHold}>Aplicar</ProcButton></>}>
          <div style={{ fontSize: 12.5, color: C.muted, marginBottom: sp.sm }}>Un hold no cambia stock físico; reduce lo disponible. Libre actual: <b>{kg(p.disponible)}</b></div>
          <ProcField label="Tipo"><select style={inputStyle} value={holdForm.tipo} onChange={(e) => setHoldForm((x) => ({ ...x, tipo: e.target.value }))}><option value="reserva">Reserva</option><option value="bloqueo">Bloqueo</option></select></ProcField>
          <ProcField label="Cantidad (kg)"><input style={inputStyle} type="number" value={holdForm.cantidad} onChange={(e) => setHoldForm((x) => ({ ...x, cantidad: e.target.value }))} /></ProcField>
          <ProcField label="Motivo"><input style={inputStyle} value={holdForm.motivo} onChange={(e) => setHoldForm((x) => ({ ...x, motivo: e.target.value }))} /></ProcField>
        </ProcModal>
      )}
    </div>
  );
}
