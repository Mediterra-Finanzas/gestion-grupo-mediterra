/* eslint-disable */
// src/proceso/ui/pages/Envases.jsx — PROC-ENVASES-001 · control de envases retornables.
// Sub-tabs: Resumen · Movimientos · Saldos · Registrar. Backend = autoridad (saldo/concurrencia).
// Saldos derivados del ledger append-only (proc_envase_movimiento). Referencias humanas, cero UUID.
import React, { useEffect, useState, useCallback, useMemo } from "react";
import { useService } from "../hooks/useServiceContext";
import { cargarTiposEnvase, cargarEnvaseSaldos, cargarEnvaseMovimientos, registrarEnvaseMovimiento } from "../../core/procesoEnvasesDB";
import { cargarVinculosPorRol, cargarUbicacionesActivas } from "../../core/procesoF7DB";
import { traducirError, NATURALEZA_ENVASE_LABEL, NATURALEZA_ENVASE_TONO, NATURALEZA_ENVASE_OPCIONES,
  resumenEnvases, ahoraOperacional, TZ_OPERACIONAL } from "../../core/procesoF7Domain";
import {
  ProcPageHeader, ProcCard, ProcButton, ProcField, inputStyle, ProcStatusBadge, ProcKpiCard,
  ProcDataTable, ProcEmptyState, ProcLoadingState, ProcErrorState, ProcFilters,
} from "../components/base";
import { C, sp } from "../estilos";
import { normalizarNombre, formatNum, formatFechaHora } from "../format";

const ROLES = ["propietario_planta", "cliente_servicio", "productor", "exportadora"];
const TABS = [["resumen", "Resumen"], ["movimientos", "Movimientos"], ["saldos", "Saldos"], ["registrar", "Registrar"]];
const nombreV = (v) => normalizarNombre(v?.nombre_provisional) || "—";

export default function Envases() {
  const { empresa, planta, puedeEditar, notificar, usuario } = useService();
  const editable = puedeEditar("recepciones") || puedeEditar("centro") || puedeEditar("config");
  const [tab, setTab] = useState("resumen");
  const [tipos, setTipos] = useState([]);
  const [vinc, setVinc] = useState([]);
  const [ubic, setUbic] = useState([]);
  const [saldos, setSaldos] = useState([]);
  const [movs, setMovs] = useState([]);
  const [estado, setEstado] = useState("idle");
  const [error, setError] = useState(null);

  const cargarRefs = useCallback(async () => {
    if (!empresa) return;
    const rs = await Promise.all(ROLES.map((r) => cargarVinculosPorRol(empresa, r).catch(() => [])));
    setVinc(rs.flat().filter(Boolean));
    cargarTiposEnvase(empresa).then(setTipos).catch(() => setTipos([]));
    cargarUbicacionesActivas(empresa, planta).then(setUbic).catch(() => setUbic([]));
  }, [empresa, planta]);

  const cargarDatos = useCallback(async () => {
    if (!empresa) { setEstado("idle"); return; }
    setEstado("loading"); setError(null);
    try {
      const [s, m] = await Promise.all([cargarEnvaseSaldos(empresa), cargarEnvaseMovimientos(empresa)]);
      setSaldos(s || []); setMovs(m || []); setEstado("ok");
    } catch (e) { setError(traducirError(e)); setEstado("error"); }
  }, [empresa]);

  useEffect(() => { cargarRefs(); }, [cargarRefs]);
  useEffect(() => { cargarDatos(); }, [cargarDatos]);

  const servicio = useMemo(() => vinc.find((v) => v.rol_operacional === "propietario_planta"), [vinc]);
  const kpi = useMemo(() => resumenEnvases(saldos), [saldos]);

  if (!empresa) return <div><ProcPageHeader titulo="Envases" /><ProcCard style={{ padding: sp.lg }}><ProcEmptyState icono="📦" titulo="Seleccioná un tenant" /></ProcCard></div>;

  return (
    <div>
      <ProcPageHeader titulo="Envases retornables" subtitulo="Bins, totes, rejillas — custodia, saldos y devoluciones"
        acciones={editable ? <ProcButton onClick={() => setTab("registrar")}>+ Registrar movimiento</ProcButton> : null} />

      <div style={{ display: "flex", gap: 4, marginBottom: sp.md, flexWrap: "wrap" }}>
        {TABS.map(([k, l]) => (
          <ProcButton key={k} kind={tab === k ? "primary" : "ghost"} small onClick={() => setTab(k)}>{l}</ProcButton>
        ))}
      </div>

      {estado === "loading" ? <ProcLoadingState /> :
       estado === "error" ? <ProcErrorState error={error} onRetry={cargarDatos} /> :
       <>
         {tab === "resumen" && <Resumen kpi={kpi} saldos={saldos} />}
         {tab === "movimientos" && <Movimientos movs={movs} tipos={tipos} vinc={vinc} />}
         {tab === "saldos" && <Saldos saldos={saldos} />}
         {tab === "registrar" && <Registrar {...{ empresa, tipos, vinc, ubic, servicio, editable, usuario, notificar,
            onDone: () => { cargarDatos(); setTab("movimientos"); } }} />}
       </>}
    </div>
  );
}

