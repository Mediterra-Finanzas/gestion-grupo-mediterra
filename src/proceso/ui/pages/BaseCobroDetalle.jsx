/* eslint-disable */
// src/proceso/ui/pages/BaseCobroDetalle.jsx — detalle auditable de una base de cobro.
// Header + líneas (servicio, referencia, cantidad × tarifa = monto) + total del backend.
// Editable solo en borrador/en_revision; aprobada+ => READ-ONLY (backend es autoridad).
// Multimoneda: solo agrega servicios de la misma moneda que la base.
import React, { useEffect, useState, useCallback } from "react";
import { useService } from "../hooks/useServiceContext";
import {
  cargarBaseCobroPorId, cargarBaseCobroLineas, cargarServiciosFacturables,
  agregarABase, aprobarBase, cambiarEstadoBase,
} from "../../core/procesoF7DB";
import { traducirError, badgeDe, baseEditable, accionesBase, servicioAgregableABase } from "../../core/procesoF7Domain";
import {
  ProcPageHeader, ProcButton, ProcCard, ProcDataTable, ProcStatusBadge, ProcModal,
  ProcLoadingState, ProcErrorState, ProcEmptyState,
} from "../components/base";
import { C, sp } from "../estilos";
import { formatNum, formatTarifa, formatMoneda, formatFecha, normalizarNombre } from "../format";

