/* eslint-disable */
// src/proceso/ui/pages/ServiciosFacturables.jsx — hechos facturables (motor F6).
// Cada fila = hecho operacional real + regla tarifaria. Muestra cantidad × tarifa
// = monto (auditable), la tarifa SNAPSHOT usada, y traza al hecho de origen.
// Falta de tarifa => estado "pendiente de tarifa", NUNCA $0.
import React, { useEffect, useState, useCallback } from "react";
import { useService } from "../hooks/useServiceContext";
import {
  cargarServiciosFacturables, cargarTipoServicio, cargarVinculosPorRol,
  cargarOrdenesFacturables, generarServicioProceso, generarServicioManual,
} from "../../core/procesoF7DB";
import { traducirError, badgeDe, montoServicio } from "../../core/procesoF7Domain";
import {
  ProcPageHeader, ProcButton, ProcCard, ProcDataTable, ProcStatusBadge, ProcModal, ProcField, inputStyle,
  ProcLoadingState, ProcErrorState, ProcEmptyState, ProcFilters,
} from "../components/base";
import { C, sp } from "../estilos";
import { formatNum, formatTarifa, formatMoneda, formatFecha, normalizarNombre } from "../format";

const UNIDADES = ["kg_procesado", "caja", "pallet", "evento", "dia", "pallet_dia", "kg_dia", "camara_dia", "hora", "unidad", "monto_fijo"];
const MONEDAS = ["USD", "CLP", "EUR", "PEN"];
const ESTADOS = ["generado", "pendiente_tarifa", "valorizado", "revisado", "facturable", "anulado"];

