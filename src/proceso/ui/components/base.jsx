/* eslint-disable */
// src/proceso/ui/components/base.jsx — componentes neutrales del módulo Service.
// Presentacionales, sin dominio. Consumen theme.js vía estilos.js.
import React, { useState } from "react";
import { C, TONO, sp } from "../estilos";
import { badgeDe } from "../../core/procesoF7Domain";

// ── Botón ───────────────────────────────────────────────────────────────────
export function ProcButton({ children, onClick, kind = "primary", small, disabled, style, title, type = "button" }) {
  const map = {
    primary: { bg: C.primary, fg: C.primaryText, bd: C.primary },
    accent: { bg: C.accent, fg: "#3a2a12", bd: C.accent },
    success: { bg: C.success, fg: "#fff", bd: C.success },
    danger: { bg: C.danger, fg: "#fff", bd: C.danger },
    ghost: { bg: "transparent", fg: C.text, bd: C.border },
  }[kind] || {};
  return (
    <button type={type} onClick={onClick} disabled={disabled} title={title}
      style={{
        background: disabled ? C.cardAlt : map.bg, color: disabled ? C.muted2 : map.fg,
        border: `1px solid ${disabled ? C.border : map.bd}`, borderRadius: 8,
        padding: small ? "5px 10px" : "8px 14px", fontSize: small ? 12.5 : 13.5, fontWeight: 600,
        cursor: disabled ? "not-allowed" : "pointer", fontFamily: C.font, whiteSpace: "nowrap", ...style,
      }}>
      {children}
    </button>
  );
}

// ── Badge de estado ──────────────────────────────────────────────────────────
export function ProcStatusBadge({ estado, texto, tono }) {
  const b = estado ? badgeDe(estado) : { label: texto, tono: tono || "neutral" };
  const t = TONO[b.tono] || TONO.neutral;
  return (
    <span style={{
      display: "inline-block", padding: "2px 9px", borderRadius: 999, fontSize: 11.5, fontWeight: 700,
      color: t.color, background: t.bg, border: `1px solid ${t.color}22`, whiteSpace: "nowrap",
    }}>{b.label}</span>
  );
}

// ── Card / Header ────────────────────────────────────────────────────────────
export function ProcCard({ children, style }) {
  return <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, boxShadow: C.shadowSm, ...style }}>{children}</div>;
}
export function ProcPageHeader({ titulo, subtitulo, acciones }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: sp.md, marginBottom: sp.lg }}>
      <div>
        <h2 style={{ margin: 0, fontSize: 20, color: C.text, fontWeight: 800 }}>{titulo}</h2>
        {subtitulo && <div style={{ color: C.muted, fontSize: 13, marginTop: 2 }}>{subtitulo}</div>}
      </div>
      {acciones && <div style={{ display: "flex", gap: sp.sm, flexWrap: "wrap" }}>{acciones}</div>}
    </div>
  );
}

// ── KPI ──────────────────────────────────────────────────────────────────────
export function ProcKpiCard({ label, valor, sub, tono = "neutral", onClick }) {
  const t = TONO[tono] || TONO.neutral;
  return (
    <ProcCard style={{ padding: sp.md, cursor: onClick ? "pointer" : "default", borderLeft: `4px solid ${t.color}` }}>
      <div onClick={onClick}>
        <div style={{ color: C.muted, fontSize: 12, fontWeight: 600 }}>{label}</div>
        <div style={{ color: C.text, fontSize: 26, fontWeight: 800, lineHeight: 1.1, marginTop: 4 }}>{valor}</div>
        {sub != null && <div style={{ color: C.muted2, fontSize: 11.5, marginTop: 2 }}>{sub}</div>}
      </div>
    </ProcCard>
  );
}

// ── Estados de página ──────────────────────────────────────────────────────
export function ProcLoadingState({ texto = "Cargando…" }) {
  return <div style={{ padding: 40, textAlign: "center", color: C.muted, fontSize: 14 }}>⏳ {texto}</div>;
}
export function ProcEmptyState({ icono = "📭", titulo = "Sin datos", detalle }) {
  return (
    <div style={{ padding: 44, textAlign: "center", color: C.muted }}>
      <div style={{ fontSize: 34 }}>{icono}</div>
      <div style={{ fontSize: 15, fontWeight: 700, color: C.text, marginTop: 6 }}>{titulo}</div>
      {detalle && <div style={{ fontSize: 13, marginTop: 4 }}>{detalle}</div>}
    </div>
  );
}
export function ProcErrorState({ error, onRetry }) {
  return (
    <div style={{ padding: 40, textAlign: "center" }}>
      <div style={{ fontSize: 30 }}>⚠️</div>
      <div style={{ color: C.danger, fontSize: 14, fontWeight: 700, marginTop: 6 }}>{error}</div>
      {onRetry && <div style={{ marginTop: 12 }}><ProcButton kind="ghost" small onClick={onRetry}>Reintentar</ProcButton></div>}
    </div>
  );
}

