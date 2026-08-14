/* eslint-disable */
// src/proceso/ui/pages/Repaletizaje.jsx — transformación física N:M (split/merge/
// parcial). Motor único proc_fn_repaletizar; backend valida balance y decide
// validez. Parcial: el pallet origen conserva su saldo. No recalcula stock.
import React, { useEffect, useState, useCallback } from "react";
import { useService } from "../hooks/useServiceContext";
import {
  cargarBodega, cargarLineasPallet, crearPallet, repaletizar, cargarUbicacionesActivas, siguienteCorrelativo,
} from "../../core/procesoF7DB";
import { traducirError } from "../../core/procesoF7Domain";
import {
  ProcPageHeader, ProcCard, ProcButton, ProcField, inputStyle, ProcStatusBadge,
  ProcLoadingState, ProcErrorState, ProcEmptyState,
} from "../components/base";
import { C, sp } from "../estilos";

const n = (x) => Number(x) || 0;
const kg = (x) => `${n(x).toLocaleString("es-CL")} kg`;

export default function Repaletizaje() {
  const { empresa, planta, temporada, ir, vista, notificar } = useService();
  const [pallets, setPallets] = useState([]); const [ubis, setUbis] = useState([]);
  const [estado, setEstado] = useState("loading"); const [error, setError] = useState(null);
  const [origenIds, setOrigenIds] = useState(vista?.params?.origen ? [vista.params.origen] : []);
  const [lineas, setLineas] = useState({}); // palletId -> [{id, pt_id, kg}]
  const [destinos, setDestinos] = useState([{ tipo: "nuevo", ubicacion_id: "" }]);
  const [moves, setMoves] = useState([]); // {origen, pt_id, kg, cajas, destinoIdx}
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(async () => {
    if (!empresa) { setEstado("idle"); return; }
    setEstado("loading"); setError(null);
    try {
      const [b, u] = await Promise.all([cargarBodega(empresa, planta ? `&planta_id=eq.${planta}` : ""), cargarUbicacionesActivas(empresa, planta)]);
      setPallets((b || []).filter((p) => n(p.disponible) > 0)); setUbis(u || []); setEstado("ok");
    } catch (e) { setError(traducirError(e)); setEstado("error"); }
  }, [empresa, planta]);
  useEffect(() => { cargar(); }, [cargar]);

  const toggleOrigen = async (pid) => {
    if (origenIds.includes(pid)) { setOrigenIds(origenIds.filter((x) => x !== pid)); }
    else {
      setOrigenIds([...origenIds, pid]);
      if (!lineas[pid]) { const ln = await cargarLineasPallet(empresa, pid); setLineas((x) => ({ ...x, [pid]: (ln || []).filter((l) => l.estado === "activa") })); }
    }
  };
  const addDestino = () => setDestinos([...destinos, { tipo: "nuevo", ubicacion_id: "" }]);
  const addMove = () => setMoves([...moves, { origen: origenIds[0] || "", pt_id: "", kg: "", cajas: "", destinoIdx: 0 }]);
  const setMove = (i, k, v) => setMoves(moves.map((m, idx) => idx === i ? { ...m, [k]: v } : m));
  const setDest = (i, k, v) => setDestinos(destinos.map((d, idx) => idx === i ? { ...d, [k]: v } : d));

  const totalOrigen = moves.reduce((a, m) => a + n(m.kg), 0);
  const porDestino = destinos.map((_, di) => moves.filter((m) => m.destinoIdx === di).reduce((a, m) => a + n(m.kg), 0));

  const ejecutar = async () => {
    if (moves.length === 0) return notificar("Agregá al menos un movimiento", "error");
    setGuardando(true);
    try {
      // crear pallets destino nuevos
      const destIds = [];
      for (const d of destinos) {
        if (d.tipo === "existente") { destIds.push(d.pallet_id); }
        else {
          const codigo = await siguienteCorrelativo({ empresaId: empresa, temporada: temporada || "s-t", tipo: "PAL" });
          const pid = await crearPallet({ empresaId: empresa, codigo, temporada: temporada || "s-t", plantaId: planta, ubicacionId: d.ubicacion_id || null });
          destIds.push(pid);
        }
      }
      const jsonMoves = moves.map((m) => ({ origen_pallet_id: m.origen, pt_id: m.pt_id, cajas: n(m.cajas), kg: n(m.kg), destino_pallet_id: destIds[m.destinoIdx] }));
      await repaletizar({ empresaId: empresa, motivo: "repaletizaje", tipo: "repaletizaje", moves: jsonMoves });
      notificar("Repaletizaje ejecutado ✓");
      ir("bodega");
    } catch (e) { notificar(traducirError(e), "error"); setGuardando(false); }
  };

  if (!empresa) return <div><ProcPageHeader titulo="Repaletizaje" /><ProcCard style={{ padding: sp.lg }}><ProcEmptyState icono="🔀" titulo="Seleccioná un tenant" /></ProcCard></div>;
  if (estado === "loading") return <ProcLoadingState />;
  if (estado === "error") return <ProcErrorState error={error} onRetry={cargar} />;

  const lineasOrigen = origenIds.flatMap((pid) => (lineas[pid] || []).map((l) => ({ ...l, pallet: pid, palletCod: (pallets.find((p) => p.pallet_id === pid) || {}).codigo })));

  return (
    <div>
      <ProcPageHeader titulo="Repaletizaje" subtitulo="Transformación física N:M (split / merge / parcial)"
        acciones={<ProcButton kind="ghost" onClick={() => ir("bodega")}>← Bodega</ProcButton>} />

      <ProcCard style={{ padding: sp.lg, marginBottom: sp.md }}>
        <div style={{ fontSize: 14, fontWeight: 800, marginBottom: sp.sm }}>1 · Pallets origen</div>
        <div style={{ maxHeight: 180, overflowY: "auto", border: `1px solid ${C.border}`, borderRadius: 8 }}>
          {pallets.length === 0 ? <ProcEmptyState titulo="Sin pallets con saldo" /> : pallets.map((p) => (
            <label key={p.pallet_id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", borderBottom: `1px solid ${C.border}`, fontSize: 13, cursor: "pointer" }}>
              <input type="checkbox" checked={origenIds.includes(p.pallet_id)} onChange={() => toggleOrigen(p.pallet_id)} />
              <b>{p.codigo}</b><span style={{ color: C.muted }}>· {p.especie_codigo} · {p.ubicacion || "—"} · disp {kg(p.disponible)}</span>
            </label>
          ))}
        </div>
      </ProcCard>

      <ProcCard style={{ padding: sp.lg, marginBottom: sp.md }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: sp.sm }}>
          <div style={{ fontSize: 14, fontWeight: 800 }}>2 · Pallets destino</div>
          <ProcButton small kind="ghost" onClick={addDestino}>+ Destino</ProcButton>
        </div>
        {destinos.map((d, i) => (
          <div key={i} style={{ display: "grid", gridTemplateColumns: "60px 1fr 1fr", gap: sp.sm, alignItems: "end", marginBottom: sp.sm }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: C.primary }}>D{i + 1}</div>
            <ProcField label="Tipo"><select style={inputStyle} value={d.tipo} onChange={(e) => setDest(i, "tipo", e.target.value)}><option value="nuevo">Nuevo</option><option value="existente">Existente</option></select></ProcField>
            {d.tipo === "nuevo"
              ? <ProcField label="Ubicación"><select style={inputStyle} value={d.ubicacion_id} onChange={(e) => setDest(i, "ubicacion_id", e.target.value)}><option value="">—</option>{ubis.map((u) => <option key={u.id} value={u.id}>{u.nombre || u.codigo}</option>)}</select></ProcField>
              : <ProcField label="Pallet"><select style={inputStyle} value={d.pallet_id || ""} onChange={(e) => setDest(i, "pallet_id", e.target.value)}><option value="">—</option>{pallets.map((p) => <option key={p.pallet_id} value={p.pallet_id}>{p.codigo}</option>)}</select></ProcField>}
          </div>
        ))}
      </ProcCard>

      <ProcCard style={{ padding: sp.lg, marginBottom: sp.md }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: sp.sm }}>
          <div style={{ fontSize: 14, fontWeight: 800 }}>3 · Movimientos</div>
          <ProcButton small kind="ghost" onClick={addMove} disabled={lineasOrigen.length === 0}>+ Movimiento</ProcButton>
        </div>
        {moves.length === 0 ? <div style={{ color: C.muted2, fontSize: 13 }}>Agregá movimientos origen → destino.</div> :
          moves.map((m, i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "2fr 90px 90px 90px", gap: sp.sm, alignItems: "end", marginBottom: sp.sm }}>
              <ProcField label="Origen (pallet · PT)"><select style={inputStyle} value={`${m.origen}|${m.pt_id}`} onChange={(e) => { const [o, pt] = e.target.value.split("|"); setMove(i, "origen", o); setMove(i, "pt_id", pt); }}>
                <option value="|">—</option>
                {lineasOrigen.map((l) => <option key={l.id} value={`${l.pallet}|${l.pt_id}`}>{l.palletCod} · PT {l.pt_id.slice(0, 6)} · {kg(l.kg)}</option>)}
              </select></ProcField>
              <ProcField label="Kg"><input style={inputStyle} type="number" value={m.kg} onChange={(e) => setMove(i, "kg", e.target.value)} /></ProcField>
              <ProcField label="Cajas"><input style={inputStyle} type="number" value={m.cajas} onChange={(e) => setMove(i, "cajas", e.target.value)} /></ProcField>
              <ProcField label="Destino"><select style={inputStyle} value={m.destinoIdx} onChange={(e) => setMove(i, "destinoIdx", Number(e.target.value))}>{destinos.map((_, di) => <option key={di} value={di}>D{di + 1}</option>)}</select></ProcField>
            </div>
          ))}
      </ProcCard>

      <ProcCard style={{ padding: sp.lg, marginBottom: sp.md }}>
        <div style={{ fontSize: 14, fontWeight: 800, marginBottom: sp.sm }}>Balance</div>
        <div style={{ display: "flex", gap: sp.xl, flexWrap: "wrap", fontSize: 13 }}>
          <div>Total movido: <b>{kg(totalOrigen)}</b></div>
          {destinos.map((_, di) => <div key={di}>D{di + 1}: <b>{kg(porDestino[di])}</b></div>)}
        </div>
        <div style={{ fontSize: 11.5, color: C.muted2, marginTop: 6 }}>El backend valida el balance (Σ origen = Σ destino), la suficiencia de cada línea y preserva el saldo parcial del origen.</div>
      </ProcCard>

      <div style={{ textAlign: "right" }}>
        <ProcButton onClick={ejecutar} disabled={guardando || moves.length === 0}>{guardando ? "Ejecutando…" : "Ejecutar repaletizaje"}</ProcButton>
      </div>
    </div>
  );
}
