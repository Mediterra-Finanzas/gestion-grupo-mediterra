/* eslint-disable */
import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import * as XLSX from "xlsx-js-style";

// ─── Supabase ───────────────────────────────────────────────────────────────
const SUPA_URL = "https://bywovqayuzodbzwsriet.supabase.co";
const SUPA_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ5d292cWF5dXpvZGJ6d3NyaWV0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2ODU1MDgsImV4cCI6MjA5MTI2MTUwOH0.s2x2O_CxE6rl8dBqFuyfQdMyRqSyjJQWXJXesmVGXtk";

const HEADERS = {
  apikey: SUPA_KEY,
  Authorization: `Bearer ${SUPA_KEY}`,
  "Content-Type": "application/json",
  Prefer: "return=representation",
};

async function supaFetch(path, opts = {}) {
  const res = await fetch(`${SUPA_URL}/rest/v1/${path}`, {
    ...opts,
    headers: { ...HEADERS, ...(opts.headers || {}) },
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(err || `HTTP ${res.status}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

async function supaSelect(table, query = "") {
  return supaFetch(`${table}${query ? "?" + query : ""}`);
}

async function supaInsert(table, data) {
  return supaFetch(table, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

async function supaUpdate(table, id, data) {
  return supaFetch(`${table}?id=eq.${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

async function supaUpsert(table, data, onConflict = "id") {
  return supaFetch(`${table}?on_conflict=${onConflict}`, {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify(data),
  });
}

// ─── Paleta ─────────────────────────────────────────────────────────────────
const C = {
  bg: "#f0f2f8",
  bgCard: "#ffffff",
  bgInput: "#f5f7fc",
  border: "#dde2f0",
  borderLight: "#c8cfe8",
  text: "#1a2040",
  textMuted: "#5a6494",
  textDim: "#8f99c0",
  primary: "#4f6ff0",
  primaryHover: "#3d5de0",
  success: "#27a96c",
  successBg: "#eafaf3",
  warning: "#e09620",
  warningBg: "#fef7e6",
  danger: "#d94040",
  dangerBg: "#fdeaea",
  info: "#2e90c8",
  infoBg: "#e6f4fc",
  teal: "#1aafa8",
  tealBg: "#e4f7f6",
};

// ─── Componentes auxiliares ──────────────────────────────────────────────────

function Btn({ children, onClick, color = "primary", size = "md", disabled = false, style = {} }) {
  const colorMap = {
    primary: { bg: C.primary, hover: C.primaryHover, text: "#fff" },
    success: { bg: C.success, hover: "#3d9e6b", text: "#fff" },
    danger: { bg: C.danger, hover: "#cc4a4a", text: "#fff" },
    warning: { bg: C.warning, hover: "#d99020", text: "#0f1117" },
    ghost: { bg: "transparent", hover: C.bgInput, text: C.textMuted, border: C.border },
    info: { bg: C.info, hover: "#4aafc9", text: "#0f1117" },
    teal: { bg: C.teal, hover: "#3dbdb5", text: "#0f1117" },
  };
  const sizeMap = {
    sm: { padding: "4px 10px", fontSize: 12 },
    md: { padding: "6px 14px", fontSize: 13 },
    lg: { padding: "8px 18px", fontSize: 14 },
  };
  const col = colorMap[color] || colorMap.primary;
  const sz = sizeMap[size] || sizeMap.md;
  const [hover, setHover] = useState(false);
  return (
    <button
      onClick={disabled ? undefined : onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        background: hover && !disabled ? col.hover : col.bg,
        color: col.text,
        border: col.border ? `1px solid ${col.border}` : "none",
        borderRadius: 6,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
        fontWeight: 500,
        transition: "background 0.15s",
        whiteSpace: "nowrap",
        ...sz,
        ...style,
      }}
    >
      {children}
    </button>
  );
}

function Modal({ title, onClose, children, width = 520 }) {
  useEffect(() => {
    const handler = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.7)",
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: C.bgCard,
          border: `1px solid ${C.border}`,
          borderRadius: 10,
          width: "100%",
          maxWidth: width,
          maxHeight: "90vh",
          overflowY: "auto",
          boxShadow: "0 20px 60px rgba(0,0,0,0.6)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "14px 18px",
            borderBottom: `1px solid ${C.border}`,
          }}
        >
          <span style={{ fontWeight: 600, fontSize: 15, color: C.text }}>{title}</span>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              color: C.textMuted,
              cursor: "pointer",
              fontSize: 18,
              lineHeight: 1,
              padding: "2px 6px",
            }}
          >
            ×
          </button>
        </div>
        <div style={{ padding: 18 }}>{children}</div>
      </div>
    </div>
  );
}

function Badge({ label, color = "primary" }) {
  const map = {
    primary: { bg: "#1e2a4a", text: C.primary },
    success: { bg: C.successBg, text: C.success },
    warning: { bg: C.warningBg, text: C.warning },
    danger: { bg: C.dangerBg, text: C.danger },
    info: { bg: C.infoBg, text: C.info },
    teal: { bg: C.tealBg, text: C.teal },
    muted: { bg: "#1e2030", text: C.textMuted },
  };
  const col = map[color] || map.primary;
  return (
    <span
      style={{
        background: col.bg,
        color: col.text,
        borderRadius: 4,
        padding: "2px 7px",
        fontSize: 11,
        fontWeight: 600,
      }}
    >
      {label}
    </span>
  );
}

function SearchInput({ value, onChange, placeholder = "Buscar..." }) {
  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      <span
        style={{
          position: "absolute",
          left: 9,
          top: "50%",
          transform: "translateY(-50%)",
          color: C.textDim,
          fontSize: 14,
          pointerEvents: "none",
        }}
      >
        ⌕
      </span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          background: C.bgInput,
          border: `1px solid ${C.border}`,
          borderRadius: 6,
          color: C.text,
          fontSize: 13,
          padding: "6px 10px 6px 28px",
          outline: "none",
          width: 220,
        }}
      />
    </div>
  );
}

function SelectInput({ value, onChange, options, style = {}, disabled = false }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      style={{
        background: C.bgInput,
        border: `1px solid ${C.border}`,
        borderRadius: 6,
        color: value ? C.text : C.textMuted,
        fontSize: 13,
        padding: "6px 10px",
        outline: "none",
        cursor: disabled ? "not-allowed" : "pointer",
        ...style,
      }}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value} style={{ background: C.bgCard }}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

function Field({ label, children, required = false }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label
        style={{
          display: "block",
          fontSize: 12,
          color: C.textMuted,
          marginBottom: 5,
          fontWeight: 500,
        }}
      >
        {label}
        {required && <span style={{ color: C.danger, marginLeft: 3 }}>*</span>}
      </label>
      {children}
    </div>
  );
}

function textInput(value, onChange, placeholder = "", disabled = false) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      disabled={disabled}
      style={{
        background: disabled ? C.bg : C.bgInput,
        border: `1px solid ${C.border}`,
        borderRadius: 6,
        color: C.text,
        fontSize: 13,
        padding: "7px 10px",
        outline: "none",
        width: "100%",
        boxSizing: "border-box",
        opacity: disabled ? 0.6 : 1,
      }}
    />
  );
}

function checkInput(checked, onChange, label) {
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13, color: C.text }}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        style={{ width: 15, height: 15, cursor: "pointer", accentColor: C.primary }}
      />
      {label}
    </label>
  );
}

function TableWrapper({ children }) {
  return (
    <div style={{ overflowX: "auto", borderRadius: 8, border: `1px solid ${C.border}` }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        {children}
      </table>
    </div>
  );
}

function Th({ children, style = {} }) {
  return (
    <th
      style={{
        background: "#eef0f8",
        color: C.textMuted,
        fontWeight: 600,
        fontSize: 11,
        textTransform: "uppercase",
        letterSpacing: "0.05em",
        padding: "9px 12px",
        textAlign: "left",
        borderBottom: `1px solid ${C.border}`,
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      {children}
    </th>
  );
}

function Td({ children, style = {} }) {
  return (
    <td
      style={{
        padding: "8px 12px",
        borderBottom: `1px solid ${C.border}`,
        color: C.text,
        verticalAlign: "middle",
        ...style,
      }}
    >
      {children}
    </td>
  );
}

function Tr({ children, onClick }) {
  const [hover, setHover] = useState(false);
  return (
    <tr
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        background: hover ? "rgba(108,142,245,0.04)" : "transparent",
        cursor: onClick ? "pointer" : "default",
      }}
    >
      {children}
    </tr>
  );
}

function LoadingRow({ cols }) {
  return (
    <tr>
      <td colSpan={cols} style={{ padding: 24, textAlign: "center", color: C.textMuted, fontSize: 13 }}>
        Cargando...
      </td>
    </tr>
  );
}

function EmptyRow({ cols, msg = "Sin registros" }) {
  return (
    <tr>
      <td colSpan={cols} style={{ padding: 24, textAlign: "center", color: C.textDim, fontSize: 13 }}>
        {msg}
      </td>
    </tr>
  );
}

function ErrorMsg({ msg }) {
  if (!msg) return null;
  return (
    <div
      style={{
        background: C.dangerBg,
        border: `1px solid ${C.danger}`,
        borderRadius: 6,
        color: C.danger,
        fontSize: 12,
        padding: "8px 12px",
        marginBottom: 12,
      }}
    >
      {msg}
    </div>
  );
}

function SuccessMsg({ msg }) {
  if (!msg) return null;
  return (
    <div
      style={{
        background: C.successBg,
        border: `1px solid ${C.success}`,
        borderRadius: 6,
        color: C.success,
        fontSize: 12,
        padding: "8px 12px",
        marginBottom: 12,
      }}
    >
      {msg}
    </div>
  );
}

// ─── Tab 1: Empresas ─────────────────────────────────────────────────────────

function EmpresasTab({ canEdit }) {
  const [empresas, setEmpresas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editItem, setEditItem] = useState(null);
  const [saving, setSaving] = useState(false);
  const [ok, setOk] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await supaSelect("empresas", "order=codigo.asc");
      setEmpresas(data || []);
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    setSaving(true);
    setError("");
    try {
      await supaUpdate("empresas", editItem.id, {
        rut:            editItem.rut,
        razon_social:   editItem.razon_social,
        nombre_fantasia:editItem.nombre_fantasia,
        direccion:      editItem.direccion,
        rep_legal:      editItem.rep_legal,
        ci_rep_legal:   editItem.ci_rep_legal,
        activa:         editItem.activa,
      });
      setOk("Guardado correctamente");
      setEditItem(null);
      load();
      setTimeout(() => setOk(""), 3000);
    } catch (e) {
      setError(e.message);
    }
    setSaving(false);
  };

  const metodLabel = {
    line_by_line:   "Línea a línea",
    equity_method:  "Método patrimonio",
    linea_linea:    "Línea a línea",
    patrimonio:     "Método patrimonio",
  };

  return (
    <div>
      <ErrorMsg msg={error} />
      <SuccessMsg msg={ok} />
      <TableWrapper>
        <thead>
          <tr>
            <Th>Código</Th>
            <Th>Razón Social / Nombre</Th>
            <Th>Nombre de Fantasía</Th>
            <Th>RUT</Th>
            <Th>Representante Legal</Th>
            <Th>C.I. Rep. Legal</Th>
            <Th>Moneda</Th>
            <Th>Método consol.</Th>
            <Th>NCI%</Th>
            <Th>Activa</Th>
            {canEdit && <Th></Th>}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <LoadingRow cols={canEdit ? 11 : 10} />
          ) : empresas.length === 0 ? (
            <EmptyRow cols={canEdit ? 11 : 10} />
          ) : (
            empresas.map((e) => (
              <Tr key={e.id}>
                <Td><span style={{ fontFamily: "monospace", color: C.primary, fontWeight: 600 }}>{e.codigo}</span></Td>
                <Td style={{ fontWeight: 500 }}>
                  <div>{e.razon_social || e.nombre}</div>
                  {e.razon_social && e.razon_social !== e.nombre && (
                    <div style={{ fontSize: 11, color: C.textMuted }}>{e.nombre}</div>
                  )}
                </Td>
                <Td style={{ color: C.textMuted }}>{e.nombre_fantasia || "—"}</Td>
                <Td style={{ color: C.textMuted }}>{e.rut || "—"}</Td>
                <Td style={{ color: C.textMuted }}>{e.rep_legal || "—"}</Td>
                <Td style={{ color: C.textMuted }}>{e.ci_rep_legal || "—"}</Td>
                <Td><Badge label={e.moneda_func || "USD"} color="info" /></Td>
                <Td style={{ color: C.textMuted, fontSize: 12 }}>{metodLabel[e.method_consol] || e.method_consol}</Td>
                <Td style={{ color: C.textMuted }}>{e.nci_pct != null ? `${(e.nci_pct * 100).toFixed(1)}%` : "—"}</Td>
                <Td>
                  <Badge label={e.activa ? "Activa" : "Inactiva"} color={e.activa ? "success" : "muted"} />
                </Td>
                {canEdit && (
                  <Td>
                    <Btn size="sm" color="ghost" onClick={() => setEditItem({ ...e })}>Editar</Btn>
                  </Td>
                )}
              </Tr>
            ))
          )}
        </tbody>
      </TableWrapper>

      {editItem && (
        <Modal title={`Editar — ${editItem.codigo} ${editItem.nombre}`} onClose={() => setEditItem(null)} width={580}>
          <ErrorMsg msg={error} />
          <div
            style={{
              background: C.bgInput,
              border: `1px solid ${C.border}`,
              borderRadius: 6,
              padding: "10px 14px",
              marginBottom: 16,
              fontSize: 12,
              color: C.textMuted,
            }}
          >
            Código, Nombre, Moneda, Método y Sistema son informativos y no se modifican aquí.
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 16px" }}>
            <Field label="Razón Social">
              {textInput(editItem.razon_social || "", (v) => setEditItem((x) => ({ ...x, razon_social: v })), "Razón social legal")}
            </Field>
            <Field label="Nombre de Fantasía">
              {textInput(editItem.nombre_fantasia || "", (v) => setEditItem((x) => ({ ...x, nombre_fantasia: v })), "Nombre comercial")}
            </Field>
          </div>

          <Field label="RUT Empresa">
            {textInput(editItem.rut || "", (v) => setEditItem((x) => ({ ...x, rut: v })), "12.345.678-9")}
          </Field>

          <Field label="Dirección">
            {textInput(editItem.direccion || "", (v) => setEditItem((x) => ({ ...x, direccion: v })), "Calle, número, ciudad")}
          </Field>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 16px" }}>
            <Field label="Representante Legal">
              {textInput(editItem.rep_legal || "", (v) => setEditItem((x) => ({ ...x, rep_legal: v })), "Nombre completo")}
            </Field>
            <Field label="C.I. Representante Legal">
              {textInput(editItem.ci_rep_legal || "", (v) => setEditItem((x) => ({ ...x, ci_rep_legal: v })), "RUT o cédula")}
            </Field>
          </div>

          <Field label="Estado">
            {checkInput(editItem.activa, (v) => setEditItem((x) => ({ ...x, activa: v })), "Empresa activa")}
          </Field>

          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 8 }}>
            <Btn color="ghost" onClick={() => setEditItem(null)}>Cancelar</Btn>
            <Btn color="primary" onClick={handleSave} disabled={saving}>{saving ? "Guardando..." : "Guardar"}</Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── Tab 2: Plan de Cuentas ──────────────────────────────────────────────────

const TIPOS_PC = [
  { value: "A", label: "Activo" },
  { value: "P", label: "Pasivo" },
  { value: "I", label: "Ingreso" },
  { value: "E", label: "Egreso" },
  { value: "O", label: "Orden" },
];
const COLOR_TIPO_PC = {
  A: C.primary, P: C.warning, I: C.success, E: C.danger, O: C.textMuted,
};

// ── Helpers de detección de sistema para el importador ──────────────────────

function normHeader(s) { return String(s).toLowerCase().trim().replace(/\s+/g, "_"); }

function detectarSistema(headers) {
  const h = headers.map(normHeader);
  const esContec =
    h.includes("cuenta") || h.includes("nombre_cuenta") || h.includes("descripcion");
  const esMega =
    (h.includes("codigo") || h.includes("código")) &&
    (h.includes("nombre") || h.includes("descripción") || h.includes("descripcion"));
  if (esContec && !esMega) return "contec";
  if (esMega && !esContec) return "megasystem";
  return null;
}

function mapearColumnas(sistema, headers) {
  const find = (candidates) =>
    headers.find((c) => candidates.includes(normHeader(c))) || headers[0];
  if (sistema === "contec") {
    return {
      colCodigo: find(["cuenta"]),
      colNombre: find(["nombre_cuenta", "descripcion", "nombre"]),
    };
  }
  if (sistema === "megasystem") {
    return {
      colCodigo: find(["codigo", "código"]),
      colNombre: find(["nombre", "descripción", "descripcion"]),
    };
  }
  return { colCodigo: headers[0], colNombre: headers[1] };
}

function autoMatchCuentas(rows, cuentas, colCodigo, colNombre) {
  return rows.map((r) => {
    const codOrigen = String(r[colCodigo] || "").trim();
    const nomOrigen = String(r[colNombre] || "").trim().toLowerCase();
    let match = cuentas.find((c) => c.codigo === codOrigen);
    if (!match) match = cuentas.find((c) => c.nombre.toLowerCase() === nomOrigen);
    if (!match && nomOrigen.length > 3)
      match = cuentas.find((c) => c.nombre.toLowerCase().includes(nomOrigen.slice(0, 8)));
    return {
      codigo_origen: codOrigen,
      nombre_origen: String(r[colNombre] || "").trim(),
      cuenta_id: match ? match.id : null,
      codigo_destino: match ? match.codigo : null,
    };
  });
}

// ── Tab Plan de Cuentas ─────────────────────────────────────────────────────

