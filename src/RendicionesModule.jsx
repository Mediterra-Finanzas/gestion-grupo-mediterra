/* eslint-disable */
// ═══════════════════════════════════════════════════════════════════
// RendicionesModule.jsx — Rendiciones de gasto de los trabajadores
// Se renderiza como pestaña "🧾 Rendiciones" DENTRO de FinanzasModule.
// Cada trabajador carga sus propios gastos con respaldos (boletas/facturas)
// y un aprobador (admin / CFO) revisa el workflow:
//   borrador → enviada → aprobada/rechazada → pagada
// Independiente del flujo de caja. Persiste en calendario_data id="rendiciones".
// Adjuntos en Supabase Storage (bucket frisku-docs, prefijo rendiciones/).
// ═══════════════════════════════════════════════════════════════════
import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { theme as T } from "./theme";
import {
  dbLoadGeneric, dbSaveGeneric,
  uploadArchivoFrisku, eliminarArchivoFrisku, pathDesdeUrlStorage,
  buscarTC,
} from "./friskuHelpers";

const C = { ...T };

// ── Constantes de negocio ──────────────────────────────────────────
const EMPRESAS = [
  "Mediterra Holding", "Allegria Foods", "Allegria Service", "Frisku Foods",
  "Osiris Plant Management", "Integrity Farms", "Allpa Farms Chile", "Allpa Farms Perú",
];

const CATEGORIAS = [
  { v: "movilizacion", l: "Movilización / Taxi", ic: "🚕" },
  { v: "combustible",  l: "Combustible",         ic: "⛽" },
  { v: "peajes",       l: "Peajes / TAG",        ic: "🛣️" },
  { v: "estacionamiento", l: "Estacionamiento",  ic: "🅿️" },
  { v: "alojamiento",  l: "Alojamiento",         ic: "🏨" },
  { v: "alimentacion", l: "Alimentación",        ic: "🍽️" },
  { v: "materiales",   l: "Materiales / Insumos", ic: "📦" },
  { v: "oficina",      l: "Útiles de oficina",   ic: "✏️" },
  { v: "courier",      l: "Courier / Encomiendas", ic: "📮" },
  { v: "telefonia",    l: "Telefonía / Internet", ic: "📱" },
  { v: "mantencion",   l: "Mantención vehículo",  ic: "🔧" },
  { v: "otros",        l: "Otros",               ic: "•" },
];
const CAT_MAP = Object.fromEntries(CATEGORIAS.map(c => [c.v, c]));

const MONEDAS = ["CLP", "USD", "PEN", "EUR"];

const TIPOS_DOC = ["Boleta", "Factura", "Boleta honorarios", "Voucher", "Ticket", "Sin documento", "Otro"];

const ESTADOS = {
  borrador:  { l: "Borrador",  color: C.muted,   bg: C.cardAlt,   ic: "📝" },
  enviada:   { l: "Enviada",   color: C.info,    bg: C.infoBg,    ic: "📤" },
  aprobada:  { l: "Aprobada",  color: C.success, bg: C.successBg, ic: "✅" },
  rechazada: { l: "Rechazada", color: C.danger,  bg: C.dangerBg,  ic: "❌" },
  pagada:    { l: "Pagada",    color: C.accent2, bg: C.accent2Bg, ic: "💵" },
};

