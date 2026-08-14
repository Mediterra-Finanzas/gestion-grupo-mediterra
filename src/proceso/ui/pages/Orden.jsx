/* eslint-disable */
// src/proceso/ui/pages/Orden.jsx — mesa de control de una orden de proceso.
// Cabecera + acciones (máquina de estados backend) · insumos (consumo N:M de
// lotes ELEGIBLES, gate QC visible) · resultado/descarte/merma · conciliación.
// UI delgada: consumo/conciliación/cierre los decide backend; React presenta.
import React, { useEffect, useState, useCallback } from "react";
import { useService } from "../hooks/useServiceContext";
import {
  cargarOrdenPorId, cargarInsumosOrden, cargarLotesOperacionales, consumirLoteEnOrden, conciliarOrden,
  cambiarEstadoOrden, crearResultado, crearDescarte, crearMerma,
  cargarResultadosOrden, cargarDescartesOrden, cargarMermasOrden,
  cargarCategorias, cargarCalibresEspecie, cargarColoresEspecie, cargarMotivosDescarte, cargarMotivosMerma,
} from "../../core/procesoF7DB";
import { traducirError, resumenConciliacion, accionesOrden, ordenTerminal, faltaParaCerrar } from "../../core/procesoF7Domain";
import {
  ProcPageHeader, ProcCard, ProcButton, ProcStatusBadge, ProcDataTable, ProcModal, ProcField, inputStyle,
  ProcKpiCard, ProcLoadingState, ProcErrorState, ProcEmptyState,
} from "../components/base";
import { C, sp } from "../estilos";
import { formatKg, formatNum, formatFecha, formatFechaHora } from "../format";

const kg = (n) => formatKg(n);
function Dato({ l, v }) { return <div><div style={{ fontSize: 11, color: C.muted, fontWeight: 600 }}>{l}</div><div style={{ fontSize: 14, color: C.text }}>{v ?? "—"}</div></div>; }
function Seccion({ titulo, extra, children }) {
  return <ProcCard style={{ padding: sp.lg, marginBottom: sp.md }}>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: sp.md, flexWrap: "wrap", gap: sp.sm }}>
      <div style={{ fontSize: 15, fontWeight: 800, color: C.text }}>{titulo}</div>{extra}
    </div>{children}</ProcCard>;
}