// ── Resumen: KPIs + saldos por contraparte ──────────────────────────────────
function Resumen({ kpi, saldos }) {
  const porContraparte = useMemo(() => {
    const map = {};
    for (const r of saldos) {
      const k = `${r.owner_nombre || "∅"}|${r.tipo_codigo}|${r.holder_es_service ? "svc" : "ext"}|${r.condicion}`;
      map[k] = map[k] || { owner: r.owner_nombre, owner_rol: r.owner_rol, tipo: r.tipo_nombre || r.tipo_codigo,
        holder: r.holder_nombre, es_service: r.holder_es_service, condicion: r.condicion, saldo: 0 };
      map[k].saldo += Number(r.saldo) || 0;
    }
    return Object.values(map).filter((x) => x.saldo !== 0).sort((a, b) => b.saldo - a.saldo);
  }, [saldos]);
  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(200px,1fr))", gap: sp.md, marginBottom: sp.md }}>
        <ProcKpiCard label="En custodia de Service" valor={formatNum(kpi.enService, 0)} tono="success" />
        <ProcKpiCard label="Nuestros en terceros" valor={formatNum(kpi.nuestrosEnTerceros, 0)} tono="primary" />
        <ProcKpiCard label="Pendientes de devolución" valor={formatNum(kpi.pendientesDevolucion, 0)} tono="warning" />
        <ProcKpiCard label="Dañados" valor={formatNum(kpi.danados, 0)} tono="danger" />
      </div>
      <ProcCard style={{ padding: sp.lg }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: C.text, marginBottom: sp.sm }}>Saldos por contraparte</div>
        <ProcDataTable rowKey={(r) => `${r.owner}|${r.tipo}|${r.es_service}|${r.condicion}`}
          columnas={[
            { titulo: "Propietario", render: (r) => normalizarNombre(r.owner) || <span style={{ color: C.muted2, fontStyle: "italic" }}>no informado</span> },
            { titulo: "Tipo", campo: "tipo" },
            { titulo: "Tenedor", render: (r) => r.es_service ? <ProcStatusBadge texto="Allegria Service" tono="success" /> : (normalizarNombre(r.holder) || "tercero") },
            { titulo: "Condición", render: (r) => r.condicion === "danado" ? <ProcStatusBadge texto="Dañado" tono="warning" /> : "Normal" },
            { titulo: "Cantidad", align: "right", render: (r) => <b>{formatNum(r.saldo, 0)}</b> },
          ]}
          filas={porContraparte}
          vacio={<ProcEmptyState icono="📦" titulo="Sin saldos de envases" detalle="Registrá un ingreso o una apertura para empezar." />} />
      </ProcCard>
    </>
  );
}

