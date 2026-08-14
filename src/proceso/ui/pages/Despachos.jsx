/* eslint-disable */
// src/proceso/ui/pages/Despachos.jsx — listado de despachos (salida física).
// Despacho = salida de producto bajo custodia de Service, NO venta/exportación.
import React, { useEffect, useState, useCallback } from "react";
import { useService } from "../hooks/useServiceContext";
import { cargarDespachoListado, crearDespacho, siguienteCorrelativo, cargarVinculosPorRol } from "../../core/procesoF7DB";
import { traducirError, badgeDe } from "../../core/procesoF7Domain";
import {
  ProcPageHeader, ProcButton, ProcCard, ProcDataTable, ProcStatusBadge, ProcModal, ProcField, inputStyle,
  ProcLoadingState, ProcErrorState, ProcEmptyState,
} from "../components/base";
import { C, sp } from "../estilos";

const kg = (n) => (n == null ? "—" : `${Number(n).toLocaleString("es-CL")}`);

export default function Despachos() {
  const { empresa, planta, temporada, ir, puedeEditar, notificar, vista } = useService();
  const [rows, setRows] = useState([]);
  const [estado, setEstado] = useState("idle"); const [error, setError] = useState(null);
  const [fEstado, setFEstado] = useState(vista?.params?.filtroEstado || "");
  const [nuevo, setNuevo] = useState(null);
  const [vinc, setVinc] = useState({ cliente_servicio: [], otros: [] });

  const cargar = useCallback(async () => {
    if (!empresa) { setEstado("idle"); return; }
    setEstado("loading"); setError(null);
    try {
      let extra = "";
      if (planta) extra += `&planta_origen_id=eq.${planta}`;
      if (fEstado) extra += `&estado=eq.${fEstado}`;
      setRows(await cargarDespachoListado(empresa, extra)); setEstado("ok");
    } catch (e) { setError(traducirError(e)); setEstado("error"); }
  }, [empresa, planta, fEstado]);
  useEffect(() => { cargar(); }, [cargar]);

  const abrirNuevo = async () => {
    setNuevo({ cliente: "", destinatario: "" });
    const [cli, otros] = await Promise.all([
      cargarVinculosPorRol(empresa, "cliente_servicio"),
      // destinatario puede ser cualquier vínculo; cargamos varios roles
      Promise.all(["exportadora", "otro", "cliente_servicio", "dueno_fruta"].map((r) => cargarVinculosPorRol(empresa, r))).then((a) => a.flat()),
    ]);
    setVinc({ cliente_servicio: cli || [], otros: otros || [] });
  };
  const crear = async () => {
    if (!nuevo.cliente) return notificar("Falta cliente del servicio", "error");
    try {
      const folio = await siguienteCorrelativo({ empresaId: empresa, temporada: temporada || "s-t", tipo: "DES" });
      const id = await crearDespacho({ empresaId: empresa, folio, plantaId: planta, clienteVinculoId: nuevo.cliente, destinatarioVinculoId: nuevo.destinatario || null });
      setNuevo(null); notificar(`Despacho ${folio} creado`); ir("despacho", { id });
    } catch (e) { notificar(traducirError(e), "error"); }
  };

  const columnas = [
    { titulo: "Folio", render: (d) => <b>{d.folio}</b> },
    { titulo: "Fecha", render: (d) => (d.fecha_prevista ? new Date(d.fecha_prevista).toLocaleDateString("es-CL") : "—") },
    { titulo: "Cliente", campo: "cliente" },
    { titulo: "Destinatario", campo: "destinatario" },
    { titulo: "Pallets", align: "right", campo: "pallets" },
    { titulo: "Cajas", align: "right", campo: "cajas" },
    { titulo: "Kg", align: "right", render: (d) => kg(d.kg) },
    { titulo: "Transporte", render: (d) => d.vehiculo_patente || d.transportista || "—" },
    { titulo: "Estado", render: (d) => <ProcStatusBadge estado={d.estado} /> },
    { titulo: "", align: "right", render: (d) => <ProcButton kind="ghost" small onClick={() => ir("despacho", { id: d.id })}>Abrir</ProcButton> },
  ];

  if (!empresa) return <div><ProcPageHeader titulo="Despachos" /><ProcCard style={{ padding: sp.lg }}><ProcEmptyState icono="🚚" titulo="Seleccioná un tenant" /></ProcCard></div>;

  return (
    <div>
      <ProcPageHeader titulo="Despachos" subtitulo="Salida física de producto (no es venta/exportación)"
        acciones={puedeEditar("despachos") || puedeEditar("centro") ? <ProcButton onClick={abrirNuevo}>+ Nuevo despacho</ProcButton> : null} />
      <ProcCard style={{ padding: sp.md, marginBottom: sp.md }}>
        <select style={{ ...inputStyle, width: 200 }} value={fEstado} onChange={(e) => setFEstado(e.target.value)}>
          <option value="">Todos los estados</option>
          {["borrador", "preparando", "listo", "cargando", "despachado", "cancelado"].map((s) => <option key={s} value={s}>{badgeDe(s).label}</option>)}
        </select>
      </ProcCard>
      {estado === "loading" ? <ProcLoadingState /> :
       estado === "error" ? <ProcErrorState error={error} onRetry={cargar} /> :
       <ProcDataTable columnas={columnas} filas={rows} rowKey="id"
         vacio={<ProcEmptyState icono="🚚" titulo="Sin despachos" detalle="Creá un despacho para preparar y confirmar una salida." />} />}

      {nuevo && (
        <ProcModal titulo="Nuevo despacho" onClose={() => setNuevo(null)}
          acciones={<><ProcButton kind="ghost" onClick={() => setNuevo(null)}>Cancelar</ProcButton><ProcButton onClick={crear}>Crear</ProcButton></>}>
          <ProcField label="Cliente del servicio" requerido><select style={inputStyle} value={nuevo.cliente} onChange={(e) => setNuevo((x) => ({ ...x, cliente: e.target.value }))}><option value="">—</option>{vinc.cliente_servicio.map((v) => <option key={v.id} value={v.id}>{v.nombre_provisional}</option>)}</select></ProcField>
          <ProcField label="Destinatario físico (≠ cliente)" hint="Puede no ser exportadora; se resuelve de proc_vinculo (no Frisku, no exp_*).">
            <select style={inputStyle} value={nuevo.destinatario} onChange={(e) => setNuevo((x) => ({ ...x, destinatario: e.target.value }))}><option value="">—</option>{vinc.otros.map((v) => <option key={v.id} value={v.id}>{v.nombre_provisional} ({v.rol_operacional})</option>)}</select>
          </ProcField>
        </ProcModal>
      )}
    </div>
  );
}
