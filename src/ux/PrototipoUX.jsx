/* eslint-disable */
// ═══════════════════════════════════════════════════════════════════
// UX EJECUTIVO · PROTOTIPO (NO INTEGRADO)
// ═══════════════════════════════════════════════════════════════════
//
// Esta es la cáscara completa: riel permanente + contenido. Sirve para ver
// la propuesta entera y para que las pruebas la ejerzan de punta a punta.
//
// NO ESTÁ MONTADA EN LA APLICACIÓN. `src/App.jsx` no la importa y no se tocó:
// el cierre de seguridad y persistencia va antes que cualquier integración,
// y esa decisión ya está tomada. Este archivo existe para mirarse y
// aprobarse, no para desplegarse.
//
// Recibe los datos por props (`datos`), sin red y sin Supabase, para que se
// pueda montar con un blob de ejemplo o con una copia del real.

import React, { useState } from "react";
import { surface, ink, layout, soloLector } from "./tokens";
import { useResponsive } from "./useResponsive";
import RielNavegacion from "./RielNavegacion";
import HomeEjecutivo from "./HomeEjecutivo";

// Los mismos siete destinos que hoy son tiles de 300 × 178 px en el hub.
export const DESTINOS = [
  { id: "inicio", label: "Inicio", icono: "◧" },
  { id: "tareas", label: "Seguimiento Tareas", icono: "☑" },
  { id: "osiris", label: "Osiris Plant", icono: "❋" },
  { id: "finanzas", label: "Finanzas", icono: "▤" },
  { id: "allegria", label: "Allegria Foods", icono: "◆" },
  { id: "frisku", label: "Frisku Foods", icono: "◇" },
  { id: "contabilidad", label: "Contabilidad", icono: "▦" },
  { id: "allegria_service", label: "Allegria Service", icono: "▣" },
];

// Salto al contenido: primer tabulable de la página. Sin esto, llegar al
// contenido desde el teclado obliga a recorrer los ocho destinos del riel en
// cada carga. Oculto hasta recibir foco, y ahí se materializa; el estado va
// en React porque el proyecto no tiene una hoja de estilos de este carril.
function SaltarAlContenido() {
  const [visible, setVisible] = useState(false);
  return (
    <a
      href="#contenido"
      onFocus={() => setVisible(true)}
      onBlur={() => setVisible(false)}
      style={
        visible
          ? {
              position: "absolute",
              zIndex: 100,
              top: 8,
              left: 8,
              background: surface.panel,
              color: ink.strong,
              border: `2px solid ${surface.rail}`,
              borderRadius: layout.radio.sm,
              padding: "6px 12px",
              fontSize: 13,
              fontWeight: 600,
              textDecoration: "none",
            }
          : soloLector
      }
    >
      Saltar al contenido
    </a>
  );
}

export default function PrototipoUX({ datos, usuario = "Angelo", hoy = new Date(), destinos = DESTINOS }) {
  const bp = useResponsive();
  const [activo, setActivo] = useState("osiris");
  const enBarra = bp.modoNavegacion === "barra";

  return (
    <div
      style={{
        display: "flex",
        flexDirection: enBarra ? "column" : "row",
        minHeight: "100%",
        background: surface.app,
        fontFamily: layout.font,
        color: ink.strong,
      }}
    >
      <SaltarAlContenido />

      <RielNavegacion
        items={destinos}
        activo={activo}
        alSeleccionar={setActivo}
        modo={bp.modoNavegacion}
      />

      <main
        id="contenido"
        tabIndex={-1}
        style={{
          flex: 1,
          minWidth: 0,
          padding: bp.esMovil ? "12px 10px 28px" : "16px 20px 32px",
          outline: "none",
        }}
      >
        {activo === "osiris" || activo === "inicio" ? (
          <HomeEjecutivo datos={datos} usuario={usuario} hoy={hoy} />
        ) : (
          <div
            style={{
              background: surface.panel,
              border: `1px dashed ${layout.borde}`,
              borderRadius: layout.radio.md,
              padding: "28px 16px",
              textAlign: "center",
              color: ink.soft,
              fontSize: 13,
            }}
          >
            <p style={{ margin: 0 }}>
              {(destinos.find((d) => d.id === activo) || {}).label} — fuera del alcance de este
              carril.
            </p>
            <p style={{ margin: "6px 0 0", fontSize: 12 }}>
              El riel es transversal; el rediseño de contenido que se probó acá es el de Osiris.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
