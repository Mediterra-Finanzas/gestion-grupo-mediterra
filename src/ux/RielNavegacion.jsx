/* eslint-disable */
// ═══════════════════════════════════════════════════════════════════
// UX EJECUTIVO · RIEL DE NAVEGACIÓN
// ═══════════════════════════════════════════════════════════════════
//
// ANTES: el hub eran siete botones de 300 × 178 px con gradiente, emoji de
// marca de agua a 120 px, sombra, animación de entrada escalonada y una
// flecha "Entrar". Ocupaban la pantalla completa para ofrecer siete destinos,
// y desaparecían al entrar a un módulo: para cambiar de empresa había que
// volver atrás.
//
// DESPUÉS: un riel de 60 px de ancho, permanente, con los mismos destinos.
// Está siempre disponible, así que saltar de Osiris a Finanzas es un clic en
// vez de tres. La superficie que se libera es la que ocupa el contenido.
//
// Tres modos, decididos por ancho real de ventana (`useResponsive`):
//   escritorio → riel de 232 px con etiquetas
//   tablet     → riel de 60 px, sólo íconos, con nombre accesible
//   teléfono   → barra horizontal desplazable arriba del contenido
//
// Accesibilidad: es un `<nav>` con nombre, una lista de verdad, `aria-current
// ="page"` en el activo, y flechas para moverse entre ítems sin perder el
// orden de tabulación estándar.

import React, { useRef, useCallback } from "react";
import { surface, ink, layout, anilloFoco } from "./tokens";
import { useFoco } from "./Primitivos";
import { theme } from "../theme";

function ItemRiel({ item, activo, modo, alSeleccionar, refBoton }) {
  const { enfocado, propsFoco } = useFoco();
  const conEtiqueta = modo === "etiquetas";

  return (
    <li role="none" style={{ listStyle: "none" }}>
      <button
        ref={refBoton}
        type="button"
        onClick={() => alSeleccionar(item.id)}
        aria-current={activo ? "page" : undefined}
        // En modo ícono el texto no se ve, así que el nombre accesible tiene
        // que venir del atributo. En modo etiqueta el texto ya lo da.
        aria-label={conEtiqueta ? undefined : item.label}
        title={conEtiqueta ? undefined : item.label}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: 10,
          justifyContent: conEtiqueta ? "flex-start" : "center",
          background: activo ? surface.railDeep : "transparent",
          color: activo ? ink.onRail : ink.onRailSoft,
          border: "none",
          // La marca del activo es una barra sólida a la izquierda: se ve sin
          // depender del color, que es lo que falla en una pantalla mala o en
          // una impresión.
          borderLeft: `3px solid ${activo ? theme.accent : "transparent"}`,
          borderRadius: 0,
          padding: conEtiqueta ? "9px 12px 9px 9px" : "11px 0",
          fontFamily: layout.font,
          fontSize: 13,
          fontWeight: activo ? 700 : 500,
          textAlign: "left",
          cursor: "pointer",
          outline: "none",
          boxShadow: enfocado ? anilloFoco.oscuro : "none",
        }}
        {...propsFoco}
      >
        <span aria-hidden="true" style={{ fontSize: 17, lineHeight: 1, width: 20, textAlign: "center" }}>
          {item.icono}
        </span>
        {conEtiqueta && (
          <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {item.label}
          </span>
        )}
        {conEtiqueta && item.badge > 0 && (
          <span
            aria-label={`${item.badge} pendientes`}
            style={{
              background: theme.accent,
              color: "#2b1c05",
              borderRadius: 9,
              padding: "0 6px",
              fontSize: 11,
              fontWeight: 700,
              lineHeight: "17px",
            }}
          >
            {item.badge}
          </span>
        )}
      </button>
    </li>
  );
}

export default function RielNavegacion({
  items = [],
  activo,
  alSeleccionar = () => {},
  modo = "etiquetas",
  titulo = "Navegación principal",
}) {
  const refs = useRef([]);

  // Flechas para recorrer el riel. No se usa roving tabindex: en un
  // landmark de navegación lo esperable es que cada destino sea tabulable.
  // Las flechas son un atajo encima de eso, no un reemplazo.
  const alTeclado = useCallback(
    (ev) => {
      const teclas = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 };
      const paso = teclas[ev.key];
      if (paso) {
        const foco = refs.current.findIndex((n) => n && n === document.activeElement);
        if (foco === -1) return;
        const destino = (foco + paso + items.length) % items.length;
        const nodo = refs.current[destino];
        if (nodo) {
          ev.preventDefault();
          nodo.focus();
        }
        return;
      }
      if (ev.key === "Home" || ev.key === "End") {
        const nodo = refs.current[ev.key === "Home" ? 0 : items.length - 1];
        if (nodo) {
          ev.preventDefault();
          nodo.focus();
        }
      }
    },
    [items.length]
  );

  const esBarra = modo === "barra";

  return (
    <nav
      aria-label={titulo}
      onKeyDown={alTeclado}
      style={{
        background: surface.rail,
        width: esBarra ? "100%" : modo === "iconos" ? layout.railAncho : layout.railAnchoAbierto,
        minWidth: esBarra ? 0 : modo === "iconos" ? layout.railAncho : layout.railAnchoAbierto,
        flexShrink: 0,
        display: "flex",
        flexDirection: esBarra ? "row" : "column",
        overflowX: esBarra ? "auto" : "visible",
        overflowY: esBarra ? "hidden" : "auto",
      }}
    >
      {modo === "etiquetas" && (
        <div
          style={{
            padding: "14px 12px 8px",
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: 1.2,
            textTransform: "uppercase",
            color: ink.onRailSoft,
          }}
        >
          Mediterra
        </div>
      )}
      <ul
        role="list"
        style={{
          listStyle: "none",
          margin: 0,
          padding: 0,
          display: "flex",
          flexDirection: esBarra ? "row" : "column",
          gap: 0,
          flex: 1,
        }}
      >
        {items.map((item, i) => (
          <ItemRiel
            key={item.id}
            item={item}
            activo={item.id === activo}
            modo={esBarra ? "iconos" : modo}
            alSeleccionar={alSeleccionar}
            refBoton={(n) => {
              refs.current[i] = n;
            }}
          />
        ))}
      </ul>
    </nav>
  );
}
