/* eslint-disable */
// src/proceso/ui/layout/ProcShell.jsx — sub-shell del módulo Allegria Service.
// Navegación por estado (no router), barra de contexto operacional (tenant/planta/
// temporada/fecha) y área de contenido. Solo Centro + Configuración son funcionales
// en F7.1; el resto muestra estado "próxima fase" honesto.
import React, { useEffect, useState } from "react";
import { useService } from "../hooks/useServiceContext";
import { cargarPlantas, cargarTemporadas } from "../../core/procesoDB";
import { ProcButton, ProcToast } from "../components/base";
import { C, sp } from "../estilos";
import CentroOperaciones from "../pages/CentroOperaciones";
import Configuracion from "../pages/Configuracion";
import ProximaFase from "../pages/ProximaFase";

const NAV = [
  { grupo: null, items: [{ id: "centro", label: "Centro de Operaciones", icon: "🏭" }] },
  { grupo: "Operación", items: [
    { id: "recepciones", label: "Recepciones", fase: "F7.2" },
    { id: "lotes", label: "Lotes / Materia Prima", fase: "F7.2" },
    { id: "qc", label: "QC", fase: "F7.2" },
    { id: "programa", label: "Programa", fase: "F7.3" },
    { id: "ordenes", label: "Órdenes", fase: "F7.3" }] },
  { grupo: "Producción", items: [
    { id: "ejecucion", label: "Ejecución", fase: "F7.3" },
    { id: "resultados", label: "Resultados", fase: "F7.3" },
    { id: "conciliaciones", label: "Conciliaciones", fase: "F7.3" }] },
  { grupo: "Producto Terminado", items: [
    { id: "pt", label: "Producto Terminado", fase: "F7.4" },
    { id: "pallets", label: "Pallets", fase: "F7.4" },
    { id: "inventario", label: "Inventario / Ubicaciones", fase: "F7.4" },
    { id: "repaletizaje", label: "Repaletizaje", fase: "F7.4" }] },
  { grupo: "Despacho", items: [
    { id: "preparacion", label: "Preparación", fase: "F7.5" },
    { id: "despachos", label: "Despachos", fase: "F7.5" },
    { id: "historial", label: "Historial", fase: "F7.5" }] },
  { grupo: "Clientes", items: [
    { id: "vinculos", label: "Vínculos", fase: "F7.1", page: "config" },
    { id: "resultados_proc", label: "Resultados de Proceso", fase: "F7.6" },
    { id: "informes", label: "Informes enviados", fase: "F7.6" }] },
  { grupo: "Comercial", items: [
    { id: "tarifario", label: "Tarifario", fase: "F7.7" },
    { id: "servicios", label: "Servicios Facturables", fase: "F7.7" },
    { id: "pendientes", label: "Pendientes de Tarifa", fase: "F7.7" },
    { id: "bases", label: "Bases de Cobro", fase: "F7.7" }] },
  { grupo: null, items: [{ id: "config", label: "Configuración", icon: "⚙️" }] },
];

function useEsMovil(bp = 900) {
  const [m, setM] = useState(typeof window !== "undefined" && window.innerWidth < bp);
  useEffect(() => { const f = () => setM(window.innerWidth < bp); window.addEventListener("resize", f); return () => window.removeEventListener("resize", f); }, [bp]);
  return m;
}

function BarraContexto() {
  const { empresa, setEmpresa, planta, setPlanta, temporada, setTemporada, fecha, setFecha } = useService();
  const [plantas, setPlantas] = useState([]);
  const [temps, setTemps] = useState([]);
  useEffect(() => {
    if (!empresa) { setPlantas([]); setTemps([]); return; }
    cargarPlantas(empresa).then(setPlantas).catch(() => setPlantas([]));
    cargarTemporadas(empresa).then(setTemps).catch(() => setTemps([]));
  }, [empresa]);
  const inp = { padding: "6px 8px", fontSize: 12.5, border: `1px solid ${C.border}`, borderRadius: 7, background: C.card, color: C.text, fontFamily: C.font };
  return (
    <div style={{ display: "flex", gap: sp.sm, flexWrap: "wrap", alignItems: "center" }}>
      <input style={{ ...inp, width: 210 }} placeholder="Tenant (empresa_id)" value={empresa || ""} onChange={(e) => setEmpresa(e.target.value.trim() || null)} title="La empresa/tenant provendrá del login autenticado (claim empresa_id). En F7.1 se ingresa manual." />
      <select style={inp} value={planta || ""} onChange={(e) => setPlanta(e.target.value || null)}>
        <option value="">Todas las plantas</option>
        {plantas.map((p) => <option key={p.id} value={p.id}>{p.nombre || p.codigo}</option>)}
      </select>
      <select style={inp} value={temporada || ""} onChange={(e) => setTemporada(e.target.value || null)}>
        <option value="">Toda temporada</option>
        {temps.map((t) => <option key={t.id} value={t.codigo}>{t.codigo}</option>)}
      </select>
      <input style={inp} type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
    </div>
  );
}