// ── Movimientos: ledger con filtros ─────────────────────────────────────────
function Movimientos({ movs, tipos, vinc }) {
  const [f, setF] = useState({ tipo: "", naturaleza: "", owner: "" });
  const [txt, setTxt] = useState("");
  const filtradas = useMemo(() => movs.filter((m) => {
    if (f.tipo && m.tipo_envase_id !== f.tipo) return false;
    if (f.naturaleza && m.naturaleza !== f.naturaleza) return false;
    if (f.owner && m.owner_vinculo_id !== f.owner) return false;
    if (txt) { const s = [m.tipo_codigo, m.owner_nombre, m.holder_desde_nombre, m.holder_hacia_nombre, m.motivo].join(" ").toLowerCase(); if (!s.includes(txt.toLowerCase())) return false; }
    return true;
  }), [movs, f, txt]);
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  return (
    <ProcCard style={{ padding: sp.md }}>
      <ProcFilters busqueda={txt} onBusqueda={setTxt} placeholder="Buscar tipo/contraparte/motivo…"
        filtros={[
          { key: "tipo", label: "Tipo", valor: f.tipo, onChange: (v) => set("tipo", v), opciones: [{ v: "", l: "Todos los tipos" }, ...tipos.map((t) => ({ v: t.id, l: t.nombre }))] },
          { key: "naturaleza", label: "Movimiento", valor: f.naturaleza, onChange: (v) => set("naturaleza", v), opciones: [{ v: "", l: "Todo movimiento" }, ...NATURALEZA_ENVASE_OPCIONES.map((n) => ({ v: n, l: NATURALEZA_ENVASE_LABEL[n] }))] },
          { key: "owner", label: "Propietario", valor: f.owner, onChange: (v) => set("owner", v), opciones: [{ v: "", l: "Todo propietario" }, ...vinc.map((v) => ({ v: v.id, l: nombreV(v) }))] },
        ]}
        onReset={() => { setTxt(""); setF({ tipo: "", naturaleza: "", owner: "" }); }} />
      <ProcDataTable rowKey="id"
        columnas={[
          { titulo: "Fecha", render: (m) => formatFechaHora(m.fecha) },
          { titulo: "Movimiento", render: (m) => <ProcStatusBadge texto={NATURALEZA_ENVASE_LABEL[m.naturaleza] || m.naturaleza} tono={NATURALEZA_ENVASE_TONO[m.naturaleza] || "neutral"} /> },
          { titulo: "Tipo", campo: "tipo_codigo" },
          { titulo: "Cantidad", align: "right", render: (m) => formatNum(m.cantidad, 0) },
          { titulo: "Propietario", render: (m) => normalizarNombre(m.owner_nombre) || "—" },
          { titulo: "Desde", render: (m) => normalizarNombre(m.holder_desde_nombre) || (m.ubicacion_desde_nombre || "exterior") },
          { titulo: "Hacia", render: (m) => normalizarNombre(m.holder_hacia_nombre) || (m.ubicacion_hacia_nombre || "exterior") },
          { titulo: "Ref", render: (m) => m.ref_tipo || "—" },
        ]}
        filas={filtradas} vacio={<ProcEmptyState icono="📦" titulo="Sin movimientos" />} />
    </ProcCard>
  );
}

