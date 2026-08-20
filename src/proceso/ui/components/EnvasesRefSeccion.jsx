/* eslint-disable */
// src/proceso/ui/components/EnvasesRefSeccion.jsx — PROC-ENVASES-001 E4/E6.
// Sección OPCIONAL de envases ligada a una Recepción (ingreso) o Despacho (salida). Reutilizable.
// Genera movimientos en el ledger de envases (ref_tipo=recepcion|despacho). NO mezcla kg de fruta.
// No bloquea el flujo si no se informan envases. Backend valida saldo/concurrencia.
import React, { useEffect, useState, useCallback } from "react";
import { cargarTiposEnvase, cargarEnvaseMovimientos, registrarEnvaseMovimiento } from "../../core/procesoEnvasesDB";
import { cargarVinculosPorRol, cargarUbicacionesActivas } from "../../core/procesoF7DB";
import { traducirError, NATURALEZA_ENVASE_LABEL } from "../../core/procesoF7Domain";
import { ProcCard, ProcButton, ProcField, inputStyle, ProcDataTable, ProcEmptyState, ProcStatusBadge } from "./base";
import { C, sp } from "../estilos";
import { normalizarNombre, formatNum } from "../format";

const ROLES = ["propietario_planta", "cliente_servicio", "productor", "exportadora"];
const nombreV = (v) => normalizarNombre(v?.nombre_provisional) || "—";

// refTipo: 'recepcion' | 'despacho'. En recepción los envases INGRESAN a custodia Service; en
// despacho SALEN de custodia Service (entrega/devolución).
export default function EnvasesRefSeccion({ empresa, planta, refTipo, refId, editable, notificar, usuario }) {
  const esIngreso = refTipo === "recepcion";
  const [tipos, setTipos] = useState([]);
  const [vinc, setVinc] = useState([]);
  const [ubic, setUbic] = useState([]);
  const [movs, setMovs] = useState([]);
  const [nl, setNl] = useState({ tipoId: "", cantidad: "", ownerId: "", ubicId: "" });
  const [guardando, setGuardando] = useState(false);

  const cargarMovs = useCallback(() => {
    if (!empresa || !refId) return;
    cargarEnvaseMovimientos(empresa, `&ref_id=eq.${refId}`).then(setMovs).catch(() => setMovs([]));
  }, [empresa, refId]);

  useEffect(() => {
    if (!empresa) return;
    Promise.all(ROLES.map((r) => cargarVinculosPorRol(empresa, r).catch(() => []))).then((rs) => setVinc(rs.flat().filter(Boolean)));
    cargarTiposEnvase(empresa).then(setTipos).catch(() => setTipos([]));
    cargarUbicacionesActivas(empresa, planta).then(setUbic).catch(() => setUbic([]));
  }, [empresa, planta]);
  useEffect(() => { cargarMovs(); }, [cargarMovs]);

  const servicio = vinc.find((v) => v.rol_operacional === "propietario_planta");
  const set = (k, v) => setNl((x) => ({ ...x, [k]: v }));

  const agregar = async () => {
    if (!nl.tipoId) return notificar("Elegí el tipo de envase", "error");
    if (!nl.cantidad || Number(nl.cantidad) <= 0) return notificar("Cantidad debe ser > 0", "error");
    if (!nl.ubicId) return notificar(esIngreso ? "Elegí ubicación destino" : "Elegí ubicación origen", "error");
    if (!servicio) return notificar("No hay identidad de Allegria Service configurada (vínculo propietario_planta)", "error");
    setGuardando(true);
    try {
      await registrarEnvaseMovimiento({
        empresaId: empresa, tipoId: nl.tipoId, cantidad: Number(nl.cantidad),
        naturaleza: esIngreso ? "ingreso" : "salida", ownerId: nl.ownerId || null,
        holderDesdeId: esIngreso ? null : servicio.id, holderHaciaId: esIngreso ? servicio.id : null,
        ubicDesdeId: esIngreso ? null : nl.ubicId, ubicHaciaId: esIngreso ? nl.ubicId : null,
        refTipo, refId, actor: usuario?.id || null,
      });
      setNl({ tipoId: "", cantidad: "", ownerId: "", ubicId: "" });
      cargarMovs();
      notificar(`Envase ${esIngreso ? "recibido" : "entregado"} registrado`);
    } catch (e) { notificar(traducirError(e), "error"); }
    finally { setGuardando(false); }
  };

  return (
    <ProcCard style={{ padding: sp.lg, marginBottom: sp.md }}>
      <div style={{ fontSize: 15, fontWeight: 800, color: C.text, marginBottom: 4 }}>{esIngreso ? "Envases recibidos" : "Envases entregados / devueltos"}</div>
      <div style={{ fontSize: 12, color: C.muted, marginBottom: sp.md }}>Opcional. Envases retornables (bins, totes, rejillas) asociados a este {esIngreso ? "recepción" : "despacho"}. No se mezcla con los kg de fruta.</div>
      {editable && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(180px,1fr))", gap: sp.sm, marginBottom: sp.md }}>
          <ProcField label="Tipo"><select style={inputStyle} value={nl.tipoId} onChange={(e) => set("tipoId", e.target.value)}><option value="">—</option>{tipos.map((t) => <option key={t.id} value={t.id}>{t.codigo} · {t.nombre}</option>)}</select></ProcField>
          <ProcField label="Cantidad"><input style={inputStyle} type="number" value={nl.cantidad} onChange={(e) => set("cantidad", e.target.value)} /></ProcField>
          <ProcField label="Propietario" hint="Vacío = no informado"><select style={inputStyle} value={nl.ownerId} onChange={(e) => set("ownerId", e.target.value)}><option value="">—</option>{vinc.map((v) => <option key={v.id} value={v.id}>{nombreV(v)} · {v.rol_operacional}</option>)}</select></ProcField>
          <ProcField label={esIngreso ? "Ubicación destino" : "Ubicación origen"}><select style={inputStyle} value={nl.ubicId} onChange={(e) => set("ubicId", e.target.value)}><option value="">—</option>{ubic.map((u) => <option key={u.id} value={u.id}>{u.nombre || u.codigo}</option>)}</select></ProcField>
          <div style={{ display: "flex", alignItems: "end" }}><ProcButton small onClick={agregar} disabled={guardando}>+ Agregar envase</ProcButton></div>
        </div>
      )}
      <ProcDataTable rowKey="id"
        columnas={[
          { titulo: "Tipo", campo: "tipo_codigo" },
          { titulo: "Movimiento", render: (m) => <ProcStatusBadge texto={NATURALEZA_ENVASE_LABEL[m.naturaleza] || m.naturaleza} tono={esIngreso ? "success" : "warning"} /> },
          { titulo: "Cantidad", align: "right", render: (m) => formatNum(m.cantidad, 0) },
          { titulo: "Propietario", render: (m) => normalizarNombre(m.owner_nombre) || "—" },
        ]}
        filas={movs} vacio={<ProcEmptyState icono="📦" titulo="Sin envases informados" detalle="Opcional: agregá los envases retornables si corresponde." />} />
    </ProcCard>
  );
}
