/* eslint-disable */
// ═══════════════════════════════════════════════════════════════════
// UX EJECUTIVO · FICHA 360°
// ═══════════════════════════════════════════════════════════════════
//
// ANTES: lo que se sabe de un contrato está repartido. Identificación y
// fechas en Control de Contratos, la economía en otra vista, las plantaciones
// en Total Pedidos, las variedades en el maestro, el obtentor en su propia
// pestaña. Para responder "cómo está este cliente" hay que recorrer cuatro
// lugares y acordarse de lo que decía el anterior.
//
// DESPUÉS: una entidad, una pantalla. Secciones fijas y, abajo, lo
// relacionado, navegable: desde un contrato se salta a su plantación, desde
// un obtentor a sus variedades, y de vuelta.
//
// Es un panel, NO un modal. Un modal obliga a atrapar el foco y a cerrar
// antes de hacer cualquier otra cosa; acá interesa poder mirar la ficha y la
// tabla al mismo tiempo. Al abrir, el foco se mueve al título (que es
// `tabIndex={-1}`) para que quien navega con teclado o lector no quede parado
// donde estaba, sin enterarse de que apareció contenido nuevo.

import React, { useEffect, useRef } from "react";
import { surface, ink, estado, layout, soloLector } from "./tokens";
import { Boton, Etiqueta } from "./Primitivos";
import { formatearValor } from "./selectores";

const NOMBRE_TIPO = {
  contrato: "Contrato",
  cliente: "Cliente",
  obtentor: "Obtentor",
  variedad: "Variedad",
  especie: "Especie",
  vivero: "Vivero",
  plantacion: "Plantación",
  regla: "Regla de participación",
};

export default function Ficha360({ ficha, alCerrar, alNavegar, comoColumna = true }) {
  const refTitulo = useRef(null);
  const claveFoco = ficha ? `${ficha.tipo}:${ficha.id}` : null;

  useEffect(() => {
    if (claveFoco && refTitulo.current) refTitulo.current.focus();
  }, [claveFoco]);

  if (!ficha) {
    return (
      <aside
        aria-label="Ficha de entidad"
        style={{
          background: surface.panel,
          border: `1px dashed ${layout.borde}`,
          borderRadius: layout.radio.md,
          padding: "20px 14px",
          color: ink.soft,
          fontSize: 12,
          textAlign: "center",
          alignSelf: "start",
        }}
      >
        Elige un contrato, un cliente o un obtentor para ver su ficha completa.
      </aside>
    );
  }

  const sev = estado[ficha.estado] || estado.neutro;

  return (
    <aside
      aria-labelledby="ficha360-titulo"
      style={{
        background: surface.panel,
        border: `1px solid ${layout.borde}`,
        borderTop: `2px solid ${sev.borde}`,
        borderRadius: layout.radio.md,
        overflow: "hidden",
        alignSelf: "start",
        width: comoColumna ? undefined : "100%",
      }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: layout.sp.sm,
          padding: "10px 12px",
          borderBottom: `1px solid ${layout.borde}`,
          background: surface.panelAlt,
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <p
            style={{
              margin: 0,
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: 0.6,
              textTransform: "uppercase",
              color: ink.soft,
            }}
          >
            {NOMBRE_TIPO[ficha.tipo] || ficha.tipo}
          </p>
          <h2
            id="ficha360-titulo"
            ref={refTitulo}
            tabIndex={-1}
            style={{
              margin: "1px 0 0",
              fontSize: 17,
              fontWeight: 700,
              color: ink.strong,
              lineHeight: 1.2,
              outline: "none",
            }}
          >
            {ficha.titulo}
          </h2>
          <p style={{ margin: "2px 0 0", fontSize: 12, color: ink.soft }}>{ficha.subtitulo}</p>
          <div style={{ marginTop: 5 }}>
            <Etiqueta severidad={ficha.estado}>{ficha.estadoTexto}</Etiqueta>
          </div>
        </div>
        {alCerrar && (
          <Boton variante="tenue" onClick={alCerrar} ariaLabel="Cerrar ficha">
            <span aria-hidden="true">✕</span>
          </Boton>
        )}
      </header>

      <div style={{ padding: "4px 0" }}>
        {(ficha.secciones || []).map((s) => (
          <section key={s.titulo} style={{ padding: "6px 12px 8px" }}>
            <h3
              style={{
                margin: "0 0 4px",
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: 0.6,
                textTransform: "uppercase",
                color: ink.soft,
              }}
            >
              {s.titulo}
            </h3>
            {/* `<dl>` y no una tabla: son pares etiqueta/valor de un solo
                registro, y así el lector de pantalla los lee emparejados. */}
            <dl
              style={{
                margin: 0,
                display: "grid",
                gridTemplateColumns: "minmax(96px, 40%) 1fr",
                gap: "1px 12px",
              }}
            >
              {s.campos.map((c) => (
                <React.Fragment key={c.etiqueta}>
                  <dt style={{ fontSize: 11, color: ink.soft, padding: "2px 0" }}>{c.etiqueta}</dt>
                  <dd
                    style={{
                      margin: 0,
                      fontSize: 12,
                      color: ink.strong,
                      padding: "2px 0",
                      fontWeight: 500,
                      wordBreak: "break-word",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {formatearValor(c.valor, c.formato)}
                  </dd>
                </React.Fragment>
              ))}
            </dl>
          </section>
        ))}
      </div>

      {(ficha.relacionados || []).length > 0 && (
        <section style={{ borderTop: `1px solid ${layout.borde}` }}>
          <h3
            style={{
              margin: 0,
              padding: "7px 12px 4px",
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: 0.6,
              textTransform: "uppercase",
              color: ink.soft,
            }}
          >
            Relacionado ({ficha.relacionados.length})
          </h3>
          <ul role="list" style={{ listStyle: "none", margin: 0, padding: "0 0 6px" }}>
            {ficha.relacionados.slice(0, 12).map((r) => {
              const navegable = alNavegar && (r.tipo === "contrato" || r.tipo === "variedad" || r.tipo === "cliente" || r.tipo === "obtentor");
              return (
                <li
                  key={`${r.tipo}:${r.id}`}
                  style={{
                    display: "flex",
                    alignItems: "baseline",
                    gap: 8,
                    padding: "3px 12px",
                    fontSize: 12,
                  }}
                >
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      textTransform: "uppercase",
                      color: ink.soft,
                      minWidth: 74,
                    }}
                  >
                    {NOMBRE_TIPO[r.tipo] || r.tipo}
                  </span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    {navegable ? (
                      <Boton variante="tenue" onClick={() => alNavegar({ tipo: r.tipo, id: r.id, nombre: r.titulo })}>
                        {r.titulo}
                        <span style={soloLector}> · abrir ficha</span>
                      </Boton>
                    ) : (
                      <span style={{ color: ink.strong, fontWeight: 600 }}>{r.titulo}</span>
                    )}
                    {r.subtitulo && (
                      <span style={{ display: "block", fontSize: 11, color: ink.soft }}>{r.subtitulo}</span>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
          {ficha.relacionados.length > 12 && (
            <p style={{ margin: 0, padding: "0 12px 8px", fontSize: 11, color: ink.soft }}>
              y {ficha.relacionados.length - 12} más.
            </p>
          )}
        </section>
      )}
    </aside>
  );
}