// ── Tabla ────────────────────────────────────────────────────────────────────
export function ProcDataTable({ columnas, filas, vacio, rowKey }) {
  if (!filas || filas.length === 0) return vacio || <ProcEmptyState />;
  return (
    <div style={{ overflowX: "auto", border: `1px solid ${C.border}`, borderRadius: 10 }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 480 }}>
        <thead>
          <tr style={{ background: C.cardAlt }}>
            {columnas.map((c, i) => (
              <th key={i} style={{ textAlign: c.align || "left", padding: "9px 12px", color: C.muted, fontWeight: 700, fontSize: 11.5, textTransform: "uppercase", letterSpacing: .3, borderBottom: `1px solid ${C.border}` }}>{c.titulo}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filas.map((f, ri) => (
            <tr key={rowKey ? f[rowKey] : ri} style={{ background: ri % 2 ? C.rowAlt : C.card }}>
              {columnas.map((c, ci) => (
                <td key={ci} style={{ textAlign: c.align || "left", padding: "8px 12px", color: C.text, borderBottom: `1px solid ${C.border}` }}>
                  {c.render ? c.render(f) : f[c.campo]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Lista de excepciones ─────────────────────────────────────────────────────
export function ProcExceptionList({ items, onItem }) {
  if (!items || items.length === 0) return <ProcEmptyState icono="✅" titulo="Sin excepciones" detalle="Nada requiere atención ahora." />;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {items.map((x, i) => {
        const t = TONO[x.severidad === "bloqueante" ? "danger" : x.severidad === "advertencia" ? "warning" : "info"];
        return (
          <div key={i} onClick={() => onItem && onItem(x)} style={{
            display: "flex", justifyContent: "space-between", alignItems: "center", gap: sp.md,
            padding: "9px 12px", borderRadius: 8, background: t.bg, border: `1px solid ${t.color}22`,
            cursor: onItem ? "pointer" : "default",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
              <span style={{ color: t.color, fontWeight: 800 }}>●</span>
              <span style={{ color: C.text, fontSize: 13, fontWeight: 600 }}>{x.detalle}</span>
              {x.folio && <span style={{ color: C.muted, fontSize: 12 }}>· {x.folio}</span>}
            </div>
            <ProcStatusBadge texto={x.severidad} tono={x.severidad === "bloqueante" ? "danger" : x.severidad === "advertencia" ? "warning" : "info"} />
          </div>
        );
      })}
    </div>
  );
}

// ── Modal ────────────────────────────────────────────────────────────────────
export function ProcModal({ titulo, children, onClose, ancho = 560, acciones }) {
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(16,24,40,.45)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: sp.lg, zIndex: 1000, overflowY: "auto" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: C.card, borderRadius: 14, width: "100%", maxWidth: ancho, boxShadow: C.shadow, marginTop: 40 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 18px", borderBottom: `1px solid ${C.border}` }}>
          <div style={{ fontWeight: 800, fontSize: 16, color: C.text }}>{titulo}</div>
          <button onClick={onClose} style={{ border: "none", background: "transparent", fontSize: 20, cursor: "pointer", color: C.muted }}>×</button>
        </div>
        <div style={{ padding: 18 }}>{children}</div>
        {acciones && <div style={{ display: "flex", justifyContent: "flex-end", gap: sp.sm, padding: "12px 18px", borderTop: `1px solid ${C.border}` }}>{acciones}</div>}
      </div>
    </div>
  );
}

// ── Field ────────────────────────────────────────────────────────────────────
export function ProcField({ label, children, hint, requerido }) {
  return (
    <label style={{ display: "block", marginBottom: sp.md }}>
      <div style={{ fontSize: 12.5, fontWeight: 600, color: C.muted, marginBottom: 4 }}>
        {label}{requerido && <span style={{ color: C.danger }}> *</span>}
      </div>
      {children}
      {hint && <div style={{ fontSize: 11.5, color: C.muted2, marginTop: 3 }}>{hint}</div>}
    </label>
  );
}
export const inputStyle = {
  width: "100%", boxSizing: "border-box", padding: "8px 10px", fontSize: 14, fontFamily: C.font,
  border: `1px solid ${C.border}`, borderRadius: 8, background: C.card, color: C.text,
};

// ── Confirmación ─────────────────────────────────────────────────────────────
export function ProcConfirmAction({ titulo, mensaje, onConfirm, onCancel, textoConfirm = "Confirmar", kind = "danger" }) {
  return (
    <ProcModal titulo={titulo} onClose={onCancel} ancho={420}
      acciones={<>
        <ProcButton kind="ghost" onClick={onCancel}>Cancelar</ProcButton>
        <ProcButton kind={kind} onClick={onConfirm}>{textoConfirm}</ProcButton>
      </>}>
      <div style={{ fontSize: 14, color: C.text }}>{mensaje}</div>
    </ProcModal>
  );
}

// ── Auditoría visible (no editable) ─────────────────────────────────────────
export function ProcAuditInfo({ registro }) {
  if (!registro) return null;
  const f = (d) => (d ? new Date(d).toLocaleString("es-CL") : "—");
  return (
    <div style={{ fontSize: 11.5, color: C.muted2, display: "flex", gap: sp.md, flexWrap: "wrap" }}>
      <span>Creado: {f(registro.created_at)}</span>
      {registro.updated_at && <span>Modificado: {f(registro.updated_at)}</span>}
    </div>
  );
}

// ── Toast simple ─────────────────────────────────────────────────────────────
export function ProcToast({ toast }) {
  if (!toast) return null;
  const t = TONO[toast.tono || (toast.tipo === "error" ? "danger" : "success")] || TONO.success;
  return (
    <div style={{ position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", zIndex: 2000,
      background: t.bg, color: t.color, border: `1px solid ${t.color}`, borderRadius: 10, padding: "10px 18px",
      fontSize: 13.5, fontWeight: 600, boxShadow: C.shadow, maxWidth: "90vw" }}>
      {toast.texto}
    </div>
  );
}