export default function ProcShell({ onBack, onLogout, usuario }) {
  const { toast } = useService();
  const [activo, setActivo] = useState({ id: "centro", page: "centro" });
  const esMovil = useEsMovil();

  const render = () => {
    const page = activo.page || activo.id;
    if (page === "centro") return <CentroOperaciones />;
    if (page === "config") return <Configuracion />;
    const item = NAV.flatMap((g) => g.items).find((i) => i.id === activo.id);
    return <ProximaFase titulo={item?.label || "Sección"} fase={item?.fase || "próxima fase"} />;
  };

  const Sidebar = (
    <div style={{ width: esMovil ? "100%" : 232, flexShrink: 0, borderRight: esMovil ? "none" : `1px solid ${C.border}`, background: C.card, padding: sp.md, boxSizing: "border-box", ...(esMovil ? {} : { minHeight: "100vh" }) }}>
      {!esMovil && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: sp.lg, padding: "0 4px" }}>
          <span style={{ fontSize: 22 }}>🍒</span>
          <div><div style={{ fontWeight: 800, fontSize: 14, color: C.text }}>Allegria Service</div>
            <div style={{ fontSize: 11, color: C.muted }}>Proceso de fruta fresca</div></div>
        </div>
      )}
      {esMovil ? (
        <select style={{ width: "100%", padding: 8, borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13 }}
          value={activo.id} onChange={(e) => { const it = NAV.flatMap((g) => g.items).find((i) => i.id === e.target.value); setActivo({ id: it.id, page: it.page }); }}>
          {NAV.flatMap((g) => g.items).map((i) => <option key={i.id} value={i.id}>{i.label}</option>)}
        </select>
      ) : NAV.map((g, gi) => (
        <div key={gi} style={{ marginBottom: sp.md }}>
          {g.grupo && <div style={{ fontSize: 10.5, fontWeight: 800, color: C.muted2, textTransform: "uppercase", letterSpacing: .5, margin: "6px 6px 4px" }}>{g.grupo}</div>}
          {g.items.map((i) => {
            const on = activo.id === i.id;
            return (
              <div key={i.id} onClick={() => setActivo({ id: i.id, page: i.page })} style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                padding: "7px 10px", borderRadius: 8, cursor: "pointer", fontSize: 13,
                fontWeight: on ? 700 : 500, color: on ? C.primary : C.text, background: on ? C.infoBg : "transparent",
              }}>
                <span>{i.icon ? `${i.icon} ` : ""}{i.label}</span>
                {i.fase && i.fase !== "F7.1" && !on && <span style={{ fontSize: 9.5, color: C.muted2, fontWeight: 700 }}>{i.fase}</span>}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );

  return (
    <div style={{ display: esMovil ? "block" : "flex", background: C.bg, minHeight: "100vh", fontFamily: C.font }}>
      {Sidebar}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: sp.md, flexWrap: "wrap",
          padding: "10px 16px", borderBottom: `1px solid ${C.border}`, background: C.card, position: "sticky", top: 0, zIndex: 10 }}>
          <BarraContexto />
          <div style={{ display: "flex", gap: sp.sm, alignItems: "center" }}>
            {usuario?.nombre && <span style={{ fontSize: 12, color: C.muted }}>{usuario.nombre}</span>}
            {onBack && <ProcButton kind="ghost" small onClick={onBack}>← Volver</ProcButton>}
            {onLogout && <ProcButton kind="ghost" small onClick={onLogout}>Salir</ProcButton>}
          </div>
        </div>
        <div style={{ padding: sp.xl, maxWidth: 1240, margin: "0 auto" }}>{render()}</div>
      </div>
      <ProcToast toast={toast} />
    </div>
  );
}
