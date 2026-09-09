/* eslint-disable */
// ═══════════════════════════════════════════════════════════════════
// UX EJECUTIVO · BÚSQUEDA TRANSVERSAL
// ═══════════════════════════════════════════════════════════════════
//
// ANTES: no existe. Para encontrar un contrato hay que saber de antemano en
// qué pestaña vive, entrar y mirar la tabla. Una variedad, un obtentor y un
// cliente están en tres lugares distintos.
//
// DESPUÉS: un campo único que busca sobre todas las entidades del blob y
// lleva directo a la ficha. El tipo va como etiqueta en cada resultado, así
// que no hay que elegir "dónde" buscar antes de buscar.
//
// Patrón ARIA `combobox` con listbox, implementado completo: `aria-expanded`,
// `aria-controls`, `aria-activedescendant`, opciones con `role="option"` e
// id estable, y un contador de resultados en región viva para quien no ve la
// lista. Teclado: flechas, Enter, Escape.

import React, { useState, useRef, useMemo, useCallback, useId } from "react";
import { surface, ink, layout, estado, anilloFoco, soloLector } from "./tokens";
import { buscar } from "./selectores";

const ETIQUETA_TIPO = {
  contrato: "Contrato",
  cliente: "Cliente",
  obtentor: "Obtentor",
  variedad: "Variedad",
  especie: "Especie",
  vivero: "Vivero",
};

export default function BusquedaGlobal({
  indice = [],
  alElegir = () => {},
  etiqueta = "Buscar en Osiris",
  marcador = "Contrato, cliente, obtentor, variedad...",
  limite = 8,
}) {
  const [consulta, setConsulta] = useState("");
  const [abierto, setAbierto] = useState(false);
  const [activo, setActivo] = useState(-1);
  const [enfocado, setEnfocado] = useState(false);
  const refEntrada = useRef(null);
  const base = useId();
  const idLista = `${base}-lista`;
  const idEtiqueta = `${base}-etiqueta`;
  const idOpcion = (i) => `${base}-opcion-${i}`;

  const resultados = useMemo(
    () => buscar(indice, consulta, limite),
    [indice, consulta, limite]
  );

  const hayLista = abierto && consulta.trim().length > 0;

  const elegir = useCallback(
    (item) => {
      if (!item) return;
      alElegir(item);
      setAbierto(false);
      setActivo(-1);
    },
    [alElegir]
  );

  const alTeclado = useCallback(
    (ev) => {
      if (ev.key === "Escape") {
        // Primer Escape cierra la lista; segundo limpia el campo. Así no se
        // pierde lo escrito por cerrar sin querer.
        if (hayLista) setAbierto(false);
        else setConsulta("");
        setActivo(-1);
        return;
      }
      if (ev.key === "ArrowDown" || ev.key === "ArrowUp") {
        if (!resultados.length) return;
        ev.preventDefault();
        setAbierto(true);
        const paso = ev.key === "ArrowDown" ? 1 : -1;
        setActivo((a) => {
          const n = resultados.length;
          if (a === -1) return paso === 1 ? 0 : n - 1;
          return (a + paso + n) % n;
        });
        return;
      }
      if (ev.key === "Enter") {
        if (hayLista && activo >= 0 && resultados[activo]) {
          ev.preventDefault();
          elegir(resultados[activo]);
        }
      }
    },
    [hayLista, resultados, activo, elegir]
  );

  return (
    <div style={{ position: "relative", flex: 1, minWidth: 0, maxWidth: 520 }}>
      <label id={idEtiqueta} htmlFor={`${base}-entrada`} style={soloLector}>
        {etiqueta}
      </label>
      <input
        id={`${base}-entrada`}
        ref={refEntrada}
        type="text"
        role="combobox"
        aria-expanded={hayLista}
        aria-controls={idLista}
        aria-autocomplete="list"
        aria-labelledby={idEtiqueta}
        aria-activedescendant={hayLista && activo >= 0 ? idOpcion(activo) : undefined}
        autoComplete="off"
        placeholder={marcador}
        value={consulta}
        onChange={(e) => {
          setConsulta(e.target.value);
          setAbierto(true);
          setActivo(-1);
        }}
        onFocus={() => {
          setEnfocado(true);
          setAbierto(true);
        }}
        onBlur={() => setEnfocado(false)}
        onKeyDown={alTeclado}
        style={{
          width: "100%",
          boxSizing: "border-box",
          fontFamily: layout.font,
          fontSize: 13,
          color: ink.strong,
          background: surface.panel,
          border: `1px solid ${enfocado ? surface.rail : layout.borde}`,
          borderRadius: layout.radio.sm,
          padding: "6px 10px",
          outline: "none",
          boxShadow: enfocado ? anilloFoco.claro : "none",
        }}
      />

      {/* Contador en región viva: quien usa lector de pantalla se entera de
          cuántos resultados hay sin tener que recorrer la lista. */}
      <span aria-live="polite" style={soloLector}>
        {consulta.trim()
          ? `${resultados.length} ${resultados.length === 1 ? "resultado" : "resultados"}`
          : ""}
      </span>

      <ul
        id={idLista}
        role="listbox"
        aria-labelledby={idEtiqueta}
        hidden={!hayLista}
        style={{
          display: hayLista ? "block" : "none",
          position: "absolute",
          zIndex: 40,
          top: "calc(100% + 4px)",
          left: 0,
          right: 0,
          margin: 0,
          padding: 0,
          listStyle: "none",
          maxHeight: 320,
          overflowY: "auto",
          background: surface.panel,
          border: `1px solid ${layout.bordeFuerte}`,
          borderRadius: layout.radio.sm,
          boxShadow: layout.sombra,
        }}
      >
        {resultados.length === 0 && (
          <li
            role="option"
            aria-selected="false"
            aria-disabled="true"
            style={{ padding: "10px 12px", fontSize: 12, color: ink.soft }}
          >
            Sin coincidencias para “{consulta}”
          </li>
        )}
        {resultados.map((r, i) => (
          <li
            key={`${r.tipo}:${r.id}`}
            id={idOpcion(i)}
            role="option"
            aria-selected={i === activo}
            // `onMouseDown` y no `onClick`: el click llega después del blur
            // del input, que ya cerró la lista.
            onMouseDown={(e) => {
              e.preventDefault();
              elegir(r);
            }}
            onMouseEnter={() => setActivo(i)}
            style={{
              display: "flex",
              alignItems: "baseline",
              gap: 8,
              padding: "6px 10px",
              cursor: "pointer",
              background: i === activo ? surface.panelAlt : "transparent",
              borderLeft: `3px solid ${i === activo ? surface.rail : "transparent"}`,
            }}
          >
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: 0.4,
                color: estado.neutro.fg,
                minWidth: 62,
              }}
            >
              {ETIQUETA_TIPO[r.tipo] || r.tipo}
            </span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: "block", fontSize: 13, fontWeight: 600, color: ink.strong }}>
                {r.titulo}
              </span>
              {r.subtitulo && (
                <span style={{ display: "block", fontSize: 11, color: ink.soft }}>{r.subtitulo}</span>
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