// ── Saldos: en Service / en terceros ────────────────────────────────────────
function Saldos({ saldos }) {
  const [vista, setVista] = useState("service");
  const filas = useMemo(() => saldos.filter((r) => vista === "service" ? r.holder_es_service : !r.holder_es_service), [saldos, vista]);
  return (
    <ProcCard style={{ padding: sp.md }}>
      <div style={{ display: "flex", gap: 4, marginBottom: sp.md }}>
        <ProcButton kind={vista === "service" ? "primary" : "ghost"} small onClick={() => setVista("service")}>En Allegria Service</ProcButton>
        <ProcButton kind={vista === "terceros" ? "primary" : "ghost"} small onClick={() => setVista("terceros")}>En terceros (nuestros)</ProcButton>
      </div>
      <ProcDataTable rowKey={(r) => `${r.tipo_envase_id}|${r.owner_vinculo_id}|${r.holder_vinculo_id}|${r.ubicacion_id}|${r.condicion}`}
        columnas={[
          { titulo: "Tipo", campo: "tipo_codigo" },
          { titulo: "Propietario", render: (r) => normalizarNombre(r.owner_nombre) || <span style={{ color: C.muted2, fontStyle: "italic" }}>no informado</span> },
          { titulo: "Tenedor", render: (r) => normalizarNombre(r.holder_nombre) || "—" },
          { titulo: "Ubicación", render: (r) => r.ubicacion_nombre || "—" },
          { titulo: "Condición", render: (r) => r.condicion === "danado" ? <ProcStatusBadge texto="Dañado" tono="warning" /> : "Normal" },
          { titulo: "Saldo", align: "right", render: (r) => <b>{formatNum(r.saldo, 0)}</b> },
        ]}
        filas={filas} vacio={<ProcEmptyState icono="📦" titulo={vista === "service" ? "Sin envases en custodia" : "Sin envases nuestros en terceros"} />} />
    </ProcCard>
  );
}