// ── Helpers ────────────────────────────────────────────────────────
const uid = (p = "rnd") => `${p}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
const hoyISO = () => new Date().toISOString().slice(0, 10);
const nowISO = () => new Date().toISOString();

function fmtMonto(n, moneda = "CLP") {
  const v = Number(n) || 0;
  if (moneda === "CLP") return "$" + v.toLocaleString("es-CL", { maximumFractionDigits: 0 });
  const sym = moneda === "USD" ? "US$" : moneda === "EUR" ? "€" : moneda === "PEN" ? "S/" : "";
  return sym + v.toLocaleString("es-CL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtFecha(iso) {
  if (!iso) return "—";
  const d = new Date(iso.length <= 10 ? iso + "T12:00:00" : iso);
  if (isNaN(d)) return iso;
  return d.toLocaleDateString("es-CL", { day: "2-digit", month: "short", year: "numeric" });
}

// Suma de gastos agrupada por moneda → {CLP: 12000, USD: 30}
function totalesPorMoneda(gastos) {
  const t = {};
  (gastos || []).forEach(g => {
    const m = g.moneda || "CLP";
    t[m] = (t[m] || 0) + (Number(g.monto) || 0);
  });
  return t;
}
function fmtTotales(t) {
  const ks = Object.keys(t).filter(k => t[k]);
  if (!ks.length) return fmtMonto(0, "CLP");
  return ks.map(k => fmtMonto(t[k], k)).join("  +  ");
}

// Convierte un monto de `origen` a `destino` triangulando por USD cuando no
// existe el par directo. USD es el pivote del maestro de TC del proyecto.
// Retorna { ok, val, chain, usd, tASrc, tToDst } o { ok:false, chain, faltan }.
function convertir(monto, origen, destino, fecha, tcData) {
  const m = Number(monto) || 0;
  origen = origen || "CLP"; destino = destino || "CLP";
  if (origen === destino) return { ok: true, val: m, chain: null, usd: null };
  const directo = buscarTC(origen, destino, fecha, tcData);
  if (directo != null) return { ok: true, val: m * directo, chain: `${origen}→${destino}`, usd: null, rate: directo };
  // triangular vía USD: origen→USD→destino
  const aUSD = buscarTC(origen, "USD", fecha, tcData);
  const deUSD = buscarTC("USD", destino, fecha, tcData);
  if (aUSD != null && deUSD != null) {
    const usd = m * aUSD;
    return { ok: true, val: usd * deUSD, chain: `${origen}→USD→${destino}`, usd, tASrc: aUSD, tToDst: deUSD };
  }
  return { ok: false, val: null, chain: `${origen}→USD→${destino}`, faltan: { [`${origen}→USD`]: aUSD == null, [`USD→${destino}`]: deUSD == null } };
}

// Suma de gastos convertida a la moneda de pago. Devuelve total + faltantes de TC.
function totalConvertido(gastos, monedaPago, fecha, tcData) {
  let total = 0; const faltan = new Set();
  (gastos || []).forEach(g => {
    const r = convertir(g.monto, g.moneda || "CLP", monedaPago, fecha, tcData);
    if (r.ok) total += r.val;
    else Object.keys(r.faltan || {}).forEach(k => { if (r.faltan[k]) faltan.add(k); });
  });
  return { total, faltan: [...faltan] };
}

// ── UI primitivos ──────────────────────────────────────────────────
function Btn({ children, onClick, kind = "primary", small, disabled, style, title }) {
  const base = {
    primary:   { bg: C.primary, fg: "#fff", bd: C.primary },
    success:   { bg: C.success, fg: "#fff", bd: C.success },
    danger:    { bg: C.danger,  fg: "#fff", bd: C.danger },
    ghost:     { bg: C.card,    fg: C.text, bd: C.border },
    accent:    { bg: C.accent2, fg: "#fff", bd: C.accent2 },
  }[kind] || { bg: C.primary, fg: "#fff", bd: C.primary };
  return (
    <button onClick={onClick} disabled={disabled} title={title}
      style={{
        padding: small ? "5px 11px" : "8px 16px", borderRadius: 8,
        border: `1px solid ${base.bd}`, background: disabled ? C.cardAlt : base.bg,
        color: disabled ? C.muted2 : base.fg, cursor: disabled ? "not-allowed" : "pointer",
        fontWeight: 600, fontSize: small ? 12 : 13, whiteSpace: "nowrap", ...style,
      }}>
      {children}
    </button>
  );
}

function Badge({ children, color, bg, style }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 9px",
      borderRadius: 999, fontSize: 11.5, fontWeight: 700, color, background: bg,
      border: `1px solid ${color}33`, ...style,
    }}>{children}</span>
  );
}

function EstadoBadge({ estado }) {
  const e = ESTADOS[estado] || ESTADOS.borrador;
  return <Badge color={e.color} bg={e.bg}>{e.ic} {e.l}</Badge>;
}

function Field({ label, children, style }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4, ...style }}>
      <span style={{ fontSize: 11.5, fontWeight: 700, color: C.muted }}>{label}</span>
      {children}
    </label>
  );
}
const inputStyle = {
  padding: "7px 10px", borderRadius: 8, border: `1px solid ${C.border}`,
  fontSize: 13, outline: "none", background: C.card, color: C.text, boxSizing: "border-box", width: "100%",
};

function Modal({ children, onClose, width = 720, title }) {
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "#0007", zIndex: 400, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "40px 16px", overflowY: "auto" }}>
      <div onClick={e => e.stopPropagation()} style={{ background: C.card, borderRadius: 14, width, maxWidth: "100%", boxShadow: "0 12px 48px #0004" }}>
        {title && (
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 22px", borderBottom: `1px solid ${C.border}` }}>
            <div style={{ fontWeight: 800, fontSize: 16, color: C.text }}>{title}</div>
            <button onClick={onClose} style={{ border: "none", background: "none", fontSize: 22, cursor: "pointer", color: C.muted, lineHeight: 1 }}>×</button>
          </div>
        )}
        <div style={{ padding: 22 }}>{children}</div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Componente principal
// ═══════════════════════════════════════════════════════════════════
export default function RendicionesModule({ usuarioActual, esAdmin, esSoloConsulta, tabPermisos, onBack, onLogout }) {
  const nombreUsuario = usuarioActual?.nombre || "—";
  const admin = typeof esAdmin === "function" ? esAdmin(nombreUsuario) : !!esAdmin;
  const esCFO = !!usuarioActual?.esCFO;
  const esAprobador = admin || esCFO;

  const [rendiciones, setRendiciones] = useState([]);
  const [tcData, setTcData] = useState({});
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [tab, setTab] = useState("mis");
  const [editId, setEditId] = useState(null);   // rendición abierta en el editor
  const [revisar, setRevisar] = useState(null);  // {id, accion:"aprobar"|"rechazar"}
  const [comentario, setComentario] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("todos");
  const [busca, setBusca] = useState("");

  // ── Carga inicial ──
  useEffect(() => {
    let alive = true;
    (async () => {
      const [data, tc] = await Promise.all([
        dbLoadGeneric("rendiciones"),
        dbLoadGeneric("maestro_tc"),
      ]);
      if (alive) {
        setRendiciones(Array.isArray(data) ? data : []);
        setTcData(tc && typeof tc === "object" ? tc : {});
        setCargando(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  // ── Auto-save (debounce 1s) ──
  const timer = useRef(null);
  const primero = useRef(true);
  useEffect(() => {
    if (cargando) return;
    if (primero.current) { primero.current = false; return; }
    if (timer.current) clearTimeout(timer.current);
    setGuardando(true);
    timer.current = setTimeout(async () => {
      await dbSaveGeneric("rendiciones", rendiciones);
      setGuardando(false);
    }, 1000);
  }, [rendiciones]); // eslint-disable-line

  // ── Mutadores ──
  const upsert = useCallback((rend) => {
    setRendiciones(prev => {
      const i = prev.findIndex(r => r.id === rend.id);
      if (i === -1) return [rend, ...prev];
      const cp = [...prev]; cp[i] = rend; return cp;
    });
  }, []);

  const pushHist = (r, accion, comentario = "") => ({
    ...r,
    historial: [...(r.historial || []), { accion, usuario: nombreUsuario, fecha: nowISO(), comentario }],
  });

  const nextFolio = () => (rendiciones.reduce((m, r) => Math.max(m, r.folio || 0), 0) + 1);

  const crearRendicion = () => {
    const r = {
      id: uid(), folio: nextFolio(),
      trabajador: nombreUsuario, trabajadorEmail: usuarioActual?.email || "", cargo: usuarioActual?.cargo || "",
      empresa: EMPRESAS[0], titulo: "", periodo: hoyISO(),
      monedaPago: "CLP", fechaTC: hoyISO(),
      estado: "borrador", gastos: [], comentarioRevisor: "",
      creadoEn: nowISO(), enviadoEn: null, revisadoEn: null, revisadoPor: null, pagadoEn: null, pagadoPor: null,
      historial: [{ accion: "creada", usuario: nombreUsuario, fecha: nowISO(), comentario: "" }],
    };
    upsert(r);
    setEditId(r.id);
  };

  const eliminarRendicion = async (r) => {
    if (!window.confirm(`¿Eliminar rendición #${r.folio} "${r.titulo || "sin título"}"? Esta acción no se puede deshacer.`)) return;
    // borrar adjuntos del storage
    for (const g of (r.gastos || [])) {
      const p = pathDesdeUrlStorage(g.adjuntoUrl);
      if (p) await eliminarArchivoFrisku(p);
    }
    setRendiciones(prev => prev.filter(x => x.id !== r.id));
    if (editId === r.id) setEditId(null);
  };

  const enviar = (r) => {
    if (!r.titulo?.trim()) { alert("Ponle un título/glosa a la rendición antes de enviarla."); return; }
    if (!(r.gastos || []).length) { alert("Agrega al menos un gasto antes de enviar."); return; }
    const faltaMonto = r.gastos.some(g => !(Number(g.monto) > 0));
    if (faltaMonto) { alert("Hay gastos sin monto. Complétalos antes de enviar."); return; }
    upsert(pushHist({ ...r, estado: "enviada", enviadoEn: nowISO() }, "enviada"));
    setEditId(null);
  };

  const aprobarRechazar = (r, accion, coment) => {
    const estado = accion === "aprobar" ? "aprobada" : "rechazada";
    upsert(pushHist({
      ...r, estado, comentarioRevisor: coment || "",
      revisadoEn: nowISO(), revisadoPor: nombreUsuario,
    }, estado, coment));
  };

  const marcarPagada = (r) => {
    upsert(pushHist({ ...r, estado: "pagada", pagadoEn: nowISO(), pagadoPor: nombreUsuario }, "pagada"));
  };

  // ── Vistas derivadas ──
  const misRendiciones = useMemo(
    () => rendiciones.filter(r => r.trabajador === nombreUsuario).sort((a, b) => (b.folio || 0) - (a.folio || 0)),
    [rendiciones, nombreUsuario]
  );
  const porAprobar = useMemo(
    () => rendiciones.filter(r => r.estado === "enviada").sort((a, b) => new Date(a.enviadoEn || 0) - new Date(b.enviadoEn || 0)),
    [rendiciones]
  );
  const paraPago = useMemo(
    () => rendiciones.filter(r => r.estado === "aprobada").sort((a, b) => new Date(a.revisadoEn || 0) - new Date(b.revisadoEn || 0)),
    [rendiciones]
  );

  const editRend = rendiciones.find(r => r.id === editId) || null;

  // ── Tabs visibles según rol ──
  const TABS = [
    { id: "mis", label: "🧾 Mis Rendiciones", show: true },
    { id: "aprobar", label: `✅ Por Aprobar${porAprobar.length ? ` (${porAprobar.length})` : ""}`, show: esAprobador },
    { id: "pagos", label: `💵 Pagos${paraPago.length ? ` (${paraPago.length})` : ""}`, show: esAprobador },
    { id: "reportes", label: "📊 Reportes", show: esAprobador },
  ].filter(t => t.show);

  if (cargando) {
    return <div style={{ padding: 60, textAlign: "center", color: C.muted, fontFamily: "sans-serif" }}>Cargando rendiciones…</div>;
  }

  return (
    <div style={{ fontFamily: "sans-serif", color: C.text, maxWidth: 1180, margin: "0 auto", padding: "0 18px 60px" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 0", gap: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {onBack && <Btn kind="ghost" small onClick={onBack}>← Volver</Btn>}
          <div>
            <div style={{ fontSize: 22, fontWeight: 800 }}>🧾 Rendiciones de Gasto</div>
            <div style={{ fontSize: 12.5, color: C.muted }}>{nombreUsuario}{usuarioActual?.cargo ? ` · ${usuarioActual.cargo}` : ""}{esAprobador ? " · Aprobador" : ""}</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 11.5, color: guardando ? C.warning : C.muted2 }}>{guardando ? "Guardando…" : "Guardado ✓"}</span>
          {onLogout && <Btn kind="ghost" small onClick={onLogout}>Salir</Btn>}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 6, borderBottom: `1px solid ${C.border}`, marginBottom: 18, flexWrap: "wrap" }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{
              padding: "9px 16px", border: "none", background: "none", cursor: "pointer",
              fontWeight: 700, fontSize: 13.5, color: tab === t.id ? C.primary : C.muted,
              borderBottom: `3px solid ${tab === t.id ? C.primary : "transparent"}`, marginBottom: -1,
            }}>{t.label}</button>
        ))}
      </div>

      {tab === "mis" && (
        <MisRendiciones
          rends={misRendiciones} onCrear={crearRendicion}
          onAbrir={setEditId} onEliminar={eliminarRendicion} tcData={tcData}
        />
      )}
      {tab === "aprobar" && esAprobador && (
        <BandejaAprobar rends={porAprobar} onAbrir={setEditId} tcData={tcData}
          onAprobar={r => { setRevisar({ id: r.id, accion: "aprobar" }); setComentario(""); }}
          onRechazar={r => { setRevisar({ id: r.id, accion: "rechazar" }); setComentario(""); }}
        />
      )}
      {tab === "pagos" && esAprobador && (
        <BandejaPagos rends={paraPago} onAbrir={setEditId} onPagar={marcarPagada} tcData={tcData} />
      )}
      {tab === "reportes" && esAprobador && (
        <Reportes rends={rendiciones} filtroEstado={filtroEstado} setFiltroEstado={setFiltroEstado}
          busca={busca} setBusca={setBusca} onAbrir={setEditId} tcData={tcData} />
      )}

      {/* Editor de rendición */}
      {editRend && (
        <EditorRendicion
          rend={editRend} upsert={upsert} onClose={() => setEditId(null)}
          onEnviar={enviar} esDueno={editRend.trabajador === nombreUsuario}
          esAprobador={esAprobador} onEliminar={eliminarRendicion} tcData={tcData}
        />
      )}

      {/* Modal aprobar/rechazar */}
      {revisar && (() => {
        const r = rendiciones.find(x => x.id === revisar.id);
        if (!r) return null;
        const esAprob = revisar.accion === "aprobar";
        return (
          <Modal width={480} title={esAprob ? `Aprobar rendición #${r.folio}` : `Rechazar rendición #${r.folio}`} onClose={() => setRevisar(null)}>
            <div style={{ fontSize: 13, color: C.muted, marginBottom: 12 }}>
              {r.trabajador} · {fmtTotales(totalesPorMoneda(r.gastos))} · {(r.gastos || []).length} gasto(s)
            </div>
            <Field label={esAprob ? "Comentario (opcional)" : "Motivo del rechazo"}>
              <textarea value={comentario} onChange={e => setComentario(e.target.value)}
                style={{ ...inputStyle, height: 80, resize: "vertical" }}
                placeholder={esAprob ? "Visto bueno…" : "Indica qué corregir…"} />
            </Field>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
              <Btn kind="ghost" onClick={() => setRevisar(null)}>Cancelar</Btn>
              <Btn kind={esAprob ? "success" : "danger"}
                disabled={!esAprob && !comentario.trim()}
                onClick={() => { aprobarRechazar(r, revisar.accion, comentario); setRevisar(null); }}>
                {esAprob ? "Aprobar" : "Rechazar"}
              </Btn>
            </div>
          </Modal>
        );
      })()}
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────
// Tarjeta de rendición (resumen)
// ───────────────────────────────────────────────────────────────────
function RendCard({ r, children, onClick, mostrarTrabajador, tcData }) {
  const totales = totalesPorMoneda(r.gastos);
  const monedaPago = r.monedaPago || "CLP";
  const monedas = Object.keys(totales).filter(k => totales[k]);
  const requiereConv = tcData && (monedas.length > 1 || (monedas[0] && monedas[0] !== monedaPago));
  const conv = requiereConv ? totalConvertido(r.gastos, monedaPago, r.fechaTC || r.periodo, tcData) : null;
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 14, boxShadow: C.shadowSm }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
        <div onClick={onClick} style={{ cursor: onClick ? "pointer" : "default", flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontWeight: 800, fontSize: 15 }}>#{r.folio}</span>
            <EstadoBadge estado={r.estado} />
            <span style={{ fontSize: 13.5, fontWeight: 600 }}>{r.titulo || <i style={{ color: C.muted2 }}>Sin título</i>}</span>
          </div>
          <div style={{ fontSize: 12, color: C.muted, marginTop: 5 }}>
            {mostrarTrabajador && <>{r.trabajador} · </>}
            {r.empresa} · {(r.gastos || []).length} gasto(s) · {fmtFecha(r.periodo)}
          </div>
          <div style={{ fontSize: 14, fontWeight: 800, color: C.primary, marginTop: 6 }}>
            {fmtTotales(totales)}
          </div>
          {conv && (
            <div style={{ fontSize: 12, color: C.accent2, fontWeight: 700, marginTop: 2 }}>
              A pagar: {fmtMonto(conv.total, monedaPago)}{conv.faltan.length > 0 ? " ⚠ (TC parcial)" : ""}
            </div>
          )}
          {r.estado === "rechazada" && r.comentarioRevisor && (
            <div style={{ fontSize: 12, color: C.danger, marginTop: 6, background: C.dangerBg, padding: "6px 9px", borderRadius: 7 }}>
              ❌ {r.comentarioRevisor}
            </div>
          )}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end" }}>{children}</div>
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────
// Tab: Mis Rendiciones
// ───────────────────────────────────────────────────────────────────
function MisRendiciones({ rends, onCrear, onAbrir, onEliminar, tcData }) {
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div style={{ fontSize: 13, color: C.muted }}>{rends.length} rendición(es)</div>
        <Btn onClick={onCrear}>+ Nueva rendición</Btn>
      </div>
      {!rends.length && (
        <div style={{ textAlign: "center", padding: "50px 20px", color: C.muted2, background: C.card, borderRadius: 12, border: `1px dashed ${C.border}` }}>
          No tienes rendiciones aún. Crea una para empezar a cargar tus gastos.
        </div>
      )}
      <div style={{ display: "grid", gap: 10 }}>
        {rends.map(r => (
          <RendCard key={r.id} r={r} onClick={() => onAbrir(r.id)} tcData={tcData}>
            <Btn kind="ghost" small onClick={() => onAbrir(r.id)}>{r.estado === "borrador" || r.estado === "rechazada" ? "Editar" : "Ver"}</Btn>
            {(r.estado === "borrador" || r.estado === "rechazada") && (
              <Btn kind="ghost" small style={{ color: C.danger, borderColor: C.danger }} onClick={() => onEliminar(r)}>Eliminar</Btn>
            )}
          </RendCard>
        ))}
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────
// Tab: Por Aprobar
// ───────────────────────────────────────────────────────────────────
function BandejaAprobar({ rends, onAbrir, onAprobar, onRechazar, tcData }) {
  return (
    <div>
      <div style={{ fontSize: 13, color: C.muted, marginBottom: 14 }}>{rends.length} rendición(es) esperando revisión</div>
      {!rends.length && (
        <div style={{ textAlign: "center", padding: "50px 20px", color: C.muted2, background: C.card, borderRadius: 12, border: `1px dashed ${C.border}` }}>
          No hay rendiciones pendientes de aprobación. ✓
        </div>
      )}
      <div style={{ display: "grid", gap: 10 }}>
        {rends.map(r => (
          <RendCard key={r.id} r={r} onClick={() => onAbrir(r.id)} mostrarTrabajador tcData={tcData}>
            <Btn kind="ghost" small onClick={() => onAbrir(r.id)}>Revisar detalle</Btn>
            <div style={{ display: "flex", gap: 6 }}>
              <Btn kind="success" small onClick={() => onAprobar(r)}>Aprobar</Btn>
              <Btn kind="danger" small onClick={() => onRechazar(r)}>Rechazar</Btn>
            </div>
          </RendCard>
        ))}
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────
// Tab: Pagos
// ───────────────────────────────────────────────────────────────────
function BandejaPagos({ rends, onAbrir, onPagar, tcData }) {
  return (
    <div>
      <div style={{ fontSize: 13, color: C.muted, marginBottom: 14 }}>{rends.length} rendición(es) aprobada(s) pendiente(s) de pago</div>
      {!rends.length && (
        <div style={{ textAlign: "center", padding: "50px 20px", color: C.muted2, background: C.card, borderRadius: 12, border: `1px dashed ${C.border}` }}>
          No hay rendiciones aprobadas pendientes de pago.
        </div>
      )}
      <div style={{ display: "grid", gap: 10 }}>
        {rends.map(r => (
          <RendCard key={r.id} r={r} onClick={() => onAbrir(r.id)} mostrarTrabajador tcData={tcData}>
            <Btn kind="ghost" small onClick={() => onAbrir(r.id)}>Ver detalle</Btn>
            <Btn kind="accent" small onClick={() => onPagar(r)}>Marcar pagada</Btn>
          </RendCard>
        ))}
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────
// Tab: Reportes
// ───────────────────────────────────────────────────────────────────
function Reportes({ rends, filtroEstado, setFiltroEstado, busca, setBusca, onAbrir, tcData }) {
  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return rends
      .filter(r => filtroEstado === "todos" || r.estado === filtroEstado)
      .filter(r => !q || `${r.folio} ${r.titulo} ${r.trabajador} ${r.empresa}`.toLowerCase().includes(q))
      .sort((a, b) => (b.folio || 0) - (a.folio || 0));
  }, [rends, filtroEstado, busca]);

  // Resumen en CLP equivalente: todo gasto se convierte a CLP vía TC (triangulando
  // por USD). Los gastos sin TC disponible se cuentan aparte como "sin convertir".
  const resumen = useMemo(() => {
    const r = { totalCLP: 0, porEmpresa: {}, porCategoria: {}, sinTC: 0 };
    filtradas.forEach(rd => {
      const fecha = rd.fechaTC || rd.periodo;
      (rd.gastos || []).forEach(g => {
        const c = convertir(g.monto, g.moneda || "CLP", "CLP", fecha, tcData);
        if (!c.ok) { r.sinTC += 1; return; }
        r.totalCLP += c.val;
        r.porEmpresa[rd.empresa] = (r.porEmpresa[rd.empresa] || 0) + c.val;
        r.porCategoria[g.categoria] = (r.porCategoria[g.categoria] || 0) + c.val;
      });
    });
    return r;
  }, [filtradas, tcData]);

  const exportCSV = () => {
    const filas = [["Folio", "Estado", "Trabajador", "Empresa", "Título", "Fecha gasto", "Categoría", "Glosa", "Doc", "N° Doc", "Moneda", "Monto", "Monto CLP equiv", "Adjunto"]];
    filtradas.forEach(r => {
      const fecha = r.fechaTC || r.periodo;
      (r.gastos || []).forEach(g => {
        const c = convertir(g.monto, g.moneda || "CLP", "CLP", fecha, tcData);
        filas.push([
          r.folio, ESTADOS[r.estado]?.l || r.estado, r.trabajador, r.empresa, r.titulo,
          g.fecha || "", CAT_MAP[g.categoria]?.l || g.categoria || "", (g.glosa || "").replace(/"/g, "'"),
          g.docTipo || "", g.docNumero || "", g.moneda || "CLP", Number(g.monto) || 0,
          c.ok ? Math.round(c.val) : "sin TC", g.adjuntoUrl ? "sí" : "no",
        ]);
      });
    });
    const csv = filas.map(f => f.map(c => `"${String(c)}"`).join(";")).join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `rendiciones_${hoyISO()}.csv`;
    a.click();
  };

  return (
    <div>
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 16, flexWrap: "wrap" }}>
        <select value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)} style={{ ...inputStyle, width: "auto" }}>
          <option value="todos">Todos los estados</option>
          {Object.keys(ESTADOS).map(k => <option key={k} value={k}>{ESTADOS[k].l}</option>)}
        </select>
        <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar folio, trabajador, empresa…" style={{ ...inputStyle, width: 260 }} />
        <div style={{ flex: 1 }} />
        <Btn kind="ghost" onClick={exportCSV}>⬇ Exportar CSV</Btn>
      </div>

      {/* Resumen */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 12, marginBottom: 18 }}>
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 14 }}>
          <div style={{ fontSize: 11.5, color: C.muted, fontWeight: 700 }}>TOTAL CLP EQUIVALENTE</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: C.primary, marginTop: 4 }}>{fmtMonto(resumen.totalCLP, "CLP")}</div>
          <div style={{ fontSize: 11.5, color: C.muted2, marginTop: 2 }}>
            {filtradas.length} rendición(es){resumen.sinTC > 0 ? ` · ⚠ ${resumen.sinTC} gasto(s) sin TC` : ""}
          </div>
        </div>
        <MiniBreakdown title="Por empresa" data={resumen.porEmpresa} />
        <MiniBreakdown title="Por categoría" data={resumen.porCategoria} mapLabel={k => CAT_MAP[k]?.l || k} />
      </div>

      <div style={{ display: "grid", gap: 10 }}>
        {filtradas.map(r => (
          <RendCard key={r.id} r={r} onClick={() => onAbrir(r.id)} mostrarTrabajador tcData={tcData}>
            <Btn kind="ghost" small onClick={() => onAbrir(r.id)}>Ver</Btn>
          </RendCard>
        ))}
        {!filtradas.length && <div style={{ textAlign: "center", padding: 40, color: C.muted2 }}>Sin resultados.</div>}
      </div>
    </div>
  );
}