export default function Orden() {
  const { empresa, ir, vista, puedeEditar, notificar } = useService();
  const id = vista?.params?.id;
  const [o, setO] = useState(null);
  const [insumos, setInsumos] = useState([]);
  const [lotesMap, setLotesMap] = useState({});
  const [res, setRes] = useState([]); const [desc, setDesc] = useState([]); const [mer, setMer] = useState([]);
  const [cats, setCats] = useState([]); const [cals, setCals] = useState([]); const [cols, setCols] = useState([]);
  const [mdes, setMdes] = useState([]); const [mmer, setMmer] = useState([]);
  const [estado, setEstado] = useState("loading"); const [error, setError] = useState(null);
  const [selLote, setSelLote] = useState(false);
  const [nr, setNr] = useState({ categoria_id: "", calibre_id: "", color_id: "", kg: "" });
  const [nd, setNd] = useState({ motivo_descarte_id: "", kg: "" });
  const [nm, setNm] = useState({ motivo_merma_id: "", kg: "" });

  const editPerm = puedeEditar("ordenes") || puedeEditar("centro");

  const cargar = useCallback(async () => {
    if (!empresa || !id) return;
    setEstado("loading"); setError(null);
    try {
      const ord = (await cargarOrdenPorId(empresa, id))[0];
      if (!ord) { setError("Orden no encontrada"); setEstado("error"); return; }
      const [ins, resu, desc_, mer_, lotesOp] = await Promise.all([
        cargarInsumosOrden(empresa, id), cargarResultadosOrden(empresa, id),
        cargarDescartesOrden(empresa, id), cargarMermasOrden(empresa, id),
        cargarLotesOperacionales(empresa, ord.especie_codigo ? `&especie_codigo=eq.${ord.especie_codigo}` : ""),
      ]);
      setO(ord); setInsumos(ins || []); setRes(resu || []); setDesc(desc_ || []); setMer(mer_ || []);
      const map = {}; (lotesOp || []).forEach((l) => { map[l.id] = l; }); setLotesMap(map);
      // catálogos de captura (una vez por especie)
      const [c1, c2, c3, c4, c5] = await Promise.all([
        cargarCategorias(empresa), cargarCalibresEspecie(empresa, ord.especie_codigo || ""),
        cargarColoresEspecie(empresa, ord.especie_codigo || ""), cargarMotivosDescarte(empresa), cargarMotivosMerma(empresa),
      ]);
      setCats(c1 || []); setCals(c2 || []); setCols(c3 || []); setMdes(c4 || []); setMmer(c5 || []);
      setEstado("ok");
    } catch (e) { setError(traducirError(e)); setEstado("error"); }
  }, [empresa, id]);
  useEffect(() => { cargar(); }, [cargar]);

  if (estado === "loading") return <ProcLoadingState />;
  if (estado === "error") return <ProcErrorState error={error} onRetry={cargar} />;
  if (!o) return <ProcEmptyState titulo="Orden no encontrada" />;

  const terminal = ordenTerminal(o.estado);
  const puedeConsumir = editPerm && o.estado === "en_proceso";
  const puedeResultado = editPerm && ["en_proceso", "pendiente_conciliacion"].includes(o.estado);
  const conc = resumenConciliacion({ entrada: o.kg_entrada, comercial: o.kg_resultado, descarte: o.kg_descarte, merma: o.kg_merma, tolerancia: o.tolerancia });
  const falta = faltaParaCerrar({ estado: o.estado, entrada: o.kg_entrada, comercial: o.kg_resultado, descarte: o.kg_descarte, merma: o.kg_merma, tolerancia: o.tolerancia });

  const accion = async (a) => {
    try {
      if (a.rpc) await conciliarOrden({ empresaId: empresa, ordenId: id });
      else await cambiarEstadoOrden(empresa, id, a.a);
      notificar(a.l + " ✓"); cargar();
    } catch (e) { notificar(traducirError(e), "error"); }
  };
  const addResultado = async () => {
    if (!(Number(nr.kg) > 0)) return notificar("Kg debe ser > 0", "error");
    try { await crearResultado({ empresa_id: empresa, orden_id: id, categoria_id: nr.categoria_id || null, calibre_id: nr.calibre_id || null, color_id: nr.color_id || null, kg: Number(nr.kg) });
      setNr({ categoria_id: "", calibre_id: "", color_id: "", kg: "" }); cargar(); } catch (e) { notificar(traducirError(e), "error"); }
  };
  const addDescarte = async () => {
    if (!nd.motivo_descarte_id || !(Number(nd.kg) > 0)) return notificar("Motivo y kg requeridos", "error");
    try { await crearDescarte({ empresa_id: empresa, orden_id: id, motivo_descarte_id: nd.motivo_descarte_id, kg: Number(nd.kg) }); setNd({ motivo_descarte_id: "", kg: "" }); cargar(); } catch (e) { notificar(traducirError(e), "error"); }
  };
  const addMerma = async () => {
    if (!nm.motivo_merma_id || !(Number(nm.kg) > 0)) return notificar("Motivo y kg requeridos", "error");
    try { await crearMerma({ empresa_id: empresa, orden_id: id, motivo_merma_id: nm.motivo_merma_id, kg: Number(nm.kg) }); setNm({ motivo_merma_id: "", kg: "" }); cargar(); } catch (e) { notificar(traducirError(e), "error"); }
  };

  const nombreCat = (idc) => (cats.find((c) => c.id === idc) || {}).nombre || "—";

  return (
    <div>
      <ProcPageHeader titulo={`Orden ${o.folio}`} subtitulo="Mesa de control de proceso"
        acciones={<ProcButton kind="ghost" onClick={() => ir("ordenes")}>← Órdenes</ProcButton>} />

      <Seccion titulo="Cabecera" extra={<ProcStatusBadge estado={o.estado} />}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(140px,1fr))", gap: sp.md }}>
          <Dato l="Folio" v={o.folio} /><Dato l="Cliente" v={o.cliente} /><Dato l="Especie / variedad" v={`${o.especie_codigo || "—"} ${o.variedad_codigo || ""}`} />
          <Dato l="Línea" v={o.linea} /><Dato l="Turno" v={o.turno} />
        </div>
        {editPerm && !terminal && (
          <div style={{ display: "flex", gap: sp.sm, marginTop: sp.md, flexWrap: "wrap" }}>
            {accionesOrden(o.estado).map((a) => (
              <ProcButton key={a.a} kind={a.a === "cerrado" || a.a === "conciliado" ? "success" : a.a === "anulado" ? "danger" : "primary"}
                onClick={() => accion(a)} disabled={a.rpc && !conc.cuadra}>{a.l}</ProcButton>
            ))}
            {falta && <span style={{ color: C.warning, fontSize: 12.5, alignSelf: "center", fontWeight: 600 }}>⚠ {falta}</span>}
          </div>
        )}
        {terminal && <div style={{ marginTop: sp.sm, color: C.muted, fontSize: 12.5 }}>Orden en estado terminal: solo lectura.</div>}
      </Seccion>

      <Seccion titulo={`Insumos · consumo (${insumos.length})`}
        extra={puedeConsumir ? <ProcButton onClick={() => setSelLote(true)}>+ Agregar lote</ProcButton> : null}>
        <ProcDataTable
          columnas={[
            { titulo: "Lote", render: (i) => <b>{(lotesMap[i.lote_id] || {}).codigo || i.lote_id.slice(0, 8)}</b> },
            { titulo: "Productor", render: (i) => (lotesMap[i.lote_id] || {}).productor || "—" },
            { titulo: "Recepción", render: (i) => (lotesMap[i.lote_id] || {}).recepcion_folio || "—" },
            { titulo: "QC", render: (i) => { const l = lotesMap[i.lote_id]; return l && l.qc_resultado ? <ProcStatusBadge estado={l.qc_resultado} /> : "—"; } },
            { titulo: "Kg consumido", align: "right", render: (i) => kg(i.kg) },
          ]}
          filas={insumos} rowKey="id"
          vacio={<ProcEmptyState icono="📦" titulo="Sin insumos" detalle={puedeConsumir ? "Agregá lotes elegibles para consumir." : "Esta orden no consumió lotes."} />} />
      </Seccion>

      <Seccion titulo="Resultado comercial">
        {puedeResultado && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 100px auto", gap: sp.sm, alignItems: "end", marginBottom: sp.md }}>
            <ProcField label="Categoría"><select style={inputStyle} value={nr.categoria_id} onChange={(e) => setNr((x) => ({ ...x, categoria_id: e.target.value }))}><option value="">—</option>{cats.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}</select></ProcField>
            <ProcField label="Calibre"><select style={inputStyle} value={nr.calibre_id} onChange={(e) => setNr((x) => ({ ...x, calibre_id: e.target.value }))}><option value="">—</option>{cals.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}</select></ProcField>
            <ProcField label="Color"><select style={inputStyle} value={nr.color_id} onChange={(e) => setNr((x) => ({ ...x, color_id: e.target.value }))}><option value="">—</option>{cols.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}</select></ProcField>
            <ProcField label="Kg"><input style={inputStyle} type="number" value={nr.kg} onChange={(e) => setNr((x) => ({ ...x, kg: e.target.value }))} /></ProcField>
            <ProcButton onClick={addResultado}>+ Agregar</ProcButton>
          </div>
        )}
        <ProcDataTable
          columnas={[
            { titulo: "Categoría", render: (r) => nombreCat(r.categoria_id) },
            { titulo: "Calibre", render: (r) => (cals.find((c) => c.id === r.calibre_id) || {}).nombre || "—" },
            { titulo: "Color", render: (r) => (cols.find((c) => c.id === r.color_id) || {}).nombre || "—" },
            { titulo: "Kg", align: "right", render: (r) => kg(r.kg) },
          ]}
          filas={res} rowKey="id" vacio={<ProcEmptyState titulo="Sin resultado comercial" />} />
      </Seccion>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: sp.md }}>
        <Seccion titulo="Descarte / subproducto">
          {puedeResultado && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 90px auto", gap: sp.sm, alignItems: "end", marginBottom: sp.sm }}>
              <ProcField label="Motivo"><select style={inputStyle} value={nd.motivo_descarte_id} onChange={(e) => setNd((x) => ({ ...x, motivo_descarte_id: e.target.value }))}><option value="">—</option>{mdes.map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}</select></ProcField>
              <ProcField label="Kg"><input style={inputStyle} type="number" value={nd.kg} onChange={(e) => setNd((x) => ({ ...x, kg: e.target.value }))} /></ProcField>
              <ProcButton onClick={addDescarte}>+</ProcButton>
            </div>
          )}
          <ProcDataTable columnas={[{ titulo: "Motivo", render: (r) => (mdes.find((m) => m.id === r.motivo_descarte_id) || {}).nombre || "—" }, { titulo: "Kg", align: "right", render: (r) => kg(r.kg) }]} filas={desc} rowKey="id" vacio={<ProcEmptyState titulo="Sin descarte" />} />
        </Seccion>
        <Seccion titulo="Merma">
          {puedeResultado && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 90px auto", gap: sp.sm, alignItems: "end", marginBottom: sp.sm }}>
              <ProcField label="Motivo"><select style={inputStyle} value={nm.motivo_merma_id} onChange={(e) => setNm((x) => ({ ...x, motivo_merma_id: e.target.value }))}><option value="">—</option>{mmer.map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}</select></ProcField>
              <ProcField label="Kg"><input style={inputStyle} type="number" value={nm.kg} onChange={(e) => setNm((x) => ({ ...x, kg: e.target.value }))} /></ProcField>
              <ProcButton onClick={addMerma}>+</ProcButton>
            </div>
          )}
          <ProcDataTable columnas={[{ titulo: "Motivo", render: (r) => (mmer.find((m) => m.id === r.motivo_merma_id) || {}).nombre || "—" }, { titulo: "Kg", align: "right", render: (r) => kg(r.kg) }]} filas={mer} rowKey="id" vacio={<ProcEmptyState titulo="Sin merma" />} />
        </Seccion>
      </div>

      <Seccion titulo="Conciliación de masa" extra={<ProcStatusBadge texto={conc.cuadra ? "Cuadra" : "Descuadra"} tono={conc.cuadra ? "success" : "warning"} />}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(150px,1fr))", gap: sp.md }}>
          <ProcKpiCard label="Entrada" valor={kg(conc.entrada)} tono="info" />
          <ProcKpiCard label="Comercial" valor={kg(conc.comercial)} tono="success" />
          <ProcKpiCard label="Descarte" valor={kg(conc.descarte)} tono="warning" />
          <ProcKpiCard label="Merma" valor={kg(conc.merma)} tono="neutral" />
          <ProcKpiCard label="Diferencia" valor={kg(conc.diff)} tono={conc.cuadra ? "success" : "danger"} sub={`tolerancia ${kg(o.tolerancia)}`} />
          <ProcKpiCard label="Packout" valor={conc.packout != null ? `${(conc.packout * 100).toFixed(1)}%` : "—"} tono="primary" />
        </div>
      </Seccion>

      {selLote && <SelectorLote especie={o.especie_codigo} lotesMap={lotesMap} onClose={() => setSelLote(false)}
        onConsumir={async (loteId, kgv) => { try { await consumirLoteEnOrden({ empresaId: empresa, ordenId: id, loteId, kg: kgv }); notificar("Lote consumido ✓"); setSelLote(false); cargar(); } catch (e) { notificar(traducirError(e), "error"); } }} />}
    </div>
  );
}