export default function BaseCobroDetalle() {
  const { empresa, vista, ir, puedeEditar, notificar } = useService();
  const id = vista?.params?.id;
  const [base, setBase] = useState(null);
  const [lineas, setLineas] = useState([]);
  const [estado, setEstado] = useState("idle");
  const [error, setError] = useState(null);
  const [agregar, setAgregar] = useState(null); // {candidatos}

  const editable = puedeEditar("bases") || puedeEditar("centro");

  const cargar = useCallback(async () => {
    if (!empresa || !id) { setEstado("idle"); return; }
    setEstado("loading"); setError(null);
    try {
      const [b, ls] = await Promise.all([cargarBaseCobroPorId(empresa, id), cargarBaseCobroLineas(empresa, id)]);
      setBase(Array.isArray(b) ? b[0] : b); setLineas(ls); setEstado("ok");
    } catch (e) { setError(traducirError(e)); setEstado("error"); }
  }, [empresa, id]);
  useEffect(() => { cargar(); }, [cargar]);

  const esEditable = base && baseEditable(base.estado);

  const abrirAgregar = async () => {
    try {
      const cand = await cargarServiciosFacturables(empresa,
        `&cliente_vinculo_id=eq.${base.cliente_vinculo_id}&moneda=eq.${base.moneda}`);
      setAgregar({ candidatos: (cand || []).filter((s) => servicioAgregableABase(s.estado) && !s.en_base) });
    } catch (e) { notificar(traducirError(e), "error"); }
  };
  const agregarServicio = async (servicioId) => {
    try { await agregarABase({ empresaId: empresa, baseId: id, servicioId }); notificar("Servicio agregado"); setAgregar(null); cargar(); }
    catch (e) { notificar(traducirError(e), "error"); }
  };

  const ejecutarAccion = async (acc) => {
    if (!window.confirm(`¿${acc.l}?`)) return;
    try {
      if (acc.a === "aprobar") await aprobarBase({ empresaId: empresa, baseId: id });
      else await cambiarEstadoBase(id, empresa, acc.a);
      notificar("Base actualizada"); cargar();
    } catch (e) { notificar(traducirError(e), "error"); }
  };

  if (!empresa || !id) return <div><ProcPageHeader titulo="Base de Cobro" /><ProcCard style={{ padding: sp.lg }}><ProcEmptyState icono="📑" titulo="Base no seleccionada" /></ProcCard></div>;
  if (estado === "loading") return <ProcLoadingState />;
  if (estado === "error") return <ProcErrorState error={error} onRetry={cargar} />;
  if (!base) return <ProcEmptyState icono="📑" titulo="Base no encontrada" />;

  const acciones = editable ? accionesBase(base.estado) : [];
  const colsLinea = [
    { titulo: "Servicio", render: (l) => <b>{l.servicio_nombre}</b> },
    { titulo: "Origen", render: (l) => <span style={{ fontSize: 12.5 }}>{l.referencia || "—"}{l.es_manual ? <ProcStatusBadge texto="Manual" tono="purple" /> : null}</span> },
    { titulo: "Fecha", render: (l) => formatFecha(l.fecha_hecho) },
    { titulo: "Cantidad", align: "right", render: (l) => <span>{formatNum(l.cantidad, 2)} <span style={{ color: C.muted2, fontSize: 11 }}>{l.unidad}</span></span> },
    { titulo: "Tarifa", align: "right", render: (l) => formatTarifa(l.tarifa_aplicada, l.moneda) },
    { titulo: "Monto", align: "right", render: (l) => <b>{formatMoneda(l.subtotal, l.moneda)}</b> },
  ];

  const Dato = ({ l, v }) => <div><div style={{ fontSize: 11, color: C.muted, textTransform: "uppercase", letterSpacing: .3 }}>{l}</div><div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{v}</div></div>;

  return (
    <div>
      <ProcPageHeader titulo={`Base ${base.folio}`} subtitulo="Detalle auditable de la base de cobro"
        acciones={<div style={{ display: "flex", gap: sp.sm }}>
          <ProcButton kind="ghost" small onClick={() => ir("bases")}>← Bases</ProcButton>
          {acciones.map((a) => <ProcButton key={a.a} onClick={() => ejecutarAccion(a)}>{a.l}</ProcButton>)}
        </div>} />

      {!esEditable && (
        <div style={{ padding: "10px 14px", borderRadius: 10, background: C.infoBg, border: `1px solid ${C.info}33`, color: C.info, fontWeight: 700, fontSize: 13, marginBottom: sp.md }}>
          🔒 Base {badgeDe(base.estado).label.toUpperCase()} — read-only. No admite cambios de líneas (inmutable en backend).
        </div>
      )}

      <ProcCard style={{ padding: sp.lg, marginBottom: sp.md }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: sp.md, alignItems: "start" }}>
          <Dato l="Cliente" v={normalizarNombre(base.cliente)} />
          <Dato l="Período" v={base.periodo_desde ? `${formatFecha(base.periodo_desde)} → ${base.periodo_hasta ? formatFecha(base.periodo_hasta) : "—"}` : "—"} />
          <Dato l="Moneda" v={base.moneda} />
          <Dato l="Estado" v={<ProcStatusBadge estado={base.estado} />} />
          <Dato l="Líneas" v={base.lineas} />
          <Dato l="Total" v={<span style={{ fontSize: 18, fontWeight: 800 }}>{formatMoneda(base.total, base.moneda)}</span>} />
        </div>
      </ProcCard>

      <ProcCard style={{ padding: sp.md }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: sp.sm }}>
          <div style={{ fontWeight: 800, fontSize: 15, color: C.text }}>Líneas</div>
          {esEditable && editable && <ProcButton small onClick={abrirAgregar}>+ Agregar servicios</ProcButton>}
        </div>
        <ProcDataTable columnas={colsLinea} filas={lineas} rowKey="id"
          vacio={<ProcEmptyState icono="🧾" titulo="Sin líneas" detalle="Agregá servicios valorizados de este cliente y moneda." />} />
        {lineas.length > 0 && (
          <div style={{ display: "flex", justifyContent: "flex-end", gap: sp.lg, padding: "10px 12px", marginTop: 4, borderTop: `2px solid ${C.border}` }}>
            <span style={{ color: C.muted, fontSize: 13 }}>Total ({base.moneda})</span>
            <span style={{ fontWeight: 800, fontSize: 16 }}>{formatMoneda(base.total, base.moneda)}</span>
          </div>
        )}
      </ProcCard>

      {agregar && (
        <ProcModal titulo="Agregar servicios a la base" onClose={() => setAgregar(null)} ancho={680}
          acciones={<ProcButton kind="ghost" onClick={() => setAgregar(null)}>Cerrar</ProcButton>}>
          <div style={{ fontSize: 12.5, color: C.muted, marginBottom: sp.sm }}>Solo servicios <b>valorizados</b> de <b>{normalizarNombre(base.cliente)}</b> en <b>{base.moneda}</b> que no estén en otra base.</div>
          {agregar.candidatos.length === 0 ? <ProcEmptyState icono="✅" titulo="No hay servicios disponibles" detalle="No quedan servicios valorizados de este cliente/moneda sin base." /> : (
            <ProcDataTable rowKey="id" filas={agregar.candidatos} columnas={[
              { titulo: "Servicio", render: (s) => <b>{s.servicio_nombre}</b> },
              { titulo: "Origen", render: (s) => <span style={{ fontSize: 12 }}>{s.referencia || "—"}</span> },
              { titulo: "Fecha", render: (s) => formatFecha(s.fecha_hecho) },
              { titulo: "Monto", align: "right", render: (s) => formatMoneda(s.subtotal, s.moneda) },
              { titulo: "", align: "right", render: (s) => <ProcButton small onClick={() => agregarServicio(s.id)}>Agregar</ProcButton> },
            ]} />
          )}
        </ProcModal>
      )}
    </div>
  );
}
