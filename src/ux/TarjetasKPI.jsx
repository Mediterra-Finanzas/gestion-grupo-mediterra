/* eslint-disable */
// ═══════════════════════════════════════════════════════════════════
// UX EJECUTIVO · KPIs
// ═══════════════════════════════════════════════════════════════════
//
// ANTES: los recuadros de KPI del módulo muestran un número grande y una
// etiqueta corta ("Por cobrar", "Total"). Para saber qué está midiendo hay
// que conocer el módulo por dentro.
//
// DESPUÉS: cada tarjeta declara la PREGUNTA que responde, en texto visible,
// arriba del número. Si un KPI no se puede formular como pregunta, es que no
// merece estar en la pantalla y se saca.
//
// Además cada tarjeta lleva `fuente`: de qué campo del dato sale la cifra.
// Es lo que permite auditar el número sin abrir el código, que es la
// condición que pone el CFO antes de aceptar una cifra.

import React from "react";
import { surface, ink, estado, layout } from "./tokens";
import { formatearValor } from "./selectores";

function Tarjeta({ kpi, compacta }) {
  const sev = estado[kpi.severidad] || estado.neutro;
  const idTitulo = `kpi-${kpi.id}-pregunta`;
  return (
    <article
      aria-labelledby={idTitulo}
      style={{
        background: surface.panel,
        border: `1px solid ${layout.borde}`,
        // Una línea de color arriba, no un fondo teñido: la tarjeta se lee
        // igual de bien y no compite con el número.
        borderTop: `2px solid ${sev.borde}`,
        borderRadius: layout.radio.sm,
        padding: compacta ? "8px 10px" : "10px 12px",
        display: "flex",
        flexDirection: "column",
        gap: 3,
        minWidth: 0,
      }}
    >
      <h3
        id={idTitulo}
        style={{
          margin: 0,
          fontSize: 11,
          fontWeight: 600,
          lineHeight: 1.35,
          color: ink.soft,
        }}
      >
        {kpi.pregunta}
      </h3>
      <p
        style={{
          margin: 0,
          fontSize: compacta ? 20 : 23,
          fontWeight: 700,
          lineHeight: 1.15,
          color: ink.strong,
          fontVariantNumeric: "tabular-nums",
          letterSpacing: "-0.4px",
        }}
      >
        {formatearValor(kpi.valor, kpi.formato)}
      </p>
      <p style={{ margin: 0, fontSize: 11, fontWeight: 600, color: sev.fg }}>{kpi.etiqueta}</p>
      {kpi.detalle && (
        <p style={{ margin: 0, fontSize: 11, color: ink.soft, lineHeight: 1.4 }}>{kpi.detalle}</p>
      )}
      {kpi.fuente && (
        <p
          style={{
            margin: "2px 0 0",
            fontSize: 10,
            color: ink.soft,
            fontFamily: layout.fontMono,
            wordBreak: "break-word",
          }}
        >
          {kpi.fuente}
        </p>
      )}
    </article>
  );
}

export default function TarjetasKPI({ kpis = [], compacta = false, titulo = "Indicadores" }) {
  return (
    <section aria-label={titulo}>
      <ul
        role="list"
        style={{
          listStyle: "none",
          margin: 0,
          padding: 0,
          display: "grid",
          // `auto-fit` con mínimo chico: en teléfono cae a una columna sin
          // necesitar una media query aparte.
          gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
          gap: layout.sp.sm,
        }}
      >
        {kpis.map((k) => (
          <li key={k.id} style={{ minWidth: 0 }}>
            <Tarjeta kpi={k} compacta={compacta} />
          </li>
        ))}
      </ul>
    </section>
  );
}