// Selector de lotes: muestra elegibles seleccionables + no elegibles con motivo.
function SelectorLote({ especie, lotesMap, onClose, onConsumir }) {
  const lotes = Object.values(lotesMap).filter((l) => Number(l.disponible) > 0 || l.qc_resultado === "rechazado");
  const [sel, setSel] = useState(null);
  const [kgv, setKgv] = useState("");
  return (
    <ProcModal titulo={`Consumir lote (${especie || "—"})`} onClose={onClose} ancho={640}
      acciones={<><ProcButton kind="ghost" onClick={onClose}>Cerrar</ProcButton>
        <ProcButton disabled={!sel || !(Number(kgv) > 0)} onClick={() => onConsumir(sel, Number(kgv))}>Consumir</ProcButton></>}>
      {lotes.length === 0 ? <ProcEmptyState icono="📦" titulo="Sin lotes disponibles" detalle="No hay lotes con saldo para esta especie." /> :
        <div>
          <div style={{ maxHeight: 320, overflowY: "auto", border: `1px solid ${C.border}`, borderRadius: 8 }}>
            {lotes.map((l) => {
              const eleg = l.elegible === true || l.elegible === "true";
              return (
                <div key={l.id} onClick={() => eleg && setSel(l.id)} style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 10px",
                  borderBottom: `1px solid ${C.border}`, cursor: eleg ? "pointer" : "not-allowed",
                  background: sel === l.id ? C.infoBg : (eleg ? C.card : C.cardAlt), opacity: eleg ? 1 : 0.7,
                }}>
                  <div>
                    <b style={{ fontSize: 13 }}>{l.codigo}</b>
                    <span style={{ color: C.muted, fontSize: 12 }}> · {l.productor || "—"} · disp {formatNum(l.disponible)} kg</span>
                  </div>
                  {eleg ? <ProcStatusBadge estado={l.qc_resultado || "disponible"} />
                        : <ProcStatusBadge texto={l.motivo_no_elegible || "no elegible"} tono="danger" />}
                </div>
              );
            })}
          </div>
          <div style={{ display: "flex", gap: sp.sm, alignItems: "end", marginTop: sp.md }}>
            <ProcField label="Kg a consumir"><input style={inputStyle} type="number" value={kgv} onChange={(e) => setKgv(e.target.value)} /></ProcField>
          </div>
          <div style={{ fontSize: 11.5, color: C.muted2, marginTop: 4 }}>Los lotes no elegibles (QC) no son seleccionables; el backend rechaza cualquier intento de consumo.</div>
        </div>}
    </ProcModal>
  );
}