function MiniBreakdown({ title, data, mapLabel = (k) => k }) {
  const items = Object.entries(data).sort((a, b) => b[1] - a[1]).slice(0, 5);
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 14 }}>
      <div style={{ fontSize: 11.5, color: C.muted, fontWeight: 700, marginBottom: 8 }}>{title.toUpperCase()} (CLP)</div>
      {!items.length && <div style={{ fontSize: 12, color: C.muted2 }}>—</div>}
      {items.map(([k, v]) => (
        <div key={k} style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, padding: "2px 0" }}>
          <span style={{ color: C.text }}>{mapLabel(k)}</span>
          <span style={{ fontWeight: 700, color: C.muted }}>{fmtMonto(v, "CLP")}</span>
        </div>
      ))}
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────
// Editor de una rendición (con gastos + adjuntos)
// ───────────────────────────────────────────────────────────────────
function EditorRendicion({ rend, upsert, onClose, onEnviar, esDueno, esAprobador, onEliminar, tcData }) {
  const editable = esDueno && (rend.estado === "borrador" || rend.estado === "rechazada");
  // La fecha/moneda de pago la define quien paga (aprobador) incluso después de enviada.
  const editableTC = esAprobador || editable;
  const [subiendo, setSubiendo] = useState(null); // id de gasto subiendo archivo

  const monedaPago = rend.monedaPago || "CLP";
  const fechaTC = rend.fechaTC || rend.periodo || hoyISO();

  const setCampo = (k, v) => upsert({ ...rend, [k]: v });

  const addGasto = () => {
    const g = { id: uid("g"), fecha: hoyISO(), categoria: "movilizacion", glosa: "", monto: "", moneda: "CLP", docTipo: "Boleta", docNumero: "", adjuntoUrl: "", adjuntoNombre: "" };
    upsert({ ...rend, gastos: [...(rend.gastos || []), g] });
  };
  const setGasto = (gid, k, v) => upsert({ ...rend, gastos: rend.gastos.map(g => g.id === gid ? { ...g, [k]: v } : g) });
  const delGasto = async (g) => {
    const p = pathDesdeUrlStorage(g.adjuntoUrl);
    if (p) await eliminarArchivoFrisku(p);
    upsert({ ...rend, gastos: rend.gastos.filter(x => x.id !== g.id) });
  };

  const quitarAdjunto = async (g) => {
    const p = pathDesdeUrlStorage(g.adjuntoUrl);
    if (p) await eliminarArchivoFrisku(p);
    upsert({ ...rend, gastos: rend.gastos.map(x => x.id === g.id ? { ...x, adjuntoUrl: "", adjuntoNombre: "" } : x) });
  };

  const subirAdjunto = async (g, file) => {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { alert("El archivo supera 10 MB."); return; }
    setSubiendo(g.id);
    const ext = (file.name.split(".").pop() || "dat").toLowerCase();
    const path = `rendiciones/${rend.id}/${g.id}_${Date.now()}.${ext}`;
    const url = await uploadArchivoFrisku(file, path);
    setSubiendo(null);
    if (url) {
      // si había uno previo, borrarlo
      const prev = pathDesdeUrlStorage(g.adjuntoUrl);
      if (prev && prev !== path) await eliminarArchivoFrisku(prev);
      upsert({ ...rend, gastos: rend.gastos.map(x => x.id === g.id ? { ...x, adjuntoUrl: url, adjuntoNombre: file.name } : x) });
    } else {
      alert("No se pudo subir el archivo. Reintenta.");
    }
  };

  const totales = totalesPorMoneda(rend.gastos);

  return (
    <Modal width={900} title={`Rendición #${rend.folio}`} onClose={onClose}>
      {/* Cabecera estado */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <EstadoBadge estado={rend.estado} />
        <span style={{ fontSize: 12.5, color: C.muted }}>{rend.trabajador}{rend.cargo ? ` · ${rend.cargo}` : ""}</span>
        {rend.estado === "rechazada" && rend.comentarioRevisor && (
          <span style={{ fontSize: 12.5, color: C.danger, background: C.dangerBg, padding: "3px 10px", borderRadius: 7 }}>❌ {rend.comentarioRevisor}</span>
        )}
      </div>

      {/* Datos generales (encabezado): trabajador (arriba) + empresa + fecha rendición */}
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 12, marginBottom: 14 }}>
        <Field label="Título / Glosa">
          <input value={rend.titulo} disabled={!editable} onChange={e => setCampo("titulo", e.target.value)} style={inputStyle} placeholder="Ej: Viaje a terreno Curicó" />
        </Field>
        <Field label="Empresa">
          <select value={rend.empresa} disabled={!editable} onChange={e => setCampo("empresa", e.target.value)} style={inputStyle}>
            {EMPRESAS.map(e => <option key={e} value={e}>{e}</option>)}
          </select>
        </Field>
        <Field label="Fecha de rendición">
          <input type="date" value={rend.periodo} disabled={!editable} onChange={e => setCampo("periodo", e.target.value)} style={inputStyle} />
        </Field>
      </div>

      {/* Pago / conversión multimoneda */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 18, background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 10, padding: 12 }}>
        <Field label="Moneda de pago">
          <select value={monedaPago} disabled={!editableTC} onChange={e => setCampo("monedaPago", e.target.value)} style={inputStyle}>
            {MONEDAS.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </Field>
        <Field label="Fecha de TC (para convertir)">
          <input type="date" value={fechaTC} disabled={!editableTC} onChange={e => setCampo("fechaTC", e.target.value)} style={inputStyle} />
        </Field>
      </div>

      {/* Gastos */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <div style={{ fontWeight: 800, fontSize: 14 }}>Gastos ({(rend.gastos || []).length})</div>
        {editable && <Btn small onClick={addGasto}>+ Agregar gasto</Btn>}
      </div>

      <div style={{ display: "grid", gap: 8 }}>
        {(rend.gastos || []).map(g => (
          <div key={g.id} style={{ border: `1px solid ${C.border}`, borderRadius: 10, padding: 10, background: C.rowAlt }}>
            <div style={{ display: "grid", gridTemplateColumns: "120px 150px 1fr 110px 90px 36px", gap: 8, alignItems: "end" }}>
              <Field label="Fecha">
                <input type="date" value={g.fecha} disabled={!editable} onChange={e => setGasto(g.id, "fecha", e.target.value)} style={inputStyle} />
              </Field>
              <Field label="Categoría">
                <select value={g.categoria} disabled={!editable} onChange={e => setGasto(g.id, "categoria", e.target.value)} style={inputStyle}>
                  {CATEGORIAS.map(c => <option key={c.v} value={c.v}>{c.ic} {c.l}</option>)}
                </select>
              </Field>
              <Field label="Glosa / Detalle">
                <input value={g.glosa} disabled={!editable} onChange={e => setGasto(g.id, "glosa", e.target.value)} style={inputStyle} placeholder="Descripción del gasto" />
              </Field>
              <Field label="Monto">
                <input type="number" value={g.monto} disabled={!editable} onChange={e => setGasto(g.id, "monto", e.target.value)} style={{ ...inputStyle, textAlign: "right" }} placeholder="0" />
              </Field>
              <Field label="Moneda">
                <select value={g.moneda} disabled={!editable} onChange={e => setGasto(g.id, "moneda", e.target.value)} style={inputStyle}>
                  {MONEDAS.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </Field>
              {editable
                ? <button onClick={() => delGasto(g)} title="Eliminar gasto" style={{ height: 34, border: `1px solid ${C.danger}`, background: C.card, color: C.danger, borderRadius: 8, cursor: "pointer", fontWeight: 700 }}>×</button>
                : <span />}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "150px 1fr auto", gap: 8, alignItems: "end", marginTop: 8 }}>
              <Field label="Tipo doc">
                <select value={g.docTipo} disabled={!editable} onChange={e => setGasto(g.id, "docTipo", e.target.value)} style={inputStyle}>
                  {TIPOS_DOC.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </Field>
              <Field label="N° documento">
                <input value={g.docNumero} disabled={!editable} onChange={e => setGasto(g.id, "docNumero", e.target.value)} style={inputStyle} placeholder="Folio / N°" />
              </Field>
              <div style={{ display: "flex", alignItems: "center", gap: 8, paddingBottom: 2 }}>
                {g.adjuntoUrl ? (
                  <>
                    <a href={g.adjuntoUrl} target="_blank" rel="noreferrer" style={{ fontSize: 12.5, color: C.primary, fontWeight: 700, textDecoration: "none", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>📎 {g.adjuntoNombre || "Ver respaldo"}</a>
                    {editable && <button onClick={() => quitarAdjunto(g)} title="Quitar" style={{ border: "none", background: "none", color: C.danger, cursor: "pointer", fontSize: 16 }}>×</button>}
                  </>
                ) : editable ? (
                  <label style={{ fontSize: 12.5, color: C.primary, fontWeight: 700, cursor: "pointer", border: `1px dashed ${C.border2}`, padding: "6px 12px", borderRadius: 8 }}>
                    {subiendo === g.id ? "Subiendo…" : "📎 Adjuntar boleta"}
                    <input type="file" accept="image/*,application/pdf" style={{ display: "none" }} disabled={subiendo === g.id}
                      onChange={e => { const f = e.target.files?.[0]; e.target.value = ""; subirAdjunto(g, f); }} />
                  </label>
                ) : <span style={{ fontSize: 12, color: C.muted2 }}>Sin respaldo</span>}
              </div>
            </div>
            {(g.moneda || "CLP") !== monedaPago && Number(g.monto) > 0 && (() => {
              const r = convertir(g.monto, g.moneda || "CLP", monedaPago, fechaTC, tcData);
              if (r.ok) {
                return (
                  <div style={{ fontSize: 11.5, color: C.muted, marginTop: 6, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <span>🔁 {r.chain}:</span>
                    {r.usd != null && <span>≈ {fmtMonto(r.usd, "USD")} →</span>}
                    <span style={{ fontWeight: 800, color: C.accent2 }}>{fmtMonto(r.val, monedaPago)}</span>
                  </div>
                );
              }
              return (
                <div style={{ fontSize: 11.5, color: C.danger, marginTop: 6, background: C.dangerBg, padding: "5px 9px", borderRadius: 7 }}>
                  ⚠ Falta TC para convertir ({Object.keys(r.faltan || {}).filter(k => r.faltan[k]).join(", ")}). Cárgalo en Maestros → Tipo de Cambio.
                </div>
              );
            })()}
          </div>
        ))}
        {!(rend.gastos || []).length && (
          <div style={{ textAlign: "center", padding: 24, color: C.muted2, border: `1px dashed ${C.border}`, borderRadius: 10 }}>
            Sin gastos. {editable ? "Agrega el primero." : ""}
          </div>
        )}
      </div>

      {/* Total */}
      {(() => {
        const conv = totalConvertido(rend.gastos, monedaPago, fechaTC, tcData);
        const variasMonedas = Object.keys(totales).filter(k => totales[k]).length > 1 || (Object.keys(totales)[0] && Object.keys(totales)[0] !== monedaPago);
        return (
          <div style={{ marginTop: 16, paddingTop: 14, borderTop: `1px solid ${C.border}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
              <span style={{ fontSize: 12.5, color: C.muted }}>Por moneda: <b>{fmtTotales(totales)}</b></span>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 13, color: C.muted, fontWeight: 700 }}>TOTAL A PAGAR ({monedaPago}):</span>
                <span style={{ fontSize: 20, fontWeight: 800, color: C.primary }}>{fmtMonto(conv.total, monedaPago)}</span>
              </div>
            </div>
            {conv.faltan.length > 0 && (
              <div style={{ fontSize: 11.5, color: C.danger, marginTop: 8, textAlign: "right" }}>
                ⚠ Total parcial: faltan TC ({conv.faltan.join(", ")}). El monto excluye los gastos sin tipo de cambio.
              </div>
            )}
          </div>
        );
      })()}

      {/* Historial */}
      {(rend.historial || []).length > 0 && (
        <details style={{ marginTop: 16 }}>
          <summary style={{ cursor: "pointer", fontSize: 12.5, color: C.muted, fontWeight: 700 }}>Historial ({rend.historial.length})</summary>
          <div style={{ marginTop: 8, display: "grid", gap: 4 }}>
            {rend.historial.map((h, i) => (
              <div key={i} style={{ fontSize: 12, color: C.muted, display: "flex", gap: 8 }}>
                <span style={{ color: C.muted2, minWidth: 130 }}>{fmtFecha(h.fecha)}</span>
                <span style={{ fontWeight: 700 }}>{h.accion}</span>
                <span>· {h.usuario}</span>
                {h.comentario && <span style={{ fontStyle: "italic" }}>— {h.comentario}</span>}
              </div>
            ))}
          </div>
        </details>
      )}

      {/* Acciones */}
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginTop: 20 }}>
        <div>
          {esDueno && (rend.estado === "borrador" || rend.estado === "rechazada") && (
            <Btn kind="ghost" style={{ color: C.danger, borderColor: C.danger }} onClick={() => onEliminar(rend)}>Eliminar</Btn>
          )}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Btn kind="ghost" onClick={onClose}>Cerrar</Btn>
          {editable && <Btn kind="success" onClick={() => onEnviar(rend)}>📤 Enviar a aprobación</Btn>}
        </div>
      </div>
    </Modal>
  );
}
