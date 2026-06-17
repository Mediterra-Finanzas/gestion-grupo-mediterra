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

// ─── Tab 7: Mapeo de Códigos ─────────────────────────────────────────────────

const SISTEMAS_ORIGEN = ["megasystem", "contec", "otro"];

function MapeoCodosTab({ empresaId, canEdit }) {
  const [mapeos, setMapeos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [sistema, setSistema] = useState("megasystem");
  const [modal, setModal] = useState(null);
  const [importModal, setImportModal] = useState(false);
  const [importPreview, setImportPreview] = useState(null);
  const [importando, setImportando] = useState(false);
  const fileRef = useRef();

  const load = useCallback(async () => {
    if (!empresaId) return;
    setLoading(true);
    setError("");
    try {
      const data = await supaSelect(
        "mapeo_codigos",
        `empresa_id=eq.${empresaId}&sistema_origen=eq.${sistema}&order=codigo_origen.asc`
      );
      setMapeos(data || []);
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  }, [empresaId, sistema]);

  useEffect(() => { load(); }, [load]);

  const initModal = (mode, item = null) => {
    if (mode === "add") {
      setModal({
        mode,
        item: { empresa_id: empresaId, sistema_origen: sistema, codigo_origen: "", nombre_origen: "", codigo_nuevo: "", activo: true },
      });
    } else {
      setModal({ mode, item: { ...item } });
    }
  };

  const handleSave = async () => {
    const { mode, item } = modal;
    if (!item.codigo_origen || !item.codigo_nuevo) { setError("Código origen y código nuevo son obligatorios"); return; }
    setError("");
    try {
      const payload = {
        empresa_id: empresaId,
        sistema_origen: sistema,
        codigo_origen: item.codigo_origen.trim(),
        nombre_origen: item.nombre_origen || "",
        codigo_nuevo: item.codigo_nuevo.trim(),
        activo: item.activo !== false,
      };
      if (mode === "add") {
        await supaInsert("mapeo_codigos", payload);
      } else {
        await supaUpdate("mapeo_codigos", item.id, payload);
      }
      setOk(mode === "add" ? "Mapeo creado" : "Mapeo actualizado");
      setModal(null);
      load();
      setTimeout(() => setOk(""), 3000);
    } catch (e) {
      setError(e.message);
    }
  };

  const handleToggle = async (item) => {
    try {
      await supaUpdate("mapeo_codigos", item.id, { activo: !item.activo });
      load();
    } catch (e) {
      setError(e.message);
    }
  };

  const handleImportFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const XLSX = window.XLSX;
        if (!XLSX) { setError("SheetJS no está disponible"); return; }
        const wb = XLSX.read(ev.target.result, { type: "binary" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { defval: "" });
        setImportPreview(rows);
        setImportModal(true);
      } catch (err) {
        setError("Error leyendo el archivo: " + err.message);
      }
    };
    reader.readAsBinaryString(file);
    e.target.value = "";
  };

  const handleConfirmImport = async () => {
    if (!importPreview) return;
    setImportando(true);
    setError("");
    try {
      const payload = importPreview
        .map((r) => ({
          empresa_id: empresaId,
          sistema_origen: sistema,
          codigo_origen: String(r.codigo_origen || "").trim(),
          nombre_origen: String(r.nombre_origen || "").trim(),
          codigo_nuevo: String(r.codigo_nuevo || "").trim(),
          activo: true,
        }))
        .filter((r) => r.codigo_origen && r.codigo_nuevo);
      await supaUpsert("mapeo_codigos", payload, "empresa_id,sistema_origen,codigo_origen");
      setOk(`${payload.length} mapeos importados`);
      setImportModal(false);
      setImportPreview(null);
      load();
      setTimeout(() => setOk(""), 4000);
    } catch (e) {
      setError(e.message);
    }
    setImportando(false);
  };

  return (
    <div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14, alignItems: "center" }}>
        <SelectInput
          value={sistema}
          onChange={setSistema}
          options={SISTEMAS_ORIGEN.map((s) => ({ value: s, label: s.charAt(0).toUpperCase() + s.slice(1) }))}
        />
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          {canEdit && empresaId && (
            <>
              <Btn color="ghost" size="sm" onClick={() => fileRef.current && fileRef.current.click()}>
                Importar desde Excel
              </Btn>
              <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: "none" }} onChange={handleImportFile} />
              <Btn color="primary" size="sm" onClick={() => initModal("add")}>+ Agregar mapeo</Btn>
            </>
          )}
        </div>
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
              <Th>Código nuevo</Th>
              <Th>Estado</Th>
              {canEdit && <Th></Th>}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <LoadingRow cols={canEdit ? 6 : 5} />
            ) : mapeos.length === 0 ? (
              <EmptyRow cols={canEdit ? 6 : 5} />
            ) : (
              mapeos.map((m) => (
                <Tr key={m.id}>
                  <Td><span style={{ fontFamily: "monospace", color: C.warning }}>{m.codigo_origen}</span></Td>
                  <Td style={{ color: C.textMuted }}>{m.nombre_origen || "—"}</Td>
                  <Td style={{ textAlign: "center", color: C.textDim }}>→</Td>
                  <Td><span style={{ fontFamily: "monospace", color: C.primary }}>{m.codigo_nuevo}</span></Td>
                  <Td><Badge label={m.activo ? "Activo" : "Inactivo"} color={m.activo ? "success" : "muted"} /></Td>
                  {canEdit && (
                    <Td>
                      <div style={{ display: "flex", gap: 6 }}>
                        <Btn size="sm" color="ghost" onClick={() => initModal("edit", m)}>Editar</Btn>
                        <Btn size="sm" color={m.activo ? "warning" : "success"} onClick={() => handleToggle(m)}>
                          {m.activo ? "Desactivar" : "Activar"}
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
          title={modal.mode === "add" ? "Nuevo mapeo" : "Editar mapeo"}
          onClose={() => { setModal(null); setError(""); }}
        >
          <ErrorMsg msg={error} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 16px" }}>
            <Field label="Código origen" required>
              {textInput(modal.item.codigo_origen, (v) => setModal((x) => ({ ...x, item: { ...x.item, codigo_origen: v } })))}
            </Field>
            <Field label="Código nuevo" required>
              {textInput(modal.item.codigo_nuevo, (v) => setModal((x) => ({ ...x, item: { ...x.item, codigo_nuevo: v } })))}
            </Field>
          </div>
          <Field label="Nombre origen">
            {textInput(modal.item.nombre_origen || "", (v) => setModal((x) => ({ ...x, item: { ...x.item, nombre_origen: v } })))}
          </Field>
          {checkInput(modal.item.activo !== false, (v) => setModal((x) => ({ ...x, item: { ...x.item, activo: v } })), "Activo")}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 14 }}>
            <Btn color="ghost" onClick={() => { setModal(null); setError(""); }}>Cancelar</Btn>
            <Btn color="primary" onClick={handleSave}>{modal.mode === "add" ? "Crear" : "Guardar"}</Btn>
          </div>
        </Modal>
      )}

      {importModal && importPreview && (
        <Modal title="Previsualizar importación" onClose={() => setImportModal(false)} width={600}>
          <ErrorMsg msg={error} />
          <p style={{ color: C.textMuted, fontSize: 13, marginBottom: 12 }}>
            <strong style={{ color: C.text }}>{importPreview.length}</strong> filas detectadas.
            Se requieren columnas: <code style={{ color: C.info }}>codigo_origen</code>, <code style={{ color: C.info }}>nombre_origen</code>, <code style={{ color: C.info }}>codigo_nuevo</code>.
          </p>
          <div style={{ overflowX: "auto", maxHeight: 280, overflowY: "auto", border: `1px solid ${C.border}`, borderRadius: 6 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr>
                  {Object.keys(importPreview[0] || {}).map((k) => <Th key={k}>{k}</Th>)}
                </tr>
              </thead>
              <tbody>
                {importPreview.slice(0, 30).map((row, i) => (
                  <tr key={i} style={{ background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.02)" }}>
                    {Object.values(row).map((v, j) => (
                      <td key={j} style={{ padding: "5px 10px", borderBottom: `1px solid ${C.border}`, color: C.textMuted }}>
                        {String(v)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 14 }}>
            <Btn color="ghost" onClick={() => setImportModal(false)}>Cancelar</Btn>
            <Btn color="success" onClick={handleConfirmImport} disabled={importando}>
              {importando ? "Importando..." : "Confirmar importación"}
            </Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── Componente principal ────────────────────────────────────────────────────

const TABS = [
  { key: "empresas", label: "Empresas" },
  { key: "plan_cuentas", label: "Plan de Cuentas" },
  { key: "auxiliares", label: "Auxiliares" },
  { key: "centros_costo", label: "Centros de Costo" },
  { key: "tipos_doc", label: "Tipos de Documento" },
  { key: "periodos", label: "Períodos" },
  { key: "mapeo", label: "Mapeo de Códigos" },
];

// Tabs que requieren selector de empresa
const TABS_CON_EMPRESA = new Set(["plan_cuentas", "centros_costo", "periodos", "mapeo"]);

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
          <MapeoCodosTab empresaId={empresaId} canEdit={canEdit || esCFO} />
        )}
      </div>
    </div>
  );
}
