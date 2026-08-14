/* eslint-disable */
// src/proceso/ui/pages/NuevaRecepcion.jsx — flujo operacional de recepción.
// Fase 1: cabecera + participantes (Core vía proc_vinculo) + pesos -> crea
//   recepción (folio desde backend, no React).
// Fase 2: QC dinámico + creación de lote(s) con ubicación (RPC atómica
//   ingresar_lote_ubicado: lote + movimiento de entrada + ubicación en una tx).
// El ledger (F1) sigue siendo SoT físico; la UI no crea stock paralelo.
import React, { useEffect, useState } from "react";
import { useService } from "../hooks/useServiceContext";
import {
  siguienteCorrelativo, crearRecepcion, cargarVinculosPorRol, cargarUbicacionesActivas, cargarLotesDeRecepcion,
} from "../../core/procesoF7DB";
import { ingresarLoteUbicado } from "../../core/procesoF2DB";
import { validarPesos, calcularNeto, traducirError } from "../../core/procesoF7Domain";
import {
  ProcPageHeader, ProcCard, ProcButton, ProcField, inputStyle, ProcStatusBadge,
  ProcEmptyState, ProcDataTable,
} from "../components/base";
import QcPanel from "../components/QcPanel";
import { C, sp } from "../estilos";
import { normalizarNombre } from "../format";

function Grupo({ titulo, children }) {
  return (
    <div style={{ marginBottom: sp.lg }}>
      <div style={{ fontSize: 12, fontWeight: 800, color: C.muted, textTransform: "uppercase", letterSpacing: .4, marginBottom: sp.sm }}>{titulo}</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: sp.md }}>{children}</div>
    </div>
  );
}
const VSelect = ({ label, value, onChange, opciones }) => (
  <ProcField label={label}>
    <select style={inputStyle} value={value || ""} onChange={(e) => onChange(e.target.value || null)}>
      <option value="">—</option>
      {opciones.map((v) => <option key={v.id} value={v.id}>{normalizarNombre(v.nombre_provisional)}</option>)}
    </select>
  </ProcField>
);