function PlanCuentasTab({ empresas, empresaId, setEmpresaId, canEdit }) {
  const [subTab, setSubTab] = useState("plan"); // 'plan' | 'importar'

  // ── Sub-tab Plan ───────────────────────────────────────────────────────────
  const [cuentas, setCuentas] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [buscar, setBuscar] = useState("");
  const [filtroTipo, setFiltroTipo] = useState("");
  const [filtroLibro, setFiltroLibro] = useState("");
  const [expanded, setExpanded] = useState({});
  const [modal, setModal] = useState(null);
  const cargaOkRef = useRef(false);

  const load = useCallback(async () => {
    if (!empresaId) return;
    setLoading(true);
    setError("");
    try {
      const data = await supaSelect(
        "contab_plan_cuentas",
        `empresa_id=eq.${empresaId}&activa=eq.true&order=codigo.asc`
      );
      setCuentas(data || []);
      cargaOkRef.current = true;
    } catch (e) {
      setError("Error cargando plan: " + e.message);
      throw e; // patrón anti-borrado: propagar
    } finally {
      setLoading(false);
    }
  }, [empresaId]);

  useEffect(() => { cargaOkRef.current = false; load(); }, [load]);

  const cuentasFiltradas = useMemo(() => {
    let arr = cuentas;
    if (buscar) {
      const q = buscar.toLowerCase();
      arr = arr.filter((c) =>
        c.codigo?.toLowerCase().includes(q) || c.nombre?.toLowerCase().includes(q)
      );
    }
    if (filtroTipo) arr = arr.filter((c) => c.tipo === filtroTipo);
    if (filtroLibro === "trib") arr = arr.filter((c) => c.aplica_trib);
    if (filtroLibro === "ifrs") arr = arr.filter((c) => c.aplica_ifrs);
    return arr;
  }, [cuentas, buscar, filtroTipo, filtroLibro]);

  const porTipo = useMemo(() => {
    const g = {};
    TIPOS_PC.forEach(({ value }) => {
      g[value] = cuentasFiltradas.filter((c) => c.tipo === value);
    });
    return g;
  }, [cuentasFiltradas]);

  const initModal = (mode, item = null) => {
    const defaults = {
      empresa_id: empresaId, codigo: "", nombre: "", nombre_corto: "",
      tipo: "A", subtipo: "", nivel: 2, mueve: true, padre_codigo: "",
      aplica_trib: true, aplica_ifrs: true, acepta_me: false,
      usa_ceco: false, usa_auxiliar: false, activa: true,
      ifrs_nombre: "", clasif_ifrs: "", orden_display: 0,
    };
    setModal({ mode, item: mode === "add" ? defaults : { ...defaults, ...item } });
    setError("");
  };

  const handleSave = async () => {
    const { mode, item } = modal;
    if (!item.codigo?.trim() || !item.nombre?.trim()) {
      setError("Código y nombre son obligatorios");
      return;
    }
    if (!cargaOkRef.current) { setError("Carga pendiente, intenta de nuevo"); return; }
    setError("");
    try {
      const payload = {
        empresa_id: empresaId,
        codigo: item.codigo.trim(),
        nombre: item.nombre.trim(),
        nombre_corto: item.nombre_corto?.trim() || null,
        tipo: item.tipo,
        subtipo: item.subtipo || null,
        nivel: Number(item.nivel) || 2,
        mueve: item.nivel === 1 ? false : !!item.mueve,
        padre_codigo: item.padre_codigo?.trim() || null,
        aplica_trib: !!item.aplica_trib,
        aplica_ifrs: !!item.aplica_ifrs,
        acepta_me: !!item.acepta_me,
        usa_ceco: !!item.usa_ceco,
        usa_auxiliar: !!item.usa_auxiliar,
        activa: item.activa !== false,
        ifrs_nombre: item.ifrs_nombre?.trim() || null,
        clasif_ifrs: item.clasif_ifrs?.trim() || null,
        orden_display: Number(item.orden_display) || 0,
      };
      if (mode === "add") {
        await supaInsert("contab_plan_cuentas", payload);
      } else {
        await supaUpdate("contab_plan_cuentas", item.id, payload);
      }
      setOk(mode === "add" ? "Cuenta creada" : "Cuenta actualizada");
      setModal(null);
      load();
      setTimeout(() => setOk(""), 3000);
    } catch (e) {
      setError(e.message);
    }
  };

  const handleToggleActiva = async (item) => {
    if (!cargaOkRef.current) return;
    try {
      await supaUpdate("contab_plan_cuentas", item.id, { activa: !item.activa });
      load();
    } catch (e) {
      setError(e.message);
    }
  };

  // ── Sub-tab Importar ───────────────────────────────────────────────────────
  const [paso, setPaso] = useState(1); // 1-4
  const [archivoNombre, setArchivoNombre] = useState("");
  const [rowsRaw, setRowsRaw] = useState([]);
  const [headers, setHeaders] = useState([]);
  const [sistemaDetectado, setSistemaDetectado] = useState(null);
  const [sistemaManual, setSistemaManual] = useState("");
  const [colCodigo, setColCodigo] = useState("");
  const [colNombre, setColNombre] = useState("");
  const [mapeo, setMapeo] = useState([]); // [{codigo_origen, nombre_origen, cuenta_id, codigo_destino}]
  const [importando, setImportando] = useState(false);
  const [importOk, setImportOk] = useState("");
  const [importError, setImportError] = useState("");
  const fileRef = useRef();

  const sistemaFinal = sistemaDetectado || sistemaManual || "manual";

  const resetImport = () => {
    setPaso(1); setArchivoNombre(""); setRowsRaw([]); setHeaders([]);
    setSistemaDetectado(null); setSistemaManual("");
    setColCodigo(""); setColNombre(""); setMapeo([]);
    setImportOk(""); setImportError("");
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleArchivoChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setArchivoNombre(file.name);
    setImportError("");
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const wb = XLSX.read(ev.target.result, { type: "binary" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { defval: "", raw: false });
        if (!rows.length) { setImportError("El archivo está vacío"); return; }
        const hdrs = Object.keys(rows[0]);
        setRowsRaw(rows);
        setHeaders(hdrs);
        const det = detectarSistema(hdrs);
        setSistemaDetectado(det);
        const { colCodigo: cC, colNombre: cN } = mapearColumnas(det || "manual", hdrs);
        setColCodigo(cC);
        setColNombre(cN);
        setPaso(2);
      } catch (err) {
        setImportError("Error leyendo el archivo: " + err.message);
      }
    };
    reader.readAsBinaryString(file);
    e.target.value = "";
  };

  const handlePasarAMapeo = () => {
    if (!colCodigo || !colNombre) { setImportError("Selecciona las columnas de código y nombre"); return; }
    const matched = autoMatchCuentas(rowsRaw, cuentas, colCodigo, colNombre);
    setMapeo(matched);
    setPaso(3);
  };

  const setMapeoItem = (idx, cuenta_id, codigo_destino) => {
    setMapeo((prev) =>
      prev.map((m, i) => i === idx ? { ...m, cuenta_id, codigo_destino } : m)
    );
  };

  const totalMapeadas = mapeo.filter((m) => m.cuenta_id).length;
  const totalSinMapear = mapeo.length - totalMapeadas;

  const handleConfirmarImport = async () => {
    if (!cargaOkRef.current) { setImportError("Carga pendiente, recarga el plan primero"); return; }
    setImportando(true);
    setImportError("");
    try {
      const payload = mapeo
        .filter((m) => m.codigo_origen)
        .map((m) => ({
          empresa_id: empresaId,
          sistema_origen: sistemaFinal,
          codigo_origen: m.codigo_origen,
          nombre_origen: m.nombre_origen || null,
          cuenta_id: m.cuenta_id || null,
          codigo_destino: m.codigo_destino || null,
          activa: true,
        }));
      await supaUpsert(
        "contab_homologacion",
        payload,
        "empresa_id,sistema_origen,codigo_origen"
      );
      setImportOk(`${payload.length} códigos importados a homologación (${totalMapeadas} mapeados, ${totalSinMapear} sin mapear)`);
      setPaso(4);
    } catch (e) {
      setImportError(e.message);
    }
    setImportando(false);
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  const subTabStyle = (key) => ({
    background: "none",
    border: "none",
    borderBottom: subTab === key ? `2px solid ${C.primary}` : "2px solid transparent",
    color: subTab === key ? C.primary : C.textMuted,
    cursor: "pointer",
    fontSize: 13,
    fontWeight: subTab === key ? 600 : 400,
    padding: "10px 16px",
    transition: "color 0.15s",
    whiteSpace: "nowrap",
  });

  return (
    <div>
      {/* Sub-tabs */}
      <div style={{ display: "flex", borderBottom: `1px solid ${C.border}`, marginBottom: 16 }}>
        <button style={subTabStyle("plan")} onClick={() => setSubTab("plan")}>
          Plan de cuentas
        </button>
        <button style={subTabStyle("importar")} onClick={() => { setSubTab("importar"); resetImport(); }}>
          Importar / homologar
        </button>
      </div>

      {/* ── SUB-TAB: PLAN DE CUENTAS ── */}
      {subTab === "plan" && (
        <div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14, alignItems: "center" }}>
            <SearchInput value={buscar} onChange={setBuscar} placeholder="Buscar por código o nombre..." />
            <SelectInput
              value={filtroTipo}
              onChange={setFiltroTipo}
              options={[{ value: "", label: "Todos los tipos" }].concat(
                TIPOS_PC.map((t) => ({ value: t.value, label: `${t.value} — ${t.label}` }))
              )}
            />
            <SelectInput
              value={filtroLibro}
              onChange={setFiltroLibro}
              options={[
                { value: "", label: "Trib + IFRS" },
                { value: "trib", label: "Solo tributario" },
                { value: "ifrs", label: "Solo IFRS" },
              ]}
            />
            <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
              {canEdit && (
                <Btn color="primary" size="sm" onClick={() => initModal("add")}>
                  + Nueva cuenta
                </Btn>
              )}
            </div>
          </div>

          <ErrorMsg msg={error} />
          <SuccessMsg msg={ok} />

          {loading ? (
            <div style={{ padding: 32, textAlign: "center", color: C.textMuted }}>Cargando...</div>
          ) : (
            TIPOS_PC.map(({ value, label }) => {
              const grupo = porTipo[value] || [];
              if (grupo.length === 0 && (buscar || filtroTipo)) return null;
              const abierto = expanded[value] !== false;
              return (
                <div key={value} style={{ marginBottom: 10 }}>
                  <div
                    onClick={() => setExpanded((x) => ({ ...x, [value]: !abierto }))}
                    style={{
                      background: "#141720", border: `1px solid ${C.border}`,
                      borderRadius: abierto ? "8px 8px 0 0" : 8, padding: "9px 14px",
                      cursor: "pointer", display: "flex", alignItems: "center", gap: 10,
                      userSelect: "none",
                    }}
                  >
                    <span style={{ color: COLOR_TIPO_PC[value], fontWeight: 700, fontSize: 13 }}>
                      {value} — {label}
                    </span>
                    <Badge label={grupo.length} color="muted" />
                    <span style={{ marginLeft: "auto", color: C.textDim, fontSize: 12 }}>
                      {abierto ? "▲" : "▼"}
                    </span>
                  </div>
                  {abierto && (
                    <div style={{ border: `1px solid ${C.border}`, borderTop: "none", borderRadius: "0 0 8px 8px", overflowX: "auto" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                        <thead>
                          <tr>
                            <Th>Código</Th>
                            <Th>Nombre</Th>
                            <Th style={{ width: 50 }}>Nivel</Th>
                            <Th style={{ width: 50 }}>Trib</Th>
                            <Th style={{ width: 50 }}>IFRS</Th>
                            <Th style={{ width: 50 }}>ME</Th>
                            <Th style={{ width: 60 }}>CeCo</Th>
                            <Th style={{ width: 70 }}>Estado</Th>
                            {canEdit && <Th style={{ width: 120 }}></Th>}
                          </tr>
                        </thead>
                        <tbody>
                          {grupo.length === 0 ? (
                            <tr>
                              <td colSpan={canEdit ? 9 : 8} style={{ padding: "14px 12px", color: C.textDim, fontSize: 12 }}>
                                Sin cuentas en este tipo
                              </td>
                            </tr>
                          ) : (
                            grupo.map((c) => (
                              <Tr key={c.id}>
                                <Td>
                                  <span
                                    style={{
                                      fontFamily: "monospace",
                                      color: c.nivel === 1 ? C.textMuted : C.primary,
                                      fontWeight: c.nivel === 1 ? 600 : 400,
                                      paddingLeft: c.nivel === 1 ? 0 : 16,
                                    }}
                                  >
                                    {c.codigo}
                                  </span>
                                </Td>
                                <Td style={{ fontWeight: c.nivel === 1 ? 600 : 400 }}>{c.nombre}</Td>
                                <Td>
                                  <Badge label={c.nivel === 1 ? "Agrup." : "Hoja"} color={c.nivel === 1 ? "muted" : "info"} />
                                </Td>
                                <Td style={{ textAlign: "center", fontSize: 15 }}>
                                  {c.aplica_trib ? <span style={{ color: C.success }}>✓</span> : <span style={{ color: C.textDim }}>—</span>}
                                </Td>
                                <Td style={{ textAlign: "center", fontSize: 15 }}>
                                  {c.aplica_ifrs ? <span style={{ color: C.success }}>✓</span> : <span style={{ color: C.textDim }}>—</span>}
                                </Td>
                                <Td style={{ textAlign: "center", fontSize: 15 }}>
                                  {c.acepta_me ? <span style={{ color: C.teal }}>✓</span> : <span style={{ color: C.textDim }}>—</span>}
                                </Td>
                                <Td style={{ textAlign: "center", fontSize: 15 }}>
                                  {c.usa_ceco ? <span style={{ color: C.teal }}>✓</span> : <span style={{ color: C.textDim }}>—</span>}
                                </Td>
                                <Td>
                                  <Badge label={c.activa ? "Activa" : "Inactiva"} color={c.activa ? "success" : "muted"} />
                                </Td>
                                {canEdit && (
                                  <Td>
                                    <div style={{ display: "flex", gap: 6 }}>
                                      <Btn size="sm" color="ghost" onClick={() => initModal("edit", c)}>Editar</Btn>
                                      <Btn
                                        size="sm"
                                        color={c.activa ? "warning" : "success"}
                                        onClick={() => handleToggleActiva(c)}
                                      >
                                        {c.activa ? "Desact." : "Activar"}
                                      </Btn>
                                    </div>
                                  </Td>
                                )}
                              </Tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })
          )}

          {/* Modal agregar/editar */}
          {modal && (
            <Modal
              title={modal.mode === "add" ? "Nueva cuenta" : `Editar — ${modal.item.codigo}`}
              onClose={() => { setModal(null); setError(""); }}
              width={600}
            >
              <ErrorMsg msg={error} />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 16px" }}>
                <Field label="Código" required>
                  {textInput(modal.item.codigo, (v) =>
                    setModal((x) => ({ ...x, item: { ...x.item, codigo: v } }))
                  )}
                </Field>
                <Field label="Nombre corto">
                  {textInput(modal.item.nombre_corto || "", (v) =>
                    setModal((x) => ({ ...x, item: { ...x.item, nombre_corto: v } }))
                  )}
                </Field>
              </div>
              <Field label="Nombre" required>
                {textInput(modal.item.nombre, (v) =>
                  setModal((x) => ({ ...x, item: { ...x.item, nombre: v } }))
                )}
              </Field>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0 16px" }}>
                <Field label="Tipo">
                  <SelectInput
                    value={modal.item.tipo || "A"}
                    onChange={(v) => setModal((x) => ({ ...x, item: { ...x.item, tipo: v } }))}
                    options={TIPOS_PC.map((t) => ({ value: t.value, label: `${t.value} — ${t.label}` }))}
                    style={{ width: "100%" }}
                  />
                </Field>
                <Field label="Subtipo">
                  {textInput(modal.item.subtipo || "", (v) =>
                    setModal((x) => ({ ...x, item: { ...x.item, subtipo: v } }))
                  )}
                </Field>
                <Field label="Nivel">
                  <SelectInput
                    value={String(modal.item.nivel || 2)}
                    onChange={(v) => setModal((x) => ({ ...x, item: { ...x.item, nivel: Number(v) } }))}
                    options={[
                      { value: "1", label: "1 — Agrupador" },
                      { value: "2", label: "2 — Hoja (acepta asientos)" },
                    ]}
                    style={{ width: "100%" }}
                  />
                </Field>
              </div>
              <Field label="Código padre (agrupador)">
                <SelectInput
                  value={modal.item.padre_codigo || ""}
                  onChange={(v) =>
                    setModal((x) => ({ ...x, item: { ...x.item, padre_codigo: v || null } }))
                  }
                  options={[{ value: "", label: "— Sin padre —" }].concat(
                    cuentas
                      .filter((c) => c.nivel === 1 && c.codigo !== modal.item.codigo)
                      .map((c) => ({ value: c.codigo, label: `${c.codigo} — ${c.nombre}` }))
                  )}
                  style={{ width: "100%" }}
                />
              </Field>
              <div style={{ display: "flex", gap: 20, flexWrap: "wrap", marginBottom: 8 }}>
                {checkInput(!!modal.item.aplica_trib, (v) =>
                  setModal((x) => ({ ...x, item: { ...x.item, aplica_trib: v } })),
                  "Aplica tributario"
                )}
                {checkInput(!!modal.item.aplica_ifrs, (v) =>
                  setModal((x) => ({ ...x, item: { ...x.item, aplica_ifrs: v } })),
                  "Aplica IFRS"
                )}
                {checkInput(!!modal.item.acepta_me, (v) =>
                  setModal((x) => ({ ...x, item: { ...x.item, acepta_me: v } })),
                  "Acepta moneda extranjera"
                )}
                {checkInput(!!modal.item.usa_ceco, (v) =>
                  setModal((x) => ({ ...x, item: { ...x.item, usa_ceco: v } })),
                  "Requiere centro de costo"
                )}
                {checkInput(!!modal.item.usa_auxiliar, (v) =>
                  setModal((x) => ({ ...x, item: { ...x.item, usa_auxiliar: v } })),
                  "Requiere auxiliar"
                )}
                {checkInput(modal.item.activa !== false, (v) =>
                  setModal((x) => ({ ...x, item: { ...x.item, activa: v } })),
                  "Activa"
                )}
              </div>
              <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 12, marginBottom: 12 }}>
                <p style={{ fontSize: 11, color: C.textMuted, marginBottom: 8, fontWeight: 600 }}>
                  CLASIFICACIÓN IFRS (opcional)
                </p>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 16px" }}>
                  <Field label="Nombre IFRS">
                    {textInput(modal.item.ifrs_nombre || "", (v) =>
                      setModal((x) => ({ ...x, item: { ...x.item, ifrs_nombre: v } }))
                    )}
                  </Field>
                  <Field label="Clasificación IFRS">
                    {textInput(modal.item.clasif_ifrs || "", (v) =>
                      setModal((x) => ({ ...x, item: { ...x.item, clasif_ifrs: v } }))
                    )}
                  </Field>
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <Btn color="ghost" onClick={() => { setModal(null); setError(""); }}>Cancelar</Btn>
                <Btn color="primary" onClick={handleSave}>
                  {modal.mode === "add" ? "Crear cuenta" : "Guardar cambios"}
                </Btn>
              </div>
            </Modal>
          )}
        </div>
      )}

      {/* ── SUB-TAB: IMPORTAR / HOMOLOGAR ── */}
      {subTab === "importar" && (
        <div>
          {/* Stepper */}
          <div style={{ display: "flex", alignItems: "center", marginBottom: 20 }}>
            {["Cargar archivo", "Vista previa", "Mapear cuentas", "Confirmar"].map((lbl, idx) => {
              const num = idx + 1;
              const done = paso > num;
              const active = paso === num;
              return (
                <React.Fragment key={lbl}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <div
                      style={{
                        width: 26, height: 26, borderRadius: "50%", display: "flex",
                        alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700,
                        background: done ? C.success : active ? C.primary : C.bgInput,
                        color: done || active ? "#fff" : C.textMuted,
                        border: done || active ? "none" : `1px solid ${C.border}`,
                        flexShrink: 0,
                      }}
                    >
                      {done ? "✓" : num}
                    </div>
                    <span
                      style={{
                        fontSize: 12, whiteSpace: "nowrap",
                        color: done ? C.success : active ? C.primary : C.textMuted,
                        fontWeight: active ? 600 : 400,
                      }}
                    >
                      {lbl}
                    </span>
                  </div>
                  {idx < 3 && (
                    <div style={{ flex: 1, height: 1, background: C.border, margin: "0 8px", minWidth: 10 }} />
                  )}
                </React.Fragment>
              );
            })}
          </div>

          <ErrorMsg msg={importError} />
          <SuccessMsg msg={importOk} />

          {/* PASO 1: Cargar archivo */}
          {paso === 1 && (
            <div>
              <div
                style={{
                  border: `2px dashed ${C.border}`, borderRadius: 10, padding: 36,
                  textAlign: "center", background: C.bgInput,
                }}
              >
                <div style={{ fontSize: 32, marginBottom: 10 }}>📊</div>
                <p style={{ fontWeight: 600, fontSize: 14, color: C.text, marginBottom: 6 }}>
                  Cargar archivo Excel o CSV del sistema de origen
                </p>
                <p style={{ fontSize: 12, color: C.textMuted, marginBottom: 16 }}>
                  Contec o Megasystem — se detecta automáticamente
                </p>
                <Btn color="primary" onClick={() => fileRef.current?.click()}>
                  Seleccionar archivo
                </Btn>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  style={{ display: "none" }}
                  onChange={handleArchivoChange}
                />
              </div>
            </div>
          )}

          {/* PASO 2: Vista previa + confirmar detección */}
          {paso === 2 && (
            <div>
              <div
                style={{
                  background: "#141720", border: `1px solid ${C.border}`, borderRadius: 8,
                  padding: "12px 16px", marginBottom: 14,
                  display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center",
                }}
              >
                <span style={{ fontSize: 13, color: C.text }}>
                  📄 <strong>{archivoNombre}</strong> — {rowsRaw.length} filas
                </span>
                {sistemaDetectado ? (
                  <Badge
                    label={`Sistema detectado: ${sistemaDetectado.toUpperCase()}`}
                    color="success"
                  />
                ) : (
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 12, color: C.warning }}>⚠ No detectado — seleccionar:</span>
                    <SelectInput
                      value={sistemaManual}
                      onChange={setSistemaManual}
                      options={[
                        { value: "", label: "— Seleccionar —" },
                        { value: "contec", label: "Contec" },
                        { value: "megasystem", label: "Megasystem" },
                        { value: "softland", label: "Softland" },
                        { value: "defontana", label: "Defontana" },
                        { value: "manual", label: "Manual" },
                      ]}
                      style={{ width: 160 }}
                    />
                  </div>
                )}
              </div>
              <div style={{ display: "flex", gap: 16, marginBottom: 14, flexWrap: "wrap" }}>
                <Field label="Columna de código origen">
                  <SelectInput
                    value={colCodigo}
                    onChange={setColCodigo}
                    options={headers.map((h) => ({ value: h, label: h }))}
                    style={{ width: 200 }}
                  />
                </Field>
                <Field label="Columna de nombre origen">
                  <SelectInput
                    value={colNombre}
                    onChange={setColNombre}
                    options={headers.map((h) => ({ value: h, label: h }))}
                    style={{ width: 200 }}
                  />
                </Field>
              </div>
              <div
                style={{
                  overflowX: "auto", maxHeight: 260, overflowY: "auto",
                  border: `1px solid ${C.border}`, borderRadius: 8, marginBottom: 16,
                }}
              >
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr>
                      {headers.map((h) => <Th key={h}>{h}</Th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {rowsRaw.slice(0, 20).map((row, i) => (
                      <tr key={i} style={{ background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.02)" }}>
                        {headers.map((h) => (
                          <td
                            key={h}
                            style={{
                              padding: "5px 10px", borderBottom: `1px solid ${C.border}`,
                              color: h === colCodigo || h === colNombre ? C.text : C.textMuted,
                              fontWeight: h === colCodigo ? 600 : 400,
                            }}
                          >
                            {String(row[h] ?? "")}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {rowsRaw.length > 20 && (
                <p style={{ fontSize: 11, color: C.textDim, marginBottom: 12 }}>
                  Mostrando 20 de {rowsRaw.length} filas
                </p>
              )}
              <div style={{ display: "flex", gap: 8 }}>
                <Btn color="ghost" onClick={resetImport}>Volver</Btn>
                <Btn
                  color="primary"
                  onClick={handlePasarAMapeo}
                  disabled={!colCodigo || !colNombre || (!sistemaDetectado && !sistemaManual)}
                >
                  Continuar — mapear cuentas →
                </Btn>
              </div>
            </div>
          )}

          {/* PASO 3: Mapeo de códigos a plan maestro */}
          {paso === 3 && (
            <div>
              <div
                style={{
                  display: "flex", gap: 20, marginBottom: 14,
                  background: "#141720", border: `1px solid ${C.border}`,
                  borderRadius: 8, padding: "10px 16px", flexWrap: "wrap",
                }}
              >
                <span style={{ fontSize: 13, color: C.text }}>
                  <strong>{mapeo.length}</strong> <span style={{ color: C.textMuted }}>códigos</span>
                </span>
                <span style={{ fontSize: 13, color: C.success }}>
                  <strong>{totalMapeadas}</strong> mapeados automáticamente
                </span>
                <span style={{ fontSize: 13, color: totalSinMapear > 0 ? C.warning : C.textMuted }}>
                  <strong>{totalSinMapear}</strong> sin mapear
                </span>
                <Badge label={sistemaFinal.toUpperCase()} color="info" />
              </div>
              <p style={{ fontSize: 12, color: C.textMuted, marginBottom: 10 }}>
                Revisa y completa los códigos sin cuenta destino. Los sin mapear se guardarán con
                <code style={{ marginLeft: 4 }}>cuenta_id = null</code> para resolverlos luego.
              </p>
              <div
                style={{
                  overflowX: "auto", maxHeight: 380, overflowY: "auto",
                  border: `1px solid ${C.border}`, borderRadius: 8, marginBottom: 16,
                }}
              >
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr>
                      <Th>Código origen</Th>
                      <Th>Nombre origen</Th>
                      <Th style={{ width: 280 }}>Cuenta maestro destino</Th>
                      <Th style={{ width: 90 }}>Estado</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {mapeo.map((m, i) => (
                      <Tr key={i}>
                        <Td>
                          <span style={{ fontFamily: "monospace", color: C.primary }}>{m.codigo_origen}</span>
                        </Td>
                        <Td style={{ color: C.textMuted }}>{m.nombre_origen}</Td>
                        <Td>
                          <SelectInput
                            value={m.cuenta_id || ""}
                            onChange={(v) => {
                              const c = cuentas.find((c) => c.id === v);
                              setMapeoItem(i, v || null, c ? c.codigo : null);
                            }}
                            options={[{ value: "", label: "— Sin mapear —" }].concat(
                              cuentas
                                .filter((c) => c.nivel === 2)
                                .map((c) => ({ value: c.id, label: `${c.codigo} — ${c.nombre}` }))
                            )}
                            style={{ width: "100%", fontSize: 11 }}
                          />
                        </Td>
                        <Td>
                          {m.cuenta_id ? (
                            <Badge label="✓ mapeado" color="success" />
                          ) : (
                            <Badge label="sin mapear" color="muted" />
                          )}
                        </Td>
                      </Tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <Btn color="ghost" onClick={() => setPaso(2)}>Volver</Btn>
                <Btn color="primary" onClick={() => setPaso(4)}>
                  Revisar resumen →
                </Btn>
              </div>
            </div>
          )}

          {/* PASO 4: Confirmar */}
          {paso === 4 && !importOk && (
            <div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 16 }}>
                {[
                  { num: mapeo.length, lbl: "códigos a importar", col: C.text },
                  { num: totalMapeadas, lbl: "mapeados a cuenta maestro", col: C.success },
                  { num: totalSinMapear, lbl: "sin mapear (cuenta_id=null)", col: totalSinMapear > 0 ? C.warning : C.textMuted },
                ].map(({ num, lbl, col }) => (
                  <div
                    key={lbl}
                    style={{
                      background: "#141720", border: `1px solid ${C.border}`, borderRadius: 8,
                      padding: "12px 14px", textAlign: "center",
                    }}
                  >
                    <div style={{ fontSize: 28, fontWeight: 700, color: col }}>{num}</div>
                    <div style={{ fontSize: 11, color: C.textMuted, marginTop: 4 }}>{lbl}</div>
                  </div>
                ))}
              </div>
              <div
                style={{
                  background: C.infoBg, border: `1px solid ${C.info}`, borderRadius: 8,
                  padding: "10px 14px", marginBottom: 16, fontSize: 12, color: C.info,
                }}
              >
                Se hará upsert en <code>contab_homologacion</code> con{" "}
                <code>sistema_origen = '{sistemaFinal}'</code>. Los registros existentes con el
                mismo código se actualizarán (no se duplican).
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <Btn color="ghost" onClick={() => setPaso(3)}>Volver</Btn>
                <Btn color="success" onClick={handleConfirmarImport} disabled={importando}>
                  {importando ? "Importando..." : `Importar ${mapeo.length} registros a homologación`}
                </Btn>
              </div>
            </div>
          )}

          {/* PASO 4 completado */}
          {importOk && (
            <div
              style={{
                background: C.successBg, border: `1px solid ${C.success}`, borderRadius: 10,
                padding: "24px 20px", textAlign: "center",
              }}
            >
              <div style={{ fontSize: 32, marginBottom: 8 }}>✅</div>
              <p style={{ fontSize: 15, fontWeight: 600, color: C.success, marginBottom: 8 }}>
                Importación completada
              </p>
              <p style={{ fontSize: 13, color: C.textMuted, marginBottom: 16 }}>{importOk}</p>
              <Btn color="ghost" onClick={resetImport}>Nueva importación</Btn>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Tab 3: Auxiliares ───────────────────────────────────────────────────────

const TIPOS_PERSONA = ["natural", "juridica"];

function AuxiliaresTab({ canEdit }) {
  const [auxiliares, setAuxiliares] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [buscar, setBuscar] = useState("");
  const [filtroTipo, setFiltroTipo] = useState("todos");
  const [pagina, setPagina] = useState(0);
  const [total, setTotal] = useState(0);
  const [modal, setModal] = useState(null);
  const POR_PAG = 50;

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      let q = `order=nombre.asc&limit=${POR_PAG}&offset=${pagina * POR_PAG}`;
      if (buscar) q += `&or=(rut.ilike.*${buscar}*,nombre.ilike.*${buscar}*)`;
      if (filtroTipo === "cliente") q += "&es_cliente=eq.true";
      else if (filtroTipo === "proveedor") q += "&es_proveedor=eq.true";
      else if (filtroTipo === "trabajador") q += "&es_trabajador=eq.true";
      else if (filtroTipo === "extranjero") q += "&es_extranjero=eq.true";

      const data = await supaFetch(`auxiliares?${q}`, {
        headers: { Prefer: "count=exact" },
      });
      // count viene en Content-Range header — usar fetch manual
      const res = await fetch(`${SUPA_URL}/rest/v1/auxiliares?${q}`, {
        headers: { ...HEADERS, Prefer: "count=exact" },
      });
      const range = res.headers.get("content-range");
      if (range) {
        const parts = range.split("/");
        setTotal(parseInt(parts[1]) || 0);
      }
      const json = await res.json();
      setAuxiliares(json || []);
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  }, [buscar, filtroTipo, pagina]);

  useEffect(() => { setPagina(0); }, [buscar, filtroTipo]);
  useEffect(() => { load(); }, [load]);

  const initModal = (mode, item = null) => {
    if (mode === "add") {
      setModal({
        mode,
        item: {
          rut: "", nombre: "", tipo_persona: "natural",
          es_cliente: false, es_proveedor: false, es_trabajador: false, es_extranjero: false,
          pais: "Chile", moneda_habitual: "CLP", email: "", telefono: "",
          direccion: "", giro: "", observaciones: "", activo: true,
        },
      });
    } else {
      setModal({ mode, item: { ...item } });
    }
  };

  const handleSave = async () => {
    const { mode, item } = modal;
    if (!item.nombre) { setError("El nombre es obligatorio"); return; }
    setError("");
    try {
      const payload = { ...item };
      if (mode === "add") {
        delete payload.id;
        await supaInsert("auxiliares", payload);
      } else {
        await supaUpdate("auxiliares", item.id, payload);
      }
      setOk(mode === "add" ? "Auxiliar creado" : "Auxiliar actualizado");
      setModal(null);
      load();
      setTimeout(() => setOk(""), 3000);
    } catch (e) {
      setError(e.message);
    }
  };

  const handleToggle = async (item) => {
    try {
      await supaUpdate("auxiliares", item.id, { activo: !item.activo });
      load();
    } catch (e) {
      setError(e.message);
    }
  };

  const totalPags = Math.ceil(total / POR_PAG);

  return (
    <div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14, alignItems: "center" }}>
        <SearchInput value={buscar} onChange={setBuscar} placeholder="Buscar por RUT o nombre..." />
        <SelectInput
          value={filtroTipo}
          onChange={setFiltroTipo}
          options={[
            { value: "todos", label: "Todos" },
            { value: "cliente", label: "Clientes" },
            { value: "proveedor", label: "Proveedores" },
            { value: "trabajador", label: "Trabajadores" },
            { value: "extranjero", label: "Extranjeros" },
          ]}
        />
        <div style={{ marginLeft: "auto" }}>
          {canEdit && <Btn color="primary" size="sm" onClick={() => initModal("add")}>+ Agregar auxiliar</Btn>}
        </div>
      </div>
      <ErrorMsg msg={error} />
      <SuccessMsg msg={ok} />
      <TableWrapper>
        <thead>
          <tr>
            <Th>RUT</Th>
            <Th>Nombre</Th>
            <Th>Tipo</Th>
            <Th>Roles</Th>
            <Th>País</Th>
            <Th>Estado</Th>
            {canEdit && <Th></Th>}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <LoadingRow cols={canEdit ? 7 : 6} />
          ) : auxiliares.length === 0 ? (
            <EmptyRow cols={canEdit ? 7 : 6} />
          ) : (
            auxiliares.map((a) => (
              <Tr key={a.id}>
                <Td style={{ fontFamily: "monospace", color: C.textMuted }}>{a.rut || "—"}</Td>
                <Td style={{ fontWeight: 500 }}>{a.nombre}</Td>
                <Td><Badge label={a.tipo_persona} color="muted" /></Td>
                <Td>
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                    {a.es_cliente && <Badge label="Cliente" color="primary" />}
                    {a.es_proveedor && <Badge label="Proveedor" color="warning" />}
                    {a.es_trabajador && <Badge label="Trabajador" color="teal" />}
                    {a.es_extranjero && <Badge label="Extranjero" color="info" />}
                  </div>
                </Td>
                <Td style={{ color: C.textMuted }}>{a.pais || "—"}</Td>
                <Td>
                  <Badge label={a.activo ? "Activo" : "Inactivo"} color={a.activo ? "success" : "muted"} />
                </Td>
                {canEdit && (
                  <Td>
                    <div style={{ display: "flex", gap: 6 }}>
                      <Btn size="sm" color="ghost" onClick={() => initModal("edit", a)}>Editar</Btn>
                      <Btn size="sm" color={a.activo ? "warning" : "success"} onClick={() => handleToggle(a)}>
                        {a.activo ? "Desactivar" : "Activar"}
                      </Btn>
                    </div>
                  </Td>
                )}
              </Tr>
            ))
          )}
        </tbody>
      </TableWrapper>
      {totalPags > 1 && (
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 10, alignItems: "center" }}>
          <span style={{ fontSize: 12, color: C.textMuted }}>{total} registros</span>
          <Btn size="sm" color="ghost" disabled={pagina === 0} onClick={() => setPagina((p) => p - 1)}>‹ Anterior</Btn>
          <span style={{ fontSize: 12, color: C.text }}>{pagina + 1} / {totalPags}</span>
          <Btn size="sm" color="ghost" disabled={pagina >= totalPags - 1} onClick={() => setPagina((p) => p + 1)}>Siguiente ›</Btn>
        </div>
      )}

      {modal && (
        <Modal
          title={modal.mode === "add" ? "Nuevo auxiliar" : `Editar — ${modal.item.nombre}`}
          onClose={() => { setModal(null); setError(""); }}
          width={600}
        >
          <ErrorMsg msg={error} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 16px" }}>
            <Field label="RUT">{textInput(modal.item.rut || "", (v) => setModal((x) => ({ ...x, item: { ...x.item, rut: v } })))}</Field>
            <Field label="Tipo persona">
              <SelectInput
                value={modal.item.tipo_persona || "natural"}
                onChange={(v) => setModal((x) => ({ ...x, item: { ...x.item, tipo_persona: v } }))}
                options={TIPOS_PERSONA.map((t) => ({ value: t, label: t }))}
                style={{ width: "100%" }}
              />
            </Field>
          </div>
          <Field label="Nombre" required>
            {textInput(modal.item.nombre, (v) => setModal((x) => ({ ...x, item: { ...x.item, nombre: v } })))}
          </Field>
          <Field label="Roles">
            <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
              {checkInput(modal.item.es_cliente, (v) => setModal((x) => ({ ...x, item: { ...x.item, es_cliente: v } })), "Cliente")}
              {checkInput(modal.item.es_proveedor, (v) => setModal((x) => ({ ...x, item: { ...x.item, es_proveedor: v } })), "Proveedor")}
              {checkInput(modal.item.es_trabajador, (v) => setModal((x) => ({ ...x, item: { ...x.item, es_trabajador: v } })), "Trabajador")}
              {checkInput(modal.item.es_extranjero, (v) => setModal((x) => ({ ...x, item: { ...x.item, es_extranjero: v } })), "Extranjero")}
            </div>
          </Field>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 16px" }}>
            <Field label="País">{textInput(modal.item.pais || "", (v) => setModal((x) => ({ ...x, item: { ...x.item, pais: v } })))}</Field>
            <Field label="Moneda habitual">
              <SelectInput
                value={modal.item.moneda_habitual || "CLP"}
                onChange={(v) => setModal((x) => ({ ...x, item: { ...x.item, moneda_habitual: v } }))}
                options={["CLP", "USD", "EUR", "PEN", "GBP"].map((m) => ({ value: m, label: m }))}
                style={{ width: "100%" }}
              />
            </Field>
            <Field label="Email">{textInput(modal.item.email || "", (v) => setModal((x) => ({ ...x, item: { ...x.item, email: v } })))}</Field>
            <Field label="Teléfono">{textInput(modal.item.telefono || "", (v) => setModal((x) => ({ ...x, item: { ...x.item, telefono: v } })))}</Field>
          </div>
          <Field label="Dirección">{textInput(modal.item.direccion || "", (v) => setModal((x) => ({ ...x, item: { ...x.item, direccion: v } })))}</Field>
          <Field label="Giro">{textInput(modal.item.giro || "", (v) => setModal((x) => ({ ...x, item: { ...x.item, giro: v } })))}</Field>
          <Field label="Observaciones">
            <textarea
              value={modal.item.observaciones || ""}
              onChange={(e) => setModal((x) => ({ ...x, item: { ...x.item, observaciones: e.target.value } }))}
              rows={2}
              style={{
                background: C.bgInput,
                border: `1px solid ${C.border}`,
                borderRadius: 6,
                color: C.text,
                fontSize: 13,
                padding: "7px 10px",
                outline: "none",
                width: "100%",
                resize: "vertical",
                boxSizing: "border-box",
              }}
            />
          </Field>
          {checkInput(modal.item.activo !== false, (v) => setModal((x) => ({ ...x, item: { ...x.item, activo: v } })), "Activo")}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 14 }}>
            <Btn color="ghost" onClick={() => { setModal(null); setError(""); }}>Cancelar</Btn>
            <Btn color="primary" onClick={handleSave}>
              {modal.mode === "add" ? "Crear auxiliar" : "Guardar cambios"}
            </Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── Tab 4: Centros de Costo ─────────────────────────────────────────────────

function CentrosCostoTab({ empresaId, canEdit }) {
  const [centros, setCentros] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [modal, setModal] = useState(null);
  const [confirm, setConfirm] = useState(null);

  const load = useCallback(async () => {
    if (!empresaId) return;
    setLoading(true);
    setError("");
    try {
      const data = await supaSelect("centros_costo", `empresa_id=eq.${empresaId}&order=codigo.asc`);
      setCentros(data || []);
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  }, [empresaId]);

  useEffect(() => { load(); }, [load]);

  const initModal = (mode, item = null) => {
    if (mode === "add") {
      setModal({ mode, item: { empresa_id: empresaId, codigo: "", nombre: "", descripcion: "", activo: true } });
    } else {
      setModal({ mode, item: { ...item } });
    }
  };

  const handleSave = async () => {
    const { mode, item } = modal;
    if (!item.codigo || !item.nombre) { setError("Código y nombre son obligatorios"); return; }
    setError("");
    try {
      const payload = { empresa_id: empresaId, codigo: item.codigo.trim(), nombre: item.nombre.trim(), descripcion: item.descripcion || "", activo: item.activo !== false };
      if (mode === "add") {
        await supaInsert("centros_costo", payload);
      } else {
        await supaUpdate("centros_costo", item.id, payload);
      }
      setOk(mode === "add" ? "Centro creado" : "Centro actualizado");
      setModal(null);
      load();
      setTimeout(() => setOk(""), 3000);
    } catch (e) {
      setError(e.message);
    }
  };

  const handleToggle = async (item) => {
    try {
      await supaUpdate("centros_costo", item.id, { activo: !item.activo });
      load();
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 14 }}>
        {canEdit && empresaId && (
          <Btn color="primary" size="sm" onClick={() => initModal("add")}>+ Agregar centro</Btn>
        )}
      </div>
      <ErrorMsg msg={error} />
      <SuccessMsg msg={ok} />
      {!empresaId ? (
        <div style={{ padding: 32, textAlign: "center", color: C.textMuted }}>Selecciona una empresa para ver sus centros de costo.</div>
      ) : (
        <TableWrapper>
          <thead>
            <tr>
              <Th>Código</Th>
              <Th>Nombre</Th>
              <Th>Descripción</Th>
              <Th>Estado</Th>
              {canEdit && <Th></Th>}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <LoadingRow cols={canEdit ? 5 : 4} />
            ) : centros.length === 0 ? (
              <EmptyRow cols={canEdit ? 5 : 4} />
            ) : (
              centros.map((c) => (
                <Tr key={c.id}>
                  <Td><span style={{ fontFamily: "monospace", color: C.primary }}>{c.codigo}</span></Td>
                  <Td style={{ fontWeight: 500 }}>{c.nombre}</Td>
                  <Td style={{ color: C.textMuted, fontSize: 12 }}>{c.descripcion || "—"}</Td>
                  <Td><Badge label={c.activo ? "Activo" : "Inactivo"} color={c.activo ? "success" : "muted"} /></Td>
                  {canEdit && (
                    <Td>
                      <div style={{ display: "flex", gap: 6 }}>
                        <Btn size="sm" color="ghost" onClick={() => initModal("edit", c)}>Editar</Btn>
                        <Btn size="sm" color={c.activo ? "warning" : "success"} onClick={() => handleToggle(c)}>
                          {c.activo ? "Desactivar" : "Activar"}
                        </Btn>
                      </div>
                    </Td>
                  )}
                </Tr>
              ))
            )}
          </tbody>
        </TableWrapper>
      )}

      {modal && (
        <Modal
          title={modal.mode === "add" ? "Nuevo centro de costo" : `Editar — ${modal.item.nombre}`}
          onClose={() => { setModal(null); setError(""); }}
        >
          <ErrorMsg msg={error} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: "0 16px" }}>
            <Field label="Código" required>{textInput(modal.item.codigo, (v) => setModal((x) => ({ ...x, item: { ...x.item, codigo: v } })))}</Field>
            <Field label="Nombre" required>{textInput(modal.item.nombre, (v) => setModal((x) => ({ ...x, item: { ...x.item, nombre: v } })))}</Field>
          </div>
          <Field label="Descripción">{textInput(modal.item.descripcion || "", (v) => setModal((x) => ({ ...x, item: { ...x.item, descripcion: v } })))}</Field>
          {checkInput(modal.item.activo !== false, (v) => setModal((x) => ({ ...x, item: { ...x.item, activo: v } })), "Activo")}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 14 }}>
            <Btn color="ghost" onClick={() => { setModal(null); setError(""); }}>Cancelar</Btn>
            <Btn color="primary" onClick={handleSave}>{modal.mode === "add" ? "Crear" : "Guardar"}</Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── Tab 5: Tipos de Documento ────────────────────────────────────────────────

function TiposDocumentoTab({ canEdit }) {
  const [tipos, setTipos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [modal, setModal] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await supaSelect("tipos_documento", "order=codigo.asc");
      setTipos(data || []);
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const initModal = (mode, item = null) => {
    if (mode === "add") {
      setModal({ mode, item: { codigo: "", nombre: "", descripcion: "", aplica_auxiliar: false, activo: true } });
    } else {
      setModal({ mode, item: { ...item } });
    }
  };

  const handleSave = async () => {
    const { mode, item } = modal;
    if (!item.codigo || !item.nombre) { setError("Código y nombre son obligatorios"); return; }
    setError("");
    try {
      const payload = {
        codigo: item.codigo.trim().toUpperCase(),
        nombre: item.nombre.trim(),
        descripcion: item.descripcion || "",
        aplica_auxiliar: !!item.aplica_auxiliar,
        activo: item.activo !== false,
      };
      if (mode === "add") {
        await supaInsert("tipos_documento", payload);
      } else {
        await supaUpdate("tipos_documento", item.id, payload);
      }
      setOk(mode === "add" ? "Tipo creado" : "Tipo actualizado");
      setModal(null);
      load();
      setTimeout(() => setOk(""), 3000);
    } catch (e) {
      setError(e.message);
    }
  };

  const handleToggle = async (item) => {
    try {
      await supaUpdate("tipos_documento", item.id, { activo: !item.activo });
      load();
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 14 }}>
        {canEdit && <Btn color="primary" size="sm" onClick={() => initModal("add")}>+ Agregar tipo</Btn>}
      </div>
      <ErrorMsg msg={error} />
      <SuccessMsg msg={ok} />
      <TableWrapper>
        <thead>
          <tr>
            <Th>Código</Th>
            <Th>Nombre</Th>
            <Th>Descripción</Th>
            <Th>Aplica auxiliar</Th>
            <Th>Estado</Th>
            {canEdit && <Th></Th>}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <LoadingRow cols={canEdit ? 6 : 5} />
          ) : tipos.length === 0 ? (
            <EmptyRow cols={canEdit ? 6 : 5} />
          ) : (
            tipos.map((t) => (
              <Tr key={t.id}>
                <Td><span style={{ fontFamily: "monospace", color: C.primary, fontWeight: 600 }}>{t.codigo}</span></Td>
                <Td style={{ fontWeight: 500 }}>{t.nombre}</Td>
                <Td style={{ color: C.textMuted, fontSize: 12 }}>{t.descripcion || "—"}</Td>
                <Td>{t.aplica_auxiliar ? <Badge label="Sí" color="success" /> : <Badge label="No" color="muted" />}</Td>
                <Td><Badge label={t.activo ? "Activo" : "Inactivo"} color={t.activo ? "success" : "muted"} /></Td>
                {canEdit && (
                  <Td>
                    <div style={{ display: "flex", gap: 6 }}>
                      <Btn size="sm" color="ghost" onClick={() => initModal("edit", t)}>Editar</Btn>
                      <Btn size="sm" color={t.activo ? "warning" : "success"} onClick={() => handleToggle(t)}>
                        {t.activo ? "Desactivar" : "Activar"}
                      </Btn>
                    </div>
                  </Td>
                )}
              </Tr>
            ))
          )}
        </tbody>
      </TableWrapper>

      {modal && (
        <Modal
          title={modal.mode === "add" ? "Nuevo tipo de documento" : `Editar — ${modal.item.codigo}`}
          onClose={() => { setModal(null); setError(""); }}
        >
          <ErrorMsg msg={error} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: "0 16px" }}>
            <Field label="Código" required>
              {textInput(modal.item.codigo, (v) => setModal((x) => ({ ...x, item: { ...x.item, codigo: v.toUpperCase() } })), "ej. FC")}
            </Field>
            <Field label="Nombre" required>
              {textInput(modal.item.nombre, (v) => setModal((x) => ({ ...x, item: { ...x.item, nombre: v } })))}
            </Field>
          </div>
          <Field label="Descripción">
            {textInput(modal.item.descripcion || "", (v) => setModal((x) => ({ ...x, item: { ...x.item, descripcion: v } })))}
          </Field>
          <div style={{ display: "flex", gap: 20, marginBottom: 14 }}>
            {checkInput(modal.item.aplica_auxiliar, (v) => setModal((x) => ({ ...x, item: { ...x.item, aplica_auxiliar: v } })), "Aplica auxiliar")}
            {checkInput(modal.item.activo !== false, (v) => setModal((x) => ({ ...x, item: { ...x.item, activo: v } })), "Activo")}
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <Btn color="ghost" onClick={() => { setModal(null); setError(""); }}>Cancelar</Btn>
            <Btn color="primary" onClick={handleSave}>{modal.mode === "add" ? "Crear" : "Guardar"}</Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── Tab 6: Períodos ─────────────────────────────────────────────────────────

const MESES_NOMBRE = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const ESTADO_COLOR = { abierto: "success", cerrado: "warning", bloqueado: "danger" };
const ESTADO_SIGUIENTE = { abierto: "cerrado", cerrado: "bloqueado", bloqueado: null };
const ESTADO_ANTERIOR = { abierto: null, cerrado: "abierto", bloqueado: "cerrado" };

function PeriodosTab({ empresaId, canEdit }) {
  const [periodos, setPeriodos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [anio, setAnio] = useState(new Date().getFullYear());
  const [creando, setCreando] = useState(false);

  const load = useCallback(async () => {
    if (!empresaId) return;
    setLoading(true);
    setError("");
    try {
      const data = await supaSelect("periodos", `empresa_id=eq.${empresaId}&anio=eq.${anio}&order=mes.asc`);
      setPeriodos(data || []);
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  }, [empresaId, anio]);

  useEffect(() => { load(); }, [load]);

  const handleCambiarEstado = async (periodo, nuevoEstado) => {
    setError("");
    try {
      await supaUpdate("periodos", periodo.id, { estado: nuevoEstado });
      setOk(`Período ${MESES_NOMBRE[periodo.mes - 1]} ${nuevoEstado}`);
      load();
      setTimeout(() => setOk(""), 3000);
    } catch (e) {
      setError(e.message);
    }
  };

  const handleCrearPeriodos = async () => {
    if (!window.confirm(`¿Crear los 12 períodos del año ${anio} para esta empresa?`)) return;
    setCreando(true);
    setError("");
    try {
      const mesesExistentes = new Set(periodos.map((p) => p.mes));
      const nuevos = [];
      for (let m = 1; m <= 12; m++) {
        if (!mesesExistentes.has(m)) {
          nuevos.push({ empresa_id: empresaId, anio, mes: m, estado: "abierto" });
        }
      }
      if (nuevos.length === 0) {
        setOk("Todos los períodos ya existen");
      } else {
        await supaInsert("periodos", nuevos);
        setOk(`${nuevos.length} períodos creados`);
        load();
      }
      setTimeout(() => setOk(""), 4000);
    } catch (e) {
      setError(e.message);
    }
    setCreando(false);
  };

  const anioOpts = [];
  const currentYear = new Date().getFullYear();
  for (let y = currentYear - 3; y <= currentYear + 2; y++) {
    anioOpts.push({ value: y, label: String(y) });
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 14, flexWrap: "wrap" }}>
        <SelectInput
          value={anio}
          onChange={(v) => setAnio(Number(v))}
          options={anioOpts}
        />
        {canEdit && empresaId && (
          <Btn color="teal" size="sm" onClick={handleCrearPeriodos} disabled={creando}>
            {creando ? "Creando..." : `Crear períodos ${anio}`}
          </Btn>
        )}
      </div>
      <ErrorMsg msg={error} />
      <SuccessMsg msg={ok} />
      {!empresaId ? (
        <div style={{ padding: 32, textAlign: "center", color: C.textMuted }}>Selecciona una empresa para ver sus períodos.</div>
      ) : (
        <TableWrapper>
          <thead>
            <tr>
              <Th>Mes</Th>
              <Th>Período</Th>
              <Th>Estado</Th>
              {canEdit && <Th>Acciones</Th>}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <LoadingRow cols={canEdit ? 4 : 3} />
            ) : periodos.length === 0 ? (
              <tr>
                <td
                  colSpan={canEdit ? 4 : 3}
                  style={{ padding: 32, textAlign: "center", color: C.textMuted, fontSize: 13 }}
                >
                  Sin períodos. Usa el botón "Crear períodos {anio}" para generarlos.
                </td>
              </tr>
            ) : (
              MESES_NOMBRE.map((mes, idx) => {
                const periodo = periodos.find((p) => p.mes === idx + 1);
                if (!periodo) {
                  return (
                    <Tr key={idx}>
                      <Td style={{ color: C.textDim }}>{String(idx + 1).padStart(2, "0")}</Td>
                      <Td style={{ color: C.textDim }}>{mes} {anio}</Td>
                      <Td><Badge label="No creado" color="muted" /></Td>
                      {canEdit && <Td>—</Td>}
                    </Tr>
                  );
                }
                const sigEstado = ESTADO_SIGUIENTE[periodo.estado];
                const antEstado = ESTADO_ANTERIOR[periodo.estado];
                return (
                  <Tr key={periodo.id}>
                    <Td style={{ color: C.textMuted }}>{String(periodo.mes).padStart(2, "0")}</Td>
                    <Td style={{ fontWeight: 500 }}>{mes} {anio}</Td>
                    <Td>
                      <Badge
                        label={periodo.estado.charAt(0).toUpperCase() + periodo.estado.slice(1)}
                        color={ESTADO_COLOR[periodo.estado] || "muted"}
                      />
                    </Td>
                    {canEdit && (
                      <Td>
                        <div style={{ display: "flex", gap: 6 }}>
                          {antEstado && (
                            <Btn
                              size="sm"
                              color={antEstado === "abierto" ? "success" : "ghost"}
                              onClick={() => handleCambiarEstado(periodo, antEstado)}
                            >
                              {antEstado === "abierto" ? "Abrir" : "Reabrir"}
                            </Btn>
                          )}
                          {sigEstado && (
                            <Btn
                              size="sm"
                              color={sigEstado === "cerrado" ? "warning" : "danger"}
                              onClick={() => handleCambiarEstado(periodo, sigEstado)}
                            >
                              {sigEstado === "cerrado" ? "Cerrar" : "Bloquear"}
                            </Btn>
                          )}
                        </div>
                      </Td>
                    )}
                  </Tr>
                );
              })
            )}
          </tbody>
        </TableWrapper>
      )}
    </div>
  );
}

// ─── Tab 7: Homologación ─────────────────────────────────────────────────────

const SISTEMAS_ORIGEN = ["megasystem", "contec", "otro"];

function HomologacionTab({ empresaId, canEdit }) {
  const [homologaciones, setHomologaciones] = useState([]);
  const [cuentas, setCuentas] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [sistema, setSistema] = useState("megasystem");
  const [filtro, setFiltro] = useState("todos"); // todos | sin_asignar | asignados
  const [busqueda, setBusqueda] = useState("");
  const [modalAsignar, setModalAsignar] = useState(null);
  const [buscaCuenta, setBuscaCuenta] = useState("");
  const [guardando, setGuardando] = useState(false);

  const loadData = useCallback(async () => {
    if (!empresaId) return;
    setLoading(true);
    setError("");
    try {
      const [homos, plan] = await Promise.all([
        supaSelect(
          "contab_homologacion",
          `empresa_id=eq.${empresaId}&sistema_origen=eq.${sistema}&deleted_at=is.null&order=codigo_origen.asc`
        ),
        supaSelect(
          "contab_plan_cuentas",
          `empresa_id=eq.${empresaId}&activa=eq.true&deleted_at=is.null&order=orden_display.asc,codigo.asc`
        ),
      ]);
      setHomologaciones(homos || []);
      setCuentas(plan || []);
    } catch (e) {
      setError("Error cargando datos: " + e.message);
    }
    setLoading(false);
  }, [empresaId, sistema]);

  useEffect(() => { loadData(); }, [loadData]);

  const filasFiltradas = useMemo(() => {
    let rows = homologaciones;
    if (filtro === "sin_asignar") rows = rows.filter((r) => !r.cuenta_id);
    else if (filtro === "asignados") rows = rows.filter((r) => !!r.cuenta_id);
    if (busqueda.trim()) {
      const q = busqueda.trim().toLowerCase();
      rows = rows.filter(
        (r) =>
          (r.codigo_origen || "").toLowerCase().includes(q) ||
          (r.nombre_origen || "").toLowerCase().includes(q)
      );
    }
    return rows;
  }, [homologaciones, filtro, busqueda]);

  const cuentasFiltradas = useMemo(() => {
    if (!buscaCuenta.trim()) return cuentas;
    const q = buscaCuenta.trim().toLowerCase();
    return cuentas.filter(
      (c) =>
        (c.codigo || "").toLowerCase().includes(q) ||
        (c.nombre || "").toLowerCase().includes(q)
    );
  }, [cuentas, buscaCuenta]);

  const totalAsignados = useMemo(
    () => homologaciones.filter((r) => !!r.cuenta_id).length,
    [homologaciones]
  );

  const handleAsignar = async (cuentaSeleccionada) => {
    if (!modalAsignar) return;
    setGuardando(true);
    setError("");
    try {
      await supaUpdate("contab_homologacion", modalAsignar.homologacion.id, {
        cuenta_id: cuentaSeleccionada.id,
      });
      setOk(`Cuenta "${cuentaSeleccionada.codigo} – ${cuentaSeleccionada.nombre}" asignada`);
      setModalAsignar(null);
      setBuscaCuenta("");
      await loadData();
      setTimeout(() => setOk(""), 4000);
    } catch (e) {
      setError("Error al guardar: " + e.message);
    }
    setGuardando(false);
  };

  const handleDesasignar = async (homo) => {
    setError("");
    try {
      await supaUpdate("contab_homologacion", homo.id, { cuenta_id: null });
      setOk("Cuenta desasignada");
      await loadData();
      setTimeout(() => setOk(""), 3000);
    } catch (e) {
      setError("Error al desasignar: " + e.message);
    }
  };

  const handleToggleActivo = async (homo) => {
    setError("");
    try {
      await supaUpdate("contab_homologacion", homo.id, { activo: !homo.activo });
      await loadData();
    } catch (e) {
      setError(e.message);
    }
  };

  const cuentaMap = useMemo(() => {
    const m = {};
    cuentas.forEach((c) => { m[c.id] = c; });
    return m;
  }, [cuentas]);

  const pct = homologaciones.length > 0
    ? Math.round((totalAsignados / homologaciones.length) * 100)
    : 0;

  return (
    <div>
      {/* Barra de progreso */}
      {homologaciones.length > 0 && (
        <div style={{ marginBottom: 16, background: C.surface2, borderRadius: 8, padding: "10px 14px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <span style={{ fontSize: 13, color: C.textMuted }}>
              Progreso de homologación —{" "}
              <strong style={{ color: C.text }}>{totalAsignados}</strong>{" "}
              de <strong style={{ color: C.text }}>{homologaciones.length}</strong> códigos asignados
            </span>
            <span style={{ fontSize: 13, fontWeight: 700, color: pct === 100 ? C.success : C.warning }}>
              {pct}%
            </span>
          </div>
          <div style={{ height: 6, background: C.border, borderRadius: 3, overflow: "hidden" }}>
            <div
              style={{
                height: "100%",
                width: `${pct}%`,
                background: pct === 100 ? C.success : C.primary,
                borderRadius: 3,
                transition: "width 0.4s",
              }}
            />
          </div>
        </div>
      )}

      {/* Controles */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14, alignItems: "center" }}>
        <SelectInput
          value={sistema}
          onChange={setSistema}
          options={SISTEMAS_ORIGEN.map((s) => ({ value: s, label: s.charAt(0).toUpperCase() + s.slice(1) }))}
        />
        <SelectInput
          value={filtro}
          onChange={setFiltro}
          options={[
            { value: "todos", label: "Todos" },
            { value: "sin_asignar", label: "Sin asignar" },
            { value: "asignados", label: "Asignados" },
          ]}
        />
        <input
          type="text"
          placeholder="Buscar código o nombre..."
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          style={{
            padding: "6px 10px", borderRadius: 6, border: `1px solid ${C.border}`,
            background: C.inputBg, color: C.text, fontSize: 13, width: 200,
          }}
        />
        <span style={{ marginLeft: "auto", fontSize: 12, color: C.textDim }}>
          {filasFiltradas.length} registros
        </span>
      </div>

      <ErrorMsg msg={error} />
      <SuccessMsg msg={ok} />

      {!empresaId ? (
        <div style={{ padding: 32, textAlign: "center", color: C.textMuted }}>Selecciona una empresa.</div>
      ) : (
        <TableWrapper>
          <thead>
            <tr>
              <Th>Código origen</Th>
              <Th>Nombre origen</Th>
              <Th style={{ textAlign: "center" }}>→</Th>
              <Th>Cuenta interna</Th>
              <Th>Estado</Th>
              {canEdit && <Th></Th>}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <LoadingRow cols={canEdit ? 6 : 5} />
            ) : filasFiltradas.length === 0 ? (
              <EmptyRow cols={canEdit ? 6 : 5} />
            ) : (
              filasFiltradas.map((h) => {
                const cuenta = h.cuenta_id ? cuentaMap[h.cuenta_id] : null;
                return (
                  <Tr key={h.id}>
                    <Td>
                      <span style={{ fontFamily: "monospace", color: C.warning }}>{h.codigo_origen}</span>
                    </Td>
                    <Td style={{ color: C.textMuted, fontSize: 12 }}>{h.nombre_origen || "—"}</Td>
                    <Td style={{ textAlign: "center", color: C.textDim }}>→</Td>
                    <Td>
                      {cuenta ? (
                        <span>
                          <span style={{ fontFamily: "monospace", color: C.primary, fontSize: 12 }}>
                            {cuenta.codigo}
                          </span>
                          <span style={{ color: C.text, fontSize: 12, marginLeft: 6 }}>
                            {cuenta.nombre}
                          </span>
                        </span>
                      ) : (
                        <span style={{ color: C.textDim, fontSize: 12, fontStyle: "italic" }}>Sin asignar</span>
                      )}
                    </Td>
                    <Td>
                      <Badge
                        label={h.activo !== false ? "Activo" : "Inactivo"}
                        color={h.activo !== false ? "success" : "muted"}
                      />
                    </Td>
                    {canEdit && (
                      <Td>
                        <div style={{ display: "flex", gap: 6 }}>
                          <Btn
                            size="sm"
                            color={cuenta ? "ghost" : "primary"}
                            onClick={() => { setBuscaCuenta(""); setModalAsignar({ homologacion: h }); }}
                          >
                            {cuenta ? "Cambiar" : "Asignar"}
                          </Btn>
                          {cuenta && (
                            <Btn size="sm" color="danger" onClick={() => handleDesasignar(h)}>
                              Quitar
                            </Btn>
                          )}
                          <Btn
                            size="sm"
                            color={h.activo !== false ? "warning" : "success"}
                            onClick={() => handleToggleActivo(h)}
                          >
                            {h.activo !== false ? "Off" : "On"}
                          </Btn>
                        </div>
                      </Td>
                    )}
                  </Tr>
                );
              })
            )}
          </tbody>
        </TableWrapper>
      )}

      {/* Modal selector de cuenta */}
      {modalAsignar && (
        <Modal
          title={`Asignar cuenta — ${modalAsignar.homologacion.codigo_origen}`}
          onClose={() => { setModalAsignar(null); setBuscaCuenta(""); setError(""); }}
          width={640}
        >
          <ErrorMsg msg={error} />
          <p style={{ fontSize: 12, color: C.textMuted, marginBottom: 10 }}>
            {modalAsignar.homologacion.nombre_origen && (
              <span>Origen: <em>{modalAsignar.homologacion.nombre_origen}</em> — </span>
            )}
            Selecciona la cuenta del plan interno que corresponde.
          </p>
          <input
            type="text"
            placeholder="Buscar por código o nombre..."
            value={buscaCuenta}
            onChange={(e) => setBuscaCuenta(e.target.value)}
            autoFocus
            style={{
              width: "100%", padding: "7px 10px", borderRadius: 6,
              border: `1px solid ${C.border}`, background: C.inputBg,
              color: C.text, fontSize: 13, marginBottom: 10, boxSizing: "border-box",
            }}
          />
          <div style={{ maxHeight: 340, overflowY: "auto", border: `1px solid ${C.border}`, borderRadius: 6 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ background: C.surface2 }}>
                  <Th>Código</Th>
                  <Th>Nombre</Th>
                  <Th>Tipo</Th>
                  <Th>Clasif. IFRS</Th>
                </tr>
              </thead>
              <tbody>
                {cuentasFiltradas.length === 0 ? (
                  <tr><td colSpan={4} style={{ padding: "16px", textAlign: "center", color: C.textDim }}>Sin resultados</td></tr>
                ) : (
                  cuentasFiltradas.map((c) => (
                    <tr
                      key={c.id}
                      onClick={() => !guardando && handleAsignar(c)}
                      style={{ cursor: "pointer", background: "transparent", borderBottom: `1px solid ${C.border}` }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.05)"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                    >
                      <td style={{ padding: "6px 10px", fontFamily: "monospace", color: C.primary }}>{c.codigo}</td>
                      <td style={{ padding: "6px 10px", color: C.text }}>{c.nombre}</td>
                      <td style={{ padding: "6px 10px", color: C.textMuted }}>{c.tipo}</td>
                      <td style={{ padding: "6px 10px", color: C.textDim, fontSize: 11 }}>{c.clasif_ifrs || "—"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
            <Btn color="ghost" onClick={() => { setModalAsignar(null); setBuscaCuenta(""); }}>Cancelar</Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── Tab 8: Libro Diario ─────────────────────────────────────────────────────

const TIPOS_ASIENTO = [
  { value: "manual", label: "Manual" },
  { value: "apertura", label: "Apertura período" },
  { value: "cierre", label: "Cierre período" },
  { value: "lote_compras", label: "Lote compras" },
  { value: "lote_ventas", label: "Lote ventas" },
  { value: "honorarios", label: "Honorarios" },
  { value: "remuneraciones", label: "Remuneraciones" },
  { value: "inventario", label: "Inventario" },
  { value: "activo_fijo", label: "Activo fijo" },
  { value: "ajuste", label: "Ajuste" },
  { value: "diferencia_tc", label: "Dif. tipo de cambio" },
];

const LIBROS_OPTS = [
  { value: "ambos", label: "Ambos (Trib + IFRS)" },
  { value: "tributario", label: "Tributario" },
  { value: "ifrs", label: "IFRS" },
];

const MESES_OPTS = [
  { value: 1, label: "Enero" }, { value: 2, label: "Febrero" },
  { value: 3, label: "Marzo" }, { value: 4, label: "Abril" },
  { value: 5, label: "Mayo" }, { value: 6, label: "Junio" },
  { value: 7, label: "Julio" }, { value: 8, label: "Agosto" },
  { value: 9, label: "Septiembre" }, { value: 10, label: "Octubre" },
  { value: 11, label: "Noviembre" }, { value: 12, label: "Diciembre" },
];

function lineaBlankLD(orden) {
  return {
    _key: Math.random().toString(36).slice(2),
    orden,
    cuenta_id: null,
    cuenta_codigo: "",
    cuenta_nombre: "",
    debe: "",
    haber: "",
    libro: "ambos",
    glosa: "",
    cuartel_id: "",
    auxiliar_id: "",
    moneda: "CLP",
    monto_me: "",
    tc_valor: "",
    _cuentaData: null,
    _err: "",
  };
}

function asientoBlankLD(empresaId) {
  const hoy = new Date();
  return {
    empresa_id: empresaId,
    anio: hoy.getFullYear(),
    mes: hoy.getMonth() + 1,
    fecha: hoy.toISOString().slice(0, 10),
    tipo: "manual",
    libro: "ambos",
    glosa: "",
    moneda: "CLP",
    estado: "borrador",
  };
}

function parseMonto(v) {
  if (v === "" || v === null || v === undefined) return 0;
  return parseFloat(String(v).replace(/\./g, "").replace(",", ".")) || 0;
}

function fmtCLP(n) {
  if (!n && n !== 0) return "";
  return Math.round(n).toLocaleString("es-CL");
}

function LibroDiarioTab({ empresaId, canEdit, usuario }) {
  const [vista, setVista] = useState("lista"); // 'lista' | 'editor' | 'masivo'

  // ── Lista ────────────────────────────────────────────────────────────────────
  const [asientos, setAsientos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [listError, setListError] = useState("");
  const [listOk, setListOk] = useState("");
  const hoy = new Date();
  const [filtroAnio, setFiltroAnio] = useState(hoy.getFullYear());
  const [filtroMes, setFiltroMes] = useState(hoy.getMonth() + 1);
  const [filtroTipo, setFiltroTipo] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("");
  const [buscar, setBuscar] = useState("");
  const cargaOkRef = useRef(false);

  // ── Datos auxiliares ──────────────────────────────────────────────────────────
  const [cuentas, setCuentas] = useState([]);
  const [cuarteles, setCuarteles] = useState([]);
  const [auxiliares, setAuxiliares] = useState([]);
  const [homologacion, setHomologacion] = useState([]);
  const auxCargadoRef = useRef(false);

  // ── Editor ───────────────────────────────────────────────────────────────────
  const [asiento, setAsiento] = useState(null);
  const [lineas, setLineas] = useState([]);
  const [lineasEliminadas, setLineasEliminadas] = useState([]);
  const [guardando, setGuardando] = useState(false);
  const [edError, setEdError] = useState("");
  const [edOk, setEdOk] = useState("");
  const [loadingLineas, setLoadingLineas] = useState(false);

  // ── Masivo ───────────────────────────────────────────────────────────────────
  const [mPaso, setMPaso] = useState(1);
  const [mArchivo, setMArchivo] = useState("");
  const [mRows, setMRows] = useState([]);
  const [mHeaders, setMHeaders] = useState([]);
  const [mSistema, setMSistema] = useState("contec");
  const [mCols, setMCols] = useState({ fecha: "", nroAsiento: "", glosaCab: "", codigoOrigen: "", glosaLinea: "", debe: "", haber: "", libroLinea: "" });
  const [mGrupos, setMGrupos] = useState([]); // [{key, fecha, glosa, tipo, lineas:[{...}]}]
  const [mMapa, setMMapa] = useState({}); // { codigo_origen: cuenta_id }
  const [mEstado, setMEstado] = useState("borrador");
  const [mGuardando, setMGuardando] = useState(false);
  const [mError, setMError] = useState("");
  const [mOk, setMOk] = useState("");
  const mFileRef = useRef();

  // ── Carga asientos ───────────────────────────────────────────────────────────
  const loadAsientos = useCallback(async () => {
    if (!empresaId) return;
    setLoading(true);
    setListError("");
    try {
      const data = await supaSelect(
        "contab_asientos",
        `empresa_id=eq.${empresaId}&anio=eq.${filtroAnio}&mes=eq.${filtroMes}&order=numero.desc`
      );
      setAsientos(data || []);
      cargaOkRef.current = true;
    } catch (e) {
      setListError("Error cargando asientos: " + e.message);
      throw e;
    } finally {
      setLoading(false);
    }
  }, [empresaId, filtroAnio, filtroMes]);

  useEffect(() => {
    cargaOkRef.current = false;
    loadAsientos();
  }, [loadAsientos]);

  // ── Carga datos auxiliares (cuentas, cuarteles, auxiliares, homologación) ────
  const loadAuxData = useCallback(async () => {
    if (!empresaId || auxCargadoRef.current) return;
    try {
      const [c, cu, ax, hom] = await Promise.all([
        supaSelect("contab_plan_cuentas", `empresa_id=eq.${empresaId}&activa=eq.true&order=codigo.asc`),
        supaSelect("cc_jerarquia", `empresa_id=eq.${empresaId}`),
        supaSelect("contab_auxiliares", `empresa_id=eq.${empresaId}&activo=eq.true&order=nombre.asc`),
        supaSelect("contab_homologacion", `empresa_id=eq.${empresaId}&activa=eq.true`),
      ]);
      setCuentas(c || []);
      setCuarteles(cu || []);
      setAuxiliares(ax || []);
      setHomologacion(hom || []);
      auxCargadoRef.current = true;
    } catch (e) {
      console.error("Error cargando datos auxiliares:", e.message);
    }
  }, [empresaId]);

  useEffect(() => {
    auxCargadoRef.current = false;
    loadAuxData();
  }, [loadAuxData]);

  // ── Memoized ─────────────────────────────────────────────────────────────────
  const cuentasHoja = useMemo(() => cuentas.filter((c) => c.nivel === 2), [cuentas]);

  const cuentasOpts = useMemo(
    () => [{ value: "", label: "— Seleccionar cuenta —" }].concat(
      cuentasHoja.map((c) => ({ value: c.id, label: `${c.codigo} — ${c.nombre}` }))
    ),
    [cuentasHoja]
  );

  const cuartelesOpts = useMemo(
    () => [{ value: "", label: "— Sin CeCo —" }].concat(
      cuarteles.map((c) => ({ value: c.cuartel_id, label: `${c.campo_codigo}.${c.sector_codigo}.${c.cuartel_codigo} — ${c.cuartel_nombre}` }))
    ),
    [cuarteles]
  );

  const auxiliaresOpts = useMemo(
    () => [{ value: "", label: "— Sin auxiliar —" }].concat(
      auxiliares.map((a) => ({ value: a.id, label: `${a.rut || ""} ${a.nombre}`.trim() }))
    ),
    [auxiliares]
  );

  const aniosOpts = useMemo(() => {
    const base = hoy.getFullYear();
    return [-1, 0, 1, 2].map((d) => ({ value: base - d, label: String(base - d) }));
  }, []);

  const asientosFiltrados = useMemo(() => {
    let arr = asientos;
    if (filtroTipo) arr = arr.filter((a) => a.tipo === filtroTipo);
    if (filtroEstado) arr = arr.filter((a) => a.estado === filtroEstado);
    if (buscar) {
      const q = buscar.toLowerCase();
      arr = arr.filter(
        (a) =>
          String(a.numero || "").includes(q) ||
          (a.glosa || "").toLowerCase().includes(q)
      );
    }
    return arr;
  }, [asientos, filtroTipo, filtroEstado, buscar]);

  // ── Cuadre del editor ─────────────────────────────────────────────────────────
  const totalDebe = useMemo(
    () => lineas.reduce((s, l) => s + parseMonto(l.debe), 0),
    [lineas]
  );
  const totalHaber = useMemo(
    () => lineas.reduce((s, l) => s + parseMonto(l.haber), 0),
    [lineas]
  );
  const cuadrado = Math.abs(totalDebe - totalHaber) < 0.005;

  // ── Errores de validación por línea ──────────────────────────────────────────
  const erroresLineas = useMemo(() => {
    return lineas.map((l) => {
      const errs = [];
      if (!l.cuenta_id) errs.push("Sin cuenta");
      else {
        const cd = l._cuentaData;
        if (cd) {
          if (cd.nivel === 1) errs.push("Cuenta agrupador (nivel 1)");
          if (cd.usa_ceco && !l.cuartel_id) errs.push("CeCo obligatorio");
          if (cd.usa_auxiliar && !l.auxiliar_id) errs.push("Auxiliar obligatorio");
        }
      }
      if (parseMonto(l.debe) === 0 && parseMonto(l.haber) === 0) errs.push("Debe o Haber > 0");
      if (parseMonto(l.debe) > 0 && parseMonto(l.haber) > 0) errs.push("Solo Debe O Haber");
      return errs;
    });
  }, [lineas]);

  const hayErroresLineas = erroresLineas.some((e) => e.length > 0);
  const puedeGuardar = lineas.length > 0 && !hayErroresLineas;
  const puedeMayorizar = puedeGuardar && cuadrado && asiento?.estado === "borrador";

  // ── Abrir editor ──────────────────────────────────────────────────────────────
  const abrirNuevo = () => {
    setAsiento(asientoBlankLD(empresaId));
    setLineas([lineaBlankLD(1), lineaBlankLD(2)]);
    setLineasEliminadas([]);
    setEdError("");
    setEdOk("");
    setVista("editor");
  };

  const abrirEditar = async (a) => {
    setAsiento({ ...a });
    setEdError("");
    setEdOk("");
    setLoadingLineas(true);
    setVista("editor");
    try {
      const data = await supaSelect(
        "contab_asientos_lineas",
        `asiento_id=eq.${a.id}&order=orden.asc`
      );
      const raw = data || [];
      const lns = raw.map((l) => {
        const cd = cuentas.find((c) => c.id === l.cuenta_id) || null;
        return {
          ...lineaBlankLD(l.orden),
          id: l.id,
          orden: l.orden,
          cuenta_id: l.cuenta_id,
          cuenta_codigo: l.cuenta_codigo || "",
          cuenta_nombre: l.cuenta_nombre || "",
          debe: l.debe > 0 ? fmtCLP(l.debe) : "",
          haber: l.haber > 0 ? fmtCLP(l.haber) : "",
          libro: l.libro || "ambos",
          glosa: l.glosa || "",
          cuartel_id: l.cuartel_id || "",
          auxiliar_id: l.auxiliar_id || "",
          moneda: l.moneda || "CLP",
          monto_me: l.monto_me || "",
          tc_valor: l.tc_valor || "",
          _cuentaData: cd,
        };
      });
      setLineas(lns.length ? lns : [lineaBlankLD(1), lineaBlankLD(2)]);
      setLineasEliminadas([]);
    } catch (e) {
      setEdError("Error cargando líneas: " + e.message);
    }
    setLoadingLineas(false);
  };

  // ── Lookup cuenta por código ──────────────────────────────────────────────────
  const resolverCuentaCodigo = (codigo) => {
    const cd = cuentasHoja.find(
      (c) => c.codigo.trim().toLowerCase() === codigo.trim().toLowerCase()
    );
    return cd || null;
  };

  const updateLinea = (idx, field, value) => {
    setLineas((prev) =>
      prev.map((l, i) => {
        if (i !== idx) return l;
        const updated = { ...l, [field]: value };
        if (field === "cuenta_codigo") {
          const cd = resolverCuentaCodigo(value);
          updated._cuentaData = cd;
          updated.cuenta_id = cd ? cd.id : null;
          updated.cuenta_nombre = cd ? cd.nombre : "";
          if (cd) {
            if (!cd.usa_ceco) updated.cuartel_id = "";
            if (!cd.usa_auxiliar) updated.auxiliar_id = "";
            if (!cd.acepta_me) { updated.moneda = "CLP"; updated.monto_me = ""; updated.tc_valor = ""; }
          }
        }
        if (field === "cuenta_id") {
          const cd = cuentas.find((c) => c.id === value) || null;
          updated._cuentaData = cd;
          updated.cuenta_codigo = cd ? cd.codigo : "";
          updated.cuenta_nombre = cd ? cd.nombre : "";
        }
        return updated;
      })
    );
  };

  const agregarLinea = () =>
    setLineas((prev) => [...prev, lineaBlankLD(prev.length + 1)]);

  const eliminarLinea = (idx) => {
    setLineas((prev) => {
      const l = prev[idx];
      if (l.id) setLineasEliminadas((d) => [...d, l.id]);
      return prev.filter((_, i) => i !== idx).map((l, i) => ({ ...l, orden: i + 1 }));
    });
  };

  // ── Guardar asiento (cabecera + líneas) ───────────────────────────────────────
  const handleGuardar = async () => {
    if (!cargaOkRef.current) { setEdError("Lista no cargada aún, espera un momento"); return; }
    if (!asiento.glosa?.trim()) { setEdError("La glosa es obligatoria"); return; }
    if (!puedeGuardar) { setEdError("Corrige los errores en las líneas antes de guardar"); return; }
    setGuardando(true);
    setEdError("");
    try {
      const payload = {
        empresa_id: empresaId,
        anio: Number(asiento.anio),
        mes: Number(asiento.mes),
        fecha: asiento.fecha,
        tipo: asiento.tipo,
        libro: asiento.libro,
        glosa: asiento.glosa.trim(),
        moneda: asiento.moneda || "CLP",
        estado: "borrador",
        usuario_crea: usuario?.id || null,
        total_debe: totalDebe,
        total_haber: totalHaber,
      };

      let asientoId = asiento.id;
      if (!asientoId) {
        const [nuevo] = await supaInsert("contab_asientos", payload);
        asientoId = nuevo.id;
        setAsiento((a) => ({ ...a, id: asientoId, numero: nuevo.numero }));
      } else {
        await supaUpdate("contab_asientos", asientoId, {
          ...payload,
          updated_at: new Date().toISOString(),
        });
      }

      // Eliminar líneas borradas
      for (const lid of lineasEliminadas) {
        await supaFetch(`contab_asientos_lineas?id=eq.${lid}`, { method: "DELETE" });
      }
      setLineasEliminadas([]);

      // Upsert líneas
      const payloadLineas = lineas.map((l, i) => ({
        ...(l.id ? { id: l.id } : {}),
        asiento_id: asientoId,
        orden: i + 1,
        cuenta_id: l.cuenta_id,
        cuenta_codigo: l.cuenta_codigo,
        cuenta_nombre: l.cuenta_nombre,
        debe: parseMonto(l.debe),
        haber: parseMonto(l.haber),
        libro: l.libro || "ambos",
        glosa: l.glosa || null,
        cuartel_id: l.cuartel_id || null,
        auxiliar_id: l.auxiliar_id || null,
        moneda: l.moneda || "CLP",
        monto_me: parseMonto(l.monto_me) || null,
        tc_valor: parseMonto(l.tc_valor) || null,
      }));
      await supaUpsert("contab_asientos_lineas", payloadLineas, "id");

      // Actualizar totales en cabecera
      await supaUpdate("contab_asientos", asientoId, {
        total_debe: totalDebe,
        total_haber: totalHaber,
      });

      setEdOk("Asiento guardado");
      loadAsientos();
      setTimeout(() => setEdOk(""), 3000);
    } catch (e) {
      setEdError("Error guardando: " + e.message);
    }
    setGuardando(false);
  };

  const handleMayorizar = async () => {
    if (!puedeMayorizar) return;
    setGuardando(true);
    setEdError("");
    try {
      await handleGuardar();
      await supaUpdate("contab_asientos", asiento.id, {
        estado: "mayorizado",
        fecha_mayorizado: new Date().toISOString(),
        usuario_mayorizo: usuario?.id || null,
      });
      setAsiento((a) => ({ ...a, estado: "mayorizado" }));
      setEdOk("Asiento mayorizado correctamente");
      loadAsientos();
      setTimeout(() => setEdOk(""), 4000);
    } catch (e) {
      setEdError("Error al mayorizar: " + e.message);
    }
    setGuardando(false);
  };

  // ── Masivo: archivo ───────────────────────────────────────────────────────────
  const resetMasivo = () => {
    setMPaso(1); setMArchivo(""); setMRows([]); setMHeaders([]);
    setMSistema("contec"); setMOk(""); setMError("");
    setMGrupos([]); setMMapa({});
    setMCols({ fecha: "", nroAsiento: "", glosaCab: "", codigoOrigen: "", glosaLinea: "", debe: "", haber: "", libroLinea: "" });
    if (mFileRef.current) mFileRef.current.value = "";
  };

  const handleMasivoArchivo = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setMArchivo(file.name);
    setMError("");
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const wb = XLSX.read(ev.target.result, { type: "binary" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { defval: "", raw: false });
        if (!rows.length) { setMError("Archivo vacío"); return; }
        const hdrs = Object.keys(rows[0]);
        setMRows(rows);
        setMHeaders(hdrs);
        // Auto-asignar columnas comunes
        const fn = (cands) => hdrs.find((h) => cands.some((c) => h.toLowerCase().includes(c))) || "";
        setMCols({
          fecha: fn(["fecha"]),
          nroAsiento: fn(["nro_asiento", "numero", "asiento", "comprobante", "nro"]),
          glosaCab: fn(["glosa_cab", "descripcion_cab", "glosa_asiento"]),
          codigoOrigen: fn(["codigo", "cuenta", "cta"]),
          glosaLinea: fn(["glosa", "descripcion", "detalle"]),
          debe: fn(["debe", "debito", "debit"]),
          haber: fn(["haber", "credito", "credit"]),
          libroLinea: fn(["libro"]),
        });
        setMPaso(2);
      } catch (err) {
        setMError("Error leyendo archivo: " + err.message);
      }
    };
    reader.readAsBinaryString(file);
    e.target.value = "";
  };

  const handleMasivoAplicarHom = () => {
    if (!mCols.codigoOrigen || !mCols.debe || !mCols.haber || !mCols.fecha) {
      setMError("Selecciona al menos: fecha, código origen, debe y haber");
      return;
    }
    setMError("");
    // Construir mapa de homologación: codigo_origen → cuenta
    const mapaHom = {};
    homologacion.forEach((h) => {
      if (h.cuenta_id) mapaHom[h.codigo_origen] = { cuenta_id: h.cuenta_id, cuenta_codigo: h.codigo_destino || "" };
    });
    setMMapa(mapaHom);

    // Agrupar filas por nroAsiento (o por índice si no hay columna)
    const grupos = [];
    let grupoActual = null;
    let nroAnterior = null;

    mRows.forEach((row, i) => {
      const nro = mCols.nroAsiento ? String(row[mCols.nroAsiento] || i) : String(i);
      if (nro !== nroAnterior) {
        if (grupoActual) grupos.push(grupoActual);
        grupoActual = {
          _key: nro + "_" + i,
          nro_origen: nro,
          fecha: row[mCols.fecha] || "",
          glosa: mCols.glosaCab ? String(row[mCols.glosaCab] || "") : `Asiento importado ${nro}`,
          lineas: [],
        };
        nroAnterior = nro;
      }
      const codOrigen = String(row[mCols.codigoOrigen] || "").trim();
      const hom = mapaHom[codOrigen];
      grupoActual.lineas.push({
        _key: Math.random().toString(36).slice(2),
        codigo_origen: codOrigen,
        glosa: mCols.glosaLinea ? String(row[mCols.glosaLinea] || "") : "",
        debe: parseMonto(row[mCols.debe]),
        haber: parseMonto(row[mCols.haber]),
        libro: mCols.libroLinea ? (row[mCols.libroLinea] || "ambos") : "ambos",
        cuenta_id: hom ? hom.cuenta_id : null,
        cuenta_codigo: hom ? hom.cuenta_codigo : "",
        _sinHom: !hom,
      });
    });
    if (grupoActual) grupos.push(grupoActual);
    setMGrupos(grupos);
    setMPaso(3);
  };

  const setMasivoLineaCuenta = (gIdx, lIdx, cuentaId) => {
    const c = cuentas.find((c) => c.id === cuentaId);
    setMGrupos((prev) =>
      prev.map((g, gi) =>
        gi !== gIdx ? g : {
          ...g,
          lineas: g.lineas.map((l, li) =>
            li !== lIdx ? l : { ...l, cuenta_id: cuentaId, cuenta_codigo: c ? c.codigo : "", _sinHom: !cuentaId }
          ),
        }
      )
    );
  };

  const mLineasTotal = useMemo(() => mGrupos.reduce((s, g) => s + g.lineas.length, 0), [mGrupos]);
  const mLineasHom = useMemo(() => mGrupos.reduce((s, g) => s + g.lineas.filter((l) => !l._sinHom).length, 0), [mGrupos]);
  const mLineasSin = mLineasTotal - mLineasHom;
  const mLineasSinArr = useMemo(
    () => mGrupos.flatMap((g, gi) => g.lineas.map((l, li) => ({ ...l, _gi: gi, _li: li })).filter((l) => l._sinHom)),
    [mGrupos]
  );

  const handleMasivoGenerar = async () => {
    if (!cargaOkRef.current) { setMError("Espera a que la lista cargue antes de importar"); return; }
    setMGuardando(true);
    setMError("");
    let creados = 0;
    try {
      for (const g of mGrupos) {
        const lineasValidas = g.lineas.filter((l) => l.cuenta_id);
        if (!lineasValidas.length) continue;
        const debe = lineasValidas.reduce((s, l) => s + l.debe, 0);
        const haber = lineasValidas.reduce((s, l) => s + l.haber, 0);
        const [nuevo] = await supaInsert("contab_asientos", {
          empresa_id: empresaId,
          anio: filtroAnio,
          mes: filtroMes,
          fecha: g.fecha || `${filtroAnio}-${String(filtroMes).padStart(2, "0")}-01`,
          tipo: "manual",
          libro: "ambos",
          glosa: g.glosa || "Asiento importado",
          moneda: "CLP",
          estado: mEstado,
          usuario_crea: usuario?.id || null,
          total_debe: debe,
          total_haber: haber,
          ...(mEstado === "mayorizado" ? { fecha_mayorizado: new Date().toISOString() } : {}),
        });
        await supaInsert("contab_asientos_lineas",
          lineasValidas.map((l, i) => ({
            asiento_id: nuevo.id,
            orden: i + 1,
            cuenta_id: l.cuenta_id,
            cuenta_codigo: l.cuenta_codigo,
            debe: l.debe,
            haber: l.haber,
            libro: l.libro || "ambos",
            glosa: l.glosa || null,
            moneda: "CLP",
          }))
        );
        creados++;
      }
      setMOk(`${creados} asientos creados en ${mEstado}`);
      setMPaso(4);
      loadAsientos();
    } catch (e) {
      setMError("Error al generar asientos: " + e.message);
    }
    setMGuardando(false);
  };

  // ── Helpers UI ────────────────────────────────────────────────────────────────
  const badgeEstado = (estado) => {
    const map = {
      borrador: { bg: "#E6F1FB", color: "#185FA5", label: "Borrador" },
      mayorizado: { bg: "#EAF3DE", color: "#3B6D11", label: "Mayorizado" },
    };
    const s = map[estado] || { bg: "#F1EFE8", color: "#5F5E5A", label: estado };
    return (
      <span style={{ background: s.bg, color: s.color, borderRadius: 10, padding: "2px 8px", fontSize: 11, fontWeight: 600 }}>
        {s.label}
      </span>
    );
  };

  const badgeLibro = (libro) => {
    const map = { tributario: "#854F0B", ifrs: "#185FA5", ambos: "#3B6D11" };
    const col = map[libro] || C.textMuted;
    return <span style={{ color: col, fontSize: 11, fontWeight: 500 }}>{libro || "—"}</span>;
  };

  const colEstadoBg = (a) => {
    if (a.estado === "borrador" && a.total_debe !== a.total_haber) return "rgba(226,75,74,0.04)";
    return "transparent";
  };

  const aniosRange = [hoy.getFullYear() - 1, hoy.getFullYear(), hoy.getFullYear() + 1];

  // ═══════════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════════════

  // ── VISTA: LISTA ──────────────────────────────────────────────────────────────
  if (vista === "lista") {
    return (
      <div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14, alignItems: "center" }}>
          <SelectInput
            value={filtroAnio}
            onChange={(v) => setFiltroAnio(Number(v))}
            options={aniosRange.map((a) => ({ value: a, label: String(a) }))}
            style={{ width: 90 }}
          />
          <SelectInput
            value={filtroMes}
            onChange={(v) => setFiltroMes(Number(v))}
            options={MESES_OPTS.map((m) => ({ value: m.value, label: m.label }))}
            style={{ width: 140 }}
          />
          <SelectInput
            value={filtroTipo}
            onChange={setFiltroTipo}
            options={[{ value: "", label: "Todos los tipos" }].concat(TIPOS_ASIENTO)}
            style={{ width: 160 }}
          />
          <SelectInput
            value={filtroEstado}
            onChange={setFiltroEstado}
            options={[{ value: "", label: "Todos los estados" }, { value: "borrador", label: "Borrador" }, { value: "mayorizado", label: "Mayorizado" }]}
            style={{ width: 140 }}
          />
          <SearchInput value={buscar} onChange={setBuscar} placeholder="Buscar glosa o N°..." />
          <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
            <Btn color="ghost" size="sm" onClick={() => { setVista("masivo"); resetMasivo(); }}>
              ⬆ Carga masiva histórica
            </Btn>
            {canEdit && (
              <Btn color="primary" size="sm" onClick={abrirNuevo}>
                + Nuevo asiento
              </Btn>
            )}
          </div>
        </div>

        <ErrorMsg msg={listError} />
        <SuccessMsg msg={listOk} />

        {loading ? (
          <div style={{ padding: 32, textAlign: "center", color: C.textMuted }}>Cargando...</div>
        ) : (
          <>
            <TableWrapper>
              <thead>
                <tr>
                  <Th style={{ width: 90 }}>N°</Th>
                  <Th style={{ width: 90 }}>Fecha</Th>
                  <Th style={{ width: 110 }}>Tipo</Th>
                  <Th>Glosa</Th>
                  <Th style={{ width: 70 }}>Libro</Th>
                  <Th style={{ width: 110, textAlign: "right" }}>Debe</Th>
                  <Th style={{ width: 110, textAlign: "right" }}>Haber</Th>
                  <Th style={{ width: 90 }}>Estado</Th>
                  <Th style={{ width: 80 }}></Th>
                </tr>
              </thead>
              <tbody>
                {asientosFiltrados.length === 0 ? (
                  <EmptyRow cols={9} msg="Sin asientos en este período" />
                ) : (
                  asientosFiltrados.map((a) => (
                    <Tr key={a.id} onClick={() => abrirEditar(a)}>
                      <Td>
                        <span style={{ fontFamily: "monospace", color: C.primary }}>
                          {a.numero ? `N°${a.numero}` : "—"}
                        </span>
                      </Td>
                      <Td style={{ color: C.textMuted, fontSize: 12 }}>{a.fecha}</Td>
                      <Td style={{ color: C.textMuted, fontSize: 12 }}>{a.tipo}</Td>
                      <Td style={{ background: colEstadoBg(a) }}>
                        {a.glosa}
                        {a.estado === "borrador" && a.total_debe !== a.total_haber && (
                          <span style={{ color: C.danger, fontSize: 11, marginLeft: 8 }}>
                            ⚠ descuadrado
                          </span>
                        )}
                      </Td>
                      <Td>{badgeLibro(a.libro)}</Td>
                      <Td style={{ textAlign: "right", fontFamily: "monospace", fontSize: 12, color: C.info }}>
                        {fmtCLP(a.total_debe)}
                      </Td>
                      <Td style={{ textAlign: "right", fontFamily: "monospace", fontSize: 12, color: C.success }}>
                        {fmtCLP(a.total_haber)}
                      </Td>
                      <Td>{badgeEstado(a.estado)}</Td>
                      <Td>
                        <Btn size="sm" color="ghost" onClick={(e) => { e.stopPropagation(); abrirEditar(a); }}>
                          {a.estado === "mayorizado" ? "Ver" : "Editar"}
                        </Btn>
                      </Td>
                    </Tr>
                  ))
                )}
              </tbody>
            </TableWrapper>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, fontSize: 12, color: C.textMuted }}>
              <span>{asientosFiltrados.length} asientos</span>
              {asientos.some((a) => a.estado === "borrador" && a.total_debe !== a.total_haber) && (
                <span style={{ color: C.danger }}>⚠ hay borradores descuadrados</span>
              )}
            </div>
          </>
        )}
      </div>
    );
  }

  // ── VISTA: EDITOR ─────────────────────────────────────────────────────────────
  if (vista === "editor") {
    const readOnly = asiento?.estado === "mayorizado";
    return (
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
          <Btn color="ghost" size="sm" onClick={() => setVista("lista")}>← Volver</Btn>
          <span style={{ fontWeight: 600, fontSize: 15, color: C.text }}>
            {asiento?.id ? `Asiento ${asiento.numero ? `N°${asiento.numero}` : "(sin número)"}` : "Nuevo asiento"}
          </span>
          {asiento?.id && badgeEstado(asiento.estado)}
          <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
            {cuadrado ? (
              <span style={{ fontSize: 12, color: C.success, fontWeight: 600 }}>✓ Cuadrado: {fmtCLP(totalDebe)}</span>
            ) : (
              <span style={{ fontSize: 12, color: C.danger, fontWeight: 600 }}>
                ✗ Diferencia: {fmtCLP(Math.abs(totalDebe - totalHaber))}
              </span>
            )}
          </div>
        </div>

        <ErrorMsg msg={edError} />
        <SuccessMsg msg={edOk} />

        {loadingLineas ? (
          <div style={{ padding: 32, textAlign: "center", color: C.textMuted }}>Cargando líneas...</div>
        ) : (
          <>
            {/* ── Cabecera del asiento ── */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "110px 140px 180px 160px 80px 180px",
                gap: 12,
                marginBottom: 18,
                background: "#141720",
                border: `1px solid ${C.border}`,
                borderRadius: 8,
                padding: "12px 16px",
              }}
            >
              <Field label="Fecha" required>
                <input
                  type="date"
                  value={asiento?.fecha || ""}
                  disabled={readOnly}
                  onChange={(e) => setAsiento((a) => ({ ...a, fecha: e.target.value }))}
                  style={{ background: C.bgInput, border: `1px solid ${C.border}`, borderRadius: 6, color: C.text, fontSize: 13, padding: "6px 8px", width: "100%", outline: "none" }}
                />
              </Field>
              <Field label="Período">
                <div style={{ display: "flex", gap: 4 }}>
                  <SelectInput
                    value={String(asiento?.mes || 1)}
                    onChange={(v) => setAsiento((a) => ({ ...a, mes: Number(v) }))}
                    options={MESES_OPTS.map((m) => ({ value: String(m.value), label: m.label.slice(0, 3) }))}
                    style={{ flex: 1 }}
                    disabled={readOnly}
                  />
                  <SelectInput
                    value={String(asiento?.anio || hoy.getFullYear())}
                    onChange={(v) => setAsiento((a) => ({ ...a, anio: Number(v) }))}
                    options={aniosRange.map((a) => ({ value: String(a), label: String(a) }))}
                    style={{ width: 72 }}
                    disabled={readOnly}
                  />
                </div>
              </Field>
              <Field label="Tipo">
                <SelectInput
                  value={asiento?.tipo || "manual"}
                  onChange={(v) => setAsiento((a) => ({ ...a, tipo: v }))}
                  options={TIPOS_ASIENTO}
                  style={{ width: "100%" }}
                  disabled={readOnly}
                />
              </Field>
              <Field label="Libro asiento">
                <SelectInput
                  value={asiento?.libro || "ambos"}
                  onChange={(v) => setAsiento((a) => ({ ...a, libro: v }))}
                  options={LIBROS_OPTS}
                  style={{ width: "100%" }}
                  disabled={readOnly}
                />
              </Field>
              <Field label="Moneda">
                <SelectInput
                  value={asiento?.moneda || "CLP"}
                  onChange={(v) => setAsiento((a) => ({ ...a, moneda: v }))}
                  options={["CLP", "USD", "EUR", "UF", "PEN"].map((m) => ({ value: m, label: m }))}
                  style={{ width: "100%" }}
                  disabled={readOnly}
                />
              </Field>
              <Field label="Glosa" required>
                {textInput(
                  asiento?.glosa || "",
                  (v) => setAsiento((a) => ({ ...a, glosa: v })),
                  "Descripción del asiento",
                  readOnly
                )}
              </Field>
            </div>

            {/* ── Grilla de líneas ── */}
            <p style={{ fontSize: 11, color: C.textMuted, marginBottom: 6, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Líneas del asiento
            </p>
            <div style={{ overflowX: "auto", border: `1px solid ${C.border}`, borderRadius: 8, marginBottom: 10 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr>
                    <Th style={{ width: 28 }}>#</Th>
                    <Th style={{ width: 100 }}>Código</Th>
                    <Th style={{ minWidth: 160 }}>Cuenta / Glosa línea</Th>
                    <Th style={{ width: 130 }}>Libro línea</Th>
                    <Th style={{ width: 130 }}>CeCo / Cuartel</Th>
                    <Th style={{ width: 130 }}>Auxiliar</Th>
                    <Th style={{ width: 110, textAlign: "right" }}>Debe CLP</Th>
                    <Th style={{ width: 110, textAlign: "right" }}>Haber CLP</Th>
                    {!readOnly && <Th style={{ width: 28 }}></Th>}
                  </tr>
                </thead>
                <tbody>
                  {lineas.map((l, i) => {
                    const errs = erroresLineas[i] || [];
                    const tieneErr = errs.length > 0;
                    const cd = l._cuentaData;
                    return (
                      <tr
                        key={l._key || i}
                        style={{ background: tieneErr ? "rgba(226,75,74,0.04)" : i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.01)" }}
                      >
                        <Td style={{ color: C.textDim, textAlign: "center" }}>{i + 1}</Td>
                        <Td>
                          <input
                            value={l.cuenta_codigo}
                            placeholder="Código"
                            disabled={readOnly}
                            onChange={(e) => updateLinea(i, "cuenta_codigo", e.target.value)}
                            onBlur={(e) => updateLinea(i, "cuenta_codigo", e.target.value)}
                            style={{
                              background: l.cuenta_id ? C.bgInput : "rgba(226,75,74,0.08)",
                              border: `1px solid ${l.cuenta_id ? C.border : C.danger}`,
                              borderRadius: 5,
                              color: C.primary,
                              fontFamily: "monospace",
                              fontSize: 12,
                              padding: "4px 7px",
                              width: "100%",
                              outline: "none",
                            }}
                          />
                        </Td>
                        <Td style={{ minWidth: 240 }}>
                          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                            {l.cuenta_nombre ? (
                              <span style={{ fontSize: 11, color: C.text }}>{l.cuenta_nombre}</span>
                            ) : (
                              <SelectInput
                                value={l.cuenta_id || ""}
                                onChange={(v) => updateLinea(i, "cuenta_id", v)}
                                options={cuentasOpts}
                                style={{ width: "100%", fontSize: 11 }}
                                disabled={readOnly}
                              />
                            )}
                            <input
                              value={l.glosa}
                              placeholder="Glosa línea (opcional)"
                              disabled={readOnly}
                              onChange={(e) => updateLinea(i, "glosa", e.target.value)}
                              style={{ background: C.bgInput, border: `1px solid ${C.border}`, borderRadius: 5, color: C.textMuted, fontSize: 11, padding: "3px 7px", width: "100%", outline: "none" }}
                            />
                            {tieneErr && (
                              <span style={{ color: C.danger, fontSize: 10 }}>{errs.join(" · ")}</span>
                            )}
                          </div>
                        </Td>
                        <Td>
                          <SelectInput
                            value={l.libro || "ambos"}
                            onChange={(v) => updateLinea(i, "libro", v)}
                            options={LIBROS_OPTS}
                            style={{ width: "100%", fontSize: 11 }}
                            disabled={readOnly}
                          />
                        </Td>
                        <Td>
                          {cd?.usa_ceco ? (
                            <SelectInput
                              value={l.cuartel_id || ""}
                              onChange={(v) => updateLinea(i, "cuartel_id", v)}
                              options={cuartelesOpts}
                              style={{ width: "100%", fontSize: 11, borderColor: (!l.cuartel_id ? C.danger : C.border) }}
                              disabled={readOnly}
                            />
                          ) : (
                            <span style={{ color: C.textDim, fontSize: 11 }}>—</span>
                          )}
                        </Td>
                        <Td>
                          {cd?.usa_auxiliar ? (
                            <SelectInput
                              value={l.auxiliar_id || ""}
                              onChange={(v) => updateLinea(i, "auxiliar_id", v)}
                              options={auxiliaresOpts}
                              style={{ width: "100%", fontSize: 11, borderColor: (!l.auxiliar_id ? C.danger : C.border) }}
                              disabled={readOnly}
                            />
                          ) : (
                            <span style={{ color: C.textDim, fontSize: 11 }}>—</span>
                          )}
                        </Td>
                        <Td style={{ textAlign: "right" }}>
                          <input
                            value={l.debe}
                            placeholder="0"
                            disabled={readOnly || parseMonto(l.haber) > 0}
                            onChange={(e) => updateLinea(i, "debe", e.target.value)}
                            style={{
                              background: parseMonto(l.debe) > 0 ? "rgba(24,95,165,0.06)" : C.bgInput,
                              border: `1px solid ${parseMonto(l.debe) > 0 ? C.info : C.border}`,
                              borderRadius: 5,
                              color: C.info,
                              fontFamily: "monospace",
                              fontSize: 12,
                              padding: "4px 7px",
                              width: "100%",
                              textAlign: "right",
                              outline: "none",
                            }}
                          />
                        </Td>
                        <Td style={{ textAlign: "right" }}>
                          <input
                            value={l.haber}
                            placeholder="0"
                            disabled={readOnly || parseMonto(l.debe) > 0}
                            onChange={(e) => updateLinea(i, "haber", e.target.value)}
                            style={{
                              background: parseMonto(l.haber) > 0 ? "rgba(29,158,117,0.06)" : C.bgInput,
                              border: `1px solid ${parseMonto(l.haber) > 0 ? C.success : C.border}`,
                              borderRadius: 5,
                              color: C.success,
                              fontFamily: "monospace",
                              fontSize: 12,
                              padding: "4px 7px",
                              width: "100%",
                              textAlign: "right",
                              outline: "none",
                            }}
                          />
                        </Td>
                        {!readOnly && (
                          <Td>
                            <button
                              onClick={() => eliminarLinea(i)}
                              style={{ background: "none", border: "none", color: C.textDim, cursor: "pointer", fontSize: 16, padding: "0 4px", lineHeight: 1 }}
                            >
                              ×
                            </button>
                          </Td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* ── Footer: controles + cuadre ── */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
              <div>
                {!readOnly && (
                  <Btn color="ghost" size="sm" onClick={agregarLinea}>+ Agregar línea</Btn>
                )}
              </div>
              {/* Panel cuadre */}
              <div
                style={{
                  border: `1px solid ${cuadrado ? C.success : C.danger}`,
                  borderRadius: 8,
                  padding: "10px 16px",
                  background: cuadrado ? "rgba(39,169,108,0.05)" : "rgba(217,64,64,0.05)",
                  minWidth: 220,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, fontSize: 13 }}>
                  <span style={{ color: C.textMuted }}>Total Debe</span>
                  <span style={{ color: C.info, fontFamily: "monospace" }}>{fmtCLP(totalDebe)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, fontSize: 13 }}>
                  <span style={{ color: C.textMuted }}>Total Haber</span>
                  <span style={{ color: C.success, fontFamily: "monospace" }}>{fmtCLP(totalHaber)}</span>
                </div>
                <div
                  style={{
                    borderTop: `1px solid ${C.border}`,
                    paddingTop: 8,
                    textAlign: "center",
                    fontSize: 12,
                    fontWeight: 600,
                    color: cuadrado ? C.success : C.danger,
                  }}
                >
                  {cuadrado ? "✓ Asiento cuadrado" : `✗ Diferencia: ${fmtCLP(Math.abs(totalDebe - totalHaber))}`}
                </div>
              </div>
            </div>

            {/* ── Botonera ── */}
            <div
              style={{
                display: "flex",
                gap: 8,
                marginTop: 16,
                paddingTop: 14,
                borderTop: `1px solid ${C.border}`,
                alignItems: "center",
              }}
            >
              <Btn color="ghost" onClick={() => setVista("lista")}>Volver</Btn>
              {!readOnly && (
                <>
                  <Btn color="primary" onClick={handleGuardar} disabled={guardando || !puedeGuardar}>
                    {guardando ? "Guardando..." : "Guardar borrador"}
                  </Btn>
                  <Btn
                    color="success"
                    onClick={handleMayorizar}
                    disabled={guardando || !puedeMayorizar}
                    style={{ opacity: puedeMayorizar ? 1 : 0.45 }}
                  >
                    Mayorizar →
                  </Btn>
                  {!puedeMayorizar && (
                    <span style={{ fontSize: 11, color: C.textMuted }}>
                      {!cuadrado ? "Debe cuadrar para mayorizar" : hayErroresLineas ? "Corrige errores en líneas" : ""}
                    </span>
                  )}
                </>
              )}
              {readOnly && (
                <span style={{ fontSize: 12, color: C.textMuted }}>
                  Asiento mayorizado — solo lectura. Para modificar, crear un contra-asiento.
                </span>
              )}
            </div>
          </>
        )}
      </div>
    );
  }

  // ── VISTA: MASIVO ──────────────────────────────────────────────────────────────
  if (vista === "masivo") {
    const stepLabels = ["Cargar archivo", "Mapear columnas", "Aplicar homologación", "Generar asientos"];
    return (
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
          <Btn color="ghost" size="sm" onClick={() => { setVista("lista"); resetMasivo(); }}>← Volver</Btn>
          <span style={{ fontWeight: 600, fontSize: 15, color: C.text }}>Carga masiva histórica</span>
          {mArchivo && <Badge label={mArchivo} color="muted" />}
          {mSistema && <Badge label={mSistema.charAt(0).toUpperCase() + mSistema.slice(1)} color="info" />}
        </div>

        {/* Stepper */}
        <div style={{ display: "flex", alignItems: "center", marginBottom: 20 }}>
          {stepLabels.map((lbl, idx) => {
            const num = idx + 1;
            const done = mPaso > num;
            const active = mPaso === num;
            return (
              <React.Fragment key={lbl}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <div
                    style={{
                      width: 26, height: 26, borderRadius: "50%", display: "flex",
                      alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700,
                      background: done ? C.success : active ? C.primary : C.bgInput,
                      color: done || active ? "#fff" : C.textMuted,
                      border: done || active ? "none" : `1px solid ${C.border}`,
                      flexShrink: 0,
                    }}
                  >
                    {done ? "✓" : num}
                  </div>
                  <span style={{ fontSize: 12, whiteSpace: "nowrap", color: done ? C.success : active ? C.primary : C.textMuted, fontWeight: active ? 600 : 400 }}>
                    {lbl}
                  </span>
                </div>
                {idx < stepLabels.length - 1 && (
                  <div style={{ flex: 1, height: 1, background: C.border, margin: "0 8px", minWidth: 8 }} />
                )}
              </React.Fragment>
            );
          })}
        </div>

        <ErrorMsg msg={mError} />

        {/* Paso 1 */}
        {mPaso === 1 && (
          <div>
            <div style={{ marginBottom: 12, display: "flex", gap: 10, alignItems: "center" }}>
              <span style={{ fontSize: 13, color: C.textMuted }}>Sistema origen:</span>
              <SelectInput
                value={mSistema}
                onChange={setMSistema}
                options={["contec", "megasystem", "softland", "defontana", "manual"].map((s) => ({ value: s, label: s.charAt(0).toUpperCase() + s.slice(1) }))}
                style={{ width: 160 }}
              />
            </div>
            <div
              style={{
                border: `2px dashed ${C.border}`, borderRadius: 10, padding: 40,
                textAlign: "center", background: C.bgInput, cursor: "pointer",
              }}
              onClick={() => mFileRef.current?.click()}
            >
              <div style={{ fontSize: 32, marginBottom: 10 }}>📊</div>
              <p style={{ fontWeight: 600, fontSize: 14, color: C.text, marginBottom: 6 }}>
                Cargar libro diario histórico de {mSistema}
              </p>
              <p style={{ fontSize: 12, color: C.textMuted, marginBottom: 16 }}>
                Excel (.xlsx) o CSV — una fila por línea de asiento
              </p>
              <Btn color="primary">Seleccionar archivo</Btn>
              <input ref={mFileRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: "none" }} onChange={handleMasivoArchivo} />
            </div>
          </div>
        )}

        {/* Paso 2: Mapear columnas */}
        {mPaso === 2 && (
          <div>
            <p style={{ fontSize: 12, color: C.textMuted, marginBottom: 12 }}>
              Archivo: <strong style={{ color: C.text }}>{mArchivo}</strong> · {mRows.length} filas
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 10, marginBottom: 16 }}>
              {[
                { key: "fecha", label: "Fecha del asiento *" },
                { key: "nroAsiento", label: "N° asiento origen" },
                { key: "glosaCab", label: "Glosa cabecera" },
                { key: "codigoOrigen", label: "Código cuenta origen *" },
                { key: "glosaLinea", label: "Glosa línea" },
                { key: "debe", label: "Debe *" },
                { key: "haber", label: "Haber *" },
                { key: "libroLinea", label: "Libro línea" },
              ].map(({ key, label }) => (
                <Field key={key} label={label}>
                  <SelectInput
                    value={mCols[key] || ""}
                    onChange={(v) => setMCols((c) => ({ ...c, [key]: v }))}
                    options={[{ value: "", label: "— No mapear —" }].concat(mHeaders.map((h) => ({ value: h, label: h })))}
                    style={{ width: "100%" }}
                  />
                </Field>
              ))}
            </div>
            <div style={{ overflowX: "auto", border: `1px solid ${C.border}`, borderRadius: 8, maxHeight: 220, overflowY: "auto", marginBottom: 14 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                <thead>
                  <tr>{mHeaders.map((h) => <Th key={h}>{h}</Th>)}</tr>
                </thead>
                <tbody>
                  {mRows.slice(0, 10).map((row, i) => (
                    <tr key={i}>
                      {mHeaders.map((h) => (
                        <Td key={h} style={{ fontSize: 11, color: Object.values(mCols).includes(h) ? C.text : C.textDim }}>
                          {String(row[h] ?? "")}
                        </Td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <Btn color="ghost" onClick={resetMasivo}>Volver</Btn>
              <Btn
                color="primary"
                onClick={handleMasivoAplicarHom}
                disabled={!mCols.fecha || !mCols.codigoOrigen || !mCols.debe || !mCols.haber}
              >
                Aplicar homologación →
              </Btn>
            </div>
          </div>
        )}

        {/* Paso 3: Resultados homologación */}
        {mPaso === 3 && (
          <div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 16 }}>
              {[
                { num: mGrupos.length, lbl: "comprobantes", col: C.primary },
                { num: mLineasTotal, lbl: "líneas totales", col: C.text },
                { num: mLineasHom, lbl: "homologadas ✓", col: C.success },
                { num: mLineasSin, lbl: "sin homologar ⚠", col: mLineasSin > 0 ? C.warning : C.textMuted },
              ].map(({ num, lbl, col }) => (
                <div key={lbl} style={{ background: "#141720", border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 14px", textAlign: "center" }}>
                  <div style={{ fontSize: 24, fontWeight: 700, color: col }}>{num}</div>
                  <div style={{ fontSize: 11, color: C.textMuted, marginTop: 3 }}>{lbl}</div>
                </div>
              ))}
            </div>

            {mLineasSin > 0 && (
              <>
                <p style={{ fontSize: 12, color: C.textMuted, marginBottom: 8 }}>
                  Códigos sin homologar — asigna una cuenta o se omitirán:
                </p>
                <div style={{ overflowX: "auto", border: `1px solid ${C.border}`, borderRadius: 8, maxHeight: 260, overflowY: "auto", marginBottom: 14 }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                    <thead>
                      <tr>
                        <Th>Asiento origen</Th>
                        <Th>Cód. origen</Th>
                        <Th>Glosa línea</Th>
                        <Th style={{ width: 100, textAlign: "right" }}>Debe</Th>
                        <Th style={{ width: 100, textAlign: "right" }}>Haber</Th>
                        <Th style={{ width: 230 }}>Cuenta maestro</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {mLineasSinArr.map((l) => (
                        <Tr key={l._key}>
                          <Td style={{ color: C.textMuted, fontSize: 11 }}>{mGrupos[l._gi]?.nro_origen}</Td>
                          <Td><span style={{ fontFamily: "monospace", color: C.danger }}>{l.codigo_origen}</span></Td>
                          <Td style={{ color: C.textMuted, fontSize: 11 }}>{l.glosa}</Td>
                          <Td style={{ textAlign: "right", fontFamily: "monospace", color: C.info }}>{l.debe > 0 ? fmtCLP(l.debe) : ""}</Td>
                          <Td style={{ textAlign: "right", fontFamily: "monospace", color: C.success }}>{l.haber > 0 ? fmtCLP(l.haber) : ""}</Td>
                          <Td>
                            <SelectInput
                              value=""
                              onChange={(v) => setMasivoLineaCuenta(l._gi, l._li, v)}
                              options={cuentasOpts}
                              style={{ width: "100%", fontSize: 11 }}
                            />
                          </Td>
                        </Tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <Btn color="ghost" onClick={() => setMPaso(2)}>Volver</Btn>
              {mLineasSin > 0 && (
                <span style={{ fontSize: 12, color: C.warning }}>
                  {mLineasSin} líneas se omitirán si no se mapean
                </span>
              )}
              <Btn color="primary" onClick={() => setMPaso(4)} style={{ marginLeft: "auto" }}>
                Revisar y confirmar →
              </Btn>
            </div>
          </div>
        )}

        {/* Paso 4: Confirmar */}
        {mPaso === 4 && !mOk && (
          <div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
              <div>
                <p style={{ fontSize: 12, fontWeight: 600, color: C.textMuted, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Estado de destino
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 13 }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                    <input type="radio" name="mEstado" checked={mEstado === "borrador"} onChange={() => setMEstado("borrador")} />
                    Crear en <strong>Borrador</strong> (revisar antes de mayorizar)
                  </label>
                  <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                    <input type="radio" name="mEstado" checked={mEstado === "mayorizado"} onChange={() => setMEstado("mayorizado")} />
                    Crear y <strong>mayorizar directamente</strong>
                  </label>
                </div>
              </div>
              <div>
                <p style={{ fontSize: 12, fontWeight: 600, color: C.textMuted, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Resumen
                </p>
                <table style={{ fontSize: 13, width: "100%" }}>
                  <tbody>
                    {[
                      ["Sistema origen", mSistema],
                      ["Comprobantes a crear", mGrupos.length],
                      ["Líneas homologadas", mLineasHom],
                      ["Líneas omitidas", mLineasSin],
                      ["Período destino", `${MESES_OPTS.find((m) => m.value === filtroMes)?.label || filtroMes} ${filtroAnio}`],
                    ].map(([k, v]) => (
                      <tr key={k}>
                        <td style={{ color: C.textMuted, paddingBottom: 4, paddingRight: 12 }}>{k}</td>
                        <td style={{ fontWeight: 500 }}>{String(v)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, borderTop: `1px solid ${C.border}`, paddingTop: 14 }}>
              <Btn color="ghost" onClick={() => setMPaso(3)}>Volver</Btn>
              <Btn color="success" onClick={handleMasivoGenerar} disabled={mGuardando}>
                {mGuardando ? "Generando..." : `Generar ${mGrupos.length} comprobantes`}
              </Btn>
            </div>
          </div>
        )}

        {/* Completado */}
        {mOk && (
          <div style={{ background: C.successBg, border: `1px solid ${C.success}`, borderRadius: 10, padding: "28px 20px", textAlign: "center" }}>
            <div style={{ fontSize: 36, marginBottom: 10 }}>✅</div>
            <p style={{ fontSize: 15, fontWeight: 600, color: C.success, marginBottom: 8 }}>Importación completada</p>
            <p style={{ fontSize: 13, color: C.textMuted, marginBottom: 16 }}>{mOk}</p>
            <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
              <Btn color="ghost" onClick={resetMasivo}>Nueva importación</Btn>
              <Btn color="primary" onClick={() => { setVista("lista"); resetMasivo(); }}>Ver lista de asientos</Btn>
            </div>
          </div>
        )}
      </div>
    );
  }

  return null;
}

// ─── CentralizacionSiiTab ────────────────────────────────────────────────────

const MESES_LABEL_C = ["","Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];

function fmtM(n) {
  if (n == null || n === "") return "—";
  return "$" + Math.round(Number(n)).toLocaleString("es-CL");
}

function fmtD(s) {
  if (!s) return "—";
  return new Date(s + "T12:00:00").toLocaleDateString("es-CL", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

const TIPO_DOC_LABEL = {
  "33": "Factura afecta (33)", "34": "Factura exenta (34)", "39": "Boleta (39)",
  "46": "Liquidación (46)", "52": "G. despacho (52)", "56": "Nota débito (56)",
  "61": "Nota crédito (61)", "110": "F. Export. (110)",
};

const BSTG = {
  pendiente: { bg: C.infoBg, color: C.info },
  mapeado: { bg: C.tealBg, color: C.teal },
  centralizado: { bg: C.successBg, color: C.success },
  ignorado: { bg: "#f0efe8", color: C.textDim },
};

const BLOTE = {
  borrador: { bg: C.warningBg, color: C.warning },
  validado: { bg: C.infoBg, color: C.info },
  centralizado: { bg: C.successBg, color: C.success },
  anulado: { bg: C.dangerBg, color: C.danger },
};

function BadgeSt({ estado }) {
  const s = BSTG[estado] || { bg: "#eee", color: "#666" };
  return <span style={{ background: s.bg, color: s.color, borderRadius: 10, padding: "2px 8px", fontSize: 11, fontWeight: 600, whiteSpace: "nowrap" }}>{estado}</span>;
}

function BadgeLt({ estado }) {
  const s = BLOTE[estado] || { bg: "#eee", color: "#666" };
  return <span style={{ background: s.bg, color: s.color, borderRadius: 10, padding: "2px 8px", fontSize: 11, fontWeight: 600, whiteSpace: "nowrap" }}>{estado}</span>;
}

function parsearRCV(workbook) {
  const sheetName = workbook.SheetNames[0];
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: "" });
  if (!rows.length) return [];

  const findCol = (row, candidates) => {
    for (const c of candidates) {
      const k = Object.keys(row).find(k => k.trim().toLowerCase() === c.toLowerCase());
      if (k) return k;
    }
    return null;
  };

  const sample = rows[0];
  const kFolio   = findCol(sample, ["Folio","N Folio","Nro Folio","N° Folio","folio"]);
  const kTipo    = findCol(sample, ["Tipo DTE","Tipo Doc","Tipo","tipo_dte","TipoDTE"]);
  const kRut     = findCol(sample, ["RUT Emisor","Rut Emisor","RUT","Rut","rut_emisor"]);
  const kNombre  = findCol(sample, ["Razón Social","Razon Social","Nombre","razon_social"]);
  const kFecha   = findCol(sample, ["Fecha Docto.","Fecha Doc","Fecha Documento","Fecha","fecha_doc"]);
  const kNeto    = findCol(sample, ["Monto Neto","Neto","monto_neto"]);
  const kIva     = findCol(sample, ["Monto IVA","IVA","iva","Iva"]);
  const kExento  = findCol(sample, ["Monto Exento","Exento","exento"]);
  const kTotal   = findCol(sample, ["Monto Total","Total","total"]);

  const parseMonto = (v) => {
    if (v == null || v === "") return 0;
    return Number(String(v).replace(/[$. ]/g, "").replace(",", ".")) || 0;
  };

  const parseFecha = (v) => {
    if (!v) return null;
    if (typeof v === "number") {
      const d = new Date((v - 25569) * 86400 * 1000);
      return d.toISOString().slice(0, 10);
    }
    const s = String(v).trim();
    const parts = s.split(/[\/\-]/);
    if (parts.length === 3) {
      if (parts[2].length === 4) return `${parts[2]}-${parts[1].padStart(2,"0")}-${parts[0].padStart(2,"0")}`;
      return s;
    }
    return s;
  };

  return rows.map(r => ({
    tipo_doc_sii: kTipo ? String(r[kTipo]).trim() : "33",
    folio: kFolio ? String(r[kFolio]).trim() : "",
    fecha_doc: kFecha ? parseFecha(r[kFecha]) : null,
    rut_emisor: kRut ? String(r[kRut]).trim() : "",
    nombre_emisor: kNombre ? String(r[kNombre]).trim() : "",
    monto_neto: kNeto ? parseMonto(r[kNeto]) : 0,
    monto_iva: kIva ? parseMonto(r[kIva]) : 0,
    monto_exento: kExento ? parseMonto(r[kExento]) : 0,
    monto_total: kTotal ? parseMonto(r[kTotal]) : 0,
  })).filter(r => r.folio);
}

function calcularAsientoLote(docsSel, asignaciones, reglaCompras, cuentaMap) {
  const lineas = [];
  let totalDebe = 0;
  let totalHaber = 0;
  let ivaAcum = 0;
  let provAcum = 0;

  docsSel.forEach((doc, i) => {
    const asig = asignaciones[doc.id] || {};
    const esNC = doc.tipo_doc_sii === "61" || doc.tipo_doc_sii === "56";
    const signo = esNC ? -1 : 1;

    const neto = Math.abs(Number(doc.monto_neto || 0));
    const iva = Math.abs(Number(doc.monto_iva || 0));
    const total = Math.abs(Number(doc.monto_total || 0)) || (neto + iva);

    const ctaGasto = cuentaMap[asig.cuenta_id] || {};
    if (asig.cuenta_id && neto > 0) {
      const montoLinea = neto * signo;
      if (montoLinea >= 0) {
        lineas.push({ tipo: "D", cuenta_id: asig.cuenta_id, cuenta_codigo: ctaGasto.codigo || "", cuenta_nombre: ctaGasto.nombre || "", debe: Math.abs(montoLinea), haber: 0, glosa: `${TIPO_DOC_LABEL[doc.tipo_doc_sii] || doc.tipo_doc_sii} Fo.${doc.folio} — ${(doc.nombre_emisor || "").slice(0,30)}`, cuartel_id: asig.cuartel_id || null });
        totalDebe += Math.abs(montoLinea);
      } else {
        lineas.push({ tipo: "H", cuenta_id: asig.cuenta_id, cuenta_codigo: ctaGasto.codigo || "", cuenta_nombre: ctaGasto.nombre || "", debe: 0, haber: Math.abs(montoLinea), glosa: `NC Fo.${doc.folio} — ${(doc.nombre_emisor || "").slice(0,30)}`, cuartel_id: asig.cuartel_id || null });
        totalHaber += Math.abs(montoLinea);
      }
    }
    ivaAcum += iva * signo;
    provAcum += total * signo;
  });

  if (reglaCompras) {
    const ctaIva = cuentaMap[reglaCompras.cta_iva_cf_id] || {};
    const ctaProv = cuentaMap[reglaCompras.cta_proveedores_id] || {};

    if (reglaCompras.cta_iva_cf_id && Math.abs(ivaAcum) > 0) {
      if (ivaAcum >= 0) {
        lineas.push({ tipo: "D", cuenta_id: reglaCompras.cta_iva_cf_id, cuenta_codigo: ctaIva.codigo || "", cuenta_nombre: ctaIva.nombre || "", debe: ivaAcum, haber: 0, glosa: "IVA Crédito Fiscal", cuartel_id: null });
        totalDebe += ivaAcum;
      } else {
        lineas.push({ tipo: "H", cuenta_id: reglaCompras.cta_iva_cf_id, cuenta_codigo: ctaIva.codigo || "", cuenta_nombre: ctaIva.nombre || "", debe: 0, haber: Math.abs(ivaAcum), glosa: "IVA Crédito Fiscal — reversa NC", cuartel_id: null });
        totalHaber += Math.abs(ivaAcum);
      }
    }

    if (reglaCompras.cta_proveedores_id && Math.abs(provAcum) > 0) {
      if (provAcum >= 0) {
        lineas.push({ tipo: "H", cuenta_id: reglaCompras.cta_proveedores_id, cuenta_codigo: ctaProv.codigo || "", cuenta_nombre: ctaProv.nombre || "", debe: 0, haber: provAcum, glosa: "Proveedores — centralización lote", cuartel_id: null });
        totalHaber += provAcum;
      } else {
        lineas.push({ tipo: "D", cuenta_id: reglaCompras.cta_proveedores_id, cuenta_codigo: ctaProv.codigo || "", cuenta_nombre: ctaProv.nombre || "", debe: Math.abs(provAcum), haber: 0, glosa: "Proveedores — reversa NC", cuartel_id: null });
        totalDebe += Math.abs(provAcum);
      }
    }
  }

  return { lineas, totalDebe: Math.round(totalDebe * 100) / 100, totalHaber: Math.round(totalHaber * 100) / 100 };
}

function CentralizacionSiiTab({ empresaId, canEdit, usuario }) {
  const [vista, setVista] = useState("staging");
  const [stagingDocs, setStagingDocs] = useState([]);
  const [lotes, setLotes] = useState([]);
  const [cuentas, setCuentas] = useState([]);
  const [cuarteles, setCuarteles] = useState([]);
  const [reglaCompras, setReglaCompras] = useState(null);
  const [reglaVentas, setReglaVentas] = useState(null);
  const [rutOverrides, setRutOverrides] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const cargaOkRef = useRef(false);
  const now = new Date();

  // Filtros staging
  const [filtroAnio, setFiltroAnio] = useState(now.getFullYear());
  const [filtroMes, setFiltroMes] = useState(now.getMonth() + 1);
  const [filtroTipo, setFiltroTipo] = useState("compras");
  const [filtroEstado, setFiltroEstado] = useState("");
  const [selIds, setSelIds] = useState(new Set());

  // Upload modal
  const [showUpload, setShowUpload] = useState(false);
  const [upAnio, setUpAnio] = useState(now.getFullYear());
  const [upMes, setUpMes] = useState(now.getMonth() + 1);
  const [upTipo, setUpTipo] = useState("compras");
  const [upFileName, setUpFileName] = useState("");
  const [upRows, setUpRows] = useState([]);
  const [upError, setUpError] = useState("");
  const [uploading, setUploading] = useState(false);
  const uploadRef = useRef();

  // Nuevo lote wizard
  const [lPaso, setLPaso] = useState(1);
  const [lDocsSel, setLDocsSel] = useState([]);
  const [lAsig, setLAsig] = useState({});
  const [lLibro, setLLibro] = useState("ambos");
  const [lGlosa, setLGlosa] = useState("");
  const [lAnio, setLAnio] = useState(now.getFullYear());
  const [lMes, setLMes] = useState(now.getMonth() + 1);
  const [guardandoLote, setGuardandoLote] = useState(false);
  const [loteError, setLoteError] = useState("");

  // Historial filtros
  const [hAnio, setHAnio] = useState(now.getFullYear());
  const [hMes, setHMes] = useState(now.getMonth() + 1);
  const [hTipo, setHTipo] = useState("");
  const [hEstado, setHEstado] = useState("");
  const [detalleLote, setDetalleLote] = useState(null);
  const [detalleLineas, setDetalleLineas] = useState([]);
  const [anulando, setAnulando] = useState("");

  // Reglas edit
  const [rcEdit, setRcEdit] = useState({ cta_proveedores_id: "", cta_iva_cf_id: "", cta_gasto_id: "", cuartel_id: "" });
  const [rvEdit, setRvEdit] = useState({ cta_clientes_id: "", cta_iva_deb_id: "", cta_ingreso_id: "", cuartel_id: "" });
  const [rutOvEdit, setRutOvEdit] = useState([]);
  const [nuevoRut, setNuevoRut] = useState({ rut: "", nombre_ref: "", cuenta_id: "", cuartel_id: "" });
  const [guardandoReglas, setGuardandoReglas] = useState(false);

  // Mapa rápido de cuentas por ID
  const cuentaMap = useMemo(() => {
    const m = {};
    cuentas.forEach(c => { m[c.id] = c; });
    return m;
  }, [cuentas]);

  const cuartelMap = useMemo(() => {
    const m = {};
    cuarteles.forEach(c => { m[c.id || c.cuartel_id] = c; });
    return m;
  }, [cuarteles]);

  const cuentaOpts = useMemo(() => cuentas.map(c => ({ value: c.id, label: `${c.codigo} — ${c.nombre}` })), [cuentas]);
  const cuartelOpts = useMemo(() => [{ value: "", label: "Sin CeCo" }, ...cuarteles.map(c => ({ value: c.id || c.cuartel_id, label: c.nombre || c.cuartel_nombre || c.id }))], [cuarteles]);

  const loadStaging = useCallback(async () => {
    if (!empresaId) return;
    setLoading(true);
    setError("");
    try {
      const parts = [
        `empresa_id=eq.${empresaId}`,
        `periodo_anio=eq.${filtroAnio}`,
        `periodo_mes=eq.${filtroMes}`,
        filtroTipo ? `tipo=eq.${filtroTipo}` : "",
        filtroEstado ? `estado=eq.${filtroEstado}` : "",
        "order=created_at.desc",
      ].filter(Boolean);
      const data = await supaSelect("doc_sii_staging", parts.join("&"));
      setStagingDocs(data || []);
      cargaOkRef.current = true;
    } catch (e) {
      setError("Error cargando staging: " + e.message);
      throw e;
    } finally {
      setLoading(false);
    }
  }, [empresaId, filtroAnio, filtroMes, filtroTipo, filtroEstado]);

  useEffect(() => { cargaOkRef.current = false; loadStaging(); }, [loadStaging]);

  const loadLotes = useCallback(async () => {
    if (!empresaId) return;
    try {
      const parts = [
        `empresa_id=eq.${empresaId}`,
        `periodo_anio=eq.${hAnio}`,
        `periodo_mes=eq.${hMes}`,
        hTipo ? `tipo=eq.${hTipo}` : "",
        hEstado ? `estado=eq.${hEstado}` : "",
        "order=created_at.desc",
      ].filter(Boolean);
      const data = await supaSelect("doc_lotes", parts.join("&"));
      setLotes(data || []);
    } catch (e) {
      console.error("Error lotes:", e);
    }
  }, [empresaId, hAnio, hMes, hTipo, hEstado]);

  useEffect(() => { if (vista === "historial") loadLotes(); }, [vista, loadLotes]);

  const loadAux = useCallback(async () => {
    if (!empresaId) return;
    try {
      const [c, cu, r] = await Promise.all([
        supaSelect("contab_plan_cuentas", `empresa_id=eq.${empresaId}&activa=eq.true&nivel=eq.2&mueve=eq.true&order=codigo.asc`),
        supaSelect("cc_jerarquia", `empresa_id=eq.${empresaId}&order=nombre.asc`),
        supaSelect("contab_reglas_centralizacion", `empresa_id=eq.${empresaId}&activa=eq.true`),
      ]);
      setCuentas(c || []);
      setCuarteles(cu || []);
      const rc = (r || []).find(x => x.tipo_origen === "lote_compras");
      const rv = (r || []).find(x => x.tipo_origen === "lote_ventas");
      const rRut = (r || []).find(x => x.tipo_origen === "rut_overrides");
      setReglaCompras(rc ? (rc.lineas[0] || null) : null);
      setReglaVentas(rv ? (rv.lineas[0] || null) : null);
      const ovs = rRut ? rRut.lineas : [];
      setRutOverrides(ovs);
      setRcEdit(rc ? (rc.lineas[0] || { cta_proveedores_id: "", cta_iva_cf_id: "", cta_gasto_id: "", cuartel_id: "" }) : { cta_proveedores_id: "", cta_iva_cf_id: "", cta_gasto_id: "", cuartel_id: "" });
      setRvEdit(rv ? (rv.lineas[0] || { cta_clientes_id: "", cta_iva_deb_id: "", cta_ingreso_id: "", cuartel_id: "" }) : { cta_clientes_id: "", cta_iva_deb_id: "", cta_ingreso_id: "", cuartel_id: "" });
      setRutOvEdit(ovs);
    } catch (e) {
      console.error("Error aux:", e);
    }
  }, [empresaId]);

  useEffect(() => { loadAux(); }, [loadAux]);

  const aplicarReglaRut = useCallback((doc) => {
    if (!doc) return {};
    const ov = rutOverrides.find(r => r.rut === doc.rut_emisor);
    if (ov) return { cuenta_id: ov.cuenta_id || "", cuartel_id: ov.cuartel_id || "" };
    if (reglaCompras) return { cuenta_id: reglaCompras.cta_gasto_id || "", cuartel_id: reglaCompras.cuartel_id || "" };
    return { cuenta_id: "", cuartel_id: "" };
  }, [rutOverrides, reglaCompras]);

  const iniciarLote = (docs) => {
    const asig = {};
    docs.forEach(d => { asig[d.id] = aplicarReglaRut(d); });
    setLDocsSel(docs);
    setLAsig(asig);
    setLGlosa(`Compras ${MESES_LABEL_C[filtroMes]} ${filtroAnio}`);
    setLAnio(filtroAnio);
    setLMes(filtroMes);
    setLPaso(1);
    setLoteError("");
    setVista("lote");
  };

  const asientoPreview = useMemo(() => {
    if (!lDocsSel.length) return { lineas: [], totalDebe: 0, totalHaber: 0 };
    return calcularAsientoLote(lDocsSel, lAsig, reglaCompras, cuentaMap);
  }, [lDocsSel, lAsig, reglaCompras, cuentaMap]);

  const lCuadrado = Math.abs(asientoPreview.totalDebe - asientoPreview.totalHaber) < 0.01;

  const handleGuardarLote = async () => {
    if (!cargaOkRef.current) { setLoteError("No se puede guardar: carga inicial incompleta."); return; }
    if (!lCuadrado) { setLoteError("El asiento no cuadra. Verifica la asignación de cuentas."); return; }
    if (!reglaCompras?.cta_proveedores_id || !reglaCompras?.cta_iva_cf_id) {
      setLoteError("Configura las cuentas en la pestaña Reglas antes de centralizar."); return;
    }
    setGuardandoLote(true);
    setLoteError("");
    try {
      const [nuevoLote] = await supaInsert("doc_lotes", {
        empresa_id: empresaId,
        tipo: filtroTipo || "compras",
        periodo_anio: lAnio,
        periodo_mes: lMes,
        fecha_desde: lDocsSel.reduce((mn, d) => (!mn || (d.fecha_doc && d.fecha_doc < mn)) ? d.fecha_doc : mn, null),
        fecha_hasta: lDocsSel.reduce((mx, d) => (!mx || (d.fecha_doc && d.fecha_doc > mx)) ? d.fecha_doc : mx, null),
        glosa: lGlosa.trim() || `Centralización ${MESES_LABEL_C[lMes]} ${lAnio}`,
        estado: "borrador",
        total_neto: lDocsSel.reduce((s, d) => s + Number(d.monto_neto || 0), 0),
        total_iva: lDocsSel.reduce((s, d) => s + Number(d.monto_iva || 0), 0),
        total_exento: lDocsSel.reduce((s, d) => s + Number(d.monto_exento || 0), 0),
        total_bruto: lDocsSel.reduce((s, d) => s + Number(d.monto_total || 0), 0),
        usuario_crea: usuario?.id || null,
      });
      const loteId = nuevoLote.id;

      const lineasLote = lDocsSel.map((doc, i) => ({
        lote_id: loteId,
        orden: i + 1,
        tipo_doc: TIPO_DOC_LABEL[doc.tipo_doc_sii] || doc.tipo_doc_sii || "factura_afecta",
        folio: doc.folio,
        fecha_doc: doc.fecha_doc,
        neto: Number(doc.monto_neto || 0),
        iva: Number(doc.monto_iva || 0),
        exento: Number(doc.monto_exento || 0),
        total: Number(doc.monto_total || 0),
        cuenta_id: lAsig[doc.id]?.cuenta_id || null,
        cuartel_id: lAsig[doc.id]?.cuartel_id || null,
        rut_contraparte: doc.rut_emisor,
        nombre_contraparte: doc.nombre_emisor,
        libro: lLibro,
      }));
      const lineasLoteGuardadas = await supaInsert("doc_lotes_lineas", lineasLote);

      const [nuevoAsiento] = await supaInsert("contab_asientos", {
        empresa_id: empresaId,
        anio: lAnio,
        mes: lMes,
        fecha: nuevoLote.fecha_hasta || new Date().toISOString().slice(0, 10),
        tipo: "centraliz_compras",
        libro: lLibro,
        glosa: lGlosa.trim() || `Centralización ${MESES_LABEL_C[lMes]} ${lAnio}`,
        moneda: "CLP",
        estado: "borrador",
        total_debe: asientoPreview.totalDebe,
        total_haber: asientoPreview.totalHaber,
        usuario_crea: usuario?.id || null,
      });
      const asientoId = nuevoAsiento.id;

      await supaInsert("contab_asientos_lineas", asientoPreview.lineas.map((l, i) => ({
        asiento_id: asientoId,
        orden: i + 1,
        cuenta_id: l.cuenta_id,
        cuenta_codigo: l.cuenta_codigo,
        cuenta_nombre: l.cuenta_nombre,
        debe: l.debe,
        haber: l.haber,
        libro: lLibro,
        glosa: l.glosa || null,
        cuartel_id: l.cuartel_id || null,
        moneda: "CLP",
      })));

      await supaUpdate("doc_lotes", loteId, { asiento_id: asientoId });

      const loteLineasMap = {};
      (lineasLoteGuardadas || []).forEach((ll, i) => {
        if (lDocsSel[i]) loteLineasMap[lDocsSel[i].id] = ll.id;
      });
      for (const doc of lDocsSel) {
        await supaFetch(`doc_sii_staging?id=eq.${doc.id}`, {
          method: "PATCH",
          body: JSON.stringify({ estado: "centralizado", lote_linea_id: loteLineasMap[doc.id] || null }),
        });
      }

      setOk(`Lote creado y asiento ${nuevoAsiento.numero || asientoId.slice(0, 8)} generado en borrador.`);
      setTimeout(() => setOk(""), 5000);
      setVista("historial");
      loadStaging();
      loadLotes();
    } catch (e) {
      setLoteError("Error al generar lote: " + e.message);
    }
    setGuardandoLote(false);
  };

  const handleIgnorar = async (ids) => {
    if (!cargaOkRef.current) return;
    try {
      for (const id of ids) {
        await supaFetch(`doc_sii_staging?id=eq.${id}`, { method: "PATCH", body: JSON.stringify({ estado: "ignorado" }) });
      }
      setSelIds(new Set());
      loadStaging();
    } catch (e) {
      setError("Error: " + e.message);
    }
  };

  const handleAnularLote = async (lote) => {
    if (!window.confirm(`¿Confirma anular el lote? Esta acción ${lote.estado === "centralizado" ? "generará un asiento de reversa" : "eliminará el asiento borrador"}.`)) return;
    setAnulando(lote.id);
    try {
      if (lote.estado === "borrador" || lote.estado === "validado") {
        if (lote.asiento_id) {
          await supaFetch(`contab_asientos_lineas?asiento_id=eq.${lote.asiento_id}`, { method: "DELETE" });
          await supaFetch(`contab_asientos?id=eq.${lote.asiento_id}`, { method: "DELETE" });
        }
        const lineas = await supaSelect("doc_lotes_lineas", `lote_id=eq.${lote.id}`);
        for (const ll of (lineas || [])) {
          await supaFetch(`doc_sii_staging?lote_linea_id=eq.${ll.id}`, { method: "PATCH", body: JSON.stringify({ estado: "mapeado", lote_linea_id: null }) });
        }
        await supaFetch(`doc_lotes_lineas?lote_id=eq.${lote.id}`, { method: "DELETE" });
        await supaUpdate("doc_lotes", lote.id, { estado: "anulado", asiento_id: null });
      } else if (lote.estado === "centralizado") {
        const asientoOrig = lote.asiento_id ? await supaSelect("contab_asientos", `id=eq.${lote.asiento_id}`) : [];
        const lineasOrig = lote.asiento_id ? await supaSelect("contab_asientos_lineas", `asiento_id=eq.${lote.asiento_id}&order=orden.asc`) : [];
        const anio = lote.periodo_anio;
        const mes = lote.periodo_mes;
        const orig = asientoOrig?.[0] || {};
        const [asientoRev] = await supaInsert("contab_asientos", {
          empresa_id: empresaId,
          anio, mes,
          fecha: new Date().toISOString().slice(0, 10),
          tipo: "reversa",
          libro: orig.libro || "ambos",
          glosa: `REVERSA — ${orig.glosa || "Lote " + lote.id.slice(0, 8)}`,
          moneda: "CLP",
          estado: "borrador",
          total_debe: orig.total_haber || 0,
          total_haber: orig.total_debe || 0,
          usuario_crea: usuario?.id || null,
        });
        await supaInsert("contab_asientos_lineas", (lineasOrig || []).map((l, i) => ({
          asiento_id: asientoRev.id,
          orden: i + 1,
          cuenta_id: l.cuenta_id,
          cuenta_codigo: l.cuenta_codigo,
          cuenta_nombre: l.cuenta_nombre,
          debe: l.haber,
          haber: l.debe,
          libro: l.libro || "ambos",
          glosa: l.glosa || null,
          cuartel_id: l.cuartel_id || null,
          moneda: l.moneda || "CLP",
        })));
        const lineas = await supaSelect("doc_lotes_lineas", `lote_id=eq.${lote.id}`);
        for (const ll of (lineas || [])) {
          await supaFetch(`doc_sii_staging?lote_linea_id=eq.${ll.id}`, { method: "PATCH", body: JSON.stringify({ estado: "mapeado", lote_linea_id: null }) });
        }
        await supaUpdate("doc_lotes", lote.id, { estado: "anulado" });
        setOk(`Asiento de reversa ${asientoRev.numero || asientoRev.id.slice(0,8)} generado en borrador.`);
        setTimeout(() => setOk(""), 5000);
      }
      loadLotes();
      loadStaging();
    } catch (e) {
      setError("Error al anular: " + e.message);
    }
    setAnulando("");
  };

  const handleUploadArchivo = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUpFileName(file.name);
    setUpError("");
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const wb = XLSX.read(ev.target.result, { type: "array" });
        const rows = parsearRCV(wb);
        if (!rows.length) { setUpError("No se encontraron filas válidas."); return; }
        setUpRows(rows);
      } catch (err) {
        setUpError("Error leyendo archivo: " + err.message);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleCargarStaging = async () => {
    if (!upRows.length) { setUpError("Carga un archivo primero."); return; }
    if (!cargaOkRef.current) { setUpError("Error de conexión. Recarga la página."); return; }
    setUploading(true);
    setUpError("");
    try {
      const payload = upRows.map(r => ({
        empresa_id: empresaId,
        tipo: upTipo,
        periodo_anio: upAnio,
        periodo_mes: upMes,
        tipo_doc_sii: r.tipo_doc_sii,
        folio: r.folio,
        fecha_doc: r.fecha_doc,
        rut_emisor: r.rut_emisor,
        nombre_emisor: r.nombre_emisor,
        monto_neto: r.monto_neto,
        monto_iva: r.monto_iva,
        monto_exento: r.monto_exento,
        monto_total: r.monto_total,
        estado: rutOverrides.some(ov => ov.rut === r.rut_emisor) || reglaCompras?.cta_gasto_id ? "mapeado" : "pendiente",
        fuente: "rcv_descarga",
        archivo_origen: upFileName,
      }));
      await supaInsert("doc_sii_staging", payload);
      setOk(`${payload.length} documentos cargados al staging.`);
      setTimeout(() => setOk(""), 4000);
      setShowUpload(false);
      setUpRows([]); setUpFileName("");
      if (uploadRef.current) uploadRef.current.value = "";
      loadStaging();
    } catch (e) {
      setUpError("Error al guardar: " + e.message);
    }
    setUploading(false);
  };

  const handleGuardarReglas = async () => {
    if (!empresaId) return;
    setGuardandoReglas(true);
    try {
      await supaUpsert("contab_reglas_centralizacion", {
        empresa_id: empresaId,
        tipo_origen: "lote_compras",
        nombre: "Centralización Compras",
        activa: true,
        lineas: [rcEdit],
      }, "empresa_id,tipo_origen");
      await supaUpsert("contab_reglas_centralizacion", {
        empresa_id: empresaId,
        tipo_origen: "lote_ventas",
        nombre: "Centralización Ventas",
        activa: true,
        lineas: [rvEdit],
      }, "empresa_id,tipo_origen");
      await supaUpsert("contab_reglas_centralizacion", {
        empresa_id: empresaId,
        tipo_origen: "rut_overrides",
        nombre: "Overrides por RUT",
        activa: true,
        lineas: rutOvEdit,
      }, "empresa_id,tipo_origen");
      await loadAux();
      setOk("Reglas guardadas.");
      setTimeout(() => setOk(""), 3000);
    } catch (e) {
      setError("Error guardando reglas: " + e.message);
    }
    setGuardandoReglas(false);
  };

  const ANIOS = [now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1];
  const MESES = [1,2,3,4,5,6,7,8,9,10,11,12].map(m => ({ value: m, label: MESES_LABEL_C[m] }));

  const seleccionados = stagingDocs.filter(d => selIds.has(d.id));
  const puedeIniciarLote = seleccionados.length > 0 && seleccionados.every(d => d.estado === "pendiente" || d.estado === "mapeado");

  const cardS = { background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 8, padding: "14px 16px", marginBottom: 12 };
  const thS = { padding: "6px 8px", fontSize: 11, fontWeight: 600, color: C.textMuted, textAlign: "left", borderBottom: `1px solid ${C.border}`, background: C.bgInput, whiteSpace: "nowrap" };
  const tdS = { padding: "6px 8px", fontSize: 12, borderBottom: `0.5px solid ${C.border}`, verticalAlign: "middle" };
  const tdR = { ...tdS, textAlign: "right" };
  const inpS = { width: "100%", padding: "5px 8px", fontSize: 12, border: `1px solid ${C.border}`, borderRadius: 5, background: C.bgInput, color: C.text };
  const selS = { ...inpS, width: "auto" };
  const rowFlex = { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 10 };
  const labelS = { fontSize: 11, color: C.textMuted, whiteSpace: "nowrap" };

  // ── Selector de año/mes ──────────────────────────────────────────────────────
  const AnioMesSel = ({ anio, setAnio, mes, setMes }) => (
    <>
      <select style={selS} value={mes} onChange={e => setMes(Number(e.target.value))}>
        {MESES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
      </select>
      <select style={selS} value={anio} onChange={e => setAnio(Number(e.target.value))}>
        {ANIOS.map(a => <option key={a} value={a}>{a}</option>)}
      </select>
    </>
  );

  // ── TABS internos ────────────────────────────────────────────────────────────
  const VTABS = [
    { key: "staging", label: "Staging SII" },
    { key: "lote", label: "Nuevo lote" },
    { key: "historial", label: "Historial de lotes" },
    { key: "reglas", label: "Reglas" },
  ];

  return (
    <div>
      {/* Header status */}
      {ok && <div style={{ background: C.successBg, border: `1px solid ${C.success}`, borderRadius: 6, padding: "8px 14px", marginBottom: 12, fontSize: 13, color: C.success }}>{ok}</div>}
      {error && <div style={{ background: C.dangerBg, border: `1px solid ${C.danger}`, borderRadius: 6, padding: "8px 14px", marginBottom: 12, fontSize: 13, color: C.danger }}>{error} <button onClick={() => setError("")} style={{ marginLeft: 8, background: "none", border: "none", cursor: "pointer", color: C.danger, fontWeight: 700 }}>×</button></div>}

      {/* Sub-tabs */}
      <div style={{ display: "flex", gap: 0, borderBottom: `1px solid ${C.border}`, marginBottom: 18 }}>
        {VTABS.map(t => {
          const act = vista === t.key;
          return (
            <button key={t.key} onClick={() => setVista(t.key)} style={{ background: "none", border: "none", borderBottom: act ? `2px solid ${C.primary}` : "2px solid transparent", color: act ? C.primary : C.textMuted, cursor: "pointer", fontSize: 13, fontWeight: act ? 600 : 400, padding: "8px 16px", whiteSpace: "nowrap" }}>
              {t.label}
            </button>
          );
        })}
      </div>

      {/* ─── VISTA STAGING ─── */}
      {vista === "staging" && (
        <div>
          <div style={rowFlex}>
            <Btn color="ghost" onClick={() => { /* placeholder SII API */ alert("Integración SII API pendiente de certificado digital."); }}>⬇ Sincronizar SII (API)</Btn>
            <Btn color="primary" onClick={() => setShowUpload(true)}>↑ Cargar RCV (CSV/Excel)</Btn>
            <span style={{ flex: 1 }} />
            <span style={labelS}>Período:</span>
            <AnioMesSel anio={filtroAnio} setAnio={setFiltroAnio} mes={filtroMes} setMes={setFiltroMes} />
            <select style={selS} value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)}>
              <option value="">Todos</option>
              <option value="compras">Compras</option>
              <option value="ventas">Ventas</option>
            </select>
            <select style={selS} value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)}>
              <option value="">Todos los estados</option>
              <option value="pendiente">Pendiente</option>
              <option value="mapeado">Mapeado</option>
              <option value="centralizado">Centralizado</option>
              <option value="ignorado">Ignorado</option>
            </select>
            <Btn color="ghost" size="sm" onClick={loadStaging}>↻</Btn>
          </div>

          {loading ? <div style={{ padding: 24, textAlign: "center", color: C.textDim }}>Cargando...</div> : (
            <>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 900 }}>
                  <thead>
                    <tr>
                      <th style={thS}><input type="checkbox" onChange={e => { if (e.target.checked) setSelIds(new Set(stagingDocs.map(d => d.id))); else setSelIds(new Set()); }} /></th>
                      <th style={thS}>Folio</th>
                      <th style={thS}>Tipo doc</th>
                      <th style={thS}>Fecha</th>
                      <th style={thS}>RUT emisor</th>
                      <th style={thS}>Nombre emisor</th>
                      <th style={{ ...thS, textAlign: "right" }}>Neto</th>
                      <th style={{ ...thS, textAlign: "right" }}>IVA</th>
                      <th style={{ ...thS, textAlign: "right" }}>Total</th>
                      <th style={thS}>Fuente</th>
                      <th style={thS}>Estado</th>
                      <th style={thS}>Cuenta sugerida</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stagingDocs.length === 0 && (
                      <tr><td colSpan={12} style={{ ...tdS, textAlign: "center", color: C.textDim, padding: 24 }}>Sin documentos para este período / filtro</td></tr>
                    )}
                    {stagingDocs.map(doc => {
                      const sel = selIds.has(doc.id);
                      const ov = rutOverrides.find(r => r.rut === doc.rut_emisor);
                      const ctaSugerida = ov ? cuentaMap[ov.cuenta_id] : (reglaCompras ? cuentaMap[reglaCompras.cta_gasto_id] : null);
                      return (
                        <tr key={doc.id} style={{ background: sel ? "#f0f4ff" : "transparent" }} onClick={() => { const s = new Set(selIds); if (s.has(doc.id)) s.delete(doc.id); else s.add(doc.id); setSelIds(s); }}>
                          <td style={tdS} onClick={e => e.stopPropagation()}><input type="checkbox" checked={sel} onChange={() => { const s = new Set(selIds); if (s.has(doc.id)) s.delete(doc.id); else s.add(doc.id); setSelIds(s); }} /></td>
                          <td style={{ ...tdS, fontFamily: "monospace" }}>{doc.folio}</td>
                          <td style={{ ...tdS, fontSize: 11 }}>{TIPO_DOC_LABEL[doc.tipo_doc_sii] || doc.tipo_doc_sii}</td>
                          <td style={tdS}>{fmtD(doc.fecha_doc)}</td>
                          <td style={{ ...tdS, fontFamily: "monospace", fontSize: 11 }}>{doc.rut_emisor}</td>
                          <td style={{ ...tdS, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{doc.nombre_emisor}</td>
                          <td style={tdR}>{fmtM(doc.monto_neto)}</td>
                          <td style={tdR}>{fmtM(doc.monto_iva)}</td>
                          <td style={tdR}>{fmtM(doc.monto_total)}</td>
                          <td style={tdS}><span style={{ background: doc.fuente === "rcv_descarga" ? C.successBg : C.infoBg, color: doc.fuente === "rcv_descarga" ? C.success : C.info, fontSize: 10, padding: "1px 5px", borderRadius: 3, fontFamily: "monospace" }}>{doc.fuente}</span></td>
                          <td style={tdS}><BadgeSt estado={doc.estado} /></td>
                          <td style={{ ...tdS, fontSize: 11, color: ctaSugerida ? C.textMuted : C.danger }}>{ctaSugerida ? `${ctaSugerida.codigo} ${ctaSugerida.nombre}` : "— sin regla"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 10, alignItems: "center" }}>
                <Btn color="primary" disabled={!puedeIniciarLote} onClick={() => iniciarLote(seleccionados)}>
                  Centralizar seleccionados ({seleccionados.length}) →
                </Btn>
                <Btn color="ghost" disabled={selIds.size === 0} onClick={() => handleIgnorar([...selIds])}>Ignorar seleccionados</Btn>
                {selIds.size > 0 && <span style={{ fontSize: 12, color: C.textMuted }}>{selIds.size} seleccionado(s)</span>}
              </div>
            </>
          )}

          {/* Upload Modal */}
          {showUpload && (
            <Modal title="Cargar RCV desde portal SII" onClose={() => { setShowUpload(false); setUpRows([]); setUpFileName(""); setUpError(""); }} width={600}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 14 }}>
                <div>
                  <div style={{ marginBottom: 8 }}>
                    <label style={labelS}>Período</label>
                    <div style={{ display: "flex", gap: 6, marginTop: 3 }}>
                      <AnioMesSel anio={upAnio} setAnio={setUpAnio} mes={upMes} setMes={setUpMes} />
                    </div>
                  </div>
                  <div style={{ marginBottom: 8 }}>
                    <label style={labelS}>Tipo</label>
                    <select style={{ ...inpS, marginTop: 3 }} value={upTipo} onChange={e => setUpTipo(e.target.value)}>
                      <option value="compras">Compras</option>
                      <option value="ventas">Ventas</option>
                      <option value="honorarios">Honorarios</option>
                    </select>
                  </div>
                </div>
                <div>
                  <div style={{ border: `1.5px dashed ${C.border}`, borderRadius: 6, padding: "20px 14px", textAlign: "center" }}>
                    <div style={{ fontSize: 28, marginBottom: 6, color: C.textDim }}>📄</div>
                    <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 8 }}>Formato RCV SII: Folio, Tipo DTE, RUT, Neto, IVA, Total</div>
                    {upFileName && <div style={{ fontSize: 11, color: C.success, marginBottom: 6, fontWeight: 600 }}>✓ {upFileName} — {upRows.length} filas</div>}
                    <input ref={uploadRef} type="file" accept=".csv,.xlsx,.xls" style={{ display: "none" }} onChange={handleUploadArchivo} />
                    <Btn size="sm" color="ghost" onClick={() => uploadRef.current?.click()}>Seleccionar archivo</Btn>
                  </div>
                </div>
              </div>
              {upError && <div style={{ color: C.danger, fontSize: 12, marginBottom: 8 }}>{upError}</div>}
              {upRows.length > 0 && (
                <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 10, background: C.bgInput, borderRadius: 5, padding: "8px 12px" }}>
                  Previsualización: {upRows.length} documentos detectados — Neto total: {fmtM(upRows.reduce((s, r) => s + r.monto_neto, 0))}
                </div>
              )}
              <div style={{ display: "flex", gap: 8 }}>
                <Btn color="primary" disabled={uploading || !upRows.length} onClick={handleCargarStaging}>{uploading ? "Cargando..." : `Importar ${upRows.length} docs`}</Btn>
                <Btn color="ghost" onClick={() => { setShowUpload(false); setUpRows([]); setUpFileName(""); setUpError(""); }}>Cancelar</Btn>
              </div>
            </Modal>
          )}
        </div>
      )}

      {/* ─── VISTA NUEVO LOTE ─── */}
      {vista === "lote" && (
        <div>
          {/* Stepper */}
          <div style={{ display: "flex", alignItems: "center", gap: 0, marginBottom: 20 }}>
            {["Docs + cabecera", "Asignación contable", "Confirmar"].map((label, i) => {
              const paso = i + 1;
              const act = lPaso === paso;
              const done = lPaso > paso;
              return (
                <React.Fragment key={paso}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: act ? C.primary : done ? C.success : C.textDim, cursor: done ? "pointer" : "default" }} onClick={() => done && setLPaso(paso)}>
                    <div style={{ width: 22, height: 22, borderRadius: "50%", background: act ? C.primary : done ? C.success : C.bgInput, color: act || done ? "#fff" : C.textDim, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 600, border: `1px solid ${act ? C.primary : done ? C.success : C.border}` }}>{done ? "✓" : paso}</div>
                    <span style={{ fontWeight: act ? 600 : 400 }}>{label}</span>
                  </div>
                  {i < 2 && <div style={{ flex: 1, height: 1, background: C.border, margin: "0 8px" }} />}
                </React.Fragment>
              );
            })}
          </div>

          {loteError && <div style={{ background: C.dangerBg, border: `1px solid ${C.danger}`, borderRadius: 6, padding: "8px 14px", marginBottom: 12, fontSize: 13, color: C.danger }}>{loteError}</div>}

          {/* Paso 1 */}
          {lPaso === 1 && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <div style={cardS}>
                <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 10 }}>Documentos seleccionados ({lDocsSel.length})</div>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead><tr><th style={thS}>Folio</th><th style={thS}>Emisor</th><th style={{ ...thS, textAlign: "right" }}>Total</th></tr></thead>
                  <tbody>
                    {lDocsSel.map(d => (
                      <tr key={d.id}><td style={{ ...tdS, fontFamily: "monospace", fontSize: 11 }}>{d.folio}</td><td style={{ ...tdS, fontSize: 11, maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.nombre_emisor}</td><td style={tdR}>{fmtM(d.monto_total)}</td></tr>
                    ))}
                    <tr style={{ fontWeight: 600 }}>
                      <td colSpan={2} style={{ ...tdS, borderTop: `1px solid ${C.border}` }}>Total</td>
                      <td style={{ ...tdR, borderTop: `1px solid ${C.border}` }}>{fmtM(lDocsSel.reduce((s, d) => s + Number(d.monto_total || 0), 0))}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div style={cardS}>
                <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 12 }}>Cabecera del lote</div>
                {[
                  { label: "Glosa", el: <input style={inpS} value={lGlosa} onChange={e => setLGlosa(e.target.value)} /> },
                  { label: "Período", el: <div style={{ display: "flex", gap: 6 }}><AnioMesSel anio={lAnio} setAnio={setLAnio} mes={lMes} setMes={setLMes} /></div> },
                  { label: "Libro contable", el: <select style={inpS} value={lLibro} onChange={e => setLLibro(e.target.value)}><option value="tributario">Tributario</option><option value="ambos">Ambos (Tributario + IFRS)</option><option value="ifrs">IFRS</option></select> },
                ].map(({ label, el }) => (
                  <div key={label} style={{ marginBottom: 10 }}>
                    <label style={{ ...labelS, display: "block", marginBottom: 3 }}>{label}</label>
                    {el}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Paso 2 */}
          {lPaso === 2 && (
            <div>
              <div style={{ ...cardS, background: C.infoBg, border: `1px solid ${C.info}` }}>
                <div style={{ fontSize: 12, color: C.info }}>Las cuentas Proveedores e IVA CF se asignan automáticamente desde las Reglas. Aquí defines la cuenta de gasto/activo y CeCo por cada documento.</div>
              </div>
              {lDocsSel.map(doc => (
                <div key={doc.id} style={cardS}>
                  <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 10, display: "flex", justifyContent: "space-between" }}>
                    <span>{TIPO_DOC_LABEL[doc.tipo_doc_sii] || doc.tipo_doc_sii} — Fo.{doc.folio} — {doc.nombre_emisor}</span>
                    <span style={{ color: C.textMuted }}>{fmtM(doc.monto_total)}</span>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <div>
                      <label style={{ ...labelS, display: "block", marginBottom: 3 }}>Cuenta gasto / activo</label>
                      <select style={inpS} value={lAsig[doc.id]?.cuenta_id || ""} onChange={e => setLAsig(a => ({ ...a, [doc.id]: { ...a[doc.id], cuenta_id: e.target.value } }))}>
                        <option value="">— seleccionar —</option>
                        {cuentaOpts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={{ ...labelS, display: "block", marginBottom: 3 }}>Centro de costo</label>
                      <select style={inpS} value={lAsig[doc.id]?.cuartel_id || ""} onChange={e => setLAsig(a => ({ ...a, [doc.id]: { ...a[doc.id], cuartel_id: e.target.value } }))}>
                        {cuartelOpts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </div>
                  </div>
                </div>
              ))}
              <div style={{ marginTop: 4, ...cardS, background: C.bgInput }}>
                <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 8 }}>Cuentas automáticas (desde regla de centralización)</div>
                <div style={{ display: "flex", gap: 24, fontSize: 12 }}>
                  <span style={{ color: C.textMuted }}>Proveedores (HABER): <strong>{reglaCompras ? (cuentaMap[reglaCompras.cta_proveedores_id]?.codigo || "—") : "— sin configurar"}</strong></span>
                  <span style={{ color: C.textMuted }}>IVA CF (DEBE): <strong>{reglaCompras ? (cuentaMap[reglaCompras.cta_iva_cf_id]?.codigo || "—") : "— sin configurar"}</strong></span>
                </div>
                {(!reglaCompras?.cta_proveedores_id || !reglaCompras?.cta_iva_cf_id) && (
                  <div style={{ color: C.danger, fontSize: 11, marginTop: 6 }}>⚠ Configura estas cuentas en la pestaña Reglas antes de continuar.</div>
                )}
              </div>
            </div>
          )}

          {/* Paso 3 — Preview */}
          {lPaso === 3 && (
            <div>
              <div style={cardS}>
                <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 12 }}>Preview — Asiento borrador a generar</div>
                <div style={{ background: C.bgInput, borderRadius: 6, padding: 12 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "2fr 3fr 1fr 1fr", gap: 8, fontSize: 11, fontWeight: 600, color: C.textMuted, paddingBottom: 6, borderBottom: `1px solid ${C.border}`, marginBottom: 4 }}>
                    <span>Cuenta</span><span>Glosa</span><span style={{ textAlign: "right" }}>Debe</span><span style={{ textAlign: "right" }}>Haber</span>
                  </div>
                  {asientoPreview.lineas.map((l, i) => (
                    <div key={i} style={{ display: "grid", gridTemplateColumns: "2fr 3fr 1fr 1fr", gap: 8, fontSize: 12, padding: "3px 0", borderBottom: `0.5px solid ${C.border}` }}>
                      <span style={{ fontFamily: "monospace", fontSize: 11 }}>{l.cuenta_codigo} <span style={{ color: C.textMuted, fontFamily: "inherit" }}>{l.cuenta_nombre}</span></span>
                      <span style={{ color: C.textMuted, fontSize: 11 }}>{l.glosa}</span>
                      <span style={{ textAlign: "right", color: l.debe > 0 ? C.success : "transparent" }}>{l.debe > 0 ? fmtM(l.debe) : ""}</span>
                      <span style={{ textAlign: "right", color: l.haber > 0 ? C.info : "transparent" }}>{l.haber > 0 ? fmtM(l.haber) : ""}</span>
                    </div>
                  ))}
                  <div style={{ display: "grid", gridTemplateColumns: "2fr 3fr 1fr 1fr", gap: 8, fontSize: 12, fontWeight: 600, padding: "8px 0 0", borderTop: `1px solid ${C.borderLight}`, marginTop: 4 }}>
                    <span /><span>Total</span>
                    <span style={{ textAlign: "right", color: C.success }}>{fmtM(asientoPreview.totalDebe)}</span>
                    <span style={{ textAlign: "right", color: C.info }}>{fmtM(asientoPreview.totalHaber)}</span>
                  </div>
                </div>
                <div style={{ marginTop: 8, fontSize: 12, color: lCuadrado ? C.success : C.danger, fontWeight: 600 }}>
                  {lCuadrado ? "✓ Asiento cuadrado" : `⚠ Descuadre: ${fmtM(Math.abs(asientoPreview.totalDebe - asientoPreview.totalHaber))}`}
                </div>
                <div style={{ marginTop: 8, fontSize: 12, color: C.textMuted }}>
                  Libro: <strong>{lLibro}</strong> · Período: <strong>{MESES_LABEL_C[lMes]} {lAnio}</strong> · Estado: <strong>borrador</strong>
                </div>
              </div>
            </div>
          )}

          {/* Botones de navegación */}
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            {lPaso > 1 && <Btn color="ghost" onClick={() => setLPaso(p => p - 1)}>← Anterior</Btn>}
            {lPaso < 3 && <Btn color="primary" onClick={() => setLPaso(p => p + 1)}>Siguiente →</Btn>}
            {lPaso === 3 && <Btn color="success" disabled={!lCuadrado || guardandoLote} onClick={handleGuardarLote}>{guardandoLote ? "Generando..." : "Generar lote borrador"}</Btn>}
            <Btn color="ghost" onClick={() => setVista("staging")}>← Volver al staging</Btn>
          </div>
        </div>
      )}

      {/* ─── VISTA HISTORIAL ─── */}
      {vista === "historial" && (
        <div>
          <div style={rowFlex}>
            <AnioMesSel anio={hAnio} setAnio={setHAnio} mes={hMes} setMes={setHMes} />
            <select style={selS} value={hTipo} onChange={e => setHTipo(e.target.value)}>
              <option value="">Todos los tipos</option>
              <option value="compras">Compras</option>
              <option value="ventas">Ventas</option>
              <option value="honorarios">Honorarios</option>
            </select>
            <select style={selS} value={hEstado} onChange={e => setHEstado(e.target.value)}>
              <option value="">Todos los estados</option>
              <option value="borrador">Borrador</option>
              <option value="validado">Validado</option>
              <option value="centralizado">Centralizado</option>
              <option value="anulado">Anulado</option>
            </select>
            <Btn color="ghost" size="sm" onClick={loadLotes}>↻</Btn>
          </div>

          <div style={{ ...cardS, background: C.warningBg, border: `1px solid ${C.warning}`, fontSize: 12, color: C.warning }}>
            <strong>Anulación:</strong> Lote en <em>borrador/validado</em> → elimina el asiento y libera los documentos. Lote <em>centralizado</em> (mayorizado) → genera asiento de reversa automático y libera el lote.
          </div>

          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 900 }}>
              <thead>
                <tr>
                  <th style={thS}>Tipo</th>
                  <th style={thS}>Período</th>
                  <th style={thS}>Fecha desde</th>
                  <th style={thS}>Fecha hasta</th>
                  <th style={{ ...thS, textAlign: "right" }}>Neto</th>
                  <th style={{ ...thS, textAlign: "right" }}>IVA</th>
                  <th style={{ ...thS, textAlign: "right" }}>Total</th>
                  <th style={thS}>Estado</th>
                  <th style={thS}>Asiento</th>
                  <th style={thS}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {lotes.length === 0 && <tr><td colSpan={10} style={{ ...tdS, textAlign: "center", color: C.textDim, padding: 24 }}>Sin lotes para este período</td></tr>}
                {lotes.map(lote => (
                  <tr key={lote.id} style={{ opacity: lote.estado === "anulado" ? 0.6 : 1 }}>
                    <td style={tdS}>{lote.tipo}</td>
                    <td style={tdS}>{MESES_LABEL_C[lote.periodo_mes]} {lote.periodo_anio}</td>
                    <td style={tdS}>{fmtD(lote.fecha_desde)}</td>
                    <td style={tdS}>{fmtD(lote.fecha_hasta)}</td>
                    <td style={tdR}>{fmtM(lote.total_neto)}</td>
                    <td style={tdR}>{fmtM(lote.total_iva)}</td>
                    <td style={tdR}>{fmtM(lote.total_bruto)}</td>
                    <td style={tdS}><BadgeLt estado={lote.estado} /></td>
                    <td style={{ ...tdS, fontFamily: "monospace", fontSize: 11, color: C.info }}>{lote.asiento_id ? lote.asiento_id.slice(0, 8) + "…" : "—"}</td>
                    <td style={tdS}>
                      <div style={{ display: "flex", gap: 4 }}>
                        <Btn size="sm" color="ghost" onClick={async () => {
                          const lineas = await supaSelect("doc_lotes_lineas", `lote_id=eq.${lote.id}&order=orden.asc`);
                          setDetalleLineas(lineas || []);
                          setDetalleLote(lote);
                        }}>Ver</Btn>
                        {lote.estado !== "anulado" && canEdit && (
                          <Btn size="sm" color="danger" disabled={anulando === lote.id} onClick={() => handleAnularLote(lote)}>{anulando === lote.id ? "..." : "Anular"}</Btn>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {detalleLote && (
            <Modal title={`Detalle lote — ${detalleLote.tipo} ${MESES_LABEL_C[detalleLote.periodo_mes]} ${detalleLote.periodo_anio}`} onClose={() => setDetalleLote(null)} width={700}>
              <div style={{ marginBottom: 10, fontSize: 12, color: C.textMuted }}>
                Estado: <BadgeLt estado={detalleLote.estado} /> · Total bruto: <strong>{fmtM(detalleLote.total_bruto)}</strong>
              </div>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead><tr>
                  <th style={thS}>#</th><th style={thS}>Tipo doc</th><th style={thS}>Folio</th>
                  <th style={thS}>Fecha</th><th style={thS}>Contraparte</th>
                  <th style={{ ...thS, textAlign: "right" }}>Neto</th><th style={{ ...thS, textAlign: "right" }}>Total</th>
                </tr></thead>
                <tbody>
                  {detalleLineas.map(l => (
                    <tr key={l.id}>
                      <td style={tdS}>{l.orden}</td>
                      <td style={{ ...tdS, fontSize: 11 }}>{l.tipo_doc}</td>
                      <td style={{ ...tdS, fontFamily: "monospace" }}>{l.folio}</td>
                      <td style={tdS}>{fmtD(l.fecha_doc)}</td>
                      <td style={{ ...tdS, fontSize: 11 }}>{l.nombre_contraparte}</td>
                      <td style={tdR}>{fmtM(l.neto)}</td>
                      <td style={tdR}>{fmtM(l.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Modal>
          )}
        </div>
      )}

      {/* ─── VISTA REGLAS ─── */}
      {vista === "reglas" && (
        <div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
            {/* Compras */}
            <div style={cardS}>
              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 12 }}>Cuentas por defecto — Compras</div>
              {[
                { label: "Cuenta Proveedores (HABER)", key: "cta_proveedores_id" },
                { label: "Cuenta IVA Crédito Fiscal (DEBE)", key: "cta_iva_cf_id" },
                { label: "Cuenta gasto por defecto (DEBE)", key: "cta_gasto_id" },
              ].map(({ label, key }) => (
                <div key={key} style={{ marginBottom: 10 }}>
                  <label style={{ ...labelS, display: "block", marginBottom: 3 }}>{label}</label>
                  <select style={inpS} value={rcEdit[key] || ""} onChange={e => setRcEdit(r => ({ ...r, [key]: e.target.value }))}>
                    <option value="">— sin asignar —</option>
                    {cuentaOpts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
              ))}
              <div style={{ marginBottom: 10 }}>
                <label style={{ ...labelS, display: "block", marginBottom: 3 }}>CeCo por defecto</label>
                <select style={inpS} value={rcEdit.cuartel_id || ""} onChange={e => setRcEdit(r => ({ ...r, cuartel_id: e.target.value }))}>
                  {cuartelOpts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            </div>
            {/* Ventas */}
            <div style={cardS}>
              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 12 }}>Cuentas por defecto — Ventas</div>
              {[
                { label: "Cuenta Clientes (DEBE)", key: "cta_clientes_id" },
                { label: "Cuenta IVA Débito Fiscal (HABER)", key: "cta_iva_deb_id" },
                { label: "Cuenta ingresos por defecto (HABER)", key: "cta_ingreso_id" },
              ].map(({ label, key }) => (
                <div key={key} style={{ marginBottom: 10 }}>
                  <label style={{ ...labelS, display: "block", marginBottom: 3 }}>{label}</label>
                  <select style={inpS} value={rvEdit[key] || ""} onChange={e => setRvEdit(r => ({ ...r, [key]: e.target.value }))}>
                    <option value="">— sin asignar —</option>
                    {cuentaOpts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
              ))}
              <div style={{ marginBottom: 10 }}>
                <label style={{ ...labelS, display: "block", marginBottom: 3 }}>CeCo por defecto</label>
                <select style={inpS} value={rvEdit.cuartel_id || ""} onChange={e => setRvEdit(r => ({ ...r, cuartel_id: e.target.value }))}>
                  {cuartelOpts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* Overrides por RUT */}
          <div style={cardS}>
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>Overrides por emisor (RUT)</div>
            <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 12 }}>Si un RUT tiene regla específica, sobreescribe la cuenta gasto y CeCo por defecto al mapear documentos desde staging.</div>
            <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 12 }}>
              <thead>
                <tr>
                  <th style={thS}>RUT emisor</th>
                  <th style={thS}>Nombre referencial</th>
                  <th style={thS}>Cuenta gasto/activo</th>
                  <th style={thS}>CeCo</th>
                  <th style={thS}></th>
                </tr>
              </thead>
              <tbody>
                {rutOvEdit.length === 0 && <tr><td colSpan={5} style={{ ...tdS, color: C.textDim, textAlign: "center" }}>Sin reglas por RUT</td></tr>}
                {rutOvEdit.map((ov, i) => (
                  <tr key={i}>
                    <td style={{ ...tdS, fontFamily: "monospace", fontSize: 11 }}>{ov.rut}</td>
                    <td style={{ ...tdS, fontSize: 11 }}>{ov.nombre_ref}</td>
                    <td style={{ ...tdS, fontSize: 11 }}>{cuentaMap[ov.cuenta_id] ? `${cuentaMap[ov.cuenta_id].codigo} ${cuentaMap[ov.cuenta_id].nombre}` : "—"}</td>
                    <td style={{ ...tdS, fontSize: 11 }}>{cuartelMap[ov.cuartel_id]?.nombre || cuartelMap[ov.cuartel_id]?.cuartel_nombre || "Sin CeCo"}</td>
                    <td style={tdS}>
                      <Btn size="sm" color="danger" onClick={() => setRutOvEdit(a => a.filter((_, j) => j !== i))}>✕</Btn>
                    </td>
                  </tr>
                ))}
                {/* Nueva fila */}
                <tr>
                  <td style={tdS}><input style={inpS} placeholder="76.xxx.xxx-x" value={nuevoRut.rut} onChange={e => setNuevoRut(r => ({ ...r, rut: e.target.value }))} /></td>
                  <td style={tdS}><input style={inpS} placeholder="Nombre empresa" value={nuevoRut.nombre_ref} onChange={e => setNuevoRut(r => ({ ...r, nombre_ref: e.target.value }))} /></td>
                  <td style={tdS}>
                    <select style={inpS} value={nuevoRut.cuenta_id} onChange={e => setNuevoRut(r => ({ ...r, cuenta_id: e.target.value }))}>
                      <option value="">— seleccionar —</option>
                      {cuentaOpts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </td>
                  <td style={tdS}>
                    <select style={inpS} value={nuevoRut.cuartel_id} onChange={e => setNuevoRut(r => ({ ...r, cuartel_id: e.target.value }))}>
                      {cuartelOpts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </td>
                  <td style={tdS}>
                    <Btn size="sm" color="primary" disabled={!nuevoRut.rut || !nuevoRut.cuenta_id} onClick={() => {
                      if (!nuevoRut.rut) return;
                      setRutOvEdit(a => [...a, { ...nuevoRut }]);
                      setNuevoRut({ rut: "", nombre_ref: "", cuenta_id: "", cuartel_id: "" });
                    }}>+ Agregar</Btn>
                  </td>
                </tr>
              </tbody>
            </table>
            <Btn color="primary" disabled={guardandoReglas} onClick={handleGuardarReglas}>{guardandoReglas ? "Guardando..." : "Guardar reglas"}</Btn>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Componente principal ────────────────────────────────────────────────────

// ─── InformesAnaliticaTab ─────────────────────────────────────────────────────

function InformesAnaliticaTab({ empresaId, canEdit, usuario }) {
  const now = new Date();
  const anoActual = now.getFullYear();
  const mesActual = now.getMonth() + 1;

  const [subTab, setSubTab] = useState("reportes");
  const [modoTemporal, setModoTemporal] = useState("mes");
  const [filtroAnio, setFiltroAnio] = useState(anoActual);
  const [filtroMes, setFiltroMes] = useState(mesActual);
  const [filtroTemporada, setFiltroTemporada] = useState(
    mesActual >= 7 ? anoActual + 1 : anoActual
  );
  const [filtroLibro, setFiltroLibro] = useState("tributario");
  const [reporteActivo, setReporteActivo] = useState("balance");
  const [filtroCampo, setFiltroCampo] = useState("");
  const [filtroSector, setFiltroSector] = useState("");
  const [filtroCuartel, setFiltroCuartel] = useState("");

  const [balanceData, setBalanceData] = useState([]);
  const [costosData, setCostosData] = useState([]);
  const [jerarquiaData, setJerarquiaData] = useState([]);
  const [loadingBal, setLoadingBal] = useState(false);
  const [loadingCos, setLoadingCos] = useState(false);
  const [errorBal, setErrorBal] = useState("");
  const [errorCos, setErrorCos] = useState("");
  const cargaOkRef = useRef(false);

  const [narTexto, setNarTexto] = useState("");
  const [generando, setGenerando] = useState(false);

  const ANIOS = [anoActual - 1, anoActual, anoActual + 1];
  const TEMPORADAS = ANIOS.map(y => ({ value: y, label: `T${y} (Jul ${y - 1}–Jun ${y})` }));

  useEffect(() => {
    if (!empresaId) return;
    supaSelect("cc_jerarquia", `empresa_id=eq.${empresaId}&order=campo_nombre.asc`)
      .then(d => setJerarquiaData(d || []))
      .catch(() => {});
  }, [empresaId]);

  const camposOpts = useMemo(() => {
    const s = new Set((jerarquiaData || []).map(j => j.campo_nombre).filter(Boolean));
    return [...s];
  }, [jerarquiaData]);

  const sectoresOpts = useMemo(() => {
    const s = new Set(
      (jerarquiaData || [])
        .filter(j => !filtroCampo || j.campo_nombre === filtroCampo)
        .map(j => j.sector_nombre)
        .filter(Boolean)
    );
    return [...s];
  }, [jerarquiaData, filtroCampo]);

  const cuartelesOpts = useMemo(() => {
    return (jerarquiaData || []).filter(
      j =>
        (!filtroCampo || j.campo_nombre === filtroCampo) &&
        (!filtroSector || j.sector_nombre === filtroSector)
    );
  }, [jerarquiaData, filtroCampo, filtroSector]);

  const loadBalance = useCallback(async () => {
    if (!empresaId) return;
    setLoadingBal(true);
    setErrorBal("");
    try {
      let q = `empresa_id=eq.${empresaId}`;
      if (filtroLibro !== "ambos") q += `&libro=eq.${filtroLibro}`;
      q += "&order=orden_display.asc,codigo.asc";
      const data = await supaSelect("contab_balance_8_columnas", q);
      setBalanceData(data || []);
      cargaOkRef.current = true;
    } catch (e) {
      setErrorBal("Error cargando balance: " + e.message);
      throw e;
    } finally {
      setLoadingBal(false);
    }
  }, [empresaId, filtroLibro]);

  const loadCostos = useCallback(async () => {
    if (!empresaId) return;
    setLoadingCos(true);
    setErrorCos("");
    try {
      let q = `empresa_id=eq.${empresaId}`;
      if (modoTemporal === "mes") {
        q += `&anio=eq.${filtroAnio}&mes=eq.${filtroMes}`;
      } else if (modoTemporal === "anio") {
        q += `&anio=eq.${filtroAnio}`;
      } else {
        const tA = filtroTemporada;
        q += `&or=(and(anio.eq.${tA - 1},mes.gte.7),and(anio.eq.${tA},mes.lte.6))`;
      }
      if (filtroCampo) q += `&campo_nombre=eq.${encodeURIComponent(filtroCampo)}`;
      if (filtroSector) q += `&sector_nombre=eq.${encodeURIComponent(filtroSector)}`;
      if (filtroCuartel) q += `&cuartel_id=eq.${filtroCuartel}`;
      q += "&order=costo_neto.desc";
      const data = await supaSelect("contab_costos_cuartel", q);
      setCostosData(data || []);
    } catch (e) {
      setErrorCos("Error cargando costos: " + e.message);
    } finally {
      setLoadingCos(false);
    }
  }, [empresaId, modoTemporal, filtroAnio, filtroMes, filtroTemporada, filtroCampo, filtroSector, filtroCuartel]);

  useEffect(() => {
    cargaOkRef.current = false;
    loadBalance();
    loadCostos();
  }, [loadBalance, loadCostos]);

  const balPorTipo = useMemo(() => {
    const g = { A: [], P: [], I: [], E: [], O: [] };
    (balanceData || []).forEach(r => { if (g[r.tipo]) g[r.tipo].push(r); });
    return g;
  }, [balanceData]);

  const ratios = useMemo(() => {
    if (!balanceData.length) return null;
    const sum = (rows, field) => rows.reduce((s, r) => s + Number(r[field] || 0), 0);
    const totalActivo = sum(balPorTipo.A, "balance_activo");
    const totalPasivo = sum(balPorTipo.P, "balance_pasivo");
    const ingresos = sum(balPorTipo.I, "resultado_ingreso");
    const egresos = sum(balPorTipo.E, "resultado_egreso");
    const utilidad = ingresos - egresos;
    const patrimonio = totalActivo - totalPasivo;
    const acCte = sum(balPorTipo.A.filter(r => (r.clasif_ifrs || "").includes("Corriente")), "balance_activo");
    const pCte = sum(balPorTipo.P.filter(r => (r.clasif_ifrs || "").includes("Corriente")), "balance_pasivo");
    return {
      totalActivo, totalPasivo, ingresos, egresos, utilidad, patrimonio, acCte, pCte,
      roa: totalActivo > 0 ? (utilidad / totalActivo) * 100 : null,
      roe: patrimonio > 0 ? (utilidad / patrimonio) * 100 : null,
      razonCte: pCte > 0 ? acCte / pCte : null,
      pruebaAcida: pCte > 0 ? (acCte / pCte) * 0.80 : null,
      apalancamiento: patrimonio > 0 ? totalPasivo / patrimonio : null,
    };
  }, [balanceData, balPorTipo]);

  const costosPorCuartel = useMemo(() => {
    const mapa = {};
    (costosData || []).forEach(r => {
      const key = r.cuartel_id || r.cuartel_nombre || r.campo_nombre;
      if (!mapa[key]) mapa[key] = { ...r, costo_neto: 0, total_debe: 0 };
      mapa[key].costo_neto += Number(r.costo_neto || 0);
      mapa[key].total_debe += Number(r.total_debe || 0);
    });
    return Object.values(mapa).sort((a, b) => b.costo_neto - a.costo_neto);
  }, [costosData]);

  const totalCostos = costosPorCuartel.reduce((s, c) => s + c.costo_neto, 0);
  const totalHas = costosPorCuartel.reduce((s, c) => s + Number(c.hectareas || 0), 0);

  const handleAplicar = () => { cargaOkRef.current = false; loadBalance(); loadCostos(); };

  const generarNarrativa = () => {
    setGenerando(true);
    setTimeout(() => {
      const r = ratios;
      const periodo =
        modoTemporal === "mes" ? `${MESES_LABEL_C[filtroMes]} ${filtroAnio}` :
        modoTemporal === "anio" ? `Año ${filtroAnio}` :
        `Temporada ${filtroTemporada} (Jul ${filtroTemporada - 1}–Jun ${filtroTemporada})`;
      const semCte = !r?.razonCte ? "sin datos" : r.razonCte >= 2 ? "adecuada" : r.razonCte >= 1.5 ? "en vigilancia" : "crítica";
      const semRoa = !r?.roa ? "sin datos" : r.roa >= 15 ? "satisfactorio" : r.roa >= 8 ? "moderado" : "bajo";
      const avgHa = totalHas > 0 ? totalCostos / totalHas : 0;
      const devs = [];
      if (r?.razonCte != null && r.razonCte < 2) {
        devs.push({
          icon: r.razonCte < 1.5 ? "●" : "◐", sev: r.razonCte < 1.5 ? "CRÍTICA" : "MEDIA",
          titulo: "Liquidez corriente bajo umbral mínimo",
          detalle: `La razón corriente de ${r.razonCte.toFixed(2)}× se ubica bajo el mínimo recomendado de 2.0× para empresas agroexportadoras.`,
          rec: "Acelerar gestión de cobros y renegociar plazos con proveedores estratégicos.",
        });
      }
      if (r?.roa != null && r.roa < 12) {
        devs.push({
          icon: r.roa < 6 ? "●" : "◐", sev: r.roa < 6 ? "ALTA" : "MEDIA",
          titulo: "ROA por debajo del benchmark sectorial (12–22%)",
          detalle: `El retorno sobre activos de ${r.roa.toFixed(1)}% está bajo el rango objetivo para el sector frutícola exportador.`,
          rec: "Revisar activos fijos subexplotados y evaluar restructuración de cartera de activos.",
        });
      }
      if (costosPorCuartel.length > 0 && avgHa > 0) {
        const c = costosPorCuartel[0];
        const haC = Number(c.hectareas) || 1;
        const cHa = c.costo_neto / haC;
        if (cHa > avgHa * 1.15) {
          devs.push({
            icon: "◐", sev: "MEDIA",
            titulo: `CeCo con mayor costo/há: ${c.cuartel_nombre || c.campo_nombre}`,
            detalle: `Costo/há de ${fmtM(Math.round(cHa))}, un ${((cHa / avgHa - 1) * 100).toFixed(1)}% sobre el promedio de ${fmtM(Math.round(avgHa))}/há.`,
            rec: `Revisar plan de aplicaciones en este cuartel para el próximo ciclo agrícola.`,
          });
        }
      }
      if (devs.length === 0) {
        devs.push({ icon: "○", sev: "BAJA", titulo: "Indicadores dentro de parámetros", detalle: "No se detectan desviaciones significativas en el período.", rec: "Mantener monitoreo mensual." });
      }
      const lines = [
        `${"═".repeat(54)}`,
        `INFORME EJECUTIVO — ANÁLISIS CONTABLE`,
        `Período: ${periodo} | Libro: ${filtroLibro.toUpperCase()}`,
        `Generado: ${new Date().toLocaleDateString("es-CL")}`,
        `${"═".repeat(54)}`,
        ``,
        `RESUMEN EJECUTIVO`,
        r ? `La empresa registra un ROA de ${r.roa != null ? r.roa.toFixed(1) + "%" : "n/d"} y un ROE de ${r.roe != null ? r.roe.toFixed(1) + "%" : "n/d"}, con razón corriente ${r.razonCte != null ? r.razonCte.toFixed(2) + "×" : "n/d"} (${semCte}) y apalancamiento ${r.apalancamiento != null ? r.apalancamiento.toFixed(2) + "×" : "n/d"}. Rentabilidad sobre activos: ${semRoa}.` : "Sin datos de balance.",
        costosPorCuartel.length ? `Costos CeCo totalizan ${fmtM(Math.round(totalCostos))} en ${costosPorCuartel.length} centros activos${avgHa > 0 ? `, promedio ${fmtM(Math.round(avgHa))}/há` : ""}.` : "",
        ``,
        `PRINCIPALES DESVIACIONES`,
        ...devs.slice(0, 3).map((d, i) => `${i + 1}. ${d.icon} [${d.sev}] ${d.titulo}\n   ${d.detalle}\n   → ${d.rec}`),
        ``,
        `INDICADORES CLAVE`,
        r ? [
          `• ROA: ${r.roa != null ? r.roa.toFixed(1) + "%" : "n/d"} (bench. 12–22%)  ROE: ${r.roe != null ? r.roe.toFixed(1) + "%" : "n/d"} (bench. 15–30%)`,
          `• Razón corriente: ${r.razonCte != null ? r.razonCte.toFixed(2) + "×" : "n/d"} (mín. 2.0×)  Prueba ácida: ${r.pruebaAcida != null ? r.pruebaAcida.toFixed(2) + "×" : "n/d"} (mín. 1.5×)`,
          `• Apalancamiento: ${r.apalancamiento != null ? r.apalancamiento.toFixed(2) + "×" : "n/d"} (ópt. <0.5×)`,
          `• Ingresos acum.: ${fmtM(Math.round(r.ingresos))}  Egresos acum.: ${fmtM(Math.round(r.egresos))}`,
          `• Utilidad neta: ${fmtM(Math.round(r.utilidad))}  Patrimonio: ${fmtM(Math.round(r.patrimonio))}`,
        ].join("\n") : "Sin datos.",
        ``,
        `${"─".repeat(54)}`,
        `Fuentes: contab_balance_8_columnas · contab_costos_cuartel`,
        `Editable antes de distribución.`,
        `${"─".repeat(54)}`,
      ].filter(l => l !== null && l !== undefined).join("\n");
      setNarTexto(lines);
      setGenerando(false);
    }, 600);
  };

  const exportarExcel = () => {
    const src = reporteActivo === "costos_cuartel" ? costosPorCuartel : balanceData;
    if (!src.length) return;
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(src), reporteActivo === "costos_cuartel" ? "Costos CeCo" : "Balance");
    XLSX.writeFile(wb, `informe_${reporteActivo}_${filtroAnio}.xlsx`);
  };

  // ── Estilos ────────────────────────────────────────────────────────────────────
  const cardS = { background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 8, padding: "14px 16px", marginBottom: 12 };
  const thS = { padding: "5px 8px", fontSize: 10, fontWeight: 600, color: C.textMuted, borderBottom: `1px solid ${C.border}`, background: C.bgInput, textAlign: "left", whiteSpace: "nowrap" };
  const thR = { ...thS, textAlign: "right" };
  const tdS = { padding: "5px 8px", fontSize: 11, borderBottom: `0.5px solid ${C.border}`, verticalAlign: "middle" };
  const tdR = { ...tdS, textAlign: "right", fontFamily: "monospace", fontSize: 10 };
  const selS = { padding: "4px 8px", fontSize: 11, border: `1px solid ${C.border}`, borderRadius: 5, background: C.bgInput, color: C.text, cursor: "pointer" };
  const rowFlex = { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 8 };
  const lbl = { fontSize: 11, color: C.textMuted, whiteSpace: "nowrap" };

  const RadioBtn = ({ label, active, onClick }) => (
    <button onClick={onClick} style={{ padding: "4px 10px", fontSize: 11, border: `1px solid ${active ? C.primary : C.border}`, borderRadius: 5, background: active ? C.primary : C.bgCard, color: active ? "#fff" : C.textMuted, cursor: "pointer" }}>
      {label}
    </button>
  );

  const RepTab = ({ id, label }) => (
    <button onClick={() => setReporteActivo(id)} style={{ background: "none", border: "none", borderBottom: reporteActivo === id ? `2px solid ${C.success}` : "2px solid transparent", color: reporteActivo === id ? C.success : C.textMuted, cursor: "pointer", fontSize: 12, fontWeight: reporteActivo === id ? 600 : 400, padding: "6px 14px", whiteSpace: "nowrap" }}>
      {label}
    </button>
  );

  const semRatio = (val, good, warn, higherBetter) => {
    if (val == null) return { color: C.textDim, label: "N/D", bg: "#f0eff8" };
    const ok = higherBetter ? val >= good : val <= good;
    const med = higherBetter ? val >= warn : val <= warn;
    if (ok) return { color: C.success, label: "Saludable", bg: C.successBg };
    if (med) return { color: C.warning, label: "Vigilar", bg: C.warningBg };
    return { color: C.danger, label: "Crítico", bg: C.dangerBg };
  };

  const RatioCard = ({ label, val, good, warn, higherBetter, fmt, bench, max }) => {
    const sem = semRatio(val, good, warn, higherBetter);
    const display = val == null ? "N/D" : fmt === "pct" ? `${val.toFixed(1)}%` : `${val.toFixed(2)}×`;
    const pct = max > 0 && val != null ? Math.min((Math.abs(val) / max) * 100, 100) : 0;
    return (
      <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 8, padding: "14px 14px 10px" }}>
        <div style={{ fontSize: 10, color: C.textMuted, marginBottom: 6 }}>{label}</div>
        <div style={{ fontSize: 22, fontWeight: 700, color: sem.color, marginBottom: 6 }}>{display}</div>
        <div style={{ height: 4, background: C.border, borderRadius: 2, marginBottom: 8 }}>
          <div style={{ height: 4, width: `${pct}%`, background: sem.color, borderRadius: 2 }} />
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ background: sem.bg, color: sem.color, borderRadius: 10, padding: "2px 8px", fontSize: 10, fontWeight: 600 }}>{sem.label}</span>
          <span style={{ fontSize: 9, color: C.textDim }}>{bench}</span>
        </div>
      </div>
    );
  };

  const PanelFiltros = ({ conCeCo }) => (
    <div style={{ ...cardS, paddingBottom: 10, marginBottom: 10 }}>
      <div style={rowFlex}>
        <span style={lbl}>Período:</span>
        <RadioBtn label="Mes" active={modoTemporal === "mes"} onClick={() => setModoTemporal("mes")} />
        <RadioBtn label="Año calendario" active={modoTemporal === "anio"} onClick={() => setModoTemporal("anio")} />
        <RadioBtn label="Temporada agrícola (Jul–Jun)" active={modoTemporal === "temporada"} onClick={() => setModoTemporal("temporada")} />
      </div>
      <div style={rowFlex}>
        {modoTemporal === "mes" && (
          <>
            <select style={selS} value={filtroMes} onChange={e => setFiltroMes(Number(e.target.value))}>
              {[1,2,3,4,5,6,7,8,9,10,11,12].map(m => <option key={m} value={m}>{MESES_LABEL_C[m]}</option>)}
            </select>
            <select style={selS} value={filtroAnio} onChange={e => setFiltroAnio(Number(e.target.value))}>
              {ANIOS.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </>
        )}
        {modoTemporal === "anio" && (
          <select style={selS} value={filtroAnio} onChange={e => setFiltroAnio(Number(e.target.value))}>
            {ANIOS.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        )}
        {modoTemporal === "temporada" && (
          <select style={selS} value={filtroTemporada} onChange={e => setFiltroTemporada(Number(e.target.value))}>
            {TEMPORADAS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        )}
        <span style={{ ...lbl, marginLeft: 4 }}>Libro:</span>
        <select style={selS} value={filtroLibro} onChange={e => setFiltroLibro(e.target.value)}>
          <option value="tributario">Tributario</option>
          <option value="ifrs">IFRS</option>
          <option value="ambos">Ambos</option>
        </select>
        {conCeCo && (
          <>
            <span style={{ ...lbl, marginLeft: 4 }}>CeCo:</span>
            <select style={selS} value={filtroCampo} onChange={e => { setFiltroCampo(e.target.value); setFiltroSector(""); setFiltroCuartel(""); }}>
              <option value="">Todos los campos</option>
              {camposOpts.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <select style={selS} value={filtroSector} onChange={e => { setFiltroSector(e.target.value); setFiltroCuartel(""); }}>
              <option value="">Todos los sectores</option>
              {sectoresOpts.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <select style={selS} value={filtroCuartel} onChange={e => setFiltroCuartel(e.target.value)}>
              <option value="">Todos los cuarteles</option>
              {cuartelesOpts.map(c => <option key={c.cuartel_id} value={c.cuartel_id}>{c.cuartel_nombre || c.cuartel_id}</option>)}
            </select>
          </>
        )}
        <Btn size="sm" color="primary" onClick={handleAplicar}>↻ Aplicar</Btn>
        <Btn size="sm" color="ghost" onClick={exportarExcel}>↓ Excel</Btn>
      </div>
      {reporteActivo !== "costos_cuartel" && (
        <div style={{ fontSize: 10, color: C.textDim, marginTop: 2 }}>
          Balance y Estado de Resultados acumulan todos los asientos mayorizados desde el inicio. El filtro de período aplica solo a Costos CeCo.
        </div>
      )}
    </div>
  );

  return (
    <div>
      {/* Tabs principales */}
      <div style={{ display: "flex", gap: 0, borderBottom: `1px solid ${C.border}`, marginBottom: 18 }}>
        {[{ id: "reportes", label: "Reportes EEFF" }, { id: "ratios", label: "Ratios financieros" }, { id: "narrativa", label: "Narrativa ejecutiva" }].map(t => (
          <button key={t.id} onClick={() => setSubTab(t.id)} style={{ background: "none", border: "none", borderBottom: subTab === t.id ? `2px solid ${C.primary}` : "2px solid transparent", color: subTab === t.id ? C.primary : C.textMuted, cursor: "pointer", fontSize: 13, fontWeight: subTab === t.id ? 600 : 400, padding: "8px 18px", whiteSpace: "nowrap" }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── REPORTES EEFF ────────────────────────────────────────────────────── */}
      {subTab === "reportes" && (
        <div>
          <PanelFiltros conCeCo={reporteActivo === "costos_cuartel"} />
          <div style={{ display: "flex", gap: 0, borderBottom: `0.5px solid ${C.border}`, marginBottom: 14 }}>
            <RepTab id="balance" label="Balance general (8 columnas)" />
            <RepTab id="estado_resultado" label="Estado de resultados" />
            <RepTab id="costos_cuartel" label="Costos por CeCo" />
          </div>
          {errorBal && <div style={{ background: C.dangerBg, border: `1px solid ${C.danger}`, borderRadius: 6, padding: "8px 14px", marginBottom: 10, fontSize: 12, color: C.danger }}>{errorBal}</div>}
          {errorCos && reporteActivo === "costos_cuartel" && <div style={{ background: C.dangerBg, border: `1px solid ${C.danger}`, borderRadius: 6, padding: "8px 14px", marginBottom: 10, fontSize: 12, color: C.danger }}>{errorCos}</div>}

          {/* Balance 8 columnas */}
          {reporteActivo === "balance" && (
            loadingBal ? <div style={{ padding: 28, textAlign: "center", color: C.textDim }}>Cargando balance...</div> : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 820, fontSize: 11 }}>
                  <colgroup>
                    <col style={{ width: 68 }} /><col /><col style={{ width: 80 }} /><col style={{ width: 80 }} />
                    <col style={{ width: 80 }} /><col style={{ width: 80 }} /><col style={{ width: 80 }} />
                    <col style={{ width: 80 }} /><col style={{ width: 80 }} /><col style={{ width: 80 }} />
                  </colgroup>
                  <thead>
                    <tr>
                      <th style={thS} rowSpan={2}>Cód.</th>
                      <th style={thS} rowSpan={2}>Cuenta</th>
                      <th style={{ ...thR, borderLeft: `1px solid ${C.borderLight}` }} colSpan={2}>Saldo</th>
                      <th style={{ ...thR, borderLeft: `1px solid ${C.borderLight}` }} colSpan={2}>Ajuste</th>
                      <th style={{ ...thR, borderLeft: `1px solid ${C.borderLight}` }} colSpan={2}>Aj. saldo</th>
                      <th style={{ ...thR, borderLeft: `1px solid ${C.borderLight}` }}>Balance</th>
                      <th style={thR}>Resultado</th>
                    </tr>
                    <tr>
                      <th style={{ ...thR, borderLeft: `1px solid ${C.borderLight}` }}>Deudor</th><th style={thR}>Acreedor</th>
                      <th style={{ ...thR, borderLeft: `1px solid ${C.borderLight}` }}>Debe</th><th style={thR}>Haber</th>
                      <th style={{ ...thR, borderLeft: `1px solid ${C.borderLight}` }}>Deudor</th><th style={thR}>Acreedor</th>
                      <th style={{ ...thR, borderLeft: `1px solid ${C.borderLight}` }}>Act/Pas</th>
                      <th style={thR}>Ing/Egr</th>
                    </tr>
                  </thead>
                  <tbody>
                    {balanceData.length === 0 && (
                      <tr><td colSpan={10} style={{ ...tdS, textAlign: "center", color: C.textDim, padding: 28 }}>Sin datos. Verifique que existan asientos mayorizados para la empresa y libro seleccionados.</td></tr>
                    )}
                    {["A", "P", "I", "E"].map(tipo => {
                      const rows = balPorTipo[tipo] || [];
                      if (!rows.length) return null;
                      const tipoLabel = { A: "ACTIVO", P: "PASIVO Y PATRIMONIO", I: "INGRESOS", E: "EGRESOS" }[tipo];
                      const sumD = rows.reduce((s, r) => s + Number(r.saldo_deudor || 0), 0);
                      const sumA = rows.reduce((s, r) => s + Number(r.saldo_acreedor || 0), 0);
                      const sumBal = rows.reduce((s, r) => s + Number(r.balance_activo || 0) + Number(r.balance_pasivo || 0), 0);
                      const sumRes = rows.reduce((s, r) => s + Number(r.resultado_ingreso || 0) + Number(r.resultado_egreso || 0), 0);
                      return (
                        <React.Fragment key={tipo}>
                          <tr style={{ background: C.bgInput }}>
                            <td colSpan={10} style={{ ...tdS, fontWeight: 700, fontSize: 11, letterSpacing: 0.5 }}>{tipoLabel}</td>
                          </tr>
                          {rows.map(r => {
                            const balVal = Number(r.balance_activo || 0) + Number(r.balance_pasivo || 0);
                            const resVal = Number(r.resultado_ingreso || 0) + Number(r.resultado_egreso || 0);
                            return (
                              <tr key={r.codigo}>
                                <td style={{ ...tdS, fontFamily: "monospace", fontSize: 10, color: C.textMuted }}>{r.codigo}</td>
                                <td style={{ ...tdS, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 180 }} title={r.nombre}>{r.nombre}</td>
                                <td style={{ ...tdR, borderLeft: `1px solid ${C.borderLight}`, color: Number(r.saldo_deudor) > 0 ? C.info : "transparent" }}>{Number(r.saldo_deudor) > 0 ? fmtM(r.saldo_deudor) : ""}</td>
                                <td style={{ ...tdR, color: Number(r.saldo_acreedor) > 0 ? C.danger : "transparent" }}>{Number(r.saldo_acreedor) > 0 ? fmtM(r.saldo_acreedor) : ""}</td>
                                <td style={{ ...tdR, borderLeft: `1px solid ${C.borderLight}`, color: C.textDim }}>—</td>
                                <td style={{ ...tdR, color: C.textDim }}>—</td>
                                <td style={{ ...tdR, borderLeft: `1px solid ${C.borderLight}`, color: Number(r.saldo_aj_deudor) > 0 ? C.info : "transparent" }}>{Number(r.saldo_aj_deudor) > 0 ? fmtM(r.saldo_aj_deudor) : ""}</td>
                                <td style={{ ...tdR, color: Number(r.saldo_aj_acreedor) > 0 ? C.danger : "transparent" }}>{Number(r.saldo_aj_acreedor) > 0 ? fmtM(r.saldo_aj_acreedor) : ""}</td>
                                <td style={{ ...tdR, borderLeft: `1px solid ${C.borderLight}`, color: balVal > 0 ? C.text : "transparent" }}>{balVal > 0 ? fmtM(balVal) : ""}</td>
                                <td style={{ ...tdR, color: resVal > 0 ? C.text : "transparent" }}>{resVal > 0 ? fmtM(resVal) : ""}</td>
                              </tr>
                            );
                          })}
                          <tr style={{ background: C.bgInput, fontWeight: 600, borderTop: `1px solid ${C.border}` }}>
                            <td colSpan={2} style={{ ...tdS, fontWeight: 600 }}>Total {tipoLabel}</td>
                            <td style={{ ...tdR, borderLeft: `1px solid ${C.borderLight}`, fontWeight: 600, color: C.info }}>{sumD > 0 ? fmtM(sumD) : ""}</td>
                            <td style={{ ...tdR, fontWeight: 600, color: C.danger }}>{sumA > 0 ? fmtM(sumA) : ""}</td>
                            <td style={{ ...tdR, borderLeft: `1px solid ${C.borderLight}`, color: C.textDim }}>—</td>
                            <td style={{ ...tdR, color: C.textDim }}>—</td>
                            <td style={{ ...tdR, borderLeft: `1px solid ${C.borderLight}`, fontWeight: 600, color: C.info }}>{sumD > 0 ? fmtM(sumD) : ""}</td>
                            <td style={{ ...tdR, fontWeight: 600, color: C.danger }}>{sumA > 0 ? fmtM(sumA) : ""}</td>
                            <td style={{ ...tdR, borderLeft: `1px solid ${C.borderLight}`, fontWeight: 600, color: C.primary }}>{sumBal > 0 ? fmtM(sumBal) : ""}</td>
                            <td style={{ ...tdR, fontWeight: 600, color: C.primary }}>{sumRes > 0 ? fmtM(sumRes) : ""}</td>
                          </tr>
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )
          )}

          {/* Estado de Resultados */}
          {reporteActivo === "estado_resultado" && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: 14 }}>
              <div>
                {loadingBal ? <div style={{ padding: 28, textAlign: "center", color: C.textDim }}>Cargando...</div> : (
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead><tr><th style={thS}>Cuenta</th><th style={thR}>Monto acum.</th><th style={thR}>% s/ing.</th></tr></thead>
                    <tbody>
                      {(() => {
                        const ing = balPorTipo.I || [];
                        const egr = balPorTipo.E || [];
                        const totalIng = ing.reduce((s, r) => s + Number(r.resultado_ingreso || 0), 0);
                        const totalEgr = egr.reduce((s, r) => s + Number(r.resultado_egreso || 0), 0);
                        const utilidad = totalIng - totalEgr;
                        const pct = n => totalIng > 0 ? `${((n / totalIng) * 100).toFixed(1)}%` : "—";
                        return (
                          <>
                            <tr style={{ background: C.bgInput }}><td colSpan={3} style={{ ...tdS, fontWeight: 700 }}>Ingresos operacionales</td></tr>
                            {ing.map(r => <tr key={r.codigo}><td style={{ ...tdS, paddingLeft: 18 }}>{r.nombre}</td><td style={{ ...tdR, color: C.success }}>{fmtM(r.resultado_ingreso)}</td><td style={{ ...tdR, color: C.textMuted }}>100%</td></tr>)}
                            {ing.length === 0 && <tr><td colSpan={3} style={{ ...tdS, paddingLeft: 18, color: C.textDim, fontStyle: "italic" }}>Sin cuentas de ingreso (tipo I)</td></tr>}
                            <tr style={{ background: C.successBg, borderTop: `1px solid ${C.border}` }}>
                              <td style={{ ...tdS, fontWeight: 600 }}>Total ingresos</td>
                              <td style={{ ...tdR, fontWeight: 600, color: C.success }}>{fmtM(totalIng)}</td>
                              <td style={{ ...tdR, fontWeight: 600, color: C.success }}>100%</td>
                            </tr>
                            <tr style={{ background: C.bgInput }}><td colSpan={3} style={{ ...tdS, fontWeight: 700, paddingTop: 12 }}>Egresos</td></tr>
                            {egr.map(r => <tr key={r.codigo}><td style={{ ...tdS, paddingLeft: 18 }}>{r.nombre}</td><td style={{ ...tdR, color: C.danger }}>{fmtM(r.resultado_egreso)}</td><td style={{ ...tdR, color: C.textMuted }}>{pct(r.resultado_egreso)}</td></tr>)}
                            {egr.length === 0 && <tr><td colSpan={3} style={{ ...tdS, paddingLeft: 18, color: C.textDim, fontStyle: "italic" }}>Sin cuentas de egreso (tipo E)</td></tr>}
                            <tr style={{ background: C.dangerBg, borderTop: `1px solid ${C.border}` }}>
                              <td style={{ ...tdS, fontWeight: 600 }}>Total egresos</td>
                              <td style={{ ...tdR, fontWeight: 600, color: C.danger }}>{fmtM(totalEgr)}</td>
                              <td style={{ ...tdR, fontWeight: 600, color: C.danger }}>{pct(totalEgr)}</td>
                            </tr>
                            <tr style={{ borderTop: `2px solid ${C.border}`, background: utilidad >= 0 ? C.successBg : C.dangerBg }}>
                              <td style={{ ...tdS, fontWeight: 700, fontSize: 13 }}>Utilidad del ejercicio</td>
                              <td style={{ ...tdR, fontWeight: 700, fontSize: 13, color: utilidad >= 0 ? C.success : C.danger }}>{fmtM(utilidad)}</td>
                              <td style={{ ...tdR, fontWeight: 700, color: utilidad >= 0 ? C.success : C.danger }}>{pct(utilidad)}</td>
                            </tr>
                          </>
                        );
                      })()}
                    </tbody>
                  </table>
                )}
              </div>
              <div style={{ ...cardS, background: C.bgInput, alignSelf: "start" }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: C.textMuted, marginBottom: 12 }}>Estructura de egresos</div>
                {(() => {
                  const egr = balPorTipo.E || [];
                  const totalEgr = egr.reduce((s, r) => s + Number(r.resultado_egreso || 0), 0);
                  return egr.sort((a, b) => Number(b.resultado_egreso) - Number(a.resultado_egreso)).slice(0, 10).map(r => {
                    const p = totalEgr > 0 ? (Number(r.resultado_egreso) / totalEgr) * 100 : 0;
                    return (
                      <div key={r.codigo} style={{ marginBottom: 10 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, marginBottom: 2 }}>
                          <span style={{ color: C.textMuted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 170 }}>{r.nombre}</span>
                          <span style={{ fontFamily: "monospace", color: C.textDim, marginLeft: 4 }}>{p.toFixed(1)}%</span>
                        </div>
                        <div style={{ height: 4, background: C.border, borderRadius: 2 }}>
                          <div style={{ height: 4, width: `${Math.min(p, 100)}%`, background: C.danger, borderRadius: 2, opacity: 0.7 }} />
                        </div>
                      </div>
                    );
                  });
                })()}
                {(balPorTipo.E || []).length === 0 && <div style={{ fontSize: 11, color: C.textDim, fontStyle: "italic" }}>Sin cuentas de egreso.</div>}
              </div>
            </div>
          )}

          {/* Costos por CeCo */}
          {reporteActivo === "costos_cuartel" && (
            loadingCos ? <div style={{ padding: 28, textAlign: "center", color: C.textDim }}>Cargando costos...</div> : (
              <>
                <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 10 }}>
                  {modoTemporal === "temporada" ? `Temporada ${filtroTemporada} (Jul ${filtroTemporada - 1}–Jun ${filtroTemporada})` : modoTemporal === "anio" ? `Año ${filtroAnio}` : `${MESES_LABEL_C[filtroMes]} ${filtroAnio}`}
                  {" "}· Solo asientos mayorizados con CeCo asignado (cuartel_id). Costo/há en rojo = +15% sobre promedio.
                </div>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead><tr>
                    <th style={thS}>Campo</th><th style={thS}>Sector</th><th style={thS}>Cuartel</th>
                    <th style={thS}>Especie</th><th style={thS}>Variedad</th>
                    <th style={thR}>Há</th><th style={thR}>Costo total</th><th style={thR}>$/há</th><th style={thR}>% total</th>
                  </tr></thead>
                  <tbody>
                    {costosPorCuartel.length === 0 && (
                      <tr><td colSpan={9} style={{ ...tdS, textAlign: "center", color: C.textDim, padding: 28 }}>Sin costos con CeCo asignado para el período/filtro seleccionado.</td></tr>
                    )}
                    {costosPorCuartel.map((c, i) => {
                      const pct = totalCostos > 0 ? (c.costo_neto / totalCostos) * 100 : 0;
                      const ha = Number(c.hectareas) || 1;
                      const cHa = c.costo_neto / ha;
                      const avgHa = totalHas > 0 ? totalCostos / totalHas : 0;
                      const esAlto = avgHa > 0 && cHa > avgHa * 1.15;
                      return (
                        <tr key={i} style={esAlto ? { background: "#fff9f0" } : {}}>
                          <td style={tdS}>{c.campo_nombre}</td>
                          <td style={tdS}>{c.sector_nombre}</td>
                          <td style={tdS}>{c.cuartel_nombre}</td>
                          <td style={tdS}>{c.especie}</td>
                          <td style={tdS}>{c.variedad}</td>
                          <td style={tdR}>{Number(c.hectareas || 0).toFixed(1)}</td>
                          <td style={tdR}>{fmtM(Math.round(c.costo_neto))}</td>
                          <td style={{ ...tdR, color: esAlto ? C.danger : C.success, fontWeight: esAlto ? 600 : 400 }}>{fmtM(Math.round(cHa))}</td>
                          <td style={tdR}>{pct.toFixed(1)}%</td>
                        </tr>
                      );
                    })}
                    {costosPorCuartel.length > 0 && (
                      <tr style={{ fontWeight: 700, borderTop: `2px solid ${C.border}`, background: C.bgInput }}>
                        <td colSpan={5} style={tdS}>Total general</td>
                        <td style={{ ...tdR, fontWeight: 700 }}>{totalHas.toFixed(1)}</td>
                        <td style={{ ...tdR, fontWeight: 700 }}>{fmtM(Math.round(totalCostos))}</td>
                        <td style={{ ...tdR, fontWeight: 700 }}>{totalHas > 0 ? fmtM(Math.round(totalCostos / totalHas)) : "—"}</td>
                        <td style={{ ...tdR, fontWeight: 700 }}>100%</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </>
            )
          )}
        </div>
      )}

      {/* ── RATIOS FINANCIEROS ────────────────────────────────────────────────── */}
      {subTab === "ratios" && (
        <div>
          <div style={{ ...rowFlex, marginBottom: 14 }}>
            <span style={lbl}>Libro para ratios:</span>
            <select style={selS} value={filtroLibro} onChange={e => setFiltroLibro(e.target.value)}>
              <option value="tributario">Tributario</option><option value="ifrs">IFRS</option>
            </select>
            <Btn size="sm" color="primary" onClick={loadBalance}>↻ Recalcular</Btn>
          </div>
          {loadingBal && <div style={{ padding: 28, textAlign: "center", color: C.textDim }}>Calculando ratios...</div>}
          {!loadingBal && (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(165px, 1fr))", gap: 10, marginBottom: 16 }}>
                <RatioCard label="ROA — Retorno sobre activos" val={ratios?.roa} good={15} warn={8} higherBetter fmt="pct" bench="Bench. 12–22%" max={30} />
                <RatioCard label="ROE — Retorno sobre patrimonio" val={ratios?.roe} good={18} warn={10} higherBetter fmt="pct" bench="Bench. 15–30%" max={40} />
                <RatioCard label="Razón corriente" val={ratios?.razonCte} good={2} warn={1.5} higherBetter fmt="ratio" bench="Mín. 2.0×" max={4} />
                <RatioCard label="Prueba ácida" val={ratios?.pruebaAcida} good={1.5} warn={1} higherBetter fmt="ratio" bench="Mín. 1.5×" max={3} />
                <RatioCard label="Apalancamiento" val={ratios?.apalancamiento} good={0.4} warn={0.6} higherBetter={false} fmt="ratio" bench="Ópt. <0.5×" max={2} />
              </div>
              {ratios && ratios.totalActivo > 0 && (
                <div style={cardS}>
                  <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 12 }}>Composición del balance</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 12 }}>
                    {[
                      { label: "Total activo", value: ratios.totalActivo, color: C.info },
                      { label: "Total pasivo", value: ratios.totalPasivo, color: C.danger },
                      { label: "Patrimonio", value: ratios.patrimonio, color: C.teal },
                      { label: "Utilidad neta", value: ratios.utilidad, color: ratios.utilidad >= 0 ? C.success : C.danger },
                    ].map(k => (
                      <div key={k.label} style={{ background: C.bgInput, borderRadius: 6, padding: "10px 12px" }}>
                        <div style={{ fontSize: 10, color: C.textMuted, marginBottom: 4 }}>{k.label}</div>
                        <div style={{ fontSize: 15, fontWeight: 600, color: k.color }}>{fmtM(Math.round(k.value))}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ fontSize: 10, color: C.textMuted, marginBottom: 4 }}>Estructura financiera (Activo = Pasivo + Patrimonio)</div>
                  <div style={{ display: "flex", height: 14, borderRadius: 4, overflow: "hidden" }}>
                    <div title="Pasivo" style={{ background: C.danger, width: `${(ratios.totalPasivo / ratios.totalActivo) * 100}%`, opacity: 0.75 }} />
                    <div title="Patrimonio" style={{ background: C.teal, flex: 1, opacity: 0.75 }} />
                  </div>
                  <div style={{ display: "flex", gap: 14, marginTop: 5, fontSize: 10, color: C.textMuted }}>
                    <span><span style={{ display: "inline-block", width: 8, height: 8, background: C.danger, borderRadius: 2, marginRight: 4, opacity: 0.75 }} />Pasivo {ratios.totalActivo > 0 ? ((ratios.totalPasivo / ratios.totalActivo) * 100).toFixed(0) : 0}%</span>
                    <span><span style={{ display: "inline-block", width: 8, height: 8, background: C.teal, borderRadius: 2, marginRight: 4, opacity: 0.75 }} />Patrimonio {ratios.totalActivo > 0 ? ((ratios.patrimonio / ratios.totalActivo) * 100).toFixed(0) : 0}%</span>
                  </div>
                </div>
              )}
              {(!ratios || !ratios.totalActivo) && (
                <div style={{ ...cardS, background: C.warningBg, border: `1px solid ${C.warning}`, color: C.warning, fontSize: 12 }}>
                  Sin saldos acumulados disponibles. Asegúrese de que existan asientos mayorizados para esta empresa y libro. Los ratios corriente/prueba ácida requieren además que las cuentas tengan <code>clasif_ifrs</code> configurado en el plan de cuentas.
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── NARRATIVA EJECUTIVA ───────────────────────────────────────────────── */}
      {subTab === "narrativa" && (
        <div style={{ display: "grid", gridTemplateColumns: "230px 1fr", gap: 14, alignItems: "start" }}>
          <div style={cardS}>
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 14 }}>Parámetros del informe</div>
            <div style={{ marginBottom: 10 }}>
              <div style={{ ...lbl, display: "block", marginBottom: 3 }}>Período</div>
              <div style={{ display: "flex", gap: 4, marginBottom: 6 }}>
                {[["mes","Mes"],["anio","Año"],["temporada","Temp."]].map(([v,l]) => (
                  <button key={v} onClick={() => setModoTemporal(v)} style={{ flex: 1, padding: "3px 0", fontSize: 10, border: `1px solid ${modoTemporal===v ? C.primary : C.border}`, borderRadius: 4, background: modoTemporal===v ? C.primary : C.bgCard, color: modoTemporal===v ? "#fff" : C.textMuted, cursor: "pointer" }}>{l}</button>
                ))}
              </div>
              {modoTemporal === "mes" && <div style={{ display: "flex", gap: 4 }}>
                <select style={{ ...selS, flex: 1 }} value={filtroMes} onChange={e => setFiltroMes(Number(e.target.value))}>{[1,2,3,4,5,6,7,8,9,10,11,12].map(m => <option key={m} value={m}>{MESES_LABEL_C[m]}</option>)}</select>
                <select style={{ ...selS, flex: 1 }} value={filtroAnio} onChange={e => setFiltroAnio(Number(e.target.value))}>{ANIOS.map(a => <option key={a} value={a}>{a}</option>)}</select>
              </div>}
              {modoTemporal === "anio" && <select style={{ ...selS, width: "100%" }} value={filtroAnio} onChange={e => setFiltroAnio(Number(e.target.value))}>{ANIOS.map(a => <option key={a} value={a}>{a}</option>)}</select>}
              {modoTemporal === "temporada" && <select style={{ ...selS, width: "100%" }} value={filtroTemporada} onChange={e => setFiltroTemporada(Number(e.target.value))}>{TEMPORADAS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}</select>}
            </div>
            <div style={{ marginBottom: 12 }}>
              <div style={{ ...lbl, display: "block", marginBottom: 3 }}>Libro</div>
              <select style={{ ...selS, width: "100%" }} value={filtroLibro} onChange={e => setFiltroLibro(e.target.value)}>
                <option value="tributario">Tributario</option><option value="ifrs">IFRS</option>
              </select>
            </div>
            <Btn color="primary" style={{ width: "100%", marginBottom: 6 }} disabled={generando} onClick={() => { cargaOkRef.current = false; Promise.all([loadBalance(), loadCostos()]).then(() => generarNarrativa()); }}>
              {generando ? "Generando..." : "Generar narrativa"}
            </Btn>
            {narTexto && (
              <div style={{ display: "flex", gap: 6 }}>
                <Btn size="sm" color="ghost" style={{ flex: 1 }} onClick={() => { try { navigator.clipboard.writeText(narTexto); } catch (_) {} }}>Copiar</Btn>
                <Btn size="sm" color="ghost" style={{ flex: 1 }} onClick={() => { const blob = new Blob([narTexto], { type: "text/plain" }); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = `informe_ejecutivo_${filtroAnio}.txt`; a.click(); URL.revokeObjectURL(url); }}>.txt</Btn>
              </div>
            )}
            <div style={{ marginTop: 14, fontSize: 10, color: C.textDim, lineHeight: 1.5 }}>
              Análisis determinista — sin IA externa. El texto generado es editable antes de distribuir.
            </div>
          </div>
          <div style={cardS}>
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 10 }}>Informe ejecutivo</div>
            {!narTexto && !generando && (
              <div style={{ padding: "40px 0", textAlign: "center", color: C.textDim, fontSize: 13 }}>
                <div style={{ fontSize: 30, marginBottom: 10 }}>📄</div>
                Configure los parámetros y presione "Generar narrativa".
              </div>
            )}
            {generando && <div style={{ padding: "40px 0", textAlign: "center", color: C.textMuted, fontSize: 13 }}>Analizando saldos y costos...</div>}
            {narTexto && (
              <textarea value={narTexto} onChange={e => setNarTexto(e.target.value)} style={{ width: "100%", minHeight: 430, padding: "12px 14px", fontSize: 12, lineHeight: 1.7, fontFamily: "monospace", border: `1px solid ${C.border}`, borderRadius: 6, background: C.bgInput, color: C.text, resize: "vertical", boxSizing: "border-box" }} />
            )}
            <div style={{ marginTop: 8, fontSize: 10, color: C.textDim }}>Fuentes: contab_balance_8_columnas · contab_costos_cuartel · contab_saldos_acumulados · Editable antes de exportar.</div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

const TABS = [
  { key: "empresas", label: "Empresas" },
  { key: "plan_cuentas", label: "Plan de Cuentas" },
  { key: "libro_diario", label: "Libro Diario" },
  { key: "centralizacion_sii", label: "Centralización SII" },
  { key: "auxiliares", label: "Auxiliares" },
  { key: "centros_costo", label: "Centros de Costo" },
  { key: "tipos_doc", label: "Tipos de Documento" },
  { key: "periodos", label: "Períodos" },
  { key: "mapeo", label: "Homologación" },
  { key: "informes_analitica", label: "Informes y Analítica" },
];

// Tabs que requieren selector de empresa
const TABS_CON_EMPRESA = new Set(["plan_cuentas", "libro_diario", "centralizacion_sii", "centros_costo", "periodos", "mapeo", "informes_analitica"]);

export default function ContabilidadModule({ usuario, canEdit, esCFO, onBack }) {
  const [tabActiva, setTabActiva] = useState("empresas");
  const [empresas, setEmpresas] = useState([]);
  const [empresaId, setEmpresaId] = useState("");
  const [loadingEmpresas, setLoadingEmpresas] = useState(true);

  // Cargar empresas una vez al montar
  useEffect(() => {
    (async () => {
      setLoadingEmpresas(true);
      try {
        const data = await supaSelect("empresas", "activa=eq.true&order=codigo.asc");
        setEmpresas(data || []);
        if (data && data.length > 0) setEmpresaId(data[0].id);
      } catch (e) {
        console.error("Error cargando empresas:", e);
      }
      setLoadingEmpresas(false);
    })();
  }, []);

  const empresaOpts = useMemo(
    () => empresas.map((e) => ({ value: e.id, label: `${e.codigo} — ${e.nombre}` })),
    [empresas]
  );

  const empresaActual = useMemo(
    () => empresas.find((e) => e.id === empresaId),
    [empresas, empresaId]
  );

  const necesitaEmpresa = TABS_CON_EMPRESA.has(tabActiva);

  return (
    <div
      style={{
        background: C.bg,
        minHeight: "100vh",
        color: C.text,
        fontFamily: "'Inter', 'Segoe UI', sans-serif",
        fontSize: 14,
      }}
    >
      {/* Header */}
      <div
        style={{
          background: C.bgCard,
          borderBottom: `1px solid ${C.border}`,
          padding: "12px 24px",
          display: "flex",
          alignItems: "center",
          gap: 16,
          flexWrap: "wrap",
          boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
        }}
      >
        {/* Botón volver */}
        {onBack && (
          <button
            onClick={onBack}
            style={{
              background: "none",
              border: `1px solid ${C.border}`,
              borderRadius: 6,
              color: C.textMuted,
              cursor: "pointer",
              fontSize: 13,
              padding: "5px 12px",
              display: "flex",
              alignItems: "center",
              gap: 5,
              whiteSpace: "nowrap",
              transition: "all 0.15s",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = C.primary; e.currentTarget.style.color = C.primary; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.color = C.textMuted; }}
          >
            ← Inicio
          </button>
        )}

        <div>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: C.text }}>
            Sistema Contable
          </h2>
          <p style={{ margin: "2px 0 0", fontSize: 12, color: C.textMuted }}>Grupo Mediterra — Maestros</p>
        </div>

        {/* Selector de empresa (solo en tabs que lo necesitan) */}
        {necesitaEmpresa && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: "auto" }}>
            <span style={{ fontSize: 12, color: C.textMuted, whiteSpace: "nowrap" }}>Empresa:</span>
            {loadingEmpresas ? (
              <span style={{ fontSize: 12, color: C.textDim }}>Cargando...</span>
            ) : (
              <SelectInput
                value={empresaId}
                onChange={setEmpresaId}
                options={empresaOpts}
                style={{ minWidth: 260 }}
              />
            )}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div
        style={{
          display: "flex",
          gap: 0,
          borderBottom: `1px solid ${C.border}`,
          background: C.bgCard,
          padding: "0 24px",
          overflowX: "auto",
        }}
      >
        {TABS.map((t) => {
          const active = tabActiva === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTabActiva(t.key)}
              style={{
                background: "none",
                border: "none",
                borderBottom: active ? `2px solid ${C.primary}` : "2px solid transparent",
                color: active ? C.primary : C.textMuted,
                cursor: "pointer",
                fontSize: 13,
                fontWeight: active ? 600 : 400,
                padding: "12px 16px",
                whiteSpace: "nowrap",
                transition: "color 0.15s",
              }}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Contenido del tab */}
      <div style={{ padding: "20px 24px" }}>
        {tabActiva === "empresas" && (
          <EmpresasTab canEdit={canEdit || esCFO} />
        )}

        {tabActiva === "plan_cuentas" && (
          <PlanCuentasTab
            empresas={empresas}
            empresaId={empresaId}
            setEmpresaId={setEmpresaId}
            canEdit={canEdit || esCFO}
          />
        )}

        {tabActiva === "libro_diario" && (
          <LibroDiarioTab
            empresaId={empresaId}
            canEdit={canEdit || esCFO}
            usuario={usuario}
          />
        )}

        {tabActiva === "centralizacion_sii" && (
          <CentralizacionSiiTab
            empresaId={empresaId}
            canEdit={canEdit || esCFO}
            usuario={usuario}
          />
        )}

        {tabActiva === "auxiliares" && (
          <AuxiliaresTab canEdit={canEdit || esCFO} />
        )}

        {tabActiva === "centros_costo" && (
          <CentrosCostoTab empresaId={empresaId} canEdit={canEdit || esCFO} />
        )}

        {tabActiva === "tipos_doc" && (
          <TiposDocumentoTab canEdit={canEdit || esCFO} />
        )}

        {tabActiva === "periodos" && (
          <PeriodosTab empresaId={empresaId} canEdit={canEdit || esCFO} />
        )}

        {tabActiva === "mapeo" && (
          <HomologacionTab empresaId={empresaId} canEdit={canEdit || esCFO} />
        )}

        {tabActiva === "informes_analitica" && (
          <InformesAnaliticaTab
            empresaId={empresaId}
            canEdit={canEdit || esCFO}
            usuario={usuario}
          />
        )}
      </div>
    </div>
  );
}
