/* eslint-disable */
// src/proceso/ui/pages/Informes.jsx — bandeja de Resultado de Proceso.
// Informes emitidos/borradores + órdenes cerradas pendientes de informar.
// La UI NO crea una segunda verdad: consume F1–F5 y sus read-models.
import React, { useEffect, useState, useCallback } from "react";
import { useService } from "../hooks/useServiceContext";
import {
  cargarInformeListado, cargarOrdenesInformables, crearInforme, generarVersion, siguienteCorrelativo, cargarVinculosPorRol,
} from "../../core/procesoF7DB";
import { traducirError, badgeDe } from "../../core/procesoF7Domain";
import {
  ProcPageHeader, ProcButton, ProcCard, ProcDataTable, ProcStatusBadge, ProcModal, ProcField, inputStyle,
  ProcLoadingState, ProcErrorState, ProcEmptyState,
} from "../components/base";
import { C, sp } from "../estilos";
import { formatKg, formatNum, formatFecha, formatFechaHora, formatPct, normalizarNombre } from "../format";

const kg = (n) => (n == null ? "—" : formatNum(n));
const pct = (n) => formatPct(n);

export default function Informes() {
  const { empresa, planta, temporada, ir, puedeEditar, notificar } = useService();
  const [modo, setModo] = useState("informes"); // informes | pendientes
  const [informes, setInformes] = useState([]); const [pend, setPend] = useState([]);
  const [estado, setEstado] = useState("idle"); const [error, setError] = useState(null);
  const [sel, setSel] = useState([]); const [gen, setGen] = useState(null); const [clientes, setClientes] = useState([]);
  const editable = puedeEditar("informes") || puedeEditar("centro");

  const cargar = useCallback(async () => {
    if (!empresa) { setEstado("idle"); return; }
    setEstado("loading"); setError(null);
    try {
      const [inf, pd] = await Promise.all([
        cargarInformeListado(empresa, planta ? `&planta_id=eq.${planta}` : ""),
        cargarOrdenesInformables(empresa, `&informada=eq.false${planta ? `&planta_id=eq.${planta}` : ""}`),
      ]);
      setInformes(inf || []); setPend(pd || []); setEstado("ok");
    } catch (e) { setError(traducirError(e)); setEstado("error"); }
  }, [empresa, planta]);
  useEffect(() => { cargar(); }, [cargar]);

  const toggle = (oid) => setSel(sel.includes(oid) ? sel.filter((x) => x !== oid) : [...sel, oid]);
  const abrirGen = async () => {
    if (sel.length === 0) return notificar("Seleccioná al menos una orden", "error");
    setGen({ destinatario: "", observaciones: "" });
    setClientes(await cargarVinculosPorRol(empresa, "cliente_servicio").catch(() => []));
  };
  const generar = async () => {
    try {
      const folio = await siguienteCorrelativo({ empresaId: empresa, temporada: temporada || "s-t", tipo: "INF" });
      const infId = await crearInforme({ empresaId: empresa, folio, temporada: temporada || "s-t", plantaId: planta, destinatarioVinculoId: gen.destinatario || null });
      await generarVersion({ empresaId: empresa, informeId: infId, ordenIds: sel, observaciones: gen.observaciones || null });
      notificar(`Informe ${folio} generado`); setGen(null); setSel([]); ir("informe_detalle", { id: infId });
    } catch (e) { notificar(traducirError(e), "error"); }
  };

  if (!empresa) return <div><ProcPageHeader titulo="Resultados de Proceso" /><ProcCard style={{ padding: sp.lg }}><ProcEmptyState icono="📄" titulo="Seleccioná un tenant" /></ProcCard></div>;

  const tab = (id, l, n) => <div onClick={() => setModo(id)} style={{ padding: "7px 14px", borderRadius: 8, cursor: "pointer", fontSize: 13.5, fontWeight: modo === id ? 700 : 500, color: modo === id ? C.primary : C.text, background: modo === id ? C.infoBg : "transparent" }}>{l}{n != null ? ` (${n})` : ""}</div>;

  return (
    <div>
      <ProcPageHeader titulo="Resultados de Proceso" subtitulo="El documento que Allegria Service entrega a sus clientes" />
      <div style={{ display: "flex", gap: sp.sm, marginBottom: sp.md, alignItems: "center", flexWrap: "wrap" }}>
        {tab("informes", "Informes", informes.length)}{tab("pendientes", "Pendientes de generar", pend.length)}
        {modo === "pendientes" && editable && sel.length > 0 && <ProcButton onClick={abrirGen} style={{ marginLeft: "auto" }}>Generar informe ({sel.length})</ProcButton>}
      </div>

      {estado === "loading" ? <ProcLoadingState /> : estado === "error" ? <ProcErrorState error={error} onRetry={cargar} /> :
        modo === "informes" ? (
          <ProcDataTable
            columnas={[
              { titulo: "Folio", render: (i) => <b>{i.folio}</b> },
              { titulo: "Destinatario", render: (i) => normalizarNombre(i.destinatario) },
              { titulo: "Versión", align: "right", campo: "version_actual" },
              { titulo: "Kg proc.", align: "right", render: (i) => kg(i.kg_procesados) },
              { titulo: "Packout", align: "right", render: (i) => pct(i.packout) },
              { titulo: "Estado versión", render: (i) => (i.estado_version ? <ProcStatusBadge estado={i.estado_version} /> : "—") },
              { titulo: "Emitido", render: (i) => (i.emitido_at ? formatFecha(i.emitido_at) : "—") },
              { titulo: "", align: "right", render: (i) => <ProcButton kind="ghost" small onClick={() => ir("informe_detalle", { id: i.id })}>Abrir</ProcButton> },
            ]}
            filas={informes} rowKey="id"
            vacio={<ProcEmptyState icono="📄" titulo="Sin informes" detalle="Generá un Resultado de Proceso desde las órdenes pendientes." />} />
        ) : (
          <ProcDataTable
            columnas={[
              { titulo: "", render: (o) => editable ? <input type="checkbox" checked={sel.includes(o.orden_id)} onChange={() => toggle(o.orden_id)} /> : null },
              { titulo: "Orden", render: (o) => <b>{o.folio}</b> },
              { titulo: "Fecha", render: (o) => (o.fecha ? formatFecha(o.fecha) : "—") },
              { titulo: "Cliente", render: (o) => normalizarNombre(o.cliente) }, { titulo: "Especie", campo: "especie_codigo" },
              { titulo: "Kg proc.", align: "right", render: (o) => kg(o.kg_procesados) },
              { titulo: "Packout", align: "right", render: (o) => pct(o.packout) },
              { titulo: "Estado", render: (o) => <ProcStatusBadge estado={o.estado} /> },
            ]}
            filas={pend} rowKey="orden_id"
            vacio={<ProcEmptyState icono="✅" titulo="Nada pendiente" detalle="Todas las órdenes cerradas ya fueron informadas." />} />
        )}

      {gen && (
        <ProcModal titulo={`Generar informe (${sel.length} órdenes)`} onClose={() => setGen(null)}
          acciones={<><ProcButton kind="ghost" onClick={() => setGen(null)}>Cancelar</ProcButton><ProcButton onClick={generar}>Generar</ProcButton></>}>
          <div style={{ fontSize: 12.5, color: C.muted, marginBottom: sp.md }}>La consolidación (packout, kg) la calcula el backend de forma ponderada. Fuentes explícitas: {sel.length} orden(es).</div>
          <ProcField label="Destinatario principal" hint="Desde proc_vinculo (no Frisku). Foods puede ser cliente vía vínculo Service.">
            <select style={inputStyle} value={gen.destinatario} onChange={(e) => setGen((x) => ({ ...x, destinatario: e.target.value }))}><option value="">—</option>{clientes.map((c) => <option key={c.id} value={c.id}>{normalizarNombre(c.nombre_provisional)}</option>)}</select>
          </ProcField>
          <ProcField label="Observaciones (borrador)"><textarea style={{ ...inputStyle, minHeight: 60 }} value={gen.observaciones} onChange={(e) => setGen((x) => ({ ...x, observaciones: e.target.value }))} /></ProcField>
        </ProcModal>
      )}
    </div>
  );
}