export default function NuevaRecepcion() {
  const { empresa, planta, temporada, ir, notificar } = useService();
  const [vinc, setVinc] = useState({ cliente_servicio: [], productor: [], dueno_fruta: [], exportadora: [], transportista: [] });
  const [ubicaciones, setUbicaciones] = useState([]);
  const [f, setF] = useState({ especie_codigo: "", variedad_codigo: "", kg_bruto: "", tara: "", guia_despacho: "", patente: "" });
  const [rec, setRec] = useState(null); // {id, folio, especie} tras crear
  const [lotes, setLotes] = useState([]);
  const [nuevoLote, setNuevoLote] = useState({ variedad: "", kg: "", ubicacion: "" });

  useEffect(() => {
    if (!empresa) return;
    ["cliente_servicio", "productor", "dueno_fruta", "exportadora", "transportista"].forEach((rol) =>
      cargarVinculosPorRol(empresa, rol).then((v) => setVinc((x) => ({ ...x, [rol]: v || [] }))).catch(() => {}));
    cargarUbicacionesActivas(empresa, planta).then(setUbicaciones).catch(() => setUbicaciones([]));
  }, [empresa, planta]);

  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const pes = validarPesos({ bruto: f.kg_bruto, tara: f.tara });

  const crear = async () => {
    if (!empresa) return notificar("Falta tenant", "error");
    if (!f.especie_codigo) return notificar("Falta especie", "error");
    if (!f.cliente_servicio) return notificar("Falta cliente/mandante", "error");
    if (!pes.ok) return notificar(pes.errores[0], "error");
    try {
      const folio = await siguienteCorrelativo({ empresaId: empresa, temporada: temporada || "s-t", tipo: "REC" });
      const fila = {
        empresa_id: empresa, folio, planta_id: planta || null,
        cliente_servicio_vinculo_id: f.cliente_servicio || null, productor_vinculo_id: f.productor || null,
        dueno_fruta_vinculo_id: f.dueno_fruta || null, exportadora_vinculo_id: f.exportadora || null,
        transportista_vinculo_id: f.transportista || null, especie_codigo: f.especie_codigo,
        variedad_codigo: f.variedad_codigo || null, kg_bruto: Number(f.kg_bruto) || null,
        tara: Number(f.tara) || null, kg_neto: pes.neto || null, guia_despacho: f.guia_despacho || null,
        patente: f.patente || null, estado: "recibida",
      };
      const r = await crearRecepcion(fila);
      setRec({ id: r.id, folio: r.folio, especie: f.especie_codigo });
      notificar(`Recepción ${r.folio} creada`);
    } catch (e) { notificar(traducirError(e), "error"); }
  };

  const agregarLote = async () => {
    if (!nuevoLote.kg || Number(nuevoLote.kg) <= 0) return notificar("Kg del lote debe ser > 0", "error");
    if (!nuevoLote.ubicacion) return notificar("Seleccioná ubicación inicial", "error");
    try {
      const codigo = await siguienteCorrelativo({ empresaId: empresa, temporada: temporada || "s-t", tipo: "LOT" });
      await ingresarLoteUbicado({
        empresaId: empresa, recepcionId: rec.id, codigo, especie: rec.especie, variedad: nuevoLote.variedad || null,
        kg: Number(nuevoLote.kg), plantaId: planta, temporada: temporada || "s-t", ubicacionId: nuevoLote.ubicacion,
      });
      notificar(`Lote ${codigo} ingresado`);
      setNuevoLote({ variedad: "", kg: "", ubicacion: "" });
      setLotes(await cargarLotesDeRecepcion(empresa, rec.id));
    } catch (e) { notificar(traducirError(e), "error"); }
  };

  if (!empresa) return <div><ProcPageHeader titulo="Nueva recepción" /><ProcCard style={{ padding: sp.lg }}><ProcEmptyState icono="🚛" titulo="Seleccioná un tenant" /></ProcCard></div>;

  return (
    <div>
      <ProcPageHeader titulo={rec ? `Recepción ${rec.folio}` : "Nueva recepción"}
        subtitulo={rec ? "Registrá QC y creá el/los lotes con su ubicación" : "Llegada de fruta a planta"}
        acciones={<ProcButton kind="ghost" onClick={() => ir("recepciones")}>← Recepciones</ProcButton>} />

      {!rec ? (
        <ProcCard style={{ padding: sp.lg }}>
          <Grupo titulo="Origen · participantes (identidad Core vía vínculo Service)">
            <VSelect label="Cliente / mandante" value={f.cliente_servicio} onChange={(v) => set("cliente_servicio", v)} opciones={vinc.cliente_servicio} />
            <VSelect label="Productor" value={f.productor} onChange={(v) => set("productor", v)} opciones={vinc.productor} />
            <VSelect label="Dueño de la fruta" value={f.dueno_fruta} onChange={(v) => set("dueno_fruta", v)} opciones={vinc.dueno_fruta} />
            <VSelect label="Exportadora" value={f.exportadora} onChange={(v) => set("exportadora", v)} opciones={vinc.exportadora} />
            <ProcField label="Especie" requerido><input style={inputStyle} value={f.especie_codigo} onChange={(e) => set("especie_codigo", e.target.value.toUpperCase())} placeholder="CHE, PLU…" /></ProcField>
            <ProcField label="Variedad"><input style={inputStyle} value={f.variedad_codigo} onChange={(e) => set("variedad_codigo", e.target.value)} placeholder="Santina…" /></ProcField>
          </Grupo>
          <Grupo titulo="Transporte / documentos">
            <VSelect label="Transportista" value={f.transportista} onChange={(v) => set("transportista", v)} opciones={vinc.transportista} />
            <ProcField label="Patente"><input style={inputStyle} value={f.patente} onChange={(e) => set("patente", e.target.value)} /></ProcField>
            <ProcField label="Guía / documento"><input style={inputStyle} value={f.guia_despacho} onChange={(e) => set("guia_despacho", e.target.value)} /></ProcField>
          </Grupo>
          <Grupo titulo="Pesos (kg neto = bruto − tara; DB es autoridad)">
            <ProcField label="Kg bruto"><input style={inputStyle} type="number" value={f.kg_bruto} onChange={(e) => set("kg_bruto", e.target.value)} /></ProcField>
            <ProcField label="Tara"><input style={inputStyle} type="number" value={f.tara} onChange={(e) => set("tara", e.target.value)} /></ProcField>
            <ProcField label="Kg neto (calculado)"><input style={{ ...inputStyle, background: C.cardAlt }} value={calcularNeto(f.kg_bruto, f.tara)} readOnly /></ProcField>
          </Grupo>
          {!pes.ok && <div style={{ color: C.danger, fontSize: 12.5, marginBottom: sp.md }}>{pes.errores.join(" ")}</div>}
          <ProcButton onClick={crear}>Crear recepción</ProcButton>
        </ProcCard>
      ) : (
        <>
          <ProcCard style={{ padding: sp.lg, marginBottom: sp.md }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: C.text, marginBottom: sp.md }}>Control de Calidad</div>
            <QcPanel especie={rec.especie} recepcionId={rec.id} editable onGuardado={() => {}} />
          </ProcCard>
          <ProcCard style={{ padding: sp.lg }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: C.text, marginBottom: sp.md }}>Lotes de esta recepción</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr auto", gap: sp.sm, alignItems: "end", marginBottom: sp.md }}>
              <ProcField label="Variedad"><input style={inputStyle} value={nuevoLote.variedad} onChange={(e) => setNuevoLote((x) => ({ ...x, variedad: e.target.value }))} /></ProcField>
              <ProcField label="Kg" requerido><input style={inputStyle} type="number" value={nuevoLote.kg} onChange={(e) => setNuevoLote((x) => ({ ...x, kg: e.target.value }))} /></ProcField>
              <ProcField label="Ubicación inicial" requerido>
                <select style={inputStyle} value={nuevoLote.ubicacion} onChange={(e) => setNuevoLote((x) => ({ ...x, ubicacion: e.target.value }))}>
                  <option value="">—</option>
                  {ubicaciones.map((u) => <option key={u.id} value={u.id}>{u.nombre || u.codigo}</option>)}
                </select>
              </ProcField>
              <ProcButton onClick={agregarLote}>+ Ingresar lote</ProcButton>
            </div>
            {ubicaciones.length === 0 && <div style={{ color: C.warning, fontSize: 12.5, marginBottom: sp.sm }}>No hay ubicaciones activas para esta planta. Configuralas antes de ingresar fruta.</div>}
            <ProcDataTable
              columnas={[
                { titulo: "Código", campo: "codigo", render: (l) => <b>{l.codigo}</b> },
                { titulo: "Variedad", campo: "variedad_codigo" },
                { titulo: "Estado", render: (l) => <ProcStatusBadge estado={l.estado} /> },
              ]}
              filas={lotes} rowKey="id"
              vacio={<ProcEmptyState icono="📦" titulo="Aún sin lotes" detalle="Ingresá el primer lote con kg y ubicación." />} />
            <div style={{ marginTop: sp.md, textAlign: "right" }}>
              <ProcButton kind="ghost" onClick={() => ir("recepcion_detalle", { id: rec.id })}>Ir al detalle de la recepción →</ProcButton>
            </div>
          </ProcCard>
        </>
      )}
    </div>
  );
}