// ── Registrar movimiento (form contextual; backend valida saldo) ────────────
function Registrar({ empresa, tipos, vinc, ubic, servicio, editable, usuario, notificar, onDone }) {
  const ahora = ahoraOperacional();
  const [f, setF] = useState({ naturaleza: "ingreso", tipoId: "", cantidad: "", ownerId: "",
    holderDesdeId: "", holderHaciaId: "", ubicDesdeId: "", ubicHaciaId: "",
    condicionDesde: "normal", condicionHacia: "normal", motivo: "", fecha: ahora.fecha, hora: ahora.hora });
  const [guardando, setGuardando] = useState(false);
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const svcId = servicio?.id || "";

  // Defaults por naturaleza (críticos primero; el backend valida todo lo demás).
  const aplicarNaturaleza = (n) => setF((x) => {
    const y = { ...x, naturaleza: n };
    if (n === "ingreso" || n === "apertura") { y.holderHaciaId = svcId; y.holderDesdeId = ""; y.condicionHacia = "normal"; }
    else if (n === "salida" || n === "perdida" || n === "baja") { y.holderDesdeId = svcId; y.holderHaciaId = ""; }
    else if (n === "transferencia") { y.holderDesdeId = svcId; y.holderHaciaId = svcId; }
    else if (n === "dano") { y.holderDesdeId = svcId; y.holderHaciaId = svcId; y.condicionDesde = "normal"; y.condicionHacia = "danado"; }
    return y;
  });

  const necesitaMotivo = ["ajuste", "dano", "perdida", "baja"].includes(f.naturaleza);
  const esTransfer = f.naturaleza === "transferencia";
  const usaDesde = ["salida", "transferencia", "dano", "perdida", "baja"].includes(f.naturaleza) || f.naturaleza === "ajuste";
  const usaHacia = ["ingreso", "apertura", "transferencia", "dano"].includes(f.naturaleza) || f.naturaleza === "ajuste";

  const vincOpts = [{ v: "", l: "—" }, ...vinc.map((v) => ({ v: v.id, l: `${nombreV(v)} · ${v.rol_operacional}` }))];
  const ubicOpts = [{ v: "", l: "—" }, ...ubic.map((u) => ({ v: u.id, l: u.nombre || u.codigo }))];

  const guardar = async () => {
    if (!f.tipoId) return notificar("Elegí el tipo de envase", "error");
    if (!f.cantidad || Number(f.cantidad) <= 0) return notificar("Cantidad debe ser > 0", "error");
    if (necesitaMotivo && !f.motivo.trim()) return notificar("Este movimiento exige un motivo", "error");
    setGuardando(true);
    try {
      await registrarEnvaseMovimiento({
        empresaId: empresa, tipoId: f.tipoId, cantidad: Number(f.cantidad), naturaleza: f.naturaleza,
        ownerId: f.ownerId || null, holderDesdeId: f.holderDesdeId || null, holderHaciaId: f.holderHaciaId || null,
        ubicDesdeId: f.ubicDesdeId || null, ubicHaciaId: f.ubicHaciaId || null,
        condicionDesde: f.condicionDesde, condicionHacia: f.condicionHacia,
        refTipo: "manual", motivo: f.motivo || null, actor: usuario?.id || null,
        fechaOperacional: f.fecha && f.hora ? `${f.fecha}T${f.hora}` : null,
      });
      notificar("Movimiento de envases registrado");
      onDone();
    } catch (e) { notificar(traducirError(e), "error"); }
    finally { setGuardando(false); }
  };

  if (!editable) return <ProcCard style={{ padding: sp.lg }}><ProcEmptyState titulo="Sin permiso" detalle="No tenés permiso para registrar movimientos de envases." /></ProcCard>;

  const Sel = ({ label, k, opciones, hint }) => (
    <ProcField label={label} hint={hint}><select style={inputStyle} value={f[k]} onChange={(e) => set(k, e.target.value)}>{opciones.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}</select></ProcField>
  );

  return (
    <ProcCard style={{ padding: sp.lg }}>
      <div style={{ fontSize: 15, fontWeight: 800, color: C.text, marginBottom: sp.md }}>Registrar movimiento de envases</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))", gap: sp.md }}>
        <ProcField label="Movimiento" requerido><select style={inputStyle} value={f.naturaleza} onChange={(e) => aplicarNaturaleza(e.target.value)}>{NATURALEZA_ENVASE_OPCIONES.map((n) => <option key={n} value={n}>{NATURALEZA_ENVASE_LABEL[n]}</option>)}</select></ProcField>
        <Sel label="Tipo de envase" k="tipoId" opciones={[{ v: "", l: "—" }, ...tipos.map((t) => ({ v: t.id, l: `${t.codigo} · ${t.nombre}` }))]} />
        <ProcField label="Cantidad" requerido><input style={inputStyle} type="number" value={f.cantidad} onChange={(e) => set("cantidad", e.target.value)} /></ProcField>
        <Sel label="Propietario" k="ownerId" opciones={vincOpts} hint="Vacío = desconocido/no informado" />
        {usaDesde && <Sel label="Desde (tenedor)" k="holderDesdeId" opciones={vincOpts} hint="Vacío = exterior/no rastreado" />}
        {usaDesde && <Sel label="Ubicación origen" k="ubicDesdeId" opciones={ubicOpts} />}
        {usaHacia && <Sel label="Hacia (tenedor)" k="holderHaciaId" opciones={vincOpts} hint="Vacío = exterior" />}
        {usaHacia && <Sel label="Ubicación destino" k="ubicHaciaId" opciones={ubicOpts} />}
        {(f.naturaleza === "dano" || f.naturaleza === "baja") && <Sel label="Condición origen" k="condicionDesde" opciones={[{ v: "normal", l: "Normal" }, { v: "danado", l: "Dañado" }]} />}
        {f.naturaleza === "dano" && <Sel label="Condición destino" k="condicionHacia" opciones={[{ v: "normal", l: "Normal" }, { v: "danado", l: "Dañado" }]} />}
        <ProcField label={`Motivo${necesitaMotivo ? " *" : ""}`}><input style={inputStyle} value={f.motivo} onChange={(e) => set("motivo", e.target.value)} /></ProcField>
        <ProcField label="Fecha operacional" hint={`Zona horaria: ${TZ_OPERACIONAL}`}><input style={inputStyle} type="date" value={f.fecha} onChange={(e) => set("fecha", e.target.value)} /></ProcField>
        <ProcField label="Hora operacional"><input style={inputStyle} type="time" value={f.hora} onChange={(e) => set("hora", e.target.value)} /></ProcField>
      </div>
      <div style={{ marginTop: sp.md, display: "flex", justifyContent: "flex-end" }}>
        <ProcButton onClick={guardar} disabled={guardando}>{guardando ? "Registrando…" : "Registrar movimiento"}</ProcButton>
      </div>
    </ProcCard>
  );
}
