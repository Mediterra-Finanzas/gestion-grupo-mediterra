/* eslint-disable */
// src/proceso/ui/layout/ProcShell.jsx — sub-shell del módulo Allegria Service.
// Navegación por estado (contexto: vista/ir), barra de contexto operacional
// (tenant/planta/temporada/fecha) y área de contenido. F7.2 habilita el flujo
// Recepción + QC + Lotes; el resto muestra estado "próxima fase" honesto.
import React, { useEffect, useState } from "react";
import { useService } from "../hooks/useServiceContext";
import { cargarPlantas, cargarTemporadas } from "../../core/procesoDB";
import { ProcButton, ProcToast } from "../components/base";
import { C, sp } from "../estilos";
import CentroOperaciones from "../pages/CentroOperaciones";
import Configuracion from "../pages/Configuracion";
import ProximaFase from "../pages/ProximaFase";
import Recepciones from "../pages/Recepciones";
import NuevaRecepcion from "../pages/NuevaRecepcion";
import RecepcionDetalle from "../pages/RecepcionDetalle";
import Lotes from "../pages/Lotes";
import LoteDetalle from "../pages/LoteDetalle";
import Programa from "../pages/Programa";
import Ordenes from "../pages/Ordenes";
import Orden from "../pages/Orden";
import ProductoTerminado from "../pages/ProductoTerminado";
import Bodega from "../pages/Bodega";
import PalletDetalle from "../pages/PalletDetalle";
import Repaletizaje from "../pages/Repaletizaje";
import Despachos from "../pages/Despachos";
import Despacho from "../pages/Despacho";
import Informes from "../pages/Informes";
import InformeDetalle from "../pages/InformeDetalle";
import Clientes from "../pages/Clientes";
import ClienteFicha from "../pages/ClienteFicha";
import Tarifario from "../pages/Tarifario";
import ServiciosFacturables from "../pages/ServiciosFacturables";
import BasesCobro from "../pages/BasesCobro";
import BaseCobroDetalle from "../pages/BaseCobroDetalle";

