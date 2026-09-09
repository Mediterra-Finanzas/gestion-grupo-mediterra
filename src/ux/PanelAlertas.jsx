/* eslint-disable */
// ═══════════════════════════════════════════════════════════════════
// UX EJECUTIVO · ALERTAS ACCIONABLES
// ═══════════════════════════════════════════════════════════════════
//
// ANTES: el módulo tiene semáforos de texto ("🔴 Vencido", "🟡 ≤90 días")
// dentro de una tabla de vencimientos. Informan un estado, pero no dicen qué
// hacer ni cuánto cuesta no hacerlo, y hay que ir a buscarlos a una pestaña.
//
// DESPUÉS: cada alerta trae tres cosas obligatorias —qué pasa, POR QUÉ
// importa en plata o en riesgo, y un botón con el verbo de la acción que
// lleva a la ficha de la entidad. Una alerta que no puede llenar las tres se
// descarta en `selectores.js`, no se muestra a medias.
//
// El filtro por severidad es un grupo de radios de verdad, no botones que
// simulan estar seleccionados: así el lector de pantalla anuncia cuál está
// activo y las flechas funcionan solas.

import React, { useState, useMemo, useId } from "react";
import { surface, ink, estado, layout, anilloFoco, soloLector } from "./tokens";
import { Boton, Etiqueta, Vacio, useFoco } from "./Primitivos";
import { resumenAlertas } from "./selectores";

const NOMBRE_SEV = { critico: "Crítico", alto: "Alto", info: "Informativo", ok: "Al día" };

function Radio({ nombre, valor, actual, alCambiar, texto, conteo }) {
  const { enfocado, propsFoco } = useFoco();
  const activo = actual === valor;
  return (
    <label
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        padding: "3px 9px",
        fontSize: 11,
        fontWeight: 600,
        cursor: "pointer",
        color: activo ? "#ffffff" : ink.soft,
        background: activo ? surface.rail : surface.panel,
        border: `1px solid ${activo ? surface.rail : layout.borde}`,
        borderRadius: layout.radio.sm,
        boxShadow: enfocado ? anilloFoco.claro : "none",
      }}
    >
      <input
        type="radio"
        name={nombre}
        value={valor}
        checked={activo}
        onChange={() => alCambiar(valor)}
        style={soloLector}
        {...propsFoco}
      />
      {texto}
      {conteo != null && <span aria-hidden="true">({conteo})</span>}
      <span style={soloLector}>{conteo != null ? `${conteo} alertas` : ""}</span>
    </label>
  );
}

export default function PanelAlertas({ alertas = [], alAbrirEntidad = () => {}, maximo = 12 }) {
  const [filtro, setFiltro] = useState("todas");
  const grupo = useId();
  const conteo = useMemo(() => resumenAlertas(alertas), [alertas]);

  const visibles = useMemo(
    () => (filtro === "todas" ? alertas : alertas.filter((a) => a.severidad === filtro)),
    [alertas, filtro]
  );
  const mostradas = visibles.slice(0, maximo);

  return (
    <section
      aria-label="Alertas accionables"
      style={{
        background: surface.panel,
        border: `1px solid ${layout.borde}`,
        borderRadius: layout.radio.md,
        overflow: "hidden",
      }}
    >
      <header
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: layout.sp.sm,
          padding: "8px 12px",
          borderBottom: `1px solid ${layout.borde}`,
          background: surface.panelAlt,
        }}
      >
        <h2
          style={{
            margin: 0,
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: 0.4,
            textTransform: "uppercase",
            color: ink.soft,
            marginRight: "auto",
          }}
        >
          Qué requiere tu decisión
        </h2>
        <fieldset
          style={{ border: 0, margin: 0, padding: 0, display: "flex", gap: 5, flexWrap: "wrap" }}
        >
          <legend style={soloLector}>Filtrar alertas por severidad</legend>
          <Radio nombre={grupo} valor="todas" actual={filtro} alCambiar={setFiltro} texto="Todas" conteo={conteo.total} />
          {["critico", "alto", "info"].map((s) => (
            <Radio
              key={s}
              nombre={grupo}
              valor={s}
              actual={filtro}
              alCambiar={setFiltro}
              texto={NOMBRE_SEV[s]}
              conteo={conteo[s]}
            />
          ))}
        </fieldset>
      </header>

      {mostradas.length === 0 ? (
        <Vacio
          mensaje={filtro === "todas" ? "No hay nada pendiente de decisión." : `Nada en severidad ${NOMBRE_SEV[filtro]}.`}
          sugerencia={filtro === "todas" ? undefined : "Prueba con Todas."}
        />
      ) : (
        <ul role="list" style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {mostradas.map((a, i) => {
            const sev = estado[a.severidad] || estado.neutro;
            return (
              <li
                key={a.id}
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  alignItems: "flex-start",
                  gap: layout.sp.sm,
                  padding: "8px 12px",
                  borderTop: i === 0 ? "none" : `1px solid ${layout.borde}`,
                  // Barra de severidad a la izquierda, además de la etiqueta
                  // de texto. Color y texto, nunca color solo.
                  borderLeft: `3px solid ${sev.borde}`,
                  background: surface.panel,
                }}
              >
                <div style={{ flex: "1 1 260px", minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                    <Etiqueta severidad={a.severidad}>{NOMBRE_SEV[a.severidad] || a.severidad}</Etiqueta>
                    <span style={{ fontSize: 13, fontWeight: 600, color: ink.strong }}>{a.titulo}</span>
                  </div>
                  <p style={{ margin: "3px 0 0", fontSize: 12, color: ink.soft, lineHeight: 1.45 }}>
                    {a.porQue}
                  </p>
                </div>
                <Boton
                  variante="secundario"
                  onClick={() => alAbrirEntidad(a.entidad)}
                  ariaLabel={`${a.accion} · ${a.entidad ? a.entidad.nombre : ""}`}
                >
                  {a.accion}
                </Boton>
              </li>
            );
          })}
        </ul>
      )}

      {visibles.length > mostradas.length && (
        <p style={{ margin: 0, padding: "6px 12px", fontSize: 11, color: ink.soft, borderTop: `1px solid ${layout.borde}` }}>
          {visibles.length - mostradas.length} alertas más en este filtro.
        </p>
      )}
    </section>
  );
}
