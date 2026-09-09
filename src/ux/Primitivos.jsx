/* eslint-disable */
// ═══════════════════════════════════════════════════════════════════
// UX EJECUTIVO · PRIMITIVOS
// ═══════════════════════════════════════════════════════════════════
//
// Las piezas chicas que usan todas las pantallas del carril. Sin librería
// externa: React y estilos en línea, igual que el resto del proyecto.
//
// Lo único no negociable acá es el foco. El proyecto no tiene una regla de
// `:focus-visible` propia, así que cada control interactivo de este carril
// pinta su anillo con estado de React (`onFocus`/`onBlur`) en vez de
// depender de CSS que podría no estar cargado. Un CFO que navega con teclado
// tiene que ver siempre dónde está parado.

import React, { useState, useCallback } from "react";
import { surface, ink, estado, layout, anilloFoco, soloLector } from "./tokens";

// Hook de foco visible. Devuelve las props a esparcir y si está enfocado.
export function useFoco() {
  const [enfocado, setEnfocado] = useState(false);
  const onFocus = useCallback(() => setEnfocado(true), []);
  const onBlur = useCallback(() => setEnfocado(false), []);
  return { enfocado, propsFoco: { onFocus, onBlur } };
}

export function SoloLector({ children }) {
  return <span style={soloLector}>{children}</span>;
}

// ── Etiqueta de estado ─────────────────────────────────────────────
// El color nunca va solo: siempre lleva texto. Un daltónico tiene que poder
// leer la severidad sin distinguir el matiz.
export function Etiqueta({ severidad = "neutro", children, titulo }) {
  const e = estado[severidad] || estado.neutro;
  return (
    <span
      title={titulo}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        background: e.bg,
        color: e.fg,
        border: `1px solid ${e.borde}`,
        borderRadius: layout.radio.sm,
        padding: "1px 7px",
        fontSize: 11,
        fontWeight: 600,
        lineHeight: 1.6,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

// ── Botón ──────────────────────────────────────────────────────────
export function Boton({
  variante = "secundario",
  children,
  onClick,
  tipo = "button",
  ariaLabel,
  deshabilitado,
  ...resto
}) {
  const { enfocado, propsFoco } = useFoco();
  const base = {
    font: "inherit",
    fontFamily: layout.font,
    fontSize: 12,
    fontWeight: 600,
    borderRadius: layout.radio.sm,
    padding: "5px 12px",
    cursor: deshabilitado ? "not-allowed" : "pointer",
    opacity: deshabilitado ? 0.5 : 1,
    lineHeight: 1.5,
    // El anillo reemplaza al outline nativo; nunca se quita sin reemplazo.
    outline: "none",
    boxShadow: enfocado ? anilloFoco.claro : "none",
  };
  const variantes = {
    primario: {
      background: surface.rail,
      color: "#ffffff",
      border: `1px solid ${surface.rail}`,
    },
    secundario: {
      background: surface.panel,
      color: ink.strong,
      border: `1px solid ${layout.borde}`,
    },
    tenue: {
      background: "transparent",
      color: ink.soft,
      border: "1px solid transparent",
    },
  };
  return (
    <button
      type={tipo}
      onClick={onClick}
      disabled={deshabilitado}
      aria-label={ariaLabel}
      style={{ ...base, ...(variantes[variante] || variantes.secundario) }}
      {...propsFoco}
      {...resto}
    >
      {children}
    </button>
  );
}

// ── Panel ──────────────────────────────────────────────────────────
// Contenedor sobrio: un borde de 1px y nada más. Sin gradiente, sin sombra
// pesada, sin animación de entrada.
export function Panel({ titulo, accion, children, id, ariaLabel, componente = "section" }) {
  const Etiq = componente;
  const idTitulo = id ? `${id}-titulo` : undefined;
  return (
    <Etiq
      id={id}
      aria-labelledby={titulo ? idTitulo : undefined}
      aria-label={!titulo ? ariaLabel : undefined}
      style={{
        background: surface.panel,
        border: `1px solid ${layout.borde}`,
        borderRadius: layout.radio.md,
        overflow: "hidden",
      }}
    >
      {titulo && (
        <header
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: layout.sp.md,
            padding: "8px 12px",
            borderBottom: `1px solid ${layout.borde}`,
            background: surface.panelAlt,
          }}
        >
          <h2
            id={idTitulo}
            style={{
              margin: 0,
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: 0.4,
              textTransform: "uppercase",
              color: ink.soft,
            }}
          >
            {titulo}
          </h2>
          {accion}
        </header>
      )}
      {children}
    </Etiq>
  );
}

// ── Estado vacío ───────────────────────────────────────────────────
// Explica por qué está vacío y qué hacer. Nunca un "sin datos" a secas.
export function Vacio({ mensaje, sugerencia }) {
  return (
    <p
      style={{
        margin: 0,
        padding: "18px 12px",
        fontSize: 13,
        color: ink.soft,
        textAlign: "center",
      }}
    >
      {mensaje}
      {sugerencia && (
        <>
          <br />
          <span style={{ fontSize: 12 }}>{sugerencia}</span>
        </>
      )}
    </p>
  );
}