const NAV = [
  { grupo: null, items: [{ id: "centro", label: "Centro de Operaciones", icon: "🏭" }] },
  { grupo: "Operación", items: [
    { id: "recepciones", label: "Recepciones" },
    { id: "lotes", label: "Lotes / Materia Prima" },
    { id: "qc", label: "QC", page: "recepciones", params: { filtroQc: "rechazado" } },
    { id: "programa", label: "Programa" },
    { id: "ordenes", label: "Órdenes" }] },
  { grupo: "Producción", items: [
    { id: "ejecucion", label: "Ejecución", page: "ordenes", params: { filtroEstado: "en_proceso" } },
    { id: "resultados", label: "Resultados", page: "ordenes" },
    { id: "conciliaciones", label: "Conciliaciones", page: "ordenes", params: { filtroEstado: "pendiente_conciliacion" } }] },
  { grupo: "Producto Terminado", items: [
    { id: "pt", label: "Producto Terminado" },
    { id: "pallets", label: "Bodega / Pallets", page: "bodega" },
    { id: "repaletizaje", label: "Repaletizaje" }] },
  { grupo: "Despacho", items: [
    { id: "preparacion", label: "Preparación", page: "despachos", params: { filtroEstado: "listo" } },
    { id: "despachos", label: "Despachos" },
    { id: "historial", label: "Historial", page: "despachos", params: { filtroEstado: "despachado" } }] },
  { grupo: "Clientes", items: [
    { id: "clientes", label: "Clientes Service" },
    { id: "vinculos", label: "Vínculos", page: "config" },
    { id: "resultados_proc", label: "Resultados de Proceso", page: "informes" },
    { id: "informes", label: "Informes / Envíos", page: "informes" }] },
  { grupo: "Comercial", items: [
    { id: "tarifario", label: "Tarifario" },
    { id: "servicios", label: "Servicios Facturables" },
    { id: "pendientes", label: "Pendientes de Tarifa" },
    { id: "bases", label: "Bases de Cobro" }] },
  { grupo: null, items: [{ id: "config", label: "Configuración", icon: "⚙️" }] },
];
const TODOS = NAV.flatMap((g) => g.items);
// mapea la vista actual al item de nav para el resaltado
const NAV_DE_PAGE = { recepcion_nueva: "recepciones", recepcion_detalle: "recepciones", lote_detalle: "lotes", orden: "ordenes", bodega: "pallets", pallet_detalle: "pallets", despacho: "despachos", informe_detalle: "resultados_proc", informes: "resultados_proc", base_cobro_detalle: "bases", cliente_ficha: "clientes" };

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
      <input style={{ ...inp, width: 210 }} placeholder="Tenant (empresa_id)" value={empresa || ""} onChange={(e) => setEmpresa(e.target.value.trim() || null)} title="La empresa/tenant provendrá del login autenticado (claim empresa_id). En F7.1/F7.2 se ingresa manual." />
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
  const { toast, vista, ir } = useService();
  const esMovil = useEsMovil();

  const render = () => {
    switch (vista.page) {
      case "centro": return <CentroOperaciones />;
      case "config": return <Configuracion />;
      case "recepciones": return <Recepciones />;
      case "recepcion_nueva": return <NuevaRecepcion />;
      case "recepcion_detalle": return <RecepcionDetalle />;
      case "lotes": return <Lotes />;
      case "lote_detalle": return <LoteDetalle />;
      case "programa": return <Programa />;
      case "ordenes": return <Ordenes />;
      case "orden": return <Orden />;
      case "pt": return <ProductoTerminado />;
      case "bodega": return <Bodega />;
      case "pallet_detalle": return <PalletDetalle />;
      case "repaletizaje": return <Repaletizaje />;
      case "despachos": return <Despachos />;
      case "despacho": return <Despacho />;
      case "informes": return <Informes />;
      case "informe_detalle": return <InformeDetalle />;
      case "clientes": return <Clientes />;
      case "cliente_ficha": return <ClienteFicha />;
      case "tarifario": return <Tarifario />;
      case "servicios": return <ServiciosFacturables />;
      case "pendientes": return <ServiciosFacturables soloPendientes />;
      case "bases": return <BasesCobro />;
      case "base_cobro_detalle": return <BaseCobroDetalle />;
      default: {
        const item = TODOS.find((i) => i.id === vista.page);
        return <ProximaFase titulo={item?.label || "Sección"} fase={item?.fase || "próxima fase"} />;
      }
    }
  };
  const activoId = NAV_DE_PAGE[vista.page] || vista.page;

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
          value={activoId} onChange={(e) => { const it = TODOS.find((i) => i.id === e.target.value); ir(it.page || it.id, it.params || {}); }}>
          {TODOS.map((i) => <option key={i.id} value={i.id}>{i.label}</option>)}
        </select>
      ) : NAV.map((g, gi) => (
        <div key={gi} style={{ marginBottom: sp.md }}>
          {g.grupo && <div style={{ fontSize: 10.5, fontWeight: 800, color: C.muted2, textTransform: "uppercase", letterSpacing: .5, margin: "6px 6px 4px" }}>{g.grupo}</div>}
          {g.items.map((i) => {
            const on = activoId === i.id;
            return (
              <div key={i.id} onClick={() => ir(i.page || i.id, i.params || {})} style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                padding: "7px 10px", borderRadius: 8, cursor: "pointer", fontSize: 13,
                fontWeight: on ? 700 : 500, color: on ? C.primary : C.text, background: on ? C.infoBg : "transparent",
              }}>
                <span>{i.icon ? `${i.icon} ` : ""}{i.label}</span>
                {i.fase && !on && <span style={{ fontSize: 9.5, color: C.muted2, fontWeight: 700 }}>{i.fase}</span>}
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
