/* eslint-disable */
// src/proceso/ui/pages/ProductoTerminado.jsx
// Materializar PT desde resultado conciliado (sin sobreasignación: backend
// valida contra kg_disponible) + PT pendiente de palletizar + palletizar.
import React, { useEffect, useState, useCallback } from "react";
import { useService } from "../hooks/useServiceContext";
import {
  cargarResultadoMaterializable, cargarPTOperacional, materializarPT, cargarFormatos,
  cargarBodega, crearPallet, palletizar, cargarUbicacionesActivas, siguienteCorrelativo,
} from "../../core/procesoF7DB";
import { traducirError } from "../../core/procesoF7Domain";
import {
  ProcPageHeader, ProcCard, ProcButton, ProcDataTable, ProcStatusBadge, ProcModal, ProcField, inputStyle,
  ProcLoadingState, ProcErrorState, ProcEmptyState,
} from "../components/base";
import { C, sp } from "../estilos";
import { formatKg, formatNum, formatFecha, formatFechaHora } from "../format";

const kg = (n) => formatKg(n);

export default function ProductoTerminado() {
  const { empresa, planta, temporada, puedeEditar, notificar } = useService();
  const [modo, setModo] = useState("materializar"); // materializar | pt
  const [mat, setMat] = useState([]); const [pts, setPts] = useState([]);
  const [estado, setEstado] = useState("idle"); const [error, setError] = useState(null);
  const [formatos, setFormatos] = useState([]);
  const [matForm, setMatForm] = useState(null); // {resultado, formato_id, cajas, kg}
  const [palForm, setPalForm] = useState(null); // {pt, modo:'nuevo'|'existente', ...}
  const editable = puedeEditar("pt") || puedeEditar("centro");

  const cargar = useCallback(async () => {
    if (!empresa) { setEstado("idle"); return; }
    setEstado("loading"); setError(null);
    try {
      const [m, p] = await Promise.all([cargarResultadoMaterializable(empresa), cargarPTOperacional(empresa)]);
      setMat((m || []).filter((r) => ["conciliado", "cerrado"].includes(r.orden_estado)));
      setPts(p || []); setEstado("ok");
    } catch (e) { setError(traducirError(e)); setEstado("error"); }
  }, [empresa]);
  useEffect(() => { cargar(); }, [cargar]);

  const abrirMat = async (r) => {
    setMatForm({ resultado: r, formato_id: "", cajas: "", kg: r.kg_disponible });
    setFormatos(await cargarFormatos(empresa, r.especie_codigo));
  };
  const guardarMat = async () => {
    if (!(Number(matForm.kg) > 0)) return notificar("Kg debe ser > 0", "error");
    try {
      await materializarPT({ empresaId: empresa, resultadoId: matForm.resultado.resultado_id, formatoId: matForm.formato_id || null, cajas: Number(matForm.cajas) || 0, kg: Number(matForm.kg) });
      notificar("PT materializado ✓"); setMatForm(null); cargar();
    } catch (e) { notificar(traducirError(e), "error"); }
  };

  const abrirPal = async (pt) => {
    const [bod, ubis] = await Promise.all([cargarBodega(empresa, `&estado=in.(armando,disponible)`), cargarUbicacionesActivas(empresa, planta)]);
    setPalForm({ pt, modo: "nuevo", pallet_id: "", codigo: "", ubicacion_id: "", cajas: "", kg: pt.on_hand, pallets: bod || [], ubicaciones: ubis || [] });
  };
  const guardarPal = async () => {
    if (!(Number(palForm.kg) > 0)) return notificar("Kg debe ser > 0", "error");
    try {
      let palletId = palForm.pallet_id;
      if (palForm.modo === "nuevo") {
        const codigo = await siguienteCorrelativo({ empresaId: empresa, temporada: temporada || "s-t", tipo: "PAL" });
        palletId = await crearPallet({ empresaId: empresa, codigo, temporada: temporada || "s-t", plantaId: planta, formatoId: palForm.pt.formato_id, ubicacionId: palForm.ubicacion_id || null });
      }
      if (!palletId) return notificar("Seleccioná o creá un pallet", "error");
      await palletizar({ empresaId: empresa, ptId: palForm.pt.pt_id, palletId, cajas: Number(palForm.cajas) || 0, kg: Number(palForm.kg) });
      notificar("Palletizado ✓"); setPalForm(null); cargar();
    } catch (e) { notificar(traducirError(e), "error"); }
  };

  if (!empresa) return <div><ProcPageHeader titulo="Producto Terminado" /><ProcCard style={{ padding: sp.lg }}><ProcEmptyState icono="📦" titulo="Seleccioná un tenant" /></ProcCard></div>;

  const tab = (id, l) => <div onClick={() => setModo(id)} style={{ padding: "7px 14px", borderRadius: 8, cursor: "pointer", fontSize: 13.5, fontWeight: modo === id ? 700 : 500, color: modo === id ? C.primary : C.text, background: modo === id ? C.infoBg : "transparent" }}>{l}</div>;

  return (
    <div>
      <ProcPageHeader titulo="Producto Terminado" subtitulo="Materializar desde resultado · palletizar" />
      <div style={{ display: "flex", gap: sp.sm, marginBottom: sp.md }}>{tab("materializar", "Materializable")}{tab("pt", "PT pendiente de palletizar")}</div>

      {estado === "loading" ? <ProcLoadingState /> : estado === "error" ? <ProcErrorState error={error} onRetry={cargar} /> :
        modo === "materializar" ? (
          <ProcDataTable
            columnas={[
              { titulo: "Orden", campo: "orden_folio" },
              { titulo: "Categoría", campo: "categoria" }, { titulo: "Calibre", campo: "calibre" }, { titulo: "Color", campo: "color" },
              { titulo: "Kg resultado", align: "right", render: (r) => kg(r.kg_resultado) },
              { titulo: "Materializado", align: "right", render: (r) => kg(r.kg_materializado) },
              { titulo: "Disponible", align: "right", render: (r) => <b>{kg(r.kg_disponible)}</b> },
              { titulo: "", align: "right", render: (r) => editable ? <ProcButton small onClick={() => abrirMat(r)}>Materializar</ProcButton> : null },
            ]}
            filas={mat} rowKey="resultado_id"
            vacio={<ProcEmptyState icono="📦" titulo="Nada por materializar" detalle="No hay resultado conciliado con saldo disponible. Cerrá una orden en Producción primero." />} />
        ) : (
          <ProcDataTable
            columnas={[
              { titulo: "Orden", campo: "orden_folio" }, { titulo: "Especie/var.", render: (p) => `${p.especie_codigo || "—"} ${p.variedad_codigo || ""}` },
              { titulo: "Categoría", campo: "categoria" }, { titulo: "Calibre", campo: "calibre" }, { titulo: "Formato", campo: "formato" },
              { titulo: "Cajas", align: "right", campo: "cajas" }, { titulo: "Kg", align: "right", render: (p) => kg(p.kg) },
              { titulo: "Pendiente", align: "right", render: (p) => <b>{kg(p.on_hand)}</b> },
              { titulo: "", align: "right", render: (p) => editable && Number(p.on_hand) > 0 ? <ProcButton small onClick={() => abrirPal(p)}>Palletizar</ProcButton> : null },
            ]}
            filas={pts} rowKey="pt_id"
            vacio={<ProcEmptyState icono="📦" titulo="Sin PT" detalle="Materializá producto terminado desde un resultado." />} />
        )}

      {matForm && (
        <ProcModal titulo={`Materializar PT · ${matForm.resultado.orden_folio}`} onClose={() => setMatForm(null)}
          acciones={<><ProcButton kind="ghost" onClick={() => setMatForm(null)}>Cancelar</ProcButton><ProcButton onClick={guardarMat}>Materializar</ProcButton></>}>
          <div style={{ fontSize: 12.5, color: C.muted, marginBottom: sp.md }}>Disponible: <b>{kg(matForm.resultado.kg_disponible)}</b> (backend rechaza sobreasignación)</div>
          <ProcField label="Formato"><select style={inputStyle} value={matForm.formato_id} onChange={(e) => setMatForm((x) => ({ ...x, formato_id: e.target.value }))}><option value="">—</option>{formatos.map((f) => <option key={f.id} value={f.id}>{f.codigo} · {f.kg_nominal_caja}kg</option>)}</select></ProcField>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: sp.sm }}>
            <ProcField label="Cajas"><input style={inputStyle} type="number" value={matForm.cajas} onChange={(e) => setMatForm((x) => ({ ...x, cajas: e.target.value }))} /></ProcField>
            <ProcField label="Kg"><input style={inputStyle} type="number" value={matForm.kg} onChange={(e) => setMatForm((x) => ({ ...x, kg: e.target.value }))} /></ProcField>
          </div>
        </ProcModal>
      )}

      {palForm && (
        <ProcModal titulo="Palletizar PT" onClose={() => setPalForm(null)}
          acciones={<><ProcButton kind="ghost" onClick={() => setPalForm(null)}>Cancelar</ProcButton><ProcButton onClick={guardarPal}>Palletizar</ProcButton></>}>
          <div style={{ fontSize: 12.5, color: C.muted, marginBottom: sp.md }}>PT pendiente: <b>{kg(palForm.pt.on_hand)}</b></div>
          <div style={{ display: "flex", gap: sp.md, marginBottom: sp.md }}>
            <label style={{ fontSize: 13 }}><input type="radio" checked={palForm.modo === "nuevo"} onChange={() => setPalForm((x) => ({ ...x, modo: "nuevo" }))} /> Pallet nuevo</label>
            <label style={{ fontSize: 13 }}><input type="radio" checked={palForm.modo === "existente"} onChange={() => setPalForm((x) => ({ ...x, modo: "existente" }))} /> Pallet existente (mixto)</label>
          </div>
          {palForm.modo === "nuevo" ? (
            <ProcField label="Ubicación inicial"><select style={inputStyle} value={palForm.ubicacion_id} onChange={(e) => setPalForm((x) => ({ ...x, ubicacion_id: e.target.value }))}><option value="">—</option>{palForm.ubicaciones.map((u) => <option key={u.id} value={u.id}>{u.nombre || u.codigo}</option>)}</select></ProcField>
          ) : (
            <ProcField label="Pallet destino"><select style={inputStyle} value={palForm.pallet_id} onChange={(e) => setPalForm((x) => ({ ...x, pallet_id: e.target.value }))}><option value="">—</option>{palForm.pallets.map((p) => <option key={p.pallet_id} value={p.pallet_id}>{p.codigo} · {p.ubicacion || "—"} · {kg(p.kg_fisico)}</option>)}</select></ProcField>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: sp.sm }}>
            <ProcField label="Cajas"><input style={inputStyle} type="number" value={palForm.cajas} onChange={(e) => setPalForm((x) => ({ ...x, cajas: e.target.value }))} /></ProcField>
            <ProcField label="Kg"><input style={inputStyle} type="number" value={palForm.kg} onChange={(e) => setPalForm((x) => ({ ...x, kg: e.target.value }))} /></ProcField>
          </div>
        </ProcModal>
      )}
    </div>
  );
}