// vista fija opcional para la bandeja "Pendientes de tarifa"
export default function ServiciosFacturables({ soloPendientes = false }) {
  const { empresa, fecha, ir, puedeEditar, notificar, usuario } = useService();
  const [rows, setRows] = useState([]);
  const [tipos, setTipos] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [estado, setEstado] = useState("idle");
  const [error, setError] = useState(null);
  const [fEstado, setFEstado] = useState("");
  const [fMoneda, setFMoneda] = useState("");
  const [fOrigen, setFOrigen] = useState("");
  const [fTexto, setFTexto] = useState("");
  const [genOrden, setGenOrden] = useState(null);   // modal generar de orden
  const [ordenes, setOrdenes] = useState([]);
  const [genManual, setGenManual] = useState(null); // modal manual
  const [detalle, setDetalle] = useState(null);     // drawer detalle

  const editable = puedeEditar("servicios") || puedeEditar("centro");

  const cargar = useCallback(async () => {
    if (!empresa) { setEstado("idle"); return; }
    setEstado("loading"); setError(null);
    try {
      let extra = "";
      if (soloPendientes) extra += "&estado=eq.pendiente_tarifa";
      else if (fEstado) extra += `&estado=eq.${fEstado}`;
      if (fMoneda) extra += `&moneda=eq.${fMoneda}`;
      if (fOrigen) extra += `&origen_tipo=eq.${fOrigen}`;
      const [s, ts, cli] = await Promise.all([
        cargarServiciosFacturables(empresa, extra), cargarTipoServicio(empresa), cargarVinculosPorRol(empresa, "cliente_servicio"),
      ]);
      setRows(s); setTipos(ts); setClientes(cli); setEstado("ok");
    } catch (e) { setError(traducirError(e)); setEstado("error"); }
  }, [empresa, soloPendientes, fEstado, fMoneda, fOrigen]);
  useEffect(() => { cargar(); }, [cargar]);

  const filtradas = rows.filter((s) => !fTexto ||
    [s.servicio_nombre, s.cliente, s.referencia].join(" ").toLowerCase().includes(fTexto.toLowerCase()));

  const abrirGenOrden = async () => {
    setGenOrden({ orden_id: "", tipo_servicio_id: "" });
    try { setOrdenes(await cargarOrdenesFacturables(empresa)); } catch (e) { notificar(traducirError(e), "error"); }
  };
  const generarDeOrden = async () => {
    const o = ordenes.find((x) => x.id === genOrden.orden_id);
    if (!o) return notificar("Elegí una orden", "error");
    if (!o.cliente_vinculo_id) return notificar("La orden no tiene cliente de servicio asociado", "error");
    if (!genOrden.tipo_servicio_id) return notificar("Elegí el servicio", "error");
    try {
      await generarServicioProceso({ empresaId: empresa, ordenId: o.id, clienteId: o.cliente_vinculo_id, tipoServicioId: genOrden.tipo_servicio_id });
      setGenOrden(null); notificar("Servicio facturable generado"); cargar();
    } catch (e) { notificar(traducirError(e), "error"); }
  };

  const generarManual = async () => {
    const m = genManual;
    if (!m.cliente_vinculo_id) return notificar("Falta cliente", "error");
    if (!m.tipo_servicio_id) return notificar("Falta servicio", "error");
    if (m.cantidad === "" || Number(m.cantidad) < 0) return notificar("Cantidad inválida", "error");
    if (m.tarifa === "" || Number(m.tarifa) < 0) return notificar("Tarifa inválida", "error");
    if (!m.motivo || !m.autoriza) return notificar("Servicio manual exige motivo y autorización", "error");
    try {
      await generarServicioManual({
        empresaId: empresa, clienteId: m.cliente_vinculo_id, tipoServicioId: m.tipo_servicio_id,
        cantidad: Number(m.cantidad), unidad: m.unidad, tarifa: Number(m.tarifa), moneda: m.moneda || "USD",
        fecha: m.fecha || fecha, motivo: `${m.motivo} — Autorizó: ${m.autoriza}`,
        autorizadoPor: (window.crypto?.randomUUID?.() || "00000000-0000-0000-0000-000000000000"),
      });
      setGenManual(null); notificar("Servicio manual generado"); cargar();
    } catch (e) { notificar(traducirError(e), "error"); }
  };

  const irAlHecho = (s) => {
    if (s.origen_tipo === "orden" && s.orden_id) ir("orden", { id: s.orden_id });
    else if (s.origen_tipo === "pallet" && s.pallet_id) ir("pallet_detalle", { id: s.pallet_id });
    else notificar("Este hecho no tiene pantalla de detalle navegable (manual/repaletizaje).", "info");
  };

  const columnas = [
    { titulo: "Cliente", render: (s) => normalizarNombre(s.cliente) },
    { titulo: "Servicio", render: (s) => <span>{s.servicio_nombre}{s.es_manual ? <ProcStatusBadge texto="Manual" tono="purple" /> : null}</span> },
    { titulo: "Origen", render: (s) => <span style={{ fontSize: 12.5 }}>{s.referencia || "—"}<div style={{ fontSize: 10.5, color: C.muted2 }}>{s.origen_tipo}</div></span> },
    { titulo: "Fecha", render: (s) => formatFecha(s.fecha_hecho) },
    { titulo: "Cantidad", align: "right", render: (s) => <span>{formatNum(s.cantidad, 2)} <span style={{ color: C.muted2, fontSize: 11 }}>{s.unidad}</span></span> },
    { titulo: "Tarifa", align: "right", render: (s) => (s.tarifa_aplicada != null ? formatTarifa(s.tarifa_aplicada, s.moneda) : <span style={{ color: C.warning, fontWeight: 700 }}>sin tarifa</span>) },
    { titulo: "Monto", align: "right", render: (s) => (s.subtotal != null ? <b>{formatMoneda(s.subtotal, s.moneda)}</b> : <span style={{ color: C.warning }}>—</span>) },
    { titulo: "Estado", render: (s) => <ProcStatusBadge estado={s.estado} /> },
    { titulo: "", align: "right", render: (s) => <ProcButton kind="ghost" small onClick={() => setDetalle(s)}>Ver</ProcButton> },
  ];

  if (!empresa) return <div><ProcPageHeader titulo={soloPendientes ? "Pendientes de Tarifa" : "Servicios Facturables"} /><ProcCard style={{ padding: sp.lg }}><ProcEmptyState icono="🧾" titulo="Seleccioná un tenant" /></ProcCard></div>;

  return (
    <div>
      <ProcPageHeader titulo={soloPendientes ? "Pendientes de Tarifa" : "Servicios Facturables"}
        subtitulo={soloPendientes ? "Hechos sin tarifa vigente — resolver antes de cobrar (no son $0)" : "Qué se debe cobrar, por qué servicio, sobre qué cantidad y a qué tarifa"}
        acciones={editable && !soloPendientes ? <div style={{ display: "flex", gap: sp.sm }}>
          <ProcButton kind="ghost" onClick={() => setGenManual({ moneda: "USD", unidad: "evento", fecha })}>+ Manual</ProcButton>
          <ProcButton onClick={abrirGenOrden}>+ Desde orden</ProcButton>
        </div> : null} />

      {soloPendientes && (
        <div style={{ padding: sp.md, borderRadius: 10, background: C.warningBg, border: `1px solid ${C.warning}33`, color: C.text, fontSize: 13, marginBottom: sp.md }}>
          Estos hechos ocurrieron pero <b>no encontraron tarifa vigente</b>. No se cobran en $0 ni se ocultan. Cargá la tarifa faltante en <b>Tarifario</b> y luego revalorizá el hecho desde el detalle.
        </div>
      )}

      <ProcCard style={{ padding: sp.md, marginBottom: sp.md }}>
        <ProcFilters
          busqueda={fTexto} onBusqueda={setFTexto} placeholder="Buscar cliente/servicio/origen…"
          filtros={[
            ...(soloPendientes ? [] : [{ key: "estado", label: "Estado", valor: fEstado, onChange: setFEstado, opciones: [{ v: "", l: "Todos los estados" }, ...ESTADOS.map((s) => ({ v: s, l: badgeDe(s).label }))] }]),
            { key: "origen", label: "Origen", valor: fOrigen, onChange: setFOrigen, opciones: [{ v: "", l: "Todo origen" }, ...["orden", "repaletizaje", "pallet", "manual"].map((o) => ({ v: o, l: o }))] },
            { key: "moneda", label: "Moneda", valor: fMoneda, onChange: setFMoneda, opciones: [{ v: "", l: "Toda moneda" }, ...MONEDAS.map((m) => ({ v: m, l: m }))] },
          ]}
          onReset={() => { setFTexto(""); setFEstado(""); setFMoneda(""); setFOrigen(""); }} />
      </ProcCard>

      {estado === "loading" ? <ProcLoadingState /> :
       estado === "error" ? <ProcErrorState error={error} onRetry={cargar} /> :
       <ProcDataTable columnas={columnas} filas={filtradas} rowKey="id"
         vacio={<ProcEmptyState icono={soloPendientes ? "✅" : "🧾"} titulo={soloPendientes ? "Sin pendientes de tarifa" : "Sin servicios facturables"} detalle={soloPendientes ? "Todos los hechos están valorizados." : "Generá un servicio desde una orden cerrada o cargá uno manual."} />} />}

      {detalle && <DetalleServicio s={detalle} onClose={() => setDetalle(null)} onTraza={() => { irAlHecho(detalle); setDetalle(null); }} onRevalorizado={() => { setDetalle(null); cargar(); }} soloPendientes={soloPendientes} />}

      {genOrden && (
        <ProcModal titulo="Generar servicio desde orden" onClose={() => setGenOrden(null)} ancho={620}
          acciones={<><ProcButton kind="ghost" onClick={() => setGenOrden(null)}>Cancelar</ProcButton><ProcButton onClick={generarDeOrden}>Generar</ProcButton></>}>
          <div style={{ fontSize: 12.5, color: C.muted, marginBottom: sp.sm }}>La cantidad = <b>kg procesados</b> de la orden (backend). Si no hay tarifa vigente, queda <b>pendiente de tarifa</b> (no $0).</div>
          <ProcField label="Orden (conciliada/cerrada)" requerido>
            <select style={inputStyle} value={genOrden.orden_id} onChange={(e) => setGenOrden((x) => ({ ...x, orden_id: e.target.value }))}>
              <option value="">Elegí una orden…</option>
              {ordenes.map((o) => <option key={o.id} value={o.id} disabled={o.tiene_servicio}>{o.folio} · {normalizarNombre(o.cliente) || "sin cliente"} · {formatNum(o.kg_procesados)} kg{o.tiene_servicio ? " (ya facturada)" : ""}</option>)}
            </select>
          </ProcField>
          <ProcField label="Servicio" requerido>
            <select style={inputStyle} value={genOrden.tipo_servicio_id} onChange={(e) => setGenOrden((x) => ({ ...x, tipo_servicio_id: e.target.value }))}>
              <option value="">Elegí un servicio…</option>
              {tipos.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
            </select>
          </ProcField>
        </ProcModal>
      )}

      {genManual && (
        <ProcModal titulo="Servicio manual" onClose={() => setGenManual(null)} ancho={620}
          acciones={<><ProcButton kind="ghost" onClick={() => setGenManual(null)}>Cancelar</ProcButton><ProcButton onClick={generarManual}>Generar manual</ProcButton></>}>
          <div style={{ fontSize: 12.5, color: C.warning, marginBottom: sp.sm, fontWeight: 600 }}>Excepcional: exige motivo y autorización. Queda marcado como “Manual”.</div>
          <ProcField label="Cliente" requerido>
            <select style={inputStyle} value={genManual.cliente_vinculo_id || ""} onChange={(e) => setGenManual((x) => ({ ...x, cliente_vinculo_id: e.target.value }))}>
              <option value="">Elegí cliente…</option>
              {clientes.map((c) => <option key={c.id} value={c.id}>{normalizarNombre(c.nombre_provisional)}</option>)}
            </select>
          </ProcField>
          <div style={{ display: "flex", gap: sp.sm }}>
            <div style={{ flex: 2 }}><ProcField label="Servicio" requerido>
              <select style={inputStyle} value={genManual.tipo_servicio_id || ""} onChange={(e) => setGenManual((x) => ({ ...x, tipo_servicio_id: e.target.value }))}>
                <option value="">Elegí…</option>{tipos.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
              </select></ProcField></div>
            <div style={{ flex: 1 }}><ProcField label="Fecha"><input type="date" style={inputStyle} value={genManual.fecha} onChange={(e) => setGenManual((x) => ({ ...x, fecha: e.target.value }))} /></ProcField></div>
          </div>
          <div style={{ display: "flex", gap: sp.sm }}>
            <div style={{ flex: 1 }}><ProcField label="Cantidad" requerido><input type="number" step="0.001" style={inputStyle} value={genManual.cantidad ?? ""} onChange={(e) => setGenManual((x) => ({ ...x, cantidad: e.target.value }))} /></ProcField></div>
            <div style={{ flex: 1 }}><ProcField label="Unidad"><select style={inputStyle} value={genManual.unidad} onChange={(e) => setGenManual((x) => ({ ...x, unidad: e.target.value }))}>{UNIDADES.map((u) => <option key={u} value={u}>{u}</option>)}</select></ProcField></div>
            <div style={{ flex: 1 }}><ProcField label="Tarifa" requerido><input type="number" step="0.0001" style={inputStyle} value={genManual.tarifa ?? ""} onChange={(e) => setGenManual((x) => ({ ...x, tarifa: e.target.value }))} /></ProcField></div>
            <div style={{ width: 100 }}><ProcField label="Moneda"><select style={inputStyle} value={genManual.moneda} onChange={(e) => setGenManual((x) => ({ ...x, moneda: e.target.value }))}>{MONEDAS.map((m) => <option key={m} value={m}>{m}</option>)}</select></ProcField></div>
          </div>
          {montoServicio(genManual.cantidad, genManual.tarifa) != null && (
            <div style={{ padding: "8px 12px", background: C.cardAlt, borderRadius: 8, fontSize: 13, marginBottom: sp.sm }}>
              {formatNum(genManual.cantidad, 2)} × {formatTarifa(genManual.tarifa, genManual.moneda)} = <b>{formatMoneda(montoServicio(genManual.cantidad, genManual.tarifa), genManual.moneda)}</b>
            </div>
          )}
          <ProcField label="Motivo" requerido><input style={inputStyle} value={genManual.motivo || ""} onChange={(e) => setGenManual((x) => ({ ...x, motivo: e.target.value }))} placeholder="Razón del cobro manual" /></ProcField>
          <ProcField label="Autorizado por" requerido hint="Nombre de quien autoriza el cobro manual">
            <input style={inputStyle} value={genManual.autoriza || usuario?.nombre || ""} onChange={(e) => setGenManual((x) => ({ ...x, autoriza: e.target.value }))} placeholder="Nombre" />
          </ProcField>
        </ProcModal>
      )}
    </div>
  );
}

// ── Detalle auditable de un servicio: cantidad × tarifa = monto + snapshot + traza
function DetalleServicio({ s, onClose, onTraza, onRevalorizado, soloPendientes }) {
  const { empresa, notificar } = useService();
  const [revalorizando, setRevalorizando] = useState(false);
  const revalorizar = async () => {
    setRevalorizando(true);
    try {
      const { revalorizarServicioPendiente } = await import("../../core/procesoF7DB");
      const r = await revalorizarServicioPendiente({ empresaId: empresa, servicioId: s.id });
      const res = Array.isArray(r) ? r[0] : r;
      if (res === "valorizado" || res?.proc_fn_revalorizar_servicio_pendiente === "valorizado") { notificar("Servicio valorizado"); onRevalorizado(); }
      else notificar("Sigue sin tarifa vigente. Cargá la tarifa en Tarifario.", "error");
    } catch (e) { notificar(traducirError(e), "error"); } finally { setRevalorizando(false); }
  };
  const Row = ({ l, v, b }) => <div style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: `1px solid ${C.border}` }}><span style={{ color: C.muted, fontSize: 12.5 }}>{l}</span><span style={{ fontWeight: b ? 800 : 500, fontSize: 13 }}>{v}</span></div>;
  return (
    <ProcModal titulo="Detalle del servicio facturable" onClose={onClose} ancho={520}
      acciones={<>
        {s.origen_tipo !== "manual" && <ProcButton kind="ghost" onClick={onTraza}>Ver hecho de origen →</ProcButton>}
        {s.estado === "pendiente_tarifa" && <ProcButton disabled={revalorizando} onClick={revalorizar}>{revalorizando ? "Revalorizando…" : "Revalorizar"}</ProcButton>}
        <ProcButton kind="ghost" onClick={onClose}>Cerrar</ProcButton>
      </>}>
      <Row l="Cliente" v={normalizarNombre(s.cliente)} />
      <Row l="Servicio" v={s.servicio_nombre + (s.es_manual ? " (manual)" : "")} />
      <Row l="Origen" v={`${s.referencia || "—"} (${s.origen_tipo})`} />
      <Row l="Fecha del hecho" v={formatFecha(s.fecha_hecho)} />
      <Row l="Estado" v={badgeDe(s.estado).label} />
      <div style={{ margin: "14px 0", padding: sp.md, background: C.cardAlt, borderRadius: 10 }}>
        {s.tarifa_aplicada != null ? (
          <div style={{ fontSize: 15, textAlign: "center" }}>
            {formatNum(s.cantidad, 2)} {s.unidad} × {formatTarifa(s.tarifa_aplicada, s.moneda)} = <b style={{ fontSize: 18 }}>{formatMoneda(s.subtotal, s.moneda)}</b>
          </div>
        ) : (
          <div style={{ fontSize: 13.5, textAlign: "center", color: C.warning, fontWeight: 700 }}>
            {formatNum(s.cantidad, 2)} {s.unidad} · sin tarifa vigente → pendiente de tarifa (no $0)
          </div>
        )}
      </div>
      {s.tarifa_aplicada != null && (
        <div style={{ fontSize: 11.5, color: C.muted, textAlign: "center" }}>
          Tarifa SNAPSHOT (congelada): {formatTarifa(s.tarifa_aplicada, s.moneda)} / {s.unidad_tarifa} · vigencia usada {formatFecha(s.vigencia_usada)}.
          Si el Tarifario cambia después, este hecho NO se recalcula.
        </div>
      )}
      {s.en_base && <div style={{ marginTop: sp.sm, fontSize: 12, color: C.info, textAlign: "center" }}>Incluido en base <b>{s.base_folio}</b> ({badgeDe(s.base_estado).label})</div>}
      {s.motivo && <div style={{ marginTop: sp.sm, fontSize: 12, color: C.muted }}>Motivo: {s.motivo}</div>}
    </ProcModal>
  );
}
