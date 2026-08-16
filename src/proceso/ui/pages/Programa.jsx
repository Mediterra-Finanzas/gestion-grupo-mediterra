/* eslint-disable */
// src/proceso/ui/pages/Programa.jsx — planificación (Programa ≠ Orden).
// Programa planifica; la Orden ejecuta (máquina de estados propia). "Generar
// orden" crea la orden heredando contexto; NO colapsa ambas entidades.
import React, { useEffect, useState, useCallback } from "react";
import { useService } from "../hooks/useServiceContext";
import {
  cargarProgramas, crearPrograma, actualizarPrograma, crearOrden, siguienteCorrelativo, cargarVinculosPorRol,
  clienteHabilitadoParaOperar,
} from "../../core/procesoF7DB";
import { traducirError, badgeDe } from "../../core/procesoF7Domain";
import {
  ProcPageHeader, ProcCard, ProcButton, ProcDataTable, ProcStatusBadge, ProcModal, ProcField, inputStyle,
  ProcLoadingState, ProcErrorState, ProcEmptyState,
} from "../components/base";
import { C, sp } from "../estilos";
import { formatKg, formatNum, formatFecha, formatFechaHora, normalizarNombre } from "../format";

export default function Programa() {
  const { empresa, planta, temporada, fecha, ir, puedeEditar, notificar } = useService();
  const [rows, setRows] = useState([]); const [clientes, setClientes] = useState([]);
  const [estado, setEstado] = useState("idle"); const [error, setError] = useState(null);
  const [form, setForm] = useState(null);
  const editable = puedeEditar("programa") || puedeEditar("centro");

  const cargar = useCallback(async () => {
    if (!empresa) { setEstado("idle"); return; }
    setEstado("loading"); setError(null);
    try {
      let extra = "&limit=200";
      if (planta) extra += `&planta_id=eq.${planta}`;
      setRows(await cargarProgramas(empresa, extra));
      cargarVinculosPorRol(empresa, "cliente_servicio").then(setClientes).catch(() => {});
      setEstado("ok");
    } catch (e) { setError(traducirError(e)); setEstado("error"); }
  }, [empresa, planta]);
  useEffect(() => { cargar(); }, [cargar]);

  const guardar = async () => {
    if (!form.especie_codigo) return notificar("Falta especie", "error");
    try {
      const folio = await siguienteCorrelativo({ empresaId: empresa, temporada: temporada || "s-t", tipo: "PROG" });
      await crearPrograma({
        empresa_id: empresa, folio, fecha: form.fecha || fecha, planta_id: planta || null,
        turno: form.turno || null, cliente_servicio_vinculo_id: form.cliente || null,
        especie_codigo: form.especie_codigo, variedad_codigo: form.variedad_codigo || null,
        kg_estimado: Number(form.kg_estimado) || null, prioridad: Number(form.prioridad) || 0, estado: "borrador",
      });
      setForm(null); notificar(`Programa ${folio} creado`); cargar();
    } catch (e) { notificar(traducirError(e), "error"); }
  };
  const publicar = async (p) => { try { await actualizarPrograma(p.id, empresa, { estado: "publicado" }); notificar("Programa publicado"); cargar(); } catch (e) { notificar(traducirError(e), "error"); } };
  const generarOrden = async (p) => {
    try {
      // Gate contractual: generar orden = avanzar a proceso (backend autoridad)
      if (p.cliente_servicio_vinculo_id) {
        const g = await clienteHabilitadoParaOperar({ empresaId: empresa, clienteId: p.cliente_servicio_vinculo_id, etapa: "proceso" });
        const gr = Array.isArray(g) ? g[0] : g;
        if (gr && gr.habilitado === false) {
          notificar(gr.motivo || "El cliente no está habilitado para avanzar a proceso por su situación contractual.", "error");
          return;
        }
      }
      const folio = await siguienteCorrelativo({ empresaId: empresa, temporada: temporada || "s-t", tipo: "ORD" });
      const o = await crearOrden({
        empresa_id: empresa, folio, programa_id: p.id, planta_id: p.planta_id || planta || null, linea_id: p.linea_id || null,
        turno: p.turno || null, cliente_servicio_vinculo_id: p.cliente_servicio_vinculo_id || null,
        especie_codigo: p.especie_codigo, variedad_codigo: p.variedad_codigo || null, estado: "en_proceso",
      });
      notificar(`Orden ${folio} generada`); ir("orden", { id: o.id });
    } catch (e) { notificar(traducirError(e), "error"); }
  };

  const columnas = [
    { titulo: "Folio", render: (p) => <b>{p.folio}</b> },
    { titulo: "Fecha", render: (p) => (p.fecha ? formatFecha(p.fecha) : "—") },
    { titulo: "Turno", campo: "turno" },
    { titulo: "Especie", campo: "especie_codigo" },
    { titulo: "Kg est.", align: "right", render: (p) => (p.kg_estimado != null ? formatNum(p.kg_estimado) : "—") },
    { titulo: "Prioridad", align: "right", campo: "prioridad" },
    { titulo: "Estado", render: (p) => <ProcStatusBadge estado={p.estado} /> },
    { titulo: "", align: "right", render: (p) => editable && p.estado !== "cerrado" ? (
      <span style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
        {p.estado === "borrador" && <ProcButton kind="ghost" small onClick={() => publicar(p)}>Publicar</ProcButton>}
        <ProcButton kind="ghost" small onClick={() => generarOrden(p)}>Generar orden →</ProcButton>
      </span>) : null },
  ];

  if (!empresa) return <div><ProcPageHeader titulo="Programa de Proceso" /><ProcCard style={{ padding: sp.lg }}><ProcEmptyState icono="📅" titulo="Seleccioná un tenant" /></ProcCard></div>;

  return (
    <div>
      <ProcPageHeader titulo="Programa de Proceso" subtitulo="Planificación de corridas (Programa ≠ Orden)"
        acciones={editable ? <ProcButton onClick={() => setForm({ fecha, turno: "", cliente: "", especie_codigo: "", variedad_codigo: "", kg_estimado: "", prioridad: 0 })}>+ Nuevo programa</ProcButton> : null} />
      {estado === "loading" ? <ProcLoadingState /> :
       estado === "error" ? <ProcErrorState error={error} onRetry={cargar} /> :
       <ProcDataTable columnas={columnas} filas={rows} rowKey="id"
         vacio={<ProcEmptyState icono="📅" titulo="Sin programa" detalle="Planificá qué procesar y luego generá la orden." />} />}

      {form && (
        <ProcModal titulo="Nuevo programa" onClose={() => setForm(null)}
          acciones={<><ProcButton kind="ghost" onClick={() => setForm(null)}>Cancelar</ProcButton><ProcButton onClick={guardar}>Guardar</ProcButton></>}>
          <ProcField label="Fecha"><input style={inputStyle} type="date" value={form.fecha} onChange={(e) => setForm((x) => ({ ...x, fecha: e.target.value }))} /></ProcField>
          <ProcField label="Cliente"><select style={inputStyle} value={form.cliente} onChange={(e) => setForm((x) => ({ ...x, cliente: e.target.value }))}><option value="">—</option>{clientes.map((c) => <option key={c.id} value={c.id}>{normalizarNombre(c.nombre_provisional)}</option>)}</select></ProcField>
          <ProcField label="Especie" requerido><input style={inputStyle} value={form.especie_codigo} onChange={(e) => setForm((x) => ({ ...x, especie_codigo: e.target.value.toUpperCase() }))} placeholder="CHE, PLU…" /></ProcField>
          <ProcField label="Variedad"><input style={inputStyle} value={form.variedad_codigo} onChange={(e) => setForm((x) => ({ ...x, variedad_codigo: e.target.value }))} /></ProcField>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: sp.sm }}>
            <ProcField label="Turno"><input style={inputStyle} value={form.turno} onChange={(e) => setForm((x) => ({ ...x, turno: e.target.value }))} /></ProcField>
            <ProcField label="Kg estimado"><input style={inputStyle} type="number" value={form.kg_estimado} onChange={(e) => setForm((x) => ({ ...x, kg_estimado: e.target.value }))} /></ProcField>
            <ProcField label="Prioridad"><input style={inputStyle} type="number" value={form.prioridad} onChange={(e) => setForm((x) => ({ ...x, prioridad: e.target.value }))} /></ProcField>
          </div>
        </ProcModal>
      )}
    </div>
  );
}
